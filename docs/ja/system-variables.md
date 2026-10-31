# システム予約変数とシステムプロパティ

[← ドキュメント一覧](./README.md) | 言語: **日本語** | [English](../en/system-variables.md)

## システム予約変数 (`_sys`)

アプリケーション全体のコンテキストや、ブラウザのリクエスト情報を取得するために `_sys` という予約変数が用意されています。

| 変数名 | 説明 | 記述例 |
| :--- | :--- | :--- |
| `_sys.query` | GETクエリパラメータ。URLの `?id=123` などの値を取得します。 | `{_sys.query.id}` |

### 短縮記法 `{?xxx}`

`{?xxx}` は `{_sys.query.xxx}` の短縮形で、`data-t-source` の `href` に限らず、本文テキスト・属性値・`data-t-if`・`data-t-include` など、プレースホルダーが使えるすべての場所で利用できます。パイプや四則演算も同様に使えます。

```html
<!-- URLが ?q=bracify の場合 -->
<p>「{?q}」の検索結果</p>                 <!-- 「bracify」の検索結果 -->
<p>{?q | uppercase}</p>                    <!-- BRACIFY -->
<a href="books.html?q={?q | default: ''}&_sort=title">タイトル順</a>
```

- パラメータが無い場合は空文字になります。
- **URL エンコードについて**: `data-t-source` の `href` のクエリ部分に埋め込んだ値は自動的に URL エンコードされますが、通常の属性（`<a href>` など）では HTML エスケープのみで URL エンコードはされません。`&` や `=` を含みうる値をリンクのクエリに入れると、別のパラメータとして解釈される場合があります。
- 値を指定しない `{?}`（自動バインド）は `data-t-source` の `href` 内でのみ使用できます（[下記参照](#data-t-source-での利用動的パラメータバインド)）。

### `data-t-source` での利用（動的パラメータ・バインド）

`data-t-source` の `href` 属性内では、プレースホルダー `{ }` を利用してクエリパラメータを動的に埋め込むことができます。さらに、URLパラメータ専用の短縮記法 `{?}` が利用可能です。

| 記法 | 意味 | 記述例 |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | 指定した項目を埋め込む（標準形式） | `?id={_sys.query.id}` |
| `{?}` | **自動バインド**。左側のキー名と同じ名前の値をURLから取得 | `?title={?}` |
| `{?xxx}` | **短縮形式**。`_sys.query.xxx` と同等 | `?title={?q}` |

### データソースでの記述例

```html
<!-- URLが ?title=Web&_limit=10 の場合 -->

<!-- 1. 自動バインド記法：キー名がURLパラメータ名と一致する場合に最適 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">

<!-- 2. 短縮記法：URLパラメータ名（例: q）とAPIのキー名（例: title）が異なる場合 -->
<link data-t-source="search" href="/_sys/data/articles.json?title={?q}">

<!-- 3. 標準形式：より明示的に記述する場合 -->
<link data-t-source="items" href="/_sys/data/items.json?category={_sys.query.cat}">
```

## データの詳細情報（システムプロパティ）

データそのものに含まれる値（タイトルやIDなど）以外に、データの「件数」や「状態」を知りたい場合があります。
`Bracify` では、データ名の後ろにアンダースコア `_` で始まる名前をつけることで、これらの特別な情報を取得できます。

| プロパティ名 | 説明 | 記述例 |
| :--- | :--- | :--- |
| `_length` | リスト（配列）に含まれるデータの件数、または文字の長さを表示します。 | `{articles._length}件の記事` |
| `_total` | `_limit` / `_offset` を適用する前の、条件に一致した全件数です。ページネーションの総件数や「次へ」の判定に使います（`_limit` が無ければ `_length` と同じ）。レコードの項目ではなく `_length` と同じメタプロパティで、`_limit=1` の単一オブジェクト展開でも使えます。 | `{articles._length} / {articles._total}件` |

### 制御パラメータ (ソート・ページネーション)

データの取得件数制御や並び替えには、アンダースコア `_` で始まる予約パラメータを使用します。これにより、通常のデータ項目（例: `limit` という名前のカラム）との衝突を防ぎます。

| パラメータ | 説明 | 記述例 |
| :--- | :--- | :--- |
| `_limit` | 取得する最大件数 | `?_limit=20` |
| `_offset` | 読み飛ばす件数（ページネーション用） | `?_offset=20` (21件目から取得) |
| `_sort` | ソート対象のキー項目名 | `?_sort=created_at` |
| `_order` | 並び順 (`asc`: 昇順, `desc`: 降順) | `?_order=desc` (省略時は `asc`) |
| `_fields` | 取得する項目をカンマ区切りで絞ります。`id` は常に含まれ、存在しない項目名は無視されます。リレーション（`{book.author.name}`）に使う `author_id` のようなキーも、書いたとおりにしか残らないため明示してください。ページに埋め込まれる項目（`window.__BRACIFY_DATA__`）も絞られるので、表示しない項目をレスポンスに含めたくない場合にも使えます。 | `?_fields=id,title,price` |

`_limit` の上限は、環境変数 `BRACIFY_MAX_LIMIT` で設定できます（SSR で、リクエストごとに参照されます）。既定では 1000 に設定されています。それを超える `_limit`（`?_limit={?_limit}` のようにユーザー入力を渡している場合など）は上限値に切り詰められます。`BRACIFY_MAX_LIMIT=1` なら、それより大きい `_limit` は 1 になり、単一オブジェクトとして展開されます。数値でない・負の `_limit`（`-1` や `abc`）も上限値になります。正の整数を設定すると上限を変更でき、`0` を設定すると上限を無効にできます。`_limit` を指定しない取得には適用されません。

> **破壊的変更**: 上限が既定で有効になったため、1000 を超える `_limit` を指定しているページは 1000 件に切り詰められます。必要な場合は `BRACIFY_MAX_LIMIT` で引き上げてください。

### 制御パラメータの使用例

```html
<!-- URLパラメータを利用した検索/ソートの例 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={_sys.query.title}&_sort={_sys.query._sort}&_order={_sys.query._order}&_limit={_sys.query._limit}">

<!-- カテゴリ固定、ページのみパラメータで指定 -->
<link data-t-source="techArticles" href="/_sys/data/articles.json?category=Tech&_limit=10&_offset={_sys.query._offset}">

<!-- 総件数と「次へ」の判定は _total で行う（件数のために全件を読み込む別ソースは不要） -->
<p>{techArticles._length} / {techArticles._total}件</p>
<a data-t-if="techArticles._total:gt={_sys.query._offset + 10}" href="?_offset={_sys.query._offset + 10}">次へ</a>
```

### ローカルディレクトリ構成例

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

**JSONファイル例** (`_sys/data/article.json`):

```json
[
  {
    "id": 1,
    "title": "記事タイトル1",
    "summary": "記事の概要...",
    "published_at": "2025-12-01T10:00:00Z"
  },
  {
    "id": 2,
    "title": "記事タイトル2",
    "summary": "記事の概要...",
    "published_at": "2025-12-05T15:30:00Z"
  }
]
```
