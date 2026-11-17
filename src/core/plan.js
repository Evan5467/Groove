// Turns an ordered list of topics into dated study sessions.
//  - spaced revision: a short review 2 days and again 7 days after each topic
//  - with an exam date: steady pacing (no last-minute cramming), a buffer, and the last two
//    study days reserved for a final revision of every unit
import { addDays, int, parseISO, uid } from './util.js';

export const REVISION_GAPS = [2, 7];

export function nextStudyDay(date, studyDays) {
  let d = date;
  for (let i = 0; i < 14; i++) {
    if (studyDays.includes(parseISO(d).getDay())) return d;
    d = addDays(d, 1);
  }
  return date;
}

/**
 * topics: [{ materialId, topicId, title, minutes, sub, unit }]
 * busy:   (date) => minutes already committed that day (manual tasks, routines)
 */
export function generatePlan({ topics, startDate, dailyMinutes, studyDays, examDate = '', revision = true, busy = () => 0 }) {
  const daily = int(dailyMinutes, 15, 720, 120);
  const days = studyDays?.length ? studyDays : [1, 2, 3, 4, 5, 6];
  const mins = topics.map(t => int(t.minutes, 5, 600, 30));
  const total = mins.reduce((a, b) => a + b, 0);

  // study days available before the exam; the last two are kept for final revision
  const avail = [];
  if (examDate) for (let d = startDate; d < examDate && avail.length < 400; d = addDays(d, 1)) if (days.includes(parseISO(d).getDay())) avail.push(d);
  const reserve = avail.length >= 5 ? 2 : 0;
  const window = avail.length - reserve;

  // steady pacing: if it all fits comfortably, spread it out with a 25% buffer instead of front-loading
  let capDay = daily;
  if (examDate && window > 0 && total <= window * daily * 0.85) capDay = Math.min(daily, Math.max(30, Math.ceil((total / window) * 1.25 / 5) * 5));

  const queue = [];
  topics.forEach((t, k) => {
    const m = mins[k];
    const parts = Math.max(1, Math.ceil(m / capDay));
    let left = m;
    for (let i = 0; i < parts; i++) {
      const part = i === parts - 1 ? left : Math.round(m / parts);
      left -= part;
      queue.push({ ...t, base: t.title, title: parts > 1 ? `${t.title} (${i + 1}/${parts})` : t.title, minutes: part, last: i === parts - 1 });
    }
  });

  const items = [];
  const pending = [];
  const used = {};
  const mk = (date, kind, x) => {
    used[date] = (used[date] || 0) + x.minutes;
    return {
      id: uid(), date, kind, title: x.title, minutes: x.minutes,
      // createdAt doubles as the order key: unique and increasing, so the plan reloads in the same order
      materialId: x.materialId, topicId: x.topicId || '', sub: x.sub || '', done: false, createdAt: Date.now() + items.length
    };
  };

  let date = nextStudyDay(startDate, days);
  let qi = 0;
  for (let guard = 0; (qi < queue.length || pending.length) && guard < 900; guard++) {
    let cap = capDay - busy(date);
    for (let i = 0; i < pending.length;) {
      const r = pending[i];
      if (r.due <= date && r.minutes <= cap) {
        items.push(mk(date, 'revise', r));
        cap -= r.minutes;
        pending.splice(i, 1);
      } else i++;
    }
    let placed = 0;
    while (qi < queue.length) {
      const t = queue[qi];
      if (!(t.minutes <= cap || (placed === 0 && cap > 0 && t.minutes <= cap * 1.5))) break;
      items.push(mk(date, 'study', t));
      cap -= t.minutes;
      placed++;
      qi++;
      if (revision && t.last) {
        REVISION_GAPS.forEach((gap, g) => {
          const due = addDays(date, gap);
          if (!examDate || due < examDate) {
            const m = g === 0 ? Math.max(10, Math.min(15, Math.round(t.minutes / 3))) : 10;
            pending.push({ due, minutes: m, title: `Revise: ${t.base}`, materialId: t.materialId, topicId: t.topicId, sub: t.sub });
          }
        });
      }
    }
    date = nextStudyDay(addDays(date, 1), days);
  }

  // final revision: one session per unit on the reserved days right before the exam
  let finalRevisions = 0;
  const lastStudy = items.reduce((a, i) => (i.kind === 'study' && i.date > a ? i.date : a), '');
  if (revision && reserve && lastStudy < avail[window]) {
    const units = new Map();
    topics.forEach((t, k) => units.set(t.unit || t.sub || 'Everything', (units.get(t.unit || t.sub || 'Everything') || 0) + mins[k]));
    const sessions = [...units].map(([u, m]) => ({ title: `Final revision: ${u}`, minutes: Math.min(45, Math.max(15, Math.round(m / 4 / 5) * 5)), materialId: topics[0].materialId, sub: topics[0].sub }));
    let di = window;
    let room = daily - busy(avail[di]) - (used[avail[di]] || 0);
    for (const s of sessions) {
      while (room < s.minutes && di < avail.length - 1) { di++; room = daily - busy(avail[di]) - (used[avail[di]] || 0); }
      if (room < s.minutes) break;
      items.push(mk(avail[di], 'revise', s));
      room -= s.minutes;
      finalRevisions++;
    }
  }

  const study = items.filter(i => i.kind === 'study');
  const lastDate = items.reduce((a, i) => (i.date > a ? i.date : a), startDate);
  const totalMinutes = study.reduce((a, i) => a + i.minutes, 0);
  let fitsBeforeExam = true, overflowCount = 0, suggestedDaily = null;
  if (examDate) {
    overflowCount = study.filter(i => i.date >= examDate).length;
    fitsBeforeExam = overflowCount === 0;
    if (avail.length > 0 && !fitsBeforeExam) suggestedDaily = Math.ceil(totalMinutes / avail.length / 5) * 5;
  }
  return { items, endDate: lastDate, totalMinutes, fitsBeforeExam, overflowCount, suggestedDaily, finalRevisions };
}

// Everything that shows on one day: recurring routine blocks + dated tasks.
export function dayItems(date, tasks, routines) {
  const dow = parseISO(date).getDay();
  const out = [];
  for (const r of routines) {
    if (r.days.includes(dow)) out.push({ key: 'r:' + r.id, ref: { type: 'routine', id: r.id }, title: r.title, minutes: r.minutes, time: r.time, done: r.doneDates.includes(date), kind: 'routine', sub: '' });
  }
  for (const t of tasks) {
    if (t.date === date) out.push({ key: 't:' + t.id, ref: { type: 'task', id: t.id }, title: t.title, minutes: t.minutes, time: '', done: t.done, kind: t.kind, sub: t.sub || '' });
  }
  return out.sort((a, b) => (a.time && b.time ? a.time.localeCompare(b.time) : a.time ? -1 : b.time ? 1 : 0));
}
