<script lang="ts">
    import { onMount } from "svelte";

    import Dictionary from "$lib/gui/Dictionary.svelte";
    import Icon from "$lib/gui/Icon.svelte";
    import Toaster from "$lib/gui/Toaster.svelte";
    import { getBuildInfo } from "$lib/buildInfo";
    import { LANG_EN, listDictionaries, type LanguageStatus } from "$lib/dictionary";

    const URL_REPO = "https://github.com/FS-Frost/dictionary";
    const URL_WIKTIONARY = "https://www.wiktionary.org/";

    /**
     * La URL se lee de forma SÍNCRONA, en la inicialización.
     *
     * No vale esperar a `onMount` + `listDictionaries()`: el buscador arranca
     * antes de que eso resuelva, busca en el diccionario por defecto y —lo
     * grave— reescribe la URL con `pushState`, borrando el `?dict=` que todavía
     * no se había leído. El resultado era que cualquier enlace a un diccionario
     * que no fuese el de por defecto acababa mostrando otro.
     */
    function paramFromUrl(name: string): string {
        if (typeof window === "undefined") return "";
        return new URLSearchParams(window.location.search).get(name) ?? "";
    }

    let dictionaries = $state<LanguageStatus[]>([]);

    // `lang` es el parámetro viejo, de cuando sólo había un diccionario por
    // idioma. Se sigue aceptando para no romper los enlaces ya compartidos.
    let dictionaryId = $state<string>(
        paramFromUrl("dict") || paramFromUrl("lang") || LANG_EN,
    );

    let requestedWord = $state<string>("");

    let current: LanguageStatus | undefined = $derived(
        dictionaries.find((dictionary) => dictionary.id == dictionaryId),
    );

    /**
     * El idioma de la interfaz es el de las DEFINICIONES, no el de las palabras.
     *
     * Con el diccionario francés-inglés se lee en inglés, así que rotular la
     * aplicación en francés sería prometer algo que el diccionario no da.
     */
    let uiLanguage: string = $derived(current?.glossLanguage ?? LANG_EN);

    let isLangEnglish: boolean = $derived(uiLanguage == LANG_EN);
    let title: string = $derived(isLangEnglish ? "Dictionary" : "Diccionario");

    async function refreshDictionaries(): Promise<void> {
        dictionaries = await listDictionaries();
    }

    /**
     * Atajos globales.
     *
     * Se ignoran mientras se escribe en un campo: `/` es un carácter válido en
     * una búsqueda, y robarlo ahí sería peor que no tener atajo.
     */
    function onKeyDown(event: KeyboardEvent): void {
        const target = event.target as HTMLElement | null;
        const isTyping =
            target?.tagName == "INPUT" ||
            target?.tagName == "TEXTAREA" ||
            target?.isContentEditable === true;

        if (event.ctrlKey || event.metaKey || event.altKey) return;

        if (event.key == "/" && !isTyping) {
            event.preventDefault();
            document.querySelector<HTMLInputElement>(".search-box input")?.focus();
            return;
        }

        if (isTyping) return;

        // Palabra anterior y siguiente: en un diccionario de papel se lee la de
        // al lado sin querer.
        if (event.key == "ArrowLeft" || event.key == "ArrowRight") {
            const label = event.key == "ArrowLeft" ? "Palabra anterior" : "Palabra siguiente";
            const english = event.key == "ArrowLeft" ? "Previous word" : "Next word";

            document
                .querySelector<HTMLButtonElement>(
                    `[aria-label="${label}"], [aria-label="${english}"]`,
                )
                ?.click();
        }
    }

    function openWord(word: string): void {
        requestedWord = word;
    }

    /**
     * El sha del despliegue.
     *
     * Antes se generaba en CI y no lo leía nadie. Enseñarlo aquí convierte un
     * "¿esto está actualizado?" en un enlace al commit exacto que se está
     * sirviendo, que es justo lo que se pregunta de una página que se cachea
     * agresivamente para funcionar sin red.
     */
    let sha = $state<string>("");
    let shortSha: string = $derived(sha.slice(0, 7));

    let dataCredit: string = $derived(
        isLangEnglish ? "Data from" : "Datos de",
    );

    let sourceCredit: string = $derived(
        isLangEnglish ? "Source code" : "Código fuente",
    );

    /*
     * El consejo vive aquí, en el pie.
     *
     * Estaba sobre la ficha, permanente, gastando 48 px para decir algo que se
     * lee una vez — y decía "clic" en un móvil. "Pulsa" vale para el dedo y para
     * el ratón.
     */
    let proTip: string = $derived(
        isLangEnglish
            ? "Tip: tap any word in a definition to look it up."
            : "Consejo: pulsa cualquier palabra de una definición para buscarla.",
    );

    onMount(async () => {
        await refreshDictionaries();

        // Una URL puede pedir un diccionario que ya no existe; en ese caso se cae
        // al de por defecto en vez de dejar la aplicación sin diccionario.
        const exists = dictionaries.some((dictionary) => dictionary.id == dictionaryId);
        if (!exists && dictionaries.length > 0) {
            dictionaryId = LANG_EN;
        }

        // Falla en local, donde CI no ha generado el fichero: no es un error que
        // merezca romper el pie de página.
        try {
            sha = (await getBuildInfo()).sha;
        } catch {
            sha = "";
        }
    });
