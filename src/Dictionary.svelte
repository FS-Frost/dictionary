<script lang="ts">
    import { ClientResponse, getDefinition, LANG_EN, LANG_ES } from "./DictionaryClient";
    import Word from "./Word.svelte";

    let response: ClientResponse;
    let isLoading: boolean = false;
    let word: string = "";
    let language: string = LANG_EN;

    $: wordIsValid = !word.includes(" ");

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
        <input
            type="text"
            class="form-control"
            placeholder="Type the word you want to search..."
            bind:value={word}
            on:keyup={checkForSearchEnter}
        />
        <button class="btn btn-outline-secondary" type="button" on:click={searchWord} disabled={!wordIsValid}>Search</button>
    </div>

    <div class="input-group mb-3">
        <label class="input-group-text" for="language">Language</label>
        <select class="form-select" name="language" bind:value={language} on:change={searchWord}>
            <option value={LANG_EN}>English</option>
            <option value={LANG_ES}>Spanish</option>
        </select>
    </div>

    {#if !isLoading && response?.json?.length > 0}
        {#each response.json as defWord}
            <Word word={defWord} />
        {/each}
    {/if}

    {#if !isLoading && response?.status == 404}
        <p class="text-center">No results for "{response.word}".</p>
    {/if}

    {#if !isLoading && response?.status == 500}
        <p class="text-center">Ups, an error on the way. Try again later.</p>
    {/if}

    {#if isLoading}
        <p class="text-center">Searching...</p>
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
