import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LanguageStatus } from "$lib/dictionary";
import DictionarySelect from "./DictionarySelect.svelte";

function makeDictionary(overrides: Partial<LanguageStatus>): LanguageStatus {
    return {
        id: "es",
        language: "es",
        glossLanguage: "es",
        name: "Español",
        words: 100,
        forms: 10,
        bytes: 1024,
        downloaded: false,
        ...overrides,
    };
}

const DICTIONARIES: LanguageStatus[] = [
    makeDictionary({ id: "es" }),
    makeDictionary({ id: "en", language: "en", glossLanguage: "en", name: "English" }),
    makeDictionary({ id: "fr-en", language: "fr", glossLanguage: "en", name: "Français" }),
    makeDictionary({
        id: "de-en",
        language: "de",
        glossLanguage: "en",
        name: "Deutsch",
        downloaded: true,
    }),
];

function setup(value = "es") {
    const onSelect = vi.fn();

    render(DictionarySelect, {
        dictionaries: DICTIONARIES,
        value,
        uiLanguage: "es",
        onSelect,
    });

    return onSelect;
}

async function open(): Promise<void> {
    await userEvent.click(screen.getByRole("button"));
}

describe("DictionarySelect", () => {
    it("muestra el diccionario activo cuando está cerrado", () => {
        setup("fr-en");

        expect(screen.getByRole("button")).toHaveTextContent("Français → inglés");
    });

    it("filtra por el nombre nativo", async () => {
        setup();
        await open();

        await userEvent.type(screen.getByRole("combobox"), "deu");

        const options = screen.getAllByRole("option");
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent("Deutsch");
    });

    /* Quien escribe "fr" espera el francés aunque en pantalla ponga "Français". */
    it("filtra también por código de idioma", async () => {
        setup();
        await open();

        await userEvent.type(screen.getByRole("combobox"), "fr");

        expect(screen.getAllByRole("option")).toHaveLength(1);
        expect(screen.getAllByRole("option")[0]).toHaveTextContent("Français");
    });

    it("avisa cuando nada coincide", async () => {
        setup();
        await open();

        await userEvent.type(screen.getByRole("combobox"), "klingon");

        expect(screen.queryAllByRole("option")).toHaveLength(0);
        expect(screen.getByText("Ningún diccionario coincide")).toBeInTheDocument();
    });

    it("selecciona con el ratón", async () => {
        const onSelect = setup();
        await open();

        await userEvent.click(screen.getByText("Deutsch → inglés"));

        expect(onSelect).toHaveBeenCalledWith("de-en");
    });

    it("se maneja con el teclado: filtrar, bajar y Enter", async () => {
        const onSelect = setup();
        await open();

        const input = screen.getByRole("combobox");
        await userEvent.type(input, "e");
        await userEvent.keyboard("{ArrowDown}{Enter}");

        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("Escape cierra sin seleccionar", async () => {
        const onSelect = setup();
        await open();

        await userEvent.keyboard("{Escape}");

        expect(onSelect).not.toHaveBeenCalled();
        expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("marca los diccionarios ya descargados", async () => {
        setup();
        await open();

        expect(screen.getByText("descargado")).toBeInTheDocument();
    });
});
