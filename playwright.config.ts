import { defineConfig, devices } from "@playwright/test";

/**
 * Los tests end-to-end existen por una razón concreta: el modo offline no se
 * puede comprobar con jsdom. Hace falta un service worker de verdad, IndexedDB
 * de verdad y una red que se pueda cortar de verdad.
 *
 * Corren contra el build de producción, no contra `vite dev`, porque el service
 * worker y los datos estáticos sólo se comportan como en producción ahí.
 */
export default defineConfig({
    testDir: "./tests/e2e",
    // Descargar el dataset entero dentro de un test es lento por naturaleza.
    timeout: 180_000,
    expect: { timeout: 30_000 },
    fullyParallel: false,
    workers: 1,
    reporter: process.env.CI ? "list" : "line",
    use: {
        baseURL: "http://localhost:5000",
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                launchOptions: {
                    // Permite apuntar a un Chromium ya instalado en la máquina y
                    // evitar la descarga de navegadores.
                    executablePath: process.env.CHROMIUM_PATH || undefined,
                },
            },
        },
    ],
    webServer: {
        command: "bun run build && bun run preview",
        url: "http://localhost:5000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
    },
});
