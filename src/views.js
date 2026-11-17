import { h, icon, toast, openSheet, confirmSheet, trackUrl, revokeUrls } from './dom.js';
import {
  S, bus, vault, loadAll, saveSettings, addMaterial, saveMaterial, deleteMaterial, topicsOf, topicState,
  buildPlan, toggleItem, upsertTask, deleteTask, upsertRoutine, deleteRoutine, wipeAll, shiftDay, overdueTasks, replanOverdue, markBackup
} from './state.js';
import { backupDue } from './core/remind.js';
import { remindersSupported, reminderPermission, requestReminderPermission, testReminder } from './io/notify.js';
import { dayItems } from './core/plan.js';
import { ingest } from './io/ingest.js';
import { passIssue } from './core/crypto.js';
import { uid, UserError, addDays, todayISO, weekStart, daysBetween, fmtLong, fmtDow, fmtShort, fmtDM, fmtBytes, clean, cleanText, isISO } from './core/util.js';
import { shareBackup } from './backup.js';

const KIND = { study: 'Study', revise: 'Revise', manual: 'Task', routine: 'Routine' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const THEME_META = {
  paper: { name: 'Paper', dots: ['#EFE6D4', '#B8482A', '#4F6F52'] },
  midnight: { name: 'Midnight', dots: ['#0D1320', '#F0B445', '#62B5B0'] },
  matcha: { name: 'Matcha', dots: ['#DDE6D2', '#2E6B45', '#C9803A'] },
  dusk: { name: 'Dusk', dots: ['#1B1424', '#F28C6B', '#8F7FD1'] }
};
const LAYOUT_META = {
  timeline: ['Timeline', 'A rail of the day, step by step'],
  cards: ['Cards', 'Tiles with big minute counts'],
  focus: ['Focus', 'One task at a time']
};

const render = () => bus.render();
const go = (view, extra = {}) => { Object.assign(S.nav, { view, materialId: null }, extra); render(); window.scrollTo(0, 0); };
const sum = (a, f = x => x.minutes) => a.reduce((n, x) => n + f(x), 0);

// Handlers never show raw errors: only messages we wrote ourselves (UserError).
const safe = fn => async (...a) => {
  try { await fn(...a); }
  catch (e) { toast(e instanceof UserError ? e.message : 'Something went wrong. Please try again.'); }
};

const btn = (label, cls, onClick, ic) =>
  h('button', { class: 'btn ' + cls, type: 'button', onClick: safe(onClick) }, ic && icon(ic, 18), label);
const iconBtn = (ic, label, onClick) => h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, onClick }, icon(ic));
const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint && h('span', { class: 'hint' }, hint));
const meter = (pct, cls = '') => h('div', { class: 'meter ' + cls }, h('i', { style: { width: pct + '%' } }));
const rel = d => {
  const t = todayISO();
  if (d === t) return 'Today';
  if (d === addDays(t, 1)) return 'Tomorrow';
  if (d === addDays(t, -1)) return 'Yesterday';
  return fmtShort(d);
};

async function doBackup() {
  await shareBackup(await vault.exportBackup());
  await markBackup();
}

function banners() {
  const out = [];
  const late = overdueTasks();
  if (late.length && S.nav.date === todayISO()) {
    out.push(h('div', { class: 'banner' },
      h('p', {}, h('strong', {}, `${late.length} session${late.length === 1 ? '' : 's'} slipped past.`), ' Move them to your next free days?'),
      btn('Re-plan', 'primary sm', async () => { await replanOverdue(); toast('Re-planned from today.'); render(); })));
  }
  if (backupDue(S.settings)) {
    out.push(h('div', { class: 'banner' },
      h('p', {}, h('strong', {}, 'Time for a backup.'), ' Your data lives only on this phone.'),
      btn('Back up now', 'primary sm', async () => { await doBackup(); render(); })));
  }
  return out;
}

/* ───────────── lock screen ───────────── */

