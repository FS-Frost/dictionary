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
    /** Diccionario en el que se buscó. */
    dictionaryId: string;
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
    /**
     * clave normalizada del lema -> sus formas, tal y como se escriben.
     *
     * Es la tabla `forms` al revés, y hace falta aparte porque las claves de
     * `forms` están normalizadas: servirían para buscar "cantó" pero no para
     * *mostrarlo* (la clave es "canto", sin tilde).
     *
     * Opcional: los diccionarios generados antes de la v3 no la traen, y la
     * ficha simplemente no enseña la sección.
     */
    inflections: z.record(z.string(), z.array(z.string())).default({}),
});
export type Shard = z.infer<typeof Shard>;

/**
 * Versión del formato del manifiesto.
 *
 * Sirve para dos cosas a la vez: describe la forma del fichero y es la clave con
 * la que el navegador invalida los shards guardados. Subirla obliga a volver a
 * descargar, que es exactamente lo que hay que hacer cuando el dataset cambia de
 * forma.
 *
 * v1: `languages`, un diccionario por idioma.
 * v2: `dictionaries`, varios diccionarios por idioma (monolingüe y bilingües).
 * v3: acepciones sin duplicar, tabla de flexiones por lema e `index.json`.
 */
export const MANIFEST_VERSION = 3;

/**
 * Un diccionario concreto del dataset.
 *
 * `language` y `glossLanguage` son distintos a propósito: un diccionario
 * francés-inglés tiene las palabras en francés y las definiciones en inglés, y
 * la interfaz necesita saberlo para nombrarlo bien y para no prometer
 * definiciones en un idioma que no da.
 */
export const DictionaryInfo = z.object({
    /** Idioma de las palabras (código ISO). */
    language: z.string(),
    /** Idioma en el que están escritas las definiciones. */
    glossLanguage: z.string(),
    /** Nombre en su propio idioma ("Français"), para el selector. */
    name: z.string(),
    words: z.number(),
    forms: z.number(),
    bytes: z.number(),
});
export type DictionaryInfo = z.infer<typeof DictionaryInfo>;

export const Manifest = z.object({
    version: z.number(),
    generatedAt: z.string(),
    shardCount: z.number(),
    /** Clave = identificador del diccionario = carpeta bajo `static/data/`. */
    dictionaries: z.record(z.string(), DictionaryInfo),
    source: z.string(),
    license: z.string(),
});
export type Manifest = z.infer<typeof Manifest>;

/** Un diccionario con su identificador, que en el manifiesto es la clave. */
export type Dictionary = DictionaryInfo & { id: string };

/** Si el diccionario define en el mismo idioma de las palabras. */
export function isMonolingual(dictionary: DictionaryInfo): boolean {
    return dictionary.language === dictionary.glossLanguage;
}
