<script lang="ts">
    import { onMount } from "svelte";

    import Icon from "$lib/gui/Icon.svelte";

    import {
        isLanguage,
        isLanguageDownloaded,
        LANG_EN,
        loadManifest,
        prefetchLanguage,
        type Language,
    } from "$lib/dictionary";

    type Props = {
        language: string;
    };

    let { language }: Props = $props();

    let total = $state<number>(0);
    let cached = $state<number>(0);
    let isDownloading = $state<boolean>(false);
    let isComplete = $state<boolean>(false);
    let failed = $state<boolean>(false);
    let megabytes = $state<number>(0);

    // Hasta saber si el idioma ya está descargado no se enseña nada: ofrecer
    // "descargar 19 MB" y retirarlo medio segundo después es peor que esperar.
    let isReady = $state<boolean>(false);

    let isLangEnglish: boolean = $derived(language == LANG_EN);

    let percent: number = $derived(
        total === 0 ? 0 : Math.round((cached / total) * 100),
    );

    let labelReady: string = $derived(
        isLangEnglish
            ? "Full dictionary available offline"
            : "Diccionario completo disponible sin conexión",
    );

    let labelDownload: string = $derived(
        isLangEnglish
            ? `Download for offline use (${megabytes} MB)`
            : `Descargar para usar sin conexión (${megabytes} MB)`,
    );

    let labelDownloading: string = $derived(
        isLangEnglish ? "Downloading..." : "Descargando...",
    );

    let labelFailed: string = $derived(
        isLangEnglish
            ? "Download incomplete. Try again."
            : "Descarga incompleta. Inténtalo de nuevo.",
    );

    async function refresh(): Promise<void> {
        if (!isLanguage(language)) return;

        const manifest = await loadManifest();
        if (!manifest) return;

        total = manifest.shardCount;
        megabytes = Math.round(
            (manifest.languages[language]?.bytes ?? 0) / 1024 / 1024,
        );

        isComplete = await isLanguageDownloaded(language);
        isReady = true;
    }

    async function download(): Promise<void> {
        if (isDownloading || !isLanguage(language)) return;

        const target: Language = language;

        isDownloading = true;
        failed = false;

        const ok = await prefetchLanguage(target, (done, count) => {
            cached = done;
            total = count;
        });

        failed = !ok;
        isDownloading = false;

        await refresh();
    }

    onMount(refresh);

    // Al cambiar de idioma hay que volver a mirar: cada uno se descarga aparte.
    $effect(() => {
        void language;
        void refresh();
    });
</script>

<div class="offline">
    {#if !isReady}
        <!-- Espacio reservado para que la barra no salte al resolverse el estado. -->
        <span class="placeholder"></span>
    {:else if isComplete}
        <span class="ready">
            <Icon name="check" size={14} />
            {labelReady}
        </span>
    {:else if isDownloading}
        <span>{labelDownloading} {percent}%</span>
        <div class="progress" role="progressbar" aria-valuenow={percent}>
            <div class="bar" style="width: {percent}%"></div>
        </div>
    {:else}
        <button class="btn btn-sm btn-outline-primary" onclick={download}>
            <Icon name="download" size={14} />
            {labelDownload}
        </button>

        {#if failed}
            <span class="failed">{labelFailed}</span>
        {/if}
    {/if}
</div>

<style>
    .offline {
        margin-bottom: 1rem;
        font-size: 0.85rem;
    }

    .ready {
        color: #198754;
    }

    .placeholder {
        display: inline-block;
        height: 1.9rem;
    }

    .failed {
        color: #dc3545;
        margin-left: 0.5rem;
    }

    .progress {
        height: 6px;
        background: #e9ecef;
        border-radius: 3px;
        overflow: hidden;
        margin-top: 0.35rem;
    }

    .bar {
        height: 100%;
        background: #0d6efd;
        transition: width 0.2s ease;
    }
</style>
