# カスタム属性リファレンス

[← ドキュメント一覧](./README.md) | 言語: **日本語** | [English](../en/attributes.md)

## カスタム属性

### `data-t-include`

外部のHTMLファイルを読み込み、要素の内容として展開します。この属性には、**スニペット挿入** と **レイアウト適用** の2つの動作モードがあります。

いずれのモードでも、**`data-t-include` を記述したタグ自体は削除されず、その子要素（innerHTML）が展開結果によって置換されます。**

---

#### モード1：スニペット挿入 (Snippet Include)

ヘッダーやフッターなど、共通の部品を現在の場所に差し込みます。

- **動作**: 指定したファイルの内容を、タグの内部にそのまま展開します。
- **例**:

  ```html
  <header data-t-include="_parts/header.html"></header>
  ```

  ↓ `_parts/header.html` の中身が展開されます。

---

#### モード2：レイアウト適用 (Layout & content)

共通の「枠組み（レイアウト）」を読み込み、その中の特定の領域を自分自身のコンテンツで埋めます。

- **動作**:
  1. `data-t-include` で指定したテンプレートファイルを読み込みます。
  2. テンプレート内の `data-t-content` 要素と、自分自身の中にある `data-t-content` 要素をマッチングさせます。
  3. テンプレート側の指定された場所に、ページ側のコンテンツを流し込みます。
- **マッチングルール**: `data-t-content` 属性の値（名前）が一致する要素同士が置換対象になります。名前がない場合はデフォルトのスロットとして扱われます。

- **例**:
  **テンプレート (`_parts/layout.html`)**:

  ```html
  <div class="container">
      <h1 data-t-content="page-title">デフォルトタイトル</h1>
      <main data-t-content="main-body"></main>
  </div>
  ```

  **利用ページ (`index.html`)**:

  ```html
  <body data-t-include="_parts/layout.html">
      <span data-t-content="page-title">マイプロフィール</span>
      <div data-t-content="main-body">
          <p>ここにプロフィール本文が入ります。</p>
      </div>
  </body>
  ```

  ↓ **実行結果**:

  ```html
  <body>
      <div class="container">
          <h1 data-t-content="page-title">マイプロフィール</h1>
          <main data-t-content="main-body">
              <div data-t-content="main-body">
                  <p>ここにプロフィール本文が入ります。</p>
              </div>
          </main>
      </div>
  </body>
  ```

- **注意点**: 開発サーバー使用時はサーバー側で、ブラウザでの直接閲覧（`file://`）時は File System Access API によって結合されます。

---

#### 動的なインクルード（プレースホルダーによるパス指定）

インクルードするパスにはプレースホルダー `{ }` を使用でき、URL パラメータなどで読み込むファイルを切り替えられます。

```html
<!-- ?p=_parts/help.html の場合、_parts/help.html を展開 -->
<div data-t-include="{?p}"></div>
```

- 値が空（パラメータ未指定など）の場合や、下記の制限で読み込みが拒否された場合（循環参照・ネストの上限・1 回の描画あたりの上限を超えた場合も同様）は何も展開されず、要素の元の内容がそのまま残ります。
- **パスの制限**: 展開後のパスはプロジェクト内に限られます。`..` を含むもの、`_sys` ディレクトリを含むもの、`:` を含むもの（`C:`・`http:` 等）、`\` で始まるものは読み込まれません（SSR・CSR 共通）。存在しないファイルを指定した場合も展開されません。
- **セキュリティ上の注意**: URL パラメータをそのままパスにすると、閲覧者はプロジェクト内の任意の HTML（`_parts/` 内の部品を含む）を差し込めます。切り替え先が決まっている場合は、`data-t-if` で候補ごとに固定パスの include を出し分ける方法を推奨します。

  ```html
  <div data-t-if="_sys.query.tab=help" data-t-include="_parts/help.html"></div>
  <div data-t-if="_sys.query.tab=faq" data-t-include="_parts/faq.html"></div>
  ```

### `data-t-source`

HTMLに出力するデータを取得し、そのデータに名前をつけます。

- **指定方法**: `href` 属性にデータ取得URLを指定し、任意の名前をつけます。
- **データ取得URLの仕様**:
  - **推奨フォーマット**: `_sys/data/{データ定義名}.json` （相対パス）
    - ローカルプレビュー（`file://`）でも動作するため、先頭の `/` を省略するこの形式を推奨します。
  - **許可されるフォーマット**: `/_sys/data/{データ定義名}.json` （絶対パス風）
    - CSR（ブラウザ）では自動的に先頭の `/` が無視され、相対パスとして扱われます。
