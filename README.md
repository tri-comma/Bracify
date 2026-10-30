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
  - **複数プロジェクトの同時起動**: 各プロジェクトは独立した子プロセス（`node engine/start.cjs <path> <port>`）として起動され、複数を同時に実行できます。
    - 起動・停止は JavaScript を使わず、標準の `<form method="POST">`（SSR）で行います。
      - `POST /_sys/server/start`（フィールド: `id` = プロジェクトID）
      - `POST /_sys/server/stop`（フィールド: `id`）
      - 処理後は `data-t-redirect`、なければ Referer、なければ `/` へリダイレクト（303）します。失敗時は `?error=メッセージ` を付けて戻るため、ページ側で `{?error}` として表示できます。
    - ポートは `projects` エンティティの `port` を使用します。未指定の場合は 3000 から、指定したポートが使用中の場合はそのポートから順に空きポートを探索して割り当てます。実際に使われたポートは `port` に上書き保存されます。
    - この機能は、システムサーバー（Studio）として起動されたサーバーでのみ有効です（それ以外では `/_sys/server/*` は 404）。同一オリジン以外（`Origin` ヘッダーが `Host` と異なる）からの POST は 403 で拒否されます。子プロセスが予期せず終了した場合、`status` は `stopped` に更新されます。
    - 起動・停止の結果（`status` = `running`/`stopped`、`pid`、実際の `port`）はプロジェクトレコードに書き戻され、ダッシュボードに表示されます。
    - システムサーバー停止時は、起動したすべての子プロセスも停止します。
- **Data Manager**:
  - プロジェクトのHTMLからエンティティとスキーマを自動収集し、データの一覧・登録・編集・削除（CRUD）と雛形生成（Scaffold）を行います。画面は `studio/data/index.html?project=<id>`（エンティティ一覧）と `studio/data/entity.html?project=<id>&entity=<name>`（スキーマ・レコード・登録フォーム）で、すべて JavaScript を使わない SSR フォームです。
  - **エンティティの検出**: プロジェクト内の `*.html`（`node_modules`・`_sys`・`.` で始まるフォルダを除く。`_parts` は含む）を走査し、次からエンティティを収集します。
    - `data-t-source` の `href`（`_sys/data/<entity>.json`）
    - `<form action="..._sys/data/<entity>.json">` と、その中の `input` / `select` / `textarea` の `name`（`data-t-redirect` は除外。`a.b` のようなドット区切りはネストしたフィールド）
    - 既知のソース名を使った `{<source>.<field>}` プレースホルダー（型は `unknown`）
    - 既存のDBレコード（フォームで定義されていないフィールドは値から `number` / `boolean` / `string` / `object` を推定）
  - **スキーマ情報**: フィールドごとに型（`text` / `number` / `email` / `date` / `checkbox` / `enum`（`select` の選択肢）/ `unknown` など）、`required`、`maxlength`、`minlength`、`min`、`max`、`pattern` を収集します。
  - **検証の制限**: フィールド名は `[A-Za-z0-9_.-]` のみ（それ以外は無視）。`checkbox` の `required` は検証しません（未チェックは送信されないため）。`pattern` の検証は 1000 文字までで、それを超える値は拒否します。入れ子の量指定子を含む `pattern`（例: `(a+)+$`）は安全のため強制せず、スキーマの `patternSkipped` が `true` になります。
  - **CRUD**: 対象プロジェクトのデータ（`<project>/_sys/data.db` および、そのプロジェクトのルーティング設定）を直接操作します。Studio 自身のDBには影響しません。
    - `POST /_sys/studio/records?project=<id>&entity=<name>`（登録）、`POST /_sys/studio/records/update?project=<id>&entity=<name>&id=<id>`（更新）、`POST /_sys/studio/records/delete?project=<id>&entity=<name>&id=<id>`（削除）
    - 登録・更新時は検出したスキーマに基づきサーバー側で検証（`required` / `maxlength` / `minlength` / `min` / `max` / `pattern` / 型）し、失敗時は `?error=メッセージ` を付けて 303 リダイレクトで戻ります。成功時は `data-t-redirect`、なければ Referer へ戻ります。
    - SSR 用データソース（Studio ページ専用の仮想 href）: `_sys/studio/entities.json?project=<id>`、`_sys/studio/records.json?project=<id>&entity=<name>`（Data API と同じ絞り込み・`_sort`・`_limit`・`_offset` に対応）、`_sys/studio/schema.json?project=<id>&entity=<name>`。
  - **Scaffold（開発時のみ）**: `POST /_sys/studio/scaffold?project=<id>&entity=<name>` で、対象プロジェクトに `<entity>/index.html`（一覧・削除フォーム）と `<entity>/edit.html`（登録/編集フォーム。スキーマに応じた `type` / `required` / `maxlength` / `pattern` 付き）を生成します。生成物は文書化された Bracify 属性のみで構成され、既存ファイルは上書きせずエラーになります。
  - これらの機能は `/_sys/server/*` と同様に、システムサーバー（Studio）でのみ有効で（それ以外では 404）、`Origin` が `Host` と異なる POST は 403 で拒否されます。`entity` は英数字・`_`・`-` のみ（先頭 `_` 不可）です。
