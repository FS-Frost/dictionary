# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

Runtime: **bun** (no npm/yarn/pnpm; existe `bun.lock`).

```shell
bun install
bun run dev          # vite dev, http://localhost:5000
bun run build        # build estático -> build/
bun run preview      # sirve el build en el mismo puerto 5000
bun run check        # svelte-check: tipos y plantillas
bun run test         # vitest (unitarios + integridad del dataset)
bun run test:watch
bun run test:e2e     # playwright: modo offline con red cortada
```

Un solo test: `bun x vitest run src/lib/dictionary/key.test.ts`, o `-t "nombre del test"`.

Los e2e necesitan un Chromium (`bunx playwright install chromium`). Si ya hay uno
en la máquina, `CHROMIUM_PATH=/ruta/al/chrome bun run test:e2e` evita la descarga.
Playwright levanta él mismo el servidor (`build` + `preview`), no hace falta
arrancarlo aparte.

## Arquitectura

SvelteKit 2 + Svelte 5 (runes), TypeScript, `adapter-static`, **sin backend**.
Todo se prerenderiza y se sirve como estático desde GitHub Pages.

### Lo que define el proyecto: funciona sin conexión

El diccionario **no es un cliente de una API**. Las ~30.000 palabras más
frecuentes de cada idioma van empaquetadas en el propio repo, y la red es sólo el
plan B. Esto condiciona casi todas las decisiones de abajo.

`src/lib/dictionary/index.ts` es el único punto de entrada. Orden de consulta:

```
es: dataset local -> rae-api.com -> freedictionaryapi.com
en: dataset local -> api.dictionaryapi.dev -> freedictionaryapi.com
```

Dos reglas que no son arbitrarias:

- **En español la RAE va primero** porque define *en español*. `freedictionaryapi`
  sirve el Wiktionary inglés y devuelve `agua` → "water", que no sirve para un
  diccionario español.
- **`api.dictionaryapi.dev` sólo se usa en inglés.** Para español devuelve 404
  hasta con palabras como "agua"; ese era el bug que dejaba media app inservible.

Ninguna fuente usa API key: no hay dónde esconder un secreto en un sitio estático.

### El dataset empaquetado

`static/data/` son 64 shards por idioma (~55 MB en total) generados por
`scripts/build-dataset.ts` a partir de los volcados de wiktextract de kaikki.org.
**Se commitean**: GitHub Pages no tiene otro origen desde el que servirlos.

Regenerar (paso manual, el volcado cambia cada semana):

```shell
bun run dataset:es --input <es.jsonl.gz> --freq <es_50k.txt>
bun run dataset:en --input <en.jsonl.gz> --freq <en_50k.txt>
```

Los volcados salen de `kaikki.org` (ojo: `/eswiktionary/Español` son las glosas en
español; `/dictionary/Spanish` son palabras españolas glosadas en inglés, que no
es lo que queremos). Las listas de frecuencia, de `hermitdave/FrequencyWords`.

**`src/lib/dictionary/key.ts` lo comparten el generador y el cliente.** Si la
normalización o el hash divergen, el cliente pide shards donde la palabra no está
y el modo offline falla *en silencio*, sin errores. `src/tests/dataset-integrity.test.ts`
existe justamente para que eso no pase desapercibido.

### Búsqueda offline

`offline/dataset.ts` resuelve en tres pasos: clave normalizada (sin acentos, así
"corazon" encuentra "corazón") → tabla de flexiones del shard ("aguas" → "agua")
→ nada, y sale a la red.

Los shards se bajan bajo demanda y se guardan en IndexedDB (`offline/store.ts`).
Eso sólo cubre lo ya visitado, así que `prefetchLanguage()` descarga el idioma
entero cuando el usuario lo pide desde `OfflineToggle.svelte` — es lo que hace
que el offline sea real y no una promesa a medias.

El **manifiesto se persiste en IndexedDB**, no sólo en el caché del service
worker. Si dependiera del worker, la búsqueda offline fallaría mientras el worker
todavía no controla la página.

### Service worker

`static/worker.js`, registrado a mano en `src/app.html`. Vive en la **raíz** del
sitio a propósito: desde `static/js/` su scope no cubriría la app (y durante años
registró una ruta que daba 404, así que el PWA nunca funcionó).

Dos cachés: el cascarón con *network first* (para recoger despliegues nuevos) y
los shards con *cache first* (son inmutables por versión de manifiesto). El
manifiesto se excluye del caché de datos a propósito: es quien anuncia versiones
nuevas.

Las navegaciones se cachean **por ruta, sin query**: el estado vive en
`?lang=&word=`, y cachearlas tal cual guardaría una copia por búsqueda sin que
ninguna sirviera para la siguiente.

La página envía al worker (`warm-cache`) los recursos que de verdad cargó. Sin
eso, los bundles con nombre hasheado nunca pasan por el worker en la primera
visita y el arranque offline dependería del caché HTTP del navegador.

### Sin CDNs

Bootstrap va en `static/vendor/`, y los iconos son SVG en línea
(`src/lib/gui/Icon.svelte`). Antes venían de jsDelivr y cdnjs: una app que
presume de funcionar sin red no puede quedarse sin estilos en cuanto se cae.
El JS de Bootstrap no se carga porque no se usa ningún componente que lo necesite.
**No reintroduzcas un CDN**; hay un test e2e que lo comprueba.

### Enrutamiento

Sólo existe una ruta SvelteKit. `src/routes/Router.svelte` despacha por `?page=`
y `Dictionary.svelte` gestiona `?lang=` y `?word=` con `pushState`. El estado va
en query params, no en el path, porque Pages no resuelve rutas anidadas de un
sitio estático sin fallback.

### i18n

No hay librería: cada string es un `$derived` ternario sobre `isLangEnglish`.
Al añadir texto visible, sigue el patrón — el idioma de la interfaz es el mismo
que el del diccionario que se está consultando.

## Deploy

Push a `master` → `.github/workflows/main.yml`: check, unitarios, e2e, build, y
dos pasos que **no se reproducen en un build local**:

1. `sed` reescribe `<base href="/">` a `<base href="/dictionary/">`.
2. Genera `build-info.json` y `.nojekyll`.

Todo lo que dependa de rutas absolutas se romperá en producción aunque funcione
en local. Por eso el código usa rutas relativas (`data/...`, `./worker.js`).
