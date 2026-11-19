// Offline structuring: turns raw OCR / typed text into Unit > Chapter > Topic.
// Pure rules, no network. Works on "Unit 1", "Chapter 2", "1.2 Topic", "# Heading", ALL CAPS and bullet lists.
import { sanitizeOutline } from './schema.js';

// OCR often turns "UNIT – III" into "UNIT -II1" or "Unit Il", so the numeral is read loosely and checked later.
const UNIT_RE = /^(unit|module|part|section)\s*[-:.–—]?\s*(\d+|[ivxlc1|]+)\b\s*[:.\-–—]?\s*(.*)$/i;
const CHAPTER_RE = /^(chapter|ch|lesson)\.?\s*[-:.–—]?\s*(\d+|[ivxlc]+)\b\s*[:.\-–—]?\s*(.*)$/i;
const NUM_RE = /^(\d{1,3}(?:\.\d{1,3}){0,3})([.)]?)\s+(\S.*)$/;
// OCR reads a round bullet as e, o, ©, ¢, ® or similar, so a lone mark followed by a capital also counts.
const BULLET_RE = /^(?:[-•*·▪●○◦►➤✓]|[eoO©¢®»](?=\s+[A-Z(]))\s*(\S.*)$/;
// Sections of a syllabus that are not study topics: skipped until the next unit or chapter heading.
const SKIP_RE = /^(learning\s+(objectives?|outcomes?)|(essential|recommended|suggested|additional)\b.*\b(readings?|references?)|references?\b|bibliography|examination\s+scheme|practical\s+component|note\s*:)/i;
const WEEKS_RE = /\(\s*\d+\s*weeks?\s*\)/gi;
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const MD_RE = /^(#{1,3})\s+(\S.*)$/;

const cap = w => w[0].toUpperCase() + w.slice(1).toLowerCase();
const tidy = s =>
  s.replace(WEEKS_RE, '').replace(/[.\s·…_-]{3,}\d*\s*$/, '').replace(/\s*[:–—-]\s*$/, '').trim();

function isCaps(l) {
  const letters = l.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4 || l.length > 70 || /[.!?]$/.test(l)) return false;
  return letters.replace(/[^A-Z]/g, '').length / letters.length >= 0.85;
}

// A long heading such as "Unit 1 - Matrix Algebra: Echelon form, Rank, Determinant…" is a title plus its topics.
function unitToken(m) {
  let text = tidy(m[3] || ''), rest = '';
  if (text.length > 70 && (text.match(/,/g) || []).length >= 2) {
    const cut = text.search(/[:;]\s/) > 0 ? text.search(/[:;]\s/) : text.indexOf(',');
    if (cut > 3) { rest = text.slice(cut + 1).trim(); text = text.slice(0, cut).trim(); }
  }
  return { type: 'unit', word: cap(m[1]), num: m[2], text, rest };
}

function classify(l) {
  let m;
  if (l.length > 110 && !((m = UNIT_RE.exec(l)) && l.length <= 240)) return { type: 'text', text: l };
  if ((m = MD_RE.exec(l))) return { type: 'md', level: m[1].length, text: tidy(m[2]) };
  if ((m = UNIT_RE.exec(l))) return unitToken(m);
  if ((m = CHAPTER_RE.exec(l))) return { type: 'chapter', text: `${m[1].toLowerCase() === 'ch' ? 'Chapter' : cap(m[1])} ${m[2].toUpperCase()}${m[3] ? ': ' + tidy(m[3]) : ''}` };
  if ((m = NUM_RE.exec(l))) {
    const depth = m[1].split('.').length;
    const text = m[3];
    const ok = depth > 1 || m[2] || /^[A-Z]/.test(text);
    if (ok && text.length <= 100) return { type: 'num', depth, text: tidy(text) };
  }
  if ((m = BULLET_RE.exec(l)) && m[1].length <= 90) return { type: 'bullet', text: tidy(m[1]) };
  if (SKIP_RE.test(l)) return { type: 'skip', text: l };
  if (isCaps(l)) return { type: 'caps', text: tidy(l) };
  return { type: 'text', text: l };
}

// "Unit I", "UNIT-1", and OCR slips such as "Il" or "II1" (which become the next number in sequence).
function unitTitle(t, next) {
  const n = String(t.num);
  let label;
  if (/^\d+$/.test(n)) label = n;
  else if (ROMAN[n.toLowerCase()]) label = n.toUpperCase();
  else label = String(next);
  return `${t.word} ${label}${t.text ? ': ' + t.text : ''}`;
}

export function estimateMinutes(notes) {
  const words = (notes.match(/\S+/g) || []).length;
  return Math.min(90, Math.max(15, Math.round((20 + words / 8) / 5) * 5));
}

// A line ending in "and", "of", a comma, etc. continues on the next line (typical of wrapped headings).
const OPEN_END = /(\b(and|of|the|in|for|to|on|with|or)|[,&])$/i;
function joinWrapped(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    while (OPEN_END.test(l) && i + 1 < lines.length) {
      const nxt = classify(lines[i + 1]);
      if (['unit', 'chapter', 'md', 'num', 'bullet', 'skip'].includes(nxt.type)) break;
      l = `${l} ${lines[++i]}`;
    }
    out.push(l);
  }
  return out;
}

