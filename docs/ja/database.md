# データベース設定 (Database Configuration)

[← ドキュメント一覧](./README.md) | 言語: **日本語** | [English](../en/database.md)

Bracifyはデフォルトで内蔵の SQLite (`_sys/data.db`) を使用しますが、設定を行うことで MySQL や PostgreSQL などの外部データベースと接続することが可能です。

## 設定の仕組み

Bracifyは起動時に必ずプロジェクト内の `_sys/data.db` (SQLite) を参照し、システム設定を確認します。データベースの接続・ルーティング設定は、この中の `config` テーブルに格納されます。

これにより、認証情報などの機密情報をテキストファイルとして管理・コミットする必要がなくなり、リポジトリから隠蔽した安全な運用が可能です。

## 設定がない場合（デフォルト挙動）

`config` テーブルが存在しない、または該当するエンティティの設定がない場合は、**自動的にプロジェクト内蔵の SQLite (`_sys/data.db`) が使用されます。** シンプルな構成では設定の必要はありません。

## 設定方法

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

### ルーティングの優先順位 (target_entity)

エンティティ名に対し、以下の規則に従って接続先が自動選定されます。

1. **完全一致**: 完全に名前が一致する設定が最優先されます。
2. **パターン一致**: ワイルドカード `*` を含む場合、一致する中で「固定部分の文字数が最も長い」ものを優先します（例: `data_*` は `*` より優先される）。
3. **定義順**: 固定部分の長さも同じ複数のパターンに該当する場合、**設定（JSON配列）のより上に記述されているもの**が優先されます。
4. **内蔵 SQLite**: 上記のいずれにも該当しない場合、内蔵の SQLite が使用されます。

- **engine**: `sqlite`, `mysql`, `postgresql`, `mongodb` など（※順次実装）。
- **option**: 各ドライバ固有の接続設定。`${ENV_VAR}` 形式で環境変数を参照できます。
