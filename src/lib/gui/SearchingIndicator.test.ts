import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import SearchingIndicator from "./SearchingIndicator.svelte";

describe("SearchingIndicator", () => {
    /*
     * El esqueleto es decorativo, pero el estado "buscando" no: sin texto y sin
     * `aria-busy`, quien no ve la pantalla no sabe que hay algo en marcha.
     */
    it("anuncia que está buscando aunque el dibujo sea decorativo", () => {
        const { container } = render(SearchingIndicator, { language: "es" });

        expect(screen.getByText("Buscando...")).toBeInTheDocument();
        expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    });

    it("rotula en inglés cuando la interfaz está en inglés", () => {
        render(SearchingIndicator, { language: "en" });

        expect(screen.getByText("Searching...")).toBeInTheDocument();
    });

    /* Las barras son ruido para un lector de pantalla: no deben leerse. */
    it("oculta el dibujo a las tecnologías de asistencia", () => {
        const { container } = render(SearchingIndicator, { language: "es" });

        expect(container.querySelector(".card-body")?.getAttribute("aria-hidden")).toBe("true");
    });
});
