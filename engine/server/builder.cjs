const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const AttApp = require('../lib/engine.cjs');
const { Engine } = AttApp;

class Builder {
    constructor(logger = console.log) {
        this.logger = logger;
    }

    async build(projectPath, distPath) {
        if (!fs.existsSync(projectPath)) throw new Error(`Project path does not exist: ${projectPath}`);

        // 1. Clean Dist
        this.logger('Cleaning dist...');
        if (fs.existsSync(distPath)) {
            fs.rmSync(distPath, { recursive: true, force: true });
        }
        fs.mkdirSync(distPath, { recursive: true });

        // 2. Copy Assets (Recursive)
        this.logger('Copying assets...');
        this.copyRecursive(projectPath, distPath, (name, isDir) => {
            if (name.startsWith('_') && name !== '_sys') return false; // Ignore _* except _sys
            if (name === 'node_modules' || name === '.git' || name === '.DS_Store') return false;
            if (isDir && name === '_sys') return true; // Enter _sys to process data later
            return true;
        });

        // 3. Copy Engine Runtime
        this.logger('Copying engine runtime...');
        this.copyEngine(distPath);

        // 4. Process HTML & Convert Data
        this.logger('Processing files...');
        await this.processRecursive(projectPath, distPath, distPath); // Pass distRoot for relative path calc

        this.logger('Build complete.');
    }

