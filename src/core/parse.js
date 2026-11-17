// Offline structuring: turns raw OCR / typed text into Unit > Chapter > Topic.
// Pure rules, no network. Works on "Unit 1", "Chapter 2", "1.2 Topic", "# Heading", ALL CAPS and bullet lists.
import { sanitizeOutline } from './schema.js';

const UNIT_RE = /^(unit|module|part|section)\s*[-:.]?\s*(\d+|[ivxlc]+)\b\s*[:.\-–—]?\s*(.*)$/i;
const CHAPTER_RE = /^(chapter|ch|lesson)\.?\s*[-:.]?\s*(\d+|[ivxlc]+)\b\s*[:.\-–—]?\s*(.*)$/i;
const NUM_RE = /^(\d{1,3}(?:\.\d{1,3}){0,3})([.)]?)\s+(\S.*)$/;
const BULLET_RE = /^[-•*·▪●○◦►➤✓]\s*(\S.*)$/;
const MD_RE = /^(#{1,3})\s+(\S.*)$/;

const cap = w => w[0].toUpperCase() + w.slice(1).toLowerCase();
const tidy = s =>
  s.replace(/[.\s·…_-]{3,}\d*\s*$/, '').replace(/\s*[:–—-]\s*$/, '').trim();

function isCaps(l) {
  const letters = l.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4 || l.length > 70 || /[.!?]$/.test(l)) return false;
  return letters.replace(/[^A-Z]/g, '').length / letters.length >= 0.85;
}

function classify(l) {
  if (l.length > 110) return { type: 'text', text: l };
  let m;
  if ((m = MD_RE.exec(l))) return { type: 'md', level: m[1].length, text: tidy(m[2]) };
  if ((m = UNIT_RE.exec(l))) return { type: 'unit', text: `${cap(m[1])} ${m[2].toUpperCase()}${m[3] ? ': ' + tidy(m[3]) : ''}` };
  if ((m = CHAPTER_RE.exec(l))) return { type: 'chapter', text: `${m[1].toLowerCase() === 'ch' ? 'Chapter' : cap(m[1])} ${m[2].toUpperCase()}${m[3] ? ': ' + tidy(m[3]) : ''}` };
  if ((m = NUM_RE.exec(l))) {
    const depth = m[1].split('.').length;
    const text = m[3];
    const ok = depth > 1 || m[2] || /^[A-Z]/.test(text);
    if (ok && text.length <= 100) return { type: 'num', depth, text: tidy(text) };
  }
  if ((m = BULLET_RE.exec(l)) && m[1].length <= 90) return { type: 'bullet', text: tidy(m[1]) };
  if (isCaps(l)) return { type: 'caps', text: tidy(l) };
  return { type: 'text', text: l };
}

export function estimateMinutes(notes) {
  const words = (notes.match(/\S+/g) || []).length;
  return Math.min(90, Math.max(15, Math.round((20 + words / 8) / 5) * 5));
}

export function structure(text, { title = 'Material' } = {}) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => (l.match(/[\p{L}\p{N}]/gu) || []).length >= 2);
  const toks = lines.map(classify);

  const hasChapter = toks.some(t => t.type === 'chapter' || (t.type === 'md' && t.level === 2));
  const hasDotted = toks.some(t => t.type === 'num' && t.depth > 1);
  const hasCaps = toks.some(t => t.type === 'caps');

  const level = t => {
    if (t.type === 'unit') return 1;
    if (t.type === 'chapter') return 2;
    if (t.type === 'md') return t.level;
    if (t.type === 'caps') return hasChapter ? 3 : 2;
    if (t.type === 'num') return hasDotted && !hasChapter && !hasCaps && t.depth === 1 ? 2 : 3;
    return 0;
  };
  // bullets are topics only when nothing else in the document is at topic level
  const has3 = toks.some(t => level(t) === 3);

  const units = [];
  const pre = [];
  let u = null, c = null, tp = null;
  const ensureUnit = () => { if (!u) { u = { title, chapters: [] }; units.push(u); } };
  const ensureChapter = () => { ensureUnit(); if (!c) { c = { title: 'General', topics: [], notes: [] }; u.chapters.push(c); } };

  for (const t of toks) {
    const lv = t.type === 'bullet' ? (has3 ? 0 : 3) : level(t);
    if (lv === 1) { u = { title: t.text, chapters: [] }; units.push(u); c = null; tp = null; }
    else if (lv === 2) { ensureUnit(); c = { title: t.text, topics: [], notes: [] }; u.chapters.push(c); tp = null; }
    else if (lv === 3) { ensureChapter(); tp = { title: t.text, notes: [] }; c.topics.push(tp); }
    else if (tp) tp.notes.push(t.text);
    else if (c) c.notes.push(t.text);
    else pre.push(t.text);
  }

  const out = [];
  for (const un of units) {
    const chapters = [];
    for (const ch of un.chapters) {
      let topics = ch.topics;
      if (!topics.length) topics = [{ title: ch.title, notes: ch.notes }];
      else if (ch.notes.length) topics[0].notes = [...ch.notes, ...topics[0].notes];
      chapters.push({
        title: ch.title,
        topics: topics.map(x => { const notes = x.notes.join('\n'); return { title: x.title, notes, minutes: estimateMinutes(notes) }; })
      });
    }
    if (chapters.length) out.push({ title: un.title, chapters });
  }
  if (!out.length) {
    const notes = (pre.length ? pre : lines).join('\n');
    out.push({ title, chapters: [{ title: 'General', topics: [{ title, notes, minutes: estimateMinutes(notes) }] }] });
  }
  return sanitizeOutline(out);
}
