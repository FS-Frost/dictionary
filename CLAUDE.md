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

**Deja el puerto 5000 libre antes de correr los e2e.** La configuración usa
`reuseExistingServer`, así que si tienes un `bun run dev` o un `preview` viejo
levantado, Playwright lo reutiliza en vez de construir:

- con el **dev server**, servir 64 shards sin compilar multiplica por diez lo que
  tardan los tests (de ~40 s a varios minutos);
- con un **preview viejo**, los fallos son peores y desconciertan: `vite preview`
  fija el listado de ficheros al arrancar, así que tras reconstruir sirve el HTML
  nuevo pero devuelve **404 en los bundles nuevos**, y la aplicación no monta. El
  síntoma es `Failed to fetch dynamically imported module` y ningún test
  encuentra nada.

Capturas del README: `bun run screenshots` (config aparte, fuera de `tests/e2e/`
para que CI no las genere: exigen descargar un diccionario entero).

## Arquitectura

SvelteKit 2 + Svelte 5 (runes), TypeScript, `adapter-static`, **sin backend**.
Todo se prerenderiza y se sirve como estático desde GitHub Pages.

### Lo que define el proyecto: funciona sin conexión

El diccionario **no es un cliente de una API**. Las ~30.000 palabras más
frecuentes de cada idioma van empaquetadas en el propio repo, y la red es sólo el
plan B. Esto condiciona casi todas las decisiones de abajo.

`src/lib/dictionary/index.ts` es el único punto de entrada. Orden de consulta:

```
es:    dataset local -> rae-api.com -> freedictionaryapi.com
en:    dataset local -> api.dictionaryapi.dev -> freedictionaryapi.com
*-en:  dataset local (y nada más)
```

Dos reglas que no son arbitrarias:

- **En español la RAE va primero** porque define *en español*. `freedictionaryapi`
  sirve el Wiktionary inglés y devuelve `agua` → "water", que no sirve para un
  diccionario español.
- **`api.dictionaryapi.dev` sólo se usa en inglés.** Para español devuelve 404
  hasta con palabras como "agua"; ese era el bug que dejaba media app inservible.

Ninguna fuente usa API key: no hay dónde esconder un secreto en un sitio estático.

### El dataset empaquetado

`static/data/` son 64 shards por **diccionario** (~100 MB en total) generados por
`scripts/build-dataset.ts`. **Se commitean**: GitHub Pages no tiene otro origen
desde el que servirlos.

Hay seis diccionarios y no todos son lo mismo:

| id | Palabras | Definiciones | Origen |
|---|---|---|---|
| `es` | español | **español** | kaikki.org `eswiktionary/Español` |
| `en` | inglés | inglés | kaikki.org `dictionary/English` |
| `fr-en` | francés | inglés | tdulcet/compact-dictionaries |
| `de-en` | alemán | inglés | idem |
| `it-en` | italiano | inglés | idem |
| `pt-en` | portugués | inglés | idem |

**Los `*-en` definen en inglés.** Por eso son diccionarios aparte con nombre
propio ("Français → inglés") y no sustituyen a `es`: usar el español de
compact-dictionaries devolvería `agua` → "water", que es exactamente el bug que
este proyecto arregló. Si alguna vez añades un `es-en`, tiene que convivir con
`es`, no reemplazarlo.

Los bilingües **no tienen fuente en línea** (`SOURCES_BY_DICTIONARY` en
`index.ts`): ninguna API pública devuelve francés glosado en inglés. Son
exclusivamente offline y la interfaz lo dice cuando no encuentra una palabra.

Regenerar (paso manual, los volcados cambian cada semana):

```shell
# monolingües, desde los volcados de kaikki
bun run dataset:es --input <es.jsonl.gz> --freq <es_50k.txt>
bun run dataset:en --input <en.jsonl.gz> --freq <en_50k.txt>

# bilingües, desde compact-dictionaries (JSON Lines sin comprimir)
bun run scripts/build-dataset.ts --format compact \
    --lang fr --gloss en --name "Français" \
    --input dictionary-fr.jsonl --freq fr_50k.txt
```

El formato `compact` pierde etimologías y ejemplos, y sus `p` (categorías) y `d`
(definiciones) **no van en paralelo**, así que no se puede atribuir cada glosa a
su categoría: el generador emite un único `Meaning` con las categorías juntas en
vez de inventarse un reparto.