export function lockView() {
  const setup = bus.mode === 'setup';
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  const p1 = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: setup ? 'New passphrase' : 'Passphrase', 'aria-label': 'Passphrase' });
  const p2 = setup ? h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Repeat passphrase', 'aria-label': 'Repeat passphrase' }) : null;
  let busy = false;

  const submit = safe(async () => {
    if (busy) return;
    msg.textContent = '';
    if (setup) {
      const issue = passIssue(p1.value);
      if (issue) { msg.textContent = issue; return; }
      if (p1.value !== p2.value) { msg.textContent = 'The two passphrases differ.'; return; }
      busy = true;
      go_btn.disabled = true;
      await vault.setup(p1.value);
      await saveSettings({ createdAt: Date.now() });
      await loadAll();
    } else {
      busy = true;
      go_btn.disabled = true;
      try {
        if (!(await vault.unlock(p1.value))) { msg.textContent = 'Wrong passphrase.'; busy = false; go_btn.disabled = false; p1.value = ''; return; }
      } catch (e) {
        busy = false; go_btn.disabled = false;
        if (e.retryMs) { msg.textContent = `Too many attempts. Try again in ${Math.ceil(e.retryMs / 1000)}s.`; return; }
        throw e;
      }
      await loadAll();
    }
    p1.value = '';
    if (p2) p2.value = '';
    S.ready = true;
    bus.afterUnlock?.();
    render();
  });
  const go_btn = h('button', { class: 'btn primary wide', type: 'button', onClick: submit }, icon('lock', 18), setup ? 'Create & open' : 'Unlock');
  for (const el of [p1, p2]) el?.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  return h('div', { class: 'lock' },
    h('div', { class: 'lock-card' },
      h('div', { class: 'brand' }, h('span', { class: 'ring' }), h('span', { class: 'word' }, 'Tempo')),
      h('p', { class: 'eyebrow' }, setup ? 'Welcome' : 'Locked'),
      h('h1', { class: 'display' }, setup ? 'Make a passphrase.' : 'Welcome back.'),
      setup && h('p', { class: 'muted' }, 'It encrypts everything on this phone. There is no recovery: if you forget it, your data cannot be opened. Export a backup now and then.'),
      p1, p2, msg, go_btn,
      setup && h('button', { class: 'link', type: 'button', onClick: safe(() => pickBackup(false)) }, 'I have a backup to restore')));
}

/* ───────────── shell ───────────── */

export function appShell() {
  const v = S.nav.view;
  const main = v === 'today' ? todayView() : v === 'week' ? weekView() : v === 'library' ? (S.nav.materialId ? materialView() : libraryView()) : settingsView();
  const tab = (id, ic, label) => h('button', { type: 'button', 'aria-label': label, 'aria-current': v === id ? 'page' : null, onClick: () => go(id) }, icon(ic));
  return h('div', { class: 'shell' },
    h('main', { class: 'page' }, main),
    h('nav', { class: 'dock', 'aria-label': 'Main' },
      tab('today', 'today', 'Today'), tab('week', 'week', 'Week'),
      h('button', { class: 'add', type: 'button', 'aria-label': 'Add', onClick: addMenu }, icon('plus', 26)),
      tab('library', 'library', 'Library'), tab('settings', 'settings', 'Settings')));
}

/* ───────────── today ───────────── */

function todayView() {
  const d = S.nav.date;
  const items = dayItems(d, S.tasks, S.routines);
  const total = sum(items);
  const doneMin = sum(items.filter(i => i.done));
  const pct = total ? Math.round((doneMin / total) * 100) : 0;
  const L = S.settings.layout;

  const body = !items.length ? empty() : L === 'cards' ? cardsList(items) : L === 'focus' ? focusList(items) : timelineList(items);
  return [
    h('header', { class: 'hero' },
      h('div', { class: 'hero-row' },
        h('p', { class: 'eyebrow' }, rel(d)),
        h('div', { class: 'hero-nav' },
          iconBtn('chevL', 'Previous day', () => { shiftDay(-1); render(); }),
          d !== todayISO() && h('button', { class: 'chip', type: 'button', onClick: () => { S.nav.date = todayISO(); render(); } }, 'Today'),
          iconBtn('chevR', 'Next day', () => { shiftDay(1); render(); }))),
      h('h1', { class: 'display' }, fmtDow(d), h('em', {}, fmtLong(d))),
      meter(pct),
      h('p', { class: 'caption' }, total ? `${doneMin} of ${total} min · ${items.filter(i => i.done).length}/${items.length} done` : 'A free day')),
    banners(),
    body
  ];
}

const tick = it => h('button', {
  class: 'tick' + (it.done ? ' on' : ''), type: 'button', 'aria-pressed': String(it.done), 'aria-label': (it.done ? 'Mark not done: ' : 'Mark done: ') + it.title,
  onClick: safe(async () => { await toggleItem(it); render(); })
}, it.done && icon('check', 16));

function openItem(it) {
  if (it.ref.type === 'task') taskSheet(S.tasks.find(t => t.id === it.ref.id));
  else routineSheet(S.routines.find(r => r.id === it.ref.id));
}
const metaLine = it => [KIND[it.kind], it.time, it.minutes ? `${it.minutes} min` : '', it.sub].filter(Boolean).join(' · ');

function timelineList(items) {
  return h('ol', { class: 'timeline' }, items.map(it =>
    h('li', { class: 'tl' + (it.done ? ' done' : '') }, tick(it),
      h('button', { class: 'tl-body', type: 'button', onClick: () => openItem(it) },
        h('span', { class: 'title' }, it.title), h('span', { class: 'meta' }, metaLine(it))))));
}

