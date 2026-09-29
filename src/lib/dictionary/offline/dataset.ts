/**
 * Búsqueda en el dataset empaquetado.
 *
 * Resuelve en tres intentos, de más a menos exacto:
 *   1. la clave normalizada de la palabra ("corazon" encuentra "corazón");
 *   2. la tabla de flexiones del mismo shard ("aguas" -> "agua");
 *   3. nada, y el llamador decide si sale a la red.
 *
 * El paso 2 puede necesitar un segundo shard: el lema no tiene por qué caer en
 * el mismo que la forma flexionada.
 */

import { isSameWord, normalizeKey, shardIdForKey } from "../key";
import { Manifest, Shard, type Dictionary, type Word } from "../types";
import {
    deleteLanguage as deleteLanguageFromStore,
    isLanguageComplete,
    markLanguageComplete,
    readShard,
    readStoredIndex,
    readStoredManifest,
    writeStoredIndex,
    writeShard,
    writeStoredManifest,
} from "./store";
import { hasRoomFor, requestPersistentStorage } from "./storage";

/** Ruta relativa a propósito: en producción el sitio cuelga de `/dictionary/`. */
const DATA_ROOT = "data";

const memoryShards = new Map<string, Shard>();
const memoryIndexes = new Map<string, string[]>();
let manifestPromise: Promise<Manifest | null> | null = null;

export async function loadManifest(): Promise<Manifest | null> {
    manifestPromise ??= (async () => {
        try {
            const response = await fetch(`${DATA_ROOT}/manifest.json`);

            if (response.ok) {
                const parsed = Manifest.safeParse(await response.json());

                if (parsed.success) {
                    void writeStoredManifest(parsed.data);
                    return parsed.data;
                }

                console.error("manifiesto del dataset inválido", parsed.error);
            }
        } catch {
            // Sin red: se sigue con la copia guardada.
        }

        const stored = await readStoredManifest();
        if (!stored) return null;

        const parsed = Manifest.safeParse(stored);
        return parsed.success ? parsed.data : null;
    })();

    return manifestPromise;
}

async function loadShard(
    language: string,
    shardId: number,
    datasetVersion: number,
    /**
     * En la descarga masiva hay que esperar a que IndexedDB confirme la escritura
     * antes de dar el idioma por completo; en una búsqueda normal no, porque
     * bloquearía el resultado por un detalle de caché.
     */
    awaitPersist = false,
): Promise<Shard | null> {
    const key = `${language}:${shardId}`;

    const inMemory = memoryShards.get(key);
    if (inMemory) return inMemory;

    const cached = await readShard(language, shardId, datasetVersion);
    if (cached) {
        memoryShards.set(key, cached);
        return cached;
    }

    let shard: Shard;

    try {
        const response = await fetch(`${DATA_ROOT}/${language}/${shardId}.json`);
        if (!response.ok) return null;

        const parsed = Shard.safeParse(await response.json());
        if (!parsed.success) {
            console.error(`shard ${key} inválido`, parsed.error);
            return null;
        }

        shard = parsed.data;
    } catch {
        return null;
    }

    memoryShards.set(key, shard);

    const persisted = writeShard(language, shardId, datasetVersion, shard);
    if (awaitPersist) await persisted;

    return shard;
}

/**
 * `entries` y `forms` vienen de `JSON.parse`, así que heredan Object.prototype:
 * sin este guardia, buscar "constructor" devolvería una función.
 */
function readRecord<T>(record: Record<string, T>, key: string): T | undefined {
    return Object.hasOwn(record, key) ? record[key] : undefined;
}

export async function lookupOffline(word: string, dictionaryId: string): Promise<Word[]> {
    const manifest = await loadManifest();
    if (!manifest || !manifest.dictionaries[dictionaryId]) return [];

    const language = dictionaryId;

    const key = normalizeKey(word);
    if (key.length === 0) return [];

    const shard = await loadShard(language, shardIdForKey(key), manifest.version);
    if (!shard) return [];

    const direct = readRecord(shard.entries, key);
    if (direct && direct.length > 0) {
        return preferExactMatch(direct, word);
    }

    const canonical = readRecord(shard.forms, key);
    if (!canonical) return [];

    const canonicalKey = normalizeKey(canonical);
    const canonicalShardId = shardIdForKey(canonicalKey);

    const canonicalShard =
        canonicalShardId === shardIdForKey(key)
            ? shard
            : await loadShard(language, canonicalShardId, manifest.version);

    if (!canonicalShard) return [];

    const entries = readRecord(canonicalShard.entries, canonicalKey);
    return entries ? preferExactMatch(entries, canonical) : [];
}

