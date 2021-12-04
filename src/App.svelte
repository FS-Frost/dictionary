<script lang="ts">
    import Dictionary from "./Dictionary.svelte";
    import { LANG_EN } from "./DictionaryClient";

    const URL_INFO = "https://dictionaryapi.dev/";
    let language: string;
    $: isLangEnglish = language == LANG_EN;
    $: title = isLangEnglish ? "Dictionary" : "Diccionario";
    $: poweredByText = isLangEnglish ? "Powered by" : "Con el poder de";
</script>

<main>
    <h1 class="title">{title}</h1>

    <Dictionary bind:language />

    <div class="footer">
        <div class="container">
            <p class="text-muted text-center">
                {poweredByText} <a href={URL_INFO} target="_blank" rel="noreferrer">Free Dictionary API</a>.
            </p>
        </div>
    </div>
</main>

<style>
    main {
        padding: 1em;
        margin: 0 auto;
    }

    .title {
        color: #343434;
        text-transform: uppercase;
        text-align: center;
    }

    @media (min-width: 640px) {
        main {
            max-width: none;
        }

        .title {
            font-size: 1.6em;
        }
    }

    .text-center {
        text-align: center;
    }

    .footer {
        background: white;
    }
</style>
