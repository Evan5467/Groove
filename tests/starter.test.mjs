import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTER, starterOutline, starterTopics } from '../src/core/starter.js';
import { sanitizeOutline, sanitizeTask } from '../src/core/schema.js';
import { isISO } from '../src/core/util.js';

const count = o => o.reduce((a, u) => a + u.chapters.reduce((b, c) => b + c.topics.length, 0), 0);

test('starter: every subject survives sanitising with all topics and in the same order', () => {
  for (const sub of STARTER) {
    const clean = sanitizeOutline(starterOutline(sub));
    assert.equal(count(clean), starterTopics(sub).length, sub.title);
    const titles = clean.flatMap(u => u.chapters.flatMap(c => c.topics.map(t => t.title)));
    assert.deepEqual(titles, starterTopics(sub).map(t => t.title), 'order and titles preserved: ' + sub.title);
  }
});

test('starter: CSA schedule dates are valid, ordered and match the screenshot (Nov 17 to Dec 11)', () => {
  const csa = STARTER[0];
  const dates = [...starterTopics(csa).filter(t => t.on).map(t => t.on), ...csa.extra.map(x => x.date)].sort();
  assert.ok(dates.every(isISO));
  assert.equal(dates[0], '2026-11-17');
  assert.equal(dates.at(-1), '2026-12-11');
  assert.equal(new Set(dates).size, dates.length, 'one entry per day');
  assert.equal(dates.length, 25);
  assert.ok(csa.extra.some(x => x.date === '2026-11-28' && /Practical/.test(x.title)));
  assert.equal(csa.examDate, '2026-12-11');
});

test('starter: tasks build cleanly', () => {
  for (const sub of STARTER) for (const x of sub.extra) assert.ok(sanitizeTask({ id: 'a1', date: x.date, title: x.title, minutes: x.minutes, kind: x.kind }), x.title);
  for (const t of starterTopics(STARTER[0]).filter(t => t.on)) assert.ok(sanitizeTask({ id: 'a1', date: t.on, title: t.title, minutes: t.minutes, kind: 'study' }), t.title);
});

test('starter: four subjects with the right unit counts', () => {
  assert.deepEqual(STARTER.map(s => s.units.length), [7, 4, 5, 3]);
});
