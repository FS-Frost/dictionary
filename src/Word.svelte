<script lang="ts">
    import { LANG_EN, Word } from "./DictionaryClient";

    export let language: string;
    export let word: Word;

    $: isLangEnglish = language == LANG_EN;
    $: originText = isLangEnglish ? "Origin" : "Origen";

    function isVocal(letter: string): boolean {
        return ["a", "e", "i", "o", "u"].includes(letter);
    }

    function getPartOfSpeechPrefix(partOfSpeech: string): string {
        let prefix = isLangEnglish ? "As " : "Como";

        if (isLangEnglish && partOfSpeech.length > 0) {
            const firstLetter = partOfSpeech[0];
            prefix += isVocal(firstLetter) ? "an" : "a";
        }

        return prefix;
    }
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
            {#if meaning.partOfSpeech != null}
                <h6><b>{getPartOfSpeechPrefix(meaning.partOfSpeech)} {meaning.partOfSpeech}</b></h6>
            {/if}
            {#each meaning.definitions as definition}
                <p class="card-text"><i>{definition.definition}</i></p>
            {/each}
        {/each}
    </div>
</div>

<style>
</style>
