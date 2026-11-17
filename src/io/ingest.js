// Upload pipeline: validate -> read (OCR / PDF text) -> structure (offline rules, or AI if opted in).
import { MAX_FILE, sniff } from '../core/files.js';
import { structure } from '../core/parse.js';
import { aiStructure } from '../core/ai.js';
import { UserError, clean, cleanText, uid } from '../core/util.js';
import { ocrImage } from './ocr.js';
import { extractPdf } from './pdf.js';
import { prepareImage } from './image.js';

export async function ingest({ files, text, title, ai, onStatus }) {
  const stored = [];
  const chunks = [];
  const typed = cleanText(text, 200000);
  if (typed) chunks.push(typed);

  let n = 0;
  for (const file of files) {
    n++;
    onStatus(`File ${n} of ${files.length}…`);
    if (file.size > MAX_FILE) throw new UserError('That file is over 25 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) throw new UserError('Only PDF, JPG, PNG or WebP files are supported.');
    const name = clean(file.name, 80) || 'file';
    try {
      if (kind === 'pdf') {
        chunks.push(await extractPdf(bytes, { ocr: ocrImage, onStatus }));
        stored.push({ meta: { id: uid(), name, type: 'application/pdf', size: bytes.length }, bytes });
      } else {
        const img = await prepareImage(file);
        onStatus(`Recognising text in ${name}…`);
        chunks.push(await ocrImage(img.blob, p => onStatus(`Recognising text in ${name}… ${p}%`)));
        stored.push({ meta: { id: uid(), name, type: 'image/jpeg', size: img.bytes.length }, bytes: img.bytes });
      }
    } catch (e) {
      if (e instanceof UserError) throw e;
      throw new UserError(`Could not read ${name}.`);
    }
  }

  const rawText = cleanText(chunks.join('\n\n'), 300000);
  if (rawText.length < 8) throw new UserError('No readable text found. Try a clearer, well-lit photo, or type it in.');

  let outline = null;
  let source = files.length ? 'scan' : 'typed';
  if (ai) {
    try {
      onStatus('Structuring with AI…');
      outline = await aiStructure(rawText, ai);
      source = 'ai';
    } catch {
      onStatus('AI was unavailable, so offline structuring was used.');
    }
  }
  if (!outline) outline = structure(rawText, { title });
  return { rawText, outline, files: stored, source };
}