/**
 * Una clave reúne palabras que sólo se diferencian en acentos o mayúsculas
 * ("water" y "Water"; "cuidara" y "cuidará"). Hay que decidir cuáles enseñar.
 *
 * La regla: si lo escrito coincide con alguna **ignorando sólo mayúsculas**, se
 * enseñan únicamente esas. Buscar "cuidará" definía también "cuidara", que es
 * otra palabra, porque comparaba por la clave normalizada — la misma que permite
 * encontrar "corazón" escribiendo "corazon".
 *
 * Si no coincide ninguna, es que se escribió sin acentos: entonces se devuelven
 * todas, que es lo que hace que "corazon" encuentre "corazón".
 */
function preferExactMatch(entries: Word[], query: string): Word[] {
    const matches = entries.filter((entry) => isSameWord(entry.word, query));
    if (matches.length === 0) return entries;

    // Entre las que sólo difieren en mayúsculas, la grafía idéntica encabeza:
    // quien escribe "water" busca el compuesto, no el caserío de Devon.
    return [
        ...matches.filter((entry) => entry.word === query),
        ...matches.filter((entry) => entry.word !== query),
    ];
}

/**
 * Descarga el dataset completo de un idioma.
 *
 * Sin esto, "offline" sólo alcanza a los shards que el usuario ya visitó, que es
 * justo lo que no sirve cuando te quedas sin red. Son decenas de MB, así que
 * nunca se dispara solo: lo pide el usuario explícitamente.
 */
export type PrefetchOptions = {
    onProgress?: (done: number, total: number) => void;
    /**
     * Permite abortar a mitad.
     *
     * Son decenas de MB sobre una conexión que puede ser móvil: dejar al usuario
     * sin más salida que cerrar la pestaña para parar una descarga que él mismo
     * inició es un mal trato. Lo ya bajado se conserva — sirve igual, sólo que el
     * idioma no queda marcado como completo.
     */
    signal?: AbortSignal;
};

export type PrefetchStatus = "complete" | "cancelled" | "failed" | "quota";

export async function prefetchLanguage(
    language: string,
    options: PrefetchOptions = {},
): Promise<PrefetchStatus> {
    const { onProgress, signal } = options;

    const manifest = await loadManifest();
    const info = manifest?.dictionaries[language];
    if (!manifest || !info) return "failed";

    // Se mira el espacio ANTES de empezar: bajar 34 MB para que el último shard
    // falle por cuota gasta los datos del usuario y deja el diccionario a
    // medias, que es el estado más confuso posible.
    if (!(await hasRoomFor(info.bytes))) return "quota";

    const total = manifest.shardCount;
    let done = 0;
    let failed = false;

    // De cuatro en cuatro: en serie tarda demasiado y de golpe satura la conexión
    // y el almacenamiento del navegador.
    const BATCH_SIZE = 4;

    for (let start = 0; start < total; start += BATCH_SIZE) {
        if (signal?.aborted) return "cancelled";

        const batch = Array.from(
            { length: Math.min(BATCH_SIZE, total - start) },
            (_, offset) => start + offset,
        );

        const results = await Promise.all(
            batch.map((shardId) => loadShard(language, shardId, manifest.version, true)),
        );

        if (results.some((shard) => shard === null)) failed = true;

        done += batch.length;
        onProgress?.(done, total);
    }

    if (signal?.aborted) return "cancelled";

    if (failed) return "failed";

    await markLanguageComplete(language, manifest.version);

    // Sin esto, lo que se acaba de descargar es desechable: el navegador puede
    // tirarlo cuando le apriete el disco y la aplicación seguiría creyendo que
    // está ahí. Se pide al terminar, no al arrancar, porque algunos navegadores
    // enseñan un aviso y sólo tiene sentido tras decidir guardar algo.
    void requestPersistentStorage();

    return "complete";
}

/**
 * Borra el idioma descargado y libera el espacio.
 *
 * También vacía la copia en memoria: si no, las búsquedas siguientes seguirían
 * respondiendo desde los shards que el usuario acaba de pedir borrar, y la UI
 * diría "no descargado" mientras el diccionario sigue funcionando sin red. Esa
 * incoherencia es peor que el borrado en sí.
 */
