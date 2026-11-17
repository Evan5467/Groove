// Static guards that mirror the security checklist: they fail the build if someone later adds
// an unsafe pattern. They scan source files, so they run anywhere without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = d => readdirSync(d).flatMap(e => { const p = join(d, e); return statSync(p).isDirectory() ? walk(p) : [p]; });
const src = walk('src').filter(p => /\.(js|css)$/.test(p)).map(p => [p, readFileSync(p, 'utf8')]);
const js = src.filter(([p]) => p.endsWith('.js'));

test('no HTML injection sinks and no dynamic code execution in src', () => {
  const bad = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|dangerouslySetInnerHTML)\b|\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['"`]/;
  // dom.js names these strings only to BLOCK them
  for (const [p, t] of js) assert.ok(!bad.test(t.replace(/^const BLOCKED = .*$/m, '')), `unsafe pattern in ${p}`);
});

test('nothing is logged (no console.* in src)', () => {
  for (const [p, t] of js) assert.ok(!/\bconsole\.\w+/.test(t), `console call in ${p}`);
});

test('no hard-coded secrets or API keys', () => {
  for (const [p, t] of src) {
    assert.ok(!/sk-ant-[A-Za-z0-9_-]{10,}/.test(t), `key-like string in ${p}`);
    assert.ok(!/(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i.test(t), `secret-like assignment in ${p}`);
  }
});

test('no browser storage of sensitive data: localStorage only holds the theme name', () => {
  for (const [p, t] of js) {
    for (const m of t.matchAll(/localStorage\.setItem\(([^)]*)\)/g)) assert.match(m[1], /tempo\.ui/, `unexpected localStorage write in ${p}`);
    assert.ok(!/sessionStorage|document\.cookie/.test(t), `storage use in ${p}`);
  }
});

test('Content-Security-Policy is strict', () => {
  const html = readFileSync('index.html', 'utf8');
  const csp = /Content-Security-Policy"\s*content="([^"]+)"/.exec(html)[1];
  const dir = n => csp.split(';').map(s => s.trim()).find(s => s.startsWith(n + ' ')) || '';
  assert.match(csp, /default-src 'none'/);
  assert.ok(!/'unsafe-(inline|eval)'/.test(dir('script-src'))); // 'wasm-unsafe-eval' (OCR engine) is allowed
  assert.ok(!/'unsafe-inline'/.test(dir('style-src')));
  assert.equal(dir('connect-src'), "connect-src 'self' https://api.anthropic.com");
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'inline script found');
});

test('DOM builder refuses markup-injecting attributes', () => {
  const t = readFileSync('src/dom.js', 'utf8');
  for (const k of ['innerHTML', 'outerHTML', 'srcdoc', 'href', 'src']) assert.ok(t.includes(`'${k}'`), `${k} not blocked`);
});

test('Capacitor config: no debugging, no cleartext, no mixed content', () => {
  const c = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
  assert.equal(c.android.webContentsDebuggingEnabled, false);
  assert.equal(c.android.allowMixedContent, false);
  assert.equal(c.server.cleartext, false);
  assert.equal(c.loggingBehavior, 'none');
});
