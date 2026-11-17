import { Vault } from './core/vault.js';
import { IDBStore } from './core/storage.js';
import { defaultSettings, sanitizeMaterial, sanitizeRoutine, sanitizeSettings, sanitizeTask } from './core/schema.js';
import { generatePlan, nextStudyDay } from './core/plan.js';
import { clearReminders } from './io/notify.js';
import { addDays, parseISO, todayISO, uid, weekStart } from './core/util.js';

export const vault = new Vault(new IDBStore());
export const bus = { render() {}, mode: 'unlock', picking: false };
export const S = {
  materials: [], tasks: [], routines: [], settings: defaultSettings(), ready: false,
  nav: { view: 'today', date: todayISO(), week: weekStart(todayISO()), materialId: null }
};

export async function loadAll() {
  const [m, t, r, s] = await Promise.all(['material', 'task', 'routine', 'settings'].map(k => vault.list(k)));
  S.materials = m.map(sanitizeMaterial).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  // storage returns records in key order, so restore creation order explicitly
  S.tasks = t.map(sanitizeTask).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
  S.routines = r.map(sanitizeRoutine).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
  S.settings = sanitizeSettings(s.find(x => x?.id === 'main'));
  applyUi();
}

export function clearMemory() {
  S.materials = []; S.tasks = []; S.routines = [];
  S.settings = defaultSettings();
  S.nav = { view: 'today', date: todayISO(), week: weekStart(todayISO()), materialId: null };
}

// Theme and layout names are not sensitive, so they are remembered outside the vault to style the lock screen.
export function applyUi() {
  document.documentElement.dataset.theme = S.settings.theme;
  document.documentElement.dataset.layout = S.settings.layout;
  try { localStorage.setItem('tempo.ui', JSON.stringify({ theme: S.settings.theme })); } catch {}
}
export function restoreUi() {
  try {
    const t = JSON.parse(localStorage.getItem('tempo.ui') || '{}').theme;
    if (['paper', 'midnight', 'matcha', 'dusk'].includes(t)) document.documentElement.dataset.theme = t;
  } catch {}
}

export async function saveSettings(patch) {
  S.settings = sanitizeSettings({ ...S.settings, ...patch });
  await vault.putRecord('settings', 'main', S.settings);
  applyUi();
}

export async function addMaterial({ title, rawText, outline, source, files }) {
  const id = uid();
  for (const f of files) await vault.putBlob(f.meta.id, f.bytes);
  const m = sanitizeMaterial({ id, title, source, createdAt: Date.now(), rawText, outline, files: files.map(f => f.meta) });
  // sanitize regenerates nothing for ids we kept, so outline ids stay stable
  await vault.putRecord('material', id, m);
  S.materials.unshift(m);
  return m;
}

export async function saveMaterial(m) {
  await vault.putRecord('material', m.id, m);
}

export async function deleteMaterial(m) {
  for (const f of m.files) await vault.delBlob(f.id);
  for (const t of S.tasks.filter(x => x.materialId === m.id)) await vault.delRecord('task', t.id);
  await vault.delRecord('material', m.id);
  S.tasks = S.tasks.filter(x => x.materialId !== m.id);
  S.materials = S.materials.filter(x => x.id !== m.id);
}

export function topicsOf(m) {
  return m.outline.flatMap(u => u.chapters.flatMap(c => c.topics.map(t => ({ ...t, unit: u.title, chapter: c.title }))));
}
export function topicState(m, topicId) {
  const ts = S.tasks.filter(t => t.materialId === m.id && t.topicId === topicId && t.kind === 'study');
  if (!ts.length) return { state: 'none' };
  if (ts.every(t => t.done)) return { state: 'done' };
  return { state: 'planned', date: ts.map(t => t.date).sort()[0] };
}

const routineMinutes = date => {
  const dow = parseISO(date).getDay();
  return S.routines.filter(r => r.days.includes(dow)).reduce((a, r) => a + r.minutes, 0);
};

