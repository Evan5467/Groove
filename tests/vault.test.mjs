import test from 'node:test';
import assert from 'node:assert/strict';
import { Vault } from '../src/core/vault.js';
import { MemoryStore } from '../src/core/storage.js';
import { ITER, passIssue } from '../src/core/crypto.js';

const FAST = { iter: 1000, minIter: 1000 };
const PASS = 'correct horse battery';
const fresh = async () => {
  const v = new Vault(new MemoryStore(), FAST);
  await v.setup(PASS);
  return v;
};

test('production key-derivation cost is at least 600k iterations', () => {
  assert.ok(ITER >= 600_000);
  assert.equal(new Vault(new MemoryStore()).iter, ITER);
});

test('weak passcodes are rejected', () => {
  assert.ok(passIssue('short'));
  assert.ok(passIssue('aaaaaaaaaa'));
  assert.ok(passIssue('password'));
  assert.equal(passIssue('correct horse battery'), '');
});

test('records round-trip and stored bytes do not contain plaintext', async () => {
  const v = await fresh();
  await v.putRecord('task', 'a1', { title: 'SECRET-STUDY-PLAN' });
  const [, packed] = (await v.store.all('records'))[0];
  assert.ok(!Buffer.from(packed).includes('SECRET-STUDY-PLAN'));
  assert.deepEqual(await v.list('task'), [{ title: 'SECRET-STUDY-PLAN' }]);
});

test('wrong passcode fails, right passcode unlocks, data survives a lock', async () => {
  const v = await fresh();
  await v.putRecord('routine', 'r1', { title: 'x' });
  v.lock();
  assert.equal(await v.unlock('not the passcode'), false);
  assert.equal(await v.unlock(PASS), true);
  assert.equal((await v.list('routine')).length, 1);
});

test('locked vault refuses to read or write', async () => {
  const v = await fresh();
  v.lock();
  await assert.rejects(() => v.list('task'));
  await assert.rejects(() => v.putRecord('task', 'a', {}));
});

test('repeated wrong attempts are throttled', async () => {
  const v = await fresh();
  v.lock();
  for (let i = 0; i < 3; i++) assert.equal(await v.unlock('wrong wrong'), false);
  await assert.rejects(() => v.unlock(PASS), e => e.retryMs > 0);
});

test('tampered ciphertext is detected, not silently accepted', async () => {
  const v = await fresh();
  await v.putRecord('task', 'a1', { title: 'hi' });
  const [key, packed] = (await v.store.all('records'))[0];
  packed[packed.length - 1] ^= 1;
  await v.store.put('records', key, packed);
  assert.deepEqual(await v.list('task'), []);
  assert.equal(v.skipped, 1);
});

test('ciphertext cannot be moved to another record id', async () => {
  const v = await fresh();
  await v.putRecord('task', 'a1', { title: 'hi' });
  const [, packed] = (await v.store.all('records'))[0];
  await v.store.put('records', 'task:b2', packed);
  assert.equal((await v.list('task')).length, 1);
  assert.equal(v.skipped, 1);
});

test('changing the passcode keeps data and invalidates the old one', async () => {
  const v = await fresh();
  await v.putRecord('task', 'a1', { title: 'keep me' });
  await assert.rejects(() => v.changePass('wrong one', 'brand new phrase'));
  await v.changePass(PASS, 'brand new phrase');
  v.lock();
  assert.equal(await v.unlock(PASS), false);
  assert.equal(await v.unlock('brand new phrase'), true);
  assert.deepEqual(await v.list('task'), [{ title: 'keep me' }]);
});

test('files are encrypted and round-trip', async () => {
  const v = await fresh();
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  await v.putBlob('f1', bytes);
  assert.deepEqual([...(await v.getBlob('f1'))], [...bytes]);
  assert.equal(await v.getBlob('missing'), null);
});

test('backup restore: export, restore into a new device, data identical', async () => {
  const a = await fresh();
  await a.putRecord('material', 'm1', { title: 'Mano ch1' });
  await a.putRecord('task', 't1', { title: 'Read' });
  await a.putBlob('f1', new Uint8Array(40).fill(7));
  const backup = await a.exportBackup();
  assert.ok(!backup.includes('Mano'));

  const b = new Vault(new MemoryStore(), FAST);
  assert.equal(await b.restore(backup, 'wrong passcode here'), false);
  assert.equal(await b.isSetUp(), false); // failed restore changed nothing
  assert.equal(await b.restore(backup, PASS), true);
  assert.deepEqual(await b.list('material'), [{ title: 'Mano ch1' }]);
  assert.deepEqual([...(await b.getBlob('f1'))], new Array(40).fill(7));
  b.lock();
  assert.equal(await b.unlock(PASS), true);
});

test('damaged or hostile backups are rejected and leave local data untouched', async () => {
  const a = await fresh();
  await a.putRecord('task', 't1', { title: 'Read' });
  const good = JSON.parse(await a.exportBackup());

  const dev = await fresh();
  await dev.putRecord('task', 'mine', { title: 'my data' });

  const flipped = structuredClone(good);
  const k = Object.keys(flipped.records)[0];
  flipped.records[k] = flipped.records[k].slice(0, -6) + 'AAAAAA';
  await assert.rejects(() => dev.restore(JSON.stringify(flipped), PASS));

  // JSON text with a real own "__proto__" key (assigning it in JS would be a silent no-op)
  const evilKey = JSON.stringify(good).replace('"records":{', '"records":{"__proto__":"AAAA",');
  assert.ok(Object.hasOwn(JSON.parse(evilKey).records, '__proto__'));
  await assert.rejects(() => dev.restore(evilKey, PASS));

  const lowIter = structuredClone(good);
  lowIter.vault.iter = 1;
  await assert.rejects(() => dev.restore(JSON.stringify(lowIter), PASS));

  await assert.rejects(() => dev.restore('not json', PASS));
  await assert.rejects(() => dev.restore(JSON.stringify({ format: 'other' }), PASS));

  assert.deepEqual(await dev.list('task'), [{ title: 'my data' }]);
});

test('wipe removes everything', async () => {
  const v = await fresh();
  await v.putRecord('task', 'a', { title: 'x' });
  await v.wipe();
  assert.equal(await v.isSetUp(), false);
  assert.equal((await v.store.all('records')).length, 0);
});
