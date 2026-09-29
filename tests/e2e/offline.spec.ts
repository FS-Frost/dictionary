import { expect, test, type Page } from "@playwright/test";

/**
 * Comprueba la promesa central del proyecto: que el diccionario funciona con la
 * red caída. Lo que se verifica no es que exista un dataset, sino que buscando
 * una palabra que nunca se buscó antes, sin conexión, aparece su definición.
 */

async function search(page: Page, dictionary: string, word: string): Promise<void> {
    await page.goto(`/?dict=${dictionary}&word=${word}`, { waitUntil: "load" });
    await page.waitForSelector(".card-title");
}

function definition(page: Page) {
    return page.locator(".card-text").first();
}

/**
 * `serviceWorker.ready` sólo garantiza que hay un worker activo, no que esté
 * controlando esta pestaña: la primera visita carga antes de que el worker se
 * active. Cortar la red en ese hueco deja la navegación sin quien la sirva.
 */
async function waitForServiceWorkerControl(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;

        if (navigator.serviceWorker.controller) return;

        await new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
                once: true,
            });
        });
    });
}

test.describe("búsqueda con conexión", () => {
    test("define una palabra en inglés desde el dataset empaquetado", async ({ page }) => {
        await search(page, "en", "water");

        await expect(page.locator(".card-title span").first()).toHaveText("water");
        await expect(definition(page)).toContainText("inorganic compound");
        await expect(page.locator(".source")).toContainText("offline");
    });

    test("define una palabra en español EN ESPAÑOL, no traducida", async ({ page }) => {
        await search(page, "es", "agua");

        const text = await definition(page).innerText();

        expect(text.toLowerCase()).not.toBe("water");
        await expect(definition(page)).toContainText("Sustancia");
    });

    test("encuentra una palabra escrita sin acentos", async ({ page }) => {
        await search(page, "es", "corazon");

        await expect(page.locator(".card-title span").first()).toHaveText("corazón");
    });

    test("resuelve una forma flexionada", async ({ page }) => {
        await search(page, "es", "libros");

        await expect(definition(page)).toContainText("libro");
    });
});

test.describe("sin conexión", () => {
    test("define palabras nunca buscadas tras descargar el idioma", async ({ page, context }) => {
        await search(page, "es", "agua");

        await page.click("button:has-text('Descargar')");
        await expect(page.locator(".ready")).toBeVisible({ timeout: 180_000 });

        await waitForServiceWorkerControl(page);

        await context.setOffline(true);

        try {
            // Palabras que no se buscaron antes: sólo pueden venir del dataset local.
            await search(page, "es", "ventana");
            await expect(definition(page)).toContainText("muro");

            await search(page, "es", "libro");
            await expect(definition(page)).toContainText("hojas");

            await expect(page.locator(".source")).toContainText("sin conexión");
        } finally {
            await context.setOffline(false);
        }
    });

    test("recuerda que el idioma ya está descargado al recargar", async ({ page, context }) => {
        await search(page, "es", "agua");

        await page.click("button:has-text('Descargar')");
        await expect(page.locator(".ready")).toBeVisible({ timeout: 180_000 });

        await search(page, "es", "agua");

        await expect(page.locator("div.offline")).toContainText("disponible sin conexión");
        await expect(page.locator("button:has-text('Descargar')")).toHaveCount(0);

        void context;
    });
});

test("no depende de ningún servidor externo", async ({ page }) => {
    const external: string[] = [];

    page.on("request", (request) => {
        if (!request.url().includes("localhost:5000")) external.push(request.url());
    });

    await search(page, "en", "water");

    // Bootstrap y los iconos van servidos desde el propio sitio: si volvieran a
    // un CDN, la app se quedaría sin estilos justo cuando no hay red.
    expect(external).toEqual([]);
});

test.describe("tema", () => {
    test("arranca siguiendo la preferencia del sistema", async ({ browser }) => {
        const context = await browser.newContext({ colorScheme: "dark" });
        const page = await context.newPage();

        await search(page, "en", "water");

        await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");

        await context.close();
    });

    test("el tema elegido sobrevive a una recarga", async ({ page }) => {
        await search(page, "en", "water");

        // El botón cicla; partiendo de "sistema" (claro en este contexto), una
        // pulsación deja "claro" y la siguiente "oscuro".
        await page.click(".theme-toggle");
        await page.click(".theme-toggle");
        await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");

        await page.reload({ waitUntil: "load" });

        // Sin la preferencia persistida el usuario tendría que reelegir el tema en
        // cada visita, y con ella mal aplicada vería un fogonazo blanco al cargar.
        await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");
    });
});

