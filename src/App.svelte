<script lang="ts">
    import Dictionary from "./Dictionary.svelte";

    const URL_INFO = "https://dictionaryapi.dev/";
</script>

<main>
    <h1 class="title">Dictionary</h1>

    <Dictionary />

    <div class="footer fixed-bottom">
        <div class="container">
            <p class="text-muted text-center">Powered by <a href={URL_INFO} target="_blank" rel="noreferrer">Free Dictionary API</a>.</p>
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