// A unit written as running text ("Echelon form, Rank, Determinant…") becomes one topic per phrase.
function splitTopics(text, fallback) {
  const parts = text.split(/\s*(?:[,;]|:\s|\s[-–—]\s)\s*/).map(p => tidy(p)).filter(p => p.length >= 3 && !/^(ch(apter)?[-\s]?\d|reference|table of content|section\s*\d)/i.test(p));
  const seen = new Set();
  const uniq = parts.filter(p => (seen.has(p.toLowerCase()) ? false : seen.add(p.toLowerCase())));
  const list = (uniq.length ? uniq : [fallback]).slice(0, 30);
  return list.map(t => ({ title: t.slice(0, 110), notes: '', minutes: 30 }));
}

export function structure(text, { title = 'Material' } = {}) {
  const raw = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => (l.match(/[\p{L}\p{N}]/gu) || []).length >= 2)
    .filter(l => !/^\(?\s*\d+\s*weeks?\s*\)?$/i.test(l) && !/^syllabus(\s+of\b.*)?$/i.test(l));
  const lines = joinWrapped(raw);
  const toks = lines.map(classify);

  const hasChapter = toks.some(t => t.type === 'chapter' || (t.type === 'md' && t.level === 2));
  const hasDotted = toks.some(t => t.type === 'num' && t.depth > 1);
  const hasCaps = toks.some(t => t.type === 'caps');
  const hasUnit = toks.some(t => t.type === 'unit');

  const level = t => {
    if (t.type === 'unit') return 1;
    if (t.type === 'chapter') return 2;
    if (t.type === 'md') return t.level;
    if (t.type === 'caps') return hasChapter ? 3 : 2;
    if (t.type === 'num') return hasDotted && !hasChapter && !hasCaps && t.depth === 1 ? 2 : 3;
    return 0;
  };
  // bullets are topics only when nothing else in the document is at topic level
  const firstUnit = toks.findIndex(t => t.type === 'unit');
  const has3 = toks.slice(Math.max(0, firstUnit)).some(t => level(t) === 3); // page furniture above the first unit does not count

  const units = [];
  const pre = [];
  let unitNo = 0;
  let u = null, c = null, tp = null;
  const ensureUnit = () => { if (!u) { u = { title, chapters: [], loose: [] }; units.push(u); } };
  const ensureChapter = () => { ensureUnit(); if (!c) { c = { title: 'General', topics: [], notes: [] }; u.chapters.push(c); } };

  let skipping = false;
  for (const t of toks) {
    if (t.type === 'skip') { skipping = true; continue; }
    const heading = t.type === 'unit' || t.type === 'chapter' || t.type === 'md';
    if (heading) skipping = false;
    if (skipping) continue;
    const lv = t.type === 'bullet' ? (has3 ? 0 : 3) : level(t);
    if (lv === 1) { u = { title: unitTitle(t, ++unitNo), chapters: [], loose: t.rest ? [t.rest] : [] }; units.push(u); c = null; tp = null; }
    else if (lv === 2) { ensureUnit(); c = { title: t.text, topics: [], notes: [] }; u.chapters.push(c); tp = null; }
    else if (lv === 3 && !u && hasUnit) pre.push(t.text); // loose bullets above the first unit heading (aims, outcomes)
    else if (lv === 3) { ensureChapter(); tp = { title: t.text, notes: [] }; c.topics.push(tp); }
    else if (tp) tp.notes.push(t.text);
    else if (c) c.notes.push(t.text);
    else if (u) u.loose.push(t.text);
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
    if (!chapters.length) chapters.push({ title: 'General', topics: un.loose.length ? splitTopics(un.loose.join(' '), un.title) : [{ title: un.title.replace(/^[^:]*:\s*/, '') || un.title, notes: '', minutes: 30 }] }); // never drop a unit
    if (chapters.length) out.push({ title: un.title, chapters });
  }
  if (!out.length) {
    const notes = (pre.length ? pre : lines).join('\n');
    out.push({ title, chapters: [{ title: 'General', topics: [{ title, notes, minutes: estimateMinutes(notes) }] }] });
  }
  return sanitizeOutline(out);
}
