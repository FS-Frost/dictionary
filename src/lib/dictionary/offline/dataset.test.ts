import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeKey, shardIdForKey, SHARD_COUNT } from "../key";
import type { Manifest, Shard, Word } from "../types";
import {
    deleteLanguage,
    getLanguageStatus,
    isLanguageDownloaded,
    loadInflections,
    loadWordIndex,
    lookupOffline,
    prefetchLanguage,
    resetDatasetCache,
} from "./dataset";
import { clearShards, resetConnection } from "./store";

const MANIFEST: Manifest = {
    version: 2,
    generatedAt: "2026-01-01T00:00:00.000Z",
    shardCount: SHARD_COUNT,
    dictionaries: {
        es: { language: "es", glossLanguage: "es", name: "Español", words: 2, forms: 1, bytes: 0 },
    },
    source: "test",
    license: "CC BY-SA 4.0",
};

function makeWord(word: string, definition: string): Word {
    return {
        word,
        phonetic: null,
        phonetics: [],
        origin: null,
        meanings: [{ partOfSpeech: "noun", definitions: [{ definition, example: "", synonyms: [], antonyms: [] }] }],
        source: "offline",
    };
}

/**
 * Construye los shards igual que lo hace el generador, para que los tests
 * ejerciten el mismo reparto que produce `scripts/build-dataset.ts`.
 */
function buildShards(
    words: Word[],
    forms: Record<string, string> = {},
    inflections: Record<string, string[]> = {},
): Shard[] {
    const shards: Shard[] = Array.from({ length: SHARD_COUNT }, () => ({
        entries: {},
        forms: {},
        inflections: {},
    }));

    for (const [key, list] of Object.entries(inflections)) {
        shards[shardIdForKey(key)].inflections[key] = list;
    }

    for (const word of words) {
        const key = normalizeKey(word.word);
        const shard = shards[shardIdForKey(key)];

        shard.entries[key] = [...(shard.entries[key] ?? []), word];
    }

    for (const [form, canonical] of Object.entries(forms)) {
        const key = normalizeKey(form);
        shards[shardIdForKey(key)].forms[key] = canonical;
    }

    return shards;
}

type Fixture = {
    /** Contenido de `index.json`; ausente = 404. */
    index?: string[];
    manifest?: Manifest | null;
    shards: Shard[];
};

let fetchCalls: string[] = [];

function installFetch(fixture: Fixture): void {
    fetchCalls = [];

    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
            const url = String(input);
            fetchCalls.push(url);

            if (url.endsWith("manifest.json")) {
                if (fixture.manifest === null) {
                    return new Response("nope", { status: 404 });
                }

                return Response.json(fixture.manifest ?? MANIFEST);
            }

            if (url.endsWith("index.json")) {
                if (!fixture.index) return new Response("nope", { status: 404 });
                return Response.json(fixture.index);
            }

            const match = url.match(/\/(\d+)\.json$/);
            if (!match) return new Response("nope", { status: 404 });

            return Response.json(fixture.shards[Number(match[1])]);
        }),
    );
}

