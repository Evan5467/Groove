import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSchedule, backupDue } from '../src/core/remind.js';
import { generatePlan } from '../src/core/plan.js';
import { defaultSettings, sanitizeSettings, sanitizeRemind } from '../src/core/schema.js';
import { addDays, iso, parseISO } from '../src/core/util.js';

const NOW = new Date(2026, 10, 18, 10, 0, 0); // Wed 18 Nov 2026, 10:00
const on = patch => ({ ...defaultSettings(), createdAt: NOW.getTime(), remind: { ...defaultSettings().remind, enabled: true, ...patch } });
const task = (date, title = 'Read', minutes = 30, done = false) => ({ id: 't' + Math.random().toString(36).slice(2, 8), date, title, minutes, done, kind: 'study', sub: '' });

test('reminders: nothing when disabled', () => {
  const s = defaultSettings();
  assert.deepEqual(computeSchedule({ tasks: [task('2026-11-18')], routines: [], settings: s, now: NOW }), []);
});

test('reminders: daily summary + evening nudge for open work, none for empty or finished days', () => {
  const tasks = [task('2026-11-18', 'Mano ch1', 30), task('2026-11-18', 'Mano ch2', 45), task('2026-11-19', 'Done thing', 30, true)];
  const list = computeSchedule({ tasks, routines: [], settings: on({ backup: false }), now: NOW });
  assert.equal(list.length, 2);
  assert.equal(list[0].title, 'Time to study');
  assert.match(list[0].body, /2 sessions · 75 min/);
  assert.ok(!list[0].body.includes('Mano'), 'titles hidden by default');
  assert.equal(list[1].at.getHours(), 21);
});

test('reminders: past times are skipped, titles shown only when opted in', () => {
  const late = new Date(2026, 10, 18, 19, 0, 0);
  const list = computeSchedule({ tasks: [task('2026-11-18', 'Secret topic')], routines: [], settings: on({ showTitles: true, backup: false }), now: late });
  assert.equal(list.length, 1); // 18:00 already passed, 21:00 remains
  assert.match(list[0].body, /Secret topic/);
});

test('reminders: routine start reminders use the lead time and skip done days', () => {
  const routine = { id: 'r1', title: 'Python practice', time: '19:00', minutes: 45, days: [3], doneDates: [] }; // Wednesdays
  const list = computeSchedule({ tasks: [], routines: [routine], settings: on({ routineLead: 10, backup: false, showTitles: true }), now: NOW });
  const first = list.find(n => n.title === 'Python practice');
  assert.equal(first.at.getHours(), 18);
  assert.equal(first.at.getMinutes(), 50);
  const doneToday = computeSchedule({ tasks: [], routines: [{ ...routine, doneDates: ['2026-11-18'] }], settings: on({ backup: false }), now: NOW });
  assert.ok(!doneToday.some(n => n.at.getDate() === 18));
});

test('reminders: backup reminder is scheduled after the interval, and soon when overdue', () => {
  const fresh = computeSchedule({ tasks: [], routines: [], settings: on({ backupDays: 7 }), now: NOW });
  assert.equal(fresh[0].title, 'Back up Tempo');
  assert.equal(iso(fresh[0].at), '2026-11-25');
  const old = on({ backupDays: 7 });
  old.lastBackupAt = NOW.getTime() - 30 * 86400000;
  const overdue = computeSchedule({ tasks: [], routines: [], settings: old, now: NOW });
  assert.equal(iso(overdue[0].at), '2026-11-18'); // tonight
  assert.equal(backupDue(old, NOW.getTime()), true);
  assert.equal(backupDue(on({}), NOW.getTime()), false);
});

