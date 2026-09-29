<script lang="ts">
    import { LANG_EN, type SourceId, type Word } from "$lib/dictionary";
    import { cleanWord } from "$lib/strings";
    import Icon from "$lib/gui/Icon.svelte";
    import Pronunciation from "$lib/gui/Pronunciation.svelte";
    import SourceBadge from "$lib/gui/SourceBadge.svelte";

    type Props = {
        language: string;
        word: Word;
        /** Formas del lema, si el diccionario las trae. */
        inflections?: string[];
        isSaved?: boolean;
        /** De dónde salió la entrada. Se acredita al pie de la propia ficha. */
        source?: SourceId | null;
        canGoPrevious?: boolean;
        canGoNext?: boolean;
        onSearch?: (text: string) => void;
        onToggleSaved?: () => void;
        onShare?: () => void;
        onPrevious?: () => void;
        onNext?: () => void;
    };

    let {
        language,
        word,
        inflections = [],
        isSaved = false,
        source = null,
        canGoPrevious = false,
        canGoNext = false,
        onSearch,
        onToggleSaved,
        onShare,
        onPrevious,
        onNext,
    }: Props = $props();

    let isLangEnglish: boolean = $derived(language == LANG_EN);
    let originText: string = $derived(isLangEnglish ? "Origin" : "Origen");

    let synonymsText: string = $derived(
        isLangEnglish ? "Synonyms" : "Sinónimos",
    );

    let antonymsText: string = $derived(
        isLangEnglish ? "Antonyms" : "Antónimos",
    );

    function searchHint(text: string): string {
        return isLangEnglish
            ? `Click to search "${text}"`
            : `Clic para buscar "${text}"`;
    }

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

    let formsText: string = $derived(isLangEnglish ? "Forms" : "Formas");

    let saveText: string = $derived(
        isSaved
            ? isLangEnglish
                ? "Remove from saved"
                : "Quitar de guardadas"
            : isLangEnglish
              ? "Save word"
              : "Guardar palabra",
    );

    let shareText: string = $derived(isLangEnglish ? "Share" : "Compartir");

    let previousWordText: string = $derived(
        isLangEnglish ? "Previous word" : "Palabra anterior",
    );

    let nextWordText: string = $derived(isLangEnglish ? "Next word" : "Palabra siguiente");

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

            <span class="actions">
                <!--
                    Las flechas viven en la cabecera de la ficha, que es donde se
                    navega entre palabras. Antes flotaban encima de la tarjeta, en
                    una fila propia que costaba 46 px.
                -->
                {#if onPrevious}
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        disabled={!canGoPrevious}
                        title={previousWordText}
                        aria-label={previousWordText}
                        onclick={onPrevious}
                    >
                        <Icon name="chevron-left" size={14} />
                    </button>
                {/if}

                {#if onNext}
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        disabled={!canGoNext}
                        title={nextWordText}
                        aria-label={nextWordText}
                        onclick={onNext}
                    >
                        <Icon name="chevron-right" size={14} />
                    </button>
                {/if}

                {#if onToggleSaved}
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        class:saved={isSaved}
                        title={saveText}
                        aria-label={saveText}
                        aria-pressed={isSaved}
                        onclick={onToggleSaved}
                    >
                        <Icon name={isSaved ? "star-fill" : "star"} size={14} />
                    </button>
                {/if}

                {#if onShare}
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        title={shareText}
                        aria-label={shareText}
                        onclick={onShare}
                    >
                        <Icon name="share" size={14} />
                    </button>
                {/if}
            </span>
        </h5>

        <!--
            Las formas del lema. Para quien estudia un idioma son de lo más útil
            que puede dar un diccionario, y el dato ya estaba pagado: se usaba
            sólo para que "aguas" encontrase "agua".
        -->
        {#if inflections.length > 0}
            <p class="relations">
                <span class="relations-label">{formsText}:</span>
                {#each inflections as form}
                    <button
                        type="button"
                        class="chip"
                        title={searchHint(form)}
                        onclick={() => searchWord(form)}
                    >
                        {form}
                    </button>
                {/each}
            </p>
        {/if}

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
                        <span class="relations-label">{synonymsText}:</span>
                        {#each definition.synonyms as synonym}
                            <button
                                type="button"
                                class="chip"
                                title={searchHint(synonym)}
                                onclick={() => searchWord(synonym)}
                            >
                                {synonym}
                            </button>
                        {/each}
                    </p>
                {/if}

                {#if definition.antonyms.length > 0}
                    <p class="relations">
                        <span class="relations-label">{antonymsText}:</span>
                        {#each definition.antonyms as antonym}
                            <button
                                type="button"
                                class="chip chip-antonym"
                                title={searchHint(antonym)}
                                onclick={() => searchWord(antonym)}
                            >
                                {antonym}
                            </button>
                        {/each}
                    </p>
                {/if}
            {/each}
        {/each}

        <!-- La fuente acredita ESTA entrada, así que va con ella y no encima. -->
        {#if source}
            <SourceBadge {source} {language} />
        {/if}
    </div>
</div>

<style>
    .actions {
        display: inline-flex;
        gap: 0.25rem;
        margin-left: 0.25rem;
    }

    /* La estrella marcada se distingue por color Y por relleno del icono: no
       puede depender sólo del matiz. */
    .saved {
        color: var(--bs-warning-text-emphasis);
        border-color: var(--bs-warning);
    }

    .searchable:hover {
        text-decoration: underline;
        cursor: pointer;
    }

    .example {
        border-left: 3px solid var(--bs-border-color);
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
        margin-bottom: 0.75rem;
    }

    .relations-label {
        color: var(--bs-secondary-color);
    }

    /*
     * Antes esto reusaba la clase `.badge` de Bootstrap, que trae `color: #fff`:
     * texto blanco sobre un fondo gris claro, ilegible. Es un control propio, no
     * una insignia, así que lleva su propia clase y su propio color explícito.
     *
     * Los colores salen de las variables de tema en vez de fijarse a mano: son
     * las mismas que cambian con `data-bs-theme`, así que el chip sigue al tema
     * sin duplicar la paleta.
     */
    .chip {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--bs-border-color);
        border-radius: 999px;
        background: var(--bs-tertiary-bg);
        color: var(--bs-body-color);
        padding: 0.15rem 0.6rem;
        font-size: 0.8rem;
        line-height: 1.4;
        cursor: pointer;
        transition:
            background-color 0.15s ease,
            border-color 0.15s ease;
    }

    .chip:hover {
        background: var(--bs-secondary-bg);
        border-color: var(--bs-primary-border-subtle);
    }

    .chip:focus-visible {
        outline: 2px solid var(--bs-primary);
        outline-offset: 2px;
    }

    /* Los antónimos se distinguen por color, no sólo por la etiqueta: leyendo en
       diagonal, dos filas de chips idénticos se confunden entre sí. */
    .chip-antonym {
        background: var(--bs-warning-bg-subtle);
        border-color: var(--bs-warning-border-subtle);
        color: var(--bs-warning-text-emphasis);
    }

    .chip-antonym:hover {
        border-color: var(--bs-warning);
    }
</style>
