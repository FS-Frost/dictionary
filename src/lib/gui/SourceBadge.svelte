<script lang="ts">
    import { LANG_EN, type SourceId } from "$lib/dictionary";
    import Icon from "$lib/gui/Icon.svelte";

    type Props = {
        source: SourceId | null;
        language: string;
    };

    let { source, language }: Props = $props();

    let isLangEnglish: boolean = $derived(language == LANG_EN);

    // Wiktionary es CC BY-SA: la atribución no es cortesía, es la licencia.
    const CREDITS: Record<SourceId, { label: string; url: string }> = {
        offline: {
            label: "Wiktionary (offline)",
            url: "https://www.wiktionary.org/",
        },
        freedictionaryapi: {
            label: "Wiktionary · freedictionaryapi.com",
            url: "https://freedictionaryapi.com/",
        },
        dictionaryapi: {
            label: "dictionaryapi.dev",
            url: "https://dictionaryapi.dev/",
        },
        rae: {
            label: "RAE · rae-api.com",
            url: "https://rae-api.com/",
        },
    };

    let credit = $derived(source ? CREDITS[source] : null);

    let prefix: string = $derived(isLangEnglish ? "Source" : "Fuente");

    let offlineNote: string = $derived(
        isLangEnglish ? "no connection needed" : "sin conexión",
    );
</script>

{#if credit}
    <p class="source text-muted">
        {prefix}:
        <a href={credit.url} target="_blank" rel="noreferrer">{credit.label}</a>

        {#if source == "offline"}
            <span class="offline-note" title={offlineNote}>
                <Icon name="bolt" size={12} />
                {offlineNote}
            </span>
        {/if}
    </p>
{/if}

<style>
    .source {
        font-size: 0.8rem;
        margin-bottom: 0.5rem;
    }

    .offline-note {
        margin-left: 0.35rem;
        color: #198754;
    }
</style>
