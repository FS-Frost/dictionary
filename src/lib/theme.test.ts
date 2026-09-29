import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ThemeToggle from "$lib/gui/ThemeToggle.svelte";
import { getToasts, resetToasts } from "./toast.svelte";
import { getResolvedTheme, getTheme, initTheme, setTheme, STORAGE_KEY } from "./theme.svelte";

/**
 * `matchMedia` no existe en jsdom. Se declara aquí y no en el setup global
 * porque cada test necesita fijar qué contesta el sistema.
 */
function stubSystemTheme(prefersDark: boolean): void {
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
            matches: prefersDark,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    );
}

beforeEach(() => {
    resetToasts();
    localStorage.clear();
    document.documentElement.removeAttribute("data-bs-theme");
    stubSystemTheme(false);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("theme", () => {
    it("aplica el tema elegido al documento y lo recuerda", () => {
        setTheme("dark");

        expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
        expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    });

    it("sin preferencia guardada sigue al sistema", () => {
        stubSystemTheme(true);

        initTheme();

        expect(getTheme()).toBe("auto");
        expect(getResolvedTheme()).toBe("dark");
        expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
    });

    it("una preferencia explícita gana sobre el sistema", () => {
        stubSystemTheme(true);
        localStorage.setItem(STORAGE_KEY, "light");

        initTheme();

        expect(getTheme()).toBe("light");
        expect(getResolvedTheme()).toBe("light");
    });

    it("ignora un valor guardado que no es un tema", () => {
        localStorage.setItem(STORAGE_KEY, "morado");

        initTheme();

        expect(getTheme()).toBe("auto");
    });
});

describe("ThemeToggle", () => {
    it("cicla claro → oscuro → sistema", async () => {
        localStorage.setItem(STORAGE_KEY, "light");
        initTheme();

        render(ThemeToggle, { language: "es" });

        const button = screen.getByRole("button");

        await userEvent.click(button);
        expect(getTheme()).toBe("dark");

        await userEvent.click(button);
        expect(getTheme()).toBe("auto");

        await userEvent.click(button);
        expect(getTheme()).toBe("light");
    });

    it("aplica el tema al documento al pulsar", async () => {
        localStorage.setItem(STORAGE_KEY, "light");
        initTheme();

        render(ThemeToggle, { language: "en" });

        await userEvent.click(screen.getByRole("button"));

        expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
    });

    /*
     * El botón dice DÓNDE está, no a dónde va. Con un control que cicla, un
     * botón rotulado con su destino y dibujado con su estado actual se
     * contradice, y nadie sabe en qué tema está.
     */
    it("se rotula con el tema actual y anuncia el siguiente", () => {
        localStorage.setItem(STORAGE_KEY, "light");
        initTheme();

        render(ThemeToggle, { language: "es" });

        expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
            "Tema: Claro. Cambiar a oscuro",
        );
    });

    it("avisa del cambio con un toast", async () => {
        localStorage.setItem(STORAGE_KEY, "light");
        initTheme();
        resetToasts();

        render(ThemeToggle, { language: "es" });

        await userEvent.click(screen.getByRole("button"));

        expect(getToasts()).toHaveLength(1);
        expect(getToasts()[0].message).toBe("Tema: oscuro");
    });

    it("en modo sistema el aviso dice a qué tema quedó", async () => {
        stubSystemTheme(true);
        localStorage.setItem(STORAGE_KEY, "dark");
        initTheme();
        resetToasts();

        render(ThemeToggle, { language: "es" });

        await userEvent.click(screen.getByRole("button"));

        expect(getTheme()).toBe("auto");
        expect(getToasts()[0].message).toBe("Tema: sistema (oscuro)");
    });

    it("pulsar varias veces deja un solo aviso, no una pila", async () => {
        localStorage.setItem(STORAGE_KEY, "light");
        initTheme();
        resetToasts();

        render(ThemeToggle, { language: "es" });

        const button = screen.getByRole("button");
        await userEvent.click(button);
        await userEvent.click(button);
        await userEvent.click(button);

        expect(getToasts()).toHaveLength(1);
    });
});
