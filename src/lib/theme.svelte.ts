/**
 * Tema claro/oscuro.
 *
 * Tres estados, no dos: `auto` sigue al sistema operativo, y es el valor por
 * defecto porque quien ya tiene el móvil en oscuro no debería tener que
 * decírselo también a esta página.
 *
 * La preferencia se aplica como `data-bs-theme` en `<html>`, que es el
 * interruptor nativo de Bootstrap 5.3: con eso los componentes (cards, inputs,
 * botones) cambian solos y no hay que mantener una paleta paralela.
 *
 * El primer pintado NO lo hace este módulo sino el script en línea de
 * `app.html`: para cuando el bundle de Svelte arranca, la página ya se dibujó, y
 * aplicar el tema aquí significaría un fogonazo blanco en modo oscuro.
 */

export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";
export const THEME_AUTO = "auto";

const THEMES = [THEME_LIGHT, THEME_DARK, THEME_AUTO] as const;

export type Theme = (typeof THEMES)[number];

/** Compartida con el script en línea de `app.html`; si cambia, cambia allí también. */
export const STORAGE_KEY = "theme";

export function isTheme(value: string): value is Theme {
    return (THEMES as readonly string[]).includes(value);
}

type ThemeState = {
    /** Lo que el usuario eligió. */
    preference: Theme;
    /** Lo que se está pintando: `auto` ya resuelto contra el sistema. */
    resolved: typeof THEME_LIGHT | typeof THEME_DARK;
};

const state = $state<ThemeState>({
    preference: THEME_AUTO,
    resolved: THEME_LIGHT,
});

export function getTheme(): Theme {
    return state.preference;
}

export function getResolvedTheme(): typeof THEME_LIGHT | typeof THEME_DARK {
    return state.resolved;
}

function prefersDark(): boolean {
    if (typeof matchMedia === "undefined") return false;
    return matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(preference: Theme): typeof THEME_LIGHT | typeof THEME_DARK {
    if (preference != THEME_AUTO) return preference;
    return prefersDark() ? THEME_DARK : THEME_LIGHT;
}

function apply(preference: Theme): void {
    const resolved = resolve(preference);

    state.preference = preference;
    state.resolved = resolved;

    if (typeof document === "undefined") return;

    document.documentElement.setAttribute("data-bs-theme", resolved);

    // La barra de estado del navegador y del modo instalado (PWA) no lee CSS:
    // sin esto, en Android la cabecera se queda blanca sobre una app oscura.
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", resolved == THEME_DARK ? "#212529" : "#ffffff");
}

export function setTheme(preference: Theme): void {
    apply(preference);

    try {
        localStorage.setItem(STORAGE_KEY, preference);
    } catch {
        // Modo privado o almacenamiento lleno: el tema vale para esta sesión y ya.
    }
}

/**
 * Lee la preferencia guardada y queda pendiente de que el sistema cambie.
 *
 * Devuelve la función de limpieza para que el componente que la llama pueda
 * soltar el listener.
 */
export function initTheme(): () => void {
    let stored = "";

    try {
        stored = localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
        stored = "";
    }

    apply(isTheme(stored) ? stored : THEME_AUTO);

    if (typeof matchMedia === "undefined") return () => {};

    const query = matchMedia("(prefers-color-scheme: dark)");

    // Sólo importa mientras la preferencia sea `auto`: si el usuario fijó claro u
    // oscuro a mano, que el sistema cambie no debe pisárselo.
    const onSystemChange = (): void => {
        if (state.preference != THEME_AUTO) return;
        apply(THEME_AUTO);
    };

    query.addEventListener("change", onSystemChange);

    return () => query.removeEventListener("change", onSystemChange);
}
