<script lang="ts">
    import { onMount, tick } from "svelte";

    import {
        type ClientResponse,
        getDefinition,
        LANG_EN,
        LANG_ES,
    } from "$lib/DictionaryClient";
    import Word from "$lib/gui/Word.svelte";
    import { cleanWord } from "$lib/strings";
    import { pushState } from "$app/navigation";
    import { page } from "$app/state";

    type Props = {
        language: string;
    };

    let { language = $bindable(LANG_EN) }: Props = $props();

    let response = $state<ClientResponse>();
    let isLoading = $state<boolean>(false);
    let word = $state<string>("water");

    let wordIsValid: boolean = $derived(!word.includes(" "));
    let isLangEnglish: boolean = $derived(language == LANG_EN);
    let searchButton: string = $derived(isLangEnglish ? "Search" : "Buscar");
    let selectLang: string = $derived(isLangEnglish ? "Languaje" : "Lenguaje");
    let selectOptionEn: string = $derived(isLangEnglish ? "English" : "Inglés");

    let selectOptionEs: string = $derived(
        isLangEnglish ? "Spanish" : "Español",
    );

    let noResultsFor: string = $derived(
        isLangEnglish ? "No results for" : "Sin resultados para",
    );

    let searchingMessage: string = $derived(
        isLangEnglish ? "Searching..." : "Buscando...",
    );

    let searchPlaceholder: string = $derived(
        isLangEnglish ? "Type a word..." : "Escribe una palabra...",
    );

    let errorMessage: string = $derived(
        isLangEnglish
            ? "Ups, I hit an error. Try again."
            : "Vaya, me tropecé con una piedra. Intenta de nuevo.",
    );

    let proTip: string = $derived(
        isLangEnglish
            ? "Pro tip: click a word to search it."
            : "Pro tip: clic en una palabra para buscarla.",
    );

    async function searchWord(): Promise<void> {
        updateUrl();

        if (word == "") {
            return;
        }

        isLoading = true;
        response = await getDefinition(word, language);
        isLoading = false;
    }

    async function checkForSearchEnter(
        e: KeyboardEvent & {
            currentTarget: EventTarget & HTMLInputElement;
        },
    ): Promise<void> {
        if (e.key != "Enter") {
            return;
        }

        await searchWord();
    }

    function updateUrl(): void {
        const params = new URLSearchParams({
            lang: language,
            word: word,
        });

        const url = `${window.location.origin}${
            window.location.pathname
        }?${params.toString()}`;

        pushState(url, page.state);
    }

    onMount(async () => {
        const url = new URL(window.location.href);
        const searchParams = new URLSearchParams(url.search);
        const urlLang = searchParams.get("lang");
        const validLangs = [LANG_ES, LANG_EN];

        if (urlLang && validLangs.includes(urlLang)) {
            language = urlLang;
        }

        const urlWord = searchParams.get("word");

        if (urlWord) {
            word = urlWord;
        }

        await tick();
        await searchWord();
    });
</script>

<div class="dictionary">
    <div class="input-group mb-3">
        <input
            type="text"
            class="form-control"
            placeholder={searchPlaceholder}
            bind:value={word}
            onkeyup={checkForSearchEnter}
        />
        <button
            class="btn btn-outline-secondary"
            type="button"
            onclick={searchWord}
            disabled={!wordIsValid}>{searchButton}</button
        >
    </div>

    <div class="input-group mb-3">
        <label class="input-group-text" for="language">{selectLang}</label>
        <select
            class="form-select"
            name="language"
            bind:value={language}
            onchange={searchWord}
        >
            <option value={LANG_EN}>{selectOptionEn}</option>
            <option value={LANG_ES}>{selectOptionEs}</option>
        </select>
    </div>

    <p>
        <i>
            {#each proTip.split(" ") as subword}
                <span
                    role="button"
                    tabindex="0"
                    class="searchable"
                    title={isLangEnglish
                        ? `Click to search "${cleanWord(subword)}"`
                        : `Clic para buscar "${cleanWord(subword)}"`}
                    onclick={async () => {
                        word = cleanWord(subword);
                        await searchWord();
                    }}
                    onkeydown={() => {}}
                >
                    {subword}
                </span>
                {" "}
            {/each}
        </i>
    </p>

    {#if !isLoading && response && response.json}
        {#each response.json as defWord}
            <Word
                {language}
                word={defWord}
                onSearch={async (text) => {
                    word = text;
                    await searchWord();
                }}
            />
        {/each}
    {/if}

    {#if !isLoading && response?.status == 404}
        <p class="text-center">{noResultsFor} "{response.word}".</p>
    {/if}

    {#if !isLoading && response?.status == 500}
        <p class="text-center">{errorMessage}</p>
    {/if}

    {#if isLoading}
        <p class="text-center">{searchingMessage}</p>
    {/if}
</div>

<style>
    .dictionary {
        margin-left: 1rem;
        margin-right: 1rem;
    }

    .text-center {
        text-align: center;
    }

    .searchable:hover {
        text-decoration: underline;
        cursor: pointer;
    }
</style>