- **データ定義名の制約**: 使用できる文字は **英数字、アンダースコア `_`、ハイフン `-` のみ** です。
  - `..` や `/` を含むパス指定（ディレクトリトラバーサル）は**禁止**されており、読み込まれません。
- **制約**: `<link>` タグでのみ指定可能です。
- **例**:

    ```html
    <!-- OK (推奨): 相対パス -->
    <link data-t-source="articles" href="_sys/data/article.json">

    <!-- OK: 先頭スラッシュあり（内部で相対パスとして扱われます） -->
    <link data-t-source="users" href="/_sys/data/user.json?status=active">

    <!-- NG: 親ディレクトリ参照などは禁止されています -->
    <link data-t-source="invalid" href="_sys/data/../../conf.json">
    ```

### データの表示（ユニバーサル・プレースホルダー）

HTMLのテキスト中や属性値に `{データソース名.項目名}` と記述することで、データを表示できます。

- **基本例**:
  データソースとそのプロパティ（項目名）を指定して表示します。

  ```html
  <link data-t-source="article" href="/_sys/data/articles.json?id={?id}">
  <h1>{article.title}</h1>
  <p>{article.body}</p>
  ```

- **ネストされたデータの表示**:
  ドット記法 `.` を使用することで、オブジェクト内のネストされたプロパティにアクセスできます。データの階層が深くても、同様に記述可能です。

  ```json
   {
    "user": {
      "name": "山田太郎",
      "address": {
        "city": "渋谷区"
      }
    }
  }
  ```

  ```html
  <p>ユーザー名: {user.name}</p>
  <p>都市名: {user.address.city}</p>
  ```

- **データの自動リレーション（関連データの参照）**:
  `data-t-source` で複数のデータを読み込んでいる場合、外部キーを持つデータから関連データへドット記法のまま辿れます。`article.category` のように、オブジェクトに `category` というプロパティがなく `category_id`（または `categoryId`）がある場合、Bracify は `categories`（`category` の複数形）という名前のデータソースから `id` が一致するレコードを自動的に探して解決します。追加の属性や記述は不要です。

  ```html
  <link data-t-source="articles" href="/_sys/data/articles.json">
  <link data-t-source="categories" href="/_sys/data/categories.json">

  <!-- articles: [{ "id": 1, "title": "Hello", "category_id": 2 }] -->
  <!-- categories: [{ "id": 2, "name": "Tech" }] -->
  <ul>
    <li data-t-list="articles">{articles.title} ({articles.category.name})</li>
  </ul>
  ```

  - データソース名は `X + s` → `X + es` → （`y` で終わる場合）`ies` → `X` そのまま、の順に探し、最初に存在したものを使用します。
  - `id` は文字列として比較します。該当レコードがない場合は他の未定義値と同様に扱われます。
  - オブジェクトに実際の `category` プロパティがある場合は、そちらが常に優先されます。
  - `article.category.parent.name` のように連鎖して辿ることも可能です。
  - `article.category` 自体も関連レコード全体に解決されるため、`data-t-scope="article.category"` や `data-t-if="article.category"` にも使えます。
  - フォームの自動バインディング（`name` 属性による値の自動入力）は関連を辿りません。外部キーのフィールド（例: `name="category_id"`）を使用してください。
  - 名前が一致する最初のデータソースが使用され、そこに該当レコードがなくても次の候補は探しません。
  - `{ }`、`data-t-if`、`data-t-list`、`data-t-scope`、属性バインディング（`href="/cat.html?id={article.category.id}"`）のいずれでも利用でき、SSR・CSR で同じ動作をします。

