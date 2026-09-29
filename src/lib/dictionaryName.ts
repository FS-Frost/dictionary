/**
 * Cómo se llama cada diccionario en la interfaz.
 *
 * Hace falta porque ya puede haber **varios diccionarios del mismo idioma**: el
 * español monolingüe (definiciones en español) y, en el futuro, un español
 * glosado en inglés. Llamar a los dos "Español" sería mentir sobre lo que dan.
 *
 * La regla:
 *   - monolingüe  → su nombre nativo:            "Español", "English"
 *   - bilingüe    → origen y destino con flecha: "Français → inglés"
 *
 * El nombre del idioma de las palabras va siempre en **su propio idioma**
 * (endónimo), porque es la etiqueta que el usuario reconoce al buscarlo en la
 * lista. El del idioma de las definiciones va traducido a la interfaz, porque
 * ahí lo que importa es entender en qué idioma se va a leer.
 */

import { LANG_EN, isMonolingual, type DictionaryInfo } from "$lib/dictionary";

/** Nombre del idioma de las glosas, en el idioma de la interfaz. */
const GLOSS_NAMES: Record<string, { en: string; es: string }> = {
    en: { en: "English", es: "inglés" },
    es: { en: "Spanish", es: "español" },
};

export function glossLanguageName(code: string, uiLanguage: string): string {
    const names = GLOSS_NAMES[code];
    if (!names) return code;

    return uiLanguage == LANG_EN ? names.en : names.es;
}

export function dictionaryLabel(dictionary: DictionaryInfo, uiLanguage: string): string {
    if (isMonolingual(dictionary)) return dictionary.name;

    return `${dictionary.name} → ${glossLanguageName(dictionary.glossLanguage, uiLanguage)}`;
}

/**
 * Frase que explica qué es el diccionario, para acompañar al nombre donde haya
 * sitio (el gestor, la cabecera del navegador de palabras).
 */
export function dictionaryDescription(dictionary: DictionaryInfo, uiLanguage: string): string {
    const isLangEnglish = uiLanguage == LANG_EN;

    if (isMonolingual(dictionary)) {
        return isLangEnglish
            ? `Defined in ${glossLanguageName(dictionary.glossLanguage, uiLanguage)}`
            : `Definiciones en ${glossLanguageName(dictionary.glossLanguage, uiLanguage)}`;
    }

    return isLangEnglish
        ? `${dictionary.name} words, defined in ${glossLanguageName(dictionary.glossLanguage, uiLanguage)}`
        : `Palabras en ${dictionary.name}, definidas en ${glossLanguageName(
              dictionary.glossLanguage,
              uiLanguage,
          )}`;
}
