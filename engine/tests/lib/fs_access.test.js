import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Bracify = require('../../lib/engine.cjs');

// Mock FileSystemHandle classes
class MockHandle {
    constructor(name, kind) {
        this.name = name;
        this.kind = kind;
    }
}

class MockFileHandle extends MockHandle {
    constructor(name, content) {
        super(name, 'file');
        this.content = content;
    }
    async getFile() {
        return {
            text: async () => this.content
        };
    }
}

class MockDirectoryHandle extends MockHandle {
    constructor(name, children = {}) {
        super(name, 'directory');
        this.children = children;
    }
    async getDirectoryHandle(name) {
        const child = this.children[name];
        if (child && child.kind === 'directory') return child;
        throw new Error('Not found');
    }
    async getFileHandle(name) {
        const child = this.children[name];
        if (child && child.kind === 'file') return child;
        throw new Error('Not found');
    }
}

test('Step 1: File System Access Core Logic', async (t) => {
    const { resolvePathHandle, readFileContent } = Bracify;

    // Setup mock structure
    const root = new MockDirectoryHandle('root', {
        '_sys': new MockDirectoryHandle('_sys', {
            'data': new MockDirectoryHandle('data', {
                'article.json': new MockFileHandle('article.json', '{"title": "Test"}')
            })
        }),
        'parts': new MockDirectoryHandle('parts', {
            'header.html': new MockFileHandle('header.html', '<header>Header</header>')
        }),
        'index.html': new MockFileHandle('index.html', '<html></html>')
    });

    await t.test('should resolve simple file at root', async () => {
        const handle = await resolvePathHandle(root, 'index.html');
        assert.ok(handle, 'Should find handle');
        assert.strictEqual(handle.name, 'index.html');
        assert.strictEqual(handle.kind, 'file');
    });

    await t.test('should resolve nested file path', async () => {
        const handle = await resolvePathHandle(root, '_sys/data/article.json');
        assert.ok(handle, 'Should find handle');
        assert.strictEqual(handle.name, 'article.json');
        assert.strictEqual(handle.kind, 'file');

        const content = await readFileContent(handle);
        assert.strictEqual(content, '{"title": "Test"}');
    });

    await t.test('should resolve directory path', async () => {
        const handle = await resolvePathHandle(root, '_sys/data');
        assert.ok(handle, 'Should find handle');
        assert.strictEqual(handle.name, 'data');
        assert.strictEqual(handle.kind, 'directory');
    });

    await t.test('should handle leading/trailing slashes and double slashes', async () => {
        const handle = await resolvePathHandle(root, '/_sys//data/article.json/');
        assert.ok(handle, 'Should find handle');
        assert.strictEqual(handle.name, 'article.json');
    });

    await t.test('should block path traversal (..)', async () => {
        const handle = await resolvePathHandle(root, '../other/secret.txt');
        assert.strictEqual(handle, null, 'Should block traversal');
    });

    await t.test('should return null for non-existent paths', async () => {
        const handle = await resolvePathHandle(root, 'missing.txt');
        assert.strictEqual(handle, null);

        const handle2 = await resolvePathHandle(root, '_sys/missing/file.json');
        assert.strictEqual(handle2, null);
    });

    await t.test('readFileContent should return null for directory handles', async () => {
        const handle = await resolvePathHandle(root, '_sys/data');
        const content = await readFileContent(handle);
        assert.strictEqual(content, null);
    });
});
