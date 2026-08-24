/**
 * Claves y sharding del dataset offline.
 *
 * Este módulo lo comparten el generador (scripts/build-dataset.ts) y el cliente.
 * Si el hash o la normalización divergen entre ambos, el cliente pide shards que
 * no contienen la palabra y el offline falla en silencio. No dupliques esta lógica.
 */

export const SHARD_COUNT = 64;

/** Marcas diacríticas combinantes, que `normalize("NFD")` separa de su letra base. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Todo lo que no sea letra, número, espacio, apóstrofo o guion. */
const NON_WORD = /[^\p{L}\p{N}\s'-]/gu;

/**
 * Clave de búsqueda: minúsculas, sin acentos, sin puntuación.
 *
 * Se quitan los diacríticos para que "esta" encuentre "está" y "nino" encuentre
 * "niño". Eso provoca colisiones a propósito: cada clave guarda un array de
 * entradas, y la desambiguación es cosa de la UI.
 */
export function normalizeKey(word: string): string {
    return word
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(COMBINING_MARKS, "")
        .replace(NON_WORD, "")
        .replace(/\s+/g, " ");
}

/** FNV-1a de 32 bits. Elegido por ser trivial de reimplementar y estable entre runtimes. */
export function fnv1a(text: string): number {
    let hash = 0x811c9dc5;

    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
}

/** Shard que contiene una clave ya normalizada. */
export function shardIdForKey(key: string): number {
    return fnv1a(key) % SHARD_COUNT;
}

/** Atajo: normaliza y devuelve el shard de una palabra cruda. */
export function shardIdForWord(word: string): number {
    return shardIdForKey(normalizeKey(word));
}
