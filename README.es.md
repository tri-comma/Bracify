[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Logo de Bracify" width="200">
</p>

# Bracify 🚀

> **El framework web solo con HTML. Sin CLI, solo marcado.**

Bracify es un framework que permite construir aplicaciones web utilizando únicamente marcado HTML.
Ofrecemos una experiencia de desarrollo centrada en HTML ("HTML-first"), eliminando las barreras de la programación y la configuración compleja de entornos.

## ¿Qué es Bracify?

Bracify busca la simplicidad: "Crea aplicaciones solo con marcado".

- **Para ingenieros cansados de React/Vue**: Libérate de configuraciones de construcción complejas y de la curva de aprendizaje de frameworks pesados.
- **Para ingenieros de marcado (maquetadores)**: Sin necesidad de programar. Usa solo tus habilidades de HTML para crear aplicaciones web completas, desde la integración de datos hasta el despliegue.

## Demo

![Animación de demostración](./demo.gif)

## Conceptos clave

- **Solo marcado HTML**: Crea aplicaciones solo marcando HTML, sin escribir programas.
- **Sin necesidad de CLI**: No se requiere de "pantalla negra" (terminal). Nuestro lanzador GUI dedicado lo resuelve todo.
- **Renderizado híbrido**: Desarrolla con `file://` (CSR) y publica como servidor `https://` (SSR) tal cual.
- **Configuración cero**: No se necesita el complejo `npm install`, etc.
- **Portátil**: El proyecto es solo HTML. Llévalo a cualquier parte y ejecútalo de inmediato.

## Inicio rápido

Comencemos creando una página simple. Solo toma 4 pasos.

### 1. Preparación

Inicia la aplicación GUI de `Bracify` y selecciona una nueva carpeta de espacio de trabajo.

### 2. Crear HTML

Crea un archivo llamado `index.html` y escribe lo siguiente:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Especificar fuente de datos -->
  <link data-t-source="info" href="/_sys/data/info.json">
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

### 3. Crear datos

Crea un archivo llamado `/_sys/data/info.json` y escribe lo siguiente:

```json
{
  "msg": "¡Hola Bracify!"
}
```

### 4. Ejecutar

Al presionar el botón `Start Server` en la aplicación GUI y abrir `localhost:3000`, se mostrará `¡Hola Bracify!`.
El servidor lee `index.html` e `info.json` al iniciarse, resuelve SSI (Server Side Includes) en memoria y devuelve la respuesta.
Al editar y guardar un archivo, el monitoreo a nivel de OS actualiza instantáneamente la plantilla en memoria.

---

## Herramientas de desarrollo (Bracify Studio)

`Bracify` proporciona una herramienta GUI dedicada (nombre en clave: **Bracify Studio**) para maximizar la experiencia del desarrollador.
Esta herramienta funciona en una configuración híbrida de un "Lanzador" basado en Electron y un "Panel de administración (Web App)" construido con el propio `Bracify`.

### 1. Bracify Launcher (Escritorio)

Una aplicación ligera que sirve de envoltorio para iniciar el Panel de administración.

- **Servidor del sistema**: Inicia un servidor API de gestión del sistema al lanzar la aplicación.
- **Lanzar**: Abre automáticamente el Panel de administración en un navegador (o ventana de Electron).

### 2. Panel de administración (Web)

Una pantalla de gestión integrada que consolida todas las operaciones.

- **Control de proyectos**:
  - **Abrir proyecto**: Abre un diálogo de selección de carpetas a través de la API del sistema para cargar proyectos.
  - **Iniciar/Detener servidor**: Especifica un número de puerto para iniciar el servidor de previsualización para el proyecto de destino.
- **Gestor de datos**:
  - Edición de JSON, estimación de esquemas.
- **Monitor de API**:
  - Consultar registros de comunicación.

---

## Estructura del proyecto (File System Structure)

Un proyecto de `Bracify` consiste en una única carpeta de origen. No se requiere de un directorio de construcción físico para la ejecución.

### Estructura de directorios recomendada

```text
proyecto/
├── index.html          # Punto de entrada
├── style.css           # Recurso estático
├── img/                # Cualquier carpeta que no empiece por guion bajo es pública
│   └── logo.png
├── _parts/             # [Privado] Componentes para incluir
│   ├── header.html
│   └── footer.html
└── _sys/               # [Privado] Datos del sistema y configuración
    ├── data.db         # Archivo de base de datos
    └── data/           # Datos JSON para entidades
        └── articles.json
```

### Especificaciones de renderizado

Bracify permite alternar sin problemas entre el "Modo SSR" (actuando como servidor web) y el "Modo CSR" (ejecutándose directamente en el navegador).

#### 1. Modo SSR (Lado del servidor)
El servidor construye dinámicamente el HTML en respuesta a las peticiones.

- **Construcción en memoria**: Resuelve `data-t-include` y almacena en **memoria** la plantilla HTML combinada al iniciar o guardar archivos.
- **Monitoreo de archivos**: Cuando se actualiza `index.html` o archivos bajo `_parts/`, el servidor detecta eventos del OS y reconstruye automáticamente la caché en memoria.
- **Alto rendimiento**: Las respuestas se sirven desde las plantillas ya combinadas en memoria, minimizando el I/O de disco.

#### 2. Modo CSR (Lado del cliente)
Se ejecuta mediante el protocolo `file://` abriendo la carpeta directamente en un navegador.

- **Inclusión en tiempo de ejecución**: Cuando el navegador carga el HTML, obtiene y fusiona los archivos especificados por `data-t-include` al vuelo usando la File System Access API.
- **Consistencia**: Tanto SSR como CSR usan exactamente el mismo motor de vinculación (`engine.js`), garantizando resultados idénticos en cualquier entorno.

#### 3. Transiciones de página y enrutamiento SPA (Unified SPA)
Bracify trata **todas las transiciones de página como SPA por defecto** tanto en modo SSR como CSR.

- **Experiencia sin interrupciones**: Evitando las recargas completas de la página, Bracify utiliza Ajax (Fetch) para obtener el HTML de la siguiente página y reemplaza dinámicamente el `<body>` y otros elementos del DOM. Esto evita el parpadeo de pantalla en blanco y proporciona una sensación de aplicación rápida y fluida.
- **Persistencia de permisos**: Crucial para el modo CSR. En un entorno `file://`, una recarga completa de la página restablece los permisos de acceso a las carpetas del navegador. El enfoque SPA permite mantener los permisos durante toda la sesión.
- **Intercepción automática**: Los enlaces internos mediante etiquetas `<a>` estándar se detectan automáticamente y se promueven a transiciones SPA. Los desarrolladores pueden crear aplicaciones SPA sin escribir una sola línea de JavaScript.
- **Soporte del historial del navegador**: Utiliza la API `history.pushState` para que las actualizaciones de URL y los botones de "Atrás/Adelante" funcionen exactamente como se espera, incluso durante las transiciones SPA.

---

## Referencia

### Atributos personalizados

#### `data-t-include`

Carga un archivo HTML externo y lo expande como el contenido del elemento. Este atributo tiene dos modos de operación: **Snippet Include** y **Layout Application**.

En cualquier modo, **la etiqueta que contiene `data-t-include` no se elimina; sus elementos hijos (innerHTML) son reemplazados por el resultado expandido.**

---

##### Modo 1: Snippet Include (Inclusión de fragmento)

Inserta componentes comunes como encabezados o pies de página en la ubicación actual.

- **Operación**: Expande el contenido del archivo especificado directamente dentro de la etiqueta.
- **Ejemplo**:

    ```html
    <header data-t-include="_parts/header.html"></header>
    ```

    ↓ El contenido de `_parts/header.html` se expande.

---

##### Modo 2: Layout & content (Diseño y contenido)

Carga un "marco (diseño)" común y rellena áreas específicas dentro de él con su propio contenido.

- **Operación**:
    1. Carga el archivo de plantilla especificado por `data-t-include`.
    2. Empareja los elementos `data-t-content` en la plantilla con los elementos `data-t-content` dentro de sí mismo.
    3. Inyecta el contenido de la página en las ubicaciones especificadas en la plantilla.
- **Regla de emparejamiento**: Los elementos con valores de atributo `data-t-content` (nombres) coincidentes se convierten en los objetivos de reemplazo. Si no se proporciona un nombre, se trata como el espacio (slot) por defecto.

- **Ejemplo**:
    **Plantilla (`_parts/layout.html`)**:

    ```html
    <div class="container">
        <h1 data-t-content="page-title">Título por defecto</h1>
        <main data-t-content="main-body"></main>
    </div>
    ```

    **Página que usa el diseño (`index.html`)**:

    ```html
    <body data-t-include="_parts/layout.html">
        <span data-t-content="page-title">Mi perfil</span>
        <div data-t-content="main-body">
            <p>El contenido del cuerpo va aquí.</p>
        </div>
    </body>
    ```

    ↓ **Resultado**:

    ```html
    <body>
        <div class="container">
            <h1 data-t-content="page-title">Mi perfil</h1>
            <main data-t-content="main-body">
                <div data-t-content="main-body">
                    <p>El contenido del cuerpo va aquí.</p>
                </div>
            </main>
        </div>
    </body>
    ```

- **Nota**: La fusión ocurre en el lado del servidor durante el uso del servidor de desarrollo o mediante la File System Access API en el navegador.

#### `data-t-source`

Obtener datos para mostrar en HTML y asignarles un nombre.

- **Uso**: Especifica la URL de los datos en el atributo `href` y asigna cualquier nombre.
- **Especificación de URL de datos**:
  - **Formato recomendado**: `_sys/data/{NombreDatos}.json` (Ruta relativa)
    - Se recomienda omitir la barra inicial `/` ya que este formato funciona también en vista previa local (`file://`).
  - **Formato permitido**: `/_sys/data/{NombreDatos}.json` (Ruta absoluta aparente)
    - En CSR (navegador), la barra inicial `/` se ignora automáticamente y se trata como una ruta relativa.
- **Restricciones del nombre**: Solo se permiten **caracteres alfanuméricos, guiones bajos `_` y guiones `-`**.
  - Las rutas que contengan `..` o `/` (Directory Traversal) están **prohibidas** y no se cargarán.
- **Restricción**: Solo se puede especificar en etiquetas `<link>`.
- **Ejemplo**:

    ```html
    <!-- OK (Recomendado): Ruta relativa -->
    <link data-t-source="articles" href="_sys/data/article.json">

    <!-- OK: Con barra inicial (tratada internamente como relativa) -->
    <link data-t-source="users" href="/_sys/data/user.json?status=active">

    <!-- NG: Directory traversal prohibido -->
    <link data-t-source="invalid" href="_sys/data/../../conf.json">
    ```

#### Visualización de datos (Marcador de posición universal)

Puedes mostrar datos escribiendo `{nombre_fuente_datos.nombre_item}` en el texto HTML o en los valores de los atributos.

- **Ejemplo básico**:
    Especifica la fuente de datos y su propiedad (nombre de ítem) para mostrar.

    ```html
    <link data-t-source="article" href="/_sys/data/articles.json?id={?id}">
    <h1>{article.title}</h1>
    <p>{article.body}</p>
    ```

- **Visualización de datos anidados**:
  Puedes acceder a propiedades anidadas dentro de un objeto usando la notación de punto `.`. Puedes describir jerarquías profundas de la misma manera.

  ```json
   {
    "user": {
      "name": "Juan Pérez",
      "address": {
        "city": "Madrid"
      }
    }
  }
  ```

  ```html
  <p>Nombre de usuario: {user.name}</p>
  <p>Ciudad: {user.address.city}</p>
  ```

- **Cálculos numéricos (aritmética)**:
  Puede realizar operaciones aritméticas (`+`, `-`, `*`, `/`, `%`) y usar paréntesis `()` dentro de los marcadores de posición `{ }` para calcular valores numéricos sin escribir JavaScript. Combine valores de datos y literales numéricos, y pase el resultado a los filtros (pipes) posteriores (`|`).

  ```html
  <!-- Suma de variables (siguiente offset de paginación) -->
  <a href="?_offset={_sys.query._offset + 10}">Next</a>

  <!-- Multiplicación combinada con un pipe (impuesto / total) -->
  <span>Total: {item.price * 1.1 | number} 円</span>

  <!-- Precedencia con paréntesis -->
  <span>Total: {(item.price + item.shipping) * item.qty}</span>
  ```

  - Las variables en la expresión (p. ej., `item.price`) se resuelven automáticamente desde los datos. Los valores indefinidos, `null` o no numéricos se tratan de forma segura como `0`, por lo que el renderizado nunca se interrumpe por un error.
  - La división/módulo por `0` devuelve `0`.

- **Visualización de índices de lista**:
  Para cada elemento iterado por `data-t-list`, se inyecta automáticamente un índice basado en cero `_index`. Añada `+ 1` para corregir a un índice basado en uno.

  ```html
  <ul>
    <li data-t-list="projects">No. {projects._index + 1}: {projects.title}</li>
  </ul>
  ```

- **Escape de marcadores de posición**:
  Si deseas mostrar la notación del marcador de posición tal cual sin evaluarla, coloca una barra invertida `\` antes de la llave de apertura.

  ```html
  <code>\{user.name\}</code> <!-- Resultado: {user.name} -->
  ```

### Visualización de lista (`data-t-list`)

Si hay múltiples elementos de datos que deseas mostrar, debes especificar `data-t-list="Nombre de la Fuente de Datos"` en el elemento (rango) que deseas repetir.

```html
  <link data-t-source="articles" href="/_sys/data/articles.json">
  <ul>
    <li data-t-list="articles">
      <h3>{articles.title}</h3>
    </li>
  </ul>
```

#### Incrustar datos en atributos (Marcador de posición universal)

En todos los atributos estándar (`href`, `src`, `class`, `value`, `style`, etc.), puedes incrustar datos directamente escribiendo marcadores de posición `{ }`.

- **Ejemplo de uso**:

    ```html
    <img src="{article.thumbnail}" alt="{article.title}">
    <a href="/post/{article.id}" class="btn {article.category}">Ver detalles</a>
    <div style="background-color: {user.color}; height: {progress}%;"></div>
    ```

- **Límite**: Para evitar interferencias con la sintaxis de JavaScript, **los marcadores de posición no se pueden usar dentro de los atributos de manejadores de eventos (`onclick`, `onchange`, etc.).**

#### Evitar la interferencia de marcadores de posición y limitaciones

Los marcadores de posición de Bracify `{ }` se pueden usar en atributos HTML y nodos de texto. Sin embargo, para evitar la interferencia con el código JavaScript o CSS (sintaxis que usa llaves), **la expansión está deshabilitada** en las siguientes ubicaciones:

- **Donde la expansión NO ocurre**:
  - Dentro de las etiquetas `<script>`.
  - Dentro de las etiquetas `<style>`.
  - Dentro de los atributos de manejadores de eventos (todos los atributos que comienzan con `on`, como `onclick`, `onmouseover`, `onsubmit`).

##### Patrón recomendado: Uso de datos en manejadores de eventos

Si deseas usar datos dinámicos dentro de un manejador de eventos (JavaScript), recomendamos el patrón de **incrustar los datos en un atributo `data-` y referenciarlos a través de `this.dataset`** en lugar de escribir `{ }` directamente.

```html
<!-- NO recomendado (no funcionará) -->
<button onclick="alert('ID: {article.id}')">Mostrar</button>

<!-- Patrón RECOMENDADO -->
<button data-id="{article.id}" onclick="alert('ID: ' + this.dataset.id)">Mostrar</button>
```

Al usar este método, el motor de plantillas de Bracify y la sintaxis estándar de JavaScript del navegador pueden coexistir de forma segura.

#### Vinculación automática de elementos de formulario

Si se especifica un atributo `name` para los elementos `input`, `select` o `textarea`, `Bracify` vincula automáticamente el valor de la fuente de datos apropiada. Los usuarios no necesitan especificar manualmente `value` o marcadores de posición.

- **Prioridad para la vinculación automática**:
    1. **Contexto de datos actual**: Establece el valor de las propiedades de los datos especificados por `data-t-scope`, etc.
    2. **Parámetros de URL (`_sys.query`)**: Si hay un ítem con el mismo nombre que `name` en los parámetros de consulta de la URL de la página, se establece ese valor.

- **Especificar datos con `data-t-scope`**:
    Al escribir `data-t-scope="article"` en un elemento contenedor (`div`, `form`, etc.), puedes especificar la "fuente de datos por defecto" dentro de ese elemento. Como resultado, el `name="title"` interno se referirá automáticamente a `article.title`.

- **Ejemplo (Formulario de búsqueda)**:

    ```html
    <!-- Si la URL es ?title=Web, value="Web" se establece automáticamente -->
    <input type="text" name="title" placeholder="Buscar artículos...">
    ```

- **Ejemplo (Formulario de edición)**:

    ```html
    <!-- title y content de los datos de article se establecen automáticamente en cada campo -->
    <form data-t-scope="article" method="PUT" action="/_sys/data/article">
      <input type="text" name="title">
      <textarea name="content"></textarea>
    </form>
    ```

- **Selección automática para cuadros de selección (Select Boxes)**:
    El atributo `selected` se añade automáticamente a los elementos `<option>` cuyo `value` coincide con el valor vinculado a la etiqueta `<select>`.

#### `data-t-if`

Muestra u oculta elementos en función de condiciones. El elemento se muestra si el valor del dato existe (`true`, no nulo, no cero, cadena no vacía).

- **Especificación**: Especifica el nombre del ítem de datos a evaluar.
- **Ejemplo**:

    ```html
    <!-- Se muestra solo si user.is_login es true -->
    <div data-t-if="user.is_login">
      ¡Bienvenido, <span>{user.name}</span>!
    </div>
    ```

    ↓ **Resultado (si `user.is_login` es true)**

    ```html
    <div>
      ¡Bienvenido, <span>Juan Pérez</span>!
    </div>
    ```

    ↓ **Resultado (si `user.is_login` is false)**

    ```html
    <!-- El elemento en sí no se genera en la salida -->
    ```

    **Nota (Condición negativa / Else)**:
    Al añadir `!` al principio, puedes especificar condiciones para cuando el "valor no existe (false)". Usa esto en lugar de `else`.

    ```html
    <!-- Se muestra solo si user.is_login es false -->
    <div data-t-if="!user.is_login">
      <a href="/login.html">Por favor, inicia sesión</a>
    </div>
    ```

    **Operaciones de comparación y lógica (Estilo Data API)**:
    Puede especificar condiciones más detalladas utilizando la misma sintaxis que los parámetros de consulta de Data API.

    - **Operadores de comparación**: Utiliza la misma notación que los [Operadores de API de acceso a datos](#operadores) (`=`, `:ne=`, `:gt=`, etc.).
    - **Operaciones lógicas (AND/OR)**: La separación por espacios representa **AND**, y la separación por comas en los valores representa **OR**.
    - **Uso de variables**: Al encerrar en `{ }`, puede utilizar valores de datos en las condiciones.
    - **Clave única**: Si escribe solo una clave sin operadores, determina la presencia (verdad) de ese valor como antes.

    ```html
    <!-- El estado es publicado (status == 'published') -->
    <span data-t-if="status=published">Publicado</span>

    <!-- El precio es 1000 o más Y el stock es mayor que 0 (price >= 1000 AND stock > 0) -->
    <div data-t-if="price:gte=1000 stock:gt=0">
      Artículo popular (En stock)
    </div>

    <!-- El rol es admin O editor (role == 'admin' OR role == 'editor') -->
    <button data-t-if="role=admin,editor">Editar</button>

    <!-- El ID de usuario coincide con el ID del autor del artículo (user.id == post.author_id) -->
    <div data-t-if="user.id={post.author_id}">
      <a href="/edit">Editar artículo</a>
    </div>
    ```

#### `data-t-redirect`

Especifica la URL de destino de la transición después de que un proceso (como el envío de un formulario) se complete con éxito.

- **Especificación**: Especifica la ruta relativa o absoluta del destino.
- **Etiqueta de destino**: Etiqueta `form`.
- **Operación**: Después de que el servidor complete el proceso, redirecciona con un estado 302 a la ruta especificada. Si no se especifica, recarga la página actual.

### Formularios y guardado de datos (Postback)

Puedes enviar datos (crear/actualizar) usando etiquetas `<form>` estándar. Bracify funciona con **postbacks estándar del navegador (envíos que implican transiciones de página)** sin usar JavaScript asíncrono (fetch).

- **Manejo automático**: Especifica el destino en el atributo `action` (ej., `/_sys/data/xxxxx.json`) y envía usando `method="POST"` o `PUT`.
- **Redirección (Patrón PRG)**: Una vez guardado en el servidor, redirecciona automáticamente a la URL especificada por `data-t-redirect` o a la página original. Esto evita el "reenvío de formularios" y permite una navegación segura.
- **Vinculación de datos (Valores iniciales)**: Al especificar `data-t-scope` en la etiqueta `<form>`, puedes establecer datos existentes como valores predeterminados para los campos de entrada.
- **Ítems de entrada**: El atributo `name` de `<input>` y `<textarea>` se convierte en el nombre del ítem de datos (propiedad).

### Filtros de procesamiento (Pipes)

Puedes usar filtros de procesamiento (nombre formal: pipes) `|` al mostrar los datos.

#### Sintaxis básica

```html
<p>Actualizado: { article.updated_at | date: 'yyyy/mm/dd' }</p>
<span>Precio: { product.price | number } USD</span>
```

↓ **Resultado**

```html
<p>Actualizado: 2025/12/10</p>
<span>Precio: 1,500 USD</span>
```

#### Sintaxis de Pipe

```text
{ nombre_dato.nombre_item | nombre_filtro: 'argumento' }
```

### Filtros estándar (Pipes integrados)

#### `date`

Muestra datos de fecha (tipo de fecha) como texto en el formato especificado.

- **Sintaxis**: `{ nombre_item | date: 'formato' }`
- **Especificaciones de formato**:
  - `yyyy`: Año de 4 dígitos
  - `mm`: Mes de 2 dígitos
  - `dd`: Día de 2 dígitos

#### `number`

Muestra números en formato de "separación por comas de tres dígitos".

- **Sintaxis**: `{ nombre_item | number }`

#### `json`

Muestra los datos como una cadena JSON formateada. Útil para depuración o para usar datos directamente en JavaScript.

- **Sintaxis**: `{ nombre_item | json }`

## Procesamiento de guardado de datos (Form Handler)

Bracify no proporciona datos externamente (API). Todos los recursos bajo `/_sys` están ocultos, excepto los siguientes puntos finales que actúan como manejadores para los envíos de formularios.

```text
POST /_sys/data/{entity}.json
```

Este punto final no puede ser accedido directamente vía `GET` desde un navegador (403 Forbidden). Solo está disponible como un `action` de formulario.

#### Operaciones de datos
Las operaciones de datos se realizan a través de peticiones HTTP, pero la respuesta es siempre una "redirección a una página".

| Método | Acción | Descripción |
| :--- | :--- | :--- |
| `POST` | Crear | Crea nuevos datos. |
| `PUT` | Actualizar | Reemplaza la información existente con los datos enviados. |
| `DELETE`| Eliminar | Elimina los datos especificados. |

### Especificación de punto final (API de archivos)

Una API para gestionar archivos estáticos (imágenes, etc.) en el servidor.

```text
/_sys/file/{nombre_archivo}.{ext}
```

#### Métodos de operación de archivos

| Método | Acción | Descripción |
| :--- | :--- | :--- |
| `GET` | Leer | Obtiene el archivo. |
| `POST` | Crear | Sube/crea un nuevo archivo. |
| `PUT` | Actualizar | Sobrescribe y actualiza el contenido del archivo especificado. |
| `DELETE` | Eliminar | Elimina el archivo especificado. |

#### Parámetros

- **`{entity}`**: El tipo de datos (nombre formal: entidad). p. ej., `article`, `user`
- **`{prop}`**: El nombre del ítem de los datos usados para filtrar (nombre formal: propiedad)
- **`{val}`**: El valor especificado para la condición

#### Operadores

Al añadir símbolos (operadores) después del nombre del ítem, puedes especificar condiciones más detalladas.

| Operador | Significado | Ejemplo | Descripción del ejemplo |
| :--- | :--- | :--- | :--- |
| (ninguno) | Igual | `?status=active` | El estado es `active` |
| `:ne` | No igual | `?status:ne=draft` | El estado **NO** es `draft` |
| `:gt` | Mayor que | `?price:gt=1000` | El precio es **superior a** 1000 (1001~) |
| `:gte` | Mayor o igual que | `?price:gte=1000` | El precio es 1000 **o superior** (1000~) |
| `:lt` | Menor que | `?stock:lt=10` | El stock es **inferior a** 10 (~9) |
| `:lte` | Menor o igual que | `?stock:lte=10` | El stock es 10 **o inferior** (~10) |

### Variable reservada del sistema (`_sys`)

Se proporciona una variable reservada llamada `_sys` para obtener el contexto general de la aplicación y la información de la solicitud del navegador.

| Nombre de variable | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `_sys.query` | Parámetros de consulta GET. Obtiene valores como `?id=123` de la URL. | `{_sys.query.id}` |

#### Uso en `data-t-source` (Vinculación dinámica de parámetros)

Dentro del atributo `href` de `data-t-source`, puedes incrustar dinámicamente parámetros de consulta usando marcadores de posición `{ }`. Además, está disponible una notación abreviada `{?}` específica para los parámetros de la URL.

| Notación | Significado | Ejemplo |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | Incrustar el ítem especificado (formato estándar) | `?id={_sys.query.id}` |
| `{?}` | **Vinculación automática**. Obtiene un valor de la URL con el mismo nombre que la clave de la izquierda | `?title={?}` |
| `{?xxx}` | **Abreviatura**. Equivalente a `_sys.query.xxx` | `?title={?q}` |

#### Ejemplos en fuente de datos

```html
<!-- Si la URL es ?title=Web&_limit=10 -->

<!-- 1. Vinculación automática: Mejor cuando el nombre de la clave coincide con el del parámetro de la URL -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">

<!-- 2. Abreviatura: Cuando el nombre del parámetro de la URL (p. ej., q) y la clave de la API (p. ej., title) difieren -->
<link data-t-source="search" href="/_sys/data/articles.json?title={?q}">

<!-- 3. Formato estándar: Para ser más explícito -->
<link data-t-source="items" href="/_sys/data/items.json?category={_sys.query.cat}">
```

### Información detallada de los datos (Propiedades del sistema)

Además de los valores contenidos en los propios datos (títulos, IDs, etc.), es posible que desees conocer el "conteo" o el "estado" de los datos.
En `Bracify`, puedes obtener esta información especial añadiendo un nombre que comience con un guion bajo `_` después del nombre de los datos.

| Nombre de propiedad | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `_length` | Muestra el número de ítems en una lista (array) o la longitud de una cadena. | `{articles._length} artículos` |

#### Parámetros de control (Ordenación y Paginación)

Para controlar el número de ítems de datos obtenidos y su orden, usa parámetros reservados que comiencen con un guion bajo `_`. Esto evita conflictos con los ítems de datos normales (p. ej., una columna llamada `limit`).

| Parámetro | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `_limit` | Número máximo de ítems a obtener | `?_limit=20` |
| `_offset` | Número de ítems a saltar (para paginación) | `?_offset=20` (comienza desde el ítem 21) |
| `_sort` | Nombre del ítem por el cual ordenar | `?_sort=created_at` |
| `_order` | Orden de clasificación (`asc`: ascendente, `desc`: descendente) | `?_order=desc` (por defecto es `asc`) |

#### Ejemplos de parámetros de control

```html
<!-- Ejemplo de búsqueda/ordenación usando parámetros de URL -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={_sys.query.title}&_sort={_sys.query._sort}&_order={_sys.query._order}&_limit={_sys.query._limit}">

<!-- Categoría fija, con solo la página especificada por parámetro -->
<link data-t-source="techArticles" href="/_sys/data/articles.json?category=Tech&_limit=10&_offset={_sys.query._offset}">
```

#### Ejemplo de estructura de directorio local

```text
proyecto/
├── index.html
├── _sys/
│   └── data/
│       ├── article.json
│       ├── user.json
│       └── product.json
└── parts/
    ├── header.html
    └── footer.html
```

**Ejemplo de archivo JSON** (`_sys/data/article.json`):

```json
[
  {
    "id": 1,
    "title": "Título del artículo 1",
    "summary": "Resumen del artículo...",
    "published_at": "2025-12-01T10:00:00Z"
  },
  {
    "id": 2,
    "title": "Título del artículo 2",
    "summary": "Resumen del artículo...",
    "published_at": "2025-12-05T15:30:00Z"
  }
]
```

### Modo de Desarrollo Local (True Zero Server Mode)

El modo en el que se desarrolla abriendo directamente `index.html` como un archivo local (`file://`) en un navegador sin iniciar un servidor.

#### Desarrollo sin construcción mediante File System Access API

Al utilizar la **File System Access API** proporcionada por los navegadores modernos (Chrome, Edge, etc.), el proceso de construcción tradicional (convertir archivos JSON a archivos JS) deja de ser necesario.

1. **Selección de la carpeta del proyecto**: Al abrir una página a través de `file://`, aparece un aviso de selección de carpeta durante la inicialización. Al seleccionar el directorio raíz del proyecto, el navegador puede obtener y operar directamente con los archivos.
2. **Vista previa sin construcción**: Dado que `_sys/data/*.json` y `_parts/*.html` son leídos directamente por el navegador, cualquier edición y guardado se refleja instantáneamente al recargar el navegador (o al realizar una transición).

#### Transiciones de página y enrutamiento SPA

Como se describe en [Transiciones de página y enrutamiento SPA (Unified SPA)](#3-transiciones-de-página-y-enrutamiento-spa-unified-spa), todas las transiciones en modo CSR se manejan como SPA. Esto resuelve el gran desafío de perder los permisos de acceso a las carpetas al recargar en un entorno `file://`.

#### Limitaciones en navegadores no compatibles

Si el navegador no admite la File System Access API o si no se realiza la selección de la carpeta, funciona en el siguiente "Modo de simulación de solo lectura" restringido:

- **Limitaciones de filtrado**: Solo coincidencia exacta. Los operadores como `:gt` o `:lt` no funcionarán.
- **Sin actualizaciones**: No se realiza el guardado de datos mediante el envío de formularios.
- **Visualización parcial**: La carga de archivos externos (`data-t-include`) puede estar restringida.

#### Filtrado y control de datos (Especificaciones comunes)

En el modo de desarrollo local (tanto True Zero Server como Modo de simulación), el procesamiento de datos simple ocurre dentro del navegador con las siguientes limitaciones y especificaciones:

- **Limitaciones de filtrado**:
  - **Solo coincidencia exacta**: Devuelve datos solo cuando la clave y el valor especificados coinciden exactamente.
  - **Ignorar valores vacíos**: Si el valor del filtro es una cadena vacía (`?nombre=`), esa condición se ignora (se muestran todos los elementos).
  - **Operadores avanzados no compatibles**: Los operadores como `:gt` o `:lt` no funcionan y se ignoran.

- **Parámetros de control compatibles**:
  Los siguientes parámetros funcionan de forma sencilla incluso en entornos locales:
  - `_limit`: Límite de visualización
  - `_offset`: Salto de datos
  - `_sort`: Clave de ordenación
  - `_order`: `asc` (ascendente) o `desc` (descendente)

#### Comportamiento de JavaScript en modo SPA

En el modo de desarrollo local (True Zero Server Mode), al realizar una transición sin recargar la página, la ejecución de JavaScript sigue estas reglas:

- **Aislamiento de alcance (envoltura IIFE)**: Para evitar conflictos con declaraciones de variables (`const`, `let`) de páginas anteriores, los scripts específicos de la página (dentro de `<body>` y scripts recién cargados en `<head>`) se envuelven y ejecutan automáticamente como expresiones de función invocadas inmediatamente (IIFE) por Bracify.
- **Prevención de ejecución duplicada**: Entre los scripts en `<head>`, aquellos que ya están cargados (como `engine.js` o bibliotecas comunes) no se vuelven a ejecutar en el destino de navegación.
- **Persistencia de variables globales**: Los datos adjuntos explitamente al objeto `window` o las variables `var` definidas fuera de las IIFE persisten después de la navegación.
- **Escuchadores de eventos**: Los escuchadores de eventos agregados directamente a `window` o `document` no se limpian automáticamente al navegar. Se recomienda adjuntar eventos específicos de la página a elementos dentro de `<body>` o diseñarlos teniendo en cuenta la navegación.

## Configuración de la Base de Datos

Por defecto, Bracify utiliza SQLite integrado (`_sys/data.db`), pero puede conectarse a bases de datos externas como MySQL o PostgreSQL configurando los ajustes de conexión.

### Cómo funciona

Al iniciarse, Bracify siempre consulta el archivo `_sys/data.db` (SQLite) dentro del proyecto para verificar los ajustes del sistema. Los ajustes de conexión y enrutamiento de la base de datos se almacenan en la tabla `config` dentro de este archivo.

Esto elimina la necesidad de gestionar o confirmar información sensible (como credenciales) en archivos de texto, garantizando una operación segura al mantener los ajustes fuera del repositorio.

### Comportamiento por defecto (Sin configuración)

Si la tabla `config` no existe o no hay configuración para una entidad específica, **se utiliza automáticamente el SQLite integrado (`_sys/data.db`).** No se requiere configuración para proyectos sencillos.

### Cómo configurar

Puede configurar esto a través de la interfaz gráfica (Bracify Studio) o insertando directamente los valores en la tabla `config` de la base de datos con el siguiente formato:

- **Tabla objetivo**: `config`
- **Columnas**: `name` = 'db', `value` = (matriz JSON de información de conexión a continuación)

**Formato de información de conexión (JSON):**

```json
[
  {
    "target_entity": "users",
    "engine": "mysql",
    "option": { "host": "localhost", "port": 3306, "user": "admin", "password": "${DB_PASS}", "database": "app_db" }
  },
  {
    "target_entity": "logs_*",
    "engine": "mongodb",
    "option": { "url": "mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017" }
  },
  {
    "target_entity": "*",
    "engine": "postgresql",
    "option": { "host": "db.example.com", "port": 5432, "database": "shared_db" }
  }
]
```

#### Prioridad de Enrutamiento (target_entity)

El destino de la conexión se selecciona automáticamente en función del nombre de la entidad según las siguientes reglas:

1. **Coincidencia Exacta**: Se da la máxima prioridad a los ajustes que coinciden perfectamente con el nombre.
2. **Coincidencia de Patrón**: Para los ajustes que contienen un comodín `*`, se prioriza el que tenga la "parte fija más larga (caracteres)" (por ejemplo, `data_*` tiene prioridad sobre `*`).
3. **Orden de Definición**: Si coinciden varios patrones con la misma longitud de parte fija, se prioriza el que esté **definido más arriba en la matriz JSON**.
4. **SQLite integrado**: Se utiliza como respaldo si ninguna de las reglas anteriores coincide.

- **engine**: `sqlite`, `mysql`, `postgresql`, `mongodb`, etc. (implementados secuencialmente).
- **option**: Ajustes de conexión específicos del controlador. Admite variables de entorno mediante el formato `${ENV_VAR}`.

## Despliegue

- **Serverless**: Destinado al despliegue en Vercel o Netlify.
- **Zip Upload**: Despliega comprimiendo el proyecto en Zip en la aplicación GUI y simplemente arrastrándolo y soltándolo en el panel de control de cada servicio.

## Flujo de desarrollo

1. Descarga e instala la aplicación GUI de `Bracify` desde el sitio oficial.
2. Inicia la aplicación y crea/selecciona una carpeta de espacio de trabajo.
3. Edita `index.html`, `_parts/header.html`, etc. La aplicación GUI proporciona una previsualización en tiempo real.
4. Una vez completado, comprime en Zip y publica.

## Seguridad

Bracify incluye varias funciones de protección integradas para apoyar el desarrollo frontend seguro.

- **Auto-Escape**: La expansión de datos mediante `{placeholder}` se escapa automáticamente a HTML (se trata como texto plano), previniendo XSS (Cross-Site Scripting).
- **Inyección Segura de Datos**: Al inyectar datos en HTML durante los procesos de SSR o construcción, estos se escapan automáticamente para prevenir la interferencia de etiquetas de script (como rupturas con `</script>`).
- **Sanitización de URL**: Al incrustar datos en los atributos `href` o `src`, se detectan y desactivan automáticamente los protocolos peligrosos como `javascript:` para evitar la ejecución inesperada de scripts.
- **Guardia de Guion Bajo (Solo SSR)**:
  Cuando se ejecuta como servidor, rechaza todo acceso directo externo (403 Forbidden) a los recursos donde el nombre del directorio o archivo en la raíz comienza con un guion bajo (`_`).
  Esto bloquea el acceso no autorizado a información interna como `data.db` o componentes de inclusión (`_parts/`) a nivel de servidor web.
  * Nota: Los puntos finales de formulario oficiales (como `POST /_sys/data/*.json`) están exentos de esta restricción.
