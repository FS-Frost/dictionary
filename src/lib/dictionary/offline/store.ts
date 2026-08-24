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
const DB_VERSION = 1;
const STORE_NAME = "shards";

/**
 * Marcadores de "este idioma está descargado entero".
 *
 * Sin esto habría que contar los 64 shards en cada arranque para saber si
 * ofrecer el botón de descarga, y mientras se cuenta la UI parpadea ofreciendo
 * descargar algo que ya está.
 */
const STORE_META = "meta";

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