test('reminders: capped, sorted, unique ids', () => {
  const tasks = Array.from({ length: 14 }, (_, i) => task(addDays('2026-11-18', i)));
  const routines = Array.from({ length: 30 }, (_, i) => ({ id: 'r' + i, title: 'R' + i, time: '08:00', minutes: 5, days: [0, 1, 2, 3, 4, 5, 6], doneDates: [] }));
  const list = computeSchedule({ tasks, routines, settings: on({}), now: NOW });
  assert.ok(list.length <= 150);
  assert.deepEqual(list.map(n => n.at.getTime()), [...list].map(n => n.at.getTime()).sort((a, b) => a - b));
  assert.equal(new Set(list.map(n => n.id)).size, list.length);
});

test('settings: reminder fields are sanitised', () => {
  const r = sanitizeRemind({ enabled: 'yes', dailyTime: '99:99', routineLead: 7, backupDays: -1, showTitles: 1 });
  assert.equal(r.enabled, false);
  assert.equal(r.dailyTime, '18:00');
  assert.equal(r.routineLead, 10);
  assert.equal(r.backupDays, 7);
  assert.equal(r.showTitles, false);
  assert.equal(sanitizeSettings({ remind: null }).remind.enabled, false);
});

const topics = n => Array.from({ length: n }, (_, i) => ({ materialId: 'm', topicId: 't' + i, title: 'T' + i, minutes: 40, sub: 'M', unit: i < n / 2 ? 'Unit 1' : 'Unit 2' }));
const ALL = [0, 1, 2, 3, 4, 5, 6];

test('planner: two revision passes (2 and 7 days later)', () => {
  const r = generatePlan({ topics: topics(2), startDate: '2026-11-18', dailyMinutes: 120, studyDays: ALL });
  for (const id of ['t0', 't1']) {
    const study = r.items.find(i => i.topicId === id && i.kind === 'study');
    const rev = r.items.filter(i => i.topicId === id && i.kind === 'revise').map(i => i.date);
    assert.equal(rev.length, 2);
    assert.ok(rev[0] >= addDays(study.date, 2) && rev[1] >= addDays(study.date, 7));
  }
});

test('planner: with an exam it paces evenly instead of front-loading', () => {
  const t = topics(10); // 400 min
  const r = generatePlan({ topics: t, startDate: '2026-11-18', dailyMinutes: 240, studyDays: ALL, examDate: '2026-12-08', revision: false });
  const dates = new Set(r.items.filter(i => i.kind === 'study').map(i => i.date));
  assert.ok(dates.size >= 8, 'spread over many days, not 2');
  assert.ok(r.fitsBeforeExam);
  assert.ok([...dates].every(d => d < '2026-12-08'));
});

test('planner: last two study days before the exam hold final revision', () => {
  const r = generatePlan({ topics: topics(6), startDate: '2026-11-18', dailyMinutes: 120, studyDays: ALL, examDate: '2026-12-08' });
  const fin = r.items.filter(i => i.title.startsWith('Final revision'));
  assert.equal(fin.length, 2); // one per unit
  assert.equal(r.finalRevisions, 2);
  assert.ok(fin.every(i => i.date >= '2026-12-06' && i.date < '2026-12-08'));
  const lastStudy = r.items.filter(i => i.kind === 'study').map(i => i.date).sort().at(-1);
  assert.ok(lastStudy < '2026-12-06');
  assert.ok(r.items.every(i => i.date < '2026-12-08'));
});

test('planner: too much for the time left is reported, daily cap respected otherwise', () => {
  const r = generatePlan({ topics: topics(40), startDate: '2026-11-18', dailyMinutes: 60, studyDays: ALL, examDate: '2026-11-28', revision: false });
  assert.equal(r.fitsBeforeExam, false);
  assert.ok(r.suggestedDaily > 60);
  const ok = generatePlan({ topics: topics(4), startDate: '2026-11-18', dailyMinutes: 90, studyDays: [1, 2, 3, 4, 5], revision: true });
  const per = {};
  for (const i of ok.items) per[i.date] = (per[i.date] || 0) + i.minutes;
  assert.ok(Object.values(per).every(m => m <= 90));
});
