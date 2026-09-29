import { beforeEach, describe, expect, it } from "vitest";

import {
    addFavorite,
    addToHistory,
    clearFavorites,
    clearHistory,
    isFavorite,
    readFavorites,
    readHistory,
    removeFavorite,
    resetConnection,
} from "./store";

beforeEach(async () => {
    resetConnection();
    await clearHistory();
    await clearFavorites();
});

describe("historial", () => {
    it("guarda lo consultado, de lo más reciente a lo más antiguo", async () => {
        await addToHistory("es", "agua");
        await addToHistory("es", "libro");

        const history = await readHistory();

        expect(history.map((entry) => entry.word)).toEqual(["libro", "agua"]);
    });

    /* Volver a mirar una palabra la sube, no la duplica. */
    it("no duplica una palabra ya vista", async () => {
        await addToHistory("es", "agua");
        await addToHistory("es", "libro");
        await addToHistory("es", "agua");

        const history = await readHistory();

        expect(history).toHaveLength(2);
        expect(history[0].word).toBe("agua");
    });

    /* La misma palabra en dos diccionarios son dos entradas distintas. */
    it("distingue la misma palabra en diccionarios distintos", async () => {
        await addToHistory("es", "arte");
        await addToHistory("it-en", "arte");

        expect(await readHistory()).toHaveLength(2);
    });

    it("se puede vaciar", async () => {
        await addToHistory("es", "agua");
        await clearHistory();

        expect(await readHistory()).toEqual([]);
    });
});

describe("favoritos", () => {
    it("guarda y quita", async () => {
        await addFavorite("es", "agua");
        expect(await isFavorite("es", "agua")).toBe(true);

        await removeFavorite("es", "agua");
        expect(await isFavorite("es", "agua")).toBe(false);
    });

    it("no confunde diccionarios", async () => {
        await addFavorite("es", "arte");

        expect(await isFavorite("it-en", "arte")).toBe(false);
        expect(await readFavorites()).toHaveLength(1);
    });
});
