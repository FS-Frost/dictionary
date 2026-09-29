<script lang="ts">
    import { onMount } from "svelte";

    import Icon from "$lib/gui/Icon.svelte";

    import { showToast, toastError, toastSuccess } from "$lib/toast.svelte";

    import {
        deleteLanguage,
        getStorageEstimate,
        isStoragePersisted,
        listDictionaries,
        LANG_EN,
        prefetchLanguage,
        type LanguageStatus,
    } from "$lib/dictionary";
    import { dictionaryDescription, dictionaryLabel } from "$lib/dictionaryName";

    type Props = {
        dictionaryId: string;
        uiLanguage: string;
        /** Avisa a la aplicación de que cambió qué hay descargado. */
        onChanged?: () => Promise<void> | void;
    };

    let { dictionaryId, uiLanguage, onChanged }: Props = $props();

    const language = $derived(uiLanguage);

    type Progress = {
        done: number;
        total: number;
        controller: AbortController;
    };

    /**
     * El estado vive por diccionario y no sólo para el que se está consultando:
     * la pregunta "¿qué tengo descargado?" es sobre la app entera, y contestarla
     * a medias obliga a ir cambiando de diccionario para averiguarlo.
     */
    let dictionaries = $state<LanguageStatus[]>([]);
    let statuses = $derived<Record<string, LanguageStatus>>(
        Object.fromEntries(dictionaries.map((dictionary) => [dictionary.id, dictionary])),
    );
    let progress = $state<Record<string, Progress | null>>({});

    let isPanelOpen = $state<boolean>(false);
    let isOnline = $state<boolean>(true);
    let usedBytes = $state<number>(0);
    let quotaBytes = $state<number>(0);
    let isPersisted = $state<boolean>(false);

    // Hasta saber si el idioma ya está descargado no se enseña nada: ofrecer
    // "descargar 19 MB" y retirarlo medio segundo después es peor que esperar.
    let isReady = $state<boolean>(false);

    let isLangEnglish: boolean = $derived(language == LANG_EN);

    let current: LanguageStatus | null = $derived(statuses[dictionaryId] ?? null);
    let currentProgress: Progress | null = $derived(progress[dictionaryId] ?? null);
    let isComplete: boolean = $derived(current?.downloaded === true);

    let percent: number = $derived(
        currentProgress == null || currentProgress.total == 0
            ? 0
            : Math.round((currentProgress.done / currentProgress.total) * 100),
    );

    const TEXT = $derived({
        ready: isLangEnglish
            ? "Full dictionary available offline"
            : "Diccionario completo disponible sin conexión",
        /*
         * Etiqueta corta para la línea de estado, que está SIEMPRE en pantalla.
         * La larga se conserva como título accesible: es la que explica para qué
         * sirve, pero no hace falta leerla en cada visita.
         */
        download: isLangEnglish ? "Download" : "Descargar",
        downloadLong: isLangEnglish
            ? "Download for offline use"
            : "Descargar para usar sin conexión",
        downloading: isLangEnglish ? "Downloading..." : "Descargando...",
        cancel: isLangEnglish ? "Cancel" : "Cancelar",
        remove: isLangEnglish ? "Remove" : "Eliminar",
        manage: isLangEnglish ? "Manage dictionaries" : "Gestionar diccionarios",
        offlineDictionaries: isLangEnglish ? "Offline dictionaries" : "Diccionarios sin conexión",
        notDownloaded: isLangEnglish ? "Not downloaded" : "Sin descargar",
        onDevice: isLangEnglish ? "On this device" : "En este dispositivo",
        words: isLangEnglish ? "words" : "palabras",
        connection: isLangEnglish ? "Connection" : "Conexión",
        online: isLangEnglish ? "Online — online sources available" : "Con conexión — fuentes en línea disponibles",
        offline: isLangEnglish ? "Offline — bundled dictionary only" : "Sin conexión — sólo el diccionario descargado",
        storage: isLangEnglish ? "Storage used by this site" : "Espacio usado por este sitio",
        persisted: isLangEnglish ? "Protected from automatic cleanup" : "Protegido contra el borrado automático",
        notPersisted: isLangEnglish
            ? "The browser may delete this to free space"
            : "El navegador puede borrarlo para liberar espacio",
        toastQuota: isLangEnglish ? "Not enough space" : "No hay espacio suficiente",
        toastQuotaDetail: isLangEnglish
            ? "Free up space or remove another dictionary."
            : "Libera espacio o elimina otro diccionario.",
        toastDownloaded: isLangEnglish ? "Dictionary ready offline" : "Diccionario listo sin conexión",
        toastCancelled: isLangEnglish ? "Download cancelled" : "Descarga cancelada",
        toastCancelledDetail: isLangEnglish
            ? "What was already downloaded is kept."
            : "Se conserva lo ya descargado.",
        toastFailed: isLangEnglish ? "Download incomplete" : "Descarga incompleta",
        toastFailedDetail: isLangEnglish
            ? "Some parts could not be downloaded. Try again."
            : "Algunas partes no se pudieron descargar. Inténtalo de nuevo.",
        toastRemoved: isLangEnglish ? "Dictionary removed" : "Diccionario eliminado",
        confirmRemove: isLangEnglish
            ? "Remove the downloaded dictionary? You can download it again later."
            : "¿Eliminar el diccionario descargado? Puedes volver a descargarlo después.",
    });

    function nameOf(id: string): string {
        const dictionary = statuses[id];
        return dictionary ? dictionaryLabel(dictionary, uiLanguage) : id;
    }

    /**
     * Redondear siempre a MB deja "0 MB" cuando el sitio apenas ocupa nada, que
     * parece un fallo más que un dato. Por debajo del mega se informa en KB.
     */
    function formatSize(bytes: number): string {
        if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;

        return `${Math.round(bytes / 1024 / 1024)} MB`;
    }

    function formatWords(words: number): string {
        return new Intl.NumberFormat(isLangEnglish ? "en-US" : "es-CL").format(words);
    }

    async function refresh(): Promise<void> {
        dictionaries = await listDictionaries();
        isReady = true;

        await refreshStorage();
    }

    /**
     * Lo que el navegador dice que ocupa el sitio, no lo que suman los datasets:
     * a los shards hay que añadir el caché del service worker, y quien mira
     * cuánto espacio le está costando la app quiere ese número, no una estimación.
     */
    async function refreshStorage(): Promise<void> {
        const estimate = await getStorageEstimate();

        usedBytes = estimate.usage ?? 0;
        quotaBytes = estimate.quota ?? 0;
        isPersisted = await isStoragePersisted();
    }

    async function download(target: string): Promise<void> {
        if (progress[target] != null) return;

        const controller = new AbortController();

        progress = { ...progress, [target]: { done: 0, total: 0, controller } };

        const status = await prefetchLanguage(target, {
            signal: controller.signal,
            onProgress: (done, total) => {
                const active = progress[target];
                if (!active) return;

                progress = { ...progress, [target]: { ...active, done, total } };
            },
        });

        progress = { ...progress, [target]: null };

        await refresh();
        await onChanged?.();

        const name = nameOf(target);

        if (status == "complete") {
            toastSuccess(`${TEXT.toastDownloaded}: ${name}`);
        } else if (status == "quota") {
            // Se detecta antes de descargar nada, así que el mensaje puede ser
            // concreto en vez del genérico "algo falló".
            toastError(`${TEXT.toastQuota}: ${name}`, { detail: TEXT.toastQuotaDetail });
        } else if (status == "cancelled") {
            showToast(`${TEXT.toastCancelled}: ${name}`, {
                detail: TEXT.toastCancelledDetail,
            });
        } else {
            toastError(`${TEXT.toastFailed}: ${name}`, {
                detail: TEXT.toastFailedDetail,
            });
        }
    }

    function cancel(target: string): void {
        progress[target]?.controller.abort();
    }

    async function remove(target: string): Promise<void> {
        if (!confirm(TEXT.confirmRemove)) return;

        await deleteLanguage(target);

        // El tamaño se lee ANTES de refrescar: después, el estado ya no dice
        // cuánto ocupaba lo que se acaba de borrar, que es el dato que el
        // usuario quiere confirmar.
        const freed = statuses[target]?.bytes ?? 0;

        await refresh();
        await onChanged?.();

        toastSuccess(`${TEXT.toastRemoved}: ${nameOf(target)}`, {
            detail: freed > 0 ? `+${formatSize(freed)}` : undefined,
        });
    }

    onMount(() => {
        void refresh();

        isOnline = typeof navigator === "undefined" || navigator.onLine !== false;

        const goOnline = (): void => void (isOnline = true);
        const goOffline = (): void => void (isOnline = false);

        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);

        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    });

    // Al cambiar de diccionario hay que volver a mirar: cada uno se descarga aparte.
    $effect(() => {
        void dictionaryId;
        void refresh();
    });
