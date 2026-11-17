// Copies the OCR engine, worker and English language data from node_modules into public/ocr,
// so the app never downloads anything at runtime.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = 'public/ocr';
mkdirSync(join(out, 'lang'), { recursive: true });

const must = p => { if (!existsSync(p)) { console.error(`Missing ${p}. Run "npm install" first.`); process.exit(1); } return p; };

cpSync(must('node_modules/tesseract.js/dist/worker.min.js'), join(out, 'worker.min.js'));

const core = must('node_modules/tesseract.js-core');
for (const f of readdirSync(core)) if (/^tesseract-core.*\.(js|wasm)$/.test(f)) cpSync(join(core, f), join(out, f));

function find(dir, name) {
  const hits = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) hits.push(...find(p, name));
    else if (e === name) hits.push(p);
  }
  return hits;
}
const lang = find(must('node_modules/@tesseract.js-data/eng'), 'eng.traineddata.gz');
const pick = lang.find(p => p.includes('best_int')) || lang[0];
if (!pick) { console.error('English language data not found.'); process.exit(1); }
cpSync(pick, join(out, 'lang', 'eng.traineddata.gz'));
console.log('OCR assets ready in', out);
