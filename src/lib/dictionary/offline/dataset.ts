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

import { normalizeKey, shardIdForKey } from "../key";
import { Manifest, Shard, type Language, type Word } from "../types";
import {
    isLanguageComplete,
    markLanguageComplete,
    readShard,
    readStoredManifest,
    writeShard,
    writeStoredManifest,
} from "./store";

/** Ruta relativa a propósito: en producción el sitio cuelga de `/dictionary/`. */
const DATA_ROOT = "data";

const memoryShards = new Map<string, Shard>();
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
    language: Language,
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

export async function lookupOffline(word: string, language: Language): Promise<Word[]> {
    const manifest = await loadManifest();
    if (!manifest || !manifest.languages[language]) return [];

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
 * Una clave puede tener homógrafos que sólo difieren en acentos o mayúsculas
 * ("water" y "Water"). Si el usuario escribió exactamente uno de ellos, ese manda.
 */
function preferExactMatch(entries: Word[], query: string): Word[] {
    const exact = entries.filter((entry) => entry.word === query);
    if (exact.length === 0) return entries;

    return [...exact, ...entries.filter((entry) => entry.word !== query)];
}

/**
 * Descarga el dataset completo de un idioma.
 *
 * Sin esto, "offline" sólo alcanza a los shards que el usuario ya visitó, que es
 * justo lo que no sirve cuando te quedas sin red. Son decenas de MB, así que
 * nunca se dispara solo: lo pide el usuario explícitamente.
 */
export async function prefetchLanguage(
    language: Language,
    onProgress?: (done: number, total: number) => void,
): Promise<boolean> {
    const manifest = await loadManifest();
    if (!manifest || !manifest.languages[language]) return false;

    const total = manifest.shardCount;
    let done = 0;
    let failed = false;

    // De cuatro en cuatro: en serie tarda demasiado y de golpe satura la conexión
    // y el almacenamiento del navegador.
    const BATCH_SIZE = 4;

    for (let start = 0; start < total; start += BATCH_SIZE) {
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

    if (!failed) {
        await markLanguageComplete(language, manifest.version);
    }

    return !failed;
}

/**
 * Si el idioma está descargado entero.
 *
 * Se apoya en un marcador y no en recorrer los 64 shards: la respuesta tiene que
 * ser inmediata para no ofrecer una descarga que ya se hizo.
 */
export async function isLanguageDownloaded(language: Language): Promise<boolean> {
    const manifest = await loadManifest();
    if (!manifest) return false;

    return isLanguageComplete(language, manifest.version);
}

/** Sólo para tests. */
export function resetDatasetCache(): void {
    memoryShards.clear();
    manifestPromise = null;
}
