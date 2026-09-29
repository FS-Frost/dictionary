# Plan de mejoras

Escrito y luego ampliado a lo largo de varias tandas: tema oscuro y gestión de
diccionarios, avisos y cabecera, y por último los seis diccionarios con el modo
de hojear. Lo de aquí **no está hecho**: es la lista de lo que encontré por el
camino, ordenada por lo que de verdad cambia la experiencia frente a lo que
cuesta.

Cada punto lleva el *por qué* antes del *cómo* a propósito. Una propuesta sin un
problema concreto detrás es una excusa para reescribir código que funciona.

---

## Prioridad 1 — problemas reales del producto

### 1.1 Cada palabra de la definición es un `<button>`

**Qué pasa hoy.** `Word.svelte` parte cada definición por espacios y envuelve
*cada palabra* en un `<span role="button" tabindex="0">`. Una entrada como
`water` genera del orden de mil elementos enfocables.

**Por qué importa.** Tres consecuencias, de peor a menor:

1. **Accesibilidad rota.** Un lector de pantalla anuncia "botón" mil veces en
   lugar de leer una frase. Tabular por la página exige mil pulsaciones para
   pasar de largo. Y el `onkeydown={() => {}}` que acompaña a cada uno es un
   manejador vacío: el elemento *dice* ser un botón y no responde a Enter ni a
   Espacio. Es peor que no marcarlo, porque promete una interacción que no
   existe.
2. **Seleccionar y copiar una definición es incómodo**, porque se arrastra sobre
   mil elementos en vez de sobre un párrafo.
3. **Coste de render** en palabras con muchas acepciones.

**Cómo lo haría.** Un solo manejador en el `<p>` de la definición, y la palabra
se deduce del punto pulsado con `document.caretPositionFromPoint()` (con
`caretRangeFromPoint` de reserva para Safari), expandiendo el rango hasta los
límites de palabra. El párrafo pasa a ser texto normal: un nodo, seleccionable,
copiable, leído como una frase. La afordancia de "esto se puede pulsar" se
resuelve con `cursor: pointer` en el párrafo y la nota que ya existe
("Pro tip: clic en una palabra para buscarla").

Para teclado, que es donde hoy no hay nada real, la vía correcta no es hacer mil
botones accesibles sino **no necesitarlos**: el campo de búsqueda ya está ahí.

**Esfuerzo.** Medio día. **Riesgo.** Bajo, pero toca el componente más visible;
conviene apoyarse en los tests de `Word.test.ts`, que ya cubren "busca la palabra
al pulsarla" y seguirían valiendo como contrato.

### 1.2 El idioma de la interfaz va atado al del diccionario

**Qué pasa hoy.** `isLangEnglish` decide a la vez qué diccionario se consulta y
en qué idioma se rotula la aplicación. Un hispanohablante que busca palabras en
inglés — el caso de uso más probable de este proyecto — se encuentra la interfaz
entera en inglés.

**Por qué importa.** Es exactamente al revés de lo que quiere el usuario: el
idioma que estudias no es el idioma en el que quieres que te hablen.

**Cómo lo haría.** Separar `uiLanguage` de `dictionaryLanguage`. El de interfaz
se inicializa desde `navigator.language`, se puede cambiar y se guarda en
`localStorage` igual que el tema. Aprovechando el corte, sacar los ternarios a un
módulo `src/lib/i18n.ts` con un diccionario `Record<Locale, Record<Key, string>>`
tipado, en vez de repartir el mismo `isLangEnglish ? … : …` por siete
componentes. Sin librería: son unas decenas de cadenas.

También arregla un detalle suelto: `<html lang="en">` está fijo en `app.html`
aunque la interfaz esté en español, lo que desinforma a lectores de pantalla y
al traductor del navegador.

**Esfuerzo.** Un día. **Riesgo.** Bajo, mecánico, pero toca muchos archivos.

---

## Prioridad 2 — cosas que el usuario pide en cuanto usa la app

### 2.1 El service worker no avisa de que hay versión nueva

**Por qué.** El cascarón es *network first*, así que un despliegue se recoge en
la siguiente carga con red; pero una pestaña abierta se queda con la versión
vieja indefinidamente y el usuario no tiene forma de saberlo. En una app que se
instala como PWA, "abierta indefinidamente" es lo normal.

**Cómo.** Escuchar `updatefound` sobre el registro del worker y, cuando el nuevo
llegue a `installed` habiendo ya un `controller`, mostrar un aviso discreto
("hay una versión nueva · recargar"). El worker ya hace `skipWaiting()`, así que
basta con recargar. Encaja bien junto al sha del pie de página, que desde estos
cambios ya dice qué versión se está sirviendo.

**Esfuerzo.** Medio día. **Riesgo.** Bajo.

---

## Prioridad 3 — robustez e higiene

### 3.1 Forzar la regla de "sin CDNs" en producción, no sólo en test

**Por qué.** Hoy la promesa la sostiene un test e2e. Un test comprueba lo que
pasó al ejecutarlo; no impide que mañana una dependencia meta una fuente de
Google. En una app cuya tesis es "funciona sin red", que un recurso externo se
cuele es un fallo de producto, no de estilo.

