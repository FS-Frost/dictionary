import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Word } from "./types";

const lookupOffline = vi.fn();
const raeLookup = vi.fn();
const dictionaryApiLookup = vi.fn();
const freeDictionaryLookup = vi.fn();

vi.mock("./offline/dataset", () => ({
    lookupOffline: (...args: unknown[]) => lookupOffline(...args),
    // `index.ts` también importa estas para buscar en otros diccionarios; aquí
    // sólo se prueba la cadena de fuentes, así que devuelven vacío.
    listDictionaries: async () => [],
    loadWordIndex: async () => null,
}));

vi.mock("./sources/raeApi", () => ({
    id: "rae",
    supports: (language: string) => language === "es",
    lookup: (...args: unknown[]) => raeLookup(...args),
}));

vi.mock("./sources/dictionaryApiDev", () => ({
    id: "dictionaryapi",
    supports: (language: string) => language === "en",
    lookup: (...args: unknown[]) => dictionaryApiLookup(...args),
}));

vi.mock("./sources/freeDictionaryApi", () => ({
    id: "freedictionaryapi",
    supports: () => true,
    lookup: (...args: unknown[]) => freeDictionaryLookup(...args),
}));

const { lookup } = await import("./index");

function makeWord(word: string): Word {
    return {
        word,
        phonetic: null,
        phonetics: [],
        origin: null,
        meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "def", example: "", synonyms: [], antonyms: [] }] }],
    };
}

const NOT_FOUND = { status: "not-found" as const, words: [] };
const ERROR = { status: "error" as const, words: [] };

beforeEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` borra las llamadas pero no deshace los `spyOn`: sin esto, el
    // navigator.onLine=false de un test se filtra a los siguientes.
    vi.restoreAllMocks();

    lookupOffline.mockResolvedValue([]);
    raeLookup.mockResolvedValue(NOT_FOUND);
    dictionaryApiLookup.mockResolvedValue(NOT_FOUND);
    freeDictionaryLookup.mockResolvedValue(NOT_FOUND);
});

describe("lookup", () => {
    it("responde desde el dataset sin tocar la red", async () => {
        lookupOffline.mockResolvedValue([makeWord("agua")]);

        const result = await lookup("agua", "es");

        expect(result.status).toBe("ok");
        expect(result.source).toBe("offline");
        expect(result.offline).toBe(true);
        expect(raeLookup).not.toHaveBeenCalled();
        expect(freeDictionaryLookup).not.toHaveBeenCalled();
    });

    it("en español consulta la RAE antes que Wiktionary, porque define en español", async () => {
        raeLookup.mockResolvedValue({ status: "ok", words: [makeWord("agua")] });

        const result = await lookup("agua", "es");

        expect(result.source).toBe("rae");
        expect(freeDictionaryLookup).not.toHaveBeenCalled();
    });

    it("pasa a la siguiente fuente cuando la primera falla", async () => {
        raeLookup.mockResolvedValue(ERROR);
        freeDictionaryLookup.mockResolvedValue({ status: "ok", words: [makeWord("agua")] });

        const result = await lookup("agua", "es");

        expect(result.status).toBe("ok");
        expect(result.source).toBe("freedictionaryapi");
    });

    it("pasa a la siguiente fuente cuando la primera lanza", async () => {
        raeLookup.mockRejectedValue(new Error("sin red"));
        freeDictionaryLookup.mockResolvedValue({ status: "ok", words: [makeWord("agua")] });

        const result = await lookup("agua", "es");

        expect(result.source).toBe("freedictionaryapi");
    });

    it("en inglés no consulta la RAE", async () => {
        dictionaryApiLookup.mockResolvedValue({ status: "ok", words: [makeWord("water")] });

        const result = await lookup("water", "en");

        expect(result.source).toBe("dictionaryapi");
        expect(raeLookup).not.toHaveBeenCalled();
    });

    it("distingue 'no existe' de 'las fuentes fallaron'", async () => {
        expect((await lookup("qwertyuiop", "es")).status).toBe("not-found");

        raeLookup.mockResolvedValue(ERROR);
        freeDictionaryLookup.mockResolvedValue(ERROR);

        expect((await lookup("agua", "es")).status).toBe("error");
    });

    it("sin conexión no intenta salir a la red", async () => {
        vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

        const result = await lookup("agua", "es");

        expect(result.status).toBe("not-found");
        expect(raeLookup).not.toHaveBeenCalled();
        expect(freeDictionaryLookup).not.toHaveBeenCalled();
    });

    it("sin conexión sigue respondiendo desde el dataset", async () => {
        vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
        lookupOffline.mockResolvedValue([makeWord("agua")]);

        const result = await lookup("agua", "es");

        expect(result.status).toBe("ok");
        expect(result.offline).toBe(true);
    });

    it("ignora una búsqueda vacía sin consultar nada", async () => {
        const result = await lookup("   ", "es");

        expect(result.status).toBe("not-found");
        expect(lookupOffline).not.toHaveBeenCalled();
        expect(raeLookup).not.toHaveBeenCalled();
    });

    it("recorta los espacios antes de buscar", async () => {
        lookupOffline.mockResolvedValue([makeWord("agua")]);

        const result = await lookup("  agua  ", "es");

        expect(lookupOffline).toHaveBeenCalledWith("agua", "es");
        expect(result.word).toBe("agua");
    });

    it("permite saltarse el dataset para depurar", async () => {
        lookupOffline.mockResolvedValue([makeWord("agua")]);
        raeLookup.mockResolvedValue({ status: "ok", words: [makeWord("agua")] });

        const result = await lookup("agua", "es", { skipOffline: true });

        expect(lookupOffline).not.toHaveBeenCalled();
        expect(result.source).toBe("rae");
    });
});
