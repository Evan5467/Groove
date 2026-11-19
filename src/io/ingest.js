// Upload pipeline: validate -> read (OCR / PDF text) -> structure (offline rules, or AI if opted in).
import { MAX_FILE, sniff } from '../core/files.js';
import { structure } from '../core/parse.js';
import { aiStructure } from '../core/ai.js';
import { UserError, clean, cleanText, uid } from '../core/util.js';
import { ocrImage } from './ocr.js';
import { extractPdf } from './pdf.js';
import { prepareImage } from './image.js';

const toB64 = bytes => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// ai = { apiKey, model, vision } or null. With vision on, photos go to the AI instead of the on-device reader
// (the reader is still the fallback if the AI is unreachable).
export async function ingest({ files, text, title, ai, onStatus }) {
  const stored = [];
  const chunks = [];
  const pics = []; // { name, blob, b64 } kept for the AI or the fallback reader
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
        if (ai?.vision) pics.push({ name, blob: img.blob, b64: toB64(img.bytes) });
        else {
          onStatus(`Recognising text in ${name}…`);
          chunks.push(await ocrImage(img.blob, p => onStatus(`Recognising text in ${name}… ${p}%`)));
        }
        stored.push({ meta: { id: uid(), name, type: 'image/jpeg', size: img.bytes.length }, bytes: img.bytes });
      }
    } catch (e) {
      if (e instanceof UserError) throw e;
      throw new UserError(`Could not read ${name}.`);
    }
  }

  let outline = null;
  let source = files.length ? 'scan' : 'typed';
  if (pics.length) {
    try {
      onStatus('AI is reading your photos…');
      outline = await aiStructure(cleanText(chunks.join('\n\n'), 300000), { ...ai, images: pics.map(p => p.b64) });
      source = 'ai';
    } catch (e) {
      onStatus(`${e instanceof UserError ? e.message : 'AI was unavailable.'} Using the on-device reader instead…`);
      for (const p of pics) chunks.push(await ocrImage(p.blob, n => onStatus(`Recognising text in ${p.name}… ${n}%`)));
    }
  }
  const rawText = cleanText(chunks.join('\n\n'), 300000);
  if (!outline) {
    if (rawText.length < 8) throw new UserError('No readable text found. Try a clearer, well-lit photo, or type it in.');
    if (ai && !pics.length) {
      try {
        onStatus('Structuring with AI…');
        outline = await aiStructure(rawText, ai);
        source = 'ai';
      } catch {
        onStatus('AI was unavailable, so offline structuring was used.');
      }
    }
    if (!outline) outline = structure(rawText, { title });
  }
  return { rawText, outline, files: stored, source };
}
