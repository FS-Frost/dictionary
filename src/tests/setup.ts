import "@testing-library/jest-dom/vitest";

// jsdom no implementa IndexedDB, y la caché de shards se apoya en ella. Sin este
// polyfill el store se degradaría a "sin caché" y los tests pasarían sin ejercitar
// justamente el camino que queremos comprobar.
import "fake-indexeddb/auto";

import { cleanup } from "@testing-library/svelte";
import { afterEach } from "vitest";

// testing-library sólo registra el desmontaje automático cuando Vitest corre con
// `globals: true`. Sin esto, cada render se acumula en el body y las consultas
// encuentran elementos duplicados de tests anteriores.
afterEach(() => {
    cleanup();
});
