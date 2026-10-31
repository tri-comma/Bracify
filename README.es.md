[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Logo de Bracify" width="200">
</p>

# Bracify 🚀

> **El framework web solo con HTML. Solo marcado.**
>
> No hace falta terminal para crear una app (Studio, la GUI, lo cubre todo). La CLI es una herramienta opcional para compilaciones estáticas.

Bracify es un framework que permite construir aplicaciones web utilizando únicamente marcado HTML.
Ofrece una experiencia de desarrollo centrada en HTML ("HTML-first") que busca reducir las barreras de la programación y de la configuración compleja de entornos.

## ¿Qué es Bracify?

Bracify busca la simplicidad: "Crea aplicaciones solo con marcado".

- **Para ingenieros cansados de React/Vue**: Libérate de configuraciones de construcción complejas y de la curva de aprendizaje de frameworks pesados.
- **Para ingenieros de marcado (maquetadores)**: Sin necesidad de programar. Usa solo tus habilidades de HTML para crear aplicaciones web funcionales, incluida la integración de datos.

## Demo

![Animación de demostración](./demo.gif)

## Conceptos clave

- **Solo marcado HTML**: Crea aplicaciones solo marcando HTML, sin escribir programas.
- **Creación sin terminal**: Crear páginas, previsualizarlas y gestionar datos no requiere terminal. Bracify Studio, la herramienta GUI, lo resuelve. La CLI (para compilaciones estáticas) es opcional.
- **Renderizado híbrido**: Desarrolla con `file://` (CSR) y publica como servidor `https://` (SSR) tal cual.
- **Configuración mínima**: Un proyecto no necesita archivos de configuración ni pasos de compilación. Iniciar Studio requiere Node.js y un `npm install` una sola vez (véase Inicio rápido).
- **Portátil**: El proyecto es solo HTML. Llévalo a cualquier parte y ejecútalo de inmediato.

## Inicio rápido

Comencemos creando una página simple. Solo toma 4 pasos.

### 1. Preparación

Inicia Bracify Studio y selecciona una nueva carpeta de trabajo. Por ahora Studio se inicia desde el código fuente (requiere Node.js): ejecuta `npm install` una vez en la raíz del repositorio y luego `npm start`. Consulta [Studio](./docs/en/studio.md) para más detalles.

### 2. Crear HTML

Crea un archivo llamado `index.html` y escribe lo siguiente:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Especificar fuente de datos -->
  <link data-t-source="info" href="/_sys/data/info.json">
  <script src="bracify.js"></script>
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

`<script src="bracify.js"></script>` carga el motor del lado del cliente (necesario para las transiciones SPA y el Modo de Desarrollo Local; véase [Estructura del proyecto](./docs/en/project-structure.md)).

### 3. Crear datos

Crea un archivo llamado `/_sys/data/info.json` y escribe lo siguiente:

```json
{
  "msg": "¡Hola Bracify!"
}
```

### 4. Ejecutar

Al presionar el botón `Start Server` en Studio y abrir `localhost:3000`, se mostrará `¡Hola Bracify!`.
El servidor lee `index.html` e `info.json` al iniciarse, resuelve SSI (Server Side Includes) en memoria y devuelve la respuesta.
Al editar y guardar un archivo, el monitoreo a nivel de OS actualiza instantáneamente la plantilla en memoria.

---

## Qué puedes construir

Un ejemplo mínimo por función. Consulta la [Documentación](#documentación) para más detalles.

### Mostrar datos (`data-t-source` y marcadores)

Dale un nombre a los datos JSON e insértalos en texto o atributos con `{nombre.campo}`. Los parámetros de la URL están disponibles como `{?id}`.

```html
<link data-t-source="article" href="_sys/data/articles.json?id={?id}">
<h1>{article.title}</h1>
<p>{article.body}</p>
```

### Listas (`data-t-list`)

Colócalo en el elemento que quieres repetir; se clona una vez por registro. La ordenación, el límite y la paginación se indican con parámetros de URL.

```html
<link data-t-source="articles" href="_sys/data/articles.json?_sort=id&_order=desc&_limit=5">
<ul>
  <li data-t-list="articles"><a href="article.html?id={articles.id}">{articles.title}</a></li>
</ul>
```

### Condiciones (`data-t-if`)

Muestra u oculta elementos según existencia, comparación (`=`, `:gt`, ...), AND (espacio) y OR (coma).

```html
<span data-t-if="status=published">Published</span>
<div data-t-if="price:gte=1000 stock:gt=0">In stock</div>
<div data-t-if="!user.is_login"><a href="login.html">Log in</a></div>
```

### Guardar formularios (Data API con validación en el servidor)

Envía un `<form>` normal a la Data API y los datos se guardan. Restricciones como `required`, `maxlength` y `pattern` también se validan en el servidor; si fallan, el usuario vuelve a la página con `?error=`.

```html
<form method="POST" action="/_sys/data/articles.json" data-t-redirect="articles.html">
  <input type="text" name="title" required maxlength="100">
  <input type="email" name="email" required>
  <button>Save</button>
</form>
<p>{_sys.query.error}</p>
```

### Partes y diseños (`data-t-include`)

Inserta partes compartidas como una cabecera, o vuelca el contenido de la página en un diseño común.

```html
<!-- _parts/layout.html contains <main data-t-content="main-body"></main> -->
<body data-t-include="_parts/layout.html">
  <div data-t-content="main-body"><p>Page content</p></div>
</body>
```

### Pipes (filtros)

Da formato con `|`: fechas, números, moneda, recorte y valores por defecto. `date`, `number`, `currency`, `uppercase`, `lowercase`, `truncate`, `default`, `ternary` y `json` están incluidos.

```html
<p>{ article.updated_at | date: 'yyyy/mm/dd HH:MM' }</p>
<span>{ product.price | currency }</span>
<span>{ article.summary | truncate: 10 | uppercase }</span>
```

### Navegación SPA

Los enlaces `<a>` normales a páginas internas navegan automáticamente sin recargar la página completa. No hace falta JavaScript.

```html
<a href="book.html?id=1">Book</a>
```

### Modo local (`file://`, sin servidor)

Abre `index.html` en Chrome / Edge con doble clic y elige la carpeta del proyecto (solo lectura; usa la File System Access API). Cada página necesita esta línea.

```html
<script src="bracify.js"></script>
```

### Gestor de datos y scaffold de Studio

Studio recoge entidades y esquemas de tu HTML, permite listar, crear, editar y eliminar registros, y genera plantillas de páginas de lista y edición.

## Limitaciones actuales

Bracify es un proyecto en fase temprana. Úsalo teniendo en cuenta lo siguiente.

- **El modo local es de solo lectura.** Los formularios no se pueden guardar en `file://` ([#56](https://github.com/tri-comma/Bracify/issues/56)).
- **Todavía no hay autenticación.** En un servidor público, cualquiera que pueda llegar a la Data API puede escribir datos ([#106](https://github.com/tri-comma/Bracify/issues/106)). Ten cuidado al publicar.
- **No se admite la subida de archivos** ([#107](https://github.com/tri-comma/Bracify/issues/107)).
- **No hay despliegue en un solo paso.** Coloca la compilación estática en un hosting estático, o ejecuta el modo servidor en un host con Node.js ([#105](https://github.com/tri-comma/Bracify/issues/105)).

## Documentación

La especificación detallada está en `docs/`. La referencia está disponible en inglés y japonés.

| Archivo | Contenido |
| --- | --- |
| [`docs/en/README.md`](./docs/en/README.md) | Índice de la documentación |
| [`docs/en/studio.md`](./docs/en/studio.md) | Bracify Studio (lanzador, panel de administración, gestor de datos, scaffold) |
| [`docs/en/project-structure.md`](./docs/en/project-structure.md) | Estructura del proyecto, renderizado (SSR / CSR / SPA), carga del motor del lado del cliente |
| [`docs/en/attributes.md`](./docs/en/attributes.md) | Atributos personalizados (`data-t-include`, `data-t-source`, `data-t-list`, `data-t-if`, ...), formularios y guardado |
| [`docs/en/pipes.md`](./docs/en/pipes.md) | Pipes (filtros) y filtros incorporados |
| [`docs/en/data-api.md`](./docs/en/data-api.md) | Data API (operaciones, validación en el servidor, tipos de valores) y condiciones de consulta |
| [`docs/en/system-variables.md`](./docs/en/system-variables.md) | Variables reservadas `_sys` y propiedades del sistema |
| [`docs/en/local-mode.md`](./docs/en/local-mode.md) | Modo de desarrollo local (`file://`) |
| [`docs/en/database.md`](./docs/en/database.md) | Configuración de la base de datos y prioridad de enrutamiento |
| [`docs/en/deployment.md`](./docs/en/deployment.md) | Compilación, despliegue y flujo de desarrollo |
| [`docs/en/security.md`](./docs/en/security.md) | Seguridad |

## Ejemplos

La carpeta [`examples/`](./examples/) contiene "Bracify Books", una aplicación práctica de biblioteca / registro de lectura que usa las funciones principales de la documentación. Los mismos archivos funcionan sin cambios tanto en modo servidor (SSR + SQLite) como en el modo de desarrollo local `file://`. Consulta [`examples/README.md`](./examples/README.md) para ver cómo ejecutarla y el mapa de funciones a archivos.

## Contribuir

Este proyecto es desarrollado por un único mantenedor, por lo que no se aceptan Pull Requests de terceros. Los Issues (informes de errores, solicitudes de funciones y preguntas) son bienvenidos. Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para más detalles.
