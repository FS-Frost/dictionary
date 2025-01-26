<script lang="ts">
    import Dictionary from "$lib/gui/Dictionary.svelte";
    import { LANG_EN } from "$lib/DictionaryClient";

    const URL_INFO = "https://dictionaryapi.dev/";

    let language = $state<string>(LANG_EN);
    let isLangEnglish: boolean = $derived(language == LANG_EN);
    let title: string = $derived(isLangEnglish ? "Dictionary" : "Diccionario");

    let poweredByText: string = $derived(
        isLangEnglish ? "Powered by" : "Con el poder de",
    );
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

<main>
    <h1 class="title"><a href="/">{title}</a></h1>

    <Dictionary bind:language />

    <div class="footer">
        <div class="container">
            <p class="text-muted text-center">
                {poweredByText}
                <a href={URL_INFO} target="_blank" rel="noreferrer"
                    >Free Dictionary API</a
                >.
            </p>
        </div>
    </div>
</main>

<style>
    main {
        width: 100%;
        padding: 1em;
        margin: 0 auto;
    }

    .title {
        text-transform: uppercase;
        text-align: center;
    }

    .title a {
        color: #343434;
        text-decoration: none;
    }

    .title a:hover {
        color: #0a58ca;
    }

    .text-center {
        text-align: center;
    }

    .footer {
        background: white;
    }
</style>
