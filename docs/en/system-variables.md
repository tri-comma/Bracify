# System Variables and System Properties

[← Documentation index](./README.md) | Language: [日本語](../ja/system-variables.md) | **English**

## System Reserved Variable (`_sys`)

A reserved variable named `_sys` is provided to get the overall application context and browser request information.

| Variable Name | Description | Example |
| :--- | :--- | :--- |
| `_sys.query` | GET query parameters. Gets values such as `?id=123` from the URL. | `{_sys.query.id}` |

### Shorthand `{?xxx}`

`{?xxx}` is a shorthand for `{_sys.query.xxx}`. It can be used not only in the `href` of `data-t-source` but anywhere placeholders are available, such as body text, attribute values, `data-t-if`, and `data-t-include`. Pipes and arithmetic work the same way.

```html
<!-- If the URL is ?q=bracify -->
<p>Search results for "{?q}"</p>          <!-- Search results for "bracify" -->
<p>{?q | uppercase}</p>                    <!-- BRACIFY -->
<a href="books.html?q={?q | default: ''}&_sort=title">Sort by title</a>
```

- If the parameter is absent, it becomes an empty string.
- **About URL encoding**: Values embedded in the query part of the `href` of `data-t-source` are URL-encoded automatically, but in ordinary attributes (such as `<a href>`) they are only HTML-escaped, not URL-encoded. Putting a value that may contain `&` or `=` into a link's query may cause it to be interpreted as separate parameters.
- The no-value `{?}` (auto binding) can only be used inside the `href` of `data-t-source` ([see below](#usage-in-data-t-source-dynamic-parameter-binding)).

### Usage in `data-t-source` (Dynamic Parameter Binding)

Inside the `href` attribute of `data-t-source`, you can dynamically embed query parameters using placeholders `{ }`. Furthermore, a shorthand notation `{?}` specific to URL parameters is available.

| Notation | Meaning | Example |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | Embed specified item (standard format) | `?id={_sys.query.id}` |
| `{?}` | **Auto Binding**. Gets a value from the URL with the same name as the key on the left | `?title={?}` |
| `{?xxx}` | **Shorthand**. Equivalent to `_sys.query.xxx` | `?title={?q}` |

### Examples in Data Source

```html
<!-- If the URL is ?title=Web&_limit=10 -->

<!-- 1. Auto Binding: Best when the key name matches the URL parameter name -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">

<!-- 2. Shorthand: When the URL parameter name (e.g., q) and API key name (e.g., title) differ -->
<link data-t-source="search" href="/_sys/data/articles.json?title={?q}">

<!-- 3. Standard Format: To be more explicit -->
<link data-t-source="items" href="/_sys/data/items.json?category={_sys.query.cat}">
```

## Detailed Data Information (System Properties)

In addition to values contained in the data itself (titles, IDs, etc.), you may want to know the "count" or "status" of data.
In `Bracify`, you can get this special information by adding a name starting with an underscore `_` after the data name.

| Property Name | Description | Example |
| :--- | :--- | :--- |
| `_length` | Displays the number of items in a list (array) or the length of a string. | `{articles._length} articles` |
| `_total` | The number of all records matching the filters, before `_limit` / `_offset` are applied. Use it for the total count and the "Next" check in pagination (equal to `_length` when there is no `_limit`). It is a meta property like `_length`, not a record field, and it is also available on the single object that a `_limit=1` source expands to. | `{articles._length} / {articles._total}` |

### Control Parameters (Sort & Pagination)

To control the number of data items fetched and their order, use reserved parameters starting with an underscore `_`. This prevents conflicts with normal data items (e.g., a column named `limit`).

| Parameter | Description | Example |
| :--- | :--- | :--- |
| `_limit` | Maximum number of items to fetch | `?_limit=20` |
| `_offset` | Number of items to skip (for pagination) | `?_offset=20` (starts from the 21st item) |
| `_sort` | Item name to sort by | `?_sort=created_at` |
| `_order` | Sort order (`asc`: ascending, `desc`: descending) | `?_order=desc` (default is `asc`) |
| `_fields` | Comma-separated list of the fields to return. `id` is always kept and unknown names are ignored. The list is applied literally, so a key used by a relation (such as `author_id` for `{book.author.name}`) must be listed too. The embedded page data (`window.__BRACIFY_DATA__`) is projected as well, so fields you do not show stay out of the response. | `?_fields=id,title,price` |

The upper bound of `_limit` can be set with the environment variable `BRACIFY_MAX_LIMIT` (SSR, read on every request). The cap is on by default and is 1000. A larger `_limit` (for example one passed from user input with `?_limit={?_limit}`) is clamped to that value. With `BRACIFY_MAX_LIMIT=1`, a larger `_limit` becomes 1 and the source expands to a single object. A non-numeric or negative `_limit` (`-1`, `abc`) is clamped to the cap as well. A positive integer changes the cap, and `0` disables it. It does not apply to a source that has no `_limit`.

> **Breaking change**: because the cap is now on by default, a page that passes a `_limit` above 1000 gets 1000 records. Raise it with `BRACIFY_MAX_LIMIT` if you need more.

### Examples of Control Parameters

```html
<!-- Example of search/sort using URL parameters -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={_sys.query.title}&_sort={_sys.query._sort}&_order={_sys.query._order}&_limit={_sys.query._limit}">

<!-- Fixed category, with only page specified by parameter -->
<link data-t-source="techArticles" href="/_sys/data/articles.json?category=Tech&_limit=10&_offset={_sys.query._offset}">

<!-- The total and the "Next" check use _total (no second source that loads every record just for counting) -->
<p>{techArticles._length} / {techArticles._total}</p>
<a data-t-if="techArticles._total:gt={_sys.query._offset + 10}" href="?_offset={_sys.query._offset + 10}">Next</a>
```

### Local Directory Structure Example

```text
project/
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

**JSON File Example** (`_sys/data/article.json`):

```json
[
  {
    "id": 1,
    "title": "Article Title 1",
    "summary": "Article summary...",
    "published_at": "2025-12-01T10:00:00Z"
  },
  {
    "id": 2,
    "title": "Article Title 2",
    "summary": "Article summary...",
    "published_at": "2025-12-05T15:30:00Z"
  }
]
```
