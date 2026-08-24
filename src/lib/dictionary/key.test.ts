import { describe, expect, it } from "vitest";

import { fnv1a, normalizeKey, shardIdForKey, shardIdForWord, SHARD_COUNT } from "./key";

describe("normalizeKey", () => {
    it("pasa a minúsculas y recorta espacios", () => {
        expect(normalizeKey("  Agua  ")).toBe("agua");
    });

    it("quita los acentos para que se pueda buscar sin teclearlos", () => {
        expect(normalizeKey("corazón")).toBe("corazon");
        expect(normalizeKey("ÁRBOL")).toBe("arbol");
    });

    it("hace colisionar la eñe con la ene, que es el precio de buscar sin acentos", () => {
        expect(normalizeKey("niño")).toBe("nino");
    });

    it("quita la puntuación pero conserva apóstrofos y guiones internos", () => {
        expect(normalizeKey("¿qué?")).toBe("que");
        expect(normalizeKey("don't")).toBe("don't");
        expect(normalizeKey("well-known")).toBe("well-known");
    });

    it("colapsa los espacios internos de las locuciones", () => {
        expect(normalizeKey("a   pesar   de")).toBe("a pesar de");
    });

    it("devuelve cadena vacía cuando no queda nada aprovechable", () => {
        expect(normalizeKey("   ")).toBe("");
        expect(normalizeKey("¡!¿?")).toBe("");
    });
});

describe("fnv1a", () => {
    it("es determinista", () => {
        expect(fnv1a("agua")).toBe(fnv1a("agua"));
    });

    it("distingue entradas distintas", () => {
        expect(fnv1a("agua")).not.toBe(fnv1a("aguas"));
    });

    it("se mantiene dentro de 32 bits sin signo", () => {
        for (const text of ["", "a", "agua", "supercalifragilisticoespialidoso"]) {
            const hash = fnv1a(text);

            expect(hash).toBeGreaterThanOrEqual(0);
            expect(hash).toBeLessThanOrEqual(0xffffffff);
            expect(Number.isInteger(hash)).toBe(true);
        }
    });
});

describe("shardIdForKey", () => {
    it("siempre cae dentro del rango de shards", () => {
        for (const word of ["agua", "water", "niño", "a pesar de", "z"]) {
            const id = shardIdForKey(normalizeKey(word));

            expect(id).toBeGreaterThanOrEqual(0);
            expect(id).toBeLessThan(SHARD_COUNT);
        }
    });

    it("manda las variantes acentuadas al mismo shard, o el offline no las encontraría", () => {
        expect(shardIdForWord("corazón")).toBe(shardIdForWord("corazon"));
        expect(shardIdForWord("Corazón")).toBe(shardIdForWord("corazon"));
    });

    it("reparte de forma razonablemente uniforme", () => {
        const counts = new Array<number>(SHARD_COUNT).fill(0);

        for (let i = 0; i < 20_000; i++) {
            counts[shardIdForKey(`palabra-${i}`)]++;
        }

        const expected = 20_000 / SHARD_COUNT;

        // Un hash sano no debería desviarse ni de lejos del doble de la media.
        for (const count of counts) {
            expect(count).toBeGreaterThan(expected * 0.5);
            expect(count).toBeLessThan(expected * 1.5);
        }
    });
});
