<script lang="ts">
    import Icon from "$lib/gui/Icon.svelte";
    import { LANG_EN } from "$lib/dictionary";
    import { dismissToast, getToasts, type ToastKind } from "$lib/toast.svelte";

    type Props = {
        language: string;
    };

    let { language }: Props = $props();

    let isLangEnglish: boolean = $derived(language == LANG_EN);
    let toasts = $derived(getToasts());

    let closeLabel: string = $derived(isLangEnglish ? "Dismiss" : "Cerrar aviso");

    const ICONS: Record<ToastKind, "check" | "warning" | "info"> = {
        success: "check",
        error: "warning",
        info: "info",
    };
</script>

<!--
    Dos regiones y no una: los lectores de pantalla tratan `polite` y `assertive`
    de forma distinta, y el nivel se fija en el contenedor, no en cada mensaje.
    Un error que interrumpe está bien; que interrumpa un "tema oscuro activado",
    no.

    `aria-live` exige que el contenedor exista desde el principio para anunciar
    lo que se le añade después: si apareciera con el primer aviso, ese primero
    no se leería. Por eso se renderizan siempre, aunque estén vacíos.
-->
<div class="toaster" aria-live="polite">
    {#each toasts.filter((toast) => toast.kind != "error") as toast (toast.id)}
        <div class="toast-item {toast.kind}" role="status">
            <span class="icon"><Icon name={ICONS[toast.kind]} size={16} /></span>

            <span class="body">
                <span class="message">{toast.message}</span>
                {#if toast.detail}
                    <span class="detail">{toast.detail}</span>
                {/if}
            </span>

            <button
                type="button"
                class="close"
                title={closeLabel}
                aria-label={closeLabel}
                onclick={() => dismissToast(toast.id)}
            >
                <Icon name="x" size={14} />
            </button>
        </div>
    {/each}
</div>

<div class="toaster errors" aria-live="assertive">
    {#each toasts.filter((toast) => toast.kind == "error") as toast (toast.id)}
        <div class="toast-item error" role="alert">
            <span class="icon"><Icon name="warning" size={16} /></span>

            <span class="body">
                <span class="message">{toast.message}</span>
                {#if toast.detail}
                    <span class="detail">{toast.detail}</span>
                {/if}
            </span>

            <button
                type="button"
                class="close"
                title={closeLabel}
                aria-label={closeLabel}
                onclick={() => dismissToast(toast.id)}
            >
                <Icon name="x" size={14} />
            </button>
        </div>
    {/each}
</div>

<style>
    /*
     * Abajo y centrado: arriba chocaría con la cabecera y con el propio control
     * que suele dispararlos. `pointer-events: none` en el contenedor para no
     * robar clics sobre el contenido que tapa; los avisos lo reactivan.
     */
    .toaster {
        position: fixed;
        left: 50%;
        transform: translateX(-50%);
        bottom: 1rem;
        z-index: 1080;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: min(28rem, calc(100vw - 2rem));
        pointer-events: none;
    }

    /* Los errores se apilan encima de los avisos normales, no en otra esquina:
       dos columnas de avisos en pantallas distintas se pierden de vista. */
    .errors {
        bottom: auto;
        top: 1rem;
    }

    .toast-item {
        pointer-events: auto;
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        padding: 0.6rem 0.75rem;
        border: 1px solid var(--bs-border-color);
        border-left-width: 4px;
        border-radius: 0.5rem;
        background: var(--bs-body-bg);
        color: var(--bs-body-color);
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
        font-size: 0.875rem;
        animation: slide-in 0.18s ease-out;
    }

    /* El color va en el borde y en el icono, nunca sólo en el color del texto:
       distinguir un aviso de un error no puede depender de ver el matiz. Para
       eso está también el icono, que cambia de forma. */
    .toast-item.success {
        border-left-color: var(--bs-success);
    }

    .toast-item.success .icon {
        color: var(--bs-success-text-emphasis);
    }

    .toast-item.error {
        border-left-color: var(--bs-danger);
    }

    .toast-item.error .icon {
        color: var(--bs-danger-text-emphasis);
    }

    .toast-item.info {
        border-left-color: var(--bs-primary);
    }

    .toast-item.info .icon {
        color: var(--bs-primary);
    }

    .icon {
        display: flex;
        padding-top: 0.1rem;
    }

    .body {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        flex: 1;
    }

    .detail {
        font-size: 0.8rem;
        color: var(--bs-secondary-color);
    }

    .close {
        display: flex;
        align-items: center;
        border: 0;
        background: transparent;
        color: var(--bs-secondary-color);
        padding: 0.1rem;
        cursor: pointer;
        border-radius: 0.25rem;
    }

    .close:hover {
        color: var(--bs-body-color);
    }

    @keyframes slide-in {
        from {
            opacity: 0;
            transform: translateY(0.5rem);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .toast-item {
            animation: none;
        }
    }
</style>
