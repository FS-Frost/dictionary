/**
 * Avisos efímeros (toasts).
 *
 * Existe porque la app tenía tres formas distintas de contar lo que pasaba:
 * una línea de estado para la descarga, un `confirm()` para el borrado y nada
 * en absoluto para los fallos de las fuentes en línea. Lo que no se cuenta se
 * interpreta como que la app se colgó.
 *
 * Deliberadamente **agnóstico del idioma**: recibe el texto ya traducido. La
 * interfaz decide qué idioma habla; este módulo sólo decide cuánto dura y cómo
 * se anuncia.
 */

export type ToastKind = "info" | "success" | "error";

export type Toast = {
    id: number;
    kind: ToastKind;
    message: string;
    /** Texto corto opcional bajo el mensaje, para el detalle del error. */
    detail?: string;
};

export type ToastOptions = {
    kind?: ToastKind;
    detail?: string;
    /** Milisegundos en pantalla. `0` lo deja fijo hasta que se cierre a mano. */
    duration?: number;
    /**
     * Si se indica, un aviso nuevo con la misma clave sustituye al anterior en
     * lugar de apilarse. Evita la cascada de "descargando…" en operaciones que
     * informan de su progreso.
     */
    key?: string;
};

/**
 * Los errores duran más: el usuario tiene que leerlos y, a veces, actuar. Un
 * "hecho" se asimila de un vistazo.
 */
const DURATION_BY_KIND: Record<ToastKind, number> = {
    info: 4000,
    success: 4000,
    error: 7000,
};

/** Más de esto en pantalla tapa la app en vez de informar sobre ella. */
const MAX_VISIBLE = 3;

const state = $state<{ toasts: Toast[] }>({ toasts: [] });

const timers = new Map<number, ReturnType<typeof setTimeout>>();
const keys = new Map<string, number>();

let nextId = 1;

export function getToasts(): Toast[] {
    return state.toasts;
}

function clearTimer(id: number): void {
    const timer = timers.get(id);
    if (timer == null) return;

    clearTimeout(timer);
    timers.delete(id);
}

export function dismissToast(id: number): void {
    clearTimer(id);

    for (const [key, keyed] of keys) {
        if (keyed === id) keys.delete(key);
    }

    state.toasts = state.toasts.filter((toast) => toast.id !== id);
}

export function showToast(message: string, options: ToastOptions = {}): number {
    const kind = options.kind ?? "info";
    const duration = options.duration ?? DURATION_BY_KIND[kind];

    // Reemplazo por clave: se retira el anterior antes de insertar el nuevo, así
    // la posición en la pila no salta mientras se actualiza un mismo aviso.
    if (options.key != null) {
        const previous = keys.get(options.key);
        if (previous != null) dismissToast(previous);
    }

    const id = nextId++;
    const toast: Toast = { id, kind, message, detail: options.detail };

    state.toasts = [...state.toasts, toast].slice(-MAX_VISIBLE);

    if (options.key != null) keys.set(options.key, id);

    // Los descartados por exceso se quedarían con su temporizador vivo, y al
    // dispararse intentarían retirar un aviso que ya no está.
    for (const pending of [...timers.keys()]) {
        if (!state.toasts.some((toast) => toast.id === pending)) clearTimer(pending);
    }

    if (duration > 0) {
        timers.set(
            id,
            setTimeout(() => dismissToast(id), duration),
        );
    }

    return id;
}

/** Atajos, para que quien llama no tenga que recordar la forma de las opciones. */
export function toastSuccess(message: string, options: Omit<ToastOptions, "kind"> = {}): number {
    return showToast(message, { ...options, kind: "success" });
}

export function toastError(message: string, options: Omit<ToastOptions, "kind"> = {}): number {
    return showToast(message, { ...options, kind: "error" });
}

/** Sólo para tests: deja el módulo como recién cargado. */
export function resetToasts(): void {
    for (const id of [...timers.keys()]) clearTimer(id);

    keys.clear();
    state.toasts = [];
    nextId = 1;
}
