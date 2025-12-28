[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Bracify Logo" width="200">
</p>

# Bracify 🚀

> **The HTML-only web framework. No CLI, Just Markup.**

Bracify is a framework that allows you to build web applications using only HTML markup.
We provide an "HTML-first" development experience, aiming to eliminate the barriers of programming and complex environment setup.

## What is Bracify?

Bracify pursues simplicity: "Build apps just by marking up."

- **For engineers tired of React/Vue**: Be free from complex build settings and the learning curve of heavy frameworks.
- **For markup engineers**: No programming required. Use only your HTML skills to build full-featured web apps, from data integration to deployment.

## Demo

![Demo Animation](./demo.gif)

## Key Concepts

- **HTML Markup Only**: Build apps just by marking up HTML without writing programs.
- **No CLI Required**: No "black screen" (terminal) needed. Our dedicated GUI launcher solves everything.
- **Hybrid Rendering**: Develop with `file://` (CSR), and publish as a server `https://` (SSR) as is.
- **Zero Configuration**: No complex `npm install` etc. needed.
- **Portable**: The project is just HTML. Carry it anywhere and run it immediately.

## Quick Start

Let's start by creating a simple page. It only takes 4 steps.

### 1. Preparation

Launch the `Bracify` GUI app and select a new workspace folder.

### 2. Create HTML

Create a file named `index.html` and write the following:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Specify data source -->
  <link data-t-source="info" href="/_sys/data/info.json">
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

### 3. Create Data

Create a file named `/_sys/data/info.json` and write the following:

```json
{
  "msg": "Hello Bracify!"
}
```

### 4. Run

When you press the `Start Server` button in the GUI app, a `_dist` folder is generated in your workspace. Opening `index.html` inside the `_dist` folder in your browser will display `Hello Bracify!`. Opening `localhost:3000` will show the same.
Enjoy the experience of displaying data with just HTML, without writing any JavaScript.

---

## Development Tools (Bracify Studio)

`Bracify` provides a dedicated GUI tool (code name: **Bracify Studio**) to maximize the developer experience.
This tool operates in a hybrid configuration of an Electron-based "Launcher" and an "Admin Dashboard (Web App)" built with `Bracify` itself.

### 1. Bracify Launcher (Desktop)

A lightweight wrapper application to launch the Admin Dashboard.

- **System Server**: Starts a system management API server upon application launch.
- **Launch**: Automatically opens the Admin Dashboard in a browser (or Electron window).

### 2. Admin Dashboard (Web)

An integrated management screen that consolidates all operations.

- **Project Control**:
  - **Open Project**: Opens a folder selection dialog via the system API to load projects.
  - **Start/Stop Server**: Specifies a port number to start the preview server for the target project.
- **Data Manager**:
  - JSON editing, schema estimation.
- **API Monitor**:
  - Check communication logs.
- **Static Build**:
  - Execute static site generation.

---

## Project Structure (File System Structure)

A `Bracify` project consists of a source editing folder (root) and an output folder (`_dist`).

### Recommended Directory Structure

```text
project/
├── index.html          # Entry point (editing target)
├── style.css           # Static resource
├── img/                # Assets like images
│   └── logo.png
├── _parts/             # Components for include (not included in build results)
│   ├── header.html
│   └── footer.html
├── _sys/               # System data and settings (not included in build results)
│   └── data/
│       └── articles.json
└── _dist/              # [Auto-generated] Build output destination (the final product goes here)
    ├── index.html
    ├── style.css
    └── img/
        └── logo.png
```

### Build Specifications

When you execute a "Build" via the GUI or command line, the output is generated in the `_dist` folder according to the following rules:

1. **HTML File Processing**:
    - `.html` files in the root directory are output to `_dist` with `data-t-include` resolved (components merged).
2. **Copy Static Resources**:
    - Images, CSS, JS files, etc., are copied to `_dist` as is.
3. **Exclusion Rules**:
    - Files and directories starting with an underscore `_` (`_parts`, `_sys`, etc.) are considered build-only or for system management and **are not copied to `_dist`**.
4. **Conversion of System Data (`_sys/data`)**:
    - `.json` files in the `_sys/data` folder are automatically converted to `.js` (Mock format) for CSR and output to `_dist/_sys/data`.
    - **Note**: Even if there is a `.js` file with the same name in the source folder, it is **ignored**. The source of truth for data is the `.json` file to prevent conflicts.
    - This conversion (build) is required even if you are not using `data-t-include`, in order to display data with CSR.

---

## Reference

### Custom Attributes

#### `data-t-include`

Loads an external HTML file and expands it as the content of the element. This attribute has two operation modes: **Snippet Include** and **Layout Application**.

In either mode, **the tag containing `data-t-include` itself is not deleted; its child elements (innerHTML) are replaced by the expanded result.**

---

##### Mode 1: Snippet Include

Inserts common components like headers or footers at the current location.

- **Operation**: Expands the content of the specified file directly inside the tag.
- **Example**:

    ```html
    <header data-t-include="_parts/header.html"></header>
    ```

    ↓ The content of `_parts/header.html` is expanded.

---

##### Mode 2: Layout & content

Loads a common "framework (layout)" and fills specific areas within it with its own content.

- **Operation**:
    1. Loads the template file specified by `data-t-include`.
    2. Matches `data-t-content` elements in the template with `data-t-content` elements within itself.
    3. Injects the page-side content into the specified locations on the template side.
- **Matching Rule**: Elements with matching `data-t-content` attribute values (names) become the targets for replacement. If no name is provided, it is treated as the default slot.

- **Example**:
    **Template (`_parts/layout.html`)**:

    ```html
    <div class="container">
        <h1 data-t-content="page-title">Default Title</h1>
        <main data-t-content="main-body"></main>
    </div>
    ```

    **Page using layout (`index.html`)**:

    ```html
    <body data-t-include="_parts/layout.html">
        <span data-t-content="page-title">My Profile</span>
        <div data-t-content="main-body">
            <p>Body content goes here.</p>
        </div>
    </body>
    ```

    ↓ **Result**:

    ```html
    <body>
        <div class="container">
            <h1 data-t-content="page-title">My Profile</h1>
            <main data-t-content="main-body">
                <div data-t-content="main-body">
                    <p>Body content goes here.</p>
                </div>
            </main>
        </div>
    </body>
    ```

- **Note**: Merging occurs on the server side during development server use or the build process. It does not work when viewing the file directly in a browser (`file://`).

#### `data-t-source`

Fetches data to be output to the HTML and gives that data a name.

- **Specification**: Specify any name, and specify the data acquisition URL in the `href` attribute.
- **Data Acquisition URL**: `/_sys/data/{data_definition_name}.json`
  - **Tip**: When checking on a PC, place a JSON file in the above directory. It can be used as sample data for HTML output.
- **Constraint**: Can only be specified on `<link>` tags.
- **Example**:

    ```html
    <link data-t-source="articles" href="/_sys/data/article.json">
    <link data-t-source="users" href="/_sys/data/user.json?status=active">
    ```

#### Data Display (Universal Placeholder)

You can display data by writing `{datasource_name.item_name}` in the HTML text or attribute values.

- **Basic Example**:
    Specify the data source and its property (item name) to display.

    ```html
    <link data-t-source="article" href="/_sys/data/articles.json?id={?id}">
    <h1>{article.title}</h1>
    <p>{article.body}</p>
    ```

- **Displaying Multiple Items (`data-t-list`)**:
    If there are multiple data items you want to display, you must specify `data-t-list="datasource_name"` on the element (range) you want to repeat.

    ```html
    <link data-t-source="articles" href="/_sys/data/articles.json">
    <ul>
      <li data-t-list="articles">
        <h3>{articles.title}</h3>
      </li>
    </ul>
    ```

#### Embedding Data into Attributes (Universal Placeholder)

In all standard attributes (`href`, `src`, `class`, `value`, `style`, etc.), you can directly embed data by writing placeholders `{ }`.

- **Usage Example**:

    ```html
    <img src="{article.thumbnail}" alt="{article.title}">
    <a href="/post/{article.id}" class="btn {article.category}">View Details</a>
    <div style="background-color: {user.color}; height: {progress}%;"></div>
    ```

- **Limit**: To avoid interference with JavaScript syntax, **placeholders cannot be used inside event handler attributes (`onclick`, `onchange`, etc.).** See "Avoiding Placeholder Interference" below.

#### Avoiding Placeholder Interference and Limitations

Bracify's placeholders `{ }` can be used in HTML attributes and text nodes. However, to prevent interference with JavaScript or CSS code (syntax using curly braces), **expansion is disabled** in the following locations:

- **Where expansion does NOT occur**:
  - Inside `<script>` tags.
  - Inside `<style>` tags.
  - Inside event handler attributes (all attributes starting with `on`, such as `onclick`, `onmouseover`, `onsubmit`).

##### Recommended Pattern: Using data in event handlers

If you want to use dynamic data within an event handler (JavaScript), we recommend the pattern of **embedding the data in a `data-` attribute and referencing it via `this.dataset`** instead of writing `{ }` directly.

```html
<!-- NOT recommended (will not work) -->
<button onclick="alert('ID: {article.id}')">Show</button>

<!-- RECOMMENDED pattern -->
<button data-id="{article.id}" onclick="alert('ID: ' + this.dataset.id)">Show</button>
```

By using this method, the Bracify template engine and standard browser JavaScript syntax can coexist safely.

#### Automatic Binding of Form Elements

If a `name` attribute is specified for `input`, `select`, or `textarea` elements, `Bracify` automatically binds (displays) the value from the appropriate data source. Users do not need to manually specify `value` or placeholders.

- **Priority for Automatic Binding**:
    1. **Current data context**: Sets the value from the properties of data specified by `data-t-scope`, etc.
    2. **URL Parameters (`_sys.query`)**: If there is an item with the same name as `name` in the page URL's query parameters, that value is set.

- **Specifying Data with `data-t-scope`**:
    By writing `data-t-scope="article"` on a container element (`div`, `form`, etc.), you can specify the "default data source" within that element. As a result, the internal `name="title"` will automatically refer to `article.title`.

- **Example (Search Form)**:

    ```html
    <!-- If the URL is ?title=Web, value="Web" is automatically set -->
    <input type="text" name="title" placeholder="Search articles...">
    ```

- **Example (Edit Form)**:

    ```html
    <!-- title and content from article data are automatically set in each field -->
    <form data-t-scope="article" method="PUT" action="/_sys/data/article">
      <input type="text" name="title">
      <textarea name="content"></textarea>
    </form>
    ```

- **Automatic Selection for Select Boxes**:
    The `selected` attribute is automatically added to `<option>` elements whose `value` matches the value bound to the `<select>` tag.

#### `data-t-if`

Displays or hides elements based on conditions. The element is displayed if the data value exists (`true`, non-null, non-zero, non-empty string).

- **Specification**: Specify the name of the data item to be evaluated.
- **Example**:

    ```html
    <!-- Displayed only if user.is_login is true -->
    <div data-t-if="user.is_login">
      Welcome, <span>{user.name}</span>!
    </div>
    ```

    ↓ **Result (if `user.is_login` is true)**

    ```html
    <div>
      Welcome, <span>John Doe</span>!
    </div>
    ```

    ↓ **Result (if `user.is_login` is false)**

    ```html
    <!-- The element itself is not output -->
    ```

    **Note (Negative Condition / Else)**:
    By adding `!` at the beginning, you can specify conditions for when the "value does not exist (false)". Use this instead of `else`.

    ```html
    <!-- Displayed only if user.is_login is false -->
    <div data-t-if="!user.is_login">
      <a href="/login.html">Please log in</a>
    </div>
    ```

#### `data-t-redirect`

Specifies the transition destination URL after a process (such as form submission) is successfully completed.

- **Specification**: Specify the relative or absolute path of the destination.
- **Target Tag**: Primarily `form` tags (expansion to buttons, etc., is planned for the future).
- **Example**:

    ```html
    <!-- Return to top page after submission -->
    <form method="POST" action="/_sys/data/contact" data-t-redirect="/">
    ```

### Forms and Data Saving

You can send data (create/update) to the API using standard `<form>` tags.

- **Automatic API Submission**: If you specify the API URL in the `action` attribute and `POST` or `PUT` in the `method` attribute, data is automatically sent in JSON format.
- **Page Transition**: You can specify the page to move to after saving is complete (relative path) using the `data-t-redirect` attribute. If not specified, the current page is reloaded.
- **Data Binding (Initial Values)**: By specifying `data-t-bind` on the `<form>` tag, you can set existing data as initial values for the input fields (useful for edit screens, etc.).
- **Input Items**: The `name` attribute of `<input>` and `<textarea>` becomes the data item name (property).

#### Example: Article Editing (Update) Form

```html
<!-- Binds article data to the entire form (sets initial values) -->
<!-- Sends with PUT method to the API specified in action -->
<!-- Returns to the list page (../list.html) after saving is complete -->
<form method="PUT" action="/_sys/data/article" data-t-bind="article" data-t-redirect="../list.html">

  <label>Title</label>
  <input type="text" name="title"> <!-- Populated with article.title -->

  <label>Body</label>
  <textarea name="content"></textarea> <!-- Populated with article.content -->

  <button>Save</button>
</form>
```

### Processing Filters (Pipes)

You can use processing filters (formal name: pipes) `|` when displaying data.

#### Basic Syntax

```html
<p>Updated: { article.updated_at | date: 'yyyy/mm/dd' }</p>
<span>Price: { product.price | number } USD</span>
```

↓ **Result**

```html
<p>Updated: 2025/12/10</p>
<span>Price: 1,500 USD</span>
```

#### Pipe Syntax

```text
{ data_name.item_name | filter_name: 'argument' }
```

### Standard Filters (Built-in Pipes)

#### `date`

Outputs date data (date type) as text in the specified format.

- **Syntax**: `{ item_name | date: 'format' }`
- **Format Specifications**:
  - `yyyy`: 4-digit year
  - `mm`: 2-digit month
  - `dd`: 2-digit day

## Data Access API

### Endpoint Specification (Data API)

You can not only read but also update and delete data (JSON files, etc.) on the server.

```text
/_sys/data/{entity}.json?{prop}={val}
```

#### Data Operation Methods

| Method | Action | Description |
| :--- | :--- | :--- |
| `GET` | Read | Fetches data according to conditions. |
| `POST` | Create | Creates new data. |
| `PUT` | Update | Replaces data matching conditions with the specified values. |
| `DELETE` | Delete | Deletes data matching conditions. |

### Endpoint Specification (File API)

An API for managing static files (images, etc.) on the server.

```text
/_sys/file/{filename}.{ext}
```

#### File Operation Methods

| Method | Action | Description |
| :--- | :--- | :--- |
| `GET` | Read | Fetches the file. |
| `POST` | Create | Uploads/creates a new file. |
| `PUT` | Update | Overwrites and updates the content of the specified file. |
| `DELETE` | Delete | Deletes the specified file. |

#### Parameters

- **`{entity}`**: The type of data (formal name: entity). e.g., `article`, `user`
- **`{prop}`**: The item name of the data used for filtering (formal name: property)
- **`{val}`**: The value specified for the condition

#### Operators

By adding symbols (operators) after the item name, you can specify more detailed conditions.

| Operator | Meaning | Example | Description of Example |
| :--- | :--- | :--- | :--- |
| (none) | Equal | `?status=active` | Status is `active` |
| `:ne` | Not equal | `?status:ne=draft` | Status is **NOT** `draft` |
| `:gt` | Greater than | `?price:gt=1000` | Price is **higher than** 1000 (1001~) |
| `:gte` | Greater than or equal | `?price:gte=1000` | Price is 1000 **or higher** (1000~) |
| `:lt` | Less than | `?stock:lt=10` | Stock is **less than** 10 (~9) |
| `:lte` | Less than or equal | `?stock:lte=10` | Stock is 10 **or less** (~10) |

### System Reserved Variable (`_sys`)

A reserved variable named `_sys` is provided to get the overall application context and browser request information.

| Variable Name | Description | Example |
| :--- | :--- | :--- |
| `_sys.query` | GET query parameters. Gets values such as `?id=123` from the URL. | `{_sys.query.id}` |

#### Usage in `data-t-source` (Dynamic Parameter Binding)

Inside the `href` attribute of `data-t-source`, you can dynamically embed query parameters using placeholders `{ }`. Furthermore, a shorthand notation `{?}` specific to URL parameters is available.

| Notation | Meaning | Example |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | Embed specified item (standard format) | `?id={_sys.query.id}` |
| `{?}` | **Auto Binding**. Gets a value from the URL with the same name as the key on the left | `?title={?}` |
| `{?xxx}` | **Shorthand**. Equivalent to `_sys.query.xxx` | `?title={?q}` |

#### Examples in Data Source

```html
<!-- If the URL is ?title=Web&_limit=10 -->

<!-- 1. Auto Binding: Best when the key name matches the URL parameter name -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">

<!-- 2. Shorthand: When the URL parameter name (e.g., q) and API key name (e.g., title) differ -->
<link data-t-source="search" href="/_sys/data/articles.json?title={?q}">

<!-- 3. Standard Format: To be more explicit -->
<link data-t-source="items" href="/_sys/data/items.json?category={_sys.query.cat}">
```

### Detailed Data Information (System Properties)

In addition to values contained in the data itself (titles, IDs, etc.), you may want to know the "count" or "status" of data.
In `Bracify`, you can get this special information by adding a name starting with an underscore `_` after the data name.

| Property Name | Description | Example |
| :--- | :--- | :--- |
| `_length` | Displays the number of items in a list (array) or the length of a string. | `{articles._length} articles` |

#### Control Parameters (Sort & Pagination)

To control the number of data items fetched and their order, use reserved parameters starting with an underscore `_`. This prevents conflicts with normal data items (e.g., a column named `limit`).

| Parameter | Description | Example |
| :--- | :--- | :--- |
| `_limit` | Maximum number of items to fetch | `?_limit=20` |
| `_offset` | Number of items to skip (for pagination) | `?_offset=20` (starts from the 21st item) |
| `_sort` | Item name to sort by | `?_sort=created_at` |
| `_order` | Sort order (`asc`: ascending, `desc`: descending) | `?_order=desc` (default is `asc`) |

#### Examples of Control Parameters

```html
<!-- Example of search/sort using URL parameters -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={_sys.query.title}&_sort={_sys.query._sort}&_order={_sys.query._order}&_limit={_sys.query._limit}">

<!-- Fixed category, with only page specified by parameter -->
<link data-t-source="techArticles" href="/_sys/data/articles.json?category=Tech&_limit=10&_offset={_sys.query._offset}">
```

#### Local Directory Structure Example

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

### Data Restrictions in Local Preview ("Zero Server" Mode)

When previewing as a local file (`file://`) without starting a server (e.g., double-clicking `index.html`), data acquisition operates as a simple mock within the browser.
This mode is intended for design confirmation and simple functional checks, and its behavior differs somewhat from a server environment (SSR).

- **Filter-related Restrictions**:
  - **Exact Match Only**: Returns data only when the specified key and value match exactly.
  - **Ignore Empty Values**: If the search parameter value is an empty string (`?name=`), that filter condition itself is ignored (all items are displayed).
  - **Advanced Operators Not Supported**: Operators like `:gt` or `:lt` do not function and are ignored or do not work as expected.

- **Supported Control Parameters**:
    The following parameters operate simply even in local preview:
  - `_limit`: Limit the number of items displayed
  - `_offset`: Skip data
  - `_sort`: Key to sort by
  - `_order`: `asc` (ascending) or `desc` (descending)

## Deployment

- **Serverless**: Intended for deployment to Vercel or Netlify.
- **Zip Upload**: Deploy by Zipping the project in the GUI app and simply dragging and dropping it onto the dashboard of each service.

## Development Flow

1. Download and install the `Bracify` GUI app from the official site.
2. Launch the app and create/select a workspace folder.
3. Edit `index.html`, `_parts/header.html`, etc. The GUI app provides a real-time preview.
4. Once complete, Zip and publish.
