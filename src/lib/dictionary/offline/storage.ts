/**
 * Espacio en disco y permanencia.
 *
 * Por defecto, lo que una web guarda en IndexedDB es **desechable**: el
 * navegador puede borrarlo cuando le aprieta el disco, sin avisar y sin que la
 * página se entere. Para una app cuya promesa entera es "funciona sin red" eso
 * es el peor fallo posible: el marcador dice "descargado", los 34 MB ya no
 * están, y el usuario lo descubre en el avión.
 *
 * `navigator.storage.persist()` pide que el almacenamiento sea permanente. El
 * navegador puede negarse (Chrome lo concede según cuánto uses el sitio; Firefox
 * pregunta), así que se pide y se informa del resultado, nunca se da por hecho.
 *
 * Todo degrada a "no se sabe" en navegadores sin la API, jamás lanza.
 */

export type StorageEstimate = {
    /** Bytes ocupados por este sitio. `null` si el navegador no lo dice. */
    usage: number | null;
    /** Bytes totales que el navegador concede. `null` si no lo dice. */
    quota: number | null;
};

function api(): StorageManager | null {
    if (typeof navigator === "undefined") return null;
    return navigator.storage ?? null;
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
    const storage = api();
    if (!storage?.estimate) return { usage: null, quota: null };

    try {
        const estimate = await storage.estimate();
        return { usage: estimate.usage ?? null, quota: estimate.quota ?? null };
    } catch {
        return { usage: null, quota: null };
    }
}

/** Si el navegador ya marcó el almacenamiento como permanente. */
export async function isStoragePersisted(): Promise<boolean> {
    const storage = api();
    if (!storage?.persisted) return false;

    try {
        return await storage.persisted();
    } catch {
        return false;
    }
}

/**
 * Pide almacenamiento permanente.
 *
 * Se llama al terminar una descarga y no al arrancar: algunos navegadores
 * enseñan un aviso, y pedirlo antes de que el usuario haya decidido guardar
 * nada sería pedir permiso para algo que aún no ha hecho.
 */
export async function requestPersistentStorage(): Promise<boolean> {
    const storage = api();
    if (!storage?.persist) return false;

    if (await isStoragePersisted()) return true;

    try {
        return await storage.persist();
    } catch {
        return false;
    }
}

/**
 * Si cabe algo de este tamaño.
 *
 * Se comprueba ANTES de empezar: descargar 34 MB para que el último shard falle
 * por cuota desperdicia los datos del usuario y deja el diccionario a medias.
 * El margen del 15% cubre lo que IndexedDB añade por encima del JSON crudo.
 *
 * Devuelve `true` cuando el navegador no sabe decir cuánto espacio hay: negarse
 * a descargar por falta de información sería peor que intentarlo.
 */
export async function hasRoomFor(bytes: number): Promise<boolean> {
    const { usage, quota } = await getStorageEstimate();
    if (usage === null || quota === null) return true;

    return quota - usage > bytes * 1.15;
}
