import { expect, test, type Page } from "@playwright/test";

/**
 * Comprueba la promesa central del proyecto: que el diccionario funciona con la
 * red caída. Lo que se verifica no es que exista un dataset, sino que buscando
 * una palabra que nunca se buscó antes, sin conexión, aparece su definición.
 */

async function search(page: Page, lang: string, word: string): Promise<void> {
    await page.goto(`/?lang=${lang}&word=${word}`, { waitUntil: "load" });
    await page.waitForSelector(".card-title");
}

function definition(page: Page) {
    return page.locator(".card-text").first();
}

/**
 * `serviceWorker.ready` sólo garantiza que hay un worker activo, no que esté
 * controlando esta pestaña: la primera visita carga antes de que el worker se
 * active. Cortar la red en ese hueco deja la navegación sin quien la sirva.
 */
async function waitForServiceWorkerControl(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;

        if (navigator.serviceWorker.controller) return;

        await new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
                once: true,
            });
        });
    });
}

test.describe("búsqueda con conexión", () => {
    test("define una palabra en inglés desde el dataset empaquetado", async ({ page }) => {
        await search(page, "en", "water");

        await expect(page.locator(".card-title span").first()).toHaveText("water");
        await expect(definition(page)).toContainText("inorganic compound");
        await expect(page.locator(".source")).toContainText("offline");
    });

    test("define una palabra en español EN ESPAÑOL, no traducida", async ({ page }) => {
        await search(page, "es", "agua");

        const text = await definition(page).innerText();

        expect(text.toLowerCase()).not.toBe("water");
        await expect(definition(page)).toContainText("Sustancia");
    });

    test("encuentra una palabra escrita sin acentos", async ({ page }) => {
        await search(page, "es", "corazon");

        await expect(page.locator(".card-title span").first()).toHaveText("corazón");
    });

    test("resuelve una forma flexionada", async ({ page }) => {
        await search(page, "es", "libros");

        await expect(definition(page)).toContainText("libro");
    });
});

test.describe("sin conexión", () => {
    test("define palabras nunca buscadas tras descargar el idioma", async ({ page, context }) => {
        await search(page, "es", "agua");

        await page.click("button:has-text('Descargar')");
        await expect(page.locator(".ready")).toBeVisible({ timeout: 180_000 });

        await waitForServiceWorkerControl(page);

        await context.setOffline(true);

        try {
            // Palabras que no se buscaron antes: sólo pueden venir del dataset local.
            await search(page, "es", "ventana");
            await expect(definition(page)).toContainText("muro");

            await search(page, "es", "libro");
            await expect(definition(page)).toContainText("hojas");

            await expect(page.locator(".source")).toContainText("sin conexión");
        } finally {
            await context.setOffline(false);
        }
    });

    test("recuerda que el idioma ya está descargado al recargar", async ({ page, context }) => {
        await search(page, "es", "agua");

        await page.click("button:has-text('Descargar')");
        await expect(page.locator(".ready")).toBeVisible({ timeout: 180_000 });

        await search(page, "es", "agua");

        await expect(page.locator("div.offline")).toContainText("disponible sin conexión");
        await expect(page.locator("button:has-text('Descargar')")).toHaveCount(0);

        void context;
    });
});

test("no depende de ningún servidor externo", async ({ page }) => {
    const external: string[] = [];

    page.on("request", (request) => {
        if (!request.url().includes("localhost:5000")) external.push(request.url());
    });

    await search(page, "en", "water");

    // Bootstrap y los iconos van servidos desde el propio sitio: si volvieran a
    // un CDN, la app se quedaría sin estilos justo cuando no hay red.
    expect(external).toEqual([]);
});
