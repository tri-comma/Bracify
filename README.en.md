[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Bracify Logo" width="200">
</p>

# Bracify 🚀

> **The HTML-only web framework. Just Markup.**
>
> No terminal is needed to build an app (Studio, the GUI, covers it). The CLI is an optional tool for static builds.

Bracify is a framework that allows you to build web applications using only HTML markup.
It offers an "HTML-first" development experience that aims to lower the barriers of programming and complex environment setup.

## What is Bracify?

Bracify pursues simplicity: "Build apps just by marking up."

- **For engineers tired of React/Vue**: Be free from complex build settings and the learning curve of heavy frameworks.
- **For markup engineers**: No programming required. Use only your HTML skills to build working web apps, including data integration.

## Demo

![Demo Animation](./demo.gif)

## Key Concepts

- **HTML Markup Only**: Build apps just by marking up HTML without writing programs.
- **Terminal-free Authoring**: Creating pages, previewing and managing data need no terminal. Bracify Studio, the GUI tool, covers it. The CLI (for static builds) is optional.
- **Hybrid Rendering**: Develop with `file://` (CSR), and publish as a server `https://` (SSR) as is.
- **Minimal Setup**: A project needs no configuration files or build steps. Starting Studio requires Node.js and a one-time `npm install` (see Quick Start below).
- **Portable**: The project is just HTML. Carry it anywhere and run it immediately.

## Quick Start

Let's start by creating a simple page. It only takes 4 steps.

### 1. Preparation

Start Bracify Studio and select a new workspace folder. Studio is currently started from source (Node.js is required): run `npm install` once at the repository root, then `npm start`. See [Studio](./docs/en/studio.md) for details.

### 2. Create HTML

Create a file named `index.html` and write the following:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Specify data source -->
  <link data-t-source="info" href="/_sys/data/info.json">
  <script src="bracify.js"></script>
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

`<script src="bracify.js"></script>` loads the client-side engine (needed for SPA transitions and Local Development Mode; see [Project Structure](./docs/en/project-structure.md)).

### 3. Create Data

Create a file named `/_sys/data/info.json` and write the following:

```json
{
  "msg": "Hello Bracify!"
}
```

### 4. Run

When you press the `Start Server` button in Studio and open `localhost:3000`, `Hello Bracify!` will be displayed.
The server reads `index.html` and `info.json` on startup, resolves SSI (Server Side Includes) in memory, and returns the response.
When you edit and save a file, OS-level monitoring immediately updates the template in memory.

---

## What You Can Build

One minimal example per feature. See the [Documentation](#documentation) for details.

### Showing data (`data-t-source` and placeholders)

Give a name to JSON data and embed it in text or attributes with `{name.field}`. URL parameters are available as `{?id}`.

```html
<link data-t-source="article" href="_sys/data/articles.json?id={?id}">
<h1>{article.title}</h1>
<p>{article.body}</p>
```

### Lists (`data-t-list`)

Put it on the element to repeat; it is cloned once per record. Sorting, limits and paging are set with URL parameters.

```html
<link data-t-source="articles" href="_sys/data/articles.json?_sort=id&_order=desc&_limit=5">
<ul>
  <li data-t-list="articles"><a href="article.html?id={articles.id}">{articles.title}</a></li>
</ul>
```

### Conditions (`data-t-if`)

Show or hide elements by existence, comparison (`=`, `:gt`, ...), AND (space) and OR (comma).

```html
<span data-t-if="status=published">Published</span>
<div data-t-if="price:gte=1000 stock:gt=0">In stock</div>
<div data-t-if="!user.is_login"><a href="login.html">Log in</a></div>
```

### Saving forms (Data API with server-side validation)

Post a plain `<form>` to the Data API and the data is saved. Constraints such as `required`, `maxlength` and `pattern` are also checked on the server; on failure the user returns to the page with `?error=`.

```html
<form method="POST" action="/_sys/data/articles.json" data-t-redirect="articles.html">
  <input type="text" name="title" required maxlength="100">
  <input type="email" name="email" required>
  <button>Save</button>
</form>
<p>{_sys.query.error}</p>
```

### Parts and layouts (`data-t-include`)

Insert shared parts such as a header, or pour page content into a common layout.

```html
<!-- _parts/layout.html contains <main data-t-content="main-body"></main> -->
<body data-t-include="_parts/layout.html">
  <div data-t-content="main-body"><p>Page content</p></div>
</body>
```

### Pipes (filters)

Format with `|`: dates, numbers, currency, truncation, defaults. `date`, `number`, `currency`, `uppercase`, `lowercase`, `truncate`, `default`, `ternary` and `json` are built in.

```html
<p>{ article.updated_at | date: 'yyyy/mm/dd HH:MM' }</p>
<span>{ product.price | currency }</span>
<span>{ article.summary | truncate: 10 | uppercase }</span>
```

### SPA navigation

Plain `<a>` links to internal pages automatically navigate without a full page reload. No JavaScript needed.

```html
<a href="book.html?id=1">Book</a>
```

### Local mode (`file://`, no server)

Open `index.html` in Chrome / Edge by double-clicking and choose the project folder (read-only; uses the File System Access API). Each page needs this one line.

```html
<script src="bracify.js"></script>
```

### Studio data manager and scaffold

Studio collects entities and schemas from your HTML, lets you list, create, edit and delete records, and generates list and edit page scaffolds.

## Current Limitations

Bracify is an early-stage project. Please use it with the following in mind.

- **Local mode is read-only.** Forms cannot be saved on `file://` ([#56](https://github.com/tri-comma/Bracify/issues/56)).
- **There is no authentication yet.** On a public server, anyone who can reach the Data API can write data ([#106](https://github.com/tri-comma/Bracify/issues/106)). Be careful when publishing.
- **File upload is not supported** ([#107](https://github.com/tri-comma/Bracify/issues/107)).
- **There is no one-step deployment.** Put the static build on a static host, or run server mode on a host that runs Node.js ([#105](https://github.com/tri-comma/Bracify/issues/105)).

## Documentation

The detailed specification is in `docs/`.

| File | Contents |
| --- | --- |
| [`docs/en/README.md`](./docs/en/README.md) | Table of contents of the documentation |
| [`docs/en/studio.md`](./docs/en/studio.md) | Bracify Studio (launcher, admin dashboard, data manager, scaffold) |
| [`docs/en/project-structure.md`](./docs/en/project-structure.md) | Project structure, rendering (SSR / CSR / SPA), loading the client-side engine |
| [`docs/en/attributes.md`](./docs/en/attributes.md) | Custom attributes (`data-t-include`, `data-t-source`, `data-t-list`, `data-t-if`, ...), forms and saving |
| [`docs/en/pipes.md`](./docs/en/pipes.md) | Pipes (filters) and the built-in filters |
| [`docs/en/data-api.md`](./docs/en/data-api.md) | Data API (operations, server-side validation, value types) and query conditions |
| [`docs/en/system-variables.md`](./docs/en/system-variables.md) | `_sys` reserved variables and system properties |
| [`docs/en/local-mode.md`](./docs/en/local-mode.md) | Local development mode (`file://`) |
| [`docs/en/database.md`](./docs/en/database.md) | Database configuration and routing priority |
| [`docs/en/deployment.md`](./docs/en/deployment.md) | Build, deployment and development flow |
| [`docs/en/security.md`](./docs/en/security.md) | Security |

## Examples

The [`examples/`](./examples/) folder contains "Bracify Books", a practical library / reading-log app that uses the main features of the documentation. The same files run unchanged in both server mode (SSR + SQLite) and local `file://` development mode. See [`examples/README.md`](./examples/README.md) for how to run it and a feature-to-file map.

## Contributing

This project is developed by a single maintainer, so Pull Requests from third parties are not accepted. Issues (bug reports, feature requests, and questions) are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
