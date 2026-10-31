## Local Development Mode (True Zero Server Mode)

[← Documentation index](./README.md) | Language: [日本語](../ja/local-mode.md) | **English**

The mode where you develop by directly opening `index.html` as a local file (`file://`) in a browser without starting a server.

### Build-less Development via File System Access API

By utilizing the **File System Access API** provided by modern browsers (Chrome, Edge, etc.), the traditional build process becomes unnecessary.

1. **Select Project Folder**: When opening a page via `file://`, a folder selection prompt appears during initialization. By selecting the project's root directory, the browser can directly fetch and operate on files.
2. **Build-less Preview**: Since `_sys/data/*.json` and `_parts/*.html` are read directly by the browser, any edits and saves are instantly reflected upon browser reload (or transition).

### Resetting Folder Access

The selected folder handle is stored in the browser's IndexedDB and restored automatically next time. To switch to another project or redo the permission, reset it in any of the following ways (`file://` mode only).

- **Disconnect Folder button**: While a folder is connected, the engine shows a small "Disconnect Folder" button at the bottom-right of the screen. Clicking it discards the stored handle and shows the folder selection overlay again.
- **JavaScript API**: `Bracify.resetRootAccess()` (returns a Promise). It deletes the handle from IndexedDB, drops the in-memory handle, and shows the folder selection overlay again.
- **URL parameter**: Opening with `?bracify_reset=1` discards the stored handle instead of restoring it and shows the overlay. The parameter is removed from the URL automatically via `history.replaceState`.

None of this UI is included in SSR (server) output.

### Page Transitions and SPA Routing

As described in [Page Transitions and SPA Routing (Unified SPA)](project-structure.md#3-page-transitions-and-spa-routing-unified-spa), all transitions in CSR mode are handled as SPA. This solves the major challenge of losing folder access permissions upon reload in a `file://` environment.

### Limitations in Unsupported Browsers

If the browser does not support the File System Access API or if folder selection is not performed, it operates in the following restricted "Read-only Mock Mode":

- **Filter Limitations**: Exact match only. Operators like `:gt` or `:lt` will not work.
- **No Updates**: Data saving via form submission is not performed.
- **Partial Display**: Loading external files (`data-t-include`) may be restricted.

### Data Filtering and Control (Common Specs)

In local development mode (both True Zero Server and Mock Mode), simple data processing occurs within the browser with the following limitations and specifications:

- **Filter Limitations**:
  - **Exact Match Only**: Returns data only when the specified key and value match exactly.
  - **Ignore Empty Values**: If the filter value is an empty string (`?name=`), that condition is ignored (all items are displayed).
  - **Empty `id` Exception**: A filter on the key `id` is the one exception: if its value is empty or an unresolved placeholder (e.g. `{?}`), it returns no records instead of being ignored (so `?id={?id}&_limit=1` with no id shows "not found" rather than the first record).
  - **Advanced Operators Not Supported**: Operators like `:gt` or `:lt` do not function and are ignored.

- **Supported Control Parameters**:
  The following parameters operate simply even in local environments:
  - `_limit`: Display limit
  - `_offset`: Data skip
  - `_sort`: Sort key
  - `_order`: `asc` (ascending) or `desc` (descending)
  - `_fields`: Field projection (comma-separated, `id` is always kept)

  `{source._total}` has the same value as on the server (the count before `_limit` / `_offset`). `BRACIFY_MAX_LIMIT` is a server (SSR) setting only and does not apply in local mode.

### JavaScript Behavior in SPA Mode

In Local Development Mode (True Zero Server Mode), when transitioning without a page reload, JavaScript execution follows these rules:

- **Scope Isolation (IIFE Wrapping)**: To prevent conflicts with variable declarations (`const`, `let`) from previous pages, page-specific scripts (inside `<body>` and newly loaded scripts in `<head>`) are automatically wrapped and executed as Immediately Invoked Function Expressions (IIFE) by Bracify.
- **Prevention of Duplicate Execution**: Among scripts in `<head>`, those already loaded (like `engine.js` or common libraries) are not re-executed in the navigation destination.
- **Persistence of Global Variables**: Data explicitly attached to the `window` object or `var` variables defined outside of IIFEs persist after navigation.
- **Event Listeners**: Event listeners added directly to `window` or `document` are not automatically cleaned up upon navigation. It is recommended to attach page-specific events to elements within `<body>` or design them with navigation in mind.
