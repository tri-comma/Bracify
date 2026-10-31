# Settings

[← Documentation](./README.md) | Language: [日本語](../ja/settings.md) | **English**

The settings a Bracify user can change. Under principle 3 of the [concept](./concept.md), every setting the user decides is made in Studio's screens and is saved and published together with the project. Environment variables are a way for engineers to override.

**A feature that adds a setting must add a row to this page.** Settings without a row are not added.

## Settings the user decides

| Setting | Studio screen | Default | Override environment variable | Status |
|---|---|---|---|---|
| Preview server port | Port field on the project screen | First free port from 3000 | None (second argument of `engine/start.cjs`) | Implemented |
| Cap on `_limit` | Not yet (added with the settings mechanism) | 1000 (fetches without `_limit` are not capped) | `BRACIFY_MAX_LIMIT` (`0` removes the cap) | Planned in #54 |
| Admin password | Not yet (planned in #106) | None (protected writes are refused while unset) | To be decided | Planned in #106 |

## Runtime settings (users never touch them)

Values Bracify decides automatically when it sets up a server. Users do not need to set them.

| Setting | Decided by | Status |
|---|---|---|
| Public server port, data location, reverse proxy handling | The publishing mechanism (#105), at setup time | Being designed in #105 |

## Advanced settings

Settings covered by "Features for engineers" in the [concept](./concept.md). Every main feature works without them.

| Setting | How to set | Status |
|---|---|---|
| External database connection | Write directly to the `config` table in `_sys/data.db` ([database settings](./database.md)). There is no Studio screen. Connection options may contain `${ENV_VAR_NAME}` | Implemented |
