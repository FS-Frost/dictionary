/**
 * Genera el dataset offline que se empaqueta en `static/data/`.
 *
 * Entrada: los volcados JSONL de wiktextract (kaikki.org) más una lista de
 * frecuencia por idioma. Salida: shards JSON servibles como estáticos.
 *
 * El volcado crudo pesa gigabytes y GitHub Pages no lo aguantaría, así que aquí
 * se recorta a las N palabras más frecuentes y se podan los campos que la UI no
 * usa (traducciones a 100 idiomas, categorías, offsets de negritas...). Ese
 * recorte es la diferencia entre 1,4 GB y unas decenas de MB.
 *
 * Uso:
 *   bun run scripts/build-dataset.ts --lang es --input <es.jsonl.gz> --freq <es_50k.txt>
 *
 * Es deliberadamente un paso manual: el volcado cambia una vez por semana y no
 * queremos descargar gigabytes en cada build de CI. La salida se commitea.
 */

import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join } from "node:path";

import { normalizeKey, shardIdForKey, SHARD_COUNT } from "../src/lib/dictionary/key";
import {
    MANIFEST_VERSION,
    type DictionaryInfo,
    type Manifest,
    type Meaning,
    type Shard,
    type Word,
} from "../src/lib/dictionary/types";

/** Palabras por idioma. Sube el tamaño del repo de forma casi lineal. */
const DEFAULT_TOP_N = 30_000;

/** Acepciones por categoría gramatical. Wiktionary llega a tener 40; nadie lee tantas. */
const MAX_DEFINITIONS_PER_POS = 8;

/** Ejemplos por acepción. Uno basta para dar contexto. */
const MAX_EXAMPLES_PER_SENSE = 1;

const MAX_SYNONYMS = 8;

/** Formas por lema. Los verbos españoles pasan de 50 y nadie las lee todas. */
const MAX_INFLECTIONS = 40;
const MAX_EXAMPLE_LENGTH = 240;

/**
 * Orden en que se muestran las categorías gramaticales.
 *
 * wiktextract emite las entradas en el orden del wiki, que no es el orden útil:
 * "water" empezaba por un caserío de Devon porque el topónimo venía antes que el
 * sustantivo. Los nombres propios, prefijos y sufijos van al final.
 */
const POS_ORDER = [
    "noun",
    "verb",
    "adj",
    "adv",
    "pron",
    "num",
    "det",
    "article",
    "prep",
    "conj",
    "intj",
    "particle",
    "phrase",
    "proverb",
    "name",
    "prefix",
    "suffix",
    "infix",
    "abbrev",
    "symbol",
    "character",
    "romanization",
];

/**
 * Funde las acepciones que repiten glosa.
 *
 * Wiktionary desglosa una misma definición en subacepciones que sólo se
 * distinguen por el ejemplo. Al aplanarlas, `water` salía con 16 acepciones de
 * las que sólo 13 eran distintas: la misma frase tres veces seguidas. Se
 * conserva la primera y se le acumulan los ejemplos de las demás.
 */
function mergeDuplicateDefinitions(definitions: Meaning["definitions"]): Meaning["definitions"] {
    const byGloss = new Map<string, Meaning["definitions"][number] & { examples: string[] }>();

    for (const definition of definitions) {
        const existing = byGloss.get(definition.definition);

        if (!existing) {
            byGloss.set(definition.definition, {
                ...definition,
                examples: definition.example ? [definition.example] : [],
            });

            continue;
        }

        if (definition.example && !existing.examples.includes(definition.example)) {
            existing.examples.push(definition.example);
        }

        for (const synonym of definition.synonyms) {
            if (!existing.synonyms.includes(synonym)) existing.synonyms.push(synonym);
        }

        for (const antonym of definition.antonyms) {
            if (!existing.antonyms.includes(antonym)) existing.antonyms.push(antonym);
        }
    }

    return [...byGloss.values()].map(({ examples, ...definition }) => ({
        ...definition,
        // Un solo ejemplo por acepción sigue siendo la regla; la fusión sólo
        // evita perder el mejor cuando la primera subacepción no traía ninguno.
        example: examples[0] ?? "",
    }));
}

function countDefinitions(word: Word): number {
    return word.meanings.reduce((total, meaning) => total + meaning.definitions.length, 0);
}

function posRank(pos: string): number {
    const index = POS_ORDER.indexOf(pos);
    return index === -1 ? POS_ORDER.indexOf("phrase") : index;
}

const OUTPUT_ROOT = join(import.meta.dirname, "..", "static", "data");

const SOURCE = "kaikki.org (wiktextract) — Wiktionary";
const LICENSE = "CC BY-SA 4.0";

