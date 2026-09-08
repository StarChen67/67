/**
 * 極簡 EventBus。系統之間、系統與 UI 之間唯一的鬆耦合管道。
 * 監聽器丟出的例外會被隔離（不會中斷 tick），並轉交 onError。
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.onError = (err, name) => { if (typeof console !== 'undefined') console.error(`[EventBus] listener error on "${name}"`, err); };
    this.history = []; // 最近事件（除錯/測試用）
    this.historyLimit = 200;
  }
  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (payload) => { off(); fn(payload); });
    return off;
  }
  off(name, fn) {
    const set = this.listeners.get(name);
    if (set) set.delete(fn);
  }
  emit(name, payload) {
    if (name !== 'tick') {
      this.history.push({ name, payload });
      if (this.history.length > this.historyLimit) this.history.shift();
    }
    const set = this.listeners.get(name);
    if (set) {
      for (const fn of [...set]) {
        try { fn(payload, name); } catch (err) { this.onError(err, name); }
      }
    }
    const any = this.listeners.get('*');
    if (any) {
      for (const fn of [...any]) {
        try { fn(payload, name); } catch (err) { this.onError(err, name); }
      }
    }
  }
  clear() { this.listeners.clear(); this.history.length = 0; }
}