export async function buildPlan(m, { startDate, dailyMinutes, examDate }) {
  // a topic counts as done when every session of it is done (long topics are split into parts)
  const byTopic = new Map();
  for (const t of S.tasks) if (t.materialId === m.id && t.kind === 'study' && t.topicId) byTopic.set(t.topicId, [...(byTopic.get(t.topicId) || []), t]);
  const done = new Set([...byTopic].filter(([, ts]) => ts.every(t => t.done)).map(([id]) => id));

  // replace unfinished sessions; keep revision sessions that belong to topics already finished
  const old = S.tasks.filter(t => t.materialId === m.id && t.kind !== 'manual' && !t.done && !(t.kind === 'revise' && t.topicId && done.has(t.topicId)));
  for (const t of old) await vault.delRecord('task', t.id);
  S.tasks = S.tasks.filter(t => !old.includes(t));
  // any of those kept revisions that slipped into the past move to the next study day
  const fresh = nextStudyDay(startDate, S.settings.studyDays);
  for (const t of S.tasks.filter(t => t.materialId === m.id && t.kind === 'revise' && !t.done && t.date < startDate)) await upsertTask({ ...t, date: fresh });

  if ((m.examDate || '') !== (examDate || '')) { m.examDate = examDate || ''; await saveMaterial(m); }

  const busyMap = {};
  for (const t of S.tasks) busyMap[t.date] = (busyMap[t.date] || 0) + t.minutes;
  const res = generatePlan({
    topics: topicsOf(m).filter(t => !done.has(t.id)).map(t => ({ materialId: m.id, topicId: t.id, title: t.title, minutes: t.minutes, sub: m.title, unit: t.unit })),
    startDate, dailyMinutes, studyDays: S.settings.studyDays, examDate, revision: S.settings.revision,
    busy: d => (busyMap[d] || 0) + routineMinutes(d)
  });
  for (const it of res.items) {
    const task = sanitizeTask(it);
    if (!task) continue;
    await vault.putRecord('task', task.id, task);
    S.tasks.push(task);
  }
  return res;
}

export const overdueTasks = () => {
  const today = todayISO();
  return S.tasks.filter(t => !t.done && t.date < today && (t.kind === 'study' || t.kind === 'revise'));
};

// Catch-up: sessions you missed are re-planned from today, in the original order.
export async function replanOverdue() {
  const today = todayISO();
  const ids = [...new Set(overdueTasks().filter(t => t.kind === 'study').map(t => t.materialId))];
  for (const id of ids) {
    const m = S.materials.find(x => x.id === id);
    if (m) await buildPlan(m, { startDate: today, dailyMinutes: S.settings.dailyMinutes, examDate: m.examDate || '' });
  }
  const fresh = nextStudyDay(today, S.settings.studyDays);
  for (const t of overdueTasks()) await upsertTask({ ...t, date: fresh }); // stray missed revisions
  return ids.length;
}

export async function markBackup() {
  await saveSettings({ lastBackupAt: Date.now() });
}

export async function toggleItem(it) {
  if (it.ref.type === 'task') {
    const t = S.tasks.find(x => x.id === it.ref.id);
    t.done = !t.done;
    await vault.putRecord('task', t.id, t);
  } else {
    const r = S.routines.find(x => x.id === it.ref.id);
    const d = S.nav.date;
    r.doneDates = r.doneDates.includes(d) ? r.doneDates.filter(x => x !== d) : [...r.doneDates, d];
    await vault.putRecord('routine', r.id, r);
  }
}

export async function upsertTask(raw) {
  const t = sanitizeTask({ ...raw, id: raw.id || uid(), createdAt: raw.createdAt || Date.now(), kind: raw.kind || 'manual' });
  if (!t) return null;
  await vault.putRecord('task', t.id, t);
  const i = S.tasks.findIndex(x => x.id === t.id);
  if (i >= 0) S.tasks[i] = t; else S.tasks.push(t);
  return t;
}
export async function deleteTask(id) {
  await vault.delRecord('task', id);
  S.tasks = S.tasks.filter(t => t.id !== id);
}
export async function upsertRoutine(raw) {
  const r = sanitizeRoutine({ ...raw, id: raw.id || uid(), doneDates: raw.doneDates || [], createdAt: raw.createdAt || Date.now() });
  if (!r) return null;
  await vault.putRecord('routine', r.id, r);
  const i = S.routines.findIndex(x => x.id === r.id);
  if (i >= 0) S.routines[i] = r; else S.routines.push(r);
  return r;
}
export async function deleteRoutine(id) {
  await vault.delRecord('routine', id);
  S.routines = S.routines.filter(r => r.id !== id);
}

export async function wipeAll() {
  await vault.wipe();
  clearMemory();
  S.ready = false;
  bus.mode = 'setup';
  clearReminders().catch(() => {});
  try { localStorage.removeItem('tempo.ui'); } catch {}
}

export const shiftDay = n => { S.nav.date = addDays(S.nav.date, n); };
