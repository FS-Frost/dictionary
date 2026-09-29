/**
 * Palabra del día y palabra al azar.
 *
 * La aplicación arrancaba con una búsqueda fija escrita en el código (`water`),
 * que no es una bienvenida: es un resto de depuración. Con el índice alfabético
 * ya disponible salen casi gratis dos cosas mejores.
 *
 * La del día es **determinista a partir de la fecha**, no aleatoria y guardada:
 * así es la misma en el móvil y en el portátil, sobrevive a borrar los datos del
 * sitio y no necesita servidor — que es la única opción en un sitio estático.
 */

/**
 * Hash de cadena a entero (FNV-1a de 32 bits).
 *
 * Hace falta uno con buena dispersión: con algo tan simple como sumar los
 * códigos, dos días seguidos caerían en palabras vecinas del índice y la
 * "palabra del día" sería siempre de la misma letra.
 */
function hashString(value: string): number {
    let hash = 2166136261;

    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

/** `YYYY-MM-DD` en hora local: el día del usuario, no el UTC. */
export function dayKey(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");

    return `${year}-${month}-${day}`;
}

/**
 * La palabra de hoy para este diccionario.
 *
 * El diccionario entra en el hash para que el día que cambias de idioma no te
 * salga la palabra que ocupa la misma posición en el otro.
 */
export function wordOfTheDay(
    words: string[],
    dictionaryId: string,
    date: Date = new Date(),
): string | null {
    if (words.length === 0) return null;

    return words[hashString(`${dayKey(date)}:${dictionaryId}`) % words.length];
}

/** Una palabra cualquiera. El equivalente a abrir el diccionario al azar. */
export function randomWord(words: string[]): string | null {
    if (words.length === 0) return null;

    return words[Math.floor(Math.random() * words.length)];
}
