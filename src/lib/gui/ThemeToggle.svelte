<script lang="ts">
    import { onMount } from "svelte";

    import Icon from "$lib/gui/Icon.svelte";
    import { LANG_EN } from "$lib/dictionary";
    import { showToast } from "$lib/toast.svelte";
    import {
        getResolvedTheme,
        getTheme,
        initTheme,
        setTheme,
        THEME_AUTO,
        THEME_DARK,
        THEME_LIGHT,
        type Theme,
    } from "$lib/theme.svelte";

    type Props = {
        language: string;
    };

    let { language }: Props = $props();

    let isLangEnglish: boolean = $derived(language == LANG_EN);

    /**
     * Claro → oscuro → sistema.
     *
     * "Sistema" va al final a propósito: es el valor de partida, y ponerlo en
     * medio obliga a pasar por él cada vez que se alterna entre claro y oscuro,
     * que es lo que la gente hace de verdad con este botón.
     */
    const CYCLE: Theme[] = [THEME_LIGHT, THEME_DARK, THEME_AUTO];

    const ICONS: Record<Theme, "sun" | "moon" | "circle-half"> = {
        [THEME_LIGHT]: "sun",
        [THEME_DARK]: "moon",
        [THEME_AUTO]: "circle-half",
    };

    let current: Theme = $derived(getTheme());
    let next: Theme = $derived(CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]);

    let names: Record<Theme, string> = $derived({
        [THEME_LIGHT]: isLangEnglish ? "Light" : "Claro",
        [THEME_DARK]: isLangEnglish ? "Dark" : "Oscuro",
        [THEME_AUTO]: isLangEnglish ? "System" : "Sistema",
    });

    /**
     * El botón anuncia el estado ACTUAL y la pista dice a qué se pasa.
     *
     * Un botón que se llama como su destino ("Oscuro") y muestra el icono de su
     * estado actual (sol) se contradice a sí mismo; con un control que cicla,
     * eso es lo que hace que nadie sepa dónde está.
     */
    let label: string = $derived(
        isLangEnglish
            ? `Theme: ${names[current]}. Switch to ${names[next].toLowerCase()}`
            : `Tema: ${names[current]}. Cambiar a ${names[next].toLowerCase()}`,
    );

    function cycle(): void {
        const target = next;
        setTheme(target);

        // Se consulta la función y no el `$derived`: aquí hace falta el valor de
        // después de `setTheme`, y un derivado sólo garantiza estar al día
        // cuando lo lee la plantilla.
        const isDark = getResolvedTheme() == THEME_DARK;

        // En "sistema" el nombre no basta: hay que decir a qué quedó, porque el
        // usuario ve un cambio de color y necesita saber que no lo eligió él.
        const message =
            target == THEME_AUTO
                ? isLangEnglish
                    ? `Theme: system (${isDark ? "dark" : "light"})`
                    : `Tema: sistema (${isDark ? "oscuro" : "claro"})`
                : isLangEnglish
                  ? `Theme: ${names[target].toLowerCase()}`
                  : `Tema: ${names[target].toLowerCase()}`;

        // Con clave: pulsar tres veces seguidas deja un aviso, no tres apilados.
        showToast(message, { key: "theme" });
    }

    onMount(initTheme);
</script>

<button
    type="button"
    class="btn btn-sm btn-outline-secondary theme-toggle"
    title={label}
    aria-label={label}
    onclick={cycle}
>
    <Icon name={ICONS[current]} size={16} />
</button>

<style>
    .theme-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        /* Cuadrado y del alto de los botones pequeños de Bootstrap: si sólo
           lleva icono, el ancho por defecto lo deja rectangular y descentrado
           respecto al resto de controles. */
        width: 2rem;
        height: 2rem;
        padding: 0;
    }
</style>
