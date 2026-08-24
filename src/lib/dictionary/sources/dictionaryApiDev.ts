/**
 * api.dictionaryapi.dev — sólo inglés, sin clave.
 *
 * Es la fuente original del proyecto. Su respuesta ya tiene la forma del modelo
 * normalizado (el modelo se diseñó a partir de ella), así que sólo hay que validar.
 *
 * Ojo: para español devuelve 404 incluso en palabras básicas como "agua". No la
 * uses fuera de inglés.
 */

import { z } from "zod";

import { Word, type Language } from "../types";
import type { SourceResult } from "./types";

const API_URL = "https://api.dictionaryapi.dev/api/v2/entries";

const Response = z.array(Word);

export const id = "dictionaryapi" as const;

export function supports(language: Language): boolean {
    return language === "en";
}

export async function lookup(word: string, language: Language): Promise<SourceResult> {
    const response = await fetch(`${API_URL}/${language}/${encodeURIComponent(word)}`);

    if (response.status === 404) {
        return { status: "not-found", words: [] };
    }

    if (!response.ok) {
        return { status: "error", words: [] };
    }

    const parsed = Response.safeParse(await response.json());

    if (!parsed.success) {
        console.error("respuesta inesperada de dictionaryapi.dev", parsed.error);
        return { status: "error", words: [] };
    }

    return {
        status: "ok",
        words: parsed.data.map((entry) => ({ ...entry, source: id })),
    };
}
