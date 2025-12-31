import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Renderer = require('../../server/renderer.cjs');

describe('Renderer Cleanup Logic', () => {
    test('Should KEEP link[data-t-source] during SSR for CSR hydration', async () => {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <link data-t-source="project" href="project.json">
            </head>
            <body>
                <h1 data-t-scope="project">{name}</h1>
            </body>
            </html>
        `;

        const mockData = { project: { name: 'Test' } };
        const includeResolver = async () => null;
        const dataFetcher = async () => mockData.project;

        const renderedHtml = await Renderer.processHTML(html, mockData, includeResolver, dataFetcher);

        // Assertions
        assert.match(renderedHtml, /Test/, 'Should have rendered name');
        assert.match(renderedHtml, /data-t-source="project"/, 'Should KEEP data-t-source for client-side hydration');
        assert.match(renderedHtml, /<link/, 'Should KEEP the link tag');
    });
});