function cardsList(items) {
  return h('div', { class: 'cards' }, items.map(it =>
    h('article', { class: 'tile k-' + it.kind + (it.done ? ' done' : '') },
      h('button', { class: 'tile-main', type: 'button', onClick: () => openItem(it) },
        h('span', { class: 'big' }, it.minutes || '·', h('small', {}, it.minutes ? 'min' : '')),
        h('span', { class: 'title' }, it.title),
        h('span', { class: 'meta' }, [KIND[it.kind], it.time, it.sub].filter(Boolean).join(' · '))),
      tick(it))));
}

function focusList(items) {
  const next = items.find(i => !i.done);
  const rest = items.filter(i => i !== next && !i.done);
  const doneN = items.filter(i => i.done).length;
  if (!next) return h('div', { class: 'focus-card all-done' }, h('p', { class: 'eyebrow' }, 'Finished'), h('h2', {}, 'Everything done for this day.'), h('p', { class: 'muted' }, `${doneN} item${doneN === 1 ? '' : 's'} completed.`));
  return [
    h('div', { class: 'focus-card' },
      h('p', { class: 'eyebrow' }, 'Up next'),
      h('h2', {}, next.title),
      h('p', { class: 'meta' }, metaLine(next)),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary grow', type: 'button', onClick: safe(async () => { await toggleItem(next); render(); }) }, icon('check', 18), 'Mark done'),
        h('button', { class: 'btn ghost-inv', type: 'button', onClick: () => openItem(next) }, 'Edit'))),
    rest.length > 0 && h('div', { class: 'later' }, h('p', { class: 'eyebrow' }, `Later · ${rest.length}`),
      rest.map(it => h('button', { class: 'later-row', type: 'button', onClick: () => openItem(it) }, h('span', {}, it.title), h('span', { class: 'meta' }, it.minutes ? it.minutes + ' min' : ''))))
  ];
}

function empty() {
  return h('div', { class: 'empty' },
    h('p', { class: 'display sm' }, 'Nothing planned.'),
    h('p', { class: 'muted' }, 'Add study material to build a routine, or put a task on this day.'),
    h('div', { class: 'row' }, btn('Add material', 'primary', () => materialSheet(), 'upload'), btn('Add task', 'ghost', () => taskSheet(null), 'task')));
}

/* ───────────── week ───────────── */

function weekView() {
  const start = S.nav.week;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  let tot = 0, dn = 0;
  const cards = days.map(d => {
    const items = dayItems(d, S.tasks, S.routines);
    const m = sum(items), dm = sum(items.filter(i => i.done));
    tot += m; dn += dm;
    return h('button', { class: 'daycard' + (d === todayISO() ? ' now' : ''), type: 'button', onClick: () => go('today', { date: d }) },
      h('div', { class: 'dc-h' }, h('span', { class: 'dc-dow' }, fmtShort(d)), h('span', { class: 'dc-date' }, fmtDM(d)), h('span', { class: 'dc-min' }, m ? `${m} min` : 'Free')),
      m > 0 && meter(Math.round((dm / m) * 100), 'sm'),
      items.slice(0, 3).map(i => h('p', { class: 'dc-item' + (i.done ? ' done' : '') }, i.title)),
      items.length > 3 && h('p', { class: 'dc-more' }, `+${items.length - 3} more`));
  });
  return [
    h('header', { class: 'hero' },
      h('div', { class: 'hero-row' }, h('p', { class: 'eyebrow' }, 'Week'),
        h('div', { class: 'hero-nav' },
          iconBtn('chevL', 'Previous week', () => { S.nav.week = addDays(S.nav.week, -7); render(); }),
          S.nav.week !== weekStart(todayISO()) && h('button', { class: 'chip', type: 'button', onClick: () => { S.nav.week = weekStart(todayISO()); render(); } }, 'This week'),
          iconBtn('chevR', 'Next week', () => { S.nav.week = addDays(S.nav.week, 7); render(); }))),
      h('h1', { class: 'display' }, fmtDM(days[0]), h('em', {}, ` – ${fmtDM(days[6])}`)),
      meter(tot ? Math.round((dn / tot) * 100) : 0),
      h('p', { class: 'caption' }, tot ? `${dn} of ${tot} min done` : 'Nothing planned this week')),
    h('div', { class: 'days' }, cards)
  ];
}

/* ───────────── library ───────────── */

function progressOf(m) {
  const ts = topicsOf(m);
  if (!ts.length) return 0;
  return Math.round((ts.filter(t => topicState(m, t.id).state === 'done').length / ts.length) * 100);
}

function examLeft(m) {
  if (!m.examDate) return '';
  const n = daysBetween(todayISO(), m.examDate);
  return n < 0 ? 'exam passed' : n === 0 ? 'exam today' : `exam in ${n} day${n === 1 ? '' : 's'}`;
}