    copyRecursive(src, dest, filter) {
        const items = fs.readdirSync(src);
        for (const item of items) {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            const stats = fs.statSync(srcPath);
            const isDir = stats.isDirectory();

            if (!filter(item, isDir)) continue;

            if (isDir) {
                // Special handling for _sys
                if (item === '_sys') {
                    fs.mkdirSync(destPath, { recursive: true });
                    // Recurse to convert data later (handled in processRecursive), 
                    // BUT copyRecursive here typically copies content.
                    // We only want to create the structure for _sys but not copy files unless filtered.
                    this.copyRecursive(srcPath, destPath, (n, d) => {
                        // Inside _sys, we only enter dirs or copy non-data files?
                        // Actually, our rule is simple: ignore _sys contents in COPY phase, handle in PROCESS phase.
                        // But wait, the filter passed to this recursive call is the same top-level filter?
                        // No, we need logic.
                        // Let's just create the dir and NOT copy children here. 
                        // The 'data' folder will be created by convertData or manually?
                        // Currently processRecursive creates directories as it goes.
                        // So we can skip content copying for _sys here.
                        return false;
                    });
                } else {
                    if (!fs.existsSync(destPath)) fs.mkdirSync(destPath);
                    this.copyRecursive(srcPath, destPath, filter);
                }
            } else {
                // File
                if (item.endsWith('.html')) continue;
                if (srcPath.includes('/_sys/data/') && item.endsWith('.json')) continue;
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    copyEngine(distPath) {
        try {
            const engineSrc = path.join(__dirname, '../lib/engine.cjs');
            const sysDir = path.join(distPath, '_sys');
            if (!fs.existsSync(sysDir)) fs.mkdirSync(sysDir, { recursive: true });

            const engineDest = path.join(sysDir, 'engine.js');
            fs.copyFileSync(engineSrc, engineDest);
        } catch (e) {
            this.logger(`Error copying engine: ${e.message}`);
        }
    }

    async processRecursive(srcRoot, distRoot, realDistRoot, currentSub = '') {
        const srcDir = path.join(srcRoot, currentSub);
        const distDir = path.join(distRoot, currentSub);

        if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

        const items = fs.readdirSync(srcDir);
        for (const item of items) {
            const srcPath = path.join(srcDir, item);
            const stats = fs.statSync(srcPath);

            if (stats.isDirectory()) {
                if (item.startsWith('_') && item !== '_sys') continue;
                await this.processRecursive(srcRoot, distRoot, realDistRoot, path.join(currentSub, item));
            } else {
                if (item.endsWith('.html')) {
                    const destPath = path.join(distDir, item);
                    await this.processHTML(srcPath, destPath, srcRoot, realDistRoot);
                } else if (item.endsWith('.json') && currentSub.includes('_sys/data')) {
                    const destPath = path.join(distDir, item.replace('.json', '.js'));
                    this.convertData(srcPath, destPath, item.replace('.json', ''));
                }
            }
        }
    }

    convertData(srcPath, destPath, name) {
        try {
            const content = fs.readFileSync(srcPath, 'utf-8');
            JSON.parse(content);
            // Safe IIFE to ensure data is loaded even if Bracify isn't ready yet
            const jsContent = `(function(){
    const data = ${content};
    if (typeof window !== 'undefined') {
        if (!window.__BRACIFY_DATA__) window.__BRACIFY_DATA__ = {};
        window.__BRACIFY_DATA__['${name}'] = data;
        if (typeof Bracify !== 'undefined' && Bracify.mock) {
            Bracify.mock('${name}', data);
        }
    }
})();`;
            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(destPath, jsContent);
            this.logger(`Converted data: ${name}`);
        } catch (e) {
            this.logger(`Error converting data ${srcPath}: ${e.message}`);
        }
    }

    async processHTML(srcPath, destPath, projectRoot, distRoot) {
        try {
            const html = fs.readFileSync(srcPath, 'utf-8');
            const dom = new JSDOM(html);
            const document = dom.window.document;

            const includeResolver = async (includePath) => {
                const fullPath = path.join(projectRoot, includePath);
                if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath, 'utf-8');
                return null;
            };

            const dataFetcher = async () => ({});

            const engine = new Engine({ includeResolver, dataFetcher });

            await engine.processElement(document.documentElement, {}, {
                processIncludes: true,
                processBindings: false,
                stripAttributes: false
            });

            // 1. Relativize all paths and Inject Data Mock Scripts
            const currentDir = path.dirname(destPath);
            const processedEntities = new Set();

            // Process Scripts
            document.querySelectorAll('script').forEach(script => {
                const src = script.getAttribute('src');
                if (!src) return;

                // Relativize engine script
                if (src.endsWith('engine.cjs') || src.endsWith('engine.js')) {
                    const targetEnginePath = path.join(distRoot, '_sys', 'engine.js');
                    script.setAttribute('src', path.relative(currentDir, targetEnginePath));
                }
                // Relativize other root-relative scripts
                else if (src.startsWith('/')) {
                    const targetPath = path.join(distRoot, src);
                    script.setAttribute('src', path.relative(currentDir, targetPath));
                }
            });

            // Process Data Links
            document.querySelectorAll('link[data-t-source]').forEach(link => {
                const href = link.getAttribute('href');
                const name = link.getAttribute('data-t-source');
                if (!href) return;

                // Relativize the link href itself, being careful of templates
                if (href.startsWith('/')) {
                    const qIndex = href.indexOf('?');
                    const basePath = qIndex !== -1 ? href.substring(0, qIndex) : href;
                    const query = qIndex !== -1 ? href.substring(qIndex + 1) : '';

                    const targetPath = path.join(distRoot, basePath);
                    const relBasePath = path.relative(currentDir, targetPath);
                    // Reassemble with original query which may contain {?id}
                    link.setAttribute('href', relBasePath + (query ? '?' + query : ''));
                }

                // Inject mock script for file:// support
                const cleanHref = href.split('?')[0];
                if (cleanHref.includes('_sys/data/') && !processedEntities.has(name)) {
                    const entity = path.basename(cleanHref, '.json');
                    const targetDataPath = path.join(distRoot, '_sys', 'data', entity + '.js');
                    const relDataPath = path.relative(currentDir, targetDataPath);

                    // Check if script already exists to avoid doubling
                    const existing = document.querySelector(`script[src="${relDataPath}"]`);
                    if (!existing) {
                        const script = document.createElement('script');
                        script.setAttribute('src', relDataPath);
                        link.parentNode.insertBefore(script, link.nextSibling);
                        processedEntities.add(name);
                    }
                }
            });

            // Relativize Stylesheets
            document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                const href = link.getAttribute('href');
                if (href && href.startsWith('/')) {
                    const targetPath = path.join(distRoot, href);
                    link.setAttribute('href', path.relative(currentDir, targetPath));
                }
            });

            const output = '<!DOCTYPE html>' + document.documentElement.outerHTML;
            fs.writeFileSync(destPath, output);
            this.logger(`Processed HTML: ${path.basename(srcPath)}`);
        } catch (e) {
            this.logger(`Error processing HTML ${srcPath}: ${e.message}`);
        }
    }
}

module.exports = Builder;
