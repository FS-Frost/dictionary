<script lang="ts">
    import Icon from "$lib/gui/Icon.svelte";
    import {
        isSameWord,
        LANG_EN,
        normalizeKey,
        prefetchLanguage,
        type LanguageStatus,
    } from "$lib/dictionary";
    import { dictionaryLabel } from "$lib/dictionaryName";
    import { toastError, toastSuccess } from "$lib/toast.svelte";

    type Props = {
        dictionary: LanguageStatus | undefined;
        uiLanguage: string;
        /** El índice del diccionario. `null` mientras no se haya podido cargar. */
        words: string[] | null;
        /** Palabra abierta ahora mismo, para marcarla y seguirla. */
        selected: string;
        /** Lo que el usuario está tecleando, para saltar sin esperar a que busque. */
        jumpPrefix: string;
        onOpenWord: (word: string) => void;
        onDownloaded: () => Promise<void> | void;
    };

    let {
        dictionary,
        uiLanguage,
        words,
        selected,
        jumpPrefix,
        onOpenWord,
        onDownloaded,
    }: Props = $props();

    /**
     * Palabras por página.
     *
     * Es el número que hace que esto se parezca a un diccionario de papel y no a
     * una lista infinita: una página se abarca de un vistazo y se pasa.
     */
    const PAGE_SIZE = 60;

    /** Subdivisiones por letra que se enseñan a la vez ("ca ce ci co cu"). */
    const MAX_SUBLETTERS = 12;

    let isLangEnglish: boolean = $derived(uiLanguage == LANG_EN);

    let page = $state<number>(0);
    let progress = $state<number>(-1);

    const TEXT = $derived({
        title: isLangEnglish ? "Index" : "Índice",
        unavailable: isLangEnglish
            ? "The word list could not be loaded"
            : "No se pudo cargar la lista de palabras",
        unavailableWhy: isLangEnglish
            ? "It needs a connection the first time."
            : "Hace falta conexión la primera vez.",
        download: isLangEnglish ? "Download" : "Descargar",
        downloading: isLangEnglish ? "Downloading..." : "Descargando...",
        offlineHint: isLangEnglish
            ? "Download it to browse without a connection."
            : "Descárgalo para hojear sin conexión.",
        previous: isLangEnglish ? "Previous page" : "Página anterior",
        next: isLangEnglish ? "Next page" : "Página siguiente",
        page: isLangEnglish ? "Page" : "Página",
        of: isLangEnglish ? "of" : "de",
        jump: isLangEnglish ? "Jump to letter" : "Ir a la letra",
        downloaded: isLangEnglish ? "Dictionary ready" : "Diccionario listo",
        failed: isLangEnglish ? "Download failed" : "La descarga falló",
        quota: isLangEnglish ? "Not enough space" : "No hay espacio suficiente",
    });

    let totalPages: number = $derived(
        words == null ? 0 : Math.max(1, Math.ceil(words.length / PAGE_SIZE)),
    );

    let pageWords: string[] = $derived(
        words == null ? [] : words.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    );

    /**
     * Palabras guía, como en un diccionario impreso: la primera y la última de la
     * página. Permiten saber si lo que buscas está antes o después sin leerla.
     */
    let guideFirst: string = $derived(pageWords[0] ?? "");
    let guideLast: string = $derived(pageWords[pageWords.length - 1] ?? "");

    /**
     * Iniciales sin acentos: quien busca la "a" espera encontrar "árbol" ahí, no
     * en una pestaña "Á" aparte.
     *
     * NO se usa `normalizeKey`, que además de acentos quita la puntuación: con
     * ella "&c." contaba como "C" y, al estar el índice ordenado, aparecía una
     * "C" suelta encabezando el alfabeto.
     */
    function initials(word: string, length: number): string {
        const clean = word
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .slice(0, length)
            .toUpperCase();

        return /^\p{L}/u.test(clean) ? clean : "#";
    }

    /** Primera página de cada letra inicial. */
    let letters: { letter: string; page: number }[] = $derived.by(() => {
        if (words == null) return [];

        // Un Map y no un "distinto del anterior": si una letra reaparece más
        // adelante (el orden del colador no es el de los puntos de código), con
        // lo segundo saldría dos veces en el lomo.
        const found = new Map<string, number>();

        for (let i = 0; i < words.length; i++) {
            const letter = initials(words[i], 1);
            if (found.has(letter)) continue;

            found.set(letter, Math.floor(i / PAGE_SIZE));
        }

        return [...found].map(([letter, page]) => ({ letter, page }));
    });

    let currentLetter: string = $derived(initials(guideFirst, 1));

    /**
     * Segundo nivel del corte lateral.
     *
     * Con sólo A–Z, la "C" del español es un salto de decenas de páginas: llegas
     * a la letra y sigues sin poder acercarte. Dentro de la letra actual se
     * ofrecen sus dos primeras letras ("ca", "ce", "ci"...).
     */
    let subLetters: { letter: string; page: number }[] = $derived.by(() => {
        if (words == null || currentLetter === "#") return [];

        const found = new Map<string, number>();

        for (let i = 0; i < words.length; i++) {
            if (initials(words[i], 1) !== currentLetter) continue;

            const pair = initials(words[i], 2);

            // Sólo pares de letras: "c." (de la abreviatura) no es una
            // subdivisión del alfabeto, es ruido en el corte.
            if (found.has(pair) || !/^\p{L}{2}$/u.test(pair)) continue;

            found.set(pair, Math.floor(i / PAGE_SIZE));
            if (found.size >= MAX_SUBLETTERS) break;
        }

        // Una sola subdivisión no informa de nada: es la letra otra vez.
        if (found.size < 2) return [];

        return [...found].map(([letter, page]) => ({ letter, page }));
    });

    /** Letras presentes en la página, para no resaltar una que no está. */
    let pageLetters: Set<string> = $derived(new Set(pageWords.map((w) => initials(w, 1))));

    function pageOf(index: number): number {
        return Math.floor(index / PAGE_SIZE);
    }

    function goToPage(next: number): void {
        page = Math.min(Math.max(next, 0), totalPages - 1);
    }

    /** Primera posición cuya clave empieza por el prefijo, o -1. */
    function findPrefix(prefix: string): number {
        if (words == null) return -1;

        const key = normalizeKey(prefix);
        if (key.length === 0) return -1;

        // Lineal y no binaria a propósito: el índice está ordenado por el
        // colador del idioma, no por clave normalizada, así que los dos órdenes
        // no coinciden exactamente y una binaria se pasaría de largo.
        return words.findIndex((entry) => normalizeKey(entry).startsWith(key));
    }

    async function download(): Promise<void> {
        if (!dictionary || progress >= 0) return;

        progress = 0;

        const status = await prefetchLanguage(dictionary.id, {
            onProgress: (done, total) => {
                progress = total === 0 ? 0 : Math.round((done / total) * 100);
            },
        });

        progress = -1;

        if (status == "quota") {
            toastError(TEXT.quota);
            return;
        }

        if (status != "complete") {
            toastError(TEXT.failed);
            return;
        }

        toastSuccess(TEXT.downloaded);
        await onDownloaded();
    }

    /** Para distinguir un cambio de diccionario de un refresco del mismo. */
    let lastDictionaryId = $state<string>("");

    /**
     * La página sigue a la palabra abierta: es el pulgar marcando el sitio.
     *
     * Reposicionar y resetear van en el MISMO efecto a propósito. Separados
     * competían: `dictionary` es un objeto que se recrea cada vez que se
     * refresca el estado de descarga, así que el reseteo se disparaba sin que
     * cambiara el diccionario y devolvía el índice a la página 1 justo después
     * de haberlo colocado sobre la palabra.
     */
    $effect(() => {
        const id = dictionary?.id ?? "";

        if (id !== lastDictionaryId) {
            lastDictionaryId = id;
            page = 0;
        }

        if (words == null || selected.length === 0) return;

        // Exacta primero: "cuidara" y "cuidará" comparten clave normalizada, así
        // que con ella el índice saltaba a la primera de las dos, no a la que se
        // está leyendo.
        let position = words.findIndex((entry) => isSameWord(entry, selected));

        if (position < 0) {
            const key = normalizeKey(selected);
            position = words.findIndex((entry) => normalizeKey(entry) === key);
        }

        if (position < 0) return;

        page = pageOf(position);
    });

    /**
     * Y también sigue a lo que se teclea, antes de pulsar Enter. Es lo que une
     * buscar y hojear: escribir "cas" te deja mirando esa parte del diccionario.
     */
    $effect(() => {
        if (words == null || jumpPrefix.length === 0) return;

        const position = findPrefix(jumpPrefix);
        if (position < 0) return;

        page = pageOf(position);
    });
