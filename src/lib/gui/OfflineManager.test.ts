import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LanguageStatus } from "$lib/dictionary";
import OfflineManager from "./OfflineManager.svelte";
import { getToasts, resetToasts } from "$lib/toast.svelte";

const statuses: Record<string, LanguageStatus> = {
    es: {
        id: "es",
        language: "es",
        glossLanguage: "es",
        name: "Español",
        downloaded: false,
        bytes: 19 * 1024 * 1024,
        words: 30_000,
        forms: 1000,
    },
    en: {
        id: "en",
        language: "en",
        glossLanguage: "en",
        name: "English",
        downloaded: true,
        bytes: 36 * 1024 * 1024,
        words: 30_000,
        forms: 1000,
    },
};

const deleteLanguage = vi.fn(async () => {});
const prefetchLanguage = vi.fn(async () => "complete" as const);

// Se mockea la capa de datos entera: lo que se prueba aquí es qué ofrece la UI
// según el estado, no la descarga, que ya tiene sus propios tests.
vi.mock("$lib/dictionary", async (importOriginal) => {
    const actual = await importOriginal<typeof import("$lib/dictionary")>();

    return {
        ...actual,
        getLanguageStatus: vi.fn(async (id: string) => statuses[id] ?? null),
        listDictionaries: vi.fn(async () => Object.values(statuses)),
        deleteLanguage: (...args: unknown[]) => deleteLanguage(...(args as [])),
        prefetchLanguage: (...args: unknown[]) => prefetchLanguage(...(args as [])),
    };
});

async function openPanel(): Promise<void> {
    await userEvent.click(await screen.findByRole("button", { name: "Gestionar diccionarios" }));
}

beforeEach(() => {
    resetToasts();
    deleteLanguage.mockClear();
    prefetchLanguage.mockClear();
});

describe("OfflineManager", () => {
    /*
     * La línea de estado lleva la etiqueta corta; la larga queda como título
     * accesible. Está siempre en pantalla y antes costaba 52 px por encima de
     * la definición.
     */
    it("ofrece descargar el diccionario actual cuando no está en el dispositivo", async () => {
        render(OfflineManager, { dictionaryId: "es", uiLanguage: "es" });

        const button = await screen.findByTitle("Descargar para usar sin conexión");

        expect(button).toHaveTextContent("Descargar");
        expect(button).toHaveTextContent("19 MB");
    });

    it("no ofrece descargar un diccionario que ya está descargado", async () => {
        render(OfflineManager, { dictionaryId: "en", uiLanguage: "en" });

        expect(await screen.findByText(/available offline/)).toBeInTheDocument();
        expect(screen.queryByTitle("Download for offline use")).not.toBeInTheDocument();
    });

    it("el panel muestra los dos idiomas, no sólo el que se consulta", async () => {
        render(OfflineManager, { dictionaryId: "es", uiLanguage: "es" });
        await openPanel();

        expect(screen.getByText("Español")).toBeInTheDocument();
        expect(screen.getByText("English")).toBeInTheDocument();
    });

    it("permite eliminar un idioma descargado desde el panel", async () => {
        vi.stubGlobal("confirm", vi.fn(() => true));

        render(OfflineManager, { dictionaryId: "es", uiLanguage: "es" });
        await openPanel();

        await userEvent.click(screen.getByRole("button", { name: /Eliminar/ }));

        expect(deleteLanguage).toHaveBeenCalledWith("en");

        vi.unstubAllGlobals();
    });

    it("no elimina nada si el usuario cancela la confirmación", async () => {
        vi.stubGlobal("confirm", vi.fn(() => false));

        render(OfflineManager, { dictionaryId: "es", uiLanguage: "es" });
        await openPanel();

        await userEvent.click(screen.getByRole("button", { name: /Eliminar/ }));

        expect(deleteLanguage).not.toHaveBeenCalled();

        vi.unstubAllGlobals();
    });

    it("avisa por toast al eliminar un idioma, diciendo cuánto libera", async () => {
        vi.stubGlobal("confirm", vi.fn(() => true));

        render(OfflineManager, { dictionaryId: "es", uiLanguage: "es" });
        await openPanel();

        await userEvent.click(screen.getByRole("button", { name: /Eliminar/ }));

        const toast = getToasts().at(-1);
        expect(toast?.message).toBe("Diccionario eliminado: English");
        // El tamaño se lee antes de refrescar el estado; si se leyera después,
        // aquí no habría detalle que enseñar.
        expect(toast?.detail).toBe("+36 MB");

        vi.unstubAllGlobals();
    });

    it("avisa por toast cuando la descarga termina", async () => {
        render(OfflineManager, { dictionaryId: "es", uiLanguage: "es" });

        await userEvent.click(await screen.findByTitle("Descargar para usar sin conexión"));

        expect(getToasts().at(-1)?.message).toBe("Diccionario listo sin conexión: Español");
    });

    /*
     * Regresión: el botón llamaba a `download(language)`, que es el idioma de la
     * INTERFAZ. Con "Français → inglés" seleccionado descargaba el inglés.
     */
    it("descarga el diccionario activo, no el idioma de la interfaz", async () => {
        render(OfflineManager, { dictionaryId: "es", uiLanguage: "en" });

        await userEvent.click(await screen.findByTitle("Download for offline use"));

        expect(prefetchLanguage).toHaveBeenCalledWith("es", expect.anything());
    });
});
