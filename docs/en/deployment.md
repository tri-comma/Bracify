# Deployment and Development Flow

[← Documentation index](./README.md) | Language: [日本語](../ja/deployment.md) | **English**

## Deployment

There are two ways to publish a Bracify site. There is no service-specific support (Vercel, Netlify, etc.) and no Zip export.

- **Publish as a static site (CLI build)**: `node cli/index.js <input-dir> <output-dir>` (or the `bracify` command, once the `cli` package is installed) writes static HTML with `data-t-include` resolved into the output folder. Folders and files starting with `_` (`_parts`, `_sys`) are not emitted, and `bracify.js` is placed at the top of the output folder so the result also works over `file://`. The output is static and read-only: the Data API (`/_sys/data/*.json`) is not part of it, so forms cannot save data. `data-t-source` data is bound at build time only when a `mock-data.json` exists at the top of the input folder. Any host that can serve static files can publish it.
- **Publish as a server (server mode)**: start the server with `node engine/start.cjs <project-path> [port]`. Data is stored in SQLite (`_sys/data.db`), so you need a host that runs Node.js and keeps files on disk. Serverless platforms with an ephemeral file system do not fit.

**Known limitations**:

- A one-step deployment feature is planned in [#105](https://github.com/tri-comma/Bracify/issues/105).
- The Data API has no authentication. Anyone who can reach a public server can create, update and delete data (the only protection today is the [cross-origin protection](security.md#security), which is not authentication; being considered in [#106](https://github.com/tri-comma/Bracify/issues/106)). Keep this in mind before exposing a server.

## Development Flow

There is no downloadable installer yet. You start Studio from the repository.

1. Install Node.js, get the repository, and run `npm install` at the root (this sets up Electron for Studio and the native SQLite module).
2. Run `npm start` at the root to launch Studio (the Launcher).
3. In the Launcher, select a working folder, start the server, and open the Admin Dashboard.
4. Edit `index.html`, `_parts/header.html`, etc. When you save, the server detects the change and reflects it.
5. To publish, either build statically with the CLI or run server mode on a host that runs Node.js, as described under "Deployment" above.

The only terminal work needed to use Studio is the launch in steps 1 and 2. Building the site after that needs neither a terminal nor configuration files. When Studio starts a project's server, it uses Studio's own runtime (Electron), so running a project does not require a separate Node.js. The CLI (static build) is optional and needs Node.js.
