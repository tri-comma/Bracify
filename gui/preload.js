const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    startSystemServer: (port, projectPath) => ipcRenderer.invoke('start-system-server', port, projectPath),
    stopSystemServer: () => ipcRenderer.invoke('stop-system-server'),
    openDashboard: (url) => ipcRenderer.invoke('open-dashboard', url),
    buildProject: (projectPath) => ipcRenderer.invoke('build-project', projectPath),
    getLastProject: () => ipcRenderer.invoke('get-last-project'),
    selectProject: () => ipcRenderer.invoke('select-project'),
    onLog: (callback) => ipcRenderer.on('server-log', (event, message) => callback(message)),
    onStatusChange: (callback) => ipcRenderer.on('server-status', (event, status) => callback(status))
});
