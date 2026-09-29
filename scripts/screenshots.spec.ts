import { expect, test, type Page } from "@playwright/test";

/**
 * Genera las imágenes del README.
 *
 * No es un test: es una herramienta que vive aquí porque necesita exactamente lo
 * mismo que los e2e (el build servido y un Chromium). Se ejecuta a mano:
 *
 *   bunx playwright test scripts/screenshots.spec.ts --config playwright.config.ts
 *
 * Por eso está fuera de `tests/e2e/`, que es lo que corre en CI.
 */

const OUT = "static/img";

// Ancho suficiente para las dos columnas: por debajo de 62rem el índice se
// pliega, y la gracia de la app es justo que convivan.
const VIEWPORT = { width: 1180, height: 900 };

async function prepare(page: Page, theme: "light" | "dark"): Promise<void> {
    await page.setViewportSize(VIEWPORT);

    // El tema se fija antes de cargar para que no se vea el cambio a mitad.
    await page.addInitScript((value) => {
        localStorage.setItem("theme", value);
    }, theme);
}

test("preview: búsqueda", async ({ page }) => {
    await prepare(page, "light");

    // Un par de búsquedas antes, para que la tira de recientes salga con algo:
    // es parte de la experiencia y vacía no se entiende.
    await page.goto("/?dict=es&word=libro", { waitUntil: "load" });
    await page.waitForSelector(".card-title");

    await page.goto("/?dict=es&word=corazon", { waitUntil: "load" });
    await page.waitForSelector(".card-title");
    await page.waitForTimeout(500);

    await page.screenshot({ path: `${OUT}/preview.png` });

});

test("preview: sugerencias", async ({ page }) => {
    await prepare(page, "light");

    await page.goto("/?dict=es&word=agua", { waitUntil: "load" });
    await page.waitForSelector(".card-title");

    await page.fill(".search-box input", "cas");
    await expect(page.locator(".suggestion").first()).toBeVisible();
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${OUT}/preview-suggestions.png` });
});

test("preview: selector de diccionarios", async ({ page }) => {
    await prepare(page, "dark");

    await page.goto("/?dict=en&word=water", { waitUntil: "load" });
    await page.waitForSelector(".card-title");

    await page.click(".dictionary-select .current");
    await page.waitForTimeout(400);

    await page.screenshot({ path: `${OUT}/preview-dictionaries.png` });
});

test("preview: el índice", async ({ page }) => {
    await prepare(page, "dark");

    await page.goto("/?dict=es&word=corazon", { waitUntil: "load" });
    await page.waitForSelector(".card-title");
    await expect(page.locator(".word.current")).toBeVisible({ timeout: 60_000 });

    // Tecleando: el índice ya se ha movido a la "m" mientras la entrada sigue
    // siendo la anterior. Es justo lo que la sección del README explica.
    await page.fill(".search-box input", "mesa");
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${OUT}/preview-browse.png` });
});

test("preview: en el móvil", async ({ page }) => {
    await prepare(page, "light");

    // Un móvil de verdad, no una ventana estrecha: es donde la app se usa de pie.
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/?dict=es&word=corazon", { waitUntil: "load" });
    await page.waitForSelector(".card-title");
    await page.waitForTimeout(500);

    await page.screenshot({ path: `${OUT}/preview-mobile.png` });
});
