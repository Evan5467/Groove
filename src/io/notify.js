// Local notifications (Android). Everything is scheduled on the phone: no server, no push service.
// Notifications use a "private" channel, so Android hides their text on a secured lock screen.
import { Capacitor } from '@capacitor/core';
import { computeSchedule } from '../core/remind.js';

const native = () => Capacitor.isNativePlatform();
const plugin = async () => (await import('@capacitor/local-notifications')).LocalNotifications;
const CHANNEL = 'tempo-reminders';

export const remindersSupported = native;

export async function reminderPermission() {
  if (!native()) return 'unsupported';
  return (await (await plugin()).checkPermissions()).display;
}
export async function requestReminderPermission() {
  if (!native()) return 'unsupported';
  return (await (await plugin()).requestPermissions()).display;
}

const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
let lastSig = '';

async function cancelAll(p) {
  const { notifications } = await p.getPending();
  if (notifications.length) await p.cancel({ notifications });
}

// Re-plans the notifications only when the computed set has actually changed.
export async function syncReminders(S, { force = false } = {}) {
  if (!native()) return;
  const list = computeSchedule({ tasks: S.tasks, routines: S.routines, settings: S.settings });
  const sig = fnv(JSON.stringify(list.map(n => [n.at.getTime(), n.title, n.body])));
  if (!force && sig === lastSig) return;
  const p = await plugin();
  await cancelAll(p);
  if (list.length && (await p.checkPermissions()).display === 'granted') {
    await p.createChannel({ id: CHANNEL, name: 'Study reminders', description: 'Daily plan, routines and backup reminders', importance: 3, visibility: 0 });
    await p.schedule({ notifications: list.map(n => ({ id: n.id, title: n.title, body: n.body, channelId: CHANNEL, schedule: { at: n.at, allowWhileIdle: true } })) });
  }
  lastSig = sig;
}

export async function clearReminders() {
  if (!native()) return;
  await cancelAll(await plugin());
  lastSig = '';
}

export async function testReminder() {
  const p = await plugin();
  await p.createChannel({ id: CHANNEL, name: 'Study reminders', description: 'Daily plan, routines and backup reminders', importance: 3, visibility: 0 });
  await p.schedule({ notifications: [{ id: 999999, title: 'Tempo', body: 'Reminders are working.', channelId: CHANNEL, schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
}
