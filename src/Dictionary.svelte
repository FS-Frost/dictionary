<script lang="ts">
    import { ClientResponse, getDefinition, LANG_EN, LANG_ES } from "./DictionaryClient";
    import Word from "./Word.svelte";

    let response: ClientResponse;
    let isLoading: boolean = false;
    let word: string = "";

    const url = new URL(window.location.href);
    const searchParams = new URLSearchParams(url.search);
    const urlLang = searchParams.get("lang");
    export let language: string = urlLang ?? LANG_ES;

    $: wordIsValid = !word.includes(" ");
    $: isLangEnglish = language == LANG_EN;
    $: searchButton = isLangEnglish ? "Search" : "Buscar";
    $: searchPlaceholder = isLangEnglish ? "Type the word you want to search..." : "Escribe la palabra que deseas buscar...";
    $: selectLang = isLangEnglish ? "Languaje" : "Lenguaje";
    $: selectOptionEn = isLangEnglish ? "English" : "Inglés";
    $: selectOptionEs = isLangEnglish ? "Spanish" : "Español";
    $: noResultsFor = isLangEnglish ? "No results for" : "Sin resultados para";
    $: errorMessage = isLangEnglish ? "Ups, I hit an error. Try again." : "Vaya, me tropecé con una piedra. Intenta de nuevo.";
    $: searchingMessage = isLangEnglish ? "Searching..." : "Buscando...";

    async function searchWord() {
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
            currentTarget: EventTarget & HTMLButtonElement;
        }
    ) {
        if (e.key != "Enter") {
            return;
        }

        searchWord();
    }
</script>

<div class="dictionary">
    <div class="input-group mb-3">
        <input type="text" class="form-control" placeholder={searchPlaceholder} bind:value={word} on:keyup={checkForSearchEnter} />
        <button class="btn btn-outline-secondary" type="button" on:click={searchWord} disabled={!wordIsValid}>{searchButton}</button>
    </div>

    <div class="input-group mb-3">
        <label class="input-group-text" for="language">{selectLang}</label>
        <select class="form-select" name="language" bind:value={language} on:change={searchWord}>
            <option value={LANG_EN}>{selectOptionEn}</option>
            <option value={LANG_ES}>{selectOptionEs}</option>
        </select>
    </div>

    {#if !isLoading && response?.json?.length > 0}
        {#each response.json as defWord}
            <Word {language} word={defWord} />
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
</style>
