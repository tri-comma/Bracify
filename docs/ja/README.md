# Bracify ドキュメント

[← トップの README](../../README.md) | 言語: **日本語** | [English](../en/README.md)

Bracify のリファレンスです。日本語版が原本で、英語版は [docs/en/](../en/README.md) にあります。

- [コンセプトと設計原則](./concept.md): 想定する利用者、設計原則、機能を提案するときの確認項目（すべての機能はこれに従います）
- [設定一覧](./settings.md): 利用者が変えられる設定と、その設定方法
- [Bracify Studio（ランチャーと管理ダッシュボード）](./studio.md): Bracify Studio（Launcher と Admin Dashboard）の機能
- [プロジェクト構成とレンダリング仕様](./project-structure.md): ディレクトリ構成、SSR / CSR / SPA ルーティング、クライアント側エンジンの読み込み
- [カスタム属性リファレンス](./attributes.md): `data-t-include` / `data-t-source` / プレースホルダー / `data-t-list` / `data-t-if` / `data-t-redirect` / フォーム
- [加工フィルタ（パイプ）](./pipes.md): パイプ構文と標準フィルタ（`date` / `number` / `currency` など）
- [Data API](./data-api.md): データ保存（POST / PUT / DELETE）、サーバー側バリデーション、保存される値の型、データ取得の条件指定
- [システム予約変数](./system-variables.md): `_sys`、`{?xxx}` 短縮記法、`_length` などのシステムプロパティ、ソート・ページネーション
- [ローカル開発モード](./local-mode.md): `file://` で動く True Zero Server Mode と、その制限
- [データベース設定](./database.md): `config` テーブルによる接続先の設定とルーティング
- [デプロイメントと開発フロー](./deployment.md): 公開方法（静的ビルド / サーバーモード）と、現時点での開発の進め方
- [セキュリティ](./security.md): 標準の保護機能（エスケープ、URL サニタイズ、アンダースコア・ガード、クロスオリジン保護）
