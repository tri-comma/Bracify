const { JSDOM } = require('jsdom');
const AttApp = require('../lib/engine.cjs');
const { Engine } = AttApp;

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

    return '<!DOCTYPE html>' + document.documentElement.outerHTML;
}

module.exports = { processHTML };
