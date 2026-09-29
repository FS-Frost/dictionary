<script lang="ts">
    import { LANG_EN } from "$lib/dictionary";

    type Props = {
        language: string;
    };

    let { language }: Props = $props();

    let isLangEnglish: boolean = $derived(language == LANG_EN);
    let label: string = $derived(isLangEnglish ? "Searching..." : "Buscando...");

    /**
     * Esqueleto de la ficha que está por llegar, en vez de la palabra
     * "Buscando...".
     *
     * Dibuja el hueco con la forma real del resultado (título, transcripción,
     * categoría, un par de acepciones), así que la página no da el salto de
     * "una línea de texto" a "una ficha entera" cuando responde. Es la misma
     * razón por la que el gestor de diccionarios reserva su altura.
     */
    const LINES = [
        { width: "92%" },
        { width: "78%" },
        { width: "85%" },
    ];
</script>

<div class="card searching" aria-busy="true" aria-live="polite">
    <span class="visually-hidden">{label}</span>

    <div class="card-body" aria-hidden="true">
        <div class="row title">
            <span class="bar word"></span>
            <span class="bar phonetic"></span>
        </div>

        <span class="bar pos"></span>

        {#each LINES as line}
            <span class="bar line" style="width: {line.width}"></span>
        {/each}

        <span class="bar example"></span>
    </div>
</div>

<style>
    .searching {
        margin-bottom: 1rem;
    }

    .row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.9rem;
    }

    .bar {
        display: block;
        height: 0.7rem;
        border-radius: 999px;
        background: var(--bs-secondary-bg);

        /*
         * El brillo viaja sobre un degradado más claro que el fondo de la barra.
         * `background-size: 200%` con la posición animada evita animar `left`,
         * que forzaría un reflow por fotograma.
         */
        background-image: linear-gradient(
            90deg,
            var(--bs-secondary-bg) 0%,
            var(--bs-tertiary-bg) 40%,
            var(--bs-body-bg) 50%,
            var(--bs-tertiary-bg) 60%,
            var(--bs-secondary-bg) 100%
        );
        background-size: 200% 100%;
        animation: shimmer 1.4s ease-in-out infinite;
    }

    .word {
        width: 7rem;
        height: 1.4rem;
    }

    .phonetic {
        width: 4.5rem;
        height: 1rem;
        opacity: 0.7;
    }

    .pos {
        width: 9rem;
        height: 0.9rem;
        margin-bottom: 0.9rem;
    }

    .line {
        margin-bottom: 0.55rem;
    }

    .example {
        width: 60%;
        margin-top: 0.9rem;
        margin-left: 1rem;
        opacity: 0.7;
    }

    /* Desfase entre barras: el brillo recorre la ficha en diagonal en vez de
       parpadear todo a la vez, que es lo que delata un esqueleto barato. */
    .line:nth-child(4) {
        animation-delay: 0.1s;
    }

    .line:nth-child(5) {
        animation-delay: 0.2s;
    }

    .example {
        animation-delay: 0.3s;
    }

    @keyframes shimmer {
        from {
            background-position: 200% 0;
        }
        to {
            background-position: -200% 0;
        }
    }

    /*
     * Sin animación, el esqueleto quieto parece contenido roto. Para quien pide
     * menos movimiento se deja una pulsación muy suave de opacidad, que informa
     * de que algo está pasando sin desplazar nada.
     */
    @media (prefers-reduced-motion: reduce) {
        .bar {
            background-image: none;
            animation: fade 1.8s ease-in-out infinite;
        }

        @keyframes fade {
            0%,
            100% {
                opacity: 1;
            }
            50% {
                opacity: 0.55;
            }
        }
    }
</style>
