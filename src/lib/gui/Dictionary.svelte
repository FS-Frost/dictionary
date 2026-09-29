<script lang="ts">
    import { untrack } from "svelte";

    import {
        findInOtherDictionaries,
        hasOnlineSources,
        LANG_EN,
        addFavorite,
        addToHistory,
        isFavorite,
        loadInflections,
        loadWordIndex,
        lookup,
        removeFavorite,
        suggest,
        type LanguageStatus,
        type LookupResult,
    } from "$lib/dictionary";
    import Word from "$lib/gui/Word.svelte";
    import Icon from "$lib/gui/Icon.svelte";
    import OfflineManager from "$lib/gui/OfflineManager.svelte";
    import DictionarySelect from "$lib/gui/DictionarySelect.svelte";
    import InstallButton from "$lib/gui/InstallButton.svelte";
    import ThemeToggle from "$lib/gui/ThemeToggle.svelte";
    import SearchingIndicator from "$lib/gui/SearchingIndicator.svelte";
    import WordIndex from "$lib/gui/WordIndex.svelte";
    import SavedWords from "$lib/gui/SavedWords.svelte";
    import { dictionaryLabel } from "$lib/dictionaryName";
    import { randomWord, wordOfTheDay } from "$lib/wordOfTheDay";
    import { isSameWord, normalizeKey } from "$lib/dictionary";
    import { showToast, toastError } from "$lib/toast.svelte";
    import { afterNavigate, pushState } from "$app/navigation";
    import { page } from "$app/state";

    type Props = {
        /** Diccionario activo. Lo elige el selector y viaja en la URL. */
        dictionaryId: string;
        dictionaries: LanguageStatus[];
        /** Idioma de la interfaz: el de las definiciones del diccionario activo. */
        uiLanguage: string;
        onSelectDictionary: (id: string) => void;
        onDictionariesChanged: () => Promise<void> | void;
        /** Palabra pedida desde fuera (el navegador de páginas). */
        requestedWord?: string;
    };

    let {
        dictionaryId,
        dictionaries,
        uiLanguage,
        onSelectDictionary,
        onDictionariesChanged,
        requestedWord = "",
    }: Props = $props();

    const language = $derived(uiLanguage);

    let result = $state<LookupResult>();
    let suggestions = $state<string[]>([]);
    let highlightedSuggestion = $state<number>(-1);
    let isSuggesting = $state<boolean>(false);
    let elsewhere = $state<string[]>([]);
    let inflections = $state<string[]>([]);
    let isSaved = $state<boolean>(false);

    /** Sube cada vez que hay algo nuevo que releer en historial o guardadas. */
    let savedRevision = $state<number>(0);

    /**
     * El índice del diccionario, cargado una vez y compartido.
     *
     * Lo necesitan tres cosas a la vez: el panel del índice, la palabra del día
     * y el paso a la palabra anterior/siguiente. Tenerlo aquí evita que cada una
     * lo pida por su cuenta.
     */
    let wordIndex = $state<string[] | null>(null);

    /** Lo que se está tecleando, para que el índice salte sin esperar a Enter. */
    let typedPrefix = $state<string>("");

    /** En pantallas estrechas no caben las dos columnas: el índice se pliega. */
    let isIndexOpen = $state<boolean>(false);

    /**
     * Foco del buscador, con retardo al perderlo.
     *
     * De él depende que se enseñen las palabras recientes. El retardo existe
     * porque pulsar un chip quita el foco del campo: sin él, la tira se
     * desmontaría antes de que el clic llegase a registrarse.
     */
    let isSearchFocused = $state<boolean>(false);

    /**
     * Al desplazarse, el armazón se reduce a la barra de búsqueda.
     *
     * El selector de diccionario y el botón "Buscar" se retiran: cambiar de
     * diccionario no se hace leyendo, y para buscar está la tecla Intro. Lo que
     * sí se queda es el campo, para no tener que volver arriba entre palabra y
     * palabra.
     */
    let isScrolled = $state<boolean>(false);
    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    function onSearchFocus(): void {
        if (blurTimer != null) clearTimeout(blurTimer);
        isSearchFocused = true;
    }

    function onSearchBlur(): void {
        isSuggesting = false;

        if (blurTimer != null) clearTimeout(blurTimer);
        blurTimer = setTimeout(() => (isSearchFocused = false), 200);
    }

    let isLoading = $state<boolean>(false);
    // Vacío: la palabra inicial la decide la URL o la palabra del día. Antes
    // había un "water" fijo en el código, que no es una bienvenida sino un resto
    // de depuración.
    let word = $state<string>("");

    let wordIsValid: boolean = $derived(!word.includes(" "));

    /** Sin nada buscado todavía, la tira es la única forma de retomar algo. */
    let areSavedVisible: boolean = $derived(isSearchFocused || word.trim().length === 0);
    let isLangEnglish: boolean = $derived(language == LANG_EN);
    let searchButton: string = $derived(isLangEnglish ? "Search" : "Buscar");

    let noResultsFor: string = $derived(
        isLangEnglish ? "No results for" : "Sin resultados para",
    );

    let searchPlaceholder: string = $derived(
        isLangEnglish ? "Type a word..." : "Escribe una palabra...",
    );

    let errorMessage: string = $derived(
        isLangEnglish
            ? "Ups, I hit an error. Try again."
            : "Vaya, me tropecé con una piedra. Intenta de nuevo.",
    );

    let errorOfflineMessage: string = $derived(
        isLangEnglish
            ? "No connection, and that word is not downloaded"
            : "Sin conexión, y esa palabra no está descargada",
    );

    let errorOfflineDetail: string = $derived(
        isLangEnglish
            ? "Download the dictionary to search without a connection."
            : "Descarga el diccionario para buscar sin conexión.",
    );

    let errorSourcesMessage: string = $derived(
        isLangEnglish ? "Online sources did not respond" : "Las fuentes en línea no respondieron",
    );

    let wordOfTheDayText: string = $derived(
        isLangEnglish ? "Word of the day" : "Palabra del día",
    );

    let randomText: string = $derived(
        isLangEnglish ? "Open at random" : "Abrir al azar",
    );

    let indexText: string = $derived(isLangEnglish ? "Index" : "Índice");

    let previousWordText: string = $derived(
        isLangEnglish ? "Previous word" : "Palabra anterior",
    );

    let nextWordText: string = $derived(
        isLangEnglish ? "Next word" : "Palabra siguiente",
    );

    let linkCopiedText: string = $derived(
        isLangEnglish ? "Link copied" : "Enlace copiado",
    );

    let copyFailedText: string = $derived(
        isLangEnglish ? "Could not copy the link" : "No se pudo copiar el enlace",
    );

    let alsoInText: string = $derived(
        isLangEnglish ? "It is in another dictionary:" : "Sí está en otro diccionario:",
    );

    let offlineOnlyNote: string = $derived(
        isLangEnglish
            ? "This dictionary works offline only: there is no online source to fall back to."
            : "Este diccionario es sólo sin conexión: no hay fuente en línea a la que recurrir.",
    );

    async function searchWord(): Promise<void> {
        updateUrl();

        if (word == "") {
            return;
        }

        isLoading = true;
        suggestions = [];
        isSuggesting = false;
        elsewhere = [];

        result = await lookup(word, dictionaryId);
        isLoading = false;

        if (result.status == "ok") {
            const found = result.words[0]?.word ?? word;

            inflections = await loadInflections(found, dictionaryId);
            isSaved = await isFavorite(dictionaryId, found);

            await addToHistory(dictionaryId, found);
            savedRevision++;

            return;
        }

        inflections = [];
        isSaved = false;

        // Si aquí no está, quizá esté en otro de los diccionarios que el usuario
        // ya tiene: es una pista para saltar, no otra búsqueda.
        elsewhere = await findInOtherDictionaries(word, dictionaryId);

        // Sin red, `lookup` devuelve "not-found" y no "error" (no recorre la
        // cadena de fuentes porque cada intento tarda en fallar). Sin avisar, esa
        // respuesta es indistinguible de "esa palabra no existe", y el usuario
        // concluye que le falta una palabra cuando lo que le falta es el
        // diccionario descargado.
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;

        if (result.status == "not-found" && isOffline) {
            toastError(errorOfflineMessage, {
                detail: errorOfflineDetail,
                key: "lookup",
            });

            return;
        }

        if (result.status == "error") {
            toastError(errorSourcesMessage, {
                detail: errorMessage,
                key: "lookup",
            });
        }
    }

    /**
     * Sugerencias mientras se escribe.
     *
     * No se piden en un `$effect` sobre `word` porque `word` también cambia al
     * elegir un resultado o al abrir una palabra desde el navegador de páginas,
     * y entonces el desplegable se abriría solo justo después de buscar.
     */
    async function refreshSuggestions(): Promise<void> {
        const prefix = word.trim();

        // El índice salta a lo que se escribe antes de pulsar Enter: es lo que
        // hace que buscar y hojear dejen de ser dos cosas distintas.
        typedPrefix = prefix;

        if (prefix.length < 2) {
            suggestions = [];
            isSuggesting = false;
            return;
        }

        const found = await suggest(prefix, dictionaryId);

        // Una sugerencia que repite exactamente lo escrito no aporta nada.
        suggestions = found.filter((item) => item !== word);
        highlightedSuggestion = -1;
        isSuggesting = suggestions.length > 0;
    }

    function applySuggestion(suggestion: string): void {
        word = suggestion;
        suggestions = [];
        isSuggesting = false;

        void searchWord();
    }

    async function onSearchKeyDown(event: KeyboardEvent): Promise<void> {
        if (!isSuggesting) return;

        if (event.key == "ArrowDown") {
            event.preventDefault();
            highlightedSuggestion = Math.min(highlightedSuggestion + 1, suggestions.length - 1);
            return;
        }

        if (event.key == "ArrowUp") {
            event.preventDefault();
            highlightedSuggestion = Math.max(highlightedSuggestion - 1, -1);
            return;
        }

        if (event.key == "Escape") {
            isSuggesting = false;
            suggestions = [];
        }
    }

    async function checkForSearchEnter(
        e: KeyboardEvent & {
            currentTarget: EventTarget & HTMLInputElement;
        },
    ): Promise<void> {
        if (e.key != "Enter") {
            return;
        }

        if (isSuggesting && highlightedSuggestion >= 0) {
            applySuggestion(suggestions[highlightedSuggestion]);
            return;
        }

        await searchWord();
    }

    function updateUrl(): void {
        const params = new URLSearchParams({
            dict: dictionaryId,
            word: word,
        });

        // Si la URL ya dice esto, no se toca. Reescribirla sin necesidad añade
        // una entrada al historial por cada búsqueda que venía de la propia URL,
        // y obliga a pulsar "atrás" dos veces para salir.
        const current = new URLSearchParams(window.location.search);
        if (current.get("dict") == dictionaryId && current.get("word") == word) return;

        const url = `${window.location.origin}${
            window.location.pathname
        }?${params.toString()}`;

        pushState(url, page.state);
    }

    /**
     * Hasta que no se ha leído la URL no se busca nada.
     *
     * Dos motivos para que esto NO esté en `onMount`:
     *
     * 1. El componente monta antes de que la página resuelva qué diccionario
     *    pide la URL (`listDictionaries()` es asíncrono), así que buscar en
     *    `onMount` consultaba el diccionario por defecto.
     * 2. `searchWord` llama a `pushState`, y en `onMount` el router de SvelteKit
     *    todavía no está inicializado: peta con "Cannot call pushState(...)
     *    before router is initialized" y se lleva por delante el arranque de la
     *    aplicación entera.
     *
     * `afterNavigate` corre también en la navegación inicial y, por definición,
     * con el router ya en pie.
     */
    let isReady = $state<boolean>(false);

    $effect(() => {
        const onScroll = (): void => {
            isScrolled = window.scrollY > 120;
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();

        return () => window.removeEventListener("scroll", onScroll);
    });

    afterNavigate(async () => {
        if (isReady) return;

        const searchParams = new URLSearchParams(new URL(window.location.href).search);
        const urlWord = searchParams.get("word");

        if (urlWord) {
            word = urlWord;
        } else {
            // Sin palabra en la URL, se abre por la del día. Si no hay índice
            // (primera visita sin red), se queda vacío y el usuario escribe.
            const index = await loadWordIndex(dictionaryId);
            wordIndex = index;

            word = (index && wordOfTheDay(index, dictionaryId)) ?? "";
            isWordOfTheDay = word.length > 0;
        }

        isReady = true;
    });

    let isWordOfTheDay = $state<boolean>(false);

    async function openRandomWord(): Promise<void> {
        const random = wordIndex && randomWord(wordIndex);
        if (!random) return;

        isWordOfTheDay = false;
        word = random;

        await searchWord();
    }

    // El índice es de cada diccionario: al cambiar, el anterior ya no sirve.
    $effect(() => {
        const target = dictionaryId;

        wordIndex = null;
        void loadWordIndex(target).then((index) => {
            // Puede haber cambiado otra vez mientras se cargaba.
            if (target === dictionaryId) wordIndex = index;
        });
    });

    // Cambiar de diccionario rehace la búsqueda: la misma palabra significa
    // cosas distintas en cada uno, y dejar el resultado anterior en pantalla
    // haría creer que ese es el resultado del diccionario nuevo.
    $effect(() => {
        void dictionaryId;
        if (!isReady) return;

        // Cuanto lee `word` va dentro de `untrack`, la guardia incluida: leerlo
        // fuera vuelve a suscribir el efecto, y entonces se dispara una búsqueda
        // con cada tecla del buscador.
        untrack(() => {
            if (word.trim().length === 0) return;

            void searchWord();
        });
    });

    /**
     * Palabra pedida desde el navegador de páginas.
     *
     * Se compara antes de asignar porque este efecto también corre al escribir en
     * el buscador; sin el guardia, volvería a poner la palabra de la petición y
     * el campo quedaría bloqueado.
     */
    let searchInput = $state<HTMLInputElement | null>(null);

    /**
     * La palabra que de verdad se está enseñando.
     *
     * No es lo tecleado: quien escribe "corazon" acaba leyendo "corazón". El
     * índice tiene que marcar y seguir a la resuelta, o señalaría una palabra
     * que no es la que hay en pantalla.
     */
    let resolvedWord: string = $derived(
        result?.status == "ok" ? (result.words[0]?.word ?? word) : word,
    );

    /** Posición de la palabra abierta dentro del índice, o -1. */
    let currentPosition: number = $derived.by(() => {
        if (wordIndex == null || resolvedWord.length === 0) return -1;

        const exact = wordIndex.findIndex((entry) => isSameWord(entry, resolvedWord));
        if (exact >= 0) return exact;

        // Sin coincidencia exacta (se escribió sin acentos y no se resolvió), se
        // cae a la clave normalizada para al menos situarse cerca.
        const key = normalizeKey(resolvedWord);
        return wordIndex.findIndex((entry) => normalizeKey(entry) === key);
    });

    /**
     * Palabra anterior y siguiente del diccionario.
     *
     * En un diccionario de papel lees la de al lado sin querer, y ahí está media
     * la gracia. Con el índice ya cargado sale casi gratis.
     */
    async function stepWord(offset: number): Promise<void> {
        if (wordIndex == null || currentPosition < 0) return;

        const next = wordIndex[currentPosition + offset];
        if (!next) return;

        typedPrefix = "";
        isWordOfTheDay = false;
        word = next;

        await searchWord();
    }

    async function openFromIndex(entry: string): Promise<void> {
        typedPrefix = "";
        isWordOfTheDay = false;
        word = entry;
        isIndexOpen = false;

        await searchWord();
    }

    async function toggleSaved(): Promise<void> {
        const found = result?.words[0]?.word ?? word;

        if (isSaved) {
            await removeFavorite(dictionaryId, found);
            isSaved = false;
        } else {
            await addFavorite(dictionaryId, found);
            isSaved = true;
        }

        savedRevision++;
    }

    /**
     * Comparte el enlace a la búsqueda, no el texto de la definición: el enlace
     * lleva al diccionario correcto y sigue sirviendo mañana.
     */
    async function share(): Promise<void> {
        const found = result?.words[0]?.word ?? word;
        const url = `${window.location.origin}${window.location.pathname}?dict=${dictionaryId}&word=${encodeURIComponent(found)}`;

        if (navigator.share) {
            try {
                await navigator.share({ title: found, url });
                return;
            } catch {
                // Cancelar el diálogo del sistema no es un error que contar.
                return;
            }
        }

        try {
            await navigator.clipboard.writeText(url);
            showToast(linkCopiedText, { kind: "success" });
        } catch {
            toastError(copyFailedText);
        }
    }
    let lastRequested = $state<string>("");

    $effect(() => {
        if (requestedWord.length === 0 || requestedWord === lastRequested) return;

        lastRequested = requestedWord;
        word = requestedWord;

        untrack(() => void searchWord());
    });
</script>

<div class="dictionary" class:scrolled={isScrolled}>
    <!--
        El armazón: selector, buscador y estado del diccionario. Está SIEMPRE
        visible. Antes vivía dentro del modo "buscar", así que al hojear
        desaparecían el buscador y el selector, que no tienen nada que ver con
        estar mirando el índice.
    -->
    <div class="chrome">
    <!--
        El tema y el instalar viven aquí, a la derecha del selector: son
        controles ocasionales y no justifican una fila propia, pero tampoco
        merecen quedar enterrados en el panel del engranaje.
    -->
    <div class="mb-2 select-row">
        <DictionarySelect
            {dictionaries}
            value={dictionaryId}
            {uiLanguage}
            onSelect={onSelectDictionary}
        />

        <InstallButton {uiLanguage} />
        <ThemeToggle language={uiLanguage} />
    </div>

    <div class="input-group search-box">
        <input
            bind:this={searchInput}
            type="text"
            class="form-control"
            role="combobox"
            aria-expanded={isSuggesting}
            aria-controls="search-suggestions"
            aria-autocomplete="list"
            placeholder={searchPlaceholder}
            bind:value={word}
            oninput={refreshSuggestions}
            onkeydown={onSearchKeyDown}
            onkeyup={checkForSearchEnter}
            onfocus={onSearchFocus}
            onblur={onSearchBlur}
        />
        <button
            class="btn btn-outline-secondary search-button"
            type="button"
            onclick={searchWord}
            disabled={!wordIsValid}>{searchButton}</button
        >

        <!--
            Sólo en pantallas estrechas: ahí no caben las dos columnas y el
            índice se pliega. En escritorio está siempre a la vista y el botón
            sobra.
        -->
        <button
            class="btn btn-outline-secondary index-toggle"
            type="button"
            title={indexText}
            aria-label={indexText}
            aria-pressed={isIndexOpen}
            onclick={() => (isIndexOpen = !isIndexOpen)}
        >
            <Icon name="book" size={14} />
        </button>

        <!-- El equivalente a abrir el diccionario de papel por cualquier página. -->
        <button
            class="btn btn-outline-secondary"
            type="button"
            title={randomText}
            aria-label={randomText}
            onclick={openRandomWord}
        >
            <Icon name="shuffle" size={14} />
        </button>

        {#if isSuggesting}
            <ul class="suggestions" id="search-suggestions" role="listbox">
                {#each suggestions as suggestion, index (suggestion)}
                    <li
                        role="option"
                        aria-selected={index == highlightedSuggestion}
                        class="suggestion"
                        class:highlighted={index == highlightedSuggestion}
                        onmousedown={() => applySuggestion(suggestion)}
                        onmouseenter={() => (highlightedSuggestion = index)}
                    >
                        {suggestion}
                    </li>
                {/each}
            </ul>
        {/if}
    </div>

    </div>

    <SavedWords
        {uiLanguage}
        revision={savedRevision}
        visible={areSavedVisible}
        onOpen={async (savedWord, savedDictionary) => {
            if (savedDictionary != dictionaryId) onSelectDictionary(savedDictionary);

            word = savedWord;
            isWordOfTheDay = false;
            await searchWord();
        }}
    />

    <OfflineManager
        {dictionaryId}
        {uiLanguage}
        onChanged={onDictionariesChanged}
    />

    <div class="panes" class:index-open={isIndexOpen}>
        <div class="pane-index">
            <WordIndex
                dictionary={dictionaries.find((d) => d.id == dictionaryId)}
                {uiLanguage}
                words={wordIndex}
                selected={resolvedWord}
                jumpPrefix={typedPrefix}
                onOpenWord={openFromIndex}
                onDownloaded={async () => {
                    await onDictionariesChanged();
                    wordIndex = await loadWordIndex(dictionaryId);
                }}
            />
        </div>

        <div class="pane-entry">
    {#if !isLoading && result?.status == "ok"}
        {#if isWordOfTheDay}
            <p class="word-of-the-day text-body-secondary">
                <Icon name="sun" size={14} />
                {wordOfTheDayText}
            </p>
        {/if}

        {#each result.words as defWord, index}
            <Word
                {language}
                word={defWord}
                inflections={index === 0 ? inflections : []}
                isSaved={index === 0 ? isSaved : false}
                source={index === 0 ? result.source : null}
                canGoPrevious={index === 0 && currentPosition > 0}
                canGoNext={index === 0 &&
                    wordIndex != null &&
                    currentPosition >= 0 &&
                    currentPosition < wordIndex.length - 1}
                onToggleSaved={index === 0 ? toggleSaved : undefined}
                onShare={index === 0 ? share : undefined}
                onPrevious={index === 0 ? () => stepWord(-1) : undefined}
                onNext={index === 0 ? () => stepWord(1) : undefined}
                onSearch={async (text) => {
                    word = text;
                    isWordOfTheDay = false;
                    await searchWord();
                }}
            />
        {/each}
    {/if}

    {#if !isLoading && result?.status == "not-found"}
        <p class="text-center">
            {noResultsFor} "{result.word}".

            {#if elsewhere.length > 0}
                <span class="d-block elsewhere">
                    {alsoInText}
                    {#each elsewhere as id}
                        <button
                            type="button"
                            class="chip"
                            onclick={() => onSelectDictionary(id)}
                        >
                            {dictionaryLabel(
                                dictionaries.find((d) => d.id == id) ?? {
                                    language: id,
                                    glossLanguage: id,
                                    name: id,
                                    words: 0,
                                    forms: 0,
                                    bytes: 0,
                                },
                                uiLanguage,
                            )}
                        </button>
                    {/each}
                </span>
            {/if}

            {#if !hasOnlineSources(dictionaryId)}
                <!-- Sin fuentes en línea, "sin resultados" significa "no está en
                     el dataset" y no "no existe": conviene decirlo. -->
                <span class="text-body-secondary d-block offline-only">{offlineOnlyNote}</span>
            {/if}
        </p>
    {/if}

    {#if !isLoading && result?.status == "error"}
        <p class="text-center">{errorMessage}</p>
    {/if}

    {#if isLoading}
        <SearchingIndicator {language} />
    {/if}
        </div>
    </div>
</div>

<style>
    /*
     * Sin márgenes laterales propios: los tenía, y hacían que el buscador
     * quedase 1rem por dentro de la cabecera y del pie, que no los llevan. El
     * ancho lo fija el contenedor de la página, no cada bloque por su cuenta.
     */
    .dictionary {
        width: 100%;
    }

    /*
     * El índice a la izquierda y la entrada a la derecha, como el lomo y la
     * página de un diccionario abierto. No son dos modos: conviven, y por eso
     * el índice marca la palabra que estás leyendo.
     */
    .panes {
        display: grid;
        grid-template-columns: minmax(13rem, 19rem) 1fr;
        gap: 1rem;
        align-items: start;
    }

    .pane-index {
        position: sticky;
        top: 0.5rem;
    }

    .pane-entry {
        min-width: 0;
    }

    .index-toggle {
        display: none;
    }

    /*
     * En pantallas estrechas el campo se queda con una línea entera y los
     * botones bajan a la siguiente. Con los cuatro en fila, escribir sucedía en
     * un hueco de unos 170 px.
     */
    @media (max-width: 36rem) {
        .search-box {
            flex-wrap: wrap;
            row-gap: 0.4rem;
        }

        .search-box :global(input) {
            flex: 1 1 100%;
            border-radius: 0.375rem;
        }

        .search-box :global(.btn) {
            flex: 1 1 0;
            border-radius: 0.375rem;
        }

        /*
         * Desplazado, la barra pegajosa se queda en una sola fila: el campo y
         * los dos iconos. "Buscar" se retira porque Intro hace lo mismo y en
         * esa fila cuesta 40 px permanentes.
         */
        .scrolled .search-box :global(input) {
            flex: 1 1 auto;
        }

        .scrolled .search-box .search-button {
            display: none;
        }
    }

    /*
     * Por debajo de 62rem no caben dos columnas legibles: el índice pasa a
     * plegarse tras su botón y ocupa el ancho entero cuando se abre.
     */
    @media (max-width: 62rem) {
        .panes {
            grid-template-columns: 1fr;
        }

        .pane-index {
            display: none;
            position: static;
        }

        .index-open .pane-index {
            display: block;
        }

        .index-open .pane-entry {
            display: none;
        }

        .index-toggle {
            display: inline-flex;
            align-items: center;
        }
    }

    .text-center {
        text-align: center;
    }

    /*
     * El armazón queda pegado arriba: leyendo una entrada larga no hay que subir
     * del todo para buscar la siguiente.
     */
    .chrome {
        position: sticky;
        top: 0;
        z-index: 1040;
        background: var(--bs-body-bg);
        padding-bottom: 0.5rem;
    }

    .select-row {
        display: flex;
        align-items: center;
        gap: 0.35rem;
    }

    /* El selector se queda con todo el ancho que dejen los dos iconos. */
    .select-row :global(.dictionary-select) {
        flex: 1;
        min-width: 0;
    }

    /* Compacto al desplazar: sólo queda el campo. */
    .scrolled .select-row {
        display: none;
    }

    .search-box {
        position: relative;
    }

    .word-of-the-day {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.8rem;
        margin-bottom: 0.25rem;
    }

    .suggestions {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        z-index: 1050;
        margin: 0.25rem 0 0;
        padding: 0.25rem;
        list-style: none;
        max-height: 14rem;
        overflow-y: auto;
        background: var(--bs-body-bg);
        border: 1px solid var(--bs-border-color);
        border-radius: 0.375rem;
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    }

    .suggestion {
        padding: 0.35rem 0.6rem;
        border-radius: 0.25rem;
        cursor: pointer;
    }

    .suggestion.highlighted {
        background: var(--bs-secondary-bg);
    }

    .elsewhere {
        margin-top: 0.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        justify-content: center;
        align-items: center;
        font-size: 0.9rem;
    }

    .chip {
        border: 1px solid var(--bs-border-color);
        border-radius: 999px;
        background: var(--bs-tertiary-bg);
        color: var(--bs-body-color);
        padding: 0.15rem 0.6rem;
        font-size: 0.8rem;
        cursor: pointer;
    }

    .chip:hover {
        background: var(--bs-secondary-bg);
    }
</style>