function libraryView() {
  const list = S.materials;
  return [
    h('header', { class: 'hero' }, h('p', { class: 'eyebrow' }, 'Library'), h('h1', { class: 'display' }, 'Your', h('em', {}, 'material'))),
    list.length ? h('div', { class: 'stack' }, list.map(m => {
      const ts = topicsOf(m);
      return h('button', { class: 'mat', type: 'button', onClick: () => { S.nav.materialId = m.id; render(); window.scrollTo(0, 0); } },
        h('div', { class: 'mat-h' }, h('span', { class: 'title' }, m.title), h('span', { class: 'badge' }, m.source === 'ai' ? 'AI' : m.source === 'scan' ? 'Scan' : 'Typed')),
        h('p', { class: 'meta' }, `${ts.length} topics · ${sum(ts)} min · ${m.files.length} file${m.files.length === 1 ? '' : 's'}${examLeft(m) ? ' · ' + examLeft(m) : ''}`),
        meter(progressOf(m), 'sm'));
    })) : h('div', { class: 'empty' }, h('p', { class: 'display sm' }, 'No material yet.'), h('p', { class: 'muted' }, 'Photograph notes, add a PDF, or type a syllabus. Tempo turns it into a routine.'), btn('Add material', 'primary', () => materialSheet(), 'upload'))
  ];
}

function materialView() {
  const m = S.materials.find(x => x.id === S.nav.materialId);
  if (!m) { S.nav.materialId = null; return libraryView(); }
  const stateLabel = t => { const s = topicState(m, t.id); return s.state === 'done' ? 'Done' : s.state === 'planned' ? fmtDM(s.date) : ''; };
  return [
    h('header', { class: 'hero' },
      h('div', { class: 'hero-row' }, h('button', { class: 'chip', type: 'button', onClick: () => { S.nav.materialId = null; render(); } }, icon('back', 14), 'Library'), h('span', { class: 'badge' }, `${progressOf(m)}% done`)),
      h('h1', { class: 'display sm' }, m.title),
      meter(progressOf(m)),
      examLeft(m) && h('p', { class: 'caption' }, `${examLeft(m)} · ${fmtDM(m.examDate)}`)),
    h('div', { class: 'row wrap' },
      btn('Build routine', 'primary', () => planSheet(m), 'repeat'),
      btn('Add topic', 'ghost', () => topicSheet(m, null), 'plus'),
      btn('Delete', 'ghost danger-text', async () => { if (await confirmSheet({ title: 'Delete this material?', message: 'Its files, topics and planned sessions will be removed from this phone.', ok: 'Delete', danger: true })) { await deleteMaterial(m); S.nav.materialId = null; render(); } }, 'trash')),
    m.outline.map(u => h('section', { class: 'unit' },
      h('h3', {}, u.title),
      u.chapters.map(c => h('div', { class: 'chap' },
        c.title !== 'General' && h('h4', {}, c.title),
        c.topics.map(t => h('button', { class: 'topic' + (topicState(m, t.id).state === 'done' ? ' done' : ''), type: 'button', onClick: () => topicSheet(m, t) },
          h('span', { class: 'title' }, t.title),
          h('span', { class: 'meta' }, [t.minutes + ' min', stateLabel(t)].filter(Boolean).join(' · '))))))) ),
    m.files.length > 0 && h('section', { class: 'unit' }, h('h3', {}, 'Originals'),
      m.files.map(f => h('button', { class: 'topic', type: 'button', onClick: safe(() => previewFile(f)) }, h('span', { class: 'title' }, f.name), h('span', { class: 'meta' }, `${f.type === 'application/pdf' ? 'PDF' : 'Image'} · ${fmtBytes(f.size)}`))))
  ];
}

async function previewFile(f) {
  const bytes = await vault.getBlob(f.id);
  if (!bytes) throw new UserError('That file is missing.');
  if (f.type === 'application/pdf') { toast('PDF is stored encrypted. Its text was used for your plan.'); return; }
  const url = trackUrl(new Blob([bytes], { type: 'image/jpeg' }));
  openSheet(f.name, () => h('img', { class: 'preview', src: url, alt: f.name }), { onClose: revokeUrls });
}

/* ───────────── sheets ───────────── */

function addMenu() {
  openSheet('Add', close => h('div', { class: 'stack' }, [
    ['upload', 'Study material', 'Photos, PDFs or typed notes → structured routine', () => materialSheet()],
    ['task', 'One task', 'A dated to-do with a time estimate', () => taskSheet(null)],
    ['repeat', 'Recurring routine', 'Weekly blocks like “Python practice, Mon–Fri”', () => routineSheet(null)]
  ].map(([ic, t, d, fn]) => h('button', { class: 'menu-row', type: 'button', onClick: () => { close(); fn(); } },
    h('span', { class: 'menu-ic' }, icon(ic)), h('span', {}, h('span', { class: 'title' }, t), h('span', { class: 'meta block' }, d))))));
}

