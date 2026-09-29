import { describe, expect, it } from "vitest";

import type { DictionaryInfo } from "$lib/dictionary";
import { dictionaryDescription, dictionaryLabel, glossLanguageName } from "./dictionaryName";

function makeDictionary(overrides: Partial<DictionaryInfo> = {}): DictionaryInfo {
    return {
        language: "fr",
        glossLanguage: "en",
        name: "Français",
        words: 1,
        forms: 1,
        bytes: 1,
        ...overrides,
    };
}

describe("dictionaryLabel", () => {
    /*
     * El caso que obliga a que esto exista: puede haber dos diccionarios del
     * mismo idioma (uno que define en español y otro en inglés). Llamar a los
     * dos "Español" sería mentir sobre lo que dan.
     */
    it("distingue el monolingüe del bilingüe del mismo idioma", () => {
        const monolingual = makeDictionary({ language: "es", glossLanguage: "es", name: "Español" });
        const bilingual = makeDictionary({ language: "es", glossLanguage: "en", name: "Español" });

        expect(dictionaryLabel(monolingual, "es")).toBe("Español");
        expect(dictionaryLabel(bilingual, "es")).toBe("Español → inglés");
    });

    /* El nombre del idioma de las palabras es su endónimo: es como se busca en la lista. */
    it("deja el nombre nativo intacto y traduce sólo el idioma de las definiciones", () => {
        expect(dictionaryLabel(makeDictionary(), "es")).toBe("Français → inglés");
        expect(dictionaryLabel(makeDictionary(), "en")).toBe("Français → English");
    });

    it("cae al código cuando el idioma de glosa no tiene nombre conocido", () => {
        expect(glossLanguageName("zz", "es")).toBe("zz");
    });
});

describe("dictionaryDescription", () => {
    it("explica qué da un bilingüe", () => {
        expect(dictionaryDescription(makeDictionary(), "es")).toBe(
            "Palabras en Français, definidas en inglés",
        );
    });

    it("explica qué da un monolingüe", () => {
        const monolingual = makeDictionary({ language: "en", glossLanguage: "en", name: "English" });

        expect(dictionaryDescription(monolingual, "en")).toBe("Defined in English");
    });
});