- **API Monitor**:
  - 通信ログの確認。

---

## プロジェクト構成 (File System Structure)

`Bracify` プロジェクトは、単一のソースフォルダで構成されます。実行のために物理的なビルド用ディレクトリは不要です。

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

#### 3. ページ遷移とSPAルーティング (Unified SPA)
Bracify は、SSR および CSR のいずれのモードにおいても、**すべてのページ遷移をデフォルトで SPA として処理**します。

- **シームレスな体験**: ブラウザによるページ全体のリロードを回避し、Ajax (Fetch) を用いて遷移先の HTML を取得、`<body>` 等の DOM 要素を動的に置換します。これにより、一瞬画面が白くなる（フリッカー）現象を防ぎ、高速で滑らかな操作感を提供します。
- **権限の継続性**: 特に CSR モードにおいて重要です。`file://` 環境では全ページのリロードが発生するとブラウザのフォルダアクセス権限が失われますが、SPA 方式をとることでセッション中ずっと権限を維持したままアプリを動作させることができます。
- **自動インターセプト**: 標準的な `<a>` タグによる内部リンクは、自動的に検知されて SPA 遷移に昇格されます。開発者はプログラムを一行も書くことなく SPA アプリを構築できます。
- **ブラウザ履歴サポート**: `history.pushState` API を利用し、SPA 遷移時もアドレスバーの URL 更新やブラウザの「戻る・進む」ボタンが期待通りに動作します。

#### 4. クライアント側エンジンの読み込み

SSR だけで表示するページには `<script>` は不要ですが、SPA 遷移・ローカル開発モード（`file://`）・CSR を使う場合は、各ページの `<head>` でクライアント側エンジンを読み込む必要があります。

- **サーバーモード**: サーバーがエンジンを `/engine/engine.cjs` で配信します。

  ```html
  <script src="/engine/engine.cjs"></script>
  ```

- **ローカル開発モード**: サーバーがないため、エンジン本体（リポジトリの `engine/lib/engine.cjs`）をプロジェクト内に置き、そのページからの相対パスで読み込みます。
- **両モードで同じファイルを使う場合**: [`examples/`](./examples/) のように両方の `<script>` を並べます。各モードで存在しない方は読み込みに失敗し、無視されます。

