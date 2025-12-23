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
const manualBuildBtn = document.getElementById('manual-build-btn');

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
    manualBuildBtn.disabled = false;
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

async function listData() {
    const listEl = document.getElementById('data-list');
    listEl.innerHTML = '<li>Loading...</li>';
    try {
        const port = portInput.value;
        const res = await fetch(`http://localhost:${port}/_sys/api/data/list`);
        const json = await res.json();

        listEl.innerHTML = '';
        if (json.files && json.files.length > 0) {
            json.files.forEach(f => {
                const li = document.createElement('li');
                li.textContent = f.name || f;
                listEl.appendChild(li);
            });
        } else {
            listEl.innerHTML = '<li>No data found</li>';
        }
        document.getElementById('db-status').textContent = 'OK';
        document.getElementById('db-status').style.color = 'green';
    } catch (e) {
        listEl.innerHTML = `<li>Error: ${e.message}</li>`;
        document.getElementById('db-status').textContent = 'Error';
        document.getElementById('db-status').style.color = 'red';
    }
}

async function createData() {
    const name = document.getElementById('new-data-name').value;
    if (!name) return alert('Name required');

    try {
        const port = portInput.value;
        const res = await fetch(`http://localhost:${port}/_sys/api/data/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                data: { created: new Date(), type: 'test' }
            })
        });
        const json = await res.json();
        if (json.ok) {
            alert('Created!');
            listData();
        } else {
            alert('Error: ' + json.error);
        }
    } catch (e) {
        alert('Fetch Error: ' + e.message);
    }
}

async function buildProject() {
    buildStatus.innerHTML = '<span style="color: blue;">Building... check logs</span>';
    manualBuildBtn.disabled = true;

    try {
        log('Starting manual build...');
        const res = await window.api.buildProject(selectedProjectPath);

        if (res.ok) {
            buildStatus.innerHTML = '<span style="color: green;">Build Success! check _dist</span>';
            log('Build Success!');
        } else {
            buildStatus.innerHTML = '<span style="color: red;">Build Failed</span>';
            log('Build Failed: ' + res.error);
        }
    } catch (e) {
        buildStatus.innerHTML = '<span style="color: red;">Error: ' + e.message + '</span>';
        log('Build Error: ' + e.message);
    } finally {
        manualBuildBtn.disabled = false;
    }
}

init();
