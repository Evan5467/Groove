// Browser smoke test: builds tests/e2e/smoke-entry.js with the app's own CSP and runs it in headless Chrome.
// Proves that on-device OCR, PDF reading and the parser work end to end, which unit tests in Node cannot.
// Needs `playwright-core` (installed on the fly in CI) and a Chrome/Chromium.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright-core';

const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(readFileSync('index.html', 'utf8'))?.[1];
if (!csp) throw new Error('CSP not found in index.html');
writeFileSync('smoke.html', `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>smoke</title></head><body><script type="module" src="./tests/e2e/smoke-entry.js"></script></body></html>`);

try {
  await build({ configFile: 'vite.smoke.config.js', logLevel: 'warn' });
} finally { rmSync('smoke.html', { force: true }); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.json': 'application/json', '.woff2': 'font/woff2' };
const root = 'dist-smoke';
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, p === '/' ? 'smoke.html' : p);
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;

let browser;
try { browser = await chromium.launch({ channel: 'chrome' }); } catch { browser = await chromium.launch(); }
const page = await browser.newPage();
const problems = [];
page.on('pageerror', e => problems.push('pageerror: ' + e.message));
page.on('console', m => { if (['error', 'warning'].includes(m.type())) problems.push(`console.${m.type()}: ${m.text()}`); });
page.on('requestfailed', r => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });

await page.goto(`http://localhost:${port}/`);
let timedOut = false;
try { await page.waitForFunction(() => window.__done === true, null, { timeout: 240000 }); } catch { timedOut = true; }
const result = timedOut ? {} : await page.evaluate(() => ({ ...window.__result, violations: window.__violations }));
await browser.close();
server.close();

console.log(JSON.stringify({ ...result, problems }, null, 2));

const fail = [];
if (timedOut) fail.push('timed out waiting for OCR');
if (result.error) fail.push('error: ' + result.error);
if (result.violations?.length) fail.push('CSP violations: ' + result.violations.join('; '));
if (!/matrix/i.test(result.ocrText || '')) fail.push('OCR did not read "Matrix" from the picture');
if (!/vector/i.test(result.ocrText || '')) fail.push('OCR did not read "Vector" from the picture');
if ((result.outline?.length || 0) < 2) fail.push('parser found fewer than 2 units');
if (!/matrix algebra/i.test(result.pdfText || '')) fail.push('PDF text was not read');
if (fail.length) { console.error('SMOKE TEST FAILED:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('Smoke test passed.');