Los volcados salen de `kaikki.org` (ojo: `/eswiktionary/Español` son las glosas en
español; `/dictionary/Spanish` son palabras españolas glosadas en inglés, que no
es lo que queremos). Las listas de frecuencia, de `hermitdave/FrequencyWords`.

**`src/lib/dictionary/key.ts` lo comparten el generador y el cliente.** Si la
normalización o el hash divergen, el cliente pide shards donde la palabra no está
y el modo offline falla *en silencio*, sin errores. `src/tests/dataset-integrity.test.ts`
existe justamente para que eso no pase desapercibido.

### Índice alfabético, sugerencias y palabra del día

`data/<id>/index.json` (~300 KB) trae las palabras del diccionario ordenadas. Es
un fichero aparte y no algo derivado de los shards por una razón concreta: las
palabras se reparten entre los 64 *por hash*, así que reconstruir el orden
exigiría tenerlos todos. Con el índice suelto, hojear y autocompletar funcionan
teniendo red **una vez**, sin descargar el diccionario entero.

Se apoya en él todo esto:

- `suggest()` — búsqueda binaria por prefijo sobre el índice ya ordenado.
- `findInOtherDictionaries()` — "no está aquí, pero sí en Français → inglés".
  Sólo mira los diccionarios cuyo índice ya está disponible y **nunca sale a la
  red a por definiciones**: es una pista para saltar, no otra búsqueda.
- `wordOfTheDay()` — determinista a partir de `fecha + diccionario`, no aleatoria
  y guardada: así es la misma en el móvil y en el portátil, y no necesita
  servidor. El hash es FNV-1a porque con uno pobre los días consecutivos caen en
  palabras vecinas y sale siempre la misma letra.

### Permanencia del almacenamiento

Lo que una web guarda en IndexedDB es **desechable**: el navegador puede tirarlo
para liberar disco, sin avisar. En una app cuya promesa es funcionar sin red eso
es el peor fallo posible — el marcador dice "descargado", los 34 MB no están, y
se descubre en el avión.

Por eso `offline/storage.ts` pide `navigator.storage.persist()` **al terminar una
descarga** (no al arrancar: algunos navegadores enseñan un aviso, y sólo tiene
sentido tras decidir guardar algo). El navegador puede negarse, así que el gestor
enseña el estado real en vez de darlo por hecho.

También se mira el espacio **antes** de empezar: bajar 34 MB para que el último
shard falle por cuota gasta los datos del usuario y deja el diccionario a medias.

### Una sola vista: índice y entrada

**No hay modos.** `Dictionary.svelte` es el diccionario entero: un armazón fijo
arriba (selector, buscador, recientes, gestor) y debajo dos paneles — el índice a
la izquierda, la entrada a la derecha.

Esto fue un rediseño, y conviene saber de qué: antes eran dos pestañas,
"Buscar" y "Hojear", y al hojear se le ponía `display:none` al componente que
contenía **también el buscador y el selector de diccionario**. Hojear no cambiaba
la vista: te quitaba controles que no tenían nada que ver. La lección es que el
índice y la entrada no son dos modos sino dos caras del mismo objeto, igual que
el lomo y la página de un diccionario abierto.

De ahí salen tres comportamientos que conviene no romper:

- **Teclear mueve el índice** (`jumpPrefix`), antes de pulsar Enter. Es lo que
  hace que buscar y hojear sean el mismo gesto y no dos sitios.
- **La palabra abierta va marcada** en el índice y la página la sigue: es el
  pulgar guardando el sitio.
- **Palabra anterior/siguiente** (flechas ← →) recorre el orden del diccionario,
  no el historial.

Por debajo de 62rem no caben dos columnas legibles: el índice se pliega tras su
botón y ocupa el ancho entero al abrirse. Y por debajo de 36rem el buscador se
queda con una línea entera y sus botones bajan a la siguiente — con los cuatro en
fila, escribir sucedía en un hueco de unos 170 px.

`WordIndex.svelte` pagina de 60 en 60 con palabras guía, corte lateral A–Z y un
**segundo nivel** dentro de la letra actual ("ca ce ci co cu") — con sólo A–Z, la
"C" del español es un salto de decenas de páginas.

Cuidado con las iniciales: se calculan quitando acentos **a mano**, no con
`normalizeKey`, que además quita la puntuación. Con ella, "&c." contaba como "C"
y aparecía una "C" suelta encabezando el alfabeto.

Funciona con el índice, así que **no exige tener el diccionario descargado**:
basta haber tenido red una vez. Abrir una palabra baja su shard, no el
diccionario.