test.describe("gestión de diccionarios", () => {
    test("el panel lista todos los diccionarios y deja eliminar lo descargado", async ({ page }) => {
        await search(page, "es", "agua");

        await page.click("button[aria-label='Gestionar diccionarios']");

        // Acotado al panel: los nombres también aparecen en el selector de
        // diccionario, y sin acotar el localizador encontraría varios.
        const panel = page.locator(".panel");

        // Los nombres son endónimos ("English", no "Inglés"): es la etiqueta por
        // la que el usuario reconoce el idioma en la lista.
        await expect(panel.getByText("Español", { exact: true })).toBeVisible();
        await expect(panel.getByText("English", { exact: true })).toBeVisible();
        await expect(panel.getByText("Français → inglés", { exact: true })).toBeVisible();

        await page.click("button[title='Descargar para usar sin conexión']");
        await expect(page.locator(".ready").first()).toBeVisible({ timeout: 180_000 });

        page.once("dialog", (dialog) => dialog.accept());
        await page.click("button:has-text('Eliminar')");

        // Tras borrar debe volver a ofrecerse la descarga: si siguiera diciendo
        // "disponible sin conexión" el usuario no sabría que liberó el espacio.
        await expect(page.locator("button:has-text('Descargar')").first()).toBeVisible();
    });
});

test.describe("avisos", () => {
    test("cambiar el tema muestra un aviso y desaparece solo", async ({ page }) => {
        await search(page, "es", "agua");

        await page.click(".theme-toggle");

        const toast = page.locator(".toast-item");
        await expect(toast).toBeVisible();
        await expect(toast).toContainText("Tema:");

        // Se va solo: un aviso que exige cerrarlo deja de ser un aviso.
        await expect(toast).toHaveCount(0, { timeout: 15_000 });
    });

    test("pulsar el tema varias veces no apila avisos", async ({ page }) => {
        await search(page, "es", "agua");

        await page.click(".theme-toggle");
        await page.click(".theme-toggle");
        await page.click(".theme-toggle");

        await expect(page.locator(".toast-item")).toHaveCount(1);
    });

    test("eliminar un diccionario avisa de lo que libera", async ({ page }) => {
        await search(page, "es", "agua");

        await page.click("button[title='Descargar para usar sin conexión']");
        await expect(page.locator(".ready").first()).toBeVisible({ timeout: 180_000 });

        await page.click("button[aria-label='Gestionar diccionarios']");

        page.once("dialog", (dialog) => dialog.accept());
        await page.click("button:has-text('Eliminar')");

        // Por texto y no por `.toast-item`: el aviso de la descarga aún puede
        // estar en pantalla, y entonces el localizador casaría con dos.
        await expect(page.getByText("Diccionario eliminado")).toBeVisible();
    });
});