type KaikkiSense = {
    glosses?: string[];
    raw_glosses?: string[];
    examples?: { text?: string }[];
    synonyms?: { word?: string }[];
    antonyms?: { word?: string }[];
    tags?: string[];
};

type KaikkiEntry = {
    word?: string;
    pos?: string;
    pos_title?: string;
    lang_code?: string;
    senses?: KaikkiSense[];
    sounds?: { ipa?: string; audio?: string; mp3_url?: string; ogg_url?: string }[];
    etymology_texts?: string[];
    forms?: { form?: string; tags?: string[] }[];
    synonyms?: { word?: string }[];
    antonyms?: { word?: string }[];
};

/**
 * Dos formatos de entrada, porque las fuentes buenas no coinciden en uno solo:
 *
 * - `kaikki`: el volcado crudo de wiktextract. Una línea por palabra Y categoría
 *   gramatical, con acepciones, ejemplos y etimología. Es el que da los
 *   diccionarios monolingües (es, en).
 * - `compact`: los JSON Lines de tdulcet/compact-dictionaries, ya podados. Una
 *   línea por palabra, con las glosas **en inglés**. De ahí salen los bilingües.
 */
type InputFormat = "kaikki" | "compact";

type Args = {
    /** Identificador del diccionario; también el directorio bajo `static/data/`. */
    id: string;
    /** Idioma de las palabras. */
    lang: string;
    /** Idioma en el que están escritas las definiciones. */
    gloss: string;
    /** Nombre en su propio idioma ("Français"), para el selector. */
    name: string;
    format: InputFormat;
    input: string;
    freq: string;
    topN: number;
};

function parseArgs(argv: string[]): Args {
    const get = (flag: string): string | undefined => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : undefined;
    };

    const lang = get("--lang");
    const input = get("--input");
    const freq = get("--freq");
    const format = (get("--format") ?? "kaikki") as InputFormat;

    if (!lang) {
        throw new Error("falta --lang <código>");
    }

    if (format !== "kaikki" && format !== "compact") {
        throw new Error("--format debe ser 'kaikki' o 'compact'");
    }

    if (!input || !freq) {
        throw new Error("faltan --input <jsonl[.gz]> y/o --freq <lista.txt>");
    }

    const gloss = get("--gloss") ?? lang;

    return {
        // Un diccionario monolingüe se llama como su idioma ("es"); uno bilingüe
        // lleva los dos ("fr-en"), porque pueden convivir varios del mismo idioma.
        id: get("--id") ?? (gloss === lang ? lang : `${lang}-${gloss}`),
        lang,
        gloss,
        name: get("--name") ?? lang,
        format,
        input,
        freq,
        topN: Number(get("--top") ?? DEFAULT_TOP_N),
    };
}

/**
 * Lista de frecuencia de hermitdave/FrequencyWords: "palabra cuenta" por línea,
 * ya ordenada de mayor a menor. Sólo nos interesa el conjunto de las top N.
 */
async function loadFrequencyList(path: string, topN: number): Promise<Set<string>> {
    const raw = await readFile(path, "utf8");
    const keys = new Set<string>();

    for (const line of raw.split("\n")) {
        const word = line.split(" ")[0];
        if (!word) continue;

        const key = normalizeKey(word);
        if (key.length === 0) continue;

        keys.add(key);
        if (keys.size >= topN) break;
    }

    return keys;
}

function pickPhonetics(entry: KaikkiEntry): Word["phonetics"] {
    const phonetics: Word["phonetics"] = [];

    for (const sound of entry.sounds ?? []) {
        const text = sound.ipa ?? "";
        const audio = sound.mp3_url ?? sound.ogg_url ?? "";

        if (!text && !audio) continue;

        phonetics.push({ text, audio });
        if (phonetics.length >= 3) break;
    }

    return phonetics;
}

function pickWords(items: { word?: string }[] | undefined, limit: number): string[] {
    if (!items) return [];

    const out: string[] = [];

    for (const item of items) {
        if (!item.word) continue;
        if (out.includes(item.word)) continue;

        out.push(item.word);
        if (out.length >= limit) break;
    }

    return out;
}

/**
 * Convierte una línea de kaikki (una palabra + una categoría gramatical) en un
 * `Meaning`. Devuelve null si no aporta ninguna glosa aprovechable.
 */
