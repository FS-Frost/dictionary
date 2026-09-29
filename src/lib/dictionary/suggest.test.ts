import { beforeEach, describe, expect, it, vi } from "vitest";

import { findInOtherDictionaries, suggest } from "./index";
import { resetDatasetCache } from "./offline/dataset";
import { clearShards, resetConnection } from "./offline/store";
import { MANIFEST_VERSION, type Manifest } from "./types";

function makeManifest(ids: string[]): Manifest {
    return {
        version: MANIFEST_VERSION,
        generatedAt: "2026-01-01T00:00:00.000Z",
        shardCount: 64,
        dictionaries: Object.fromEntries(
            ids.map((id) => [
                id,
                {
                    language: id.split("-")[0],
                    glossLanguage: id.includes("-") ? "en" : id,
                    name: id,
                    words: 1,
                    forms: 0,
                    bytes: 1,
                },
            ]),
        ),
        source: "test",
        license: "CC BY-SA 4.0",
    };
}

/** `index.json` por diccionario; lo demás responde 404. */
function installIndexes(indexes: Record<string, string[]>): void {
    const manifest = makeManifest(Object.keys(indexes));

    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
            const url = String(input);

            if (url.endsWith("manifest.json")) return Response.json(manifest);

            const match = url.match(/data\/([^/]+)\/index\.json$/);
            if (match && indexes[match[1]]) return Response.json(indexes[match[1]]);

            return new Response("nope", { status: 404 });
        }),
    );
}

beforeEach(async () => {
    vi.unstubAllGlobals();
    resetDatasetCache();
    resetConnection();
    await clearShards();
});

describe("suggest", () => {
    it("sugiere por prefijo", async () => {
        installIndexes({ es: ["casa", "casar", "casero", "coche", "danza"] });

        expect(await suggest("cas", "es")).toEqual(["casa", "casar", "casero"]);
    });

    /* Quien escribe sin acentos espera encontrar la palabra acentuada. */
    it("ignora los acentos del prefijo", async () => {
        installIndexes({ es: ["camion", "camión", "campo"] });

        expect(await suggest("camion", "es")).toContain("camión");
    });

    it("respeta el límite", async () => {
        installIndexes({ es: ["caa", "cab", "cac", "cad", "cae"] });

        expect(await suggest("ca", "es", 2)).toHaveLength(2);
    });

    it("no sugiere nada con prefijo vacío", async () => {
        installIndexes({ es: ["casa"] });

        expect(await suggest("   ", "es")).toEqual([]);
    });

    it("sin índice disponible no sugiere, pero no revienta", async () => {
        installIndexes({});

        expect(await suggest("cas", "es")).toEqual([]);
    });
});

describe("findInOtherDictionaries", () => {
    /*
     * El caso que justifica que exista: con seis diccionarios, "sin resultados"
     * dejó de ser suficiente. `eau` no está en español pero sí en francés, y
     * antes había que ir probando a mano.
     */
    it("dice en qué otros diccionarios está la palabra", async () => {
        installIndexes({
            es: ["agua"],
            "fr-en": ["eau"],
            "it-en": ["eau", "acqua"],
        });

        expect(await findInOtherDictionaries("eau", "es")).toEqual(["fr-en", "it-en"]);
    });

    it("no se incluye a sí mismo", async () => {
        installIndexes({ es: ["agua"], "fr-en": ["agua"] });

        expect(await findInOtherDictionaries("agua", "es")).toEqual(["fr-en"]);
    });

    it("compara ignorando acentos y mayúsculas", async () => {
        installIndexes({ es: ["casa"], "fr-en": ["Eau"] });

        expect(await findInOtherDictionaries("eau", "es")).toEqual(["fr-en"]);
    });

    it("devuelve vacío cuando no está en ninguno", async () => {
        installIndexes({ es: ["agua"], "fr-en": ["eau"] });

        expect(await findInOtherDictionaries("xyzzy", "es")).toEqual([]);
    });
});
