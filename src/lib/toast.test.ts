import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Toaster from "$lib/gui/Toaster.svelte";
import {
    dismissToast,
    getToasts,
    resetToasts,
    showToast,
    toastError,
    toastSuccess,
} from "./toast.svelte";

beforeEach(() => {
    resetToasts();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("toast", () => {
    it("apila los avisos en orden", () => {
        showToast("uno");
        showToast("dos");

        expect(getToasts().map((toast) => toast.message)).toEqual(["uno", "dos"]);
    });

    it("se retiran solos pasado su tiempo", () => {
        vi.useFakeTimers();

        toastSuccess("hecho");
        expect(getToasts()).toHaveLength(1);

        vi.advanceTimersByTime(4000);

        expect(getToasts()).toHaveLength(0);
    });

    /* Un error hay que leerlo, y a veces actuar; un "hecho" se ve de un vistazo. */
    it("los errores duran más que los avisos normales", () => {
        vi.useFakeTimers();

        toastError("falló");

        vi.advanceTimersByTime(4000);
        expect(getToasts()).toHaveLength(1);

        vi.advanceTimersByTime(3000);
        expect(getToasts()).toHaveLength(0);
    });

    it("duración 0 lo deja fijo hasta que se cierre a mano", () => {
        vi.useFakeTimers();

        const id = showToast("fijo", { duration: 0 });

        vi.advanceTimersByTime(60_000);
        expect(getToasts()).toHaveLength(1);

        dismissToast(id);
        expect(getToasts()).toHaveLength(0);
    });

    it("una misma clave sustituye al aviso anterior en vez de apilarlo", () => {
        showToast("tema: claro", { key: "theme" });
        showToast("tema: oscuro", { key: "theme" });
        showToast("tema: sistema", { key: "theme" });

        expect(getToasts()).toHaveLength(1);
        expect(getToasts()[0].message).toBe("tema: sistema");
    });

    it("claves distintas conviven", () => {
        showToast("a", { key: "theme" });
        showToast("b", { key: "lookup" });

        expect(getToasts()).toHaveLength(2);
    });

    it("nunca muestra más de tres a la vez", () => {
        for (let i = 0; i < 6; i++) showToast(`aviso ${i}`);

        expect(getToasts()).toHaveLength(3);
        expect(getToasts()[0].message).toBe("aviso 3");
    });

    /*
     * Un aviso descartado por exceso se llevaba su temporizador vivo; al
     * dispararse, intentaba retirar algo que ya no estaba.
     */
    it("no deja temporizadores de avisos ya descartados", () => {
        vi.useFakeTimers();

        for (let i = 0; i < 6; i++) showToast(`aviso ${i}`);

        vi.advanceTimersByTime(10_000);

        expect(getToasts()).toHaveLength(0);
    });
});

describe("Toaster", () => {
    it("muestra el mensaje y su detalle", async () => {
        render(Toaster, { language: "es" });

        toastError("No respondieron", { detail: "Inténtalo de nuevo" });

        expect(await screen.findByText("No respondieron")).toBeInTheDocument();
        expect(screen.getByText("Inténtalo de nuevo")).toBeInTheDocument();
    });

    it("se puede cerrar a mano", async () => {
        render(Toaster, { language: "es" });

        showToast("adiós");

        await userEvent.click(await screen.findByRole("button", { name: "Cerrar aviso" }));

        expect(screen.queryByText("adiós")).not.toBeInTheDocument();
        expect(getToasts()).toHaveLength(0);
    });

    /*
     * Un error interrumpe al lector de pantalla (`alert`); un cambio de tema no
     * debe hacerlo (`status`). El nivel lo fija la región, así que tienen que
     * ser dos contenedores distintos.
     */
    it("anuncia los errores como alerta y el resto como estado", async () => {
        render(Toaster, { language: "es" });

        toastError("roto");
        toastSuccess("listo");

        expect(await screen.findByRole("alert")).toHaveTextContent("roto");
        expect(screen.getByRole("status")).toHaveTextContent("listo");
    });

    it("rotula el cierre en inglés cuando la interfaz está en inglés", async () => {
        render(Toaster, { language: "en" });

        showToast("hello");

        expect(await screen.findByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    });
});
