# Development Tools (Bracify Studio)

[← Documentation index](./README.md) | Language: [日本語](../ja/studio.md) | **English**

`Bracify` provides a dedicated GUI tool (code name: **Bracify Studio**) to maximize the developer experience.
This tool operates in a hybrid configuration of an Electron-based "Launcher" and an "Admin Dashboard (Web App)" built with `Bracify` itself.

## 1. Bracify Launcher (Desktop)

A lightweight wrapper application to launch the Admin Dashboard.

- **System Server**: Starts a system management API server upon application launch.
- **Launch**: Automatically opens the Admin Dashboard in a browser (or Electron window).

## 2. Admin Dashboard (Web)

An integrated management screen that consolidates all operations.

- **Project Control**:
  - **Open Project**: Opens a folder selection dialog via the system API to load projects.
  - **Start/Stop Server**: Specifies a port number to start the preview server for the target project.
  - **Concurrent multi-project execution**: Each project runs as an independent child process (`node engine/start.cjs <path> <port>`), so several can run at the same time.
    - Start/stop uses plain `<form method="POST">` (SSR), no JavaScript required.
      - `POST /_sys/server/start` (field: `id` = project ID)
      - `POST /_sys/server/stop` (field: `id`)
      - After processing, redirects (303) to `data-t-redirect`, else the Referer, else `/`. On failure it redirects back with `?error=message` appended so the page can show `{?error}`.
    - The `port` of the `projects` entity is used. If empty, probing starts at 3000; if the configured port is busy, free ports are probed upward from that port. The port actually used overwrites `port` in the record.
    - This feature is enabled only on the server running as the system server (Studio); elsewhere `/_sys/server/*` returns 404. POSTs whose `Origin` header does not match `Host` are rejected with 403. If a child process exits unexpectedly, `status` is updated to `stopped`.
    - The result (`status` = `running`/`stopped`, `pid`, actual `port`) is written back to the project record and shown on the dashboard.
    - Stopping the system server also stops all child processes it started.
- **Data Manager**:
  - Automatically collects entities and schema from the project's HTML, and provides data listing, create/edit/delete (CRUD) and scaffolding. The pages are `studio/data/index.html?project=<id>` (entity list) and `studio/data/entity.html?project=<id>&entity=<name>` (schema, records, create form), all JavaScript-free SSR forms.
  - **Entity discovery**: scans every `*.html` in the project (excluding `node_modules`, `_sys` and dot-folders; `_parts` is included) and collects entities from:
    - the `href` of `data-t-source` (`_sys/data/<entity>.json`)
    - `<form action="..._sys/data/<entity>.json">` and the `name` of its `input` / `select` / `textarea` (`data-t-redirect` is skipped; dotted names such as `a.b` are nested fields)
    - `{<source>.<field>}` placeholders that use a known source name (type `unknown`)
    - existing DB records (fields not defined by forms get `number` / `boolean` / `string` / `object` inferred from values)
  - **Schema info**: per field, the type (`text` / `number` / `email` / `date` / `checkbox` / `enum` (options of a `select`) / `unknown`, ...), `required`, `maxlength`, `minlength`, `min`, `max` and `pattern`.
  - **Validation limits**: field names must match `[A-Za-z0-9_.-]` (others are ignored). `required` is not enforced for `checkbox` (an unchecked box is not submitted). Values longer than 1000 characters are rejected by `pattern` checks. A `pattern` containing nested quantifiers (e.g. `(a+)+$`) is not enforced for safety and the field's `patternSkipped` is `true` in the schema.
  - **CRUD**: operates directly on the target project's data (`<project>/_sys/data.db` and that project's routing config). Studio's own DB is not affected.
    - `POST /_sys/studio/records?project=<id>&entity=<name>` (create), `POST /_sys/studio/records/update?project=<id>&entity=<name>&id=<id>` (update), `POST /_sys/studio/records/delete?project=<id>&entity=<name>&id=<id>` (delete)
    - Create/update are validated server-side against the discovered schema (`required` / `maxlength` / `minlength` / `min` / `max` / `pattern` / type); on failure the response is a 303 redirect back with `?error=message`. On success it redirects to `data-t-redirect`, or the Referer.
    - SSR data sources (virtual hrefs for Studio pages only): `_sys/studio/entities.json?project=<id>`, `_sys/studio/records.json?project=<id>&entity=<name>` (supports the same filters, `_sort`, `_limit`, `_offset` as the Data API) and `_sys/studio/schema.json?project=<id>&entity=<name>`.
  - **Scaffold (development only)**: `POST /_sys/studio/scaffold?project=<id>&entity=<name>` generates `<entity>/index.html` (list and delete forms) and `<entity>/edit.html` (create/edit form with `type` / `required` / `maxlength` / `pattern` matching the schema) in the target project. The output uses only documented Bracify attributes and never overwrites existing files (it returns an error instead).
  - Like `/_sys/server/*`, these features are enabled only on the system server (Studio) (404 elsewhere), and POSTs whose `Origin` differs from `Host` are rejected with 403. `entity` may contain only letters, digits, `_` and `-` (not starting with `_`).
- **API Monitor**:
  - Check communication logs.