function toMeaning(entry: KaikkiEntry, language: string): Meaning | null {
    const definitions: Meaning["definitions"] = [];

    for (const sense of entry.senses ?? []) {
        const gloss = sense.raw_glosses?.[0] ?? sense.glosses?.[0];
        if (!gloss) continue;

        const examples = (sense.examples ?? [])
            .map((e) => e.text ?? "")
            .filter((text) => text.length > 0 && text.length <= MAX_EXAMPLE_LENGTH)
            .slice(0, MAX_EXAMPLES_PER_SENSE);

        definitions.push({
            definition: gloss,
            example: examples[0] ?? "",
            synonyms: pickWords(sense.synonyms, MAX_SYNONYMS),
            antonyms: pickWords(sense.antonyms, MAX_SYNONYMS),
        });

        if (definitions.length >= MAX_DEFINITIONS_PER_POS) break;
    }

    if (definitions.length === 0) return null;

    // El volcado español titula las categorías en español ("Sustantivo femenino");
    // el inglés sólo trae el código ("noun"). Preferimos el título cuando existe.
    const partOfSpeech = (language === "es" ? entry.pos_title : entry.pos) ?? entry.pos ?? "";

    return { partOfSpeech, definitions: mergeDuplicateDefinitions(definitions) };
}

/**
 * Una línea de compact-dictionaries. Las claves son de una letra para ahorrar
 * espacio en ficheros de decenas de MB.
 */
type CompactEntry = {
    /** La palabra. La clave es la cadena vacía, sí. */
    ""?: string;
    /** Categorías gramaticales del término. */
    p?: string[];
    /** Definiciones. */
    d?: string[];
    /** Flexiones. */
    f?: string[];
    s?: string[];
    n?: string[];
    /** Transcripción IPA. */
    i?: string;
    /** Fichero de audio en Commons, ruta relativa a `.../commons/`. */
    a?: string;
};

/** Las grabaciones de Commons se referencian por ruta relativa, no por URL. */
const COMMONS_ROOT = "https://upload.wikimedia.org/wikipedia/commons/";

/**
 * Convierte una entrada compacta en la forma que consume la UI.
 *
 * Aquí se pierde precisión y conviene saberlo: `p` son las categorías del
 * término y `d` sus definiciones, pero **no van en paralelo** — una entrada
 * puede traer dos categorías y una sola definición. Como no hay forma de
 * atribuir cada glosa a su categoría, se emite un único `Meaning` con las
 * categorías juntas en vez de inventarse un reparto.
 */
function compactToWord(entry: CompactEntry): Word | null {
    const word = entry[""];
    if (!word) return null;

    const definitions = (entry.d ?? [])
        .filter((definition) => definition.length > 0)
        .slice(0, MAX_DEFINITIONS_PER_POS)
        .map((definition) => ({
            definition,
            // El formato compacto no conserva ejemplos de uso.
            example: "",
            synonyms: (entry.s ?? []).slice(0, MAX_SYNONYMS),
            antonyms: (entry.n ?? []).slice(0, MAX_SYNONYMS),
        }));

    if (definitions.length === 0) return null;

    const ipa = entry.i ?? "";
    const audio = entry.a ? `${COMMONS_ROOT}${entry.a}` : "";

    return {
        word,
        phonetic: ipa || null,
        phonetics: ipa || audio ? [{ text: ipa, audio }] : [],
        // El formato compacto no conserva etimologías.
        origin: null,
        meanings: [
            {
                partOfSpeech: (entry.p ?? []).join(", "),
                definitions: mergeDuplicateDefinitions(definitions),
            },
        ],
        source: "offline",
    };
}