function materialSheet() {
  let files = [];
  const title = h('input', { type: 'text', maxLength: 80, placeholder: 'e.g. CSA · Unit 3' });
  const text = h('textarea', { rows: 6, placeholder: 'Or type / paste notes here. Lines like “Unit 1”, “1.2 Topic” or bullet lists give the best structure.' });
  const status = h('p', { class: 'status', role: 'status' });
  const names = h('div', { class: 'files' });
  const picker = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, class: 'sr-only' });
  const canAI = S.settings.aiEnabled && S.settings.apiKey;
  const useAI = h('input', { type: 'checkbox' });

  const paintFiles = () => names.replaceChildren(...files.map((f, i) =>
    h('div', { class: 'file-chip' }, h('span', {}, f.name), h('button', { type: 'button', 'aria-label': 'Remove ' + f.name, onClick: () => { files.splice(i, 1); paintFiles(); } }, icon('x', 14)))));
  picker.addEventListener('click', () => { bus.picking = true; });
  picker.addEventListener('change', () => {
    bus.picking = false;
    files = [...files, ...picker.files].slice(0, 20);
    picker.value = '';
    paintFiles();
  });

  return openSheet('Add material', close => {
    const run = h('button', { class: 'btn primary wide', type: 'button' }, icon('upload', 18), 'Read & structure');
    run.addEventListener('click', safe(async () => {
      if (!files.length && !text.value.trim()) throw new UserError('Add a file or type some text first.');
      run.disabled = true;
      try {
        const name = clean(title.value, 80) || (files[0] ? clean(files[0].name.replace(/\.[^.]+$/, ''), 80) : 'Notes ' + fmtDM(todayISO()));
        const r = await ingest({
          files, text: text.value, title: name, onStatus: s => { status.textContent = s; },
          ai: canAI && useAI.checked ? { apiKey: S.settings.apiKey, model: S.settings.model } : null
        });
        const m = await addMaterial({ title: name, ...r });
        close();
        planSheet(m, true);
      } finally { run.disabled = false; }
    }));
    return [
      field('Title', title),
      h('div', { class: 'drop' }, h('button', { class: 'btn ghost wide', type: 'button', onClick: () => picker.click() }, icon('upload', 18), 'Choose photos or PDFs'), picker, names,
        h('p', { class: 'hint' }, 'Text is read on this phone. JPG, PNG, WebP or PDF, up to 25 MB each.')),
      field('Typed notes', text),
      canAI && h('label', { class: 'check' }, useAI, h('span', {}, 'Use AI to structure this. Only the extracted text is sent to Anthropic, never the files.')),
      status, run
    ];
  }, { onClose: () => { bus.picking = false; } });
}

function planSheet(m, fresh = false) {
  const n = topicsOf(m).length;
  const start = h('input', { type: 'date', value: todayISO(), min: todayISO() });
  const mins = h('input', { type: 'number', inputMode: 'numeric', min: 15, max: 720, step: 15, value: S.settings.dailyMinutes });
  const exam = h('input', { type: 'date', value: m.examDate || S.settings.examDate || '', min: todayISO() });
  const result = h('div', { class: 'result' });
  openSheet(fresh ? 'Saved. Build a routine?' : 'Build routine', close => [
    h('p', { class: 'muted' }, `${m.title}: ${n} topic${n === 1 ? '' : 's'}, about ${sum(topicsOf(m))} minutes in all. Unfinished sessions from an earlier plan for this material are replaced.`),
    field('Start on', start), field('Minutes per day', mins), field('Exam date (optional)', exam, 'Tempo paces the topics evenly, keeps a buffer, and reserves the last two study days for final revision.'),
    result,
    h('div', { class: 'row end' }, btn(fresh ? 'Not now' : 'Cancel', 'ghost', () => close()), btn('Build routine', 'primary', async () => {
      if (!isISO(start.value)) throw new UserError('Pick a start date.');
      const res = await buildPlan(m, { startDate: start.value, dailyMinutes: Number(mins.value) || 120, examDate: isISO(exam.value) ? exam.value : '' });
      const study = res.items.filter(i => i.kind === 'study').length;
      result.replaceChildren(
        h('p', { class: 'ok' }, `${study} study session${study === 1 ? '' : 's'} planned, finishing ${fmtDM(res.endDate)}.`),
        res.finalRevisions > 0 && h('p', { class: 'ok' }, `${res.finalRevisions} final-revision session${res.finalRevisions === 1 ? '' : 's'} added just before the exam.`),
        !res.fitsBeforeExam && h('p', { class: 'warn' }, `${res.overflowCount} session${res.overflowCount === 1 ? '' : 's'} land on or after the exam.${res.suggestedDaily ? ` About ${res.suggestedDaily} min a day would fit.` : ''}`),
        btn('See today', 'primary', () => { close(); go('today', { date: todayISO() }); }));
    }))
  ]);
}