- **数値の計算（四則演算）**:
  プレースホルダー `{ }` 内で四則演算（`+`, `-`, `*`, `/`, `%`）と括弧 `()` を使用し、JavaScript を書かずに数値の算出ができます。データ値・数値リテラルを組み合わせて計算でき、結果を後続のパイプ（`|`）にも渡せます。

  ```html
  <!-- 変数の加算（ページネーションの次オフセット） -->
  <a href="?_offset={_sys.query._offset + 10}">Next</a>

  <!-- 乗算とパイプの併用（消費税・合計表示） -->
  <span>Total: {item.price * 1.1 | number} 円</span>

  <!-- 括弧による優先順位 -->
  <span>合計: {(item.price + item.shipping) * item.qty}</span>
  ```

  - 式に含まれる変数（`item.price` 等）は自動的にデータから解決され、未定義・`null`・数値以外の値は安全に `0` として扱われます（エラーでレンダリングが中断することはありません）。
  - `0` での除算・剰余は `0` を返します。

- **リストのインデックス表示**:
  `data-t-list` で反復する各要素には、0 始まりのインデックス `_index` が自動的に注入されます。1 始まりに補正する場合は `+ 1` を加えます。

  ```html
  <ul>
    <li data-t-list="projects">No. {projects._index + 1}: {projects.title}</li>
  </ul>
  ```

- **プレースホルダーのエスケープ**:
  プレースホルダー記法を評価させず、そのまま表示したい場合は、開始中括弧の前にバックスラッシュ `\` を置きます。

  ```html
  <code>\{user.name\}</code> <!-- 表示結果: {user.name} -->
  <code>C:\\temp</code> <!-- 表示結果: C:\temp（バックスラッシュ自体は \\ で表記） -->
  ```

- **値が存在しない場合の表示**:
  データ（`data-t-source` のデータ、`data-t-scope`、`data-t-list` の各項目）自体は存在するが、その項目や関連レコードが無い場合（例: 削除された著者の `{book.author.name}`）、プレースホルダーは**空文字**として出力されます（テキスト・属性とも。`class="s-{book.status}"` は `class="s-"` になります）。表示の出し分けには `data-t-if` を使用してください。`{...}` がそのまま残るのは、データそのものが利用できない（未読み込み・未定義のソース/スコープ）場合のみです。
  - `{?x}` / `{_sys.query.x}` で URL パラメータが無い場合も空文字になります（`_sys` は常に利用可能）。関連レコードが無い `data-t-scope`（例: `data-t-scope="book.author"`）も有効な空のスコープとなり、内部のプレースホルダーは空文字になります。
  - **フィルタ値の制限**: `data-t-source` の `href` 内で、フィルタ値に `{` と `}` の両方を含むもの（例: タイトルが `{foo}` の本を `?title={foo}` で検索）は「未解決のプレースホルダー」と見なされ、そのフィルタは無視されます（SSR/CSR 共通）。

## リスト表示 (`data-t-list`)

　表示したいデータが複数件存在する場合は、繰り返いたい範囲（要素）に対して `data-t-list="データソース名"` を指定する必要があります。

```html
  <link data-t-source="articles" href="/_sys/data/articles.json">
  <ul>
    <li data-t-list="articles">
      <h3>{articles.title}</h3>
    </li>
  </ul>
```

### 属性へのデータの埋め込み（ユニバーサル・プレースホルダー）

全ての標準属性（`href`, `src`, `class`, `value`, `style` など）において、プレースホルダー `{ }` を直接記述してデータを埋め込むことができます。

- **利用例**:

  ```html
  <img src="{article.thumbnail}" alt="{article.title}">
  <a href="/post/{article.id}" class="btn {article.category}">詳細を見る</a>
  <div style="background-color: {user.color}; height: {progress}%;"></div>
  ```

- **制限**: JavaScriptの構文との干渉を避けるため、**イベントハンドラ属性（`onclick`, `onchange` 等）の中ではプレースホルダーを利用できません。** 後述の「[プレースホルダーの干渉回避](#プレースホルダーの干渉回避と制限)」を参照してください。

### プレースホルダーの干渉回避と制限

Bracify のプレースホルダー `{ }` は、HTML 属性やテキストノードで利用可能ですが、JavaScript や CSS のコード（波括弧を使用する構文）との干渉を防ぐため、以下の箇所では**展開が無効化**されています。

- **展開されない箇所**:
  - `<script>` タグの内部
  - `<style>` タグの内部
  - イベントハンドラ属性 (`onclick`, `onmouseover`, `onsubmit` 等、`on` で始まる全ての属性)

#### 推奨パターン：イベントハンドラ内でデータを利用する

イベントハンドラ（JavaScript）内で動的なデータを利用したい場合は、直接 `{ }` を書くのではなく、**`data-` 属性にデータを埋め込み、それを `this.dataset` 経由で参照**するパターンを推奨します。

```html
<!-- 非推奨（動作しません） -->
<button onclick="alert('ID: {article.id}')">表示</button>

