# Custom Attribute Reference

[← Documentation index](./README.md) | Language: [日本語](../ja/attributes.md) | **English**

## Custom Attributes

### `data-t-include`

Loads an external HTML file and expands it as the content of the element. This attribute has two operation modes: **Snippet Include** and **Layout Application**.

In either mode, **the tag containing `data-t-include` itself is not deleted; its child elements (innerHTML) are replaced by the expanded result.**

---

#### Mode 1: Snippet Include

Inserts common components like headers or footers at the current location.

- **Operation**: Expands the content of the specified file directly inside the tag.
- **Example**:

    ```html
    <header data-t-include="_parts/header.html"></header>
    ```

    ↓ The content of `_parts/header.html` is expanded.

---

#### Mode 2: Layout & content

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

- **Note**: Merging occurs on the server side during development server use or via File System Access API in the browser.

---

#### Dynamic Include (Path via Placeholder)

The include path can contain the placeholder `{ }`, so you can switch the file to load with a URL parameter, for example.

```html
<!-- If ?p=_parts/help.html, _parts/help.html is expanded -->
<div data-t-include="{?p}"></div>
```

- If the value is empty (e.g. the parameter is not specified) or loading is rejected by the restrictions below, nothing is expanded and the element's original content is left as is (the same applies when a circular include, the nesting limit, or the per-render include limit is hit).
- **Path restrictions**: The expanded path must stay inside the project. Paths containing `..`, paths containing the `_sys` directory, paths containing `:` (such as `C:` or `http:`), and paths starting with `\` are not loaded (same for SSR and CSR). Nothing is expanded if the specified file does not exist, either.
- **Security note**: If you use a URL parameter directly as the path, visitors can insert any HTML in the project (including parts in `_parts/`). If the possible targets are known, we recommend using `data-t-if` to output a fixed-path include for each candidate.

  ```html
  <div data-t-if="_sys.query.tab=help" data-t-include="_parts/help.html"></div>
  <div data-t-if="_sys.query.tab=faq" data-t-include="_parts/faq.html"></div>
  ```

### `data-t-source`

Fetch data to display in HTML and give it a name.

- **Usage**: Specify the data URL in the `href` attribute and check any name.
- **Data URL Specification**:
  - **Recommended Format**: `_sys/data/{DataName}.json` (Relative Path)
    - This format, omitting the leading `/`, is recommended as it works in local preview (`file://`).
  - **Keys Allowed Format**: `/_sys/data/{DataName}.json` (Absolute-like Path)
    - In CSR (browser), the leading `/` is automatically ignored and treated as a relative path.
- **Data Name Restrictions**: Only **alphanumeric characters, underscores `_`, and hyphens `-`** are allowed.
  - Paths containing `..` or `/` (Directory Traversal) are **prohibited** and will not be loaded.
- **Constraint**: Can only be specified in `<link>` tags.
- **Example**:

    ```html
    <!-- OK (Recommended): Relative Path -->
    <link data-t-source="articles" href="_sys/data/article.json">

    <!-- OK: With leading slash (treated as relative internally) -->
    <link data-t-source="users" href="/_sys/data/user.json?status=active">

    <!-- NG: Directory traversal is prohibited -->
    <link data-t-source="invalid" href="_sys/data/../../conf.json">
    ```

### Data Display (Universal Placeholder)

You can display data by writing `{datasource_name.item_name}` in the HTML text or attribute values.

- **Basic Example**:
    Specify the data source and its property (item name) to display.

    ```html
    <link data-t-source="article" href="/_sys/data/articles.json?id={?id}">
    <h1>{article.title}</h1>
    <p>{article.body}</p>
    ```

- **Displaying Nested Data**:
  You can access nested properties within an object using dot notation `.`. You can describe deep hierarchies in the same way.

  ```json
   {
    "user": {
      "name": "John Doe",
      "address": {
        "city": "New York"
      }
    }
  }
  ```

  ```html
  <p>User Name: {user.name}</p>
  <p>City: {user.address.city}</p>
  ```

- **Automatic data relations (lookup)**:
  When several data sources are loaded with `data-t-source`, you can follow a foreign key to related data using plain dot notation. For `article.category`, if the object has no `category` property but has `category_id` (or `categoryId`), Bracify automatically finds the record whose `id` matches in the data source named after the plural of `category` (`categories`). No extra attributes or syntax are needed.

  ```html
  <link data-t-source="articles" href="/_sys/data/articles.json">
  <link data-t-source="categories" href="/_sys/data/categories.json">

  <!-- articles: [{ "id": 1, "title": "Hello", "category_id": 2 }] -->
  <!-- categories: [{ "id": 2, "name": "Tech" }] -->
  <ul>
    <li data-t-list="articles">{articles.title} ({articles.category.name})</li>
  </ul>
  ```

  - The source name is tried as `X + s`, `X + es`, (for names ending in `y`) `ies`, and finally `X` itself; the first one that exists is used.
  - `id` values are compared as strings. If no record matches, it behaves like any other undefined value.
  - A real `category` property on the object always takes precedence.
  - Chains such as `article.category.parent.name` work too.
  - `article.category` itself resolves to the whole related record, so it can be used with `data-t-scope="article.category"` or `data-t-if="article.category"`.
  - Form auto-binding (prefilling inputs by `name`) does NOT follow relations; use the foreign key field instead (e.g. `name="category_id"`).
  - The first existing source name is used even if it has no matching record; later candidates are not tried.
  - It works in `{ }`, `data-t-if`, `data-t-list`, `data-t-scope` and attribute bindings (`href="/cat.html?id={article.category.id}"`), identically in SSR and CSR.

