<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { LANG_EN, Word } from "./DictionaryClient";

    export let language: string;
    export let word: Word;

    const dispatch = createEventDispatcher<{ search: string }>();

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

    function searchWord(subword: string): void {
        dispatch("search", subword);
    }

    function cleanWord(subword: string): string {
        const re = /(\w+)/;
        const result = re.exec(subword);
        if (!result || result.length == 0) {
            return subword;
        }

        return result[0];
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
                <h6>
                    <b
                        >{getPartOfSpeechPrefix(meaning.partOfSpeech)}
                        {meaning.partOfSpeech}</b
                    >
                </h6>
            {/if}

            {#each meaning.definitions as definition}
                <p class="card-text">
                    <i>
                        {#each definition.definition.split(" ") as subword}
                            <span
                                class="word"
                                title={isLangEnglish
                                    ? `Click to search "${cleanWord(subword)}"`
                                    : `Clic para buscar "${cleanWord(
                                          subword
                                      )}"`}
                                on:click={() => searchWord(cleanWord(subword))}
                            >
                                {subword}
                            </span>
                            {" "}
                        {/each}
                    </i>
                </p>
            {/each}
        {/each}
    </div>
</div>

<style>
    .word:hover {
        text-decoration: underline;
        cursor: pointer;
    }
</style>
