const EngineServer = require('@bracify/engine/server/index.cjs');
const sqlite3 = require('sqlite3'); // Use Electron-compatible sqlite3

class SystemServer {
    constructor(port, logger) {
        this.engine = new EngineServer(port, logger, { sqlite3 });

        // Compatibility properties for main.js
        this.projectHistory = [];
    }

    setOpenProjectHandler(handler) {
        this.engine.setOpenProjectHandler(handler);
    }

    async setCurrentProjectPath(path) {
        // Delegate to engine
        await this.engine.setCurrentProjectPath(path);
    }

    start() {
        return this.engine.start();
    }

    stop() {
        return this.engine.stop();
    }
}

module.exports = SystemServer;
