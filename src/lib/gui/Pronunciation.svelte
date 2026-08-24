<script lang="ts">
    import { LANG_EN, type Phonetic } from "$lib/dictionary";
    import Icon from "$lib/gui/Icon.svelte";

    type Props = {
        word: string;
        language: string;
        phonetics: Phonetic[];
    };

    let { word, language, phonetics }: Props = $props();

    let audio: HTMLAudioElement | null = null;
    let isPlaying = $state<boolean>(false);

    let isLangEnglish: boolean = $derived(language == LANG_EN);

    // Wiktionary trae grabaciones humanas para muchas palabras, pero no para todas.
    // Cuando falta, la síntesis del navegador es un sustituto aceptable y no
    // cuesta ni una petición de red.
    //
    // No es `$derived` porque si la grabación falla al reproducirse hay que
    // descartarla y caer a la síntesis, y un derivado no admite asignación.
    let recording = $state<string>("");

    $effect(() => {
        recording =
            phonetics.find((phonetic) => phonetic.audio.length > 0)?.audio ?? "";
        audio = null;
    });

    let label: string = $derived(
        isLangEnglish ? "Listen pronunciation" : "Escuchar pronunciación",
    );

    function play(): void {
        if (isPlaying) return;

        if (recording.length > 0) {
            playRecording();
            return;
        }

        speak();
    }

    function playRecording(): void {
        audio ??= new Audio(recording);
        isPlaying = true;

        audio.currentTime = 0;
        audio.onended = () => (isPlaying = false);
        audio.onerror = () => {
            // Si Commons falla, la síntesis sigue disponible.
            isPlaying = false;
            recording = "";
            speak();
        };

        void audio.play().catch(() => {
            isPlaying = false;
        });
    }

    function speak(): void {
        if (typeof speechSynthesis === "undefined") return;

        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = isLangEnglish ? "en-US" : "es-ES";
        utterance.onend = () => (isPlaying = false);
        utterance.onerror = () => (isPlaying = false);

        isPlaying = true;
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
    }
</script>

<button
    class="btn btn-sm btn-outline-secondary"
    type="button"
    title={label}
    aria-label={label}
    onclick={play}
>
    <Icon name={isPlaying ? "volume-loud" : "volume"} size={14} />
</button>
