/* ============================================================
   systems/upgrades.js — 銀行等級、經驗值、功能解鎖
   等級全部由 data/levels.js 驅動：加第 9 級不用改這個檔。
   unlocked(feature) 是所有系統查「這個功能開了沒」的唯一入口。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.upgrades;

  class Upgrades {
    constructor(game) { this.game = game; }
    get bank() { return this.game.state.bank; }

    /** 目前等級定義。 */
    level(n) {
      const lv = n != null ? n : this.bank.level;
      return BT.registries.levels.list[U.clamp(lv, 1, BT.registries.levels.size) - 1];
    }
    next() {
      return this.bank.level < BT.registries.levels.size ? this.level(this.bank.level + 1) : null;
    }
    isMax() { return this.bank.level >= BT.registries.levels.size; }

    /** 這個功能解鎖了嗎？（累積所有已達等級的 features） */
    unlocked(feature) {
      if (!feature) return true;
      for (let i = 1; i <= this.bank.level; i++) {
        const lv = this.level(i);
        if (lv.features && lv.features.indexOf(feature) >= 0) return true;
      }
      return false;
    }
    /** 這個功能要幾級才有？（UI 顯示「Lv.5 解鎖」） */
    featureLevel(feature) {
      for (const lv of BT.registries.levels.all()) {
        if (lv.features && lv.features.indexOf(feature) >= 0) return lv.level;
      }
      return null;
    }

    /** 升級費用（含通膨）。 */
    upgradeCost() {
      const lv = this.level();
      if (lv.upCost == null) return null;
      return U.money(lv.upCost * this.game.economy.costMult());
    }

    /** 升級條件檢查。回傳每一項是否達標，UI 直接照著畫。 */
    requirements() {
      const lv = this.level();
      const g = this.game;
      if (lv.upCost == null) return null;
      const t = g.totals();
      const cost = this.upgradeCost();
      return {
        cost: { need: cost, have: U.money(t.cash), ok: t.cash >= cost, label: '升級費用' },
        assets: { need: lv.reqAssets, have: U.money(t.assets), ok: t.assets >= lv.reqAssets, label: '銀行總資產' },
        customers: { need: lv.reqCustomers, have: g.customers.count(), ok: g.customers.count() >= lv.reqCustomers, label: '客戶數' },
        credit: { need: lv.reqCredit, have: Math.round(g.credit.score), ok: g.credit.score >= lv.reqCredit, label: '銀行信用' },
        xp: { need: lv.reqXp, have: Math.floor(this.bank.xp), ok: this.bank.xp >= lv.reqXp, label: '經營經驗' },
      };
    }
    canUpgrade() {
      const r = this.requirements();
      if (!r) return { ok: false, why: '已經是最高等級' };
      for (const k of Object.keys(r)) if (!r[k].ok) return { ok: false, why: `${r[k].label}不足`, req: r };
      return { ok: true, req: r };
    }

    upgrade() {
      const chk = this.canUpgrade();
      if (!chk.ok) return chk;
      const cost = this.upgradeCost();
      if (!this.game.treasury.spend(cost, 'upgrade')) return { ok: false, why: '現金不足' };
      const from = this.bank.level;
      this.bank.level += 1;
      this.bank.xp = 0;                        // 每一級的經驗重新累積
      this.game.credit.add(BT.CONFIG.credit.shock.levelUp, 'levelUp');
      const s = this.game.state.stats;
      s.upgrades += 1;
      if (this.bank.level > s.maxLevel) s.maxLevel = this.bank.level;
      const def = this.level();
      this.game.bus.emit('bank:levelup', { from, to: this.bank.level, def, cost });
      return { ok: true, from, to: this.bank.level, def, cost };
    }

    addXp(v) {
      if (!(v > 0)) return;
      this.bank.xp += v;
    }

    /** 每日經驗：經營天數 + 新客戶 + 獲利（除數隨等級指數放大，後期不會爆表）。 */
    tick(profit, joined) {
      const cfg = C();
      let xp = cfg.xpPerDay + joined * cfg.xpPerNewCustomer;
      if (profit > 0) {
        const div = cfg.xpProfitDiv * Math.pow(cfg.xpProfitLevelPow, this.bank.level - 1);
        xp += profit / div;
      }
      this.addXp(xp);
      return xp;
    }
  }

  BT.Upgrades = Upgrades;
})(typeof window !== 'undefined' ? window : globalThis);