- **Numeric Calculations (Arithmetic)**:
  You can perform arithmetic operations (`+`, `-`, `*`, `/`, `%`) and use parentheses `()` inside placeholders `{ }` to calculate numeric values without writing JavaScript. Combine data values and numeric literals, and pass the result to subsequent pipes (`|`).

  ```html
  <!-- Variable addition (next pagination offset) -->
  <a href="?_offset={_sys.query._offset + 10}">Next</a>

  <!-- Multiplication combined with a pipe (tax / total display) -->
  <span>Total: {item.price * 1.1 | number} 円</span>

  <!-- Precedence with parentheses -->
  <span>Total: {(item.price + item.shipping) * item.qty}</span>
  ```

  - Variables in the expression (e.g. `item.price`) are automatically resolved from the data. Undefined, `null`, or non-numeric values are safely treated as `0`, so rendering is never interrupted by an error.
  - Division/modulo by `0` returns `0`.

- **Displaying List Indices**:
  For each element iterated by `data-t-list`, a zero-based index `_index` is automatically injected. Add `+ 1` to correct to a one-based index.

  ```html
  <ul>
    <li data-t-list="projects">No. {projects._index + 1}: {projects.title}</li>
  </ul>
  ```

- **Escaping Placeholders**:
  If you want to display the placeholder notation as is without evaluating it, place a backslash `\` before the opening curly brace.

  ```html
  <code>\{user.name\}</code> <!-- Result: {user.name} -->
  <code>C:\\temp</code> <!-- Result: C:\temp (write a literal backslash as \\) -->
  ```

- **When a value does not exist**:
  When the data itself exists (a `data-t-source`, a `data-t-scope`, or the current `data-t-list` item) but the field or related record is missing (e.g. `{book.author.name}` for a deleted author), the placeholder renders as an **empty string**, in both text and attributes (`class="s-{book.status}"` becomes `class="s-"`). Use `data-t-if` to control what is displayed. `{...}` is left as-is only when the data itself is not available (an unloaded or undefined source/scope).
  - `{?x}` / `{_sys.query.x}` with an absent URL parameter also render empty (`_sys` is always available). A `data-t-scope` on a missing related record (e.g. `data-t-scope="book.author"`) is a valid empty scope, so its inner placeholders render empty.
  - **Filter value limitation**: in a `data-t-source` `href`, a filter value that contains both `{` and `}` (e.g. searching for a book titled `{foo}` with `?title={foo}`) is treated as an unresolved placeholder and the filter is ignored (SSR and CSR).

## List Display (`data-t-list`)

If there are multiple data items you want to display, you must specify `data-t-list="Data Source Name"` on the element (range) you want to repeat.

```html
  <link data-t-source="articles" href="/_sys/data/articles.json">
  <ul>
    <li data-t-list="articles">
      <h3>{articles.title}</h3>
    </li>
  </ul>
```

### Embedding Data into Attributes (Universal Placeholder)

In all standard attributes (`href`, `src`, `class`, `value`, `style`, etc.), you can directly embed data by writing placeholders `{ }`.

- **Usage Example**:

    ```html
    <img src="{article.thumbnail}" alt="{article.title}">
    <a href="/post/{article.id}" class="btn {article.category}">View Details</a>
    <div style="background-color: {user.color}; height: {progress}%;"></div>
    ```

- **Limit**: To avoid interference with JavaScript syntax, **placeholders cannot be used inside event handler attributes (`onclick`, `onchange`, etc.).** See "[Avoiding Placeholder Interference](#avoiding-placeholder-interference-and-limitations)" below.

### Avoiding Placeholder Interference and Limitations

Bracify's placeholders `{ }` can be used in HTML attributes and text nodes. However, to prevent interference with JavaScript or CSS code (syntax using curly braces), **expansion is disabled** in the following locations:

- **Where expansion does NOT occur**:
  - Inside `<script>` tags.
  - Inside `<style>` tags.
  - Inside event handler attributes (all attributes starting with `on`, such as `onclick`, `onmouseover`, `onsubmit`).

#### Recommended Pattern: Using data in event handlers

If you want to use dynamic data within an event handler (JavaScript), we recommend the pattern of **embedding the data in a `data-` attribute and referencing it via `this.dataset`** instead of writing `{ }` directly.

```html
<!-- NOT recommended (will not work) -->
<button onclick="alert('ID: {article.id}')">Show</button>

