// Works out which reminders should exist, from the current plan. Pure function, so it is testable.
// Android only fires notifications that were scheduled in advance, so the app re-plans them
// (14 days ahead) whenever your plan or settings change while it is unlocked.
import { addDays, iso, parseISO } from './util.js';
import { dayItems } from './plan.js';

export const HORIZON_DAYS = 14;
export const MAX_NOTIFICATIONS = 150;
const DAY = 86400000;

const at = (date, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = parseISO(date);
  d.setHours(h, m, 0, 0);
  return d;
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function backupBase(settings) {
  return settings.lastBackupAt || settings.createdAt || 0;
}
export function backupDue(settings, now = Date.now()) {
  const r = settings.remind;
  const base = backupBase(settings);
  return !!(r.backup && base && now - base >= r.backupDays * DAY);
}

export function computeSchedule({ tasks, routines, settings, now = new Date() }) {
  const r = settings.remind;
  if (!r.enabled) return [];
  const out = [];
  const today = iso(now);

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = addDays(today, i);
    const items = dayItems(date, tasks, routines);
    const open = items.filter(x => !x.done);
    if (open.length) {
      const mins = open.reduce((a, x) => a + x.minutes, 0);
      const names = open.slice(0, 3).map(x => x.title).join(' · ');
      const count = `${plural(open.length, 'session')} · ${mins} min`;
      const w1 = at(date, r.dailyTime);
      if (w1 > now) out.push({ at: w1, title: 'Time to study', body: r.showTitles ? `${count}\n${names}` : `You have ${count} today.` });
      if (r.nudge) {
        const w2 = at(date, r.nudgeTime);
        if (w2 > now && w2 > w1) out.push({ at: w2, title: 'Still on today’s list', body: r.showTitles ? `${plural(open.length, 'session')} left: ${names}` : `${plural(open.length, 'session')} left · ${mins} min. Even one counts.` });
      }
    }
    for (const it of items) {
      if (it.ref.type !== 'routine' || !it.time || it.done) continue;
      const w = at(date, it.time);
      w.setMinutes(w.getMinutes() - r.routineLead);
      if (w > now) out.push({ at: w, title: r.showTitles ? it.title : 'Routine starting soon', body: r.routineLead ? `Starts at ${it.time} · ${it.minutes} min` : `Now · ${it.minutes} min` });
    }
  }

  if (r.backup) {
    const base = backupBase(settings);
    if (base) {
      let due = at(iso(new Date(base + r.backupDays * DAY)), '20:00');
      if (due <= now) { // already overdue: remind this evening, or tomorrow evening
        due = at(today, '20:00');
        if (due <= now) due = at(addDays(today, 1), '20:00');
      }
      for (let k = 0; k < 4; k++) {
        out.push({ at: at(addDays(iso(due), k * r.backupDays), '20:00'), title: 'Back up Tempo', body: 'Export an encrypted backup so your plan is safe if you lose this phone.' });
      }
    }
  }

  out.sort((a, b) => a.at - b.at);
  return out.slice(0, MAX_NOTIFICATIONS).map((n, i) => ({ ...n, id: i + 1 }));
}
