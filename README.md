[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Bracify Logo" width="200">
</p>

# Bracify 🚀

> **The HTML-only web framework. No CLI, Just Markup.**

Bracifyは、HTMLのマークアップだけでWebアプリケーションを構築できるフレームワークです。
プログラミングや複雑な環境構築の壁をゼロにすることを目指した「HTML-first」な開発体験を提供します。

## Bracifyとは

Bracifyは「マークアップだけでアプリが作れる」というシンプルさを追求しています。

- **React/Vueに疲れたエンジニアへ**: 複雑なビルド設定や重厚なフレームワークの学習から解放されます。
- **マークアップエンジニアへ**: プログラミング不要、あなたのHTMLスキルだけでデータ連携からデプロイまで、フル機能のWebアプリが作れます。

## Demo

![Demo Animation](./demo.gif)

## Key Concepts

- **HTML Markup Only**: プログラムを書かず、HTMLをマークアップするだけでアプリを作成。
- **No CLI Required**: 黒い画面（ターミナル）は不要です。専用のGUIランチャーがすべてを解決します。
- **Hybrid Rendering**: `file://` (CSR) で開発し、本番はそのままサーバー `https://` (SSR) として公開可能。
- **Zero Configuration**: 複雑な `npm install` 等は一切不要。
- **Portable**: プロジェクトはただのHTML。どこへでも持ち運べ、すぐに動かせます。

## Quick Start

まずは簡単なページの作成から始めてみましょう。たったの4ステップで完了します。

### 1. 準備

`Bracify` GUIアプリを起動し、新しい作業フォルダを選択します。

### 2. HTMLの作成

`index.html` というファイルを作成し、以下の内容を記述します。

```html
<!DOCTYPE html>
<html>
<head>
  <!-- データソースの指定 -->
  <link data-t-source="info" href="/_sys/data/info.json">
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

### 3. データの作成

`/_sys/data/info.json` というファイルを作成し、以下の内容を記述します。

```json
{
  "msg": "Hello Bracify!"
}
```

### 4. 実行

GUIアプリで `Start Server` ボタンを押すと、作業フォルダに `_dist` フォルダが生成されます。`_dist` フォルダ内の `index.html` をブラウザで開くと、 `Hello Bracify!` と表示されます。`localhost:3000` を開いても同じ表示がされます。
JavaScriptを書かずに、HTMLだけでデータが表示される体験を楽しんでください。

---

## Development Tools (Bracify Studio)

`Bracify` は、開発者体験を最大化するために専用のGUIツール（コードネーム: **Bracify Studio**）を提供します。
このツールは Electron 製の「ランチャー」と、`Bracify` 自身で構築された「管理ダッシュボード（Webアプリ）」のハイブリッド構成で動作します。

### 1. Bracify Launcher (Desktop)

Admin Dashboard を起動するための薄いラッパーアプリケーションです。

- **System Server**: アプリ起動時にシステム管理用APIサーバーを立ち上げます。
- **Launch**: 自動的にブラウザ（またはElectronウィンドウ）で Admin Dashboard を開きます。

### 2. Admin Dashboard (Web)

すべての操作を集約した統合管理画面です。

- **Project Control**:
  - **Open Project**: システムAPI経由でフォルダ選択ダイアログを開き、プロジェクトをロードします。
  - **Start/Stop Server**: ポート番号を指定して、対象プロジェクトのプレビューサーバーを起動します。
- **Data Manager**:
  - JSON編集、スキーマ推定。
- **API Monitor**:
  - 通信ログの確認。
- **Static Build**:
  - 静的書き出しの実行。

---

## プロジェクト構成 (File System Structure)

`Bracify` プロジェクトは、ソース編集用のフォルダ（ルート）と、出力用のフォルダ（`_dist`）で構成されます。

### 推奨ディレクトリ構成

```text
project/
├── index.html          # エントリーポイント (編集対象)
├── style.css           # 静的リソース
├── img/                # 画像などのアセット
│   └── logo.png
├── _parts/             # インクルード用部品 (ビルド結果には含まれない)
│   ├── header.html
│   └── footer.html
├── _sys/               # システムデータ・設定 (ビルド結果には含まれない)
│   └── data/
│       └── articles.json
└── _dist/              # [自動生成] ビルド出力先 (ここに完成品が入る)
    ├── index.html
    ├── style.css
    └── img/
        └── logo.png
```

### ビルド仕様

GUIやコマンドラインで「ビルド」を実行すると、以下のルールで `_dist` フォルダに出力されます。

1. **HTMLファイルの処理**:
    - ルートディレクトリにある `.html` ファイルは、`data-t-include` を解決（部品を結合）した状態で `_dist` に出力されます。
2. **静的リソースのコピー**:
    - 画像、CSS、JSファイルなどは、そのまま `_dist` にコピーされます。
3. **除外ルール**:
    - アンダースコア `_` で始まるファイルやディレクトリ（`_parts`, `_sys` など）は、ビルド専用またはシステム管理用とみなされ、**`_dist` にはコピーされません**。
4. **システムデータ (`_sys/data`) の変換**:
    - `_sys/data` フォルダ内の `.json` ファイルは、CSR用に自動的に `.js` (Mock形式) に変換され、`_dist/_sys/data` に出力されます。
    - **注意**: ソースフォルダ内に同名の `.js` ファイルがあっても**無視されます**。データの正本は `.json` とし、競合を防ぎます。
    - `data-t-include` を使用していない場合でも、CSRでデータを表示するためにはこの変換処理（ビルド）が必要です。

---

## リファレンス

### カスタム属性

#### `data-t-include`

外部のHTMLファイルを読み込み、要素の内容として展開します。この属性には、**スニペット挿入** と **レイアウト適用** の2つの動作モードがあります。

いずれのモードでも、**`data-t-include` を記述したタグ自体は削除されず、その子要素（innerHTML）が展開結果によって置換されます。**

---

##### モード1：スニペット挿入 (Snippet Include)

ヘッダーやフッターなど、共通の部品を現在の場所に差し込みます。

- **動作**: 指定したファイルの内容を、タグの内部にそのまま展開します。
- **例**:

  ```html
  <header data-t-include="_parts/header.html"></header>
  ```

  ↓ `_parts/header.html` の中身が展開されます。

---

##### モード2：レイアウト適用 (Layout & content)

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

- **注意点**: 開発サーバーまたはビルド処理時にサーバー側で結合されます。ブラウザでの直接閲覧（`file://`）では動作しません。

#### `data-t-source`

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

#### データの表示（ユニバーサル・プレースホルダー）

HTMLのテキスト中や属性値に `{データソース名.項目名}` と記述することで、データを表示できます。

- **基本例**:
  データソースとそのプロパティ（項目名）を指定して表示します。

  ```html
  <link data-t-source="article" href="/_sys/data/articles.json?id={?id}">
  <h1>{article.title}</h1>
  <p>{article.body}</p>
  ```

- **複数件を表示する場合 (`data-t-list`)**:
  表示したいデータが複数件存在する場合は、繰り返いたい範囲（要素）に対して `data-t-list="データソース名"` を指定する必要があります。

  ```html
  <link data-t-source="articles" href="/_sys/data/articles.json">
  <ul>
    <li data-t-list="articles">
      <h3>{articles.title}</h3>
    </li>
  </ul>
  ```

#### 属性へのデータの埋め込み（ユニバーサル・プレースホルダー）

全ての標準属性（`href`, `src`, `class`, `value`, `style` など）において、プレースホルダー `{ }` を直接記述してデータを埋め込むことができます。

- **利用例**:

  ```html
  <img src="{article.thumbnail}" alt="{article.title}">
  <a href="/post/{article.id}" class="btn {article.category}">詳細を見る</a>
  <div style="background-color: {user.color}; height: {progress}%;"></div>
  ```

- **制限**: JavaScriptの構文との干渉を避けるため、**イベントハンドラ属性（`onclick`, `onchange` 等）の中ではプレースホルダーを利用できません。** 後述の「プレースホルダーの干渉回避」を参照してください。

#### プレースホルダーの干渉回避と制限

Bracify のプレースホルダー `{ }` は、HTML 属性やテキストノードで利用可能ですが、JavaScript や CSS のコード（波括弧を使用する構文）との干渉を防ぐため、以下の箇所では**展開が無効化**されています。

- **展開されない箇所**:
  - `<script>` タグの内部
  - `<style>` タグの内部
  - イベントハンドラ属性 (`onclick`, `onmouseover`, `onsubmit` 等、`on` で始まる全ての属性)

##### 推奨パターン：イベントハンドラ内でデータを利用する

イベントハンドラ（JavaScript）内で動的なデータを利用したい場合は、直接 `{ }` を書くのではなく、**`data-` 属性にデータを埋め込み、それを `this.dataset` 経由で参照**するパターンを推奨します。

```html
<!-- 非推奨（動作しません） -->
<button onclick="alert('ID: {article.id}')">表示</button>

<!-- 推奨パターン -->
<button data-id="{article.id}" onclick="alert('ID: ' + this.dataset.id)">表示</button>
```

この方法をとることで、Bracify のテンプレートエンジンとブラウザ標準의 JavaScript 構文を安全に共存させることができます。

#### フォーム要素の自動バインド

`input`, `select`, `textarea` 要素に `name` 属性が指定されている場合、`Bracify` は適切なデータソースから値を自動的にバインド（表示）します。ユーザーが手動で `value` やプレースホルダーを指定する必要はありません。

- **自動バインドの優先順位**:
  1. **現在のデータコンテキスト**: `data-t-scope` などで指定されたデータのプロパティから値を設定します。
  2. **URLパラメータ (`_sys.query`)**: ページURLのクエリパラメータに `name` と同じ名前の項目がある場合、その値を設定します。

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
  <form data-t-scope="article" method="PUT" action="/_sys/data/article">
    <input type="text" name="title">
    <textarea name="content"></textarea>
  </form>
  ```

- **セレクトボックスの自動選択**:
  `<select>` タグにバインドされた値と一致する `value` を持つ `<option>` 要素には、自動的に `selected` 属性が付与されます。

#### `data-t-if`

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

#### `data-t-redirect`

処理（フォーム送信など）が正常に完了した後の、画面遷移先URLを指定します。

- **指定方法**: 遷移先の相対パスまたは絶対パスを指定
- **対象タグ**: 主に `form` タグ（将来的にボタン等への拡張も想定）
- **例**:

  ```html
  <!-- 送信完了後にトップページへ戻る -->
  <form method="POST" action="/_sys/data/contact" data-t-redirect="/">
  ```

### フォームとデータ保存

標準の `<form>` タグを使用して、APIへのデータ送信（作成・更新）が可能です。

- **自動API送信**: `action` 属性にAPIのURL、`method` 属性に `POST` または `PUT` を指定すると、自動的にJSON形式でデータが送信されます。
- **画面遷移**: `data-t-redirect` 属性で、保存完了後の移動先ページ（相対パス）を指定できます。指定がない場合は現在のページをリロードします。
- **データバインド（初期値）**: `<form>` タグに `data-t-bind` を指定することで、既存データを入力欄の初期値としてセットできます（更新画面などで有用）。
- **入力項目**: `<input>` や `<textarea>` の `name` 属性が、データの項目名（プロパティ）になります。

#### 例: 記事の編集（更新）フォーム

```html
<!-- フォーム全体に article データをバインド（初期値セット） -->
<!-- actionで指定したAPIに PUT メソッドで送信 -->
<!-- 保存完了後に一覧ページ(../list.html)へ戻る -->
<form method="PUT" action="/_sys/data/article" data-t-bind="article" data-t-redirect="../list.html">

  <label>タイトル</label>
  <input type="text" name="title"> <!-- article.title の値が入る -->

  <label>本文</label>
  <textarea name="content"></textarea> <!-- article.content の値が入る -->

  <button>保存</button>
</form>
```

### 加工フィルタ（パイプ）

データを表示する際、加工フィルタ（正式名称：パイプ）`|` を使用できます。

#### 基本構文

```html
<p>更新日：{ article.updated_at | date: 'yyyy/mm/dd' }</p>
<span>価格：{ product.price | number } 円</span>
```

↓ **実行結果**

```html
<p>更新日：2025/12/10</p>
<span>価格：1,500 円</span>
```

#### 加工フィルタの構文（パイプ構文）

```text
{ データ名.項目名 | フィルタ名: '引数' }
```

### 標準フィルタ（組込パイプ関数）

#### `date`

日付データ（日付型）を指定した書式で文字として出力します。

- **書式**: `{ 項目名 | date: 'フォーマット' }`
- **フォーマット指定**:
  - `yyyy`: 4桁の年
  - `mm`: 2桁の月
  - `dd`: 2桁の日

## データアクセスAPI

### エンドポイント仕様 (Data API)

サーバー上のデータ（JSONファイル等）に対して、参照だけでなく更新・削除も可能です。

```text
/_sys/data/{entity}.json?{prop}={val}
```

#### データ操作のメソッド

| メソッド | 動作 | 説明 |
| :--- | :--- | :--- |
| `GET` | 取得 | 条件に応じてデータを取得します。 |
| `POST` | 作成 | 新たにデータを作成します。 |
| `PUT` | 更新 | 条件に応じたデータを、指定された値で書き換えます。 |
| `DELETE` | 削除 | 条件に合致するデータを削除します。 |

### エンドポイント仕様 (File API)

サーバー上の静的ファイル（画像など）を管理するためのAPIです。

```text
/_sys/file/{filename}.{ext}
```

#### ファイル操作のメソッド

| メソッド | 動作 | 説明 |
| :--- | :--- | :--- |
| `GET` | 取得 | ファイルを取得します。 |
| `POST` | 作成 | 新たにファイルをアップロード・作成します。 |
| `PUT` | 更新 | 指定されたファイルの内容を上書き更新します。 |
| `DELETE` | 削除 | 指定されたファイルを削除します。 |

#### パラメータ

- **`{entity}`**: データの種類（正式名称：エンティティ）。例: `article` (記事), `user` (ユーザー)
- **`{prop}`**: 絞り込み条件に利用するデータの項目名（正式名称：プロパティ）
- **`{val}`**: 条件に指定する値

#### 演算子

項目名の後ろに記号（演算子）を付けることで、より詳しい条件を指定できます。

| 演算子 | 意味 | 記述例 | 例の説明 |
| :--- | :--- | :--- | :--- |
| （なし） | 等しい | `?status=active` | ステータスが `active` のもの |
| `:ne` | 等しくない | `?status:ne=draft` | ステータスが `draft` **ではない**もの |
| `:gt` | より大きい | `?price:gt=1000` | 価格が 1000 円**より高い**もの (1001円〜) |
| `:gte` | 以上 | `?price:gte=1000` | 価格が 1000 円**以上**のもの (1000円〜) |
| `:lt` | より小さい | `?stock:lt=10` | 在庫が 10 個**より少ない**もの (〜9個) |
| `:lte` | 以下 | `?stock:lte=10` | 在庫が 10 個**以下**のもの (〜10個) |

### システム予約変数 (`_sys`)

アプリケーション全体のコンテキストや、ブラウザのリクエスト情報を取得するために `_sys` という予約変数が用意されています。

| 変数名 | 説明 | 記述例 |
| :--- | :--- | :--- |
| `_sys.query` | GETクエリパラメータ。URLの `?id=123` などの値を取得します。 | `{_sys.query.id}` |

#### `data-t-source` での利用（動的パラメータ・バインド）

`data-t-source` の `href` 属性内では、プレースホルダー `{ }` を利用してクエリパラメータを動的に埋め込むことができます。さらに、URLパラメータ専用の短縮記法 `{?}` が利用可能です。

| 記法 | 意味 | 記述例 |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | 指定した項目を埋め込む（標準形式） | `?id={_sys.query.id}` |
| `{?}` | **自動バインド**。左側のキー名と同じ名前の値をURLから取得 | `?title={?}` |
| `{?xxx}` | **短縮形式**。`_sys.query.xxx` と同等 | `?title={?q}` |

#### データソースでの記述例

```html
<!-- URLが ?title=Web&_limit=10 の場合 -->

<!-- 1. 自動バインド記法：キー名がURLパラメータ名と一致する場合に最適 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">

<!-- 2. 短縮記法：URLパラメータ名（例: q）とAPIのキー名（例: title）が異なる場合 -->
<link data-t-source="search" href="/_sys/data/articles.json?title={?q}">

<!-- 3. 標準形式：より明示的に記述する場合 -->
<link data-t-source="items" href="/_sys/data/items.json?category={_sys.query.cat}">
```

### データの詳細情報（システムプロパティ）

データそのものに含まれる値（タイトルやIDなど）以外に、データの「件数」や「状態」を知りたい場合があります。
`Bracify` では、データ名の後ろにアンダースコア `_` で始まる名前をつけることで、これらの特別な情報を取得できます。

| プロパティ名 | 説明 | 記述例 |
| :--- | :--- | :--- |
| `_length` | リスト（配列）に含まれるデータの件数、または文字の長さを表示します。 | `{articles._length}件の記事` |

#### 制御パラメータ (ソート・ページネーション)

データの取得件数制御や並び替えには、アンダースコア `_` で始まる予約パラメータを使用します。これにより、通常のデータ項目（例: `limit` という名前のカラム）との衝突を防ぎます。

| パラメータ | 説明 | 記述例 |
| :--- | :--- | :--- |
| `_limit` | 取得する最大件数 | `?_limit=20` |
| `_offset` | 読み飛ばす件数（ページネーション用） | `?_offset=20` (21件目から取得) |
| `_sort` | ソート対象のキー項目名 | `?_sort=created_at` |
| `_order` | 並び順 (`asc`: 昇順, `desc`: 降順) | `?_order=desc` (省略時は `asc`) |

#### 制御パラメータの使用例

```html
<!-- URLパラメータを利用した検索/ソートの例 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={_sys.query.title}&_sort={_sys.query._sort}&_order={_sys.query._order}&_limit={_sys.query._limit}">

<!-- カテゴリ固定、ページのみパラメータで指定 -->
<link data-t-source="techArticles" href="/_sys/data/articles.json?category=Tech&_limit=10&_offset={_sys.query._offset}">
```

#### ローカルディレクトリ構成例

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

### ローカルプレビュー ("Zero Server" Mode) でのデータ制限

サーバーを起動せず、ローカルファイル (`file://`) としてプレビューする場合 (`index.html` ダブルクリック等)、データ取得処理はブラウザ内の簡易モックとして動作します。
このモードは、デザイン確認や簡単な動作チェックを目的としており、サーバー環境（SSR）とは挙動が一部異なります。

- **フィルタ機能の制限**:
  - **完全一致のみ**: 指定されたキーと値が完全に一致する場合のみデータを返します。
  - **空の値の無視**: 検索パラメータの値が空文字（`?name=`）の場合は、そのフィルタ条件自体を無視します（全件表示されます）。
  - **高度な演算子は非対応**: `:gt` や `:lt` などの演算子は機能せず、無視されるか、期待通りに動作しません。

- **対応している制御パラメータ**:
  以下のパラメータはローカルプレビューでも簡易的に動作します。
  - `_limit`: 表示件数の制限
  - `_offset`: データの読み飛ばし
  - `_sort`: ソート対象のキー
  - `_order`: `asc` (昇順) または `desc` (降順)

## デプロイメント

- **Serverless**: Vercel や Netlify へのデプロイを想定。
- **Zip Upload**: GUIアプリでプロジェクトをZip化し、各サービスのダッシュボードにドラッグ＆ドロップするだけでデプロイ完了。

## 開発フロー

1. 公式サイトから `Bracify` GUIアプリをダウンロード＆インストール。
2. アプリを起動し、作業フォルダを作成・選択。
3. `index.html` `_parts/header.html` などを編集。GUIアプリがリアルタイムプレビューを提供。
4. 完成したらZip化して公開。