**Cómo.** Una `Content-Security-Policy` restrictiva. GitHub Pages no deja poner
cabeceras, así que va como `<meta http-equiv="Content-Security-Policy">` en
`app.html`: `default-src 'self'`, más los orígenes que sí hacen falta para las
fuentes en línea (`connect-src` con rae-api.com, dictionaryapi.dev y
freedictionaryapi.com) y `media-src` con `upload.wikimedia.org` para las
grabaciones de pronunciación. Ojo con `script-src`: el arranque del tema y el
registro del worker son scripts en línea, así que necesitarán un hash.

Conviene añadirlo **después** de 1.2, para no perseguir hashes mientras se
edita `app.html`.

**Esfuerzo.** Medio día, casi todo probando. **Riesgo.** Medio: una CSP mal
puesta rompe la app entera en producción y no en local. Verificar con el build
real y los e2e antes de mezclar.

### 3.2 Anunciar los resultados de búsqueda a lectores de pantalla

**Por qué.** El resultado aparece sin aviso: quien no ve la pantalla no sabe si
se está buscando, si hubo resultado o si falló.

**Cómo.** Un `aria-live="polite"` sobre la región de resultados y un texto de
estado ("buscando…", "sin resultados para X"). Barato y de las mejoras de
accesibilidad con mejor relación coste/beneficio.

**Esfuerzo.** Una hora.

### 3.3 `Router.svelte` es una abstracción sin usar

**Por qué.** Despacha por `?page=` sobre un único valor posible (`home`), con su
store, su type guard y sus tests implícitos. Es andamiaje para páginas que no
existen.

**Cómo.** Si no hay intención de añadir páginas, borrarlo y montar `Home`
directamente en `+page.svelte`. Si la hay, dejarlo tal cual y anotarlo en
`CLAUDE.md`. **Esto es una decisión tuya, no la tomo yo**: depende de un plan de
producto que el código no revela.

**Esfuerzo.** Una hora en cualquiera de las dos direcciones.

### 3.4 Cobertura que falta

- `Dictionary.svelte` no tiene test propio, y es quien orquesta búsqueda, URL e
  idioma. Al menos: busca al pulsar Enter, lee `?lang=` y `?word=` al montar,
  y rechaza la entrada con espacios (`wordIsValid`, hoy sin cubrir).
- Los e2e cubren tema y gestión de diccionarios desde estos cambios, pero no la
  **cancelación** de una descarga: es la ruta con más estado y la que peor falla
  si se rompe. Cuesta poco: pulsar descargar, cancelar y comprobar que vuelve a
  ofrecerse la descarga.

### 3.5 Deuda menor, anotada y no tocada

- **`static/img/preview.png` está desactualizada**: enseña la cinta diagonal de
  GitHub que ya no existe y el tema claro antiguo. Sale en el README.
- **Vitest avisa** de que crea el entorno jsdom 8 veces (≈36% del tiempo de los
  tests). `pool: 'vmThreads'` lo arregla manteniendo el aislamiento por fichero.
  No lo cambié porque tocar la configuración de tests en la misma tanda que
  subir Vitest de mayor mezcla dos causas si algo falla.
- **TypeScript 7 (`7.0.2`) está disponible** y lo dejé fuera a propósito: es el
  port nativo del compilador, demasiado nuevo para meterlo junto a saltos de
  mayor en Vite, Vitest y Zod. Merece su propia tanda, con `svelte-check` verde
  como criterio.

---

## Deuda nueva que dejan los diccionarios múltiples

Cosas que sé que quedan a medias tras añadir los seis diccionarios. Ninguna es
urgente; todas son reales.

### Tamaño del repositorio: 101 MB

Seis diccionarios commiteados. GitHub avisa por encima de 1 GB y Pages tiene
100 GB/mes de tráfico, así que hay margen — pero **no mucho más**: a este ritmo,
cuatro idiomas más rozarían los 150 MB y un `git clone` ya duele.

Si se quieren más idiomas, antes hay que dejar de commitear el dataset: una
release de GitHub con los shards, o un CDN, y el repo sólo con el manifiesto.
Eso rompe la regla de "sin orígenes externos", así que es una decisión de
producto, no una optimización.

### El idioma de la interfaz sigue atado al diccionario

Con los bilingües el problema del punto 1.2 se nota más: elegir "Français →
English" pone toda la aplicación en inglés. Es coherente (se lee en inglés) pero
sigue sin ser lo que quiere un hispanohablante estudiando francés. La separación
`uiLanguage` / `dictionaryLanguage` es ahora más necesaria, no menos.

### `es` y `en` no tienen tabla de formas

La sección de formas del lema sale de `inflections`, que el generador nuevo
escribe con la grafía real. Los cuatro bilingües se regeneraron y la traen; `es`
y `en` **no**, porque salen de volcados de kaikki de ~1,4 GB que no están en el
repositorio: se migraron en sitio (deduplicando acepciones y escribiendo el
índice), y eso no puede reconstruir unas grafías que ya se habían perdido —
en el shard sólo queda la clave normalizada, "canto" por "cantó".