</script>

<div class="offline">
    <div class="summary">
        {#if !isReady}
            <!-- Espacio reservado para que la barra no salte al resolverse el estado. -->
            <span class="placeholder"></span>
        {:else if currentProgress != null}
            <span class="status">{TEXT.downloading} {percent}%</span>
            <button class="btn btn-sm btn-outline-secondary" onclick={() => cancel(dictionaryId)}>
                {TEXT.cancel}
            </button>
        {:else if isComplete}
            <span class="ready">
                <Icon name="check" size={14} />
                {TEXT.ready}
            </span>
        {:else}
            <button
                class="btn btn-sm btn-link compact"
                title={TEXT.downloadLong}
                onclick={() => download(dictionaryId)}
            >
                <Icon name="download" size={14} />
                {TEXT.download}
                {#if current}({formatSize(current.bytes)}){/if}
            </button>

        {/if}

        {#if isReady}
            <button
                class="btn btn-sm btn-link manage"
                title={TEXT.manage}
                aria-label={TEXT.manage}
                aria-expanded={isPanelOpen}
                onclick={() => (isPanelOpen = !isPanelOpen)}
            >
                <Icon name="gear" size={14} />
            </button>
        {/if}
    </div>

    {#if currentProgress != null}
        <div class="progress" role="progressbar" aria-valuenow={percent}>
            <div class="progress-bar" style="width: {percent}%"></div>
        </div>
    {/if}

    {#if isPanelOpen}
        <div class="card panel">
            <div class="card-body">
                <h6 class="card-subtitle mb-2 text-body-secondary">
                    {TEXT.offlineDictionaries}
                </h6>

                <ul class="languages">
                    {#each dictionaries as status (status.id)}
                        {@const lang = status.id}
                        {@const active = progress[lang]}

                        <li class="language">
                            <div class="language-info">
                                <strong>{dictionaryLabel(status, uiLanguage)}</strong>

                                <span class="text-body-secondary detail">
                                    {dictionaryDescription(status, uiLanguage)}
                                </span>

                                <span class="text-body-secondary detail">
                                    {formatSize(status.bytes)} ·
                                    {formatWords(status.words)}
                                    {TEXT.words}
                                </span>

                                <span class="detail">
                                    {#if status.downloaded}
                                        <span class="ready">
                                            <Icon name="check" size={12} />
                                            {TEXT.onDevice}
                                        </span>
                                    {:else if active}
                                        <span class="text-body-secondary">
                                            {TEXT.downloading}
                                            {active.total == 0
                                                ? 0
                                                : Math.round((active.done / active.total) * 100)}%
                                        </span>
                                    {:else}
                                        <span class="text-body-secondary">{TEXT.notDownloaded}</span>
                                    {/if}
                                </span>
                            </div>

                            <div class="language-actions">
                                {#if active}
                                    <button
                                        class="btn btn-sm btn-outline-secondary"
                                        onclick={() => cancel(lang)}
                                    >
                                        {TEXT.cancel}
                                    </button>
                                {:else if status.downloaded}
                                    <button
                                        class="btn btn-sm btn-outline-danger"
                                        title={TEXT.remove}
                                        onclick={() => remove(lang)}
                                    >
                                        <Icon name="trash" size={14} />
                                        {TEXT.remove}
                                    </button>
                                {:else}
                                    <button
                                        class="btn btn-sm btn-outline-primary"
                                        onclick={() => download(lang)}
                                    >
                                        <Icon name="download" size={14} />
                                        {TEXT.download}
                                    </button>
                                {/if}
                            </div>
                        </li>
                    {/each}
                </ul>

                <hr />

                <p class="meta">
                    <span class="text-body-secondary">{TEXT.connection}:</span>
                    <span class:offline-warning={!isOnline}>
                        <Icon name={isOnline ? "cloud" : "cloud-slash"} size={12} />
                        {isOnline ? TEXT.online : TEXT.offline}
                    </span>
                </p>

                {#if usedBytes > 0}
                    <p class="meta">
                        <span class="text-body-secondary">{TEXT.storage}:</span>
                        {formatSize(usedBytes)}{#if quotaBytes > 0}
                            <span class="text-body-secondary">
                                / {formatSize(quotaBytes)}</span
                            >{/if}
                    </p>

                    <!--
                        Lo que guarda una web es desechable por defecto: el
                        navegador puede tirarlo sin avisar. En una app que
                        promete funcionar sin red, eso hay que decirlo.
                    -->
                    <p class="meta">
                        <span class:offline-warning={!isPersisted}>
                            <Icon name={isPersisted ? "check" : "warning"} size={12} />
                            {isPersisted ? TEXT.persisted : TEXT.notPersisted}
                        </span>
                    </p>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    .offline {
        margin-bottom: 0.5rem;
        font-size: 0.8rem;
    }

    .summary {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        min-height: 1.6rem;
    }

    /*
     * Una línea, no un botón a ancho completo. Descargar se hace una vez en la
     * vida y ocupaba 52 px permanentes por encima de la definición; el panel del
     * engranaje sigue ofreciéndolo con todo el detalle.
     */
    .compact {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0;
        text-decoration: none;
        white-space: nowrap;
    }

    /*
     * El botón encoge y su texto parte; el engranaje no. Con `flex-wrap`, en
     * cuanto el botón ocupaba la línea entera el engranaje caía solo a la
     * siguiente y quedaba huérfano a la derecha.
     */
    .summary :global(.btn) {
        min-width: 0;
        text-align: start;
    }

    .ready {
        color: var(--bs-success-text-emphasis);
    }

    .placeholder {
        display: inline-block;
        height: 1.2rem;
    }

    .manage {
        margin-left: auto;
        padding: 0.1rem 0.4rem;
        color: var(--bs-secondary-color);
    }

    .progress {
        height: 6px;
        margin-top: 0.35rem;
    }

    .panel {
        margin-top: 0.5rem;
    }

    .languages {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .language {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        justify-content: space-between;
    }

    .language-info {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }

    .detail {
        font-size: 0.8rem;
    }

    .meta {
        margin-bottom: 0.25rem;
    }

    .offline-warning {
        color: var(--bs-warning-text-emphasis);
    }
</style>