function taskSheet(task) {
  const title = h('input', { type: 'text', maxLength: 160, value: task?.title || '', placeholder: 'What needs doing?' });
  const date = h('input', { type: 'date', value: task?.date || S.nav.date });
  const mins = h('input', { type: 'number', inputMode: 'numeric', min: 0, max: 600, step: 5, value: task?.minutes ?? 30 });
  openSheet(task ? 'Edit task' : 'New task', close => [
    field('Task', title), field('Date', date), field('Minutes', mins),
    h('div', { class: 'row end' },
      task && btn('Delete', 'ghost danger-text', async () => { await deleteTask(task.id); close(); render(); }, 'trash'),
      btn('Save', 'primary', async () => {
        if (!clean(title.value, 160)) throw new UserError('Give the task a name.');
        if (!isISO(date.value)) throw new UserError('Pick a date.');
        await upsertTask({ ...(task || {}), title: title.value, date: date.value, minutes: Number(mins.value) || 0 });
        S.nav.date = date.value; close(); render();
      }))
  ]);
}

function routineSheet(r) {
  const title = h('input', { type: 'text', maxLength: 160, value: r?.title || '', placeholder: 'e.g. Python practice' });
  const time = h('input', { type: 'time', value: r?.time || '' });
  const mins = h('input', { type: 'number', inputMode: 'numeric', min: 0, max: 600, step: 5, value: r?.minutes ?? 45 });
  const days = new Set(r?.days || [1, 2, 3, 4, 5]);
  const chips = h('div', { class: 'chips' }, [1, 2, 3, 4, 5, 6, 0].map(d => {
    const b = h('button', { class: 'chip toggle', type: 'button', 'aria-pressed': String(days.has(d)) }, DOW[d]);
    b.addEventListener('click', () => { days.has(d) ? days.delete(d) : days.add(d); b.setAttribute('aria-pressed', String(days.has(d))); });
    return b;
  }));
  openSheet(r ? 'Edit routine' : 'New routine', close => [
    field('Routine', title), field('Time (optional)', time), field('Minutes', mins), h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Repeats on'), chips),
    h('div', { class: 'row end' },
      r && btn('Delete', 'ghost danger-text', async () => { await deleteRoutine(r.id); close(); render(); }, 'trash'),
      btn('Save', 'primary', async () => {
        if (!clean(title.value, 160)) throw new UserError('Give the routine a name.');
        if (!days.size) throw new UserError('Pick at least one day.');
        await upsertRoutine({ ...(r || {}), title: title.value, time: time.value, minutes: Number(mins.value) || 0, days: [...days] });
        close(); render();
      }))
  ]);
}

function topicSheet(m, topic) {
  const title = h('input', { type: 'text', maxLength: 120, value: topic?.title || '', placeholder: 'Topic' });
  const mins = h('input', { type: 'number', inputMode: 'numeric', min: 5, max: 180, step: 5, value: topic?.minutes ?? 30 });
  const notes = h('textarea', { rows: 5, maxLength: 4000, value: topic?.notes || '', placeholder: 'Notes (optional)' });
  const spots = m.outline.flatMap((u, ui) => u.chapters.map((c, ci) => ({ ui, ci, label: `${u.title}${c.title !== 'General' ? ' › ' + c.title : ''}` })));
  const where = !topic && spots.length ? h('select', {}, spots.map((s, i) => h('option', { value: String(i), selected: i === spots.length - 1 }, s.label))) : null;
  openSheet(topic ? 'Edit topic' : 'Add topic', close => [
    field('Title', title), field('Minutes', mins), field('Notes', notes), where && field('Add to', where),
    h('div', { class: 'row end' },
      topic && btn('Delete', 'ghost danger-text', async () => {
        for (const u of m.outline) for (const c of u.chapters) c.topics = c.topics.filter(t => t.id !== topic.id);
        m.outline.forEach(u => { u.chapters = u.chapters.filter(c => c.topics.length); });
        m.outline = m.outline.filter(u => u.chapters.length);
        await saveMaterial(m); close(); render();
      }, 'trash'),
      btn('Save', 'primary', async () => {
        const t = clean(title.value, 120);
        if (!t) throw new UserError('Give the topic a name.');
        const minutes = Math.min(180, Math.max(5, Number(mins.value) || 30));
        if (topic) { const live = topicsInPlace(m, topic.id); Object.assign(live, { title: t, minutes, notes: cleanText(notes.value, 4000) }); }
        else {
          const nt = { id: uid(), title: t, minutes, notes: cleanText(notes.value, 4000) };
          if (where) m.outline[spots[Number(where.value)].ui].chapters[spots[Number(where.value)].ci].topics.push(nt);
          else m.outline.push({ id: uid(), title: m.title, chapters: [{ id: uid(), title: 'General', topics: [nt] }] });
        }
        await saveMaterial(m); close(); render();
      }))
  ]);
}
const topicsInPlace = (m, id) => { for (const u of m.outline) for (const c of u.chapters) for (const t of c.topics) if (t.id === id) return t; return {}; };