beforeEach(async () => {
    resetDatasetCache();
    resetConnection();
    await clearShards();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("lookupOffline", () => {
    it("encuentra una palabra por su clave exacta", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        const result = await lookupOffline("agua", "es");

        expect(result).toHaveLength(1);
        expect(result[0].meanings[0].definitions[0].definition).toBe("Sustancia transparente");
    });

    it("encuentra una palabra acentuada aunque se escriba sin acentos", async () => {
        installFetch({ shards: buildShards([makeWord("corazón", "Órgano que bombea sangre")]) });

        const result = await lookupOffline("corazon", "es");

        expect(result).toHaveLength(1);
        expect(result[0].word).toBe("corazón");
    });

    it("resuelve una flexión hasta su lema", async () => {
        installFetch({
            shards: buildShards([makeWord("agua", "Sustancia transparente")], { aguas: "agua" }),
        });

        const result = await lookupOffline("aguas", "es");

        expect(result).toHaveLength(1);
        expect(result[0].word).toBe("agua");
    });

    it("sigue una flexión que vive en otro shard distinto al del lema", async () => {
        const words = [makeWord("agua", "Sustancia transparente")];
        const forms = { aguas: "agua" };

        // El test sólo es significativo si de verdad caen en shards distintos.
        expect(shardIdForKey("aguas")).not.toBe(shardIdForKey("agua"));

        installFetch({ shards: buildShards(words, forms) });

        const result = await lookupOffline("aguas", "es");

        expect(result[0].word).toBe("agua");
    });

    it("prioriza la entrada que coincide exactamente con lo tecleado", async () => {
        const shards = buildShards([
            makeWord("Water", "Caserío de Devon"),
            makeWord("water", "Compuesto inorgánico"),
        ]);

        installFetch({ shards });

        const result = await lookupOffline("water", "es");

        expect(result[0].word).toBe("water");
        expect(result).toHaveLength(2);
    });

    it("no confunde una palabra con una propiedad heredada de Object", async () => {
        installFetch({ shards: buildShards([]) });

        // Sin el guardia de `Object.hasOwn`, esto devolvería la función Object().
        const result = await lookupOffline("constructor", "es");

        expect(result).toEqual([]);
    });

    it("devuelve vacío si la palabra no está en el dataset", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        expect(await lookupOffline("supercalifragilistico", "es")).toEqual([]);
    });

    it("devuelve vacío para el idioma que el manifiesto no declara", async () => {
        installFetch({ shards: buildShards([makeWord("water", "An inorganic compound")]) });

        expect(await lookupOffline("water", "en")).toEqual([]);
    });

    it("no se cae si el manifiesto no está disponible", async () => {
        installFetch({ manifest: null, shards: buildShards([]) });

        expect(await lookupOffline("agua", "es")).toEqual([]);
    });

    it("descarta un shard con forma inválida en vez de propagar basura", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string) => {
                if (String(input).endsWith("manifest.json")) return Response.json(MANIFEST);
                return Response.json({ entries: "esto no es un objeto" });
            }),
        );

        const errors = vi.spyOn(console, "error").mockImplementation(() => {});

        expect(await lookupOffline("agua", "es")).toEqual([]);
        expect(errors).toHaveBeenCalled();

        errors.mockRestore();
    });

    it("encuentra una palabra cuyo shard nunca se visitó, si se descargó el idioma entero", async () => {
        installFetch({ shards: buildShards([makeWord("libro", "Conjunto de hojas")]) });

        await prefetchLanguage("es");

        // Se corta cualquier acceso a la red: sólo puede salir de IndexedDB.
        resetDatasetCache();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string) => {
                if (String(input).endsWith("manifest.json")) return Response.json(MANIFEST);
                throw new Error("sin red");
            }),
        );

        const result = await lookupOffline("libro", "es");

        expect(result).toHaveLength(1);
        expect(result[0].word).toBe("libro");
    });

    it("cachea el shard: dos búsquedas en la misma zona sólo lo descargan una vez", async () => {
        installFetch({
            shards: buildShards([makeWord("agua", "Sustancia transparente")]),
        });

        await lookupOffline("agua", "es");
        const afterFirst = fetchCalls.filter((url) => !url.endsWith("manifest.json")).length;

        resetDatasetCache();
        await lookupOffline("agua", "es");
        const afterSecond = fetchCalls.filter((url) => !url.endsWith("manifest.json")).length;

        expect(afterFirst).toBe(1);
        // La caché en memoria se vació, así que el acierto sólo puede venir de IndexedDB.
        expect(afterSecond).toBe(1);
    });
});

describe("manifiesto", () => {
    it("usa la copia guardada cuando la red no responde", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        // Primera visita con red: el manifiesto queda persistido.
        await lookupOffline("agua", "es");
        await prefetchLanguage("es");

        resetDatasetCache();
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("sin red");
            }),
        );

        // Sin manifiesto no sabría ni qué versión de shards leer, así que esto
        // sólo puede funcionar si la copia local se usó.
        const result = await lookupOffline("agua", "es");

        expect(result).toHaveLength(1);
        expect(result[0].word).toBe("agua");
    });

    it("no inventa un manifiesto si nunca hubo red", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("sin red");
            }),
        );

        expect(await lookupOffline("agua", "es")).toEqual([]);
    });
});