### Búsqueda offline

`offline/dataset.ts` resuelve en tres pasos: clave normalizada (sin acentos, así
"corazon" encuentra "corazón") → tabla de flexiones del shard ("aguas" → "agua")
→ nada, y sale a la red.

Los shards se bajan bajo demanda y se guardan en IndexedDB (`offline/store.ts`).
Eso sólo cubre lo ya visitado, así que `prefetchLanguage()` descarga el idioma
entero cuando el usuario lo pide desde `OfflineManager.svelte` — es lo que hace
que el offline sea real y no una promesa a medias.

`OfflineManager.svelte` es además el panel de gestión: enseña **los dos idiomas**
a la vez (no sólo el que se consulta), permite cancelar una descarga a medias
(`prefetchLanguage` acepta un `AbortSignal`) y borrar un idioma ya descargado
(`deleteLanguage`). Lo borrado se va de IndexedDB **y del caché en memoria**: si
sólo se fuera de disco, las búsquedas seguirían respondiendo desde memoria
mientras la UI dice "sin descargar".

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

Bootstrap (5.3.x) va en `static/vendor/`, y los iconos son SVG en línea
(`src/lib/gui/Icon.svelte`). Antes venían de jsDelivr y cdnjs: una app que
presume de funcionar sin red no puede quedarse sin estilos en cuanto se cae.
El JS de Bootstrap no se carga porque no se usa ningún componente que lo necesite
— el panel de diccionarios y el selector de tema abren y cierran con `$state`,
no con los *collapse* de Bootstrap.
**No reintroduzcas un CDN**; hay un test e2e que lo comprueba.

### Avisos (toasts)

`src/lib/toast.svelte.ts` + `Toaster.svelte`. Es el **único** canal para contar
lo que pasa: cambio de tema, descarga terminada/cancelada/fallida, borrado de un
idioma y fallos de búsqueda. Antes cada caso se contaba a su manera —o no se
contaba, como los fallos de las fuentes en línea.

El módulo es **agnóstico del idioma**: recibe el texto ya traducido. Dos detalles
que no son adorno:

- `key` sustituye el aviso anterior con la misma clave en lugar de apilarlo.
  Sin eso, pulsar el tema tres veces deja tres avisos.
- El `Toaster` monta **dos** regiones `aria-live` (`polite` y `assertive`) que
  existen siempre, aunque estén vacías. El nivel se fija en el contenedor, no en
  el mensaje, y una región que aparece con su primer aviso no lo anuncia.

### Tema claro/oscuro

`src/lib/theme.svelte.ts`, con tres estados: `light`, `dark` y `auto` (sigue al
sistema, y es el valor por defecto). El control es **un solo botón que cicla**
claro → oscuro → sistema; se rotula con el estado actual y anuncia el siguiente,
porque un botón que cicla y se llama como su destino no deja saber dónde estás. Se aplica como `data-bs-theme` en `<html>`,
que es el interruptor **nativo** de Bootstrap 5.3: por eso no hay una paleta
paralela y los estilos propios usan variables `--bs-*` en vez de colores fijos.

El primer pintado lo hace un script **en línea en `app.html`**, no este módulo:
cuando el bundle de Svelte arranca la página ya se dibujó, así que aplicar el
tema desde Svelte significa un fogonazo blanco en cada carga en modo oscuro. Ese
script duplica a propósito la lógica mínima; si cambias la clave `"theme"` o los
valores, cámbialos en los dos sitios.

Cuidado con los colores fijos: `styles.css` tenía `body { color: black }` y un
`label { color: white }` heredados de la plantilla de SvelteKit que dejaban el
tema oscuro ilegible — y el blanco de `label`, también el claro. Por la misma
razón los chips de sinónimos **no** usan la clase `.badge` de Bootstrap, que
trae `color: #fff`.

### Enrutamiento

Sólo existe una ruta SvelteKit. `src/routes/Router.svelte` despacha por `?page=`
y `Dictionary.svelte` gestiona `?lang=` y `?word=` con `pushState`. El estado va
en query params, no en el path, porque Pages no resuelve rutas anidadas de un
sitio estático sin fallback.

### Arranque de la búsqueda

`Dictionary.svelte` lanza la primera búsqueda desde **`afterNavigate`**, no desde
`onMount`, y no es un capricho:

- En `onMount` el componente todavía no sabe qué diccionario pide la URL: la
  página tiene que resolver `listDictionaries()` (asíncrono) antes de aplicar
  `?dict=`. Buscar en `onMount` consultaba el diccionario por defecto.
