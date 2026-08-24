import { z } from "zod";

export const LANG_EN = "en";
export const LANG_ES = "es";

export const Language = z.enum([LANG_EN, LANG_ES]);
export type Language = z.infer<typeof Language>;

export function isLanguage(value: string): value is Language {
    return Language.safeParse(value).success;
}

/**
 * De dónde salió una entrada. Se muestra al usuario: las fuentes tienen licencias
 * distintas (Wiktionary es CC BY-SA y exige atribución) y calidad distinta.
 */
export const SourceId = z.enum(["offline", "freedictionaryapi", "dictionaryapi", "rae"]);
export type SourceId = z.infer<typeof SourceId>;

export const Phonetic = z.object({
    text: z.string().default(""),
    audio: z.string().default(""),
});
export type Phonetic = z.infer<typeof Phonetic>;

export const Definition = z.object({
    definition: z.string(),
    example: z.string().default(""),
    synonyms: z.array(z.string()).default([]),
    antonyms: z.array(z.string()).default([]),
});
export type Definition = z.infer<typeof Definition>;

export const Meaning = z.object({
    partOfSpeech: z.string().default(""),
    definitions: z.array(Definition).default([]),
});
export type Meaning = z.infer<typeof Meaning>;

/**
 * Forma normalizada que consume la UI. Los nombres de campo se heredan de la
 * respuesta de dictionaryapi.dev porque `Word.svelte` ya los usaba; cada fuente
 * nueva se adapta a esta forma en su propio módulo, no al revés.
 */
export const Word = z.object({
    word: z.string(),
    phonetic: z.string().nullable().default(null),
    phonetics: z.array(Phonetic).default([]),
    origin: z.string().nullable().default(null),
    meanings: z.array(Meaning).default([]),
    source: SourceId.optional(),
});
export type Word = z.infer<typeof Word>;

export type LookupStatus = "ok" | "not-found" | "error";

export type LookupResult = {
    status: LookupStatus;
    word: string;
    language: Language;
    words: Word[];
    /** Fuente que respondió. `null` si ninguna lo hizo. */
    source: SourceId | null;
    /** True si se resolvió sin tocar la red. */
    offline: boolean;
};

/** Una entrada del dataset empaquetado: la palabra canónica y sus acepciones. */
export const ShardEntry = Word;
export type ShardEntry = Word;

export const Shard = z.object({
    /** clave normalizada -> entradas que colisionan en esa clave */
    entries: z.record(z.string(), z.array(Word)),
    /** forma flexionada normalizada -> palabra canónica (p. ej. "aguas" -> "agua") */
    forms: z.record(z.string(), z.string()).default({}),
});
export type Shard = z.infer<typeof Shard>;

export const LanguageStats = z.object({
    words: z.number(),
    forms: z.number(),
    bytes: z.number(),
});
export type LanguageStats = z.infer<typeof LanguageStats>;

export const Manifest = z.object({
    version: z.number(),
    generatedAt: z.string(),
    shardCount: z.number(),
    languages: z.record(z.string(), LanguageStats),
    source: z.string(),
    license: z.string(),
});
export type Manifest = z.infer<typeof Manifest>;
