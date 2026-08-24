import type { Language, LookupStatus, SourceId, Word } from "../types";

export type SourceResult = {
    status: LookupStatus;
    words: Word[];
};

/**
 * Contrato de una fuente online.
 *
 * `lookup` puede lanzar: el router lo trata como `error` y prueba la siguiente.
 * Distinguir "no existe la palabra" (`not-found`) de "la fuente falló" (`error`)
 * importa, porque sólo lo segundo justifica reintentar en otra fuente.
 */
export type Source = {
    id: SourceId;
    supports(language: Language): boolean;
    lookup(word: string, language: Language): Promise<SourceResult>;
};
