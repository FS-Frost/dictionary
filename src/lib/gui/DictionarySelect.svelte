<script lang="ts">
    import Icon from "$lib/gui/Icon.svelte";
    import { LANG_EN, type LanguageStatus } from "$lib/dictionary";
    import { dictionaryLabel } from "$lib/dictionaryName";

    type Props = {
        dictionaries: LanguageStatus[];
        value: string;
        uiLanguage: string;
        onSelect: (id: string) => void;
    };

    let { dictionaries, value, uiLanguage, onSelect }: Props = $props();

    let isLangEnglish: boolean = $derived(uiLanguage == LANG_EN);

    let isOpen = $state<boolean>(false);
    let query = $state<string>("");
    let highlighted = $state<number>(0);

    let input = $state<HTMLInputElement | null>(null);
    let listbox = $state<HTMLElement | null>(null);

    let label: string = $derived(isLangEnglish ? "Dictionary" : "Diccionario");
    let placeholder: string = $derived(isLangEnglish ? "Filter..." : "Filtrar...");

    let emptyText: string = $derived(
        isLangEnglish ? "No dictionary matches" : "Ningún diccionario coincide",
    );

    let downloadedText: string = $derived(isLangEnglish ? "downloaded" : "descargado");

    let selected: LanguageStatus | undefined = $derived(
        dictionaries.find((dictionary) => dictionary.id == value),
    );

    let selectedLabel: string = $derived(
        selected ? dictionaryLabel(selected, uiLanguage) : "",
    );

    /**
     * El filtro mira el nombre mostrado, el nombre nativo y los códigos de
     * idioma: quien escribe "fr" espera encontrar el francés aunque en pantalla
     * ponga "Français", y quien escribe "inglés" espera los bilingües que
     * definen en inglés.
     */
    let matches: LanguageStatus[] = $derived(
        dictionaries.filter((dictionary) => {
            const needle = query.trim().toLowerCase();
            if (needle.length === 0) return true;

            const haystack = [
                dictionaryLabel(dictionary, uiLanguage),
                dictionary.name,
                dictionary.id,
                dictionary.language,
                dictionary.glossLanguage,
            ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(needle);
        }),
    );

    function open(): void {
        isOpen = true;
        query = "";
        highlighted = Math.max(
            0,
            dictionaries.findIndex((dictionary) => dictionary.id == value),
        );
    }

    function close(): void {
        isOpen = false;
        query = "";
    }

    function choose(dictionary: LanguageStatus | undefined): void {
        if (!dictionary) return;

        onSelect(dictionary.id);
        close();
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (!isOpen) {
            if (event.key == "ArrowDown" || event.key == "Enter") {
                event.preventDefault();
                open();
            }

            return;
        }

        if (event.key == "Escape") {
            event.preventDefault();
            close();
            return;
        }

        if (event.key == "Enter") {
            event.preventDefault();
            choose(matches[highlighted]);
            return;
        }

        if (event.key == "ArrowDown") {
            event.preventDefault();
            highlighted = Math.min(highlighted + 1, matches.length - 1);
            return;
        }

        if (event.key == "ArrowUp") {
            event.preventDefault();
            highlighted = Math.max(highlighted - 1, 0);
        }
    }

    // Al filtrar, la opción resaltada puede quedar fuera de la lista nueva.
    $effect(() => {
        void matches;
        if (highlighted >= matches.length) highlighted = 0;
    });

    $effect(() => {
        if (isOpen) input?.focus();
    });

    /** Cerrar al pulsar fuera: un desplegable que sólo cierra con Escape molesta. */
    function onWindowPointerDown(event: MouseEvent): void {
        if (!isOpen) return;
        if (listbox?.contains(event.target as Node)) return;

        close();
    }
</script>

<svelte:window onmousedown={onWindowPointerDown} />

<div class="input-group dictionary-select" bind:this={listbox}>
    <span class="input-group-text" id="dictionary-label">{label}</span>

    {#if isOpen}
        <input
            bind:this={input}
            type="text"
            class="form-control"
            role="combobox"
            aria-expanded="true"
            aria-controls="dictionary-options"
            aria-autocomplete="list"
            aria-labelledby="dictionary-label"
            {placeholder}
            bind:value={query}
            onkeydown={onKeyDown}
        />
    {:else}
        <button
            type="button"
            class="form-control text-start current"
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-labelledby="dictionary-label"
            onclick={open}
            onkeydown={onKeyDown}
        >
            <span>{selectedLabel}</span>
            <Icon name="chevron-down" size={14} />
        </button>
    {/if}

    {#if isOpen}
        <ul class="options" id="dictionary-options" role="listbox" aria-labelledby="dictionary-label">
            {#each matches as dictionary, index (dictionary.id)}
                <li
                    role="option"
                    aria-selected={dictionary.id == value}
                    class="option"
                    class:highlighted={index == highlighted}
                    onmousedown={() => choose(dictionary)}
                    onmouseenter={() => (highlighted = index)}
                >
                    <span class="option-name">{dictionaryLabel(dictionary, uiLanguage)}</span>

                    <span class="option-meta">
                        {#if dictionary.downloaded}
                            <span class="downloaded">
                                <Icon name="check" size={12} />
                                {downloadedText}
                            </span>
                        {/if}
                    </span>
                </li>
            {:else}
                <li class="option empty">{emptyText}</li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .dictionary-select {
        position: relative;
    }

    /*
     * El control cerrado es un `<button>` con pinta de campo: hace falta que sea
     * un botón de verdad para el teclado y los lectores de pantalla, pero tiene
     * que alinearse con el resto del `input-group`.
     */
    .current {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        cursor: pointer;
        text-align: start;
    }

    .options {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        z-index: 1050;
        margin: 0.25rem 0 0;
        padding: 0.25rem;
        list-style: none;
        max-height: 16rem;
        overflow-y: auto;
        background: var(--bs-body-bg);
        border: 1px solid var(--bs-border-color);
        border-radius: 0.375rem;
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    }

    .option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.4rem 0.6rem;
        border-radius: 0.25rem;
        cursor: pointer;
    }

    .option.highlighted {
        background: var(--bs-secondary-bg);
    }

    .option.empty {
        cursor: default;
        color: var(--bs-secondary-color);
    }

    .option-meta {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.75rem;
        color: var(--bs-secondary-color);
        white-space: nowrap;
    }

    .downloaded {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        color: var(--bs-success-text-emphasis);
    }
</style>
