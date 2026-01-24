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

GUIアプリで `Start Server` ボタンを押し、`localhost:3000` を開くと `Hello Bracify!` と表示されます。
サーバーは起動時に `index.html` と `info.json` を読み込み、メモリ上で SSI（部品結合）を解決してレスポンスを返します。
ファイルを編集して保存すると、OSレベルの監視により、メモリ上のテンプレートも即座に更新されます。

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

---

## プロジェクト構成 (File System Structure)

`Bracify` プロジェクトは、ソース編集用のフォルダ（ルート）と、出力用のフォルダ（`_dist`）で構成されます。

### 推奨ディレクトリ構成

```text
project/
├── index.html          # エントリーポイント
├── style.css           # 静的リソース
├── img/                # フォルダ名がアンダースコアで始まらないものは公開されます
│   └── logo.png
├── _parts/             # [非公開] インクルード用部品
│   ├── header.html
│   └── footer.html
└── _sys/               # [非公開] システムデータ・設定
    ├── data.db         # データベース本体
    └── data/           # Data API 用のデータ
        └── articles.json
```

### レンダリング仕様

Bracify は、Webサーバーとして動作する「SSRモード」と、ブラウザで直接動作する「CSRモード」を自在に使い分けることができます。

#### 1. SSRモード（サーバーサイド実行）
サーバー起動後、リクエストに応じてHTMLを動的に構築します。

- **オンメモリ・ビルド**: 
  起動時、およびファイル保存時に `data-t-include` を解決（部品の結合）した状態の HTML テンプレートを**メモリ上**に構築・キャッシュします。
- **ファイル監視**:
  `index.html` や `_parts/` 以下のファイルが更新されると、サーバーはOSレベルのイベントを検知し、メモリ内のキャッシュを自動的に再構築します。
- **高速な応答**:
  リクエスト時にはメモリ上の完成済みテンプレートからデータをバインドするため、ディスク I/O を最小化した高速なレスポンスが可能です。

#### 2. CSRモード（クライアントサイド実行）
サーバーを介さず、`file://` プロトコルでフォルダを直接開いて動作します。

- **実行時インクルード**: 
  ブラウザが HTML を読み込んだ際、`data-t-include` で指定されたファイルを File System Access API を通じてその場で読み込み、ドキュメントに結合します。
- **完全な一貫性**: 
  SSR（サーバー）と CSR（ブラウザ）は、全く同じバインドエンジン（`engine.js`）を使用するため、環境に関わらず全く同じ表示結果が得られます。

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

- **プレースホルダーのエスケープ**:
  プレースホルダー記法を評価させず、そのまま表示したい場合は、開始中括弧の前にバックスラッシュ `\` を置きます。

  ```html
  <code>\{user.name\}</code> <!-- 表示結果: {user.name} -->
  ```

### リスト表示 (`data-t-list`)

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

  **比較演算と論理演算（Data APIスタイル）**:
  Data APIのクエリパラメータと同じ構文を使って、より詳細な条件を指定できます。

  - **比較演算子**: [データアクセスAPIの演算子](#演算子)と同じ記法（`=`, `:ne=`, `:gt=` など）が使えます。
  - **論理演算（AND/OR）**: スペースで区切ると **AND**、値にカンマを使うと **OR** になります。
  - **変数の使用**: `{ }` で囲むことで、データの値を条件に使えます。
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
  ```

#### `data-t-redirect`

フォーム送信などの処理が正常に完了した後の、画面遷移先URLを指定します。

- **指定方法**: 遷移先の相対パスまたは絶対パスを指定
- **対象タグ**: `form` タグ
- **動作**: サーバー側で処理が完了した後、指定されたパスへ 302 リダイレクトされます。指定がない場合は現在のページ（送信元）をリロードします。

### フォームとデータ保存（ポストバック）

標準の `<form>` タグを使用して、データの作成・更新が可能です。Bracify は JavaScript による非同期送信（fetch）を使用せず、ブラウザ標準の**ポストバック（ページ遷移を伴う送信）**で動作します。

- **自動処理**: `action` 属性に保存先（`/_sys/data/xxxxx.json` 等）を指定し、`method="POST"` または `PUT` で送信します。
- **リダイレクト (PRGパターン)**: サーバー側で保存が完了すると、自動的に `data-t-redirect` で指定したURL、または元のページへリダイレクトされます。これにより「フォームの再送」が防止され、安全な画面遷移が可能です。
- **データバインド（初期値）**: `<form>` タグに `data-t-scope` を指定することで、既存データを入力欄の初期値としてセットできます（更新画面などで有用）。
- **入力項目**: `<input>` や `<textarea>` の `name` 属性が、データの項目名（プロパティ）になります。

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

#### `number`

数値を「3桁区切りのカンマ」形式で出力します。

- **書式**: `{ 項目名 | number }`

