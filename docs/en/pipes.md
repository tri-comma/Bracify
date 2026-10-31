# Processing Filters (Pipes) Reference

[← Documentation index](./README.md) | Language: [日本語](../ja/pipes.md) | **English**

## Processing Filters (Pipes)

You can use processing filters (formal name: pipes) `|` when displaying data.

### Basic Syntax

```html
<p>Updated: { article.updated_at | date: 'yyyy/mm/dd HH:MM' }</p>
<span>Price: { product.price | currency }</span>
<span>Status: { article.is_published | ternary: 'Published', 'Draft' }</span>
<span>Nickname: { user.nickname | default: 'Anonymous' }</span>
<span>Summary: { article.summary | truncate: 10 | uppercase }</span>
```

↓ **Result** (when `article.summary` is `"Bracify is simple"`)

```html
<p>Updated: 2025/12/10 14:05</p>
<span>Price: $1,500.00</span>
<span>Status: Draft</span>
<span>Nickname: Anonymous</span>
<span>Summary: BRACIFY...</span>
```

### Pipe Syntax

```text
{ data_name.item_name | filter_name }
{ data_name.item_name | filter_name: argument }
{ data_name.item_name | filter_name: 'argument1', 'argument2' }
{ data_name.item_name | filter_name1 | filter_name2: 'argument' }   ← chaining (applied left to right)
```

- Everything after the first `:` following a filter name is treated as its arguments. Multiple arguments are separated by `,`.
- Arguments can be wrapped in `'...'` or `"..."`. Inside quotes, `:` `,` and `|` are not treated as separators. Numeric arguments don't need quotes (e.g. `truncate: 20`).
- **Arguments cannot contain `}`** (it would be interpreted as the end of the placeholder).
- Multiple filters can be chained with `|`. The output of the previous filter becomes the input of the next one (applied left to right).
- Pipes can also be applied to the result of an arithmetic expression: `{ item.price * 1.1 | currency }`

### A Note on Timing

Pipes are applied only after the target data has finished loading. While the data is not yet loaded, the `{ ... }` placeholder remains as-is on the page and is replaced with the correct value once loading completes. To take advantage of this, place `data-t-source` as early as possible relative to where it's used (recommended: a `<link data-t-source>` in `<head>`).

## Standard Filters (Built-in Pipes)

### `date`

Outputs date data (date type) as text in the specified format.

- **Syntax**: `{ item_name | date: 'format' }`
- **Format Specifications**:
  - `yyyy`: 4-digit year
  - `mm`: 2-digit month
  - `dd`: 2-digit day
  - `HH`: 2-digit hour (24-hour)
  - `MM`: 2-digit minute
  - `SS`: 2-digit second
- **Note**: `mm` (lowercase, month) and `MM` (uppercase, minute) are case-sensitive and distinct.
- Example: `{ article.updated_at | date: 'yyyy/mm/dd HH:MM' }` → `2025/12/10 14:05`

### `number`

Outputs numbers in "3-digit comma separated" format.

- **Syntax**: `{ item_name | number }`

### `currency`

Outputs numbers formatted as currency.

- **Syntax**: `{ item_name | currency }` / `{ item_name | currency: 'currency_code' }`
- The currency code follows ISO 4217 (e.g. `USD`, `EUR`). If omitted, `JPY` is used.
- Example: `{ product.price | currency }` → `¥1,500`
- Example: `{ product.price | currency: 'USD' }` → `$1,500.00`

### `uppercase` / `lowercase`

Converts a string to uppercase or lowercase.

- **Syntax**: `{ item_name | uppercase }` / `{ item_name | lowercase }`
- Example: `{ user.code | uppercase }` → `ABC-001`

### `truncate`

Truncates a string to the specified length, appending `...` if it was shortened.

- **Syntax**: `{ item_name | truncate: length }`
- The truncated string, including `...`, fits within the specified length (e.g. with `truncate: 10`, `Bracify is simple` → `Bracify...` (10 characters)).
- If the specified length is 3 or less, `...` is not appended — only the first `length` characters are output.
- If the value is already within the specified length, it is output unchanged.

### `default`

Specifies a fallback value to display when the value is empty (`undefined`, `null`, or an empty string).

- **Syntax**: `{ item_name | default: 'fallback' }`
- `0` and `false` are not considered "empty" and are output as-is.
- Example: `{ user.nickname | default: 'Anonymous' }`

### `ternary`

Switches the displayed string based on a boolean condition.

- **Syntax**: `{ item_name | ternary: 'value_if_true', 'value_if_false' }`
- Truthiness is evaluated using the same rules as [`data-t-if`](attributes.md#data-t-if) (`false`, `0`, `""`, `null`, `undefined`, empty arrays, and empty objects are falsy). Note that the strings `"false"` and `"0"` are truthy.
- If the false-case argument is omitted, an empty string is output.
- Example: `{ article.is_published | ternary: 'Published', 'Draft' }`

### `json`

Outputs data as a formatted JSON string. Useful for debugging or using data directly in JavaScript.

- **Syntax**: `{ item_name | json }`
