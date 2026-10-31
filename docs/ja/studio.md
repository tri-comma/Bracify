# Development Tools (Bracify Studio)

[← ドキュメント一覧](./README.md) | 言語: **日本語** | [English](../en/studio.md)

`Bracify` は、開発者体験を最大化するために専用のGUIツール（コードネーム: **Bracify Studio**）を提供します。
このツールは Electron 製の「ランチャー」と、`Bracify` 自身で構築された「管理ダッシュボード（Webアプリ）」のハイブリッド構成で動作します。

## 1. Bracify Launcher (Desktop)

Admin Dashboard を起動するための薄いラッパーアプリケーションです。

- **System Server**: アプリ起動時にシステム管理用APIサーバーを立ち上げます。
- **Launch**: 自動的にブラウザ（またはElectronウィンドウ）で Admin Dashboard を開きます。

## 2. Admin Dashboard (Web)

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
