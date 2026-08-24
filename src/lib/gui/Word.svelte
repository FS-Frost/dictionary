<script lang="ts">
    import { LANG_EN, type Word } from "$lib/dictionary";
    import { cleanWord } from "$lib/strings";
    import Pronunciation from "$lib/gui/Pronunciation.svelte";

    type Props = {
        language: string;
        word: Word;
        onSearch?: (text: string) => void;
    };

    let { language, word, onSearch }: Props = $props();

    let isLangEnglish: boolean = $derived(language == LANG_EN);
    let originText: string = $derived(isLangEnglish ? "Origin" : "Origen");

    let synonymsText: string = $derived(
        isLangEnglish ? "Synonyms" : "Sinónimos",
    );

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
        onSearch && onSearch(subword);
    }
</script>

<div class="card mb-3">
    <div class="card-body">
        <h5 class="card-title">
            <span>{word.word}</span>
            {#if word.phonetic != null}
                <i class="text-muted">{word.phonetic}</i>
            {/if}
            <Pronunciation
                word={word.word}
                {language}
                phonetics={word.phonetics}
            />
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
                                role="button"
                                tabindex="0"
                                class="searchable"
                                title={isLangEnglish
                                    ? `Click to search "${cleanWord(subword)}"`
                                    : `Clic para buscar "${cleanWord(
                                          subword,
                                      )}"`}
                                onclick={() => searchWord(cleanWord(subword))}
                                onkeydown={() => {}}
                            >
                                {subword}
                            </span>
                            {" "}
                        {/each}
                        <span
                            role="button"
                            tabindex="0"
                            class="searchable"
                            title={isLangEnglish
                                ? `Click to search "${cleanWord(
                                      meaning.partOfSpeech,
                                  )}"`
                                : `Clic para buscar "${cleanWord(
                                      meaning.partOfSpeech,
                                  )}"`}
                            onclick={() =>
                                searchWord(
                                    cleanWord(meaning.partOfSpeech ?? ""),
                                )}
                            onkeydown={() => {}}
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
                                role="button"
                                tabindex="0"
                                class="searchable"
                                title={isLangEnglish
                                    ? `Click to search "${cleanWord(subword)}"`
                                    : `Clic para buscar "${cleanWord(
                                          subword,
                                      )}"`}
                                onclick={() => searchWord(cleanWord(subword))}
                                onkeydown={() => {}}
                            >
                                {subword}
                            </span>
                            {" "}
                        {/each}
                    </i>
                </p>

                {#if definition.example.length > 0}
                    <p class="example text-muted">«{definition.example}»</p>
                {/if}

                {#if definition.synonyms.length > 0}
                    <p class="relations">
                        <span class="text-muted">{synonymsText}:</span>
                        {#each definition.synonyms as synonym}
                            <button
                                type="button"
                                class="badge"
                                onclick={() => searchWord(synonym)}
                            >
                                {synonym}
                            </button>
                        {/each}
                    </p>
                {/if}
            {/each}
        {/each}
    </div>
</div>

<style>
    .searchable:hover {
        text-decoration: underline;
        cursor: pointer;
    }

    .example {
        border-left: 3px solid #dee2e6;
        padding-left: 0.75rem;
        margin-left: 0.25rem;
        font-size: 0.9rem;
    }

    .relations {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        align-items: center;
        font-size: 0.85rem;
    }

    .badge {
        border: 1px solid #ced4da;
        border-radius: 999px;
        background: #f8f9fa;
        padding: 0.15rem 0.6rem;
        font-size: 0.8rem;
        cursor: pointer;
    }

    .badge:hover {
        background: #e9ecef;
    }
</style>