#### `json`

データを整形済みのJSON文字列として出力します。デバッグや、JavaScriptでそのまま利用したい場合に便利です。

- **書式**: `{ 項目名 | json }`

## データ保存処理 (Form Handler)

Bracify は外部へのデータ提供（API）を行いません。`/_sys` 以下のリソースはすべて隠蔽されますが、フォーム送信時の受け口として以下のエンドポイントが機能します。

```text
POST /_sys/data/{entity}.json
```

このエンドポイントは、ブラウザから直接 `GET` でアクセスすることはできません（403 Forbidden）。フォームの `action` としてのみ利用可能です。

#### データ操作
データの操作は HTTP リクエストによって行われますが、レスポンスは常に「ページへのリダイレクト」となります。

| メソッド | 動作 | 説明 |
| :--- | :--- | :--- |
| `POST` | 作成 | 新たにデータを作成します。 |
| `PUT` | 更新 | 送信されたデータで既存の情報を書き換えます。 |
| `DELETE`| 削除 | 指定されたデータを削除します。 |

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

### ローカル開発モード (True Zero Server Mode)

サーバーを起動せず、ローカルファイル (`file://`) としてブラウザで直接 `index.html` を開いて開発を行うモードです。

#### File System Access API によるビルド不要の開発

モダンブラウザ（Chrome, Edgeなど）が提供する **File System Access API** を活用することで、従来必要だった「JSONファイルをJSファイルに変換するビルドプロセス」が不要になります。

1. **プロジェクトフォルダの選択**: `file://` でページを開くと、初期化時にフォルダ選択のプロンプトが表示されます。プロジェクトのルートディレクトリを選択することで、ブラウザが直接ファイルを取得・操作できるようになります。
2. **ビルド不要のプレビュー**: `_sys/data/*.json` や `_parts/*.html` がブラウザによって直接読み込まれるため、ファイルを編集・保存してブラウザをリピート（または遷移）するだけで即座に反映されます。

#### ページ遷移と SPA ルーティング

`file://` 環境ではブラウザのリロードが発生するとフォルダへのアクセス権限がリセットされるため、Bracify は全ての遷移を SPA（Single Page Application）として処理します。

- **リンクの自動インターセプト**: `<a>` タグによる内部遷移は自動的に検知され、ページをリロードせずに DOM のみを置換して遷移します（Full DOM Replacement）。
- **JavaScript 遷移 API**: スクリプトからプログラムでページ遷移を行う場合は、`location.href` の代わりに `Bracify.navigate('/path/to/page.html')` を使用してください。
- **ブラウザ履歴**: ブラウザの「戻る・進む」ボタンにも対応しており、リロードなしで履歴間の移動が可能です。

#### 非対応ブラウザでの制限

File System Access API に非対応のブラウザ、またはフォルダ選択を行わなかった場合は、以下の制限付き「読み取り専用モックモード」で動作します。

- **フィルタ機能の制限**: 完全一致のみ。`:gt` や `:lt` などの演算子は動作しません。
- **更新不可**: フォーム送信によるデータの保存は行われません。
- **部分的な表示**: 外部ファイルの読み込み（`data-t-include`）が制限される場合があります。

#### データのフィルタ・制御について（共通仕様）

ローカル開発モード（True Zero Server / モックモード共通）では、ブラウザ内での簡易的なデータ処理を行うため、以下の制限と仕様があります。

- **フィルタ機能の制限**:
  - **完全一致のみ**: 指定されたキーと値が完全に一致する場合のみデータを返します。
  - **空の値の無視**: 検索パラメータの値が空文字（`?name=`）の場合は、そのフィルタ条件自体を無視します（全件表示されます）。
  - **高度な演算子は非対応**: `:gt` や `:lt` などの演算子は機能せず、無視されるか、期待通りに動作しません。

- **対応している制御パラメータ**:
  以下のパラメータはローカル環境でも簡易的に動作します。
  - `_limit`: 表示件数の制限
  - `_offset`: データの読み飛ばし
  - `_sort`: ソート対象のキー
  - `_order`: `asc` (昇順) または `desc` (降順)

#### SPA モード時の JavaScript の動作

ローカル開発モード（True Zero Server Mode）において、ページをリロードせずに遷移する際、JavaScript は以下の規則に従って実行されます。

- **スコープの分離 (IIFE ラッピング)**: 前のページの変数宣言（`const`, `let`）との衝突を防ぐため、ページ固有のスプリプト（`<body>` 内、および新規に読み込まれた `<head>` 内のスクリプト）は、Bracify によって自動的に即時実行関数 (IIFE) でラップされた状態で実行されます。
- **重複実行の防止**: `<head>` 内に記述されたスクリプトのうち、すでに読み込み済みのもの（`engine.js` や共通ライブラリ等）は、遷移先でも重複して実行されることはありません。
- **グローバル変数の維持**: `window` オブジェクトに明示的に持たせたデータや、IIFE 外で定義された `var` 変数は遷移後も維持されます。
- **イベントリスナー**: `window` や `document` に対して直接追加したイベントリスナーは、遷移時に自動でクリーンアップされません。ページ固有のイベントは、極力 `<body>` 内の要素に対して設定するか、遷移を意識した設計を推奨します。

