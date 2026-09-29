/**
 * Caché persistente de shards en IndexedDB.
 *
 * El dataset completo pesa ~55 MB, demasiado para descargarlo de una vez. Se
 * baja un shard (~300-560 KB) cuando hace falta y se guarda aquí, de modo que
 * la segunda búsqueda en esa zona del alfabeto ya no toca la red.
 *
 * Todo fallo de IndexedDB se degrada a "no hay caché", nunca se propaga: en modo
 * privado de Safari el `open` puede fallar y el diccionario debe seguir andando.
 */

import type { Shard } from "../types";

const DB_NAME = "dictionary-offline";
const DB_VERSION = 2;
const STORE_NAME = "shards";

/**
 * Marcadores de "este idioma está descargado entero".
 *
 * Sin esto habría que contar los 64 shards en cada arranque para saber si
 * ofrecer el botón de descarga, y mientras se cuenta la UI parpadea ofreciendo
 * descargar algo que ya está.
 */
const STORE_META = "meta";

/**
 * Historial y palabras guardadas.
 *
 * Van en la misma base que los shards porque comparten ciclo de vida: si el
 * usuario borra los datos del sitio, se va todo junto, que es lo que espera.
 */
const STORE_HISTORY = "history";
const STORE_FAVORITES = "favorites";