export async function deleteLanguage(language: string): Promise<void> {
    await deleteLanguageFromStore(language);

    for (const key of [...memoryShards.keys()]) {
        if (key.startsWith(`${language}:`)) memoryShards.delete(key);
    }

    memoryIndexes.delete(language);
}

export type LanguageStatus = Dictionary & {
    downloaded: boolean;
};

/** Lo que necesita la UI para decidir qué ofrecer sobre un diccionario. */
export async function getLanguageStatus(dictionaryId: string): Promise<LanguageStatus | null> {
    const manifest = await loadManifest();
    const info = manifest?.dictionaries[dictionaryId];
    if (!manifest || !info) return null;

    return {
        ...info,
        id: dictionaryId,
        downloaded: await isLanguageComplete(dictionaryId, manifest.version),
    };
}

/** Todos los diccionarios del dataset, con su estado de descarga. */
export async function listDictionaries(): Promise<LanguageStatus[]> {
    const manifest = await loadManifest();
    if (!manifest) return [];

    const ids = Object.keys(manifest.dictionaries);
    const statuses = await Promise.all(ids.map((id) => getLanguageStatus(id)));

    return statuses.filter((status): status is LanguageStatus => status != null);
}

/**
 * Si el idioma está descargado entero.
 *
 * Se apoya en un marcador y no en recorrer los 64 shards: la respuesta tiene que
 * ser inmediata para no ofrecer una descarga que ya se hizo.
 */
export async function isLanguageDownloaded(language: string): Promise<boolean> {
    const manifest = await loadManifest();
    if (!manifest) return false;

    return isLanguageComplete(language, manifest.version);
}

/**
 * Índice alfabético del diccionario: todas sus palabras, ordenadas.
 *
 * Es un fichero aparte (`index.json`, ~300 KB) y no algo que se derive de los
 * shards, por dos razones:
 *
 * - No puede salir de un shard suelto: las palabras se reparten entre los 64
 *   *por hash* de su clave, justamente para que una búsqueda baje un shard y no
 *   20 MB.
 * - Reconstruirlo leyendo los 64 exigiría tener el diccionario entero
 *   descargado, y entonces ni hojear ni autocompletar funcionarían para quien
 *   sólo quiere mirar. Con el fichero aparte, basta con tener red una vez.
 *
 * Se guarda en IndexedDB, así que a partir de la primera vez también funciona
 * sin conexión.
 */
export async function loadWordIndex(dictionaryId: string): Promise<string[] | null> {
    const manifest = await loadManifest();
    const info = manifest?.dictionaries[dictionaryId];
    if (!manifest || !info) return null;

    const inMemory = memoryIndexes.get(dictionaryId);
    if (inMemory) return inMemory;

    const stored = await readStoredIndex(dictionaryId, manifest.version);
    if (stored) {
        memoryIndexes.set(dictionaryId, stored);
        return stored;
    }

    try {
        const response = await fetch(`${DATA_ROOT}/${dictionaryId}/index.json`);
        if (!response.ok) return null;

        const parsed: unknown = await response.json();

        if (!Array.isArray(parsed) || parsed.some((word) => typeof word !== "string")) {
            console.error(`índice de ${dictionaryId} inválido`);
            return null;
        }

        const words = parsed as string[];

        memoryIndexes.set(dictionaryId, words);
        void writeStoredIndex(dictionaryId, manifest.version, words);

        return words;
    } catch {
        // Sin red y sin copia guardada: no hay índice, y quien llama lo dirá.
        return null;
    }
}

/**
 * Formas de un lema ("cantó", "cantaban"... para "cantar").
 *
 * Vive en el shard del lema, que es el que ya está cargado cuando se muestra su
 * ficha. Los diccionarios generados antes de la v3 no la traen y devuelven
 * vacío; la ficha simplemente no enseña la sección.
 */
export async function loadInflections(word: string, dictionaryId: string): Promise<string[]> {
    const manifest = await loadManifest();
    if (!manifest || !manifest.dictionaries[dictionaryId]) return [];

    const key = normalizeKey(word);
    if (key.length === 0) return [];

    const shard = await loadShard(dictionaryId, shardIdForKey(key), manifest.version);
    if (!shard) return [];

    return readRecord(shard.inflections, key) ?? [];
}

/** Sólo para tests. */
export function resetDatasetCache(): void {
    memoryShards.clear();
    memoryIndexes.clear();
    manifestPromise = null;
}
