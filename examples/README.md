# Bracify Books (examples/bracify-books)

A small library / reading-log app written with **HTML only** (no JavaScript, no build step). It is meant as a
reference for the features documented in [docs/en](../docs/en/README.md) (Japanese: [docs/ja](../docs/ja/README.md)): the same files run both in
**server mode** (SSR + Data API + SQLite) and in **local mode** (`file://`, True Zero Server).

Data: books, authors, categories, reviews and a `site` settings object, all seeded from `_sys/data/*.json`.

## Run it

### Server mode (SSR + SQLite)

```bash
# from the repository root (after `npm install`)
node engine/start.cjs examples/bracify-books 3000
# open http://localhost:3000/
```

On start the server creates `examples/bracify-books/_sys/data.db` and imports each `_sys/data/*.json` file into it
once per entity (on the first start, or the first start after a new seed file is added). Later edits to the seed files
and records deleted through the API are not overridden on restart. Form posts are stored in the database, not written
back to the JSON files. Delete `_sys/data.db` to start from the seed data again. (It is git-ignored.)
Local mode (`file://`, CSR) reads the seed JSON directly and has no persistent DB, so this once-per-entity behavior applies to server mode only.

### Local mode (`file://`, no server)

1. Open `examples/bracify-books/index.html` in Chrome or Edge (double click / `file://` URL).
2. Click **Choose Project Folder** and select `examples/bracify-books`.
3. Browse the app: pages, includes, data sources, filters, sorting, pagination and SPA navigation all work.
   A small **Disconnect Folder** button appears at the bottom right; `?bracify_reset=1` and `Bracify.resetRootAccess()`
   reset the folder access as well.

Local mode is read-only: the browser engine has no write path, so the forms (create / edit / delete / review) only
work in server mode. Local mode also supports exact-match filters only (no `:gt`, `:lt`, ...), see [Local Development Mode](../docs/en/local-mode.md).
A browser without the File System Access API gets the read-only mock mode (layout includes may be missing there).

The pages are all in the app root and use relative links (`book.html?id=1`) so they behave the same in both modes.
Always start local mode from `index.html`: SPA navigation keeps the folder permission.
Every page loads the engine with one `<script src="bracify.js"></script>` tag. In server mode the server answers that URL
with its own engine; on `file://` the page loads `bracify.js` from this folder, a committed copy of `engine/lib/engine.cjs`.
After changing the engine run `npm run sync:examples` to refresh the copy (a test fails when they differ). In your own project
use the same tag; local mode needs the copy next to your pages (`bracify.js`), the server does not.

## Tests

```bash
npm run test:examples   # examples/tests/*.test.js only
npm test                # engine tests, then the examples tests
```

| File | Environment | What it does |
| --- | --- | --- |
| `tests/server.test.js` | server | Starts `node engine/start.cjs` on a free port against a temp copy of the app and drives it over real HTTP: renders every page, checks filters / sort / pagination, relations, pipes, conditions, then submits the rendered forms (POST create, PUT edit, DELETE, review) and follows the redirects. Also checks the `_parts/` / `_sys/` 403 guard and cross-origin rejection. |
| `tests/local.test.js` | local | Runs the engine the pages load (`bracify.js`, a copy pinned to `engine/lib/engine.cjs` by the identity test) in jsdom on a `file://` URL with a File System Access API directory handle backed by the real folder (temp copy). Covers folder connect / disconnect / reset, rendering, SPA navigation (links, pager, GET search form, history), mock mode, and compares the rendered output of 30 page/query combinations with the real server's output. |
| `tests/helpers.cjs`, `tests/local-helpers.cjs` | both | Temp-copy, server start, and jsdom + directory-handle helpers. |

The static-build CLI (`cli/`) is not part of the tests: the app runs as is in both modes (see [Deployment](../docs/en/deployment.md)),
so there is nothing to build for this app.

## Feature to file map

