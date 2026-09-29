import { describe, expect, it, vi } from "vitest";

import { dayKey, randomWord, wordOfTheDay } from "./wordOfTheDay";

const WORDS = Array.from({ length: 500 }, (_, i) => `palabra${i}`);

describe("wordOfTheDay", () => {
    /*
     * Determinista a propósito: así es la misma en el móvil y en el portátil, y
     * sobrevive a borrar los datos del sitio. Guardar una elección aleatoria
     * necesitaría un servidor, que aquí no hay.
     */
    it("da la misma palabra para el mismo día y diccionario", () => {
        const date = new Date(2026, 2, 14);

        expect(wordOfTheDay(WORDS, "es", date)).toBe(wordOfTheDay(WORDS, "es", date));
    });

    it("cambia de un día para otro", () => {
        const today = wordOfTheDay(WORDS, "es", new Date(2026, 2, 14));
        const tomorrow = wordOfTheDay(WORDS, "es", new Date(2026, 2, 15));

        expect(today).not.toBe(tomorrow);
    });

    /* Si no, al cambiar de idioma saldría la palabra de la misma posición. */
    it("cambia entre diccionarios el mismo día", () => {
        const date = new Date(2026, 2, 14);

        expect(wordOfTheDay(WORDS, "es", date)).not.toBe(wordOfTheDay(WORDS, "fr-en", date));
    });

    /*
     * Con un hash pobre, días consecutivos caen en posiciones vecinas y la
     * palabra del día es siempre de la misma letra.
     */
    it("reparte por todo el índice en días consecutivos", () => {
        const positions = Array.from({ length: 30 }, (_, i) =>
            WORDS.indexOf(wordOfTheDay(WORDS, "es", new Date(2026, 0, i + 1)) ?? ""),
        );

        const distinct = new Set(positions);
        expect(distinct.size).toBeGreaterThan(25);

        // Y no se agolpan al principio del índice.
        expect(Math.max(...positions)).toBeGreaterThan(WORDS.length / 2);
    });

    it("devuelve null si no hay índice", () => {
        expect(wordOfTheDay([], "es")).toBeNull();
    });
});

describe("randomWord", () => {
    it("devuelve una palabra del índice", () => {
        expect(WORDS).toContain(randomWord(WORDS));
    });

    it("devuelve null si no hay índice", () => {
        expect(randomWord([])).toBeNull();
    });
});

describe("dayKey", () => {
    it("usa la fecha local, no UTC", () => {
        expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    });
});
