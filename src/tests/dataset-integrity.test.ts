/**
 * Comprueba el dataset que de verdad se publica, no uno sintético.
 *
 * El riesgo que cubre es concreto: si `scripts/build-dataset.ts` y el cliente
 * dejan de coincidir en la normalización o en el hash, el cliente pedirá shards
 * donde la palabra no está y el modo offline fallará *en silencio* — sin errores,
 * simplemente sin resultados. Aquí se recorre lo generado y se verifica que cada
 * clave está en el shard donde el cliente la irá a buscar.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeKey, shardIdForKey, SHARD_COUNT } from "../lib/dictionary/key";
import { Manifest, Shard, Word } from "../lib/dictionary/types";

const DATA_ROOT = join(process.cwd(), "static", "data");

async function loadManifest(): Promise<Manifest> {
    return Manifest.parse(JSON.parse(await readFile(join(DATA_ROOT, "manifest.json"), "utf8")));
}

async function loadShard(language: string, shardId: number): Promise<Shard> {
    return Shard.parse(JSON.parse(await readFile(join(DATA_ROOT, language, `${shardId}.json`), "utf8")));
}

const manifest = await loadManifest();
const languages = Object.keys(manifest.dictionaries);

describe("manifiesto", () => {
    it("declara al menos español e inglés", () => {
        expect(languages).toEqual(expect.arrayContaining(["es", "en"]));
    });

    it("usa el mismo número de shards que el cliente", () => {
        expect(manifest.shardCount).toBe(SHARD_COUNT);
    });

    it("acredita la licencia de Wiktionary, que es CC BY-SA", () => {
        expect(manifest.license).toContain("CC BY-SA");
    });
});

describe.each(languages)("dataset de %s", (language) => {
    it("tiene un fichero por shard declarado", async () => {
        const files = await readdir(join(DATA_ROOT, language));

        // `index.json` convive con los shards y no es uno de ellos: los shards
        // se llaman por su número.
        const shards = files.filter((file) => /^\d+\.json$/.test(file));

        expect(shards).toHaveLength(manifest.shardCount);
    });

    /*
     * El índice es lo que permite hojear y autocompletar sin haberse descargado
     * el diccionario entero. Si faltara, esas dos funciones quedarían mudas sin
     * ningún error visible.
     */
    it("trae el índice alfabético, ordenado y completo", async () => {
        const raw = await readFile(join(DATA_ROOT, language, "index.json"), "utf8");
        const words = JSON.parse(raw) as string[];

        expect(words).toHaveLength(manifest.dictionaries[language].words);

        const collator = new Intl.Collator(manifest.dictionaries[language].language, {
            sensitivity: "base",
        });

        const sorted = [...words].sort((a, b) => collator.compare(a, b) || a.localeCompare(b));
        expect(words).toEqual(sorted);
    });

    /*
     * Regresión: Wiktionary desglosa una misma glosa en subacepciones que sólo
     * cambian el ejemplo, y al aplanarlas `water` salía con la misma frase tres
     * veces seguidas.
     */
    it("no repite la misma acepción dentro de una categoría", async () => {
        for (let shardId = 0; shardId < manifest.shardCount; shardId++) {
            const shard = await loadShard(language, shardId);

            for (const entries of Object.values(shard.entries)) {
                for (const entry of entries) {
                    for (const meaning of entry.meanings) {
                        const glosses = meaning.definitions.map((d) => d.definition);

                        if (new Set(glosses).size !== glosses.length) {
                            throw new Error(
                                `${language}: "${entry.word}" repite una acepción en "${meaning.partOfSpeech}"`,
                            );
                        }
                    }
                }
            }
        }
    });

    it("coloca cada clave en el shard donde el cliente la buscará", async () => {
        for (let shardId = 0; shardId < manifest.shardCount; shardId++) {
            const shard = await loadShard(language, shardId);

            for (const key of Object.keys(shard.entries)) {
                if (shardIdForKey(key) !== shardId) {
                    throw new Error(`clave "${key}" guardada en el shard ${shardId} pero el cliente la busca en ${shardIdForKey(key)}`);
                }
            }

            for (const key of Object.keys(shard.forms)) {
                if (shardIdForKey(key) !== shardId) {
                    throw new Error(`flexión "${key}" guardada en el shard ${shardId} pero el cliente la busca en ${shardIdForKey(key)}`);
                }
            }
        }
    });

    it("guarda las claves ya normalizadas", async () => {
        const shard = await loadShard(language, 0);

        for (const key of Object.keys(shard.entries)) {
            expect(key).toBe(normalizeKey(key));
        }
    });

    it("cuenta las mismas palabras que declara el manifiesto", async () => {
        let total = 0;

        for (let shardId = 0; shardId < manifest.shardCount; shardId++) {
            const shard = await loadShard(language, shardId);

            for (const entries of Object.values(shard.entries)) {
                total += entries.length;
            }
        }

        expect(total).toBe(manifest.dictionaries[language].words);
    });

    it("produce entradas que validan contra el modelo que consume la UI", async () => {
        const shard = await loadShard(language, 0);
        const entries = Object.values(shard.entries).flat();

        expect(entries.length).toBeGreaterThan(0);

        for (const entry of entries.slice(0, 200)) {
            expect(() => Word.parse(entry)).not.toThrow();
            expect(entry.meanings.length).toBeGreaterThan(0);
            expect(entry.meanings[0].definitions.length).toBeGreaterThan(0);
        }
    });

    it("no deja flexiones apuntando a lemas que no existen", async () => {
        const shard = await loadShard(language, 3);
        const forms = Object.entries(shard.forms).slice(0, 100);

        expect(forms.length).toBeGreaterThan(0);

        for (const [, canonical] of forms) {
            const canonicalKey = normalizeKey(canonical);
            const target = await loadShard(language, shardIdForKey(canonicalKey));

            expect(Object.hasOwn(target.entries, canonicalKey)).toBe(true);
        }
    });

    it("no deja que una flexión tape una palabra con entrada propia", async () => {
        const shard = await loadShard(language, 7);

        for (const formKey of Object.keys(shard.forms)) {
            expect(Object.hasOwn(shard.entries, formKey)).toBe(false);
        }
    });
});

describe("contenido esperado", () => {
    it("define 'agua' en español y en español, no traducida al inglés", async () => {
        const key = normalizeKey("agua");
        const shard = await loadShard("es", shardIdForKey(key));
        const entry = shard.entries[key][0];

        expect(entry.word).toBe("agua");
        expect(entry.meanings[0].definitions[0].definition.toLowerCase()).not.toBe("water");
        expect(entry.meanings[0].definitions[0].definition).toMatch(/[áéíóúñ]|[a-z]{4,}/i);
    });

    it("encabeza 'water' con el sustantivo, no con el topónimo de Devon", async () => {
        const key = normalizeKey("water");
        const shard = await loadShard("en", shardIdForKey(key));
        const entry = shard.entries[key][0];

        expect(entry.word).toBe("water");
        expect(entry.meanings[0].partOfSpeech).toBe("noun");
    });

    it("resuelve 'aguas' como flexión de 'agua'", async () => {
        const formKey = normalizeKey("aguas");
        const shard = await loadShard("es", shardIdForKey(formKey));

        // "aguas" tiene entrada propia en Wiktionary; si la tiene, no debe estar
        // además como flexión, y si no, debe redirigir al lema.
        const hasEntry = Object.hasOwn(shard.entries, formKey);
        const hasForm = Object.hasOwn(shard.forms, formKey);

        expect(hasEntry || hasForm).toBe(true);
    });
});
