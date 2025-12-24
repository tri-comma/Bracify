const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const SystemServer = require('./server');
const Builder = require('@bracify/engine/server/builder.cjs');

let mainWindow;
let systemServer = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
// IPC Handlers
ipcMain.handle('get-last-project', () => {
    const historyFile = path.join(app.getPath('userData'), 'history.json');
    try {
        if (fs.existsSync(historyFile)) {
            const history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
            return history[0] || null;
        }
    } catch (e) {
        console.error('Failed to load history:', e);
    }
    return null;
});

ipcMain.handle('select-project', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { canceled: true };
        }
        const projectPath = result.filePaths[0];

        // Save to history
        const historyFile = path.join(app.getPath('userData'), 'history.json');
        let projectHistory = [];
        try {
            if (fs.existsSync(historyFile)) {
                projectHistory = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
            }
        } catch (e) { }

        // Remove existing
        projectHistory = projectHistory.filter(p => p !== projectPath);
        // Add to top
        projectHistory.unshift(projectPath);
        // Limit to 10
        projectHistory = projectHistory.slice(0, 10);

        fs.writeFileSync(historyFile, JSON.stringify(projectHistory, null, 2));

        return { path: projectPath };
    } catch (e) {
        return { error: e.message };
    }
});

ipcMain.handle('start-system-server', async (event, port, projectPath) => {
    if (systemServer) return false;

    const logger = (msg) => {
        if (mainWindow) mainWindow.webContents.send('server-log', msg);
    };

    try {
        systemServer = new SystemServer(port, logger);

        if (projectPath) {
            await systemServer.setCurrentProjectPath(projectPath);
        }

        // Set Open Project Handler for Server (keep for dynamic change while running)
        systemServer.setOpenProjectHandler(async (req, res) => {
            let pPath = req.body && req.body.path;

            if (!pPath) {
                try {
                    const result = await dialog.showOpenDialog(mainWindow, {
                        properties: ['openDirectory']
                    });
                    if (result.canceled || result.filePaths.length === 0) {
                        return res.json({ canceled: true });
                    }
                    pPath = result.filePaths[0];
                } catch (e) {
                    return res.status(500).json({ error: e.message });
                }
            }

            await systemServer.setCurrentProjectPath(pPath);

            // Still update history if opened via server API
            const historyFile = path.join(app.getPath('userData'), 'history.json');
            let projectHistory = [];
            try {
                if (fs.existsSync(historyFile)) {
                    projectHistory = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
                }
            } catch (e) { }
            projectHistory = projectHistory.filter(p => p !== pPath);
            projectHistory.unshift(pPath);
            projectHistory = projectHistory.slice(0, 10);
            fs.writeFileSync(historyFile, JSON.stringify(projectHistory, null, 2));

            res.json({ path: pPath });
        });


        await systemServer.start();
        mainWindow.webContents.send('server-status', 'running');
        return true;
    } catch (e) {
        logger(`Error starting server: ${e.message}`);
        return false;
    }
});

ipcMain.handle('stop-system-server', () => {
    if (systemServer) {
        systemServer.stop();
        systemServer = null;
        if (mainWindow) mainWindow.webContents.send('server-status', 'stopped');
    }
    return true;
});

ipcMain.handle('open-dashboard', (event, url) => {
    shell.openExternal(url);
    return true;
});

ipcMain.handle('build-project', async (event, projectPath) => {
    try {
        const pPath = projectPath || (systemServer && systemServer.engine ? systemServer.engine.currentProjectPath : null);
        if (!pPath) throw new Error('No project opened.');

        const distPath = path.join(pPath, '_dist');
        const logger = (msg) => {
            console.log(msg);
            if (mainWindow) mainWindow.webContents.send('server-log', msg);
        };

        const builder = new Builder(logger);
        await builder.build(projectPath, distPath);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});
