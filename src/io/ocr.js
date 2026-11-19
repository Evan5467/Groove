// On-device OCR (Tesseract). Engine, worker and English data are bundled into the app
// (scripts/copy-ocr-assets.mjs), so nothing is downloaded and no image leaves the phone.
import { createWorker } from 'tesseract.js';
import { UserError } from '../core/util.js';

let worker = null;
let starting = null;
let onProg = () => {};

const base = () => new URL('ocr/', document.baseURI).href;
const START_MS = 60000;
const READ_MS = 180000;

const withTimeout = (p, ms, onTimeout) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { onTimeout?.(); reject(new Error('timeout')); }, ms);
  p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
});

async function get() {
  if (worker) return worker;
  if (!starting) {
    starting = withTimeout(createWorker('eng', 1, {
      workerPath: base() + 'worker.min.js',
      corePath: base(),
      langPath: base() + 'lang',
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true,
      logger: m => { if (m?.status === 'recognizing text') onProg(Math.round((m.progress || 0) * 100)); }
    }), START_MS, () => { starting = null; })
      .then(w => { worker = w; return w; })
      .finally(() => { starting = null; });
  }
  return starting;
}

// Failures are reported by stage so a phone that cannot run OCR says so plainly instead of doing nothing.
export async function ocrImage(source, onProgress = () => {}) {
  onProg = onProgress;
  let w;
  try { w = await get(); }
  catch { throw new UserError('The text reader could not start on this phone. Turn on “Let AI read the photos” in Settings, or type the text in.'); }
  try {
    const { data } = await withTimeout(w.recognize(source), READ_MS, () => { stopOcr().catch(() => {}); });
    return String(data?.text || '');
  } catch {
    await stopOcr().catch(() => {});
    throw new UserError('Reading that picture took too long or failed. Try a sharper photo, or type the text in.');
  }
}

export async function stopOcr() {
  const w = worker;
  worker = null;
  starting = null;
  if (w) await w.terminate();
}
