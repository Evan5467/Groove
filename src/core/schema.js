// Everything that comes from outside (OCR, AI, backups, storage) is rebuilt through these
// functions. Unknown fields are dropped, types are forced, sizes are capped.
import { ID_RE, clean, cleanText, int, isISO, uid } from './util.js';

export const THEMES = ['paper', 'midnight', 'matcha', 'dusk'];
export const LAYOUTS = ['timeline', 'cards', 'focus'];
export const LIMITS = { units: 30, chapters: 40, topics: 80, totalTopics: 400 };

export const defaultRemind = () => ({
  enabled: false, dailyTime: '18:00', nudge: true, nudgeTime: '21:00', routineLead: 10,
  showTitles: false, backup: true, backupDays: 7
});

export const defaultSettings = () => ({
  id: 'main', theme: 'paper', layout: 'timeline',
  dailyMinutes: 120, studyDays: [1, 2, 3, 4, 5, 6], examDate: '', revision: true,
  aiEnabled: false, apiKey: '', model: 'claude-haiku-5-5', autoLockSec: 60,
  remind: defaultRemind(), lastBackupAt: 0, createdAt: 0
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function sanitizeRemind(r) {
  const d = defaultRemind();
  r = r && typeof r === 'object' ? r : {};
  return {
    enabled: r.enabled === true,
    dailyTime: HHMM.test(r.dailyTime) ? r.dailyTime : d.dailyTime,
    nudge: r.nudge !== false,
    nudgeTime: HHMM.test(r.nudgeTime) ? r.nudgeTime : d.nudgeTime,
    routineLead: [0, 5, 10, 15, 30].includes(r.routineLead) ? r.routineLead : d.routineLead,
    showTitles: r.showTitles === true,
    backup: r.backup !== false,
    backupDays: [3, 7, 14, 30].includes(r.backupDays) ? r.backupDays : d.backupDays
  };
}

export function sanitizeOutline(raw, { keepIds = false } = {}) {
  const seen = new Set();
  const id = v => {
    let x = keepIds && typeof v === 'string' && ID_RE.test(v) && !seen.has(v) ? v : uid();
    seen.add(x);
    return x;
  };
  const units = Array.isArray(raw?.units) ? raw.units : Array.isArray(raw) ? raw : [];
  const out = [];
  let total = 0;
  for (const u of units.slice(0, LIMITS.units)) {
    const chapters = [];
    for (const c of (Array.isArray(u?.chapters) ? u.chapters : []).slice(0, LIMITS.chapters)) {
      const topics = [];
      for (const t of (Array.isArray(c?.topics) ? c.topics : []).slice(0, LIMITS.topics)) {
        if (total >= LIMITS.totalTopics) break;
        const title = clean(t?.title, 120);
        if (!title) continue;
        topics.push({ id: id(t?.id), title, minutes: int(t?.minutes, 5, 180, 30), notes: cleanText(t?.notes, 4000) });
        total++;
      }
      if (topics.length) chapters.push({ id: id(c?.id), title: clean(c?.title, 120) || 'General', topics });
    }
    if (chapters.length) out.push({ id: id(u?.id), title: clean(u?.title, 120) || 'Untitled unit', chapters });
  }
  return out;
}

export function sanitizeMaterial(m) {
  if (!m || typeof m !== 'object' || !ID_RE.test(m.id)) return null;
  return {
    id: m.id,
    title: clean(m.title, 120) || 'Untitled',
    source: ['scan', 'typed', 'ai'].includes(m.source) ? m.source : 'typed',
    createdAt: int(m.createdAt, 0, 8.64e15, Date.now()),
    examDate: isISO(m.examDate) ? m.examDate : '',
    rawText: cleanText(m.rawText, 300000),
    outline: sanitizeOutline(m.outline, { keepIds: true }),
    files: (Array.isArray(m.files) ? m.files : []).slice(0, 40).map(f =>
      ID_RE.test(f?.id)
        ? { id: f.id, name: clean(f.name, 80) || 'file', type: f.type === 'application/pdf' ? f.type : 'image/jpeg', size: int(f.size, 0, 2 ** 31, 0) }
        : null
    ).filter(Boolean)
  };
}

export function sanitizeTask(t) {
  if (!t || typeof t !== 'object' || !ID_RE.test(t.id) || !isISO(t.date)) return null;
  const title = clean(t.title, 160);
  if (!title) return null;
  return {
    id: t.id, date: t.date, title,
    minutes: int(t.minutes, 0, 600, 30),
    done: t.done === true,
    kind: ['study', 'revise', 'manual'].includes(t.kind) ? t.kind : 'manual',
    materialId: ID_RE.test(t.materialId) ? t.materialId : '',
    topicId: ID_RE.test(t.topicId) ? t.topicId : '',
    sub: clean(t.sub, 120),
    createdAt: int(t.createdAt, 0, 8.64e15, Date.now())
  };
}

export function sanitizeRoutine(r) {
  if (!r || typeof r !== 'object' || !ID_RE.test(r.id)) return null;
  const title = clean(r.title, 160);
  if (!title) return null;
  const days = [...new Set((Array.isArray(r.days) ? r.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))];
  return {
    id: r.id, title,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : '',
    minutes: int(r.minutes, 0, 600, 30),
    days,
    doneDates: (Array.isArray(r.doneDates) ? r.doneDates : []).filter(isISO).slice(-800),
    createdAt: int(r.createdAt, 0, 8.64e15, Date.now())
  };
}

export function sanitizeSettings(s) {
  const d = defaultSettings();
  s = s && typeof s === 'object' ? s : {};
  const days = [...new Set((Array.isArray(s.studyDays) ? s.studyDays : d.studyDays).map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 6))];
  return {
    id: 'main',
    theme: THEMES.includes(s.theme) ? s.theme : d.theme,
    layout: LAYOUTS.includes(s.layout) ? s.layout : d.layout,
    dailyMinutes: int(s.dailyMinutes, 15, 720, d.dailyMinutes),
    studyDays: days.length ? days : d.studyDays,
    examDate: isISO(s.examDate) ? s.examDate : '',
    revision: s.revision !== false,
    aiEnabled: s.aiEnabled === true,
    apiKey: /^[A-Za-z0-9_-]{0,200}$/.test(s.apiKey || '') ? s.apiKey || '' : '',
    model: /^[A-Za-z0-9._-]{3,80}$/.test(s.model || '') ? s.model : d.model,
    autoLockSec: [0, 60, 300, 900].includes(s.autoLockSec) ? s.autoLockSec : d.autoLockSec,
    remind: sanitizeRemind(s.remind),
    lastBackupAt: int(s.lastBackupAt, 0, 8.64e15, 0),
    createdAt: int(s.createdAt, 0, 8.64e15, 0)
  };
}