test.describe("varios diccionarios", () => {
    test("el selector filtra y cambia de diccionario", async ({ page }) => {
        await search(page, "es", "agua");

        await page.click(".dictionary-select .current");
        await page.fill(".dictionary-select input", "deu");

        const options = page.locator(".option-name");
        await expect(options).toHaveCount(1);
        await expect(options.first()).toHaveText("Deutsch → inglés");

        await options.first().click();

        await expect(page.locator(".dictionary-select .current")).toContainText("Deutsch");
    });

    /*
     * La razón de que los bilingües existan aparte y no sustituyan al español:
     * definen EN INGLÉS. Si este test se rompiera devolviendo español, alguien
     * habría vuelto a mezclar las dos cosas.
     */
    test("un diccionario bilingüe define en inglés", async ({ page }) => {
        await search(page, "fr-en", "eau");

        await expect(page.locator(".card-title span").first()).toHaveText("eau");
        await expect(page.locator(".card-text").first()).toContainText("water");
    });

    test("el español sigue definiendo en español", async ({ page }) => {
        await search(page, "es", "agua");

        await expect(page.locator(".card-text").first()).toContainText("Sustancia");
    });

    /*
     * Regresión: el buscador arrancaba con el diccionario por defecto antes de
     * que la página leyese `?dict=`, y su `pushState` reescribía la URL borrando
     * el parámetro. Un enlace a cualquier diccionario que no fuese el de por
     * defecto terminaba mostrando otro.
     */
    test("un enlace a un diccionario concreto no acaba en otro", async ({ page }) => {
        await search(page, "es", "agua");

        await expect(page.locator(".dictionary-select .current")).toContainText("Español");
        expect(new URL(page.url()).searchParams.get("dict")).toBe("es");
    });

    test("la aplicación arranca sin errores de JavaScript", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));

        await search(page, "es", "agua");

        // Una excepción al arrancar no deja un fallo pequeño: tumba el montaje
        // entero y la página se queda sin resultados para siempre.
        expect(errors).toEqual([]);
    });

    test("los enlaces antiguos con ?lang= siguen funcionando", async ({ page }) => {
        await page.goto("/?lang=es&word=agua", { waitUntil: "load" });
        await page.waitForSelector(".card-title");

        await expect(page.locator(".card-text").first()).toContainText("Sustancia");
    });
});

test.describe("el índice", () => {
    /*
     * El índice y la entrada CONVIVEN: no son dos modos. Antes eran pestañas, y
     * al hojear desaparecían el buscador y el selector de diccionario, que no
     * tienen nada que ver con estar mirando la lista de palabras.
     */
    test("el buscador y el selector siguen ahí mientras se hojea", async ({ page }) => {
        await search(page, "es", "agua");

        await expect(page.locator(".pane-index .sheet")).toBeVisible({ timeout: 60_000 });
        await expect(page.locator(".search-box input")).toBeVisible();
        await expect(page.locator(".dictionary-select")).toBeVisible();
    });

    test("marca la palabra abierta y la sigue", async ({ page }) => {
        await search(page, "es", "corazon");

        await expect(page.locator(".word.current")).toHaveText("corazón");

        /*
         * Y se queda ahí. Regresión: el efecto que reposiciona el índice competía
         * con el que lo reseteaba al cambiar de diccionario, y como `dictionary`
         * se recrea al refrescarse el estado de descarga, el índice volvía solo a
         * la página 1 un instante después de colocarse.
         */
        await page.waitForTimeout(1500);
        await expect(page.locator(".word.current")).toHaveText("corazón");
    });

    /* Lo que une buscar y hojear: teclear mueve el índice antes de pulsar Enter. */
    test("teclear salta el índice sin llegar a buscar", async ({ page }) => {
        await search(page, "es", "agua");

        const before = await page.locator(".guides").innerText();

        await page.fill(".search-box input", "mesa");
        await expect(page.locator(".guides")).not.toHaveText(before);

        // Y sin haber buscado: la entrada sigue siendo la de antes.
        await expect(page.locator(".card-title span").first()).toHaveText("agua");
    });

    test("ofrece un segundo nivel de letras dentro de la actual", async ({ page }) => {
        await search(page, "es", "corazon");

        const sub = await page.locator(".sub-letter").allInnerTexts();

        expect(sub.length).toBeGreaterThan(1);
        expect(sub.every((entry) => entry.startsWith("c"))).toBe(true);
    });

    test("pasa a la palabra siguiente del diccionario", async ({ page }) => {
        await search(page, "es", "corazon");

        await page.click("button[aria-label='Palabra siguiente']");

        await expect(page.locator(".card-title span").first()).not.toHaveText("corazón");
        await expect(page.locator(".word.current")).toBeVisible();
    });

    test("no exige tener el diccionario descargado", async ({ page }) => {
        await search(page, "es", "agua");

        await expect(page.locator(".pane-index .sheet")).toBeVisible({ timeout: 60_000 });

        // Pero se ofrece descargarlo para seguir hojeando sin conexión.
        await expect(page.locator(".offline-hint")).toContainText("Descárgalo");
    });

    test("abrir una palabra del índice la define", async ({ page }) => {
        await search(page, "es", "agua");
        await expect(page.locator(".pane-index .sheet")).toBeVisible({ timeout: 60_000 });

        const word = await page.locator(".word").first().innerText();
        await page.locator(".word").first().click();

        await expect(page.locator(".card-title span").first()).toHaveText(word);
    });
});