/* ───────────── settings ───────────── */

function settingsView() {
  const s = S.settings;
  const set = patch => safe(async () => { await saveSettings(patch); render(); });
  const days = h('div', { class: 'chips' }, [1, 2, 3, 4, 5, 6, 0].map(d => {
    const on = s.studyDays.includes(d);
    return h('button', { class: 'chip toggle', type: 'button', 'aria-pressed': String(on), onClick: set({ studyDays: on ? s.studyDays.filter(x => x !== d) : [...s.studyDays, d] }) }, DOW[d]);
  }));
  const key = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: s.apiKey ? '•••••••• saved' : 'Paste your API key', onChange: e => safe(async () => { const v = e.target.value.trim(); await saveSettings({ apiKey: v }); e.target.value = ''; toast(v ? 'Key saved (encrypted).' : 'Key removed.'); render(); })() });
  const model = h('input', { type: 'text', value: s.model, maxLength: 80, spellcheck: false, onChange: e => safe(async () => { await saveSettings({ model: e.target.value.trim() }); render(); })() });
  const lock = h('select', { onChange: e => safe(async () => { await saveSettings({ autoLockSec: Number(e.target.value) }); })() },
    [[0, 'Immediately'], [60, 'After 1 minute'], [300, 'After 5 minutes'], [900, 'After 15 minutes']].map(([v, l]) => h('option', { value: String(v), selected: s.autoLockSec === v }, l)));

  return [
    h('header', { class: 'hero' }, h('p', { class: 'eyebrow' }, 'Settings'), h('h1', { class: 'display' }, 'Make it', h('em', {}, 'yours'))),

    h('section', { class: 'card' }, h('h3', {}, 'Look'),
      h('div', { class: 'themes' }, Object.entries(THEME_META).map(([id, t]) =>
        h('button', { class: 'theme', type: 'button', 'aria-pressed': String(s.theme === id), onClick: set({ theme: id }) },
          h('span', { class: 'dots' }, t.dots.map(c => h('i', { style: { background: c } }))), h('span', {}, t.name)))),
      h('p', { class: 'lbl' }, 'Today layout'),
      h('div', { class: 'stack' }, Object.entries(LAYOUT_META).map(([id, [n, d]]) =>
        h('button', { class: 'opt', type: 'button', 'aria-pressed': String(s.layout === id), onClick: set({ layout: id }) }, h('span', { class: 'title' }, n), h('span', { class: 'meta' }, d))))),

    h('section', { class: 'card' }, h('h3', {}, 'Routine'),
      field('Default minutes per day', h('input', { type: 'number', inputMode: 'numeric', min: 15, max: 720, step: 15, value: s.dailyMinutes, onChange: e => set({ dailyMinutes: Number(e.target.value) })() })),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Study days'), days),
      field('Exam date', h('input', { type: 'date', value: s.examDate, onChange: e => set({ examDate: e.target.value })() })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.revision, onChange: e => set({ revision: e.target.checked })() }), h('span', {}, 'Add short revision sessions 3+ days after each topic'))),

    remindersCard(),

    h('section', { class: 'card' }, h('h3', {}, 'AI structuring (optional)'),
      h('p', { class: 'muted' }, 'Off by default. Photos and PDFs are always read on this phone. When you switch AI on for an upload, only its extracted text goes to Anthropic using your own key.'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.aiEnabled, onChange: e => set({ aiEnabled: e.target.checked })() }), h('span', {}, 'Allow AI structuring')),
      s.aiEnabled && [field('API key', key, 'Stored encrypted on this phone. Never shown again.'), field('Model', model)]),

    h('section', { class: 'card' }, h('h3', {}, 'Security'),
      field('Auto-lock', lock),
      h('div', { class: 'stack' },
        btn('Lock now', 'ghost', () => bus.lock(), 'lock'),
        btn('Change passphrase', 'ghost', () => passSheet()),
        h('p', { class: 'hint' }, s.lastBackupAt ? `Last export: ${fmtDM(new Date(s.lastBackupAt).toISOString().slice(0, 10))}` : 'No export yet.'),
        btn('Export encrypted backup', 'ghost', async () => { await doBackup(); render(); }),
        btn('Restore from backup', 'ghost', () => pickBackup(true)),
        btn('Erase everything', 'ghost danger-text', () => eraseSheet(), 'trash'))),

    h('section', { class: 'card' }, h('h3', {}, 'About'),
      h('p', { class: 'muted' }, 'Tempo keeps everything on this phone, encrypted with AES-256-GCM under a key protected by your passphrase. It has no account, no analytics and no server.'))
  ];
}

