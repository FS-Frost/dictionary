<script lang="ts">
    import Icon from "$lib/gui/Icon.svelte";
    import {
        clearFavorites,
        clearHistory,
        LANG_EN,
        readFavorites,
        readHistory,
        type SavedWord,
    } from "$lib/dictionary";

    type Props = {
        uiLanguage: string;
        /** Cambia cuando hay algo nuevo que releer (una búsqueda, un favorito). */
        revision: number;
        /**
         * Si se enseña.
         *
         * La tira sólo aparece cuando el buscador tiene el foco o no hay nada
         * buscado. Permanente se comía 145 px de un móvil de 844 — más que la
         * propia definición — para enseñar el historial a alguien que está
         * leyendo, que es justo cuando no le hace falta.
         */
        visible: boolean;
        onOpen: (word: string, dictionaryId: string) => void;
    };

    let { uiLanguage, revision, visible, onOpen }: Props = $props();

    /** Suficientes para reconocer lo reciente sin que la tira ocupe la pantalla. */
    const VISIBLE = 14;

    let isLangEnglish: boolean = $derived(uiLanguage == LANG_EN);

    let history = $state<SavedWord[]>([]);
    let favorites = $state<SavedWord[]>([]);
    let tab = $state<"history" | "favorites">("history");

    const TEXT = $derived({
        recent: isLangEnglish ? "Recent" : "Recientes",
        saved: isLangEnglish ? "Saved" : "Guardadas",
        clear: isLangEnglish ? "Clear" : "Vaciar",
        confirmClear: isLangEnglish
            ? "Clear this list? It cannot be undone."
            : "¿Vaciar esta lista? No se puede deshacer.",
        emptyFavorites: isLangEnglish
            ? "Star a word to keep it here."
            : "Marca una palabra con la estrella para guardarla aquí.",
    });

    let shown: SavedWord[] = $derived(
        (tab == "history" ? history : favorites).slice(0, VISIBLE),
    );

    async function refresh(): Promise<void> {
        history = await readHistory();
        favorites = await readFavorites();
    }

    async function clear(): Promise<void> {
        if (!confirm(TEXT.confirmClear)) return;

        if (tab == "history") {
            await clearHistory();
        } else {
            await clearFavorites();
        }

        await refresh();
    }

    $effect(() => {
        void revision;
        void refresh();
    });
</script>

<!--
    La tira sólo aparece cuando hay algo que enseñar: un carril vacío
    permanentemente es ruido, y en la primera visita no hay nada que recordar.
-->
{#if visible && (history.length > 0 || favorites.length > 0)}
    <div class="saved-words">
        <div class="tabs">
            <button
                type="button"
                class="tab"
                class:active={tab == "history"}
                onclick={() => (tab = "history")}
            >
                <Icon name="clock" size={12} />
                {TEXT.recent}
            </button>

            <button
                type="button"
                class="tab"
                class:active={tab == "favorites"}
                onclick={() => (tab = "favorites")}
            >
                <Icon name="star" size={12} />
                {TEXT.saved}
            </button>

            {#if shown.length > 0}
                <button type="button" class="tab clear" onclick={clear}>{TEXT.clear}</button>
            {/if}
        </div>

        <div class="words">
            {#each shown as entry (entry.key)}
                <button
                    type="button"
                    class="chip"
                    onclick={() => onOpen(entry.word, entry.dictionaryId)}
                >
                    {entry.word}
                </button>
            {:else}
                <span class="empty text-body-secondary">{TEXT.emptyFavorites}</span>
            {/each}
        </div>
    </div>
{/if}

<style>
    .saved-words {
        margin-bottom: 1rem;
        font-size: 0.85rem;
    }

    .tabs {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.4rem;
    }

    .tab {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        border: 0;
        background: transparent;
        padding: 0.1rem 0.2rem;
        color: var(--bs-secondary-color);
        font-size: 0.8rem;
        cursor: pointer;
        border-bottom: 2px solid transparent;
    }

    .tab.active {
        color: var(--bs-body-color);
        border-bottom-color: var(--bs-primary);
    }

    /* A la derecha del todo: vaciar es destructivo y no debe rozar las pestañas. */
    .clear {
        margin-left: auto;
    }

    /*
     * Una sola fila, desplazable. Con `flex-wrap`, catorce palabras ocupaban
     * cuatro filas en un móvil.
     */
    .words {
        display: flex;
        gap: 0.35rem;
        overflow-x: auto;
        padding-bottom: 0.2rem;
        scrollbar-width: thin;
    }

    .words :global(.chip),
    .words .chip {
        flex: 0 0 auto;
    }

    .chip {
        border: 1px solid var(--bs-border-color);
        border-radius: 999px;
        background: var(--bs-tertiary-bg);
        color: var(--bs-body-color);
        padding: 0.1rem 0.55rem;
        font-size: 0.8rem;
        cursor: pointer;
    }

    .chip:hover {
        background: var(--bs-secondary-bg);
    }

    .empty {
        font-size: 0.8rem;
    }
</style>