<!-- 推奨パターン -->
<button data-id="{article.id}" onclick="alert('ID: ' + this.dataset.id)">表示</button>
```

この方法をとることで、Bracify のテンプレートエンジンとブラウザ標準の JavaScript 構文を安全に共存させることができます。

### フォーム要素の自動バインド

`input`, `select`, `textarea` 要素に `name` 属性が指定されている場合、`Bracify` は適切なデータソースから値を自動的にバインド（表示）します。ユーザーが手動で `value` やプレースホルダーを指定する必要はありません。

- **自動バインドの優先順位**:
  1. **現在のデータコンテキスト**: `data-t-scope` などで指定されたデータのプロパティから値を設定します。
  2. **URLパラメータ (`_sys.query`)**: ページURLのクエリパラメータに `name` と同じ名前の項目がある場合、その値を設定します。同じパラメータが繰り返された場合（`?tag=a&tag=b`）は最後の値が使われます（SSR・CSR共通）。

- **`data-t-scope` によるデータ指定**:
  コンテナ要素（`div`, `form` など）に `data-t-scope="article"` のように記述することで、その要素内での「デフォルトのデータソース」を指定できます。これにより、内部の `name="title"` は自動的に `article.title` を参照するようになります。

- **例（検索フォーム）**:

  ```html
  <!-- URLが ?title=Web の場合、自動で value="Web" がセットされます -->
  <input type="text" name="title" placeholder="記事を検索...">
  ```

- **例（編集フォーム）**:

  ```html
  <!-- article データの title, content が自動で各フィールドにセットされます -->
  <form data-t-scope="article" method="POST" action="/_sys/data/article.json?_method=PUT">
    <input type="hidden" name="id">
    <input type="text" name="title">
    <textarea name="content"></textarea>
  </form>
  ```

- **セレクトボックスの自動選択**:
  `<select>` タグにバインドされた値と一致する `value` を持つ `<option>` 要素には、自動的に `selected` 属性が付与されます。`data-t-list` で生成された `<option>` も対象です。

### `data-t-if`

条件に応じて要素を表示または非表示にします。データの値が存在する（`true`, 非null, 非0, 非空文字）場合に要素を表示します。

- **指定方法**: 判定したいデータ項目名を指定
- **例**:

  ```html
  <!-- user.is_login が true の場合のみ表示 -->
  <div data-t-if="user.is_login">
    ようこそ、<span>{user.name}</span>さん
  </div>
  ```

  ↓ **実行結果（`user.is_login` が true の場合）**

  ```html
  <div>
    ようこそ、<span>山田太郎</span>さん
  </div>
  ```

  ↓ **実行結果（`user.is_login` が false の場合）**

  ```html
  <!-- 要素自体が出力されません -->
  ```

  **補足（否定条件 / Else）**:
  先頭に `!` を付けることで、「値が存在しない（false）」場合の条件を指定できます。`else` の代わりとして利用してください。

  ```html
  <!-- user.is_login が false の場合のみ表示 -->
  <div data-t-if="!user.is_login">
    <a href="/login.html">ログインしてください</a>
  </div>
  ```

  **比較演算と論理演算（Data APIスタイル）**:
  Data APIのクエリパラメータと同じ構文を使って、より詳細な条件を指定できます。

  - **比較演算子**: [データアクセスAPIの演算子](data-api.md#演算子)と同じ記法（`=`, `:ne=`, `:gt=` など）が使えます。
  - **論理演算（AND/OR）**: スペースで区切ると **AND**、値にカンマを使うと **OR** になります。
  - **変数の使用**: `{ }` で囲むことで、データの値を条件に使えます。`{ }` の中では[四則演算](#データの表示ユニバーサルプレースホルダー)も使えます（例: `articles._total:gt={_sys.query._offset + 10}`）。
  - **単独キー**: 演算子を使わずキーのみを書いた場合は、従来通りその値の有無（真偽）を判定します。

  ```html
  <!-- ステータスが公開中 (status == 'published') -->
  <span data-t-if="status=published">公開中</span>

  <!-- 価格が1000以上 かつ 在庫がある (price >= 1000 AND stock > 0) -->
  <div data-t-if="price:gte=1000 stock:gt=0">
    人気商品（在庫あり）
  </div>

  <!-- 役割が admin または editor (role == 'admin' OR role == 'editor') -->
  <button data-t-if="role=admin,editor">編集</button>

  <!-- ユーザーIDが記事の作者と一致する場合 (user.id == post.author_id) -->
  <div data-t-if="user.id={post.author_id}">
    <a href="/edit">記事を編集</a>
  </div>

  <!-- 次のページがある場合だけ「次へ」を表示。articles は _limit=10 付きのソースで、_total は _limit / _offset を適用する前の件数 (件数 > 現在のオフセット + 10) -->
  <a data-t-if="articles._total:gt={_sys.query._offset + 10}" href="?_offset={_sys.query._offset + 10}">次へ</a>
  ```

### `data-t-redirect`

フォーム送信などの処理が正常に完了した後の、画面遷移先URLを指定します。

- **指定方法**: 遷移先の相対パスまたは絶対パスを指定
- **対象タグ**: `form` タグ
- **動作**: サーバー側で処理が完了した後、指定されたパスへ 302 リダイレクトされます。指定がない場合は現在のページ（送信元）をリロードします。
- **遷移先の制限**: 相対パスはフォームを含むページを基準に解決されます。同一オリジンの遷移先のみ許可され、それ以外（外部URLなど）は送信元ページ、なければ `/` にフォールバックします。

## フォームとデータ保存（ポストバック）

標準の `<form>` タグを使用して、データの作成・更新が可能です。Bracify は JavaScript による非同期送信（fetch）を使用せず、ブラウザ標準の**ポストバック（ページ遷移を伴う送信）**で動作します。

- **自動処理**: `action` 属性に保存先（`/_sys/data/xxxxx.json` 等）を指定し、`method="POST"` で送信します（更新は `action="/_sys/data/xxxxx.json?_method=PUT"` と `<input type="hidden" name="id">` の組み合わせ。ブラウザの `<form>` は `PUT` を送れません）。
- **リダイレクト (PRGパターン)**: サーバー側で保存が完了すると、自動的に `data-t-redirect` で指定したURL、または元のページへリダイレクトされます。これにより「フォームの再送」が防止され、安全な画面遷移が可能です。
- **データバインド（初期値）**: `<form>` タグに `data-t-scope` を指定することで、既存データを入力欄の初期値としてセットできます（更新画面などで有用）。
- **入力項目**: `<input>` や `<textarea>` の `name` 属性が、データの項目名（プロパティ）になります。
- **サーバー側バリデーション**: フォームに書いた制約（`required` / `maxlength` / `minlength` / `min` / `max` / `pattern` / `type="email"` / `type="date"` / `select`・`radio` の選択肢）はサーバーでも検証されます（詳細は「[データ保存処理](data-api.md#データ保存処理-form-handler)」の「[サーバー側バリデーション](data-api.md#サーバー側バリデーション)」）。失敗時は保存されず、`data-t-redirect`（なければ送信元）へ `?error=メッセージ` を付けて戻ります。ページ側は `{_sys.query.error}` で表示できます。
- **サーバーモード専用**: データの保存はサーバー（SSR）でのみ行われます。ローカル開発モード（`file://`）には書き込みの仕組みがなく、`POST` / `PUT` / `DELETE` のフォームは保存されません（[#56](https://github.com/tri-comma/Bracify/issues/56) で対応を検討中）。