function passSheet() {
  const mk = p => h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: p });
  const a = mk('Current passphrase'), b = mk('New passphrase'), c = mk('Repeat new passphrase');
  openSheet('Change passphrase', close => [
    field('Current', a), field('New', b), field('Repeat', c),
    h('div', { class: 'row end' }, btn('Change', 'primary', async () => {
      if (b.value !== c.value) throw new UserError('The new passphrases differ.');
      await vault.changePass(a.value, b.value);
      close(); toast('Passphrase changed. Make a fresh backup.');
    }))
  ]);
}

function eraseSheet() {
  const sure = h('input', { type: 'text', autocapitalize: 'characters', autocomplete: 'off', placeholder: 'Type ERASE' });
  openSheet('Erase everything?', close => [
    h('p', { class: 'muted' }, 'This permanently deletes all material, files, plans and settings from this phone. It cannot be undone.'),
    sure,
    h('div', { class: 'row end' }, btn('Cancel', 'ghost', () => close()), btn('Erase', 'danger', async () => {
      if (sure.value.trim() !== 'ERASE') throw new UserError('Type ERASE to confirm.');
      close(); revokeUrls(); await wipeAll(); render();
    }))
  ]);
}

// Restore: pick a .json backup, enter the passphrase it was made with, replace local data.
async function pickBackup(replacing) {
  const input = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only' });
  bus.picking = true;
  input.addEventListener('change', safe(async () => {
    bus.picking = false;
    const f = input.files[0];
    if (!f) return;
    if (f.size > 150 * 1024 * 1024) throw new UserError('That file is too large to be a backup.');
    const json = await f.text();
    const pass = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Passphrase of that backup' });
    openSheet('Restore backup', close => [
      h('p', { class: 'muted' }, replacing ? 'This replaces everything on this phone with the backup. Enter the passphrase the backup was made with.' : 'Enter the passphrase the backup was made with.'),
      pass,
      h('div', { class: 'row end' }, btn('Restore', 'primary', async () => {
        if (!(await vault.restore(json, pass.value))) throw new UserError('Wrong passphrase for that backup.');
        pass.value = '';
        await loadAll();
        S.ready = true; bus.mode = 'unlock';
        close(); bus.afterUnlock?.(); render(); toast('Backup restored.');
      }))
    ]);
  }));
  document.body.append(input);
  input.click();
  setTimeout(() => input.remove(), 120000);
}

/* ───────────── reminders ───────────── */

function remindersCard() {
  const s = S.settings;
  const r = s.remind;
  const upd = patch => safe(async () => { await saveSettings({ remind: { ...S.settings.remind, ...patch } }); render(); });
  const status = h('p', { class: 'hint' });
  reminderPermission().then(p => {
    status.textContent = p === 'unsupported' ? 'Reminders work in the installed Android app (not in a browser).' : p === 'granted' ? 'Notifications are allowed.' : 'Notifications are blocked: allow them for Tempo in Android settings.';
  }).catch(() => {});
  const time = (label, key) => field(label, h('input', { type: 'time', value: r[key], onChange: e => e.target.value && upd({ [key]: e.target.value })() }));
  const pick = (label, key, opts, fmt) => field(label, h('select', { onChange: e => upd({ [key]: Number(e.target.value) })() }, opts.map(v => h('option', { value: String(v), selected: r[key] === v }, fmt(v)))));

  const master = h('label', { class: 'check' },
    h('input', {
      type: 'checkbox', checked: r.enabled,
      onChange: e => safe(async () => {
        if (e.target.checked && remindersSupported()) {
          const p = await requestReminderPermission();
          if (p !== 'granted') { e.target.checked = false; throw new UserError('Allow notifications for Tempo in Android settings first.'); }
        }
        await saveSettings({ remind: { ...S.settings.remind, enabled: e.target.checked } });
        render();
      })()
    }),
    h('span', {}, 'Study reminders: a daily plan summary, an evening nudge, and routine start times'));

  return h('section', { class: 'card' }, h('h3', {}, 'Reminders'),
    master,
    r.enabled && [
      time('Daily plan at', 'dailyTime'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r.nudge, onChange: e => upd({ nudge: e.target.checked })() }), h('span', {}, 'Evening nudge if sessions are still open')),
      r.nudge && time('Nudge at', 'nudgeTime'),
      pick('Routine reminder', 'routineLead', [0, 5, 10, 15, 30], v => (v ? `${v} min before` : 'At start time')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r.showTitles, onChange: e => upd({ showTitles: e.target.checked })() }), h('span', {}, 'Show session names in notifications (off = counts only, more private)'))
    ],
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r.backup, onChange: e => upd({ backup: e.target.checked })() }), h('span', {}, 'Remind me to back up')),
    r.backup && pick('Back up every', 'backupDays', [3, 7, 14, 30], v => `${v} days`),
    status,
    r.enabled && remindersSupported() && btn('Send a test reminder', 'ghost', async () => { await testReminder(); toast('A test reminder will arrive in 5 seconds.'); }));
}
