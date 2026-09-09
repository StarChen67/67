/* ============================================================
   systems/products.js — 理財商品（固定期限投資）
   跟股票的差別是「流動性」：報酬確定，但錢被鎖到到期日。
   客戶擠兌的時候，鎖住的錢救不了你——提前贖回要付罰則。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;

  class Products {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.products; }

    def(id) { return BT.registries.products.get(id); }
    holdings() { return this.st.holdings; }
    available() {
      const lv = this.game.state.bank.level;
      return BT.registries.products.filter((p) => lv >= p.minLevel);
    }
    isAvailable(id) {
      const d = this.def(id);
      return !!d && this.game.state.bank.level >= d.minLevel;
    }

    /** 到期可領金額。 */
    maturityValue(h) {
      const d = this.def(h.productId);
      return U.money(h.amount * (1 + d.yield * d.termDays / 365));
    }
    /** 目前已經賺到的部分（線性應計）。淨資產計算用這個，避免到期日淨資產暴跳。 */
    accruedValue(h, day) {
      const d = this.def(h.productId);
      const t = U.clamp((day - h.startDay) / d.termDays, 0, 1);
      return U.money(h.amount * (1 + d.yield * d.termDays / 365 * t));
    }
    totalValue(day) {
      const d = day != null ? day : this.game.state.day;
      return U.money(U.sum(this.st.holdings, (h) => this.accruedValue(h, d)));
    }
    totalPrincipal() { return U.money(U.sum(this.st.holdings, (h) => h.amount)); }

    /* ---------------- 申購 / 贖回 ---------------- */
    buy(productId, amount, day) {
      const d = this.def(productId);
      if (!d) return { ok: false, why: '找不到這個商品' };
      if (!this.isAvailable(productId)) return { ok: false, why: `需要 Lv.${d.minLevel} 銀行` };
      amount = U.money(amount);
      if (amount < d.min) return { ok: false, why: `最低申購 ${U.fmtMoney(d.min)} 元` };
      if (d.max && amount > d.max) return { ok: false, why: `單筆上限 ${U.fmtMoney(d.max)} 元` };
      if (this.st.holdings.length >= BT.CONFIG.products.maxHoldings) return { ok: false, why: '持有筆數已達上限' };
      if (!this.game.treasury.spend(amount, null)) return { ok: false, why: '現金不足' };
      const h = {
        id: this.st.nextId++, productId, amount,
        startDay: day, matureDay: day + d.termDays,
      };
      this.st.holdings.push(h);
      this.game.bus.emit('products:buy', { holding: h, def: d });
      return { ok: true, holding: h };
    }

    /** 提前贖回：本金 × (1 − 罰則)，賺到的利息全部沒收。 */
    redeemEarly(holdingId, day) {
      const h = this.st.holdings.find((x) => x.id === holdingId);
      if (!h) return { ok: false, why: '找不到這筆投資' };
      const d = this.def(h.productId);
      if (day >= h.matureDay) return this._mature(h, day);
      const back = U.money(h.amount * (1 - d.earlyPenalty));
      const loss = U.money(h.amount - back);
      this.st.holdings = this.st.holdings.filter((x) => x.id !== holdingId);
      this.game.treasury.receive(back, null);
      if (loss > 0) {
        this.game.reports.expense('invest', loss);
        this.st.realized = U.money(this.st.realized - loss);
      }
      this.game.bus.emit('products:early', { def: d, back, loss });
      return { ok: true, back, loss };
    }

    _mature(h, day) {
      const d = this.def(h.productId);
      const value = this.maturityValue(h);
      const gain = U.money(value - h.amount);
      this.st.holdings = this.st.holdings.filter((x) => x.id !== h.id);
      this.game.treasury.receive(value, null);
      this.game.reports.income('product', gain);
      this.st.realized = U.money(this.st.realized + gain);
      this.game.bus.emit('products:mature', { def: d, value, gain, day });
      return { ok: true, value, gain, matured: true };
    }

    /** 每日：檢查違約與到期。 */
    tick(rng, day) {
      const out = { matured: [], defaulted: [] };
      for (const h of this.st.holdings.slice()) {
        const d = this.def(h.productId);
        if (!d) continue;
        if (d.defaultProb > 0 && rng() < d.defaultProb) {
          const lost = U.money(h.amount * d.defaultLoss);
          const back = U.money(h.amount - lost);
          this.st.holdings = this.st.holdings.filter((x) => x.id !== h.id);
          if (back > 0) this.game.treasury.receive(back, null);
          this.game.reports.expense('invest', lost);
          this.st.realized = U.money(this.st.realized - lost);
          out.defaulted.push({ def: d, lost, back });
          this.game.bus.emit('products:default', { def: d, lost, back });
          continue;
        }
        if (day >= h.matureDay) {
          const r = this._mature(h, day);
          out.matured.push({ def: d, value: r.value, gain: r.gain });
        }
      }
      return out;
    }
  }

  BT.Products = Products;
})(typeof window !== 'undefined' ? window : globalThis);