<!-- RECOMMENDED pattern -->
<button data-id="{article.id}" onclick="alert('ID: ' + this.dataset.id)">Show</button>
```

By using this method, the Bracify template engine and standard browser JavaScript syntax can coexist safely.

### Automatic Binding of Form Elements

If a `name` attribute is specified for `input`, `select`, or `textarea` elements, `Bracify` automatically binds (displays) the value from the appropriate data source. Users do not need to manually specify `value` or placeholders.

- **Priority for Automatic Binding**:
    1. **Current data context**: Sets the value from the properties of data specified by `data-t-scope`, etc.
    2. **URL Parameters (`_sys.query`)**: If there is an item with the same name as `name` in the page URL's query parameters, that value is set. If a parameter is repeated (`?tag=a&tag=b`), the last value is used (in both SSR and CSR).

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
    <form data-t-scope="article" method="POST" action="/_sys/data/article.json?_method=PUT">
      <input type="hidden" name="id">
      <input type="text" name="title">
      <textarea name="content"></textarea>
    </form>
    ```

- **Automatic Selection for Select Boxes**:
    The `selected` attribute is automatically added to `<option>` elements whose `value` matches the value bound to the `<select>` tag. This also applies to options generated by `data-t-list`.

### `data-t-if`

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

    **Comparison and Logical Operations (Data API Style)**:
    You can specify more detailed conditions using the same syntax as Data API query parameters.

    - **Comparison Operators**: Uses the same notation as the [Data Access API Operators](data-api.md#operators) (`=`, `:ne=`, `:gt=`, etc.).
    - **Logical Operations (AND/OR)**: Space separation represents **AND**, and comma separation in values represents **OR**.
    - **Using Variables**: By enclosing in `{ }`, you can use data values in conditions. [Arithmetic](#data-display-universal-placeholder) is also available inside `{ }` (e.g. `matched._length:gt={_sys.query._offset + 10}`).
    - **Single Key**: If you write only a key without operators, it determines the presence (truthiness) of that value as before.

    ```html
    <!-- Status is published (status == 'published') -->
    <span data-t-if="status=published">Published</span>

    <!-- Price is 1000 or more AND stock is greater than 0 (price >= 1000 AND stock > 0) -->
    <div data-t-if="price:gte=1000 stock:gt=0">
      Popular Item (In Stock)
    </div>

    <!-- Role is admin OR editor (role == 'admin' OR role == 'editor') -->
    <button data-t-if="role=admin,editor">Edit</button>

    <!-- User ID matches the article's author ID (user.id == post.author_id) -->
    <div data-t-if="user.id={post.author_id}">
      <a href="/edit">Edit Article</a>
    </div>

    <!-- Show "Next" only when there is a next page. allArticles is a separate source loaded without _limit / _offset, used for counting (count > current offset + 10) -->
    <a data-t-if="allArticles._length:gt={_sys.query._offset + 10}" href="?_offset={_sys.query._offset + 10}">Next</a>
    ```

### `data-t-redirect`

Specifies the transition destination URL after a process (such as form submission) is successfully completed.

- **Specification**: Specify the relative or absolute path of the destination.
- **Target Tag**: `form` tag.
- **Operation**: After the server completes the process, it redirects with a 302 status to the specified path. If not specified, it reloads the current page.
- **Destination rules**: Relative paths are resolved against the page containing the form. Only same-origin destinations are allowed; anything else falls back to the form page, or `/`.

## Forms and Data Saving (Postback)

You can create and update data using standard `<form>` tags. Bracify works with browser-standard **postbacks (submissions involving page transitions)** without using asynchronous JavaScript (fetch).

- **Automatic Handling**: Specify the destination in the `action` attribute (e.g., `/_sys/data/xxxxx.json`) and send using `method="POST"` (to update, use `action="/_sys/data/xxxxx.json?_method=PUT"` plus `<input type="hidden" name="id">`; browser `<form>` elements cannot send `PUT`).
- **Redirect (PRG Pattern)**: Once saved on the server, it automatically redirects to the URL specified by `data-t-redirect` or the original page. This prevents "form resubmission" and allows for safe navigation.
- **Data Binding (Initial values)**: By specifying `data-t-scope` on the `<form>` tag, you can set existing data as default values for input fields.
- **Input Items**: The `name` attribute of `<input>` and `<textarea>` becomes the data item name (property).
- **Server-side validation**: the constraints written in the form (`required` / `maxlength` / `minlength` / `min` / `max` / `pattern` / `type="email"` / `type="date"` / `select` and `radio` options) are also enforced on the server (see "[Server-side validation](data-api.md#server-side-validation)" under the [form handler](data-api.md#data-saving-processing-form-handler)). On failure nothing is saved and the user is sent back to `data-t-redirect` (or the originating page) with `?error=message`; show it with `{_sys.query.error}`.
- **Server mode only**: Data is saved only on the server (SSR). Local Development Mode (`file://`) has no write mechanism, so `POST` / `PUT` / `DELETE` forms are not saved (support is under consideration in [#56](https://github.com/tri-comma/Bracify/issues/56)).
