import { defineConfig, devices } from "@playwright/test";

/**
 * Configuración aparte para las capturas del README.
 *
 * No van en `tests/e2e/` a propósito: CI corre esa carpeta entera, y generar las
 * imágenes exige descargar un diccionario completo (minutos) para algo que sólo
 * hace falta cuando cambia el aspecto de la aplicación.
 */
export default defineConfig({
    testDir: ".",
    testMatch: "screenshots.spec.ts",
    timeout: 300_000,
    expect: { timeout: 30_000 },
    fullyParallel: false,
    workers: 1,
    reporter: "line",
    use: {
        baseURL: "http://localhost:5000",
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                executablePath: process.env.CHROMIUM_PATH || undefined,
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
