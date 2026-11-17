// Storage adapters. The vault only sees ciphertext, so swapping this for SQLite/native later is easy.
// Buckets: meta (small settings), records (encrypted JSON), blobs (encrypted files).

export class MemoryStore {
  constructor() {
    this.m = { meta: new Map(), records: new Map(), blobs: new Map() };
  }
  async getMeta(k) { return this.m.meta.get(k); }
  async setMeta(k, v) { this.m.meta.set(k, v); }
  async put(b, k, v) { this.m[b].set(k, v); }
  async get(b, k) { return this.m[b].get(k); }
  async del(b, k) { this.m[b].delete(k); }
  async all(b) { return [...this.m[b].entries()]; }
  async clear() { for (const x of Object.values(this.m)) x.clear(); }
  // all-or-nothing swap used by restore
  async replaceAll({ meta, records, blobs }) {
    const next = { meta: new Map(Object.entries(meta)), records: new Map(records), blobs: new Map(blobs) };
    this.m = next;
  }
}

const DB = 'tempo-vault';
const STORES = ['meta', 'records', 'blobs'];

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { for (const s of STORES) r.result.createObjectStore(s); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(new Error('Storage unavailable'));
  });
}

export class IDBStore {
  constructor() { this.p = null; }
  db() { return (this.p ||= openDb()); }

  async tx(store, mode, fn) {
    const db = await this.db();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      let req;
      try { req = fn(t.objectStore(store)); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(req?.result);
      t.onerror = t.onabort = () => rej(new Error('Storage error'));
    });
  }
  getMeta(k) { return this.tx('meta', 'readonly', os => os.get(k)); }
  setMeta(k, v) { return this.tx('meta', 'readwrite', os => os.put(v, k)); }
  put(b, k, v) { return this.tx(b, 'readwrite', os => os.put(v, k)); }
  get(b, k) { return this.tx(b, 'readonly', os => os.get(k)); }
  del(b, k) { return this.tx(b, 'readwrite', os => os.delete(k)); }

  async all(b) {
    const db = await this.db();
    return new Promise((res, rej) => {
      const t = db.transaction(b, 'readonly');
      const os = t.objectStore(b);
      const k = os.getAllKeys();
      const v = os.getAll();
      t.oncomplete = () => res(k.result.map((key, i) => [key, v.result[i]]));
      t.onerror = t.onabort = () => rej(new Error('Storage error'));
    });
  }
  async clear() {
    const db = await this.db();
    return new Promise((res, rej) => {
      const t = db.transaction(STORES, 'readwrite');
      for (const s of STORES) t.objectStore(s).clear();
      t.oncomplete = () => res();
      t.onerror = t.onabort = () => rej(new Error('Storage error'));
    });
  }
  async replaceAll({ meta, records, blobs }) {
    const db = await this.db();
    return new Promise((res, rej) => {
      const t = db.transaction(STORES, 'readwrite'); // one transaction: all or nothing
      for (const s of STORES) t.objectStore(s).clear();
      for (const [k, v] of Object.entries(meta)) t.objectStore('meta').put(v, k);
      for (const [k, v] of records) t.objectStore('records').put(v, k);
      for (const [k, v] of blobs) t.objectStore('blobs').put(v, k);
      t.oncomplete = () => res();
      t.onerror = t.onabort = () => rej(new Error('Storage error'));
    });
  }
}