</script>

<svelte:window onkeydown={onKeyDown} />

<svelte:head>
    <title>{title}</title>
</svelte:head>

<main>
    <!--
        El título está sólo para lectores de pantalla y buscadores: en la
        pantalla lo decía ya la pestaña del navegador, y se llevaba una fila
        entera del sitio que necesita la definición. Quitarlo del todo dejaría la
        página sin encabezado, que es peor para quien no la ve.
    -->
    <h1 class="visually-hidden">{title}</h1>

    <Dictionary
        {dictionaryId}
        {dictionaries}
        {uiLanguage}
        {requestedWord}
        onSelectDictionary={(id) => (dictionaryId = id)}
        onDictionariesChanged={refreshDictionaries}
    />

    <Toaster language={uiLanguage} />

    <footer class="footer text-body-secondary">
        <p class="tip">{proTip}</p>

        <p>
            <span>
                {dataCredit}
                <a href={URL_WIKTIONARY} target="_blank" rel="noreferrer">Wiktionary</a>
                (CC BY-SA)
            </span>

            <span class="separator" aria-hidden="true">·</span>

            <a class="repo" href={URL_REPO} target="_blank" rel="noreferrer">
                <Icon name="github" size={14} />
                {sourceCredit}
            </a>

            {#if shortSha.length > 0}
                <span class="separator" aria-hidden="true">·</span>
                <a
                    class="sha"
                    href="{URL_REPO}/commit/{sha}"
                    target="_blank"
                    rel="noreferrer"
                    title={sha}
                >
                    {shortSha}
                </a>
            {/if}
        </p>
    </footer>
</main>

<style>
    main {
        width: 100%;
        padding: 0.75rem 1rem 1rem;
        margin: 0 auto;
    }

    .footer {
        margin-top: 2rem;
        text-align: center;
        font-size: 0.8rem;
    }

    /* Todo el crédito en una línea. Es flex y no texto suelto para que, cuando no
       quepa, parta por los separadores y no en medio de "Código fuente". */
    .tip {
        font-style: italic;
    }

    .footer p {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 0.4rem;
        margin-bottom: 0.25rem;
    }

    .separator {
        opacity: 0.5;
    }

    /* Cuando no cabe en una línea, el separador se quedaba huérfano al final de
       la primera. Sin él las partes se leen igual de bien apiladas. */
    @media (max-width: 30rem) {
        .separator {
            display: none;
        }

        .tip {
        font-style: italic;
    }

    .footer p {
            gap: 0 0.4rem;
        }
    }

    .repo {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
    }

    .sha {
        font-family: var(--bs-font-monospace);
    }


</style>
