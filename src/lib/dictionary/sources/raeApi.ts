/**
 * rae-api.com — Diccionario de la lengua española, definiciones en español.
 *
 * Es la única fuente online que define palabras españolas *en español*; las
 * demás sirven el Wiktionary inglés y devuelven glosas traducidas.
 *
 * Advertencias:
 * - No es oficial de la RAE; puede desaparecer. Nunca es la fuente primaria: el
 *   dataset offline va antes.
 * - El tramo sin clave permite 10 peticiones/minuto y 100/día por IP. Con el
 *   dataset offline delante, sólo se gasta en palabras raras.
 */

import { z } from "zod";

import type { Language, Definition, Word } from "../types";
import type { SourceResult } from "./types";

const API_URL = "https://rae-api.com/api/words";

const Sense = z.object({
    category: z.string().default(""),
    description: z.string().default(""),
    usage: z.string().default(""),
    synonyms: z.array(z.string()).nullable().default(null),
    antonyms: z.array(z.string()).nullable().default(null),
});

const MeaningEntry = z.object({
    origin: z.object({ raw: z.string().default("") }).nullable().default(null),
    senses: z.array(Sense).default([]),
});

const Response = z.object({
    ok: z.boolean().default(true),
    data: z
        .object({
            word: z.string(),
            meanings: z.array(MeaningEntry).default([]),
        })
        .nullable()
        .default(null),
});

export const id = "rae" as const;

export function supports(language: Language): boolean {
    return language === "es";
}

export async function lookup(word: string, language: Language): Promise<SourceResult> {
    if (!supports(language)) {
        return { status: "not-found", words: [] };
    }

    const response = await fetch(`${API_URL}/${encodeURIComponent(word)}`);

    if (response.status === 404) {
        return { status: "not-found", words: [] };
    }

    // 429: cuota agotada. Es un fallo de la fuente, no una palabra inexistente,
    // así que el router debe poder intentar con la siguiente.
    if (!response.ok) {
        return { status: "error", words: [] };
    }

    const parsed = Response.safeParse(await response.json());

    if (!parsed.success) {
        console.error("respuesta inesperada de rae-api.com", parsed.error);
        return { status: "error", words: [] };
    }

    const data = parsed.data.data;

    if (!data || data.meanings.length === 0) {
        return { status: "not-found", words: [] };
    }

    return { status: "ok", words: [toWord(data)] };
}

function toWord(data: NonNullable<z.infer<typeof Response>["data"]>): Word {
    const meanings = data.meanings.map((meaning) => {
        // La RAE agrupa por etimología, no por categoría gramatical, y cada
        // acepción trae la suya. Se agrupan aquí para encajar en el modelo.
        const byCategory = new Map<string, Definition[]>();

        for (const sense of meaning.senses) {
            if (sense.description.length === 0) continue;

            const definitions = byCategory.get(sense.category) ?? [];

            definitions.push({
                definition: sense.description,
                example: sense.usage,
                synonyms: sense.synonyms ?? [],
                antonyms: sense.antonyms ?? [],
            });

            byCategory.set(sense.category, definitions);
        }

        return [...byCategory].map(([partOfSpeech, definitions]) => ({
            partOfSpeech,
            definitions,
        }));
    });

    return {
        word: data.word,
        phonetic: null,
        phonetics: [],
        origin: data.meanings.find((meaning) => meaning.origin?.raw)?.origin?.raw ?? null,
        meanings: meanings.flat(),
        source: id,
    };
}
