import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const Builder = require('../../server/builder.cjs');
const Renderer = require('../../server/renderer.cjs');

test('Integration: Security Output and Optimization', async (t) => {
    const projectRoot = path.join(__dirname, 'mock_project');
    const distRoot = path.join(projectRoot, '_dist');

    // Setup mock project
    if (fs.existsSync(projectRoot)) fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(path.join(projectRoot, '_sys/data'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'public'), { recursive: true });

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <link data-t-source="valid" href="_sys/data/valid.json">
    <link data-t-source="traversal" href="../_sys/data/secret.json">
    <link data-t-source="invalid" href="_sys/data/invalid;path.json">
</head>
<body>
    <div data-t-list="valid">{valid.name}</div>
</body>
</html>`;

    fs.writeFileSync(path.join(projectRoot, 'index.html'), htmlContent);
    fs.writeFileSync(path.join(projectRoot, '_sys/data/valid.json'), JSON.stringify([{ id: 1, name: 'Test' }]));

    await t.test('CLI Builder: Should NOT inject scripts for invalid/traversal paths', async () => {
        const builder = new Builder(() => { }); // Silence logs
        await builder.build(projectRoot, distRoot);

        const distHtml = fs.readFileSync(path.join(distRoot, 'index.html'), 'utf-8');
        const dom = new JSDOM(distHtml);
        const { document } = dom.window;

        // Check valid script
        const validScript = document.querySelector('script[src*="valid.js"]');
        assert.ok(validScript, 'Valid entity script should be injected');

        // Check traversal script
        const secretScripts = Array.from(document.querySelectorAll('script'))
            .filter(s => s.getAttribute('src')?.includes('secret.js'));
        assert.strictEqual(secretScripts.length, 0, 'Traversal entity script should NOT be injected');

        // Check invalid script
        const invalidScripts = Array.from(document.querySelectorAll('script'))
            .filter(s => s.getAttribute('src')?.includes('invalid'));
        assert.strictEqual(invalidScripts.length, 0, 'Invalid character entity script should NOT be injected');
    });

    await t.test('SSR Renderer: Should block invalid data AND remove redundant CSR scripts', async () => {
        const logger = (msg) => {
            // console.log(msg);
        };

        // Real validation logic from engine/server/index.cjs
        const validHrefPattern = /^\/?_sys\/data\/([a-zA-Z0-9_-]+)\.json(\?.*)?$/;

        const mockDataFetcher = async (href) => {
            if (!validHrefPattern.test(href)) {
                logger(`[Security Test] SSR blocked: ${href}`);
                return null;
            }
            if (href.includes('valid.json')) return [{ id: 1, name: 'SSR Data' }];
            return null;
        };

        const data = { _sys: { query: {}, params: {} } };

        // Use the built HTML which contains valid and invalid links
        const builtHtml = fs.readFileSync(path.join(distRoot, 'index.html'), 'utf-8');

        const processedHtml = await Renderer.processHTML(builtHtml, data, async () => '', mockDataFetcher, logger);

        const dom = new JSDOM(processedHtml);
        const { document } = dom.window;

        // 1. Verify that valid data was processed/bound (check if list rendered)
        const bodyContent = document.body.innerHTML;
        assert.ok(bodyContent.includes('SSR Data'), 'Valid data should be rendered');

        // 2. Verify that invalid data was NOT rendered (traversal check)
        assert.ok(!bodyContent.includes('secret'), 'Traversal data should NOT be rendered');

        // 3. Optimization: Redundant CSR script tag check
        const scriptTags = Array.from(document.querySelectorAll('script'));
        const validScript = scriptTags.find(s => s.getAttribute('src')?.includes('valid.js'));
        assert.strictEqual(validScript, undefined, 'Redundant CSR script tag should be removed');
    });

    // Cleanup
    fs.rmSync(projectRoot, { recursive: true, force: true });
});
