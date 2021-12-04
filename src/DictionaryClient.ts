const API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";

export async function getDefinition(word: string): Promise<ClientResponse> {
    const apiResponse = await fetch(API_URL + word);
    const body = await apiResponse.text();

    let clientResponse: ClientResponse = {
        status: apiResponse.status,
        json: null,
        word: word,
    };

    if (!apiResponse.ok) {
        console.error(body);
        return clientResponse;
    }

    clientResponse.json = JSON.parse(body) as Word[];
    return clientResponse;
}

export interface ClientResponse {
    status: number;
    json: Word[] | null;
    word: string;
}

export interface Word {
    word: string;
    phonetic: string | null;
    phonetics: Phonetic[];
    origin: string | undefined;
    meanings: Meaning[];
}

export interface Phonetic {
    text: string;
    audio: string;
}

export interface Meaning {
    partOfSpeech: string;
    definitions: Definition[];
}

export interface Definition {
    definition: string;
    example: string;
    synonyms: string[];
    antonyms: string[];
}