| Documented feature | Where it is used |
| --- | --- |
| `data-t-include` snippet mode | `_parts/header.html`, `_parts/footer.html` (via `_parts/layout.html`), `about.html` (`_parts/about-text.html`), `_parts/book-fields.html` and `_parts/author-fields.html` (form fields) |
| `data-t-include` layout mode + `data-t-content` | every page (`<body data-t-include="_parts/layout.html">`, slots `page-title` / `main-body`) |
| `data-t-source` (relative `_sys/data/x.json`) | all pages, `<link>` in `<head>` |
| Source filters with `{?param}` / `{_sys.query.x}` shortcuts | `books.html` (`status`, `category_id`, `author_id`, `title`), `authors.html` (`country`), `book.html` / `author.html` (`id`) |
| `_limit=1` single record | `book.html`, `book-edit.html`, `author.html`, `author-edit.html`, `pipes.html` |
| `_sort` / `_order` / `_limit` / `_offset` | `books.html` (sort links, form, pager), `index.html` (latest books), `book.html` (reviews newest first) |
| Exact-match filters on numbers / booleans | `index.html` (`featured=true`, `rating=5`), `books.html` (`category_id`), `author.html` |
| Operators `:ne :gt :gte :lt :lte` | in `data-t-if`: `pipes.html`, `book.html`, `index.html`, `author.html`. (In source URLs they only work on the server, so the app does not use them there, see Limitations.) |
| Placeholders, nested access | `{book.meta.isbn}`, `{site.footer.year}` in `book.html`, `_parts/footer.html` |
| Automatic relations (#18) | `{books.author.name}`, `{books.category.name}` (`books.html`, `index.html`, `author.html`, `pipes.html`), `{topReviews.book.title}` (`index.html`) |
| Arithmetic | `books.html` (`price * 1.1`, `price * stock`, `_offset - 3`), `book.html` (`pages / 40`, `(price + 100) * 3`), `pipes.html` (`%`, `/ 0`) |
| `_index` | `index.html` (`latest._index + 1`), `books.html`, `pipes.html` |
| Attribute bindings (`href`, `class`, `style`, `value`, `data-*`) | `books.html` (`class="row {shelf.status}"`), `book.html` (`style="width: {rating * 20}%"`), links everywhere |
| `data-t-list` (+ nested lists, lists of strings) | `authors.html` (genres, links), `book.html` (tags), `_parts/book-fields.html` (radio lists) |
| `data-t-if` existence, `!`, comparisons, AND (space), OR (comma), variables | `index.html`, `book.html`, `books.html`, `pipes.html` |
| `data-t-scope` | `author.html` (`{name}`), `book-edit.html` / `author-edit.html` (forms), `books.html` (`_sys.query` search form), `pipes.html` |
| Form auto-binding (text / number / radio / checkbox / textarea / select) | `book-edit.html`, `author-edit.html` (+ the `_parts` fields), `books.html` (search form from the URL), `book.html` (review form) |
| `data-t-redirect` | hidden `data-t-redirect` field in every form (`book-new.html`, `book-edit.html`, `books.html`, `book.html`, `authors.html`, ...) |
| Form `POST` / `PUT` / `DELETE` (`?_method=`) | create: `book-new.html`, `author-new.html`, review form in `book.html`; update: `book-edit.html`, `author-edit.html`; delete: `book-edit.html`, `books.html`, `authors.html` |
| Nested form field names (`meta.isbn`, `tags.0`, `links.0.label`) | `_parts/book-fields.html`, `_parts/author-fields.html` |
| Pipes: `date number currency uppercase lowercase truncate default ternary json` and chaining | `pipes.html` (one line each), plus `book.html`, `books.html`, `index.html` |
| `_sys.query`, `{?x}` shortcut, `_length` | `pipes.html`, `books.html`, `index.html` (`books._length`), `about.html` |
| Placeholder escaping `\{ \}` | `about.html` |
| Event handler data pattern (`data-*` + `this.dataset`) | delete buttons (`books.html`, `book-edit.html`, `authors.html`), `pipes.html` |
| SPA navigation with plain `<a>` and GET forms | all links; `books.html` search form |
| Disconnect Folder / `bracify_reset` | engine UI, local mode (see above) |
| Underscore guard (403 for `_parts/`, `_sys/`) | tested in `tests/server.test.js` |

## Limitations and engine notes

These came up while building the app; the app avoids them or works around them with documented syntax only.
Some workarounds remain in the app although the engine has since been fixed: radio lists instead of a `<select>` with
`data-t-list` options (#43), `data-t-scope="_sys.query"` on the search form (#47), and hidden `data-t-redirect`
fields with root-relative paths (the `<form data-t-redirect>` attribute works too, and relative paths now resolve
against the page holding the form, #45). They are still valid syntax.

* **Local mode cannot save forms.** There is no engine code that handles `POST` / `PUT` / `DELETE` forms on `file://`
  (#56).
* **Source operators (`:gt` ...) in `data-t-source` URLs** work on the server only (local mode is exact-match only, see [Local Development Mode](../docs/en/local-mode.md)).
  The server previously treated them as part of the field name and could not match numeric / boolean fields at all
  (fixed in the same pull request).
* **Seed JSON files are imported once per entity**, so later edits to a seed file do not affect an existing `_sys/data.db`; delete `_sys/data.db` to re-seed.