</script>

<section class="index" aria-label={TEXT.title}>
    {#if words == null}
        <div class="unavailable">
            <p class="text-body-secondary">{TEXT.unavailable}</p>
            <p class="text-body-secondary small">{TEXT.unavailableWhy}</p>

            {#if dictionary}
                {#if progress >= 0}
                    <p class="small">{TEXT.downloading} {progress}%</p>
                    <div class="progress" role="progressbar" aria-valuenow={progress}>
                        <div class="progress-bar" style="width: {progress}%"></div>
                    </div>
                {:else}
                    <button class="btn btn-sm btn-primary" onclick={download}>
                        <Icon name="download" size={14} />
                        {TEXT.download}
                        {dictionaryLabel(dictionary, uiLanguage)}
                    </button>
                {/if}
            {/if}
        </div>
    {:else}
        <nav class="letters" aria-label={TEXT.jump}>
            {#each letters as entry}
                <button
                    type="button"
                    class="letter"
                    class:active={pageLetters.has(entry.letter)}
                    aria-current={pageLetters.has(entry.letter) ? "true" : undefined}
                    onclick={() => goToPage(entry.page)}
                >
                    {entry.letter}
                </button>
            {/each}
        </nav>

        <div class="sheet">
            <header class="guides">
                <span class="guide">{guideFirst}</span>
                <span class="guide">{guideLast}</span>
            </header>

            {#if subLetters.length > 0}
                <nav class="sub-letters" aria-label={TEXT.jump}>
                    {#each subLetters as entry}
                        <button
                            type="button"
                            class="sub-letter"
                            class:active={entry.page == page}
                            onclick={() => goToPage(entry.page)}
                        >
                            {entry.letter.toLowerCase()}
                        </button>
                    {/each}
                </nav>
            {/if}

            <ul class="words">
                {#each pageWords as entry}
                    <li>
                        <button
                            type="button"
                            class="word"
                            class:current={isSameWord(entry, selected)}
                            aria-current={isSameWord(entry, selected) ? "true" : undefined}
                            onclick={() => onOpenWord(entry)}
                        >
                            {entry}
                        </button>
                    </li>
                {/each}
            </ul>

            <footer class="pager">
                <button
                    class="btn btn-sm btn-outline-secondary"
                    disabled={page == 0}
                    aria-label={TEXT.previous}
                    title={TEXT.previous}
                    onclick={() => goToPage(page - 1)}
                >
                    <Icon name="chevron-left" size={14} />
                </button>

                <span class="page-number">
                    {TEXT.page}
                    {page + 1}
                    {TEXT.of}
                    {totalPages}
                </span>

                <button
                    class="btn btn-sm btn-outline-secondary"
                    disabled={page >= totalPages - 1}
                    aria-label={TEXT.next}
                    title={TEXT.next}
                    onclick={() => goToPage(page + 1)}
                >
                    <Icon name="chevron-right" size={14} />
                </button>
            </footer>

            {#if dictionary && !dictionary.downloaded}
                <p class="offline-hint text-body-secondary">
                    <Icon name="download" size={12} />
                    {TEXT.offlineHint}
                </p>
            {/if}
        </div>
    {/if}
</section>

<style>
    .index {
        display: flex;
        gap: 0.4rem;
        align-items: flex-start;
        font-size: 0.85rem;
    }

    .unavailable {
        padding: 1rem 0.5rem;
    }

    /* El corte lateral del diccionario de papel. */
    .letters {
        display: flex;
        flex-direction: column;
        gap: 0.05rem;
        flex-shrink: 0;
    }

    .letter {
        border: 1px solid transparent;
        background: transparent;
        color: var(--bs-secondary-color);
        border-radius: 0.2rem;
        padding: 0 0.3rem;
        font-size: 0.7rem;
        line-height: 1.35;
        cursor: pointer;
    }

    .letter:hover {
        background: var(--bs-secondary-bg);
    }

    .letter.active {
        background: var(--bs-primary);
        color: #fff;
        font-weight: 700;
    }

    .sheet {
        flex: 1;
        min-width: 0;
        border: 1px solid var(--bs-border-color);
        border-radius: 0.375rem;
        padding: 0.5rem 0.65rem;
        background: var(--bs-body-bg);
    }

    .guides {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
        padding-bottom: 0.35rem;
        border-bottom: 1px solid var(--bs-border-color);
    }

    .guide {
        font-weight: 700;
        font-size: 0.8rem;
    }

    .sub-letters {
        display: flex;
        flex-wrap: wrap;
        gap: 0.15rem;
        margin: 0.35rem 0;
    }

    .sub-letter {
        border: 0;
        background: transparent;
        color: var(--bs-secondary-color);
        border-radius: 0.2rem;
        padding: 0 0.25rem;
        font-size: 0.72rem;
        cursor: pointer;
    }

    .sub-letter:hover {
        background: var(--bs-secondary-bg);
    }

    .sub-letter.active {
        color: var(--bs-body-color);
        font-weight: 700;
        background: var(--bs-secondary-bg);
    }

    .words {
        list-style: none;
        margin: 0.4rem 0 0;
        padding: 0;
        columns: 2 7rem;
        column-gap: 0.75rem;
    }

    .words li {
        break-inside: avoid;
    }

    .word {
        border: 0;
        background: transparent;
        padding: 0.02rem 0.15rem;
        color: var(--bs-body-color);
        cursor: pointer;
        text-align: start;
        width: 100%;
        border-radius: 0.2rem;
        font-size: 0.82rem;
        line-height: 1.5;
    }

    .word:hover {
        background: var(--bs-secondary-bg);
    }

    /* La palabra abierta, marcada: es el pulgar en la página. */
    .word.current {
        background: var(--bs-primary-bg-subtle);
        color: var(--bs-primary-text-emphasis);
        font-weight: 700;
    }

    .pager {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 0.5rem;
        padding-top: 0.4rem;
        border-top: 1px solid var(--bs-border-color);
    }

    .page-number {
        font-size: 0.75rem;
        color: var(--bs-secondary-color);
    }

    .offline-hint {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.72rem;
        margin: 0.4rem 0 0;
    }
</style>
