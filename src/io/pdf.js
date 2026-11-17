// PDF text extraction. Text PDFs are read directly; scanned pages fall back to OCR.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const MAX_PAGES = 200;

export async function extractPdf(bytes, { ocr, onStatus = () => {} }) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, enableXfa: false, useSystemFonts: false }).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);
  const out = [];
  try {
    for (let n = 1; n <= pages; n++) {
      onStatus(`Reading page ${n} of ${pages}…`);
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      for (const it of content.items) text += (it.str || '') + (it.hasEOL ? '\n' : ' ');
      if (text.replace(/\s/g, '').length < 20 && ocr) {
        onStatus(`Recognising text on page ${n} of ${pages}…`);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
        text = await ocr(canvas);
        canvas.width = canvas.height = 0;
      }
      out.push(text);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out.join('\n\n');
}