Se arregla solo la próxima vez que alguien regenere esos dos desde el volcado con
`bun run dataset:es`. La ficha, mientras tanto, simplemente no enseña la sección.

### Los bilingües traen menos de lo que promete la ficha

El formato `compact` no conserva etimologías ni ejemplos de uso, y no permite
atribuir cada definición a su categoría gramatical. La ficha los dibuja igual,
simplemente con menos secciones. Sería honesto indicarlo en el gestor de
diccionarios ("sin etimologías ni ejemplos") en vez de que el usuario lo deduzca
comparando.

### El índice se recorre en lineal

`findPrefix` y la búsqueda de la palabra marcada hacen `findIndex` sobre 30.000
cadenas. Es imperceptible en un portátil y corre sólo al teclear o al abrir una
palabra, pero es O(n) con normalización por elemento. Si alguna vez molesta, la
salida es precalcular las claves normalizadas junto al índice en vez de
normalizar en cada comparación.

### Hojear carga el índice entero en memoria

30.000 cadenas por diccionario. Va bien en un portátil; en un móvil viejo con
varios diccionarios descargados habría que medirlo. Si molesta, la salida es
paginar contra IndexedDB en vez de mantener el array completo.

## Lo que hice en esta tanda, para contexto

Resumen de lo ya aplicado, porque varias propuestas de arriba se apoyan en ello:

| Cambio | Por qué |
|---|---|
| Cuatro diccionarios nuevos (fr, de, it, pt) | Había fuente libre y compatible; el dataset ya sabía trocearse |
| Modelo de "diccionario" en vez de "idioma" | Pueden convivir varios del mismo idioma, y hay que poder distinguirlos |
| Selector con filtro | Con seis, un `<select>` deja de servir |
| Sección para hojear | El dataset completo ya estaba en el dispositivo y no había forma de recorrerlo |
| Esqueleto animado en vez de "Buscando..." | Dibuja la forma del resultado, así la página no da el salto al responder |
| Acepciones duplicadas fundidas | `water` repetía la misma glosa 3 veces; 12.733 duplicadas fuera sólo en inglés |
| `index.json` por diccionario | Hojear y autocompletar sin descargar 20 MB |
| Sugerencias por prefijo | La carencia más visible frente a cualquier diccionario comercial |
| "Está en otro diccionario" | Con seis, "sin resultados" dejó de ser una respuesta suficiente |
| Palabra del día y abrir al azar | La app arrancaba con un `water` fijo en el código |
| Historial y guardadas | Un diccionario se usa para estudiar, y estudiar es volver |
| Almacenamiento permanente | Sin `persist()` el navegador puede tirar los 34 MB sin avisar |
| Aviso de cuota antes de descargar | Bajar 34 MB para fallar en el último shard gasta datos y deja todo a medias |
| Formas del lema en la ficha | El dato ya estaba pagado: se usaba sólo para que "aguas" hallara "agua" |
| Botón de instalar, atajos, compartir | Era una PWA sin ninguna pista de que se podía instalar |
| Índice y entrada en una sola vista | Las pestañas escondían el buscador y el selector al hojear |
| Armazón reducido de 572 a 240 px en móvil | El 68% de la pantalla era chrome antes de llegar a la definición |
| Cabecera pegajosa y compacta | Leer una entrada larga obligaba a subir del todo para buscar otra |
| Comparación acento-sensible (`isSameWord`) | "cuidará" definía también "cuidara" y el índice marcaba las dos |
| Salto del índice al teclear | Es lo que hace que buscar y hojear sean el mismo gesto |
| Segundo nivel de letras y paso a la palabra vecina | Con sólo A–Z no se podía llegar a ninguna parte |
| Sinónimos con clase propia (`.chip`) en vez de `.badge` | `.badge` de Bootstrap trae `color: #fff`: texto blanco sobre fondo claro |
| Antónimos visibles | El dato ya venía en el modelo (`Definition.antonyms`) y no se pintaba |
| Tema claro/oscuro/sistema | `data-bs-theme` nativo de Bootstrap 5.3, aplicado antes del primer pintado |
| Bootstrap 5.0.2 → 5.3.8 (vendorizado) | Es lo que aporta el interruptor de tema nativo y las variables `--bs-*` |
| Panel de gestión de diccionarios | Faltaba borrar, cancelar y ver el estado de ambos idiomas |
| `deleteLanguage()` en store y dataset | No había forma de recuperar 55 MB salvo borrar los datos del sitio entero |
| Cinta de GitHub → enlace en el pie, con el sha del despliegue | La cinta tapaba contenido en móvil; el sha lo generaba CI y no lo leía nadie |
| `styles.css` sin colores fijos; `static/global.css` borrado | `body{color:black}` y `label{color:white}` impedían el tema oscuro; `global.css` no lo cargaba nadie |
| Dependencias al día (Vite 8, Vitest 5, Zod 4, Svelte 5.57, Playwright 1.63) | Vite 5 ya no recibe arreglos de seguridad |
| `VERSION` del worker a `v3` | Purga el cascarón cacheado con el Bootstrap viejo |
