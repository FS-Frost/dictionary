/**
 * Service worker del diccionario.
 *
 * Dos cachés con políticas distintas, porque el contenido tiene naturalezas
 * distintas:
 *
 * - APP: el cascarón (HTML, JS, CSS). Estrategia "network first": si hay red se
 *   busca la versión fresca, y si no, se sirve la copia. Así un despliegue nuevo
 *   se recoge sin dejar la app inservible en un túnel.
 *
 * - DATA: los shards del dataset. Estrategia "cache first": son inmutables para
 *   una versión dada del manifiesto, así que una vez descargados no se vuelven a
 *   pedir. El manifiesto se excluye a propósito — es quien anuncia versiones
 *   nuevas, y cachearlo dejaría el dataset congelado para siempre.
 */

const VERSION = "v2";
const APP_CACHE = `dictionary-app-${VERSION}`;
const DATA_CACHE = `dictionary-data-${VERSION}`;

const CURRENT_CACHES = [APP_CACHE, DATA_CACHE];

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            // Se precachea el documento raíz para que la primera visita offline
            // tenga de dónde arrancar aunque el usuario no haya navegado antes.
            const cache = await caches.open(APP_CACHE);
            await cache.add(new Request("./", { cache: "reload" })).catch(() => {});

            // Un diccionario offline que exige recargar dos veces para activarse
            // no es offline. Se toma el control en cuanto está listo.
            await self.skipWaiting();
        })()
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();

            await Promise.all(
                keys
                    .filter((key) => !CURRENT_CACHES.includes(key))
                    .map((key) => caches.delete(key))
            );

            await self.clients.claim();
        })()
    );
});

/**
 * La primera carga ocurre antes de que el worker tome el control, así que los
 * bundles con nombre hasheado nunca pasan por su `fetch` y se quedan fuera del
 * caché. Funcionar offline dependía entonces del caché HTTP del navegador, que
 * no es una garantía.
 *
 * La página, una vez controlada, envía la lista de recursos que de verdad cargó
 * y aquí se guardan. Es más fiable que adivinar los nombres o parsear el HTML.
 */
self.addEventListener("message", (event) => {
    const data = event.data;

    if (!data || data.type !== "warm-cache" || !Array.isArray(data.urls)) return;

    event.waitUntil(
        (async () => {
            const cache = await caches.open(APP_CACHE);

            await Promise.all(
                data.urls.map(async (url) => {
                    try {
                        if (await cache.match(url)) return;

                        const response = await fetch(url, { cache: "reload" });
                        if (response.ok) await cache.put(url, response);
                    } catch {
                        // Un recurso que no se pueda calentar no invalida el resto.
                    }
                })
            );
        })()
    );
});

function isDatasetShard(url) {
    return url.pathname.includes("/data/") && url.pathname.endsWith(".json") && !url.pathname.endsWith("manifest.json");
}

self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Las APIs de diccionario nunca se cachean aquí: sus respuestas dependen de
    // cuotas y de la palabra buscada, y la capa de IndexedDB ya guarda lo estable.
    if (url.origin !== self.location.origin) return;

    if (isDatasetShard(url)) {
        event.respondWith(cacheFirst(request, DATA_CACHE));
        return;
    }

    event.respondWith(networkFirst(request, APP_CACHE));
});

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    if (cached) return cached;

    const response = await fetch(request);

    if (response.ok) {
        cache.put(request, response.clone());
    }

    return response;
}

/**
 * El estado de la app vive en la query (`?lang=es&word=agua`), así que cachear
 * las navegaciones tal cual guardaría una copia por búsqueda y ninguna serviría
 * para la siguiente. Se normalizan a su ruta: el documento es el mismo y la SPA
 * lee la query del `location` al arrancar.
 */
function cacheKeyFor(request) {
    if (request.mode !== "navigate") return request;

    return new Request(new URL(request.url).pathname, { headers: request.headers });
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const key = cacheKeyFor(request);

    try {
        const response = await fetch(request);

        if (response.ok) {
            cache.put(key, response.clone());
        }

        return response;
    } catch (error) {
        const cached = await cache.match(key);
        if (cached) return cached;

        // Sin copia de esta ruta: se cae al documento raíz, que es lo que una SPA
        // necesita para arrancar y resolver el resto por su cuenta.
        if (request.mode === "navigate") {
            const shell = await cache.match("./");
            if (shell) return shell;
        }

        throw error;
    }
}