## データベース設定 (Database Configuration)

Bracifyはデフォルトで内蔵の SQLite (`_sys/data.db`) を使用しますが、設定を行うことで MySQL や PostgreSQL などの外部データベースと接続することが可能です。

### 設定の仕組み

Bracifyは起動時に必ずプロジェクト内の `_sys/data.db` (SQLite) を参照し、システム設定を確認します。データベースの接続・ルーティング設定は、この中の `config` テーブルに格納されます。

これにより、認証情報などの機密情報をテキストファイルとして管理・コミットする必要がなくなり、リポジトリから隠蔽した安全な運用が可能です。

### 設定がない場合（デフォルト挙動）

`config` テーブルが存在しない、または該当するエンティティの設定がない場合は、**自動的にプロジェクト内蔵の SQLite (`_sys/data.db`) が使用されます。** シンプルな構成では設定の必要はありません。

### 設定方法

GUIから設定するか、直接データベースの `config` テーブルに対し、以下の形式で値を投入します。

- **対象テーブル**: `config`
- **カラム名**: `name` = 'db', `value` = (以下の接続情報のJSON配列)

**接続情報の記述形式（JSON）:**

```json
[
  {
    "target_entity": "users",
    "engine": "mysql",
    "option": { "host": "localhost", "port": 3306, "user": "admin", "password": "${DB_PASS}", "database": "app_db" }
  },
  {
    "target_entity": "logs_*",
    "engine": "mongodb",
    "option": { "url": "mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017" }
  },
  {
    "target_entity": "*",
    "engine": "postgresql",
    "option": { "host": "db.example.com", "port": 5432, "database": "shared_db" }
  }
]
```

#### ルーティングの優先順位 (target_entity)

エンティティ名に対し、以下の規則に従って接続先が自動選定されます。

1. **完全一致**: 完全に名前が一致する設定が最優先されます。
2. **パターン一致**: ワイルドカード `*` を含む場合、一致する中で「固定部分の文字数が最も長い」ものを優先します（例: `data_*` は `*` より優先される）。
3. **定義順**: 固定部分の長さも同じ複数のパターンに該当する場合、**設定（JSON配列）のより上に記述されているもの**が優先されます。
4. **内蔵 SQLite**: 上記のいずれにも該当しない場合、内蔵の SQLite が使用されます。

- **engine**: `sqlite`, `mysql`, `postgresql`, `mongodb` など（※順次実装）。
- **option**: 各ドライバ固有の接続設定。`${ENV_VAR}` 形式で環境変数を参照できます。

## デプロイメント

- **Serverless**: Vercel や Netlify へのデプロイを想定。
- **Zip Upload**: GUIアプリでプロジェクトをZip化し、各サービスのダッシュボードにドラッグ＆ドロップするだけでデプロイ完了。

## 開発フロー

1. 公式サイトから `Bracify` GUIアプリをダウンロード＆インストール。
2. アプリを起動し、作業フォルダを作成・選択。
3. `index.html` `_parts/header.html` などを編集。GUIアプリがリアルタイムプレビューを提供。
4. 完成したらZip化して公開。

## セキュリティ

Bracify は安全なフロントエンド開発をサポートするため、標準で以下の保護機能を備えています。

- **自動エスケープ**: `{placeholder}` によるデータの展開は、自動的に HTML エスケープ処理（プレーンテキスト化）が行われるため、XSS（クロスサイトスクリプティング）を防止します。
- **セキュア・データ注入**: SSR やビルド時にデータを HTML 内に埋め込む際、スクリプトタグの干渉（`</script>` による中断など）を防ぐためのエスケープが自動で行われます。
- **URLサニタイズ**: `href` や `src` 属性にデータを埋め込む際、`javascript:` などの危険なプロトコルを検知した場合は自動的に無効化され、予期せぬスクリプト実行を防止します。
- **アンダースコア・ガード (SSR専用)**: 
  サーバー動作時、ルート直下のディレクトリ名またはファイル名がアンダースコア（`_`）で始まるリソースへの外部からの直接アクセスをすべて拒否（403 Forbidden）します。
  これにより、`data.db` やインクルード用部品（`_parts/`）などの内部情報への不用意なアクセスをWebサーバーレベルで一括して遮断します。
  ※ フォーム送信用の公式エンドポイント（`POST /_sys/data/*.json` 等）はこの制限の対象外となります。
