# Changelog

All notable changes to Bracify are recorded here. Versions follow [Semantic Versioning](https://semver.org/);
while the version is `0.x`, minor releases may contain breaking changes.

Bracify の主な変更をここに記録します。バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従います。
`0.x` の間は、マイナーリリースにも互換性のない変更が含まれる場合があります。

## [0.1.0] - 2026-10-27

First tagged release. / 最初のタグ付きリリースです。

### English

#### Features

- HTML-attribute templating shared by SSR and CSR: `data-t-include` (snippet and layout modes), `data-t-source`,
  universal `{placeholders}` in text and attributes, `data-t-list`, `data-t-if` (comparison and AND/OR operators),
  `data-t-scope`, form auto-binding, `data-t-redirect`.
- Nested property access, automatic relations (`{article.category.name}` via `category_id`) (#2, #18).
- Arithmetic in placeholders and `data-t-if` operands (#17), comparison/logical operators in `data-t-if` (#16).
- Pipes with chaining: `date`, `number`, `currency`, `uppercase`, `lowercase`, `truncate`, `default`, `ternary`, `json` (#10).
- Data API on `/_sys/data/{entity}.json`: filters with operators and `*` wildcard, `_limit` / `_offset` / `_sort` / `_order`,
  form postback (POST / PUT / DELETE via `_method`) with PRG redirects; SQLite by default with routed DB config.
- Markup-driven SPA navigation for both server and `file://` modes (#20).
- Build-free local mode on `file://` via the File System Access API (#15), with folder access reset (#19).
- Bracify Studio: multi-project start/stop (#14), data manager with entity discovery, CRUD and scaffold (#9).
- Reference app "Bracify Books" in `examples/` covering the README features in both modes (#30).

#### Security

- Path traversal and project confinement for static files, SSR and includes, including symlinks/junctions,
  dot directories, percent-encoding and NTFS stream/case aliases (#6, #36, #41, #68, #86, #95).
- Auto-escaping, attribute-injection and double-evaluation protection (#3, #4, #5, #37).
- Allow-list URL sanitization for URL-bearing attributes (#31).
- Underscore guard for `_sys` / `_parts` (#7); Origin check on every `/_sys` write and no wildcard CORS (#33).
- Prototype pollution in the Data API (#32); unfiltered DELETE refused (#35); bounded include recursion (#34).
- No stack traces or internal errors in responses (#44); same-origin `data-t-redirect` targets only (#45).
- Query values encoded in `data-t-source` hrefs so they cannot inject filters (#85).

#### Fixes

- SSR/CSR parity for URL parameters, `key={?}` auto-bind, empty `id` filters, missing fields and `<select>` options
  (#38, #39, #43, #47, #49).
- SPA history and head handling: Back to the initial page, link interception, navigation races, `<meta>` dedup
  (#40, #46, #87, #89); partial scripts on the initial CSR load (#48).
- Seed JSON imported once per entity (#42); dynamic includes kept out of the SSR template cache (#67).
- CLI build fixed and its output hydrates correctly (#50, #88).

#### Maintenance

- README aligned with the implementation in all six languages (#51).
- Removed the unused `cors` dependency, the broken GUI debug panel and the legacy `/_sys/api/data/*` routes (#69).

#### Known limitations

- Local mode (`file://`) is read-only: forms are saved in server mode only (#56).
- Local mode filters are exact-match only (no operators or `*`).
- Pages load the client engine with two `<script>` tags (server and local paths); a single engine URL is planned (#55).
- Planned enhancements: typed form values (#52), server-side validation (#53), `_total` / projection (#54),
  reverse relations (#57).

### 日本語

#### 機能

- SSR と CSR で共通の HTML 属性テンプレート: `data-t-include`（スニペット／レイアウト）、`data-t-source`、
  テキスト・属性の `{プレースホルダー}`、`data-t-list`、`data-t-if`（比較・AND/OR）、`data-t-scope`、
  フォームの自動バインド、`data-t-redirect`。
- ネストしたプロパティの参照、自動リレーション（`category_id` から `{article.category.name}`）（#2, #18）。
- プレースホルダーと `data-t-if` の値での四則演算（#17）、`data-t-if` の比較・論理演算（#16）。
- パイプとその連結: `date`、`number`、`currency`、`uppercase`、`lowercase`、`truncate`、`default`、`ternary`、`json`（#10）。
- `/_sys/data/{entity}.json` の Data API: 演算子・`*` ワイルドカードによる絞り込み、`_limit` / `_offset` / `_sort` / `_order`、
  フォームのポストバック（POST / PUT / `_method` による DELETE）と PRG リダイレクト。既定は SQLite、DB の振り分け設定に対応。
- サーバーモードと `file://` モードの両方で、マークアップだけの SPA 遷移（#20）。
- File System Access API による `file://` のビルド不要なローカルモード（#15）と、フォルダアクセスのリセット（#19）。
- Bracify Studio: 複数プロジェクトの起動・停止（#14）、エンティティ検出・CRUD・雛形生成ができるデータマネージャー（#9）。
- README の機能を両モードで網羅したサンプルアプリ「Bracify Books」（`examples/`、#30）。

#### セキュリティ

- 静的ファイル・SSR・include をプロジェクト内に限定（シンボリックリンク／ジャンクション、dot ディレクトリ、
  パーセントエンコード、NTFS ストリーム・大文字小文字の別名を含む）（#6, #36, #41, #68, #86, #95）。
- 自動エスケープ、属性インジェクション・二重評価の防止（#3, #4, #5, #37）。
- URL を持つ属性の許可リスト方式のサニタイズ（#31）。
- `_sys` / `_parts` のアンダースコア・ガード（#7）、`/_sys` へのすべての書き込みで Origin を確認し、ワイルドカード CORS を廃止（#33）。
- Data API の Prototype Pollution 対策（#32）、条件なし DELETE の拒否（#35）、include の再帰に上限（#34）。
- 応答にスタックトレースや内部エラーを出さない（#44）、`data-t-redirect` は同一オリジンのみ（#45）。
- `data-t-source` の href に埋め込むクエリ値を URL エンコードし、フィルタを注入できないようにした（#85）。

#### 修正

- URL パラメータ、`key={?}` 自動バインド、空の `id` フィルタ、項目の欠落、`<select>` の選択状態で SSR と CSR の結果を一致（#38, #39, #43, #47, #49）。
- SPA の履歴と head の扱い: 初期ページへの「戻る」、リンクの横取り、遷移の競合、`<meta>` の重複（#40, #46, #87, #89）。
  CSR 初回ロードで partial 内のスクリプトを実行（#48）。
- シード JSON はエンティティごとに 1 回だけ取り込む（#42）。動的 include を SSR テンプレートキャッシュに含めない（#67）。
- CLI ビルドを修正し、その出力がクライアントエンジンと正しく連携するようにした（#50, #88）。

#### メンテナンス

- 6 言語の README を実装に合わせて更新（#51）。
- 使われていない `cors` 依存、動作しない GUI デバッグパネル、旧 `/_sys/api/data/*` ルートを削除（#69）。

#### 既知の制限

- ローカルモード（`file://`）は読み取り専用で、フォームの保存はサーバーモードのみ（#56）。
- ローカルモードの絞り込みは完全一致のみ（演算子や `*` は使えません）。
- ページはクライアントエンジンを 2 本の `<script>`（サーバー用とローカル用のパス）で読み込みます。単一 URL 化を予定（#55）。
- 予定しているエンハンス: フォーム値の型付け（#52）、サーバー側の入力検証（#53）、`_total` と項目の射影（#54）、
  逆方向のリレーション（#57）。

[0.1.0]: https://github.com/tri-comma/Bracify/releases/tag/v0.1.0
