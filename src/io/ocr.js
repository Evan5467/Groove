// On-device OCR (Tesseract). Engine, worker and English data are bundled into the app
// (scripts/copy-ocr-assets.mjs), so nothing is downloaded and no image leaves the phone.
import { createWorker } from 'tesseract.js';

let worker = null;
let onProg = () => {};

const base = () => new URL('ocr/', document.baseURI).href;

async function get() {
  if (!worker) {
    worker = await createWorker('eng', 1, {
      workerPath: base() + 'worker.min.js',
      corePath: base(),
      langPath: base() + 'lang',
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true,
      logger: m => { if (m?.status === 'recognizing text') onProg(Math.round((m.progress || 0) * 100)); }
    });
  }
  return worker;
}

export async function ocrImage(source, onProgress = () => {}) {
  onProg = onProgress;
  const w = await get();
  const { data } = await w.recognize(source);
  return String(data?.text || '');
}

export async function stopOcr() {
  if (worker) { await worker.terminate(); worker = null; }
}
