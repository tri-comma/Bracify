import { test, describe } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const rendererPath = require.resolve('../server/renderer.cjs');
const Renderer = require(rendererPath);

describe('Diagnostic: Checking SSR Output of project.html', () => {
    test('SSR output should have values but NO attributes', async () => {
        const projectHtml = fs.readFileSync('../studio/project.html', 'utf8');
        const layoutHtml = fs.readFileSync('../studio/_parts/layout.html', 'utf8');

        const mockData = {
            project: { id: 'mjtkgoaslxxc', name: 'Bracify Studio', port: 3000 }
        };

        const ssrHtml = await Renderer.processHTML(
            projectHtml,
            { _sys: { query: { id: 'mjtkgoaslxxc' } } },
            async () => layoutHtml,
            async () => mockData.project
        );

        console.log('--- SSR OUTPUT START ---');
        console.log(ssrHtml);
        console.log('--- SSR OUTPUT END ---');

        assert.match(ssrHtml, /value="Bracify Studio"/);
        assert.match(ssrHtml, /value="3000"/);
        assert.doesNotMatch(ssrHtml, /data-t-scope/);
    });
});
