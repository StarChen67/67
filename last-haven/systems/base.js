import { EV } from '../core/events-catalog.js';

/**
 * 所有系統的基底。規則：
 *  - 永遠透過 this.ctx.state 讀狀態（getter），不得快取 state 物件。
 *  - 只寫自己擁有的子樹；跨系統只呼叫公開 API。
 *  - init()：註冊 bus 監聽與 modifier provider（只呼叫一次）。
 *  - onNewGame() / onStateLoaded()：狀態被建立或替換後的鉤子。
 *  - update(dt)：每個固定步長呼叫（dt ≤ balance.time.step）。
 */
export class System {
  constructor(ctx, name) {
    this.ctx = ctx;
    this.name = name;
  }
  get state() { return this.ctx.state; }
  get bus() { return this.ctx.bus; }
  get registry() { return this.ctx.registry; }
  get balance() { return this.ctx.registry.balance; }
  get rng() { return this.ctx.rng; }
  get systems() { return this.ctx.systems; }
  get modifiers() { return this.ctx.modifiers; }
  get effects() { return this.ctx.effects; }
  get clock() { return this.ctx.clock; }

  init() {}
  onNewGame() {}
  onStateLoaded() {}
  update(dt) {} // eslint-disable-line no-unused-vars

  log(text, kind = 'info') {
    this.bus.emit(EV.LOG, { text, kind, at: this.state?.clock?.time ?? 0 });
  }
  toast(text, kind = 'info') {
    this.bus.emit(EV.TOAST, { text, kind });
  }
  incStat(key, n = 1) {
    const s = this.state.stats;
    s[key] = (s[key] || 0) + n;
  }
  uid(prefix) { return this.ctx.uid(prefix); }
}
