// Runs inside a real browser under the app's real Content-Security-Policy.
// Draws a picture of syllabus text, then pushes it through the same image, OCR, PDF and parser code the app uses.
import { prepareImage } from '../../src/io/image.js';
import { ocrImage, stopOcr } from '../../src/io/ocr.js';
import { extractPdf } from '../../src/io/pdf.js';
import { structure } from '../../src/core/parse.js';

window.__violations = [];
document.addEventListener('securitypolicyviolation', e => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));

const LINES = ['Unit 1: Matrix Algebra', '1.1 Echelon form of a matrix', '1.2 Rank of a matrix', 'Unit 2: Vector Spaces', '2.1 Basis and dimension', '2.2 Linear independence'];

async function picture() {
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 760;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#111'; x.font = '44px sans-serif';
  LINES.forEach((l, i) => x.fillText(l, 60, 90 + i * 100));
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  return new File([blob], 'syllabus.png', { type: 'image/png' });
}

const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 80>>stream
BT /F1 16 Tf 20 100 Td (Unit 1: Matrix Algebra and Vector Spaces) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`;

(async () => {
  const out = {};
  try {
    const t0 = performance.now();
    const img = await prepareImage(await picture());
    out.imageBytes = img.bytes.length;
    out.ocrText = await ocrImage(img.blob);
    out.ocrMs = Math.round(performance.now() - t0);
    out.outline = structure(out.ocrText, { title: 'Smoke' }).map(u => ({ unit: u.title, topics: u.chapters.flatMap(c => c.topics.map(t => t.title)) }));
    out.pdfText = await extractPdf(new TextEncoder().encode(PDF), { ocr: ocrImage });
    await stopOcr();
  } catch (e) {
    out.error = `${e?.name || 'Error'}: ${e?.message || e}`;
  }
  window.__result = out;
  window.__done = true;
})();
