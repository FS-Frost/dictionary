<script lang="ts">
    import { onMount } from "svelte";

    import {
        ClientResponse,
        getDefinition,
        LANG_EN,
        LANG_ES,
    } from "./DictionaryClient";
    import Word from "./Word.svelte";
    import { cleanWord } from "./strings";

    let response: ClientResponse;
    let isLoading: boolean = false;
    let word: string = "water";

    export let language: string = LANG_EN;

    $: wordIsValid = !word.includes(" ");
    $: isLangEnglish = language == LANG_EN;
    $: searchButton = isLangEnglish ? "Search" : "Buscar";
    $: searchPlaceholder = isLangEnglish
        ? "Type a word..."
        : "Escribe una palabra...";
    $: selectLang = isLangEnglish ? "Languaje" : "Lenguaje";
    $: selectOptionEn = isLangEnglish ? "English" : "Inglés";
    $: selectOptionEs = isLangEnglish ? "Spanish" : "Español";
    $: noResultsFor = isLangEnglish ? "No results for" : "Sin resultados para";
    $: errorMessage = isLangEnglish
        ? "Ups, I hit an error. Try again."
        : "Vaya, me tropecé con una piedra. Intenta de nuevo.";
    $: searchingMessage = isLangEnglish ? "Searching..." : "Buscando...";
    $: proTip = isLangEnglish
        ? "Pro tip: click a word to search it."
        : "Pro tip: clic en una palabra para buscarla.";

    onMount(() => {
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

        searchWord();
    });

    async function searchWord() {
        updateUrl();

        if (word == "") {
            return;
        }

        isLoading = true;
        response = await getDefinition(word, language);
        console.log(response);
        isLoading = false;
    }

    function checkForSearchEnter(
        e: KeyboardEvent & {
            currentTarget: EventTarget & HTMLInputElement;
        },
    ) {
        if (e.key != "Enter") {
            return;
        }

        searchWord();
    }

    function updateUrl() {
        const params = new URLSearchParams({
            lang: language,
            word: word,
        });

        const url = `${window.location.origin}${
            window.location.pathname
        }?${params.toString()}`;
        window.history.pushState(null, "", url);
    }
</script>

<div class="dictionary">
    <div class="input-group mb-3">
        <input
            type="text"
            class="form-control"
            placeholder={searchPlaceholder}
            bind:value={word}
            on:keyup={checkForSearchEnter}
        />
        <button
            class="btn btn-outline-secondary"
            type="button"
            on:click={searchWord}
            disabled={!wordIsValid}>{searchButton}</button
        >
    </div>

    <div class="input-group mb-3">
        <label class="input-group-text" for="language">{selectLang}</label>
        <select
            class="form-select"
            name="language"
            bind:value={language}
            on:change={searchWord}
        >
            <option value={LANG_EN}>{selectOptionEn}</option>
            <option value={LANG_ES}>{selectOptionEs}</option>
        </select>
    </div>

    <p>
        <i>
            {#each proTip.split(" ") as subword}
                <span
                    class="searchable"
                    title={isLangEnglish
                        ? `Click to search "${cleanWord(subword)}"`
                        : `Clic para buscar "${cleanWord(subword)}"`}
                    on:click={() => {
                        word = cleanWord(subword);
                        searchWord();
                    }}
                    on:keydown={() => {}}
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
                on:search={(e) => {
                    word = e.detail;
                    searchWord();
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
        margin: 5%;
    }

    .text-center {
        text-align: center;
    }

    .searchable:hover {
        text-decoration: underline;
        cursor: pointer;
    }
</style>