describe("prefetchLanguage", () => {
    it("descarga todos los shards e informa del avance", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        const progress: number[] = [];
        const status = await prefetchLanguage("es", {
            onProgress: (done) => progress.push(done),
        });

        expect(status).toBe("complete");
        expect(progress.at(-1)).toBe(SHARD_COUNT);

        const shardRequests = fetchCalls.filter((url) => !url.endsWith("manifest.json"));
        expect(shardRequests).toHaveLength(SHARD_COUNT);
    });

    it("deja el idioma marcado como descargado", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        expect(await isLanguageDownloaded("es")).toBe(false);

        await prefetchLanguage("es");

        expect(await isLanguageDownloaded("es")).toBe(true);
    });

    it("no marca como completo si algún shard falló", async () => {
        const shards = buildShards([makeWord("agua", "Sustancia transparente")]);

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string) => {
                const url = String(input);
                if (url.endsWith("manifest.json")) return Response.json(MANIFEST);

                const shardId = Number(url.match(/\/(\d+)\.json$/)?.[1]);
                if (shardId === 5) return new Response("boom", { status: 500 });

                return Response.json(shards[shardId]);
            }),
        );

        expect(await prefetchLanguage("es")).toBe("failed");
        expect(await isLanguageDownloaded("es")).toBe(false);
    });

    it("no da por descargado un idioma distinto del que se bajó", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        await prefetchLanguage("es");

        expect(await isLanguageDownloaded("en")).toBe(false);
    });
});

describe("cancelación de la descarga", () => {
    it("no marca el idioma como descargado si se aborta a mitad", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        const controller = new AbortController();

        const status = await prefetchLanguage("es", {
            signal: controller.signal,
            // Abortar en el primer lote: lo ya bajado se conserva, pero el idioma
            // no puede darse por completo.
            onProgress: () => controller.abort(),
        });

        expect(status).toBe("cancelled");
        expect(await isLanguageDownloaded("es")).toBe(false);
    });

    it("no descarga los shards restantes tras abortar", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        const controller = new AbortController();

        await prefetchLanguage("es", {
            signal: controller.signal,
            onProgress: () => controller.abort(),
        });

        const shardRequests = fetchCalls.filter((url) => !url.endsWith("manifest.json"));
        expect(shardRequests.length).toBeLessThan(SHARD_COUNT);
    });
});

describe("deleteLanguage", () => {
    it("deja el idioma como no descargado", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        await prefetchLanguage("es");
        expect(await isLanguageDownloaded("es")).toBe(true);

        await deleteLanguage("es");

        expect(await isLanguageDownloaded("es")).toBe(false);
    });

    it("obliga a volver a la red en la siguiente búsqueda", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        await prefetchLanguage("es");
        await deleteLanguage("es");

        const before = fetchCalls.length;
        await lookupOffline("agua", "es");

        // Si la copia en memoria sobreviviera al borrado, esto no pediría nada y
        // la UI diría "sin descargar" mientras el diccionario sigue respondiendo.
        expect(fetchCalls.length).toBeGreaterThan(before);
    });
});

describe("getLanguageStatus", () => {
    it("informa del tamaño y de si está descargado", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        const before = await getLanguageStatus("es");
        expect(before?.downloaded).toBe(false);
        expect(before?.words).toBe(MANIFEST.dictionaries.es.words);

        await prefetchLanguage("es");

        const after = await getLanguageStatus("es");
        expect(after?.downloaded).toBe(true);
    });

    it("devuelve null para un idioma que el manifiesto no trae", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia transparente")]) });

        expect(await getLanguageStatus("en")).toBeNull();
    });
});