type CachedShard = {
    key: string;
    /** Versión del manifiesto con la que se guardó; si cambia, el shard se descarta. */
    datasetVersion: number;
    shard: Shard;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function isAvailable(): boolean {
    return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase | null> {
    if (!isAvailable()) return Promise.resolve(null);

    return new Promise((resolve) => {
        let request: IDBOpenDBRequest;

        try {
            request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch {
            resolve(null);
            return;
        }

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "key" });
            }

            if (!db.objectStoreNames.contains(STORE_META)) {
                db.createObjectStore(STORE_META, { keyPath: "key" });
            }

            if (!db.objectStoreNames.contains(STORE_HISTORY)) {
                const store = db.createObjectStore(STORE_HISTORY, { keyPath: "key" });
                store.createIndex("visitedAt", "visitedAt");
            }

            if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
                db.createObjectStore(STORE_FAVORITES, { keyPath: "key" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
}

function getDatabase(): Promise<IDBDatabase | null> {
    dbPromise ??= openDatabase();
    return dbPromise;
}

function cacheKey(language: string, shardId: number): string {
    return `${language}:${shardId}`;
}

export async function readShard(
    language: string,
    shardId: number,
    datasetVersion: number,
): Promise<Shard | null> {
    const db = await getDatabase();
    if (!db) return null;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_NAME, "readonly");
            const request = tx.objectStore(STORE_NAME).get(cacheKey(language, shardId));

            request.onsuccess = () => {
                const cached = request.result as CachedShard | undefined;

                if (!cached || cached.datasetVersion !== datasetVersion) {
                    resolve(null);
                    return;
                }

                resolve(cached.shard);
            };

            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export async function writeShard(
    language: string,
    shardId: number,
    datasetVersion: number,
    shard: Shard,
): Promise<void> {
    const db = await getDatabase();
    if (!db) return;

    const record: CachedShard = {
        key: cacheKey(language, shardId),
        datasetVersion,
        shard,
    };

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(record);

            tx.oncomplete = () => resolve();
            // Un fallo al escribir (cuota llena) sólo cuesta un fetch extra la próxima vez.
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/**
 * El manifiesto también se persiste aquí.
 *
 * Si dependiera del caché del service worker, la búsqueda offline fallaría
 * cuando el worker todavía no controla la página: sin manifiesto no se sabe qué
 * idiomas hay ni qué versión de dataset leer, y el resultado sería "no
 * encontrado" en un diccionario que sí tiene la palabra guardada.
 */
export async function readStoredManifest(): Promise<unknown | null> {
    const db = await getDatabase();
    if (!db) return null;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_META, "readonly");
            const request = tx.objectStore(STORE_META).get("manifest");

            request.onsuccess = () => {
                const record = request.result as { manifest?: unknown } | undefined;
                resolve(record?.manifest ?? null);
            };

            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export async function writeStoredManifest(manifest: unknown): Promise<void> {
    const db = await getDatabase();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_META, "readwrite");
            tx.objectStore(STORE_META).put({ key: "manifest", manifest });

            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/**
 * Índice alfabético de un diccionario, guardado junto al manifiesto.
 *
 * Reconstruirlo exige leer los 64 shards y ordenar decenas de miles de palabras:
 * un segundo largo cada vez que se abre el navegador de palabras. Guardarlo
 * cuesta unos cientos de KB y lo convierte en instantáneo.
 */
export async function readStoredIndex(
    language: string,
    datasetVersion: number,
): Promise<string[] | null> {
    const db = await getDatabase();
    if (!db) return null;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_META, "readonly");
            const request = tx.objectStore(STORE_META).get(`index:${language}`);

            request.onsuccess = () => {
                const record = request.result as
                    | { datasetVersion: number; words: string[] }
                    | undefined;

                if (!record || record.datasetVersion !== datasetVersion) {
                    resolve(null);
                    return;
                }

                resolve(record.words);
            };

            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export async function writeStoredIndex(
    language: string,
    datasetVersion: number,
    words: string[],
): Promise<void> {
    const db = await getDatabase();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_META, "readwrite");
            tx.objectStore(STORE_META).put({ key: `index:${language}`, datasetVersion, words });

            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

export async function isLanguageComplete(language: string, datasetVersion: number): Promise<boolean> {
    const db = await getDatabase();
    if (!db) return false;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_META, "readonly");
            const request = tx.objectStore(STORE_META).get(`complete:${language}`);

            request.onsuccess = () => {
                const record = request.result as { datasetVersion: number } | undefined;
                resolve(record?.datasetVersion === datasetVersion);
            };

            request.onerror = () => resolve(false);
        } catch {
            resolve(false);
        }
    });
}

export async function markLanguageComplete(language: string, datasetVersion: number): Promise<void> {
    const db = await getDatabase();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_META, "readwrite");
            tx.objectStore(STORE_META).put({ key: `complete:${language}`, datasetVersion });

            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/**
 * Borra todo lo guardado de un idioma: sus shards y su marcador de completo.
 *
 * Existe porque un idioma descargado ocupa decenas de MB y el usuario tiene que
 * poder recuperarlos sin borrar los datos del sitio entero desde el navegador,
 * que es lo único que había antes y se lleva por delante también el otro idioma.
 *
 * Las claves son `${language}:${shardId}`, así que basta recorrer el rango que
 * empieza por el prefijo en vez de leer los 128 registros de ambos idiomas.
 */
export async function deleteLanguage(language: string): Promise<void> {
    const db = await getDatabase();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction([STORE_NAME, STORE_META], "readwrite");

            // `￿` cierra el rango: ordena después de cualquier sufijo real.
            const range = IDBKeyRange.bound(`${language}:`, `${language}:￿`);
            tx.objectStore(STORE_NAME).delete(range);
            tx.objectStore(STORE_META).delete(`complete:${language}`);
            tx.objectStore(STORE_META).delete(`index:${language}`);

            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/** Vacía la caché. Expuesto para tests y para poder recuperarse de datos corruptos. */
export async function clearShards(): Promise<void> {
    const db = await getDatabase();
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction([STORE_NAME, STORE_META], "readwrite");
            tx.objectStore(STORE_NAME).clear();
            tx.objectStore(STORE_META).clear();

            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/** Sólo para tests: obliga a reabrir la base en la siguiente operación. */
export function resetConnection(): void {
    dbPromise = null;
}

/** Una palabra vista o guardada, con el diccionario en el que se consultó. */
export type SavedWord = {
    key: string;
    word: string;
    dictionaryId: string;
    visitedAt: number;
};

function savedKey(dictionaryId: string, word: string): string {
    return `${dictionaryId}:${word}`;
}

/** Tope del historial: lo suficiente para volver sobre lo reciente, no un archivo. */
const HISTORY_LIMIT = 200;

function readAll(storeName: string): Promise<SavedWord[]> {
    return getDatabase().then(
        (db) =>
            new Promise((resolve) => {
                if (!db) return resolve([]);

                try {
                    const tx = db.transaction(storeName, "readonly");
                    const request = tx.objectStore(storeName).getAll();

                    request.onsuccess = () => resolve((request.result as SavedWord[]) ?? []);
                    request.onerror = () => resolve([]);
                } catch {
                    resolve([]);
                }
            }),
    );
}

function write(storeName: string, record: SavedWord): Promise<void> {
    return getDatabase().then(
        (db) =>
            new Promise((resolve) => {
                if (!db) return resolve();

                try {
                    const tx = db.transaction(storeName, "readwrite");
                    tx.objectStore(storeName).put(record);

                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                    tx.onabort = () => resolve();
                } catch {
                    resolve();
                }
            }),
    );
}

function remove(storeName: string, key: string): Promise<void> {
    return getDatabase().then(
        (db) =>
            new Promise((resolve) => {
                if (!db) return resolve();

                try {
                    const tx = db.transaction(storeName, "readwrite");
                    tx.objectStore(storeName).delete(key);

                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                    tx.onabort = () => resolve();
                } catch {
                    resolve();
                }
            }),
    );
}

function clearStore(storeName: string): Promise<void> {
    return getDatabase().then(
        (db) =>
            new Promise((resolve) => {
                if (!db) return resolve();

                try {
                    const tx = db.transaction(storeName, "readwrite");
                    tx.objectStore(storeName).clear();

                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                    tx.onabort = () => resolve();
                } catch {
                    resolve();
                }
            }),
    );
}

/** Historial, de lo más reciente a lo más antiguo. */
export async function readHistory(): Promise<SavedWord[]> {
    const all = await readAll(STORE_HISTORY);
    return all.sort((a, b) => b.visitedAt - a.visitedAt).slice(0, HISTORY_LIMIT);
}

export async function addToHistory(dictionaryId: string, word: string): Promise<void> {
    await write(STORE_HISTORY, {
        key: savedKey(dictionaryId, word),
        word,
        dictionaryId,
        visitedAt: Date.now(),
    });

    // La poda va aquí y no al leer: si no, la base crece sin tope aunque la
    // lista que se enseña esté recortada.
    const all = await readAll(STORE_HISTORY);
    if (all.length <= HISTORY_LIMIT) return;

    const excess = all.sort((a, b) => b.visitedAt - a.visitedAt).slice(HISTORY_LIMIT);
    await Promise.all(excess.map((entry) => remove(STORE_HISTORY, entry.key)));
}

export function clearHistory(): Promise<void> {
    return clearStore(STORE_HISTORY);
}

export async function readFavorites(): Promise<SavedWord[]> {
    const all = await readAll(STORE_FAVORITES);
    return all.sort((a, b) => b.visitedAt - a.visitedAt);
}

export function addFavorite(dictionaryId: string, word: string): Promise<void> {
    return write(STORE_FAVORITES, {
        key: savedKey(dictionaryId, word),
        word,
        dictionaryId,
        visitedAt: Date.now(),
    });
}

export function removeFavorite(dictionaryId: string, word: string): Promise<void> {
    return remove(STORE_FAVORITES, savedKey(dictionaryId, word));
}

export async function isFavorite(dictionaryId: string, word: string): Promise<boolean> {
    const all = await readAll(STORE_FAVORITES);
    return all.some((entry) => entry.key === savedKey(dictionaryId, word));
}

export function clearFavorites(): Promise<void> {
    return clearStore(STORE_FAVORITES);
}