両モードで 1 本の `<script>` で済む読み込み方法は [#55](https://github.com/tri-comma/Bracify/issues/55) で検討中です。

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

- **注意点**: 開発サーバー使用時はサーバー側で、ブラウザでの直接閲覧（`file://`）時は File System Access API によって結合されます。

---

##### 動的なインクルード（プレースホルダーによるパス指定）

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
  - **変数の使用**: `{ }` で囲むことで、データの値を条件に使えます。`{ }` の中では[四則演算](#データの表示ユニバーサルプレースホルダー)も使えます（例: `matched._length:gt={_sys.query._offset + 10}`）。
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

  <!-- 次のページがある場合だけ「次へ」を表示。allArticles は件数を数えるために _limit / _offset を付けずに読み込んだ別のソース (件数 > 現在のオフセット + 10) -->
  <a data-t-if="allArticles._length:gt={_sys.query._offset + 10}" href="?_offset={_sys.query._offset + 10}">次へ</a>
  ```

#### `data-t-redirect`

フォーム送信などの処理が正常に完了した後の、画面遷移先URLを指定します。

- **指定方法**: 遷移先の相対パスまたは絶対パスを指定
- **対象タグ**: `form` タグ
- **動作**: サーバー側で処理が完了した後、指定されたパスへ 302 リダイレクトされます。指定がない場合は現在のページ（送信元）をリロードします。
- **遷移先の制限**: 相対パスはフォームを含むページを基準に解決されます。同一オリジンの遷移先のみ許可され、それ以外（外部URLなど）は送信元ページ、なければ `/` にフォールバックします。

### フォームとデータ保存（ポストバック）

標準の `<form>` タグを使用して、データの作成・更新が可能です。Bracify は JavaScript による非同期送信（fetch）を使用せず、ブラウザ標準の**ポストバック（ページ遷移を伴う送信）**で動作します。

- **自動処理**: `action` 属性に保存先（`/_sys/data/xxxxx.json` 等）を指定し、`method="POST"` で送信します（更新は `action="/_sys/data/xxxxx.json?_method=PUT"` と `<input type="hidden" name="id">` の組み合わせ。ブラウザの `<form>` は `PUT` を送れません）。
- **リダイレクト (PRGパターン)**: サーバー側で保存が完了すると、自動的に `data-t-redirect` で指定したURL、または元のページへリダイレクトされます。これにより「フォームの再送」が防止され、安全な画面遷移が可能です。
- **データバインド（初期値）**: `<form>` タグに `data-t-scope` を指定することで、既存データを入力欄の初期値としてセットできます（更新画面などで有用）。
- **入力項目**: `<input>` や `<textarea>` の `name` 属性が、データの項目名（プロパティ）になります。
- **サーバー側バリデーション**: フォームに書いた制約（`required` / `maxlength` / `minlength` / `min` / `max` / `pattern` / `type="email"` / `type="date"` / `select`・`radio` の選択肢）はサーバーでも検証されます（詳細は「データ保存処理」の「サーバー側バリデーション」）。失敗時は保存されず、`data-t-redirect`（なければ送信元）へ `?error=メッセージ` を付けて戻ります。ページ側は `{_sys.query.error}` で表示できます。
- **サーバーモード専用**: データの保存はサーバー（SSR）でのみ行われます。ローカル開発モード（`file://`）には書き込みの仕組みがなく、`POST` / `PUT` / `DELETE` のフォームは保存されません（[#56](https://github.com/tri-comma/Bracify/issues/56) で対応を検討中）。

### 加工フィルタ（パイプ）

データを表示する際、加工フィルタ（正式名称：パイプ）`|` を使用できます。

#### 基本構文

```html
<p>更新日：{ article.updated_at | date: 'yyyy/mm/dd HH:MM' }</p>
<span>価格：{ product.price | currency }</span>
<span>ステータス：{ article.is_published | ternary: '公開中', '下書き' }</span>
<span>ニックネーム：{ user.nickname | default: '名無し' }</span>
<span>概要：{ article.summary | truncate: 10 | uppercase }</span>
```

↓ **実行結果**（`article.summary` が `"Bracify is simple"` の場合）

```html
<p>更新日：2025/12/10 14:05</p>
<span>価格：￥1,500</span>
<span>ステータス：下書き</span>
<span>ニックネーム：名無し</span>
<span>概要：BRACIFY...</span>
```

#### 加工フィルタの構文（パイプ構文）

```text
{ データ名.項目名 | フィルタ名 }
{ データ名.項目名 | フィルタ名: 引数 }
{ データ名.項目名 | フィルタ名: '引数1', '引数2' }
{ データ名.項目名 | フィルタ名1 | フィルタ名2: '引数' }   ← 連結（左から順に適用）
```

- フィルタ名の後に続く最初の `:` 以降が引数です。複数の引数は `,` で区切ります。
- 引数は `'...'` または `"..."` で囲むことができます。クォートで囲んだ場合、その中の `:` `,` `|` は区切り文字として扱われません。数値の引数はクォート不要です（例: `truncate: 20`）。
- **引数の中に `}` を含めることはできません**（プレースホルダーの終端として解釈されてしまうため）。
- `|` で複数のフィルタを連結できます。前のフィルタの出力が次のフィルタの入力になります（左から右へ順に適用）。
- 算術式（四則演算）の結果にもパイプを適用できます: `{ item.price * 1.1 | currency }`

#### 適用タイミングに関する注意

パイプはデータの読み込みが完了した後に適用されます。対象データがまだ読み込まれていない間は `{ ... }` の記述がそのまま画面に残り、データの読み込みが完了すると正しい値に置き換わります。この特性を利用するため、`data-t-source` はできるだけ利用箇所より前（推奨: `<head>` 内の `<link data-t-source>`）に配置してください。

### 標準フィルタ（組込パイプ関数）

#### `date`

日付データ（日付型）を指定した書式で文字として出力します。

- **書式**: `{ 項目名 | date: 'フォーマット' }`
- **フォーマット指定**:
  - `yyyy`: 4桁の年
  - `mm`: 2桁の月
  - `dd`: 2桁の日
  - `HH`: 2桁の時（24時間表記）
  - `MM`: 2桁の分
  - `SS`: 2桁の秒
- **注意**: 月を表す `mm`（小文字）と分を表す `MM`（大文字）は区別されます。
- 例: `{ article.updated_at | date: 'yyyy/mm/dd HH:MM' }` → `2025/12/10 14:05`

#### `number`

数値を「3桁区切りのカンマ」形式で出力します。

- **書式**: `{ 項目名 | number }`

#### `currency`

数値を通貨形式で出力します。

- **書式**: `{ 項目名 | currency }` / `{ 項目名 | currency: '通貨コード' }`
- 通貨コードは ISO 4217 形式（`USD`, `EUR` など）で指定します。省略した場合は `JPY` として扱われます。
- 例: `{ product.price | currency }` → `￥1,500`
- 例: `{ product.price | currency: 'USD' }` → `$1,500.00`

#### `uppercase` / `lowercase`

文字列を大文字・小文字に変換します。

- **書式**: `{ 項目名 | uppercase }` / `{ 項目名 | lowercase }`
- 例: `{ user.code | uppercase }` → `ABC-001`

#### `truncate`

文字列を指定した文字数に切り詰めます。省略が発生した場合は末尾に `...` が付加されます。

- **書式**: `{ 項目名 | truncate: 文字数 }`
- `...` を含めた上で指定文字数に収まるように切り詰められます（例: `truncate: 10` の場合、`Bracify is simple` → `Bracify...`（10文字））。
- 指定文字数が3文字以下の場合は `...` を付けず、先頭から指定文字数だけをそのまま出力します。
- 値の文字数が指定文字数以下の場合は、そのまま出力されます。

#### `default`

値が空（`undefined`、`null`、空文字）のとき、代わりに表示する値を指定します。

- **書式**: `{ 項目名 | default: '代替値' }`
- `0` や `false` は「空」とはみなされず、そのまま出力されます。
- 例: `{ user.nickname | default: '名無し' }`

#### `ternary`

真偽値に応じて、表示する文字列を切り替えます。

- **書式**: `{ 項目名 | ternary: '真の場合の値', '偽の場合の値' }`
- 真偽の判定は `data-t-if` と同じ基準です（`false`、`0`、`""`、`null`、`undefined`、空配列、空オブジェクトが偽と判定されます）。文字列の `"false"` や `"0"` は真と判定される点に注意してください。
- 偽の場合の値を省略すると、空文字が出力されます。
- 例: `{ article.is_published | ternary: '公開中', '下書き' }`

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
| `POST` | 作成 | 新たにデータを作成します。既に存在する `id` を指定した場合は上書きせず拒否されます（上書きは `PUT` のみ）。 |
| `PUT` | 更新 | `id` で指定したレコードを、送信されたデータで**丸ごと置き換え**ます（存在しない `id` の場合は新規作成されます）。 |
| `DELETE`| 削除 | 指定されたデータを削除します。 |

標準の `<form>` は `GET` / `POST` しか送信できないため、`POST` で送信しつつクエリに `_method=PUT` または `_method=DELETE` を付けると、そのメソッドとして処理されます（例: `<form method="POST" action="/_sys/data/article.json?id=1&_method=DELETE">`）。

`PUT` は対象の `id`（クエリの `?id=` またはフォームの `id` 項目）が必須で、部分更新ではありません。フォームに含まれない項目は保存後のレコードから**消えます**。既存の値を残したい項目は、`data-t-scope` で初期値を入れた入力欄（必要なら `type="hidden"`）としてフォームに含めてください。

`DELETE` はデータの絞り込み条件（`id` など）が必須です。条件なしの `DELETE`（`_limit` などのみの場合を含む）は全件削除を防ぐため 400 で拒否されます。

#### サーバー側バリデーション

`POST` / `PUT` では、保存前に本文（`a.b` 形式のネストも含む）を、プロジェクトの HTML のフォームから導出した制約で検証します。ブラウザの検証を迂回した `curl` などの送信にも同じ制約が適用されます。

- **対象の制約**: `required`、`maxlength`、`minlength`、`type="number"` / `type="range"` の `min` / `max`、`pattern`（全体一致。入れ子の量指定子を含む危険なパターンはスキップされ、1000 文字を超える値は拒否されます）、`type="email"`、`type="date"`（`YYYY-MM-DD`）、`<select>` と `radio` の選択肢。
- **対象のフォーム**: `action` がそのエンティティの `_sys/data/<entity>.json` で、`method` が `POST`（または `PUT`）のフォームです。`data-t-include` で読み込んだ部品内の項目も含まれます。`GET` フォーム（検索など）と `_method=DELETE` の削除フォームは無視されます。 対象はプロジェクト内のすべての HTML ファイル（`_sys`・`.` で始まるフォルダ・`node_modules` を除く）で、使われなくなった古いコピーがあると検証が緩くなることがあります。 `data-t-include` は `<form>` の内側でのみ展開されるため、フォームがページのスロットを包むレイアウトが供給する項目は検証も型変換もされません。該当するフォームのないエンティティや、どのフォームにもない項目は検証されません。`<option>` / `radio` の値が `{ }` で動的に生成される場合、選択肢の検証は行われません。
- **複数のフォームが同じエンティティに保存する場合**: 互いの正当な送信を拒否しないよう、最も緩い宣言が優先されます。項目が `required` になるのは、すべての書き込みフォームがその項目を持ち、かつ必須にしている場合だけです。それ以外の制約は、その項目を持つすべてのフォームに違反した場合にだけ拒否されます（どれか 1 つのフォームで制約がなければ制約なし）。
- **検証されないもの**: `disabled` の項目、`type="hidden"` の制約、`data-t-if` の内側にある項目、および `data-t-list` で繰り返される項目（`radio` を除く）の `required`（表示されない場合があるため。`data-t-list` で生成した `radio` グループの `required` は検証されます）、複数の `checkbox`（同名）の `required`。単一の `checkbox` の `required` は検証されます。値は 1 項目につき 1 つの値のみ受け付けます（配列やオブジェクトは、`<select multiple>`・同名の複数 `checkbox` を除き拒否されます）。`type="email" multiple` はカンマ区切りで各アドレスを検証します。
- **失敗時**: 何も保存されません。フォーム送信（HTML を要求するリクエスト）は 303 で `data-t-redirect`（なければ `Referer`）へ `?error=` 付きで戻り、JSON クライアントには `400` と `{ "error": "..." }` が返ります。
- **重複 `id`**: `POST` で既に存在する `id`（本文の `id` または `?id=`）を指定すると、同様に拒否されます（JSON では `409`）。`id` が文字列でも数値でもない場合は、`POST` / `PUT` とも 400 で拒否されます。既存レコードの更新には `PUT`（フォームでは `action="...?_method=PUT"` と `<input type="hidden" name="id">`）を使用してください。
- `DELETE` は検証されません。HTML の編集は再起動なしで反映されます。

```html
<form method="POST" action="/_sys/data/books.json" data-t-redirect="/books.html">
  <p data-t-if="_sys.query.error">{_sys.query.error}</p>
  <input name="title" required maxlength="80">
  <button type="submit">登録</button>
</form>
```

#### 保存される値の型

検証を通った `POST` / `PUT` の値は、フォームの入力種別に合わせた型に変換して保存されます（Studio のレコード作成・更新も同じ規則です）。フォームの値は本来すべて文字列で、そのまま保存すると `_sort` が文字列順になる、`"false"` が `data-t-if` で真になる、といった不整合が起きるためです。

| 入力 | フォーム送信 | JSON |
| :--- | :--- | :--- |
| `type="number"` / `"range"` | 数値の文字列は数値に変換（`" 9 "` → `9`）。空文字・空白のみは項目ごと保存しない。`0x10`・`1e999`・`NaN`・`1,5`・`9px` などは拒否。±2^53（`Number.MAX_SAFE_INTEGER`）を超える整数も「too large」として拒否 | 有限の数値はそのまま。数値の文字列は変換。真偽値・配列は拒否。`min` / `max` は変換後の数値に適用 |
| 単一の `checkbox` | 送信されれば（`value` が何でも）`true`、未送信なら `false` | 真偽値はそのまま。文字列は `"true"`・`"on"`・その `checkbox` の `value`（`true`）と `"false"`（`false`、大文字小文字は問わない。ただし `value` との一致は区別します）のみ。それ以外（`"no"`・`"0"` など）や数値は拒否。`required` の `checkbox` は `false` では通りません。空文字は未送信扱い |
| `checkbox` の群（同名が複数）・`<select multiple>` | 常に文字列の配列（1 つだけでも `["x"]`）。何も選ばなければ項目ごと保存しない | 文字列の配列（文字列 1 つは配列に包む） |
| `text`・`textarea`・`email`・`select`・`radio`・`date` など | 文字列のまま | 文字列のみ。数値・真偽値は拒否（`required` を `false` / `0` で通すことはできません）。ただし `radio`・`select`・`hidden` は有限の数値も受け付け、そのまま保存します（`author_id: 1` のような関連 ID 用）。真偽値は拒否 |

- **未チェックが `false` になる条件**: そのエンティティの**すべての**書き込みフォームがその `checkbox` を持つ場合だけです。持たないフォームが 1 つでもあれば、未送信の項目は保存しません（そのフォームの項目を消してしまわないため）。`PUT` でも同じで、未チェックは `false` に置き換わります。
- **変換しないもの**: フォーム間で種別が食い違う項目（例: あるフォームでは `type="number"`、別のフォームでは `type="text"`）、どのフォームにも宣言されていない項目、`id`（常に文字列）、書き込みフォームのないエンティティは、送信されたままの値で保存されます。フォームがページのスロットを包むレイアウトが供給する項目（`data-t-include` は `<form>` の内側でのみ展開されます）も、検証も型変換もされません。
- **ドット記法**: `meta.isbn` のような項目を宣言している場合、親（`meta`）をオブジェクト以外（文字列・数値・真偽値・配列・`null`）で送ると、子の制約をすり抜けないよう拒否されます（`meta=str&meta.isbn=x` のような送信も同様です）。
- `NaN` / `Infinity` は保存されません。検証と型の検査に失敗した場合は何も保存されません。
- **既存データは移行されません**: すでに文字列で保存されている値（`"9"` や `"on"`）はそのままです。再保存するまでは文字列として並び替え・比較されます。

> **File API について**: 以前の版で記載していたファイル管理用エンドポイント（`/_sys/file/{filename}.{ext}` の GET/POST/PUT/DELETE）は**実装されていません**。画像などの静的ファイルは、プロジェクト内に置いて通常の URL（`/images/logo.png` など）で参照してください。

### データ取得の条件指定

`data-t-source` の `href` に付けるクエリパラメータで、取得するデータを絞り込みます（`DELETE` の絞り込み条件も同じ記法です）。

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

#### ワイルドカード（`*`）

演算子なし（等しい）の条件で値に `*` を含めると、`*` が任意の文字列に一致するパターン検索（SQL の `LIKE`）になります。

| 記述例 | 一致するもの |
| :--- | :--- |
| `?title=Web*` | `Web` で始まるタイトル |
| `?title=*入門*` | `入門` を含むタイトル |

- サーバーモード（Data API）でのみ有効です。ローカル開発モードは完全一致のみで、`*` も文字としてそのまま比較されます。
- `id` の条件と `DELETE` の絞り込み条件では、`*` は通常の文字として扱われます（パターン検索になりません）。
- **注意**: `?title={?q}` のようにユーザー入力をそのまま条件にすると、`q=*` でその項目を持つ全レコードに一致するなど、利用者がパターン検索を指定できます。また値に `*` を含む場合は SQL の `LIKE` と同じく `_` も任意の 1 文字に、`%` も任意の文字列に一致し、英字の大文字・小文字は区別されません。

### システム予約変数 (`_sys`)

アプリケーション全体のコンテキストや、ブラウザのリクエスト情報を取得するために `_sys` という予約変数が用意されています。

| 変数名 | 説明 | 記述例 |
| :--- | :--- | :--- |
| `_sys.query` | GETクエリパラメータ。URLの `?id=123` などの値を取得します。 | `{_sys.query.id}` |

#### 短縮記法 `{?xxx}`

`{?xxx}` は `{_sys.query.xxx}` の短縮形で、`data-t-source` の `href` に限らず、本文テキスト・属性値・`data-t-if`・`data-t-include` など、プレースホルダーが使えるすべての場所で利用できます。パイプや四則演算も同様に使えます。

```html
<!-- URLが ?q=bracify の場合 -->
<p>「{?q}」の検索結果</p>                 <!-- 「bracify」の検索結果 -->
<p>{?q | uppercase}</p>                    <!-- BRACIFY -->
<a href="books.html?q={?q | default: ''}&_sort=title">タイトル順</a>
```

- パラメータが無い場合は空文字になります。
- **URL エンコードについて**: `data-t-source` の `href` のクエリ部分に埋め込んだ値は自動的に URL エンコードされますが、通常の属性（`<a href>` など）では HTML エスケープのみで URL エンコードはされません。`&` や `=` を含みうる値をリンクのクエリに入れると、別のパラメータとして解釈される場合があります。
- 値を指定しない `{?}`（自動バインド）は `data-t-source` の `href` 内でのみ使用できます（下記参照）。

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

#### フォルダアクセス権限のリセット

選択したフォルダのハンドルはブラウザの IndexedDB に保存され、次回以降は自動的に復元されます。別のプロジェクトに切り替えたい場合や権限をやり直したい場合は、以下のいずれかでリセットできます（`file://` モードのみ）。

- **Disconnect Folder ボタン**: フォルダ接続中、画面右下にエンジンが小さな「Disconnect Folder」ボタンを表示します。クリックすると保存済みハンドルを破棄し、フォルダ選択オーバーレイを再表示します。
- **JavaScript API**: `Bracify.resetRootAccess()`（Promise を返す）。IndexedDB のハンドルとメモリ上のハンドルを破棄し、フォルダ選択オーバーレイを再表示します。
- **URL パラメータ**: `?bracify_reset=1` 付きで開くと、保存済みハンドルを復元せずに破棄し、オーバーレイを表示します。パラメータは `history.replaceState` で URL から自動的に除去されます。

SSR（サーバー）の出力にはこれらの UI は一切含まれません。

#### ページ遷移と SPA ルーティング

前述の「[ページ遷移とSPAルーティング](#3-ページ遷移とspaルーティング-unified-spa)」に従い、CSR モードでも全ての遷移が SPA として処理されます。これにより、`file://` 環境において最も懸念される「リロードによるフォルダアクセス権限の消失」という課題を解決しています。

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
  - **空の `id` の例外**: キーが `id` のフィルタだけは例外で、値が空または未解決のプレースホルダー（`{?}` など）の場合は無視せず、レコードを 1 件も返しません（`?id={?id}&_limit=1` で `id` 未指定のときは先頭レコードではなく「見つからない」扱いになります）。
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
- **クロスオリジン保護 (Data API)**: `POST` / `PUT` / `DELETE`（`?_method=` による上書きを含む）で `/_sys/data/*.json` に送信されたリクエストは、`Origin` ヘッダーが `Host` と異なる場合 403 で拒否されます（`Origin` ヘッダーのない通常のフォーム送信は許可されます）。

## サンプル (Examples)

[`examples/`](./examples/) に、本 README のリファレンス機能を網羅した実用サンプルアプリ「Bracify Books」（蔵書・読書記録アプリ）があります。サーバーモード（SSR + SQLite）と `file://` のローカル開発モードの両方で、同じファイルのまま動作します。実行方法と「機能 → ファイル」の対応表は [`examples/README.md`](./examples/README.md) を参照してください。

## コントリビューション (Contributing)

本プロジェクトは作者1名で開発を行う方針のため、第三者からの Pull Request は受け付けていません。バグ報告・機能要望・質問などの Issue は歓迎します。詳細は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