- Y sobre todo: la búsqueda llama a `pushState`, que en `onMount` revienta con
  *"Cannot call pushState(...) before router is initialized"*. Esa excepción no
  deja un fallo pequeño — tumba el arranque de la aplicación entera y la página
  se queda con el buscador pintado y sin resultados jamás.

`afterNavigate` corre también en la navegación inicial y, por definición, con el
router ya en pie.

### Historial y palabras guardadas

Dos almacenes más en la misma base de IndexedDB (`DB_VERSION` 2). Van ahí y no en
`localStorage` porque comparten ciclo de vida con los shards: si el usuario borra
los datos del sitio, se va todo junto, que es lo que espera.

La clave es `diccionario:palabra`, así que la misma palabra en dos diccionarios
son dos entradas distintas — "arte" en español y en italiano no son lo mismo.
El historial se poda **al escribir**, no al leer: si no, la base crecería sin
tope aunque la lista mostrada estuviera recortada.

### El espacio es del resultado

Reparto medido, no intuido: en un móvil de 844 px de alto, el armazón se comía
572 antes de llegar a la ficha — el 68% de la pantalla para llegar a lo único que
le importa al usuario. Ahora empieza en ~240.

La regla que lo ordena: **el sitio se reparte por frecuencia de uso**, no a
partes iguales. Buscar es constante; cambiar de diccionario, ocasional;
descargar, una vez en la vida; el consejo se lee una vez.

De ahí cuatro decisiones que conviene no deshacer:

- Las **palabras recientes** sólo se enseñan con el buscador enfocado o sin nada
  buscado (145 px permanentes, más que la propia definición). El ocultarlas lleva
  un retardo de 200 ms al perder el foco: pulsar un chip quita el foco del campo
  y, sin él, la tira se desmontaría antes de que el clic se registrase.
- La **fuente** va dentro de la ficha, que es lo que acredita, y las flechas de
  palabra anterior/siguiente en su cabecera, que es donde se navega.
- El **consejo** vive en el pie, y dice "pulsa" — en un móvil, "clic" no aplica.
- La **descarga** es una línea, no un botón a ancho completo; el panel del
  engranaje sigue ofreciéndola con todo el detalle.
- **No hay título en pantalla.** Lo decía ya la pestaña del navegador y costaba
  una fila entera. El `<h1>` sigue en el documento con `visually-hidden`: sin él,
  la página se quedaría sin encabezado para un lector de pantalla. El tema y el
  instalar se mudaron a la derecha del selector de diccionario — son controles
  ocasionales que no justifican fila propia ni merecen quedar enterrados.

Y el armazón es **pegajoso**: al desplazar se reduce a la barra de búsqueda (se
retiran el selector y, en móvil, el botón "Buscar", porque Intro hace lo mismo).

### Acentos: `normalizeKey` sirve para buscar, no para comparar

`normalizeKey` quita acentos y diéresis, y por eso escribir "corazon" encuentra
"corazón". El efecto secundario es que **"cuidara" y "cuidará" comparten clave**,
igual que "pinguino" y "pingüino".

Comparar palabras con esa clave, por tanto, mezcla palabras distintas: buscar
"cuidará" definía también "cuidara" y el índice marcaba las dos.

Para comparar grafías está **`isSameWord`**, que ignora mayúsculas pero no
acentos. La asimetría es deliberada: "water" y "Water" son la misma palabra
escrita de dos formas; "cuidara" y "cuidará" no lo son.

La regla en `preferExactMatch`: si lo escrito coincide con alguna entrada según
`isSameWord`, se devuelven **sólo** esas; si no coincide ninguna, se devuelven
todas las de la clave — que es lo que hace que "corazon" siga encontrando
"corazón".

Y el índice marca la palabra **resuelta** (`resolvedWord`), no lo tecleado: quien
escribe "corazon" está leyendo "corazón", y marcar lo tecleado señalaría una
palabra que no está en pantalla.

### Cuidado con `$effect` y `untrack`

`Dictionary.svelte` relanza la búsqueda cuando cambia el diccionario. Todo lo que
lea `word` dentro de ese efecto **tiene que ir dentro de `untrack`**, guardias
incluidas: basta leerlo fuera para que el efecto se resuscriba y dispare una
búsqueda por cada tecla. El síntoma es sutil — el historial se llena de prefijos
sueltos ("ca", "cas") — y hay un test e2e que lo vigila.

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
