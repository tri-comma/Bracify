# Database Configuration

[← Documentation index](./README.md) | Language: [日本語](../ja/database.md) | **English**

By default, Bracify uses the built-in SQLite (`_sys/data.db`), but you can connect to external databases like MySQL or PostgreSQL by configuring the connection settings.

## How it Works

Upon startup, Bracify always refers to the `_sys/data.db` (SQLite) within the project to check system configurations. Database connection and routing settings are stored in the `config` table within this file.

This eliminates the need to manage or commit sensitive information (like credentials) as text files, ensuring secure operation by keeping secrets out of the repository.

## Default Behavior (No Configuration)

If the `config` table does not exist or there is no configuration for a specific entity, **the built-in SQLite (`_sys/data.db`) is used automatically.** No configuration is required for simple projects.

## How to Configure

Studio has no screen for this yet (it is an advanced setting, see the [settings list](./settings.md)). Insert values directly into the `config` table of the database in the following format:

- **Target Table**: `config`
- **Columns**: `name` = 'db', `value` = (JSON array of connection info below)

**Connection Info Format (JSON):**

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

### Routing Priority (target_entity)

The connection destination is automatically selected based on the entity name according to the following rules:

1. **Exact Match**: Settings that perfectly match the name are given the highest priority.
2. **Pattern Match**: For settings containing a wildcard `*`, the one with the "longest fixed part (characters)" is prioritized (e.g., `data_*` takes precedence over `*`).
3. **Definition Order**: If multiple patterns match with the same fixed part length, the one **defined higher in the JSON array** is prioritized.
4. **Built-in SQLite**: Used as a fallback if none of the above rules match.

- **engine**: `sqlite`, `mysql`, `postgresql`, `mongodb`, etc. (implemented sequentially).
- **option**: Driver-specific connection settings. Supports environment variables using the `${ENV_VAR}` format.
