<script lang="ts">
    import { LANG_EN, Word } from "./DictionaryClient";

    export let language: string;
    export let word: Word;

    $: isLangEnglish = language == LANG_EN;
    $: originText = isLangEnglish ? "Origin" : "Origen";
    $: partOfSpeechPrefix = isLangEnglish ? "As" : "Como";
</script>

<div class="card mb-3">
    <div class="card-body">
        <h5 class="card-title">
            {word.word}{#if word.phonetic != null}
                <i>({word.phonetic})</i>
            {/if}
        </h5>

        {#if word.origin != null}
            <h6>{originText}</h6>
            <p class="text-muted">{word.origin}</p>
        {/if}

        {#each word.meanings as meaning}
            <h6>{partOfSpeechPrefix} {meaning.partOfSpeech}</h6>
            {#each meaning.definitions as definition}
                <p class="card-text"><i>{definition.definition}</i></p>
            {/each}
        {/each}
    </div>
</div>

<style>
</style>