async function build(args: Args): Promise<void> {
    const { id, lang, input, freq, topN, format } = args;

    console.log(`[${id}] cargando lista de frecuencia (top ${topN.toLocaleString()})...`);
    const wanted = await loadFrequencyList(freq, topN);
    console.log(`[${id}] ${wanted.size.toLocaleString()} claves objetivo`);

    // `posCodes` corre en paralelo a `meanings` sólo para poder ordenarlas al
    // final; se descarta antes de serializar.
    type BuildWord = Word & { posCodes: string[] };

    const words = new Map<string, BuildWord>();
    const forms = new Map<string, string>();

    /**
     * Lema -> sus formas tal y como se escriben.
     *
     * `forms` guarda la clave NORMALIZADA, que sirve para encontrar "cantó" pero
     * no para enseñarlo (la clave es "canto", sin tilde). Para mostrarlas hay
     * que conservar la grafía real.
     */
    const spellings = new Map<string, Set<string>>();

    function rememberSpelling(canonical: string, form: string): void {
        const existing = spellings.get(canonical);

        if (existing) {
            existing.add(form);
            return;
        }

        spellings.set(canonical, new Set([form]));
    }

    let lines = 0;
    let matched = 0;

    // Los volcados de kaikki vienen comprimidos; los de compact-dictionaries, no.
    const raw = createReadStream(input);
    const stream = input.endsWith(".gz") ? raw.pipe(createGunzip()) : raw;
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
        lines++;
        if (lines % 250_000 === 0) {
            console.log(`[${id}]   ${lines.toLocaleString()} líneas, ${words.size.toLocaleString()} palabras`);
        }

        if (line.length === 0) continue;

        if (format === "compact") {
            let compact: CompactEntry;
            try {
                compact = JSON.parse(line);
            } catch {
                continue;
            }

            const compactWord = compact[""];
            if (!compactWord) continue;

            const compactKey = normalizeKey(compactWord);
            if (compactKey.length === 0 || !wanted.has(compactKey)) continue;

            const converted = compactToWord(compact);
            if (!converted) continue;

            matched++;

            // Una línea por palabra: no hay que fusionar categorías como en kaikki.
            words.set(compactWord, { ...converted, posCodes: [compact.p?.[0] ?? ""] });

            for (const form of compact.f ?? []) {
                const formKey = normalizeKey(form);
                if (formKey.length === 0 || formKey === compactKey) continue;

                rememberSpelling(compactWord, form);

                if (forms.has(formKey)) continue;

                forms.set(formKey, compactWord);
            }

            continue;
        }

        let entry: KaikkiEntry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }

        if (entry.lang_code !== lang) continue;

        const word = entry.word;
        if (!word) continue;

        const key = normalizeKey(word);
        if (key.length === 0 || !wanted.has(key)) continue;

        const meaning = toMeaning(entry, lang);
        if (!meaning) continue;

        matched++;

        const existing = words.get(word);

        if (existing) {
            existing.meanings.push(meaning);
            existing.posCodes.push(entry.pos ?? "");

            if (existing.phonetics.length === 0) {
                existing.phonetics = pickPhonetics(entry);
                existing.phonetic = existing.phonetics[0]?.text || null;
            }

            if (!existing.origin && entry.etymology_texts?.[0]) {
                existing.origin = entry.etymology_texts[0];
            }
        } else {
            const phonetics = pickPhonetics(entry);

            words.set(word, {
                word,
                phonetic: phonetics[0]?.text || null,
                phonetics,
                origin: entry.etymology_texts?.[0] ?? null,
                meanings: [meaning],
                source: "offline",
                posCodes: [entry.pos ?? ""],
            });
        }

        // Las flexiones apuntan al lema para que "aguas" encuentre "agua".
        for (const form of entry.forms ?? []) {
            if (!form.form) continue;

            const formKey = normalizeKey(form.form);
            if (formKey.length === 0 || formKey === key) continue;

            rememberSpelling(word, form.form);

            if (forms.has(formKey)) continue;

            forms.set(formKey, word);
        }
    }

    console.log(`[${id}] ${lines.toLocaleString()} líneas leídas, ${matched.toLocaleString()} coincidencias`);
    console.log(`[${id}] ${words.size.toLocaleString()} palabras, ${forms.size.toLocaleString()} flexiones`);

    // Una flexión sólo sirve si su lema quedó en el dataset y no pisa una palabra real.
    const entryKeys = new Set([...words.keys()].map(normalizeKey));
    const usableForms = new Map<string, string>();

    for (const [formKey, canonical] of forms) {
        if (entryKeys.has(formKey)) continue;
        if (!words.has(canonical)) continue;

        usableForms.set(formKey, canonical);
    }

    console.log(`[${id}] ${usableForms.size.toLocaleString()} flexiones utilizables`);

    // Mapas, no objetos: hay palabras reales que chocan con el prototipo de Object
    // ("constructor", "toString"), y `{}[key] ??= []` no asigna en esos casos.
    const shardEntries: Map<string, Word[]>[] = Array.from({ length: SHARD_COUNT }, () => new Map());
    const shardForms: Map<string, string>[] = Array.from({ length: SHARD_COUNT }, () => new Map());

    for (const [word, build] of words) {
        const key = normalizeKey(word);
        const bucket = shardEntries[shardIdForKey(key)];

        const { posCodes, ...entry } = build;

        entry.meanings = build.meanings
            .map((meaning, i) => ({ meaning, rank: posRank(posCodes[i] ?? "") }))
            .sort((a, b) => a.rank - b.rank)
            .map((item) => item.meaning);

        const existing = bucket.get(key);
        if (existing) {
            existing.push(entry);
        } else {
            bucket.set(key, [entry]);
        }
    }

    // Dentro de una clave conviven homógrafos que sólo difieren en mayúsculas
    // ("water" y "Water", el caserío de Devon). El nombre propio no puede salir
    // primero: se prioriza la forma en minúsculas y, a igualdad, la más rica.
    for (const bucket of shardEntries) {
        for (const entries of bucket.values()) {
            if (entries.length < 2) continue;

            entries.sort((a, b) => {
                const aLower = a.word === a.word.toLowerCase() ? 0 : 1;
                const bLower = b.word === b.word.toLowerCase() ? 0 : 1;
                if (aLower !== bLower) return aLower - bLower;

                return countDefinitions(b) - countDefinitions(a);
            });
        }
    }

    for (const [formKey, canonical] of usableForms) {
        shardForms[shardIdForKey(formKey)].set(formKey, canonical);
    }

    // Las flexiones se guardan en el shard del LEMA, no en el de cada forma: se
    // consultan al mostrar la ficha del lema, que es el shard que ya está en
    // memoria en ese momento.
    const shardInflections: Map<string, string[]>[] = Array.from(
        { length: SHARD_COUNT },
        () => new Map(),
    );

    for (const [canonical, set] of spellings) {
        if (!words.has(canonical)) continue;

        const key = normalizeKey(canonical);
        const list = [...set].filter((form) => form !== canonical).sort();
        if (list.length === 0) continue;

        shardInflections[shardIdForKey(key)].set(key, list.slice(0, MAX_INFLECTIONS));
    }

    const shards: Shard[] = Array.from({ length: SHARD_COUNT }, (_, id) => ({
        entries: Object.fromEntries(shardEntries[id]),
        forms: Object.fromEntries(shardForms[id]),
        inflections: Object.fromEntries(shardInflections[id]),
    }));

    const outputDir = join(OUTPUT_ROOT, id);
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });

    let bytes = 0;

    for (let id = 0; id < SHARD_COUNT; id++) {
        const payload = JSON.stringify(shards[id]);
        bytes += Buffer.byteLength(payload);
        await writeFile(join(outputDir, `${id}.json`), payload, "utf8");
    }

    // Índice alfabético en un fichero aparte.
    //
    // Es lo que permite hojear y autocompletar SIN haberse descargado el
    // diccionario entero: unos cientos de KB frente a decenas de MB. No puede
    // salir de un shard suelto porque las palabras se reparten por hash.
    const collator = new Intl.Collator(args.lang, { sensitivity: "base" });
    const index = [...words.keys()].sort((a, b) => collator.compare(a, b) || a.localeCompare(b));

    const indexPayload = JSON.stringify(index);
    await writeFile(join(outputDir, "index.json"), indexPayload, "utf8");

    console.log(
        `[${id}] escritos ${SHARD_COUNT} shards, ${(bytes / 1024 / 1024).toFixed(1)} MB` +
            ` + índice de ${index.length.toLocaleString()} palabras` +
            ` (${(Buffer.byteLength(indexPayload) / 1024).toFixed(0)} KB)`,
    );

    await updateManifest(args, {
        language: args.lang,
        glossLanguage: args.gloss,
        name: args.name,
        words: words.size,
        forms: usableForms.size,
        bytes,
    });
}

