<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { LANG_EN, Word } from "./DictionaryClient";
    import { cleanWord } from "./strings";

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
</script>

<div class="card mb-3">
    <div class="card-body">
        <h5 class="card-title">
            <span>{word.word}</span>
            {#if word.phonetic != null}
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
                    <b>
                        {#each getPartOfSpeechPrefix(meaning.partOfSpeech).split(" ") as subword}
                            <span
                                class="searchable"
                                title={isLangEnglish
                                    ? `Click to search "${cleanWord(subword)}"`
                                    : `Clic para buscar "${cleanWord(
                                          subword,
                                      )}"`}
                                on:click={() => searchWord(cleanWord(subword))}
                                on:keydown={() => {}}
                            >
                                {subword}
                            </span>
                            {" "}
                        {/each}
                        <span
                            class="searchable"
                            title={isLangEnglish
                                ? `Click to search "${cleanWord(
                                      meaning.partOfSpeech,
                                  )}"`
                                : `Clic para buscar "${cleanWord(
                                      meaning.partOfSpeech,
                                  )}"`}
                            on:click={() =>
                                searchWord(
                                    cleanWord(meaning.partOfSpeech ?? ""),
                                )}
                            on:keydown={() => {}}
                        >
                            {meaning.partOfSpeech}
                        </span>
                    </b>
                </h6>
            {/if}

            {#each meaning.definitions as definition}
                <p class="card-text">
                    <i>
                        {#each definition.definition.split(" ") as subword}
                            <span
                                class="searchable"
                                title={isLangEnglish
                                    ? `Click to search "${cleanWord(subword)}"`
                                    : `Clic para buscar "${cleanWord(
                                          subword,
                                      )}"`}
                                on:click={() => searchWord(cleanWord(subword))}
                                on:keydown={() => {}}
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
    .searchable:hover {
        text-decoration: underline;
        cursor: pointer;
    }
</style>
