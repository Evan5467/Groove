import { ITER, deriveKey, importDek, seal, open, randBytes, toB64, fromB64, passIssue } from './crypto.js';
import { UserError } from './util.js';

const te = new TextEncoder();
const td = new TextDecoder();
const REC_RE = /^(material|task|routine|settings):[A-Za-z0-9-]{1,64}$/;
const BLOB_RE = /^[A-Za-z0-9-]{1,64}$/;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_BACKUP = 150 * 1024 * 1024;

export class Vault {
  constructor(store, { iter = ITER, minIter = 100_000 } = {}) {
    this.store = store;
    this.iter = iter;
    this.minIter = minIter;
    this.dek = null;
    this.skipped = 0; // records that failed to decrypt on last list()
  }
  get unlocked() { return !!this.dek; }
  async isSetUp() { return !!(await this.store.getMeta('vault')); }

  async setup(pass) {
    const issue = passIssue(pass);
    if (issue) throw new UserError(issue);
    const salt = randBytes(16);
    const kek = await deriveKey(pass, salt, this.iter);
    const raw = randBytes(32);
    const dek = await seal(kek, raw, 'dek');
    await this.store.setMeta('vault', { salt, iter: this.iter, dek }); // one write = no half-setup state
    this.dek = await importDek(raw);
    raw.fill(0);
  }

  // true = unlocked, false = wrong passcode. Throws UserError with retryMs when throttled.
  async unlock(pass) {
    const m = await this.store.getMeta('vault');
    if (!m) throw new UserError('Nothing to unlock yet.');
    const f = (await this.store.getMeta('fails')) || { n: 0, until: 0 };
    const now = Date.now();
    if (f.until > now) {
      const e = new UserError('Too many attempts.');
      e.retryMs = f.until - now;
      throw e;
    }
    try {
      const kek = await deriveKey(String(pass), m.salt, m.iter);
      const raw = await open(kek, m.dek, 'dek');
      this.dek = await importDek(raw);
      raw.fill(0);
      await this.store.setMeta('fails', { n: 0, until: 0 });
      return true;
    } catch {
      const n = f.n + 1;
      const until = n >= 3 ? now + Math.min(5000 * 2 ** (n - 3), 900_000) : 0;
      await this.store.setMeta('fails', { n, until });
      return false;
    }
  }

  lock() { this.dek = null; }

  need() { if (!this.dek) throw new UserError('Unlock the app first.'); }

  async changePass(oldPass, newPass) {
    this.need();
    const issue = passIssue(newPass);
    if (issue) throw new UserError(issue);
    const m = await this.store.getMeta('vault');
    let raw;
    try { raw = await open(await deriveKey(oldPass, m.salt, m.iter), m.dek, 'dek'); }
    catch { throw new UserError('Current passcode is wrong.'); }
    const salt = randBytes(16);
    const dek = await seal(await deriveKey(newPass, salt, this.iter), raw, 'dek');
    raw.fill(0);
    await this.store.setMeta('vault', { salt, iter: this.iter, dek }); // data stays as-is: only the key wrapper changes
  }

  async putRecord(kind, id, obj) {
    this.need();
    const key = `${kind}:${id}`;
    if (!REC_RE.test(key)) throw new Error('bad key');
    await this.store.put('records', key, await seal(this.dek, te.encode(JSON.stringify(obj)), key));
  }
  async delRecord(kind, id) { await this.store.del('records', `${kind}:${id}`); }

  async list(kind) {
    this.need();
    const out = [];
    this.skipped = 0;
    for (const [key, packed] of await this.store.all('records')) {
      if (!key.startsWith(kind + ':')) continue;
      try { out.push(JSON.parse(td.decode(await open(this.dek, packed, key)))); }
      catch { this.skipped++; }
    }
    return out;
  }

  async putBlob(id, bytes) {
    this.need();
    if (!BLOB_RE.test(id)) throw new Error('bad id');
    await this.store.put('blobs', id, await seal(this.dek, bytes, 'blob:' + id));
  }
  async getBlob(id) {
    this.need();
    const packed = await this.store.get('blobs', id);
    if (!packed) return null;
    return open(this.dek, packed, 'blob:' + id);
  }
  async delBlob(id) { await this.store.del('blobs', id); }

  async wipe() {
    this.lock();
    await this.store.clear();
  }

  // Backups contain ciphertext only. They need the passcode that was active when they were made.
  async exportBackup() {
    this.need();
    const m = await this.store.getMeta('vault');
    const records = {};
    for (const [k, v] of await this.store.all('records')) records[k] = toB64(v);
    const blobs = {};
    for (const [k, v] of await this.store.all('blobs')) blobs[k] = toB64(v);
    return JSON.stringify({
      format: 'tempo-backup', v: 1,
      vault: { salt: toB64(m.salt), iter: m.iter, dek: toB64(m.dek) },
      records, blobs
    });
  }

  // Validates and fully decrypts the backup BEFORE touching local data. Returns false on wrong passcode.
  async restore(json, pass) {
    if (typeof json !== 'string' || json.length > MAX_BACKUP) throw new UserError('That backup file is not valid.');
    let b;
    try { b = JSON.parse(json); } catch { throw new UserError('That backup file is not valid.'); }
    const bad = () => new UserError('That backup file is not valid.');
    if (!b || b.format !== 'tempo-backup' || b.v !== 1 || !b.vault || typeof b.records !== 'object' || typeof b.blobs !== 'object') throw bad();
    const { salt, iter, dek } = b.vault;
    if (![salt, dek].every(s => typeof s === 'string' && B64_RE.test(s) && s.length < 400)) throw bad();
    if (!Number.isInteger(iter) || iter < this.minIter || iter > 5_000_000) throw bad();
    const recEntries = Object.entries(b.records);
    const blobEntries = Object.entries(b.blobs);
    if (recEntries.length > 20000 || blobEntries.length > 2000) throw bad();
    for (const [k, v] of recEntries) if (!REC_RE.test(k) || typeof v !== 'string' || !B64_RE.test(v)) throw bad();
    for (const [k, v] of blobEntries) if (!BLOB_RE.test(k) || typeof v !== 'string' || !B64_RE.test(v)) throw bad();

    const meta = { salt: fromB64(salt), iter, dek: fromB64(dek) };
    let raw;
    try { raw = await open(await deriveKey(String(pass), meta.salt, iter), meta.dek, 'dek'); }
    catch { return false; }
    const key = await importDek(raw);
    raw.fill(0);
    const records = [];
    const blobs = [];
    try {
      for (const [k, v] of recEntries) {
        const packed = fromB64(v);
        JSON.parse(td.decode(await open(key, packed, k))); // must decrypt AND parse
        records.push([k, packed]);
      }
      for (const [k, v] of blobEntries) {
        const packed = fromB64(v);
        await open(key, packed, 'blob:' + k);
        blobs.push([k, packed]);
      }
    } catch { throw new UserError('That backup is damaged, so nothing was changed.'); }

    await this.store.replaceAll({ meta: { vault: meta, fails: { n: 0, until: 0 } }, records, blobs });
    this.dek = key;
    return true;
  }
}
