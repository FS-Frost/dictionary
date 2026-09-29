<script lang="ts">
    import { onMount } from "svelte";

    import Icon from "$lib/gui/Icon.svelte";
    import { LANG_EN } from "$lib/dictionary";

    type Props = {
        uiLanguage: string;
    };

    let { uiLanguage }: Props = $props();

    /**
     * El evento que Chrome dispara cuando la aplicación es instalable. No está
     * en la librería estándar de TypeScript porque no es estándar: sólo lo
     * implementan los navegadores basados en Chromium.
     */
    type InstallPrompt = Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    };

    let isLangEnglish: boolean = $derived(uiLanguage == LANG_EN);
    let label: string = $derived(isLangEnglish ? "Install app" : "Instalar app");

    /**
     * Sólo aparece cuando el navegador dice que se puede instalar.
     *
     * Es una PWA desde hace tiempo y no había ninguna pista de ello: quien no
     * conoce el menú del navegador no llegaba a instalarla nunca. Un botón fijo
     * tampoco vale — en iOS o si ya está instalada no haría nada, y un control
     * que no hace nada es peor que ninguno.
     */
    let prompt = $state<InstallPrompt | null>(null);

    onMount(() => {
        const onBeforeInstall = (event: Event): void => {
            // Sin esto Chrome enseña su propio aviso y el botón sobra.
            event.preventDefault();
            prompt = event as InstallPrompt;
        };

        const onInstalled = (): void => {
            prompt = null;
        };

        window.addEventListener("beforeinstallprompt", onBeforeInstall);
        window.addEventListener("appinstalled", onInstalled);

        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstall);
            window.removeEventListener("appinstalled", onInstalled);
        };
    });

    async function install(): Promise<void> {
        const pending = prompt;
        if (!pending) return;

        await pending.prompt();
        await pending.userChoice;

        // El evento no se puede reutilizar, se haya aceptado o no.
        prompt = null;
    }
</script>

{#if prompt}
    <button
        type="button"
        class="btn btn-sm btn-outline-secondary install"
        title={label}
        aria-label={label}
        onclick={install}
    >
        <Icon name="download" size={14} />
    </button>
{/if}

<style>
    .install {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        padding: 0;
    }
</style>
