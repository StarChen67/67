/* ============================================================
   game.js — Game 門面
   只做三件事：把系統接起來、管理生命週期、提供跨系統的彙總數字。
   遊戲規則都在 systems/ 裡，這裡不放規則。

   亂數：整場遊戲用同一條 seeded PRNG，狀態存在 state.rngState，
   所以讀檔後接續的結果和沒關過遊戲一樣，也讓測試可以重現。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;

  class Game {
    constructor(opts = {}) {
      this.opts = opts;
      this.storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : BT.Save.memoryStorage());
      this.clock = opts.clock || (() => Date.now());
      this.bus = U.EventBus();
      this.state = null;
      this.rng = Math.random;
      this._timer = null;
      this._acc = 0;
      this._lastTick = 0;
    }

    /* ---------------- 接線 ---------------- */
    _wire() {
      this.bus.clear();
      this.economy = new BT.Economy(this);
      this.reports = new BT.Reports(this);
      this.treasury = new BT.Treasury(this);
      this.credit = new BT.Credit(this);
      this.customers = new BT.Customers(this);
      this.deposits = new BT.Deposits(this);
      this.stocks = new BT.Stocks(this);
      this.products = new BT.Products(this);
      this.upgrades = new BT.Upgrades(this);
      this.printer = new BT.Printer(this);
      this.security = new BT.Security(this);
      this.robbery = new BT.Robbery(this);
      this.insurance = new BT.Insurance(this);
      this.events = new BT.Events(this);
      this.bankruptcy = new BT.Bankruptcy(this);
      this.sim = new BT.Simulation(this);
      this._bindRng();
    }

    /** 讓 rng 每次呼叫都把狀態寫回 state，這樣存檔能接續同一條亂數序列。 */
    _bindRng() {
      const base = U.rngFrom(this.state.rngState || this.state.seed || 1);
      const st = this.state;
      const fn = () => {
        const v = base();
        st.rngState = base.state();
        return v;
      };
      fn.base = base;
      this.rng = fn;
    }

    /* ---------------- 生命週期 ---------------- */
    newGame(bankName, seed) {
      const now = this.clock();
      const s = seed != null ? seed : U.hashStr(String(now) + Math.random());
      this.state = BT.createNewState(now, s, bankName);
      this._wire();
      this.reports.endDay(0);          // 第 0 天的基準快照，讓第一天的淨利算得出來
      this.save();
      return this.state;
    }
    load() {
      const r = BT.Save.load(this.storage);
      if (r.state) { this.state = r.state; this._wire(); }
      return r;
    }
    save() {
      if (!this.state) return false;
      return BT.Save.save(this.state, this.storage, this.clock());
    }
    exportSave() { return BT.Save.exportString(this.state, this.clock()); }
    importSave(str) {
      const r = BT.Save.importString(str);
      if (r.state) { this.state = r.state; this._wire(); this.save(); }
      return r;
    }

    /* ---------------- 時間控制 ---------------- */
    get day() { return this.state.day; }
    isPaused() { return this.state.paused || !!this.state.gameOver; }
    setPaused(v) { this.state.paused = !!v; this.bus.emit('time:paused', { paused: this.state.paused }); }
    togglePause() { this.setPaused(!this.state.paused); }
    setSpeed(n) {
      const speeds = BT.CONFIG.time.speeds;
      this.state.speed = speeds.indexOf(n) >= 0 ? n : speeds[0];
      this.bus.emit('time:speed', { speed: this.state.speed });
    }
    /** 手動推進一天（暫停時也能用）。 */
    step() {
      if (this.state.gameOver) return null;
      const r = this.sim.advanceDay();
      this._maybeAutosave();
      return r;
    }
    _maybeAutosave() {
      if (!this.state.settings.autosave) return;
      if (this.state.day % BT.CONFIG.time.autosaveEveryDays === 0) this.save();
    }

    /** 由 UI 的 setInterval 呼叫；依速度決定要推進幾天。 */
    tick(nowMs) {
      const now = nowMs != null ? nowMs : this.clock();
      if (!this._lastTick) { this._lastTick = now; return 0; }
      const dt = now - this._lastTick;
      this._lastTick = now;
      if (this.isPaused()) return 0;
      this._acc += dt * this.state.speed;
      const per = BT.CONFIG.time.msPerDay;
      let n = 0;
      while (this._acc >= per && n < 40) {     // 上限避免分頁切回來時一次跑幾千天
        this._acc -= per;
        this.sim.advanceDay();
        n += 1;
        if (this.state.gameOver) { this._acc = 0; break; }
      }
      if (n > 0) this._maybeAutosave();
      return n;
    }
    /** 目前這一天過了幾成（進度條用）。 */
    dayProgress() {
      return U.clamp(this._acc / BT.CONFIG.time.msPerDay, 0, 1);
    }

    /* ---------------- 彙總數字（UI 與各系統共用） ---------------- */
    totals() {
      const s = this.state;
      const cash = s.bank.cash;
      const stockValue = this.stocks.totalValue();
      const productValue = this.products.totalValue(s.day);
      const deposits = this.customers.totalDeposits();
      const payable = s.deposits.payable;
      const obligations = this.treasury.obligationsTotal();
      const loans = this.treasury.loanTotal();
      const assets = U.money(cash + stockValue + productValue);
      const liabilities = U.money(deposits + payable + obligations + loans);
      return {
        cash, stockValue, productValue, deposits, payable, obligations, loans,
        assets, liabilities, net: U.money(assets - liabilities),
        /** 準備率：現金 / 客戶存款。低於 10% 就很危險。 */
        reserveRatio: deposits > 0 ? cash / deposits : 1,
      };
    }

    /** 每日固定支出的預估（UI 的「每日支出」欄）。 */
    dailyExpense() {
      const opex = U.money(this.upgrades.level().opex * this.economy.costMult());
      const sec = this.security.dailyCost();
      const interest = U.money(this.deposits.dailyInterest());
      const premium = this.insurance.premium();
      const loanInt = U.money(U.sum(this.state.treasury.loans, (l) => l.principal * l.dailyRate));
      return { opex, security: sec, interest, premium, loanInterest: loanInt, total: U.money(opex + sec + interest + premium + loanInt) };
    }
    /** 每日收入的預估（不含股價波動，那是未實現的）。 */
    dailyIncome() {
      const products = U.money(U.sum(this.state.products.holdings, (h) => {
        const d = this.products.def(h.productId);
        return h.amount * d.yield / 365;
      }));
      const reserve = U.money(this.state.bank.cash * this.treasury.reserveYieldRate() / 365);
      return { products, reserve, total: U.money(products + reserve) };
    }
  }

  BT.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
