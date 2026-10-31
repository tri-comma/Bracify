[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Bracify Logo" width="200">
</p>

# Bracify 🚀

> **HTML だけで作る Web フレームワーク。必要なのはマークアップだけ。**
>
> アプリを作るのにターミナルは要りません（GUI の Studio で完結）。CLI は静的ビルド用の任意ツールです。

Bracifyは、HTMLのマークアップだけでWebアプリケーションを構築できるフレームワークです。
プログラミングや複雑な環境構築の壁を減らすことを目指した「HTML-first」な開発体験を提供します。

## Bracifyとは

Bracifyは「マークアップだけでアプリが作れる」というシンプルさを追求しています。

- **React/Vueに疲れたエンジニアへ**: 複雑なビルド設定や重厚なフレームワークの学習から解放されます。
- **マークアップエンジニアへ**: プログラミング不要、あなたのHTMLスキルだけでデータ連携まで、動くWebアプリが作れます。

## Demo

![Demo Animation](./demo.gif)

## Key Concepts

- **HTML Markup Only**: プログラムを書かず、HTMLをマークアップするだけでアプリを作成。
- **Terminal-free Authoring**: ページの作成・プレビュー・データ管理に黒い画面（ターミナル）は不要です。GUI ツール Bracify Studio で完結します。CLI（静的ビルド用）は任意です。
- **Hybrid Rendering**: `file://` (CSR) で開発し、本番はそのままサーバー `https://` (SSR) として公開可能。
- **Minimal Setup**: プロジェクトに設定ファイルやビルド手順は不要です。Studio の起動には Node.js と、最初に一度だけの `npm install` が必要です（下記 Quick Start）。
- **Portable**: プロジェクトはただのHTML。どこへでも持ち運べ、すぐに動かせます。

## Quick Start

まずは簡単なページの作成から始めてみましょう。たったの4ステップで完了します。

### 1. 準備

Bracify Studio を起動し、新しい作業フォルダを選択します。Studio は現在ソースから起動します（Node.js が必要です）。リポジトリのルートで `npm install` を一度実行し、`npm start` で起動します。詳細は [Studio](./docs/ja/studio.md) を参照してください。

### 2. HTMLの作成

`index.html` というファイルを作成し、以下の内容を記述します。

```html
<!DOCTYPE html>
<html>
<head>
  <!-- データソースの指定 -->
  <link data-t-source="info" href="/_sys/data/info.json">
  <script src="bracify.js"></script>
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

`<script src="bracify.js"></script>` はクライアント側エンジンの読み込みです（SPA 遷移・ローカル開発モード用。詳細は[プロジェクト構成](./docs/ja/project-structure.md)を参照）。

### 3. データの作成

`/_sys/data/info.json` というファイルを作成し、以下の内容を記述します。

```json
{
  "msg": "Hello Bracify!"
}
```

### 4. 実行

Studio で `Start Server` ボタンを押し、`localhost:3000` を開くと `Hello Bracify!` と表示されます。
サーバーは起動時に `index.html` と `info.json` を読み込み、メモリ上で SSI（部品結合）を解決してレスポンスを返します。
ファイルを編集して保存すると、OSレベルの監視により、メモリ上のテンプレートも即座に更新されます。

---

## できること

機能ごとに、最小の例を示します。詳しくは[ドキュメント](#ドキュメント)を参照してください。

### データの表示（`data-t-source` とプレースホルダー）

JSON などのデータに名前を付け、`{名前.項目}` でテキストや属性に埋め込みます。URL パラメータは `{?id}` で参照できます。

```html
<link data-t-source="article" href="_sys/data/articles.json?id={?id}">
<h1>{article.title}</h1>
<p>{article.body}</p>
```

### リスト表示（`data-t-list`）

繰り返したい要素に指定すると、データの件数分だけ複製されます。並び替え・件数制限・ページ送りは URL パラメータで指定します。

```html
<link data-t-source="articles" href="_sys/data/articles.json?_sort=id&_order=desc&_limit=5">
<ul>
  <li data-t-list="articles"><a href="article.html?id={articles.id}">{articles.title}</a></li>
</ul>
```

### 条件表示（`data-t-if`）

値の有無、比較（`=` `:gt` など）、AND（スペース）/ OR（カンマ）で要素の表示を切り替えます。

```html
<span data-t-if="status=published">Published</span>
<div data-t-if="price:gte=1000 stock:gt=0">In stock</div>
<div data-t-if="!user.is_login"><a href="login.html">Log in</a></div>
```

### フォームの保存（Data API とサーバー側バリデーション）

標準の `<form>` を Data API に送るだけでデータが保存されます。`required` / `maxlength` / `pattern` などの制約はサーバー側でも検証され、失敗時は `?error=` 付きで元のページに戻ります。

```html
<form method="POST" action="/_sys/data/articles.json" data-t-redirect="articles.html">
  <input type="text" name="title" required maxlength="100">
  <input type="email" name="email" required>
  <button>Save</button>
</form>
<p>{_sys.query.error}</p>
```

### 部品とレイアウト（`data-t-include`）

ヘッダーなどの部品の差し込みと、共通レイアウトへのコンテンツ流し込みができます。

```html
<!-- _parts/layout.html contains <main data-t-content="main-body"></main> -->
<body data-t-include="_parts/layout.html">
  <div data-t-content="main-body"><p>Page content</p></div>
</body>
```

### パイプ（加工フィルタ）

`|` で日付・数値・通貨などの整形や、切り詰め・既定値を適用できます。`date` `number` `currency` `uppercase` `lowercase` `truncate` `default` `ternary` `json` を標準で備えます。

```html
<p>{ article.updated_at | date: 'yyyy/mm/dd HH:MM' }</p>
<span>{ product.price | currency }</span>
<span>{ article.summary | truncate: 10 | uppercase }</span>
```

### SPA ナビゲーション

内部リンクは通常の `<a>` を書くだけで、自動的にページ全体を再読み込みしない遷移になります。JavaScript は不要です。

```html
<a href="book.html?id=1">Book</a>
```

### ローカルモード（`file://`、サーバー不要）

Chrome / Edge で `index.html` をダブルクリックして開き、プロジェクトフォルダを選択するだけで動きます（読み取り専用。File System Access API を使用）。各ページに次の 1 行が必要です。

```html
<script src="bracify.js"></script>
```

### Studio のデータ管理と雛形生成

Studio は HTML からエンティティとスキーマを自動で拾い、データの一覧・登録・編集・削除と、一覧・編集ページの雛形（Scaffold）生成を行います。

## 現在の制限

Bracify は開発初期のプロジェクトです。次の点を理解した上でお使いください。

- **ローカルモードは読み取り専用**です。`file://` ではフォームの保存ができません（[#56](https://github.com/tri-comma/Bracify/issues/56)）。
- **認証機能がまだありません**。公開サーバーでは、Data API に到達できる人なら誰でもデータを書き換えられます（[#106](https://github.com/tri-comma/Bracify/issues/106)）。公開する場合は十分に注意してください。
- **ファイルアップロードは未対応**です（[#107](https://github.com/tri-comma/Bracify/issues/107)）。
- **ワンステップのデプロイ機能はありません**。静的ビルドを静的ホスティングに置くか、Node.js が動くホストでサーバーモードを動かします（[#105](https://github.com/tri-comma/Bracify/issues/105)）。

## ドキュメント

詳しい仕様は `docs/` にあります。

| ファイル | 内容 |
| --- | --- |
| [`docs/ja/README.md`](./docs/ja/README.md) | ドキュメントの目次 |
| [`docs/ja/studio.md`](./docs/ja/studio.md) | Bracify Studio（ランチャー、管理ダッシュボード、データ管理、Scaffold） |
| [`docs/ja/project-structure.md`](./docs/ja/project-structure.md) | プロジェクト構成、レンダリング仕様（SSR / CSR / SPA）、クライアント側エンジンの読み込み |
| [`docs/ja/attributes.md`](./docs/ja/attributes.md) | カスタム属性（`data-t-include` `data-t-source` `data-t-list` `data-t-if` など）、フォームとデータ保存 |
| [`docs/ja/pipes.md`](./docs/ja/pipes.md) | パイプ（加工フィルタ）と標準フィルタ |
| [`docs/ja/data-api.md`](./docs/ja/data-api.md) | Data API（データ操作、サーバー側バリデーション、値の型）とデータ取得の条件指定 |
| [`docs/ja/system-variables.md`](./docs/ja/system-variables.md) | `_sys` 予約変数とシステムプロパティ |
| [`docs/ja/local-mode.md`](./docs/ja/local-mode.md) | ローカル開発モード（`file://`） |
| [`docs/ja/database.md`](./docs/ja/database.md) | データベース設定とルーティングの優先順位 |
| [`docs/ja/deployment.md`](./docs/ja/deployment.md) | ビルド・デプロイと開発フロー |
| [`docs/ja/security.md`](./docs/ja/security.md) | セキュリティ |

## サンプル (Examples)

[`examples/`](./examples/) に、ドキュメントの主要機能を使った実用サンプルアプリ「Bracify Books」（蔵書・読書記録アプリ）があります。サーバーモード（SSR + SQLite）と `file://` のローカル開発モードの両方で、同じファイルのまま動作します。実行方法と「機能 → ファイル」の対応表は [`examples/README.md`](./examples/README.md) を参照してください。

## コントリビューション (Contributing)

本プロジェクトは作者1名で開発を行う方針のため、第三者からの Pull Request は受け付けていません。バグ報告・機能要望・質問などの Issue は歓迎します。詳細は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
