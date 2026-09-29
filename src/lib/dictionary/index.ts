/**
 * Punto de entrada de las búsquedas.
 *
 * Orden: dataset offline primero, red después. El dataset cubre las ~30.000
 * palabras más frecuentes de cada idioma, así que la mayoría de las búsquedas
 * no tocan la red — que es el objetivo de que esto sea una PWA.
 *
 * Cadena por idioma, sólo fuentes sin API key:
 *   es: offline -> rae-api.com -> freedictionaryapi.com
 *   en: offline -> dictionaryapi.dev -> freedictionaryapi.com
 *
 * En español la RAE va antes porque define *en español*; freedictionaryapi sirve
 * el Wiktionary inglés y traduciría "agua" como "water".
 */

import { listDictionaries, loadWordIndex, lookupOffline } from "./offline/dataset";

export {
    deleteLanguage,
    listDictionaries,
    loadInflections,
    loadWordIndex,
    getLanguageStatus,
    isLanguageDownloaded,
    loadManifest,
    prefetchLanguage,
    type LanguageStatus,
    type PrefetchOptions,
    type PrefetchStatus,
} from "./offline/dataset";

export {
    addFavorite,
    addToHistory,
    clearFavorites,
    clearHistory,
    isFavorite,
    readFavorites,
    readHistory,
    removeFavorite,
    type SavedWord,
} from "./offline/store";

export {
    getStorageEstimate,
    hasRoomFor,
    isStoragePersisted,
    requestPersistentStorage,
    type StorageEstimate,
} from "./offline/storage";
import * as dictionaryApiDev from "./sources/dictionaryApiDev";
import * as freeDictionaryApi from "./sources/freeDictionaryApi";
import * as raeApi from "./sources/raeApi";
import type { Source } from "./sources/types";
import { normalizeKey } from "./key";
import type { Language, LookupResult } from "./types";

/**
 * Fuentes en línea por diccionario.
 *
 * Sólo las tienen los monolingües `es` y `en`: las APIs disponibles definen en
 * español o en inglés, y no hay ninguna que devuelva, por ejemplo, francés
 * glosado en inglés como hace el dataset bilingüe. Un diccionario sin entrada
 * aquí es **exclusivamente offline**, y la interfaz debe decirlo en vez de
 * fingir que la red ayudaría.
 */
const SOURCES_BY_DICTIONARY: Record<string, Source[]> = {
    es: [raeApi, freeDictionaryApi],
    en: [dictionaryApiDev, freeDictionaryApi],
};

/** Si el diccionario puede recurrir a la red cuando el dataset no tiene la palabra. */
export function hasOnlineSources(dictionaryId: string): boolean {
    return (SOURCES_BY_DICTIONARY[dictionaryId]?.length ?? 0) > 0;
}

export type LookupOptions = {
    /** Salta el dataset empaquetado. Sólo para tests y depuración. */
    skipOffline?: boolean;
};

export async function lookup(
    word: string,
    dictionaryId: string,
    options: LookupOptions = {},
): Promise<LookupResult> {
    const trimmed = word.trim();

    const empty: LookupResult = {
        status: "not-found",
        word: trimmed,
        dictionaryId,
        words: [],
        source: null,
        offline: false,
    };

    if (trimmed.length === 0) return empty;

    if (!options.skipOffline) {
        const offlineWords = await lookupOffline(trimmed, dictionaryId);

        if (offlineWords.length > 0) {
            return {
                status: "ok",
                word: trimmed,
                dictionaryId,
                words: offlineWords,
                source: "offline",
                offline: true,
            };
        }
    }

    const sources = SOURCES_BY_DICTIONARY[dictionaryId] ?? [];

    // Un diccionario sin fuentes en línea (los bilingües) termina aquí: el
    // dataset es todo lo que hay.
    if (sources.length === 0) return empty;

    // Sin red no tiene sentido recorrer la cadena: cada intento tarda en fallar.
    if (!isOnline()) {
        return { ...empty, status: "not-found" };
    }

    const language = dictionaryId as Language;

    let sawError = false;

    for (const source of sources) {
        if (!source.supports(language)) continue;

        try {
            const result = await source.lookup(trimmed, language);

            if (result.status === "ok" && result.words.length > 0) {
                return {
                    status: "ok",
                    word: trimmed,
                    dictionaryId,
                    words: result.words,
                    source: source.id,
                    offline: false,
                };
            }

            if (result.status === "error") sawError = true;
        } catch {
            // Fallo de red o CORS: se intenta la siguiente fuente.
            sawError = true;
        }
    }

    return { ...empty, status: sawError ? "error" : "not-found" };
}

function isOnline(): boolean {
    return typeof navigator === "undefined" || navigator.onLine !== false;
}

export * from "./types";
export { isSameWord, normalizeKey, shardIdForKey, SHARD_COUNT } from "./key";

/**
 * Dónde MÁS está esta palabra.
 *
 * Con seis diccionarios, "sin resultados" dejó de ser una respuesta suficiente:
 * `eau` no está en español, pero sí en francés, y antes el usuario no tenía
 * forma de saberlo salvo ir probando diccionarios a mano.
 *
 * Sólo mira los que ya tienen índice disponible (descargado o cacheado), y nunca
 * sale a la red a por definiciones: es una pista para saltar, no una búsqueda.
 */
export async function findInOtherDictionaries(
    word: string,
    exceptDictionaryId: string,
): Promise<string[]> {
    const trimmed = word.trim();
    if (trimmed.length === 0) return [];

    const dictionaries = await listDictionaries();
    const key = normalizeKey(trimmed);

    const found = await Promise.all(
        dictionaries.map(async (dictionary) => {
            if (dictionary.id === exceptDictionaryId) return null;

            const index = await loadWordIndex(dictionary.id);
            if (!index) return null;

            // El índice guarda la grafía real, así que se compara normalizando:
            // quien escribe "eau" debe encontrar "Eau" igual que en la búsqueda.
            const hit = index.some((entry) => normalizeKey(entry) === key);

            return hit ? dictionary.id : null;
        }),
    );

    return found.filter((id): id is string => id != null);
}

/**
 * Sugerencias por prefijo para el buscador.
 *
 * Búsqueda binaria sobre el índice ya ordenado: con 30.000 palabras, recorrerlo
 * entero en cada tecla se nota en un móvil.
 */
export async function suggest(
    prefix: string,
    dictionaryId: string,
    limit = 8,
): Promise<string[]> {
    const key = normalizeKey(prefix);
    if (key.length === 0) return [];

    const index = await loadWordIndex(dictionaryId);
    if (!index) return [];

    // El índice está ordenado por `Intl.Collator` del idioma, no por clave
    // normalizada, así que la binaria sólo sirve para acercarse: se acota una
    // ventana y se filtra dentro de ella.
    let low = 0;
    let high = index.length;

    while (low < high) {
        const middle = (low + high) >>> 1;

        if (normalizeKey(index[middle]) < key) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    const suggestions: string[] = [];

    for (let i = low; i < index.length && suggestions.length < limit; i++) {
        const candidate = normalizeKey(index[i]);

        if (!candidate.startsWith(key)) {
            // Con acentos el orden del collator y el de la clave normalizada no
            // coinciden exactamente; se tolera un pequeño desfase antes de
            // rendirse.
            if (candidate > key && !candidate.startsWith(key.slice(0, 1))) break;
            continue;
        }

        suggestions.push(index[i]);
    }

    return suggestions;
}
