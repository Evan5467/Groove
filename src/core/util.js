// Small shared helpers. No DOM access here so everything is testable in Node.

export class UserError extends Error {} // safe-to-show messages only

export const uid = () => globalThis.crypto.randomUUID();
export const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = s => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const isISO = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parseISO(s)) === s;
export const todayISO = () => iso(new Date());
export const addDays = (s, n) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const weekStart = s => {
  const d = parseISO(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return iso(d);
};
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

// Control characters and bidi overrides are stripped from every string that enters the app.
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
export const clean = (v, max = 200) =>
  String(v ?? '').replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max);
export const cleanText = (v, max = 4000) =>
  String(v ?? '').replace(CTRL, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
export const int = (v, min, max, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

const fmt = o => new Intl.DateTimeFormat('en-IN', o);
export const fmtLong = s => fmt({ day: 'numeric', month: 'long' }).format(parseISO(s));
export const fmtDow = s => fmt({ weekday: 'long' }).format(parseISO(s));
export const fmtShort = s => fmt({ weekday: 'short' }).format(parseISO(s));
export const fmtDM = s => fmt({ day: 'numeric', month: 'short' }).format(parseISO(s));
export const fmtBytes = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
