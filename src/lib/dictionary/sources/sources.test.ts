import { afterEach, describe, expect, it, vi } from "vitest";

import * as dictionaryApiDev from "./dictionaryApiDev";
import * as freeDictionaryApi from "./freeDictionaryApi";
import * as raeApi from "./raeApi";

function stubResponse(body: unknown, status = 200): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
            status === 200 ? Response.json(body) : new Response(JSON.stringify(body), { status }),
        ),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("dictionaryApiDev", () => {
    it("sólo declara soporte para inglés, porque en español devuelve 404 hasta para 'agua'", () => {
        expect(dictionaryApiDev.supports("en")).toBe(true);
        expect(dictionaryApiDev.supports("es")).toBe(false);
    });

    it("normaliza una respuesta y la marca con su origen", async () => {
        stubResponse([
            {
                word: "water",
                phonetic: "/ˈwɔːtə/",
                phonetics: [{ text: "/ˈwɔːtə/", audio: "https://example.test/water.mp3" }],
                meanings: [
                    {
                        partOfSpeech: "noun",
                        definitions: [{ definition: "A clear liquid", example: "drink water" }],
                    },
                ],
            },
        ]);

        const result = await dictionaryApiDev.lookup("water", "en");

        expect(result.status).toBe("ok");
        expect(result.words[0].source).toBe("dictionaryapi");
        expect(result.words[0].meanings[0].definitions[0].definition).toBe("A clear liquid");
        expect(result.words[0].phonetics[0].audio).toBe("https://example.test/water.mp3");
    });

    it("rellena los campos que la API omite", async () => {
        stubResponse([{ word: "water", meanings: [] }]);

        const result = await dictionaryApiDev.lookup("water", "en");

        expect(result.words[0].phonetic).toBeNull();
        expect(result.words[0].phonetics).toEqual([]);
    });

    it("traduce un 404 a 'no encontrada', no a error", async () => {
        stubResponse({ title: "No Definitions Found" }, 404);

        expect((await dictionaryApiDev.lookup("qwerty", "en")).status).toBe("not-found");
    });

    it("trata un 500 como error de la fuente", async () => {
        stubResponse({}, 500);

        expect((await dictionaryApiDev.lookup("water", "en")).status).toBe("error");
    });

    it("rechaza una respuesta con forma inesperada en vez de romper la UI", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        stubResponse({ unexpected: true });

        expect((await dictionaryApiDev.lookup("water", "en")).status).toBe("error");
    });
});

describe("freeDictionaryApi", () => {
    it("aplana las entradas por categoría gramatical", async () => {
        stubResponse({
            word: "water",
            entries: [
                {
                    partOfSpeech: "noun",
                    pronunciations: [{ type: "ipa", text: "/ˈwɔ.tɚ/" }],
                    senses: [{ definition: "An inorganic compound", examples: ["cold water"] }],
                    etymology: "From Old English wæter",
                },
                {
                    partOfSpeech: "verb",
                    pronunciations: [],
                    senses: [{ definition: "To pour water" }],
                },
            ],
        });

        const result = await freeDictionaryApi.lookup("water", "en");

        expect(result.status).toBe("ok");
        expect(result.words[0].meanings.map((meaning) => meaning.partOfSpeech)).toEqual(["noun", "verb"]);
        expect(result.words[0].meanings[0].definitions[0].example).toBe("cold water");
        expect(result.words[0].origin).toBe("From Old English wæter");
        expect(result.words[0].source).toBe("freedictionaryapi");
    });

    it("se queda con unas pocas transcripciones IPA, no con la docena que devuelve", async () => {
        stubResponse({
            word: "water",
            entries: [
                {
                    partOfSpeech: "noun",
                    pronunciations: Array.from({ length: 12 }, (_, i) => ({
                        type: "ipa",
                        text: `/ipa-${i}/`,
                    })),
                    senses: [{ definition: "A liquid" }],
                },
            ],
        });

        const result = await freeDictionaryApi.lookup("water", "en");

        expect(result.words[0].phonetics).toHaveLength(3);
        expect(result.words[0].phonetic).toBe("/ipa-0/");
    });

    it("descarta las categorías que se quedan sin definiciones", async () => {
        stubResponse({
            word: "water",
            entries: [
                { partOfSpeech: "noun", pronunciations: [], senses: [] },
                { partOfSpeech: "verb", pronunciations: [], senses: [{ definition: "To pour water" }] },
            ],
        });

        const result = await freeDictionaryApi.lookup("water", "en");

        expect(result.words[0].meanings).toHaveLength(1);
        expect(result.words[0].meanings[0].partOfSpeech).toBe("verb");
    });

    it("trata una respuesta sin entradas como palabra no encontrada", async () => {
        stubResponse({ word: "qwerty", entries: [] });

        expect((await freeDictionaryApi.lookup("qwerty", "en")).status).toBe("not-found");
    });
});

describe("raeApi", () => {
    it("sólo declara soporte para español", () => {
        expect(raeApi.supports("es")).toBe(true);
        expect(raeApi.supports("en")).toBe(false);
    });

    it("agrupa por categoría gramatical las acepciones que la RAE lista en plano", async () => {
        stubResponse({
            ok: true,
            data: {
                word: "agua",
                meanings: [
                    {
                        origin: { raw: "Del lat. aqua." },
                        senses: [
                            { category: "noun", description: "Líquido transparente", usage: "", synonyms: null, antonyms: null },
                            { category: "noun", description: "Lluvia", usage: "", synonyms: ["lluvia"], antonyms: null },
                            { category: "interjection", description: "¡Cuidado!", usage: "", synonyms: null, antonyms: null },
                        ],
                    },
                ],
            },
        });

        const result = await raeApi.lookup("agua", "es");

        expect(result.status).toBe("ok");
        expect(result.words[0].meanings).toHaveLength(2);
        expect(result.words[0].meanings[0].definitions).toHaveLength(2);
        expect(result.words[0].meanings[0].definitions[1].synonyms).toEqual(["lluvia"]);
        expect(result.words[0].origin).toBe("Del lat. aqua.");
        expect(result.words[0].source).toBe("rae");
    });

    it("convierte los sinónimos nulos en listas vacías", async () => {
        stubResponse({
            ok: true,
            data: {
                word: "agua",
                meanings: [
                    { origin: null, senses: [{ category: "noun", description: "Líquido", usage: "", synonyms: null, antonyms: null }] },
                ],
            },
        });

        const result = await raeApi.lookup("agua", "es");

        expect(result.words[0].meanings[0].definitions[0].synonyms).toEqual([]);
        expect(result.words[0].origin).toBeNull();
    });

    it("trata el 429 de cuota agotada como error, para que el router pruebe otra fuente", async () => {
        stubResponse({ ok: false }, 429);

        expect((await raeApi.lookup("agua", "es")).status).toBe("error");
    });

    it("descarta acepciones sin descripción", async () => {
        stubResponse({
            ok: true,
            data: {
                word: "agua",
                meanings: [
                    {
                        origin: null,
                        senses: [
                            { category: "noun", description: "", usage: "", synonyms: null, antonyms: null },
                            { category: "noun", description: "Líquido", usage: "", synonyms: null, antonyms: null },
                        ],
                    },
                ],
            },
        });

        const result = await raeApi.lookup("agua", "es");

        expect(result.words[0].meanings[0].definitions).toHaveLength(1);
    });

    it("no consulta la red para un idioma que no soporta", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        expect((await raeApi.lookup("water", "en")).status).toBe("not-found");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