/**
 * El manifiesto es acumulativo: cada diccionario se genera por separado, así que
 * hay que releerlo y fusionar en vez de sobrescribir.
 *
 * Versión 2: la clave pasó de `languages` a `dictionaries`, porque ya puede
 * haber más de un diccionario para el mismo idioma (uno monolingüe y uno
 * bilingüe). La versión también invalida la caché de shards del navegador, que
 * es justo lo que hace falta cuando cambia la forma del dataset.
 */
async function updateManifest(args: Args, info: DictionaryInfo): Promise<void> {
    const path = join(OUTPUT_ROOT, "manifest.json");

    let dictionaries: Manifest["dictionaries"] = {};

    try {
        const existing = JSON.parse(await readFile(path, "utf8")) as Partial<Manifest>;
        dictionaries = existing.dictionaries ?? {};
    } catch {
        // Primera generación: se parte de un manifiesto vacío.
    }

    dictionaries[args.id] = info;

    const manifest: Manifest = {
        version: MANIFEST_VERSION,
        generatedAt: new Date().toISOString(),
        shardCount: SHARD_COUNT,
        dictionaries,
        source: SOURCE,
        license: LICENSE,
    };

    await mkdir(OUTPUT_ROOT, { recursive: true });
    await writeFile(path, JSON.stringify(manifest, null, 2), "utf8");

    console.log(`[${args.id}] manifiesto actualizado`);
}

await build(parseArgs(process.argv.slice(2)));