test.describe("sugerencias", () => {
    test("propone palabras por prefijo y busca la elegida", async ({ page }) => {
        await search(page, "es", "agua");

        await page.fill(".search-box input", "cas");
        await expect(page.locator(".suggestion").first()).toBeVisible();

        const first = await page.locator(".suggestion").first().innerText();
        await page.locator(".suggestion").first().click();

        await expect(page.locator(".card-title span").first()).toHaveText(first);
    });

    /*
     * Regresión: la guardia del efecto leía `word` fuera de `untrack`, así que
     * el efecto se resuscribía con cada tecla y lanzaba una búsqueda por
     * carácter. Se notaba porque el historial se llenaba de prefijos sueltos.
     */
    test("escribir no dispara búsquedas ni ensucia el historial", async ({ page }) => {
        await page.goto("/?dict=es&word=agua", { waitUntil: "load" });
        await page.waitForSelector(".card-title");

        await page.fill(".search-box input", "cas");
        await page.waitForTimeout(800);

        const recent = await page.locator(".saved-words .chip").allInnerTexts();
        expect(recent).not.toContain("ca");
        expect(recent).not.toContain("cas");
    });
});

test.describe("historial y guardadas", () => {
    test("recuerda lo buscado y permite volver", async ({ page }) => {
        await search(page, "es", "agua");
        await search(page, "es", "libro");

        // La tira sólo aparece con el buscador enfocado: permanente se comía más
        // espacio que la propia definición.
        await page.click(".search-box input");

        const recent = page.locator(".saved-words .chip");
        await expect(recent.first()).toHaveText("libro");

        await recent.nth(1).click();
        await expect(page.locator(".card-title span").first()).toHaveText("agua");
    });

    test("guarda una palabra con la estrella", async ({ page }) => {
        await search(page, "es", "agua");

        await page.click("button[aria-label='Guardar palabra']");

        await page.click(".search-box input");
        await page.click(".saved-words .tab:has-text('Guardadas')");
        await expect(page.locator(".saved-words .chip")).toHaveText(["agua"]);

        // Y se puede quitar.
        await page.click("button[aria-label='Quitar de guardadas']");
        await page.click(".search-box input");
        await expect(page.locator(".saved-words .chip")).toHaveCount(0);
    });
});

test.describe("palabra del día", () => {
    test("sin palabra en la URL abre por la del día", async ({ page }) => {
        await page.goto("/?dict=es", { waitUntil: "load" });
        await page.waitForSelector(".card-title");

        await expect(page.locator(".word-of-the-day")).toBeVisible();
    });

    test("es la misma al recargar el mismo día", async ({ page }) => {
        await page.goto("/?dict=es", { waitUntil: "load" });
        await page.waitForSelector(".card-title");

        const first = await page.locator(".card-title span").first().innerText();

        await page.goto("/?dict=es", { waitUntil: "load" });
        await page.waitForSelector(".card-title");

        expect(await page.locator(".card-title span").first().innerText()).toBe(first);
    });
});

test("dice en qué otro diccionario está la palabra", async ({ page }) => {
    await search(page, "es", "agua");

    await page.fill(".search-box input", "eau");
    await page.click(".search-box button:has-text('Buscar')");

    await expect(page.locator(".elsewhere")).toContainText("Français");
});

test.describe("acentos y diéresis", () => {
    /*
     * Regresión: "cuidara" y "cuidará" comparten clave normalizada — la misma
     * que permite encontrar "corazón" escribiendo "corazon" — así que buscar una
     * definía también la otra y el índice marcaba las dos.
     */
    test("buscar una palabra acentuada no define también la que no lo está", async ({ page }) => {
        await search(page, "es", "cuidará");

        await expect(page.locator(".card-title > span").first()).toHaveText("cuidará");
        await expect(page.locator(".card")).toHaveCount(1);
        await expect(page.locator(".word.current")).toHaveCount(1);
        await expect(page.locator(".word.current")).toHaveText("cuidará");
    });

    /* Pero escribir sin acentos tiene que seguir encontrando la acentuada. */
    test("escribir sin acentos sigue encontrando la palabra", async ({ page }) => {
        await search(page, "es", "corazon");

        await expect(page.locator(".card-title > span").first()).toHaveText("corazón");
        await expect(page.locator(".word.current")).toHaveText("corazón");
    });
});

