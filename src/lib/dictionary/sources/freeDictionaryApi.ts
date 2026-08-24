/**
 * freedictionaryapi.com — Wiktionary vía API, sin clave, 1.000 peticiones/hora por IP.
 *
 * Cubre muchos idiomas, pero sirve el Wiktionary *inglés*: pedirle "agua" en
 * español devuelve la glosa "water". Por eso en español va después de la RAE y
 * sólo actúa como último recurso.
 */

import { z } from "zod";

import type { Language, Meaning, Word } from "../types";
import type { SourceResult } from "./types";

const API_URL = "https://freedictionaryapi.com/api/v1/entries";

const Sense = z.object({
    definition: z.string(),
    examples: z.array(z.string()).default([]),
    synonyms: z.array(z.string()).default([]),
    antonyms: z.array(z.string()).default([]),
});

const Entry = z.object({
    partOfSpeech: z.string().default(""),
    pronunciations: z
        .array(z.object({ type: z.string().default(""), text: z.string().default("") }))
        .default([]),
    senses: z.array(Sense).default([]),
    etymology: z.string().optional(),
});

const Response = z.object({
    word: z.string(),
    entries: z.array(Entry).default([]),
});

export const id = "freedictionaryapi" as const;

/** Se apoya en códigos ISO 639; en la práctica responde para todo idioma con Wiktionary. */
export function supports(_language: Language): boolean {
    return true;
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
        console.error("respuesta inesperada de freedictionaryapi.com", parsed.error);
        return { status: "error", words: [] };
    }

    if (parsed.data.entries.length === 0) {
        return { status: "not-found", words: [] };
    }

    return { status: "ok", words: [toWord(parsed.data)] };
}

function toWord(response: z.infer<typeof Response>): Word {
    const meanings: Meaning[] = response.entries.map((entry) => ({
        partOfSpeech: entry.partOfSpeech,
        definitions: entry.senses.map((sense) => ({
            definition: sense.definition,
            example: sense.examples[0] ?? "",
            synonyms: sense.synonyms,
            antonyms: sense.antonyms,
        })),
    }));

    // La API devuelve una decena de variantes de IPA por acento regional; con la
    // primera basta para la cabecera y el resto sólo haría ruido.
    const phonetics = response.entries
        .flatMap((entry) => entry.pronunciations)
        .filter((pronunciation) => pronunciation.type === "ipa" && pronunciation.text.length > 0)
        .slice(0, 3)
        .map((pronunciation) => ({ text: pronunciation.text, audio: "" }));

    return {
        word: response.word,
        phonetic: phonetics[0]?.text ?? null,
        phonetics,
        origin: response.entries.find((entry) => entry.etymology)?.etymology ?? null,
        meanings: meanings.filter((meaning) => meaning.definitions.length > 0),
        source: id,
    };
}
