/* ============================================================
   systems/insurance.js — 銀行搶劫保險
   保費是風險加權的：保全越好、風險值越低，保費越便宜。
   所以保險補的是「殘餘風險」，不是保全的替代品 ——
   什麼保全都不蓋、只買頂級保險，保費會貴到吃掉獲利。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.insurance;

  class Insurance {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.insurance; }

    plan() { return this.st.plan ? BT.registries.insurance.get(this.st.plan) : null; }
    plans() { return BT.registries.insurance.all().slice().sort((a, b) => a.order - b.order); }
    available(id) {
      const d = BT.registries.insurance.get(id);
      return !!d && this.game.upgrades.unlocked(d.feature);
    }

    /** 沒有金庫保護、會被搶走的那部分現金。保費照這個算。 */
    exposedCash() {
      const cash = this.game.treasury.cash;
      return Math.max(0, cash - this.game.security.protectCap() * 0.5);
    }

    /** 某方案每日保費。 */
    premiumOf(id) {
      const d = BT.registries.insurance.get(id);
      if (!d) return 0;
      const cfg = C();
      const risk = this.game.robbery.risk();
      const exposed = this.exposedCash();
      const base = exposed * d.cover * cfg.rateBase * (risk / 100) * cfg.riskWeight * d.loading / 365 * 30;
      const floor = Math.max(cfg.minPremium, exposed * cfg.minPremiumFrac) * d.loading;
      return U.money(Math.max(floor, base));
    }
    premium() { return this.st.plan ? this.premiumOf(this.st.plan) : 0; }

    canSubscribe(id, day) {
      const d = BT.registries.insurance.get(id);
      if (!d) return { ok: false, why: '找不到這個方案' };
      if (!this.available(id)) return { ok: false, why: `需要 Lv.${this.game.upgrades.featureLevel(d.feature)} 銀行` };
      if (this.st.plan === id) return { ok: false, why: '已經投保這個方案' };
      if (day - this.st.switchDay < C().switchCooldownDays) {
        return { ok: false, why: `更換方案需間隔 ${C().switchCooldownDays} 天` };
      }
      return { ok: true };
    }
    subscribe(id, day) {
      const chk = this.canSubscribe(id, day);
      if (!chk.ok) return chk;
      this.st.plan = id;
      this.st.sinceDay = day;
      this.st.switchDay = day;
      this.game.bus.emit('insurance:subscribe', { id, day });
      return { ok: true, id };
    }
    cancel(day) {
      if (!this.st.plan) return { ok: false, why: '目前沒有保險' };
      const id = this.st.plan;
      this.st.plan = null;
      this.st.switchDay = day;
      this.game.bus.emit('insurance:cancel', { id });
      return { ok: true };
    }

    /** 搶劫損失後的理賠。 */
    claim(loss, day) {
      const d = this.plan();
      if (!d || !(loss > 0)) return 0;
      const payout = U.money(Math.min(loss * d.cover, d.maxPayout));
      if (payout <= 0) return 0;
      this.game.treasury.receive(payout, 'insurance');
      this.st.payoutTotal = U.money(this.st.payoutTotal + payout);
      this.game.state.stats.insurancePayout = U.money(this.game.state.stats.insurancePayout + payout);
      this.game.bus.emit('insurance:claim', { payout, loss, plan: d.id, day });
      return payout;
    }

    tick(day) {
      if (!this.st.plan) return 0;
      const p = this.premium();
      if (p <= 0) return 0;
      this.game.treasury.charge(p, 'premium', { kind: 'other', day, label: '保險費' });
      this.st.paidTotal = U.money(this.st.paidTotal + p);
      this.game.state.stats.insurancePaid = U.money(this.game.state.stats.insurancePaid + p);
      return p;
    }
  }

  BT.Insurance = Insurance;
})(typeof window !== 'undefined' ? window : globalThis);
