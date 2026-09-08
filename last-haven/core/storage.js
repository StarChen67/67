/**
 * Storage adapter：瀏覽器用 localStorage，Node/測試或不可用時用記憶體 Map。
 * 值一律 JSON 序列化。這是 core/ 中唯一允許提到 localStorage 的檔案。
 */
export class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  key(i) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}

export class Storage {
  constructor(backend = null, prefix = 'lasthaven.') {
    this.prefix = prefix;
    this.backend = backend || Storage.detect();
  }
  static detect() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof localStorage !== 'undefined') { localStorage.setItem('__lh_t', '1'); localStorage.removeItem('__lh_t'); return localStorage; }
    } catch { /* fallthrough */ }
    return new MemoryStorage();
  }
  get(key) {
    try {
      const raw = this.backend.getItem(this.prefix + key);
      return raw == null ? null : JSON.parse(raw);
    } catch { return null; }
  }
  getRaw(key) {
    try { return this.backend.getItem(this.prefix + key); } catch { return null; }
  }
  set(key, value) {
    try { this.backend.setItem(this.prefix + key, JSON.stringify(value)); return true; } catch { return false; }
  }
  remove(key) {
    try { this.backend.removeItem(this.prefix + key); } catch { /* ignore */ }
  }
  keys() {
    const out = [];
    try {
      for (let i = 0; i < this.backend.length; i++) {
        const k = this.backend.key(i);
        if (k && k.startsWith(this.prefix)) out.push(k.slice(this.prefix.length));
      }
    } catch { /* ignore */ }
    return out;
  }
}