describe("loadWordIndex", () => {
    /*
     * El índice es un fichero aparte, no algo que se derive de los shards: si
     * hubiera que leerlos todos, hojear y autocompletar sólo funcionarían con el
     * diccionario entero descargado, que es justo lo que no queremos exigir para
     * mirar.
     */
    it("se baja sin necesidad de descargar el diccionario", async () => {
        installFetch({
            shards: buildShards([makeWord("agua", "Sustancia transparente")]),
            index: ["agua", "ñandú", "zapato"],
        });

        expect(await loadWordIndex("es")).toEqual(["agua", "ñandú", "zapato"]);
        expect(await isLanguageDownloaded("es")).toBe(false);
    });

    it("no lo vuelve a pedir en la segunda llamada", async () => {
        installFetch({
            shards: buildShards([makeWord("agua", "Sustancia transparente")]),
            index: ["agua"],
        });

        await loadWordIndex("es");
        resetDatasetCache();

        const before = fetchCalls.filter((url) => url.endsWith("index.json")).length;
        expect(await loadWordIndex("es")).toEqual(["agua"]);

        // Queda guardado en IndexedDB: a partir de ahí también funciona sin red.
        const after = fetchCalls.filter((url) => url.endsWith("index.json")).length;
        expect(after).toBe(before);
    });

    it("sin red y sin copia guardada no hay índice", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia")]) });

        expect(await loadWordIndex("es")).toBeNull();
    });

    it("el índice desaparece al eliminar el diccionario", async () => {
        installFetch({
            shards: buildShards([makeWord("agua", "Sustancia transparente")]),
            index: ["agua"],
        });

        await prefetchLanguage("es");
        expect(await loadWordIndex("es")).toEqual(["agua"]);

        await deleteLanguage("es");
        vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));

        expect(await loadWordIndex("es")).toBeNull();
    });
});

describe("loadInflections", () => {
    it("devuelve las formas del lema", async () => {
        installFetch({
            shards: buildShards([makeWord("cantar", "Emitir sonidos melodiosos")], {}, {
                cantar: ["canté", "cantó", "cantaban"],
            }),
        });

        expect(await loadInflections("cantar", "es")).toEqual(["canté", "cantó", "cantaban"]);
    });

    /* Los diccionarios generados antes de la v3 no traen la tabla. */
    it("devuelve vacío cuando el diccionario no la trae", async () => {
        installFetch({ shards: buildShards([makeWord("agua", "Sustancia")]) });

        expect(await loadInflections("agua", "es")).toEqual([]);
    });
});

describe("acentos y diéresis", () => {
    /*
     * Regresión: "cuidara" y "cuidará" comparten clave normalizada (la misma que
     * permite encontrar "corazón" escribiendo "corazon"), así que buscar una
     * definía también la otra. Son palabras distintas.
     */
    it("buscar con acento no define también la palabra sin acento", async () => {
        installFetch({
            shards: buildShards([
                makeWord("cuidara", "Pretérito imperfecto de subjuntivo"),
                makeWord("cuidará", "Futuro de indicativo"),
            ]),
        });

        const result = await lookupOffline("cuidará", "es");

        expect(result.map((entry) => entry.word)).toEqual(["cuidará"]);
    });

    it("y al revés", async () => {
        installFetch({
            shards: buildShards([
                makeWord("cuidara", "Pretérito imperfecto de subjuntivo"),
                makeWord("cuidará", "Futuro de indicativo"),
            ]),
        });

        const result = await lookupOffline("cuidara", "es");

        expect(result.map((entry) => entry.word)).toEqual(["cuidara"]);
    });

    it("lo mismo con diéresis", async () => {
        installFetch({
            shards: buildShards([
                makeWord("pinguino", "Grafía sin diéresis"),
                makeWord("pingüino", "Ave marina"),
            ]),
        });

        expect((await lookupOffline("pingüino", "es")).map((e) => e.word)).toEqual(["pingüino"]);
    });

    /* Pero escribir sin acentos sigue encontrando la acentuada: es la promesa. */
    it("sin acentos sigue encontrándolas todas", async () => {
        installFetch({
            shards: buildShards([makeWord("corazón", "Órgano que bombea la sangre")]),
        });

        expect((await lookupOffline("corazon", "es")).map((e) => e.word)).toEqual(["corazón"]);
    });

    /* Las mayúsculas sí se ignoran: es la misma palabra escrita de dos formas. */
    it("las mayúsculas no separan palabras", async () => {
        installFetch({
            shards: buildShards([makeWord("Water", "Caserío"), makeWord("water", "Compuesto")]),
        });

        expect((await lookupOffline("water", "es")).map((e) => e.word)).toEqual([
            "water",
            "Water",
        ]);
    });
});
