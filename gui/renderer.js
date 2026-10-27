const portInput = document.getElementById('port-input');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const dashboardArea = document.getElementById('dashboard-area');
const dashboardUrlSpan = document.getElementById('dashboard-url');
const logs = document.getElementById('logs');
const projectPathDisplay = document.getElementById('project-path-display');
const buildStatus = document.getElementById('build-status');

let currentUrl = '';
let selectedProjectPath = null;

function log(msg) {
    const time = new Date().toLocaleTimeString();
    logs.value += `[${time}] ${msg}\n`;
    logs.scrollTop = logs.scrollHeight;
}

window.api.onLog((msg) => log(msg));

window.api.onStatusChange((status) => {
    if (status === 'running') {
        statusDot.classList.add('active');
        statusText.textContent = 'Running';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        portInput.disabled = true;
        dashboardArea.style.display = 'flex';

        currentUrl = `http://localhost:${portInput.value}/`;
        dashboardUrlSpan.textContent = currentUrl;
    } else {
        statusDot.classList.remove('active');
        statusText.textContent = 'Stopped';
        startBtn.disabled = !selectedProjectPath;
        stopBtn.disabled = true;
        portInput.disabled = false;
        dashboardArea.style.display = 'none';

        currentUrl = `http://localhost:${portInput.value}/`;
        dashboardUrlSpan.textContent = currentUrl;
    }
});

// Initialization
async function init() {
    const lastProject = await window.api.getLastProject();
    if (lastProject) {
        setProjectPath(lastProject);
    }
}

function setProjectPath(path) {
    selectedProjectPath = path;
    projectPathDisplay.textContent = path;
    startBtn.disabled = false;
    log(`Project selected: ${path}`);
}

async function selectProject() {
    const result = await window.api.selectProject();
    if (result.path) {
        setProjectPath(result.path);
    } else if (result.error) {
        alert('Error selecting project: ' + result.error);
    }
}

async function startServer() {
    if (!selectedProjectPath) return;

    buildStatus.innerHTML = '<span style="color: blue;">Starting server (auto-build enabled)...</span>';
    startBtn.disabled = true;

    try {
        const port = parseInt(portInput.value, 10);
        const started = await window.api.startSystemServer(port, selectedProjectPath);
        if (!started) {
            buildStatus.innerHTML = '<span style="color: red;">Server Start Failed</span>';
            startBtn.disabled = false;
        } else {
            buildStatus.innerHTML = '<span style="color: green;">Server Running</span>';
        }
    } catch (e) {
        buildStatus.innerHTML = '<span style="color: red;">Error: ' + e.message + '</span>';
        log('Error: ' + e.message);
        startBtn.disabled = false;
    }
}

startBtn.addEventListener('click', startServer);

stopBtn.addEventListener('click', () => {
    window.api.stopSystemServer();
});

window.openLink = () => {
    if (currentUrl) {
        window.api.openDashboard(currentUrl);
    }
};

init();