test.describe("en móvil", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("nada se sale de la pantalla", async ({ page }) => {
        await search(page, "es", "corazon");

        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
        );

        expect(overflow).toBe(0);
    });

    /* Con los cuatro controles en fila, escribir pasaba en un hueco de 170 px. */
    test("el buscador ocupa una línea entera", async ({ page }) => {
        await search(page, "es", "corazon");

        const input = await page.locator(".search-box input").boundingBox();
        expect(input!.width).toBeGreaterThan(300);
    });

    test("el índice se pliega y se abre con su botón", async ({ page }) => {
        await search(page, "es", "corazon");

        await expect(page.locator(".pane-index .sheet")).toBeHidden();
        await expect(page.locator(".index-toggle")).toBeVisible();

        await page.click(".index-toggle");

        await expect(page.locator(".pane-index .sheet")).toBeVisible();
        await expect(page.locator(".pane-entry .card-title")).toBeHidden();
    });

    test("elegir una palabra del índice vuelve a la entrada", async ({ page }) => {
        await search(page, "es", "corazon");

        await page.click(".index-toggle");
        const word = await page.locator(".word").first().innerText();
        await page.locator(".word").first().click();

        await expect(page.locator(".pane-entry .card-title")).toBeVisible();
        await expect(page.locator(".card-title > span").first()).toHaveText(word);
    });

    test("el buscador y el selector siguen accesibles", async ({ page }) => {
        await search(page, "es", "corazon");

        await expect(page.locator(".search-box input")).toBeVisible();
        await expect(page.locator(".dictionary-select")).toBeVisible();
    });
});

test.describe("sitio para la definición", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    /*
     * El armazón se comía 572 px de 844 antes de llegar a la ficha: el 68% de la
     * pantalla para llegar a lo único que le importa al usuario.
     */
    /*
     * El título se quitó de la pantalla, pero NO del documento: una página sin
     * encabezado es peor para quien la recorre con un lector de pantalla.
     */
    test("conserva el encabezado para lectores de pantalla, sin ocupar sitio", async ({ page }) => {
        await search(page, "es", "agua");

        const heading = page.getByRole("heading", { level: 1 });

        await expect(heading).toHaveText("Diccionario");
        expect(await heading.boundingBox().then((b) => b?.height ?? 0)).toBeLessThan(2);
    });

    test("el tema sigue a mano, sin fila propia", async ({ page }) => {
        await search(page, "es", "agua");

        await expect(page.locator(".select-row .theme-toggle")).toBeVisible();
    });

    test("la ficha empieza en la mitad superior de la pantalla", async ({ page }) => {
        await search(page, "es", "corazon");

        const top = await page.evaluate(() => {
            const card = document.querySelector(".pane-entry .card");
            return Math.round(card!.getBoundingClientRect().top + window.scrollY);
        });

        expect(top).toBeLessThan(220);
    });

    test("las recientes no ocupan sitio mientras se lee", async ({ page }) => {
        await search(page, "es", "agua");
        await search(page, "es", "libro");

        await expect(page.locator(".saved-words")).toHaveCount(0);

        // Y vuelven en cuanto se va a buscar otra cosa.
        await page.click(".search-box input");
        await expect(page.locator(".saved-words")).toBeVisible();
    });

    test("al desplazarse queda una barra de búsqueda pegada arriba", async ({ page }) => {
        await search(page, "es", "agua");

        await page.mouse.wheel(0, 600);
        await expect(page.locator(".select-row")).toBeHidden();

        const bar = await page.locator(".chrome").boundingBox();
        expect(bar!.y).toBe(0);
        expect(bar!.height).toBeLessThan(70);

        // El campo sigue ahí: es lo que evita volver arriba entre palabra y palabra.
        await expect(page.locator(".search-box input")).toBeVisible();
    });

    test("la fuente se acredita dentro de la ficha", async ({ page }) => {
        await search(page, "es", "agua");

        await expect(page.locator(".pane-entry .card .source")).toBeVisible();
    });
});
