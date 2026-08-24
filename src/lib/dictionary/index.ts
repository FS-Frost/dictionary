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

import { lookupOffline } from "./offline/dataset";

export { isLanguageDownloaded, loadManifest, prefetchLanguage } from "./offline/dataset";
import * as dictionaryApiDev from "./sources/dictionaryApiDev";
import * as freeDictionaryApi from "./sources/freeDictionaryApi";
import * as raeApi from "./sources/raeApi";
import type { Source } from "./sources/types";
import type { Language, LookupResult } from "./types";

const SOURCES_BY_LANGUAGE: Record<Language, Source[]> = {
    es: [raeApi, freeDictionaryApi],
    en: [dictionaryApiDev, freeDictionaryApi],
};

export type LookupOptions = {
    /** Salta el dataset empaquetado. Sólo para tests y depuración. */
    skipOffline?: boolean;
};

export async function lookup(
    word: string,
    language: Language,
    options: LookupOptions = {},
): Promise<LookupResult> {
    const trimmed = word.trim();

    const empty: LookupResult = {
        status: "not-found",
        word: trimmed,
        language,
        words: [],
        source: null,
        offline: false,
    };

    if (trimmed.length === 0) return empty;

    if (!options.skipOffline) {
        const offlineWords = await lookupOffline(trimmed, language);

        if (offlineWords.length > 0) {
            return {
                status: "ok",
                word: trimmed,
                language,
                words: offlineWords,
                source: "offline",
                offline: true,
            };
        }
    }

    // Sin red no tiene sentido recorrer la cadena: cada intento tarda en fallar.
    if (!isOnline()) {
        return { ...empty, status: "not-found" };
    }

    let sawError = false;

    for (const source of SOURCES_BY_LANGUAGE[language]) {
        if (!source.supports(language)) continue;

        try {
            const result = await source.lookup(trimmed, language);

            if (result.status === "ok" && result.words.length > 0) {
                return {
                    status: "ok",
                    word: trimmed,
                    language,
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
