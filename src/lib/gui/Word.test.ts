import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Word as WordModel } from "$lib/dictionary";
import Word from "./Word.svelte";

function makeWord(overrides: Partial<WordModel> = {}): WordModel {
    return {
        word: "agua",
        phonetic: "[ˈaɣ̞wa]",
        phonetics: [{ text: "[ˈaɣ̞wa]", audio: "" }],
        origin: "Del latín aqua",
        meanings: [
            {
                partOfSpeech: "Sustantivo femenino",
                definitions: [
                    {
                        definition: "Sustancia transparente",
                        example: "Un vaso de agua fresca",
                        synonyms: ["líquido"],
                        antonyms: [],
                    },
                ],
            },
        ],
        source: "offline",
        ...overrides,
    };
}

describe("Word", () => {
    it("muestra la palabra, su transcripción y su definición", () => {
        render(Word, { language: "es", word: makeWord() });

        expect(screen.getByText("agua")).toBeInTheDocument();
        expect(screen.getByText("[ˈaɣ̞wa]")).toBeInTheDocument();
        expect(screen.getByText(/Sustancia/)).toBeInTheDocument();
    });

    it("muestra el ejemplo de uso que trae el dataset", () => {
        render(Word, { language: "es", word: makeWord() });

        expect(screen.getByText(/Un vaso de agua fresca/)).toBeInTheDocument();
    });

    it("omite el ejemplo cuando la acepción no lo trae", () => {
        const word = makeWord();
        word.meanings[0].definitions[0].example = "";

        render(Word, { language: "es", word });

        expect(screen.queryByText(/«/)).not.toBeInTheDocument();
    });

    it("muestra el origen etimológico", () => {
        render(Word, { language: "es", word: makeWord() });

        expect(screen.getByText("Del latín aqua")).toBeInTheDocument();
    });

    it("omite el bloque de origen cuando no hay etimología", () => {
        render(Word, { language: "es", word: makeWord({ origin: null }) });

        expect(screen.queryByText("Origen")).not.toBeInTheDocument();
    });

    it("busca el sinónimo al pulsarlo", async () => {
        const onSearch = vi.fn();
        const user = userEvent.setup();

        render(Word, { language: "es", word: makeWord(), onSearch });

        await user.click(screen.getByRole("button", { name: "líquido" }));

        expect(onSearch).toHaveBeenCalledWith("líquido");
    });

    it("busca una palabra de la definición al pulsarla", async () => {
        const onSearch = vi.fn();
        const user = userEvent.setup();

        render(Word, { language: "es", word: makeWord(), onSearch });

        await user.click(screen.getByText("Sustancia"));

        expect(onSearch).toHaveBeenCalledWith("Sustancia");
    });

    it("ofrece escuchar la pronunciación", () => {
        render(Word, { language: "es", word: makeWord() });

        expect(screen.getByRole("button", { name: "Escuchar pronunciación" })).toBeInTheDocument();
    });

    it("rotula en inglés cuando el idioma es inglés", () => {
        render(Word, {
            language: "en",
            word: makeWord({ word: "water", origin: "From Old English" }),
        });

        expect(screen.getByText("Origin")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Listen pronunciation" })).toBeInTheDocument();
    });
    /*
     * Regresión: los sinónimos usaban la clase `.badge` de Bootstrap, que fija
     * `color: #fff`. Sobre el fondo claro del chip el texto quedaba invisible.
     * El chip es un control propio, así que no debe llevar esa clase.
     */
    it("no pinta los sinónimos con la clase .badge de Bootstrap", () => {
        render(Word, { language: "es", word: makeWord() });

        const synonym = screen.getByRole("button", { name: "líquido" });

        expect(synonym).not.toHaveClass("badge");
        expect(synonym).toHaveClass("chip");
    });

    it("muestra los antónimos y los hace buscables", async () => {
        const onSearch = vi.fn();
        const user = userEvent.setup();

        const word = makeWord();
        word.meanings[0].definitions[0].antonyms = ["sequedad"];

        render(Word, { language: "es", word, onSearch });

        expect(screen.getByText("Antónimos:")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "sequedad" }));

        expect(onSearch).toHaveBeenCalledWith("sequedad");
    });

    it("omite el bloque de antónimos cuando no los hay", () => {
        render(Word, { language: "es", word: makeWord() });

        expect(screen.queryByText("Antónimos:")).not.toBeInTheDocument();
    });
});
