const { JSDOM } = require('jsdom');
const Bracify = require('../lib/engine.cjs');
const { Engine } = Bracify;

/**
 * Server-side wrapper to process HTML string using JSDOM.
 * @param {string} html - Raw HTML string
 * @param {Object} data - Data object
 * @param {Function} includeResolver - Async function to resolve includes
 * @returns {Promise<string>} Processed HTML string
 */
async function processHTML(html, data, includeResolver, dataFetcher, logger) {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const engine = new Engine({ includeResolver, dataFetcher, logger });

    // Process the entire document (to catch items in <head> like data-t-source)
    await engine.processElement(document.documentElement, data, { stripAttributes: true });

    // Optimization: Remove CSR fallback scripts during SSR
    // Since we inject window.__BRACIFY_DATA__, the static scripts like _sys/data/xxx.js are not needed.
    const sources = new Set();
    document.querySelectorAll('link[data-t-source]').forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            const entity = href.split('?')[0].split('/').pop().replace('.json', '');
            sources.add(entity);
        }
    });

    document.querySelectorAll('script').forEach(script => {
        const src = script.getAttribute('src');
        if (src && src.includes('_sys/data/')) {
            const scriptEntity = src.split('?')[0].split('/').pop().replace('.js', '');
            if (sources.has(scriptEntity)) {
                script.remove();
            }
        }
    });

    return '<!DOCTYPE html>' + document.documentElement.outerHTML;
}

module.exports = { processHTML };
