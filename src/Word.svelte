<script lang="ts">
    import type { Word } from "./DictionaryClient";

    export let word: Word;
</script>

<div class="card mb-3">
    <div class="card-body">
        <h5 class="card-title">
            {word.word}{#if word.phonetic != null}
                <i>({word.phonetic})</i>
            {/if}
        </h5>

        {#if word.origin != null}
            <h6>Origin</h6>
            <p class="text-muted">{word.origin}</p>
        {/if}

        {#each word.meanings as meaning}
            <h6>As {meaning.partOfSpeech}</h6>
            {#each meaning.definitions as definition}
                <p class="card-text"><i>{definition.definition}</i></p>
            {/each}
        {/each}
    </div>
</div>

<style>
</style>
