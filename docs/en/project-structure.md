# Project Structure (File System Structure)

[← Documentation index](./README.md) | Language: [日本語](../ja/project-structure.md) | **English**

A `Bracify` project consists of a single source folder. No physical build directory is required for execution.

## Recommended Directory Structure

```text
project/
├── index.html          # Entry point
├── style.css           # Static resource
├── img/                # Any folder not starting with underscore is public
│   └── logo.png
├── _parts/             # [Private] Components for include
│   ├── header.html
│   └── footer.html
└── _sys/               # [Private] System data and settings
    ├── data.db         # Database file
    └── data/           # JSON data for entities
        └── articles.json
```

## Rendering Specifications

Bracify allows you to seamlessly switch between "SSR Mode" (acting as a web server) and "CSR Mode" (running directly in the browser).

### 1. SSR Mode (Server-Side)
The server dynamically builds HTML in response to requests.

- **On-memory Build**: Resolves `data-t-include` and caches the combined HTML template in **memory** upon startup or file save.
- **File Watching**: When `index.html` or files under `_parts/` are updated, the server detects OS-level events and automatically rebuilds the memory cache.
- **High Performance**: Responses are served from the pre-combined templates in memory, minimizing disk I/O.

### 2. CSR Mode (Client-Side)
Runs via the `file://` protocol by opening the folder directly in a browser.

- **Runtime Include**: When the browser loads the HTML, it fetches and merges files specified by `data-t-include` on the fly using the File System Access API.
- **Consistency**: Both SSR and CSR use the exact same binding engine (`engine.js`), ensuring identical results across environments.

### 3. Page Transitions and SPA Routing (Unified SPA)
Bracify treats **all page transitions as SPA by default** in both SSR and CSR modes.

- **Seamless Experience**: By avoiding full page reloads, Bracify uses Ajax (Fetch) to retrieve the next page's HTML and dynamically replaces the `<body>` and other DOM elements. This prevents the "blank screen" (flicker) and provides a fast, smooth app-like feel.
- **Permission Persistence**: Crucial for CSR mode. In a `file://` environment, a full page reload resets browser folder access permissions. The SPA approach allows you to maintain permission throughout the session.
- **Automatic Interception**: Standard `<a>` tags for internal links are automatically detected and promoted to SPA transitions. Developers can build SPA apps without writing a single line of JavaScript.
- **Browser History Support**: Utilizes the `history.pushState` API so that URL updates and "Back/Forward" buttons work exactly as expected even during SPA transitions.

### 4. Loading the Client-Side Engine

Pages displayed by SSR alone don't need a `<script>`, but to use SPA transitions, Local Development Mode (`file://`), or CSR, each page must load the client-side engine in its `<head>`.

In every mode the engine is loaded with this single `<script>`:

```html
<script src="bracify.js"></script>
```

In pages inside a subfolder use a relative path (e.g. `<script src="../bracify.js"></script>`).

- **Server mode**: The server serves the engine at the virtual path `/bracify.js` (root only) as `text/javascript`. Even if the project has a file with the same name, the server's own engine always wins, so SSR and the browser run the same engine version. Conditional requests with ETag are supported.
- **Local Development Mode (`file://`)**: Since there is no server, `bracify.js` must be placed inside your project, reachable from the page by a relative path. Studio's scaffold and the CLI build create it automatically. Otherwise copy the repository's `engine/lib/engine.cjs` as `bracify.js` ([`examples/`](../../examples/) refreshes its copy with `npm run sync:examples`).
- **Compatibility**: The previous `/engine/engine.cjs` is still served (as `text/javascript`). During SPA transitions the engine script is recognized by any of the file names `bracify.js`, `engine.js` and `engine.cjs` and is never loaded again.
