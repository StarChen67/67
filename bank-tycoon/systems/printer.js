/* ============================================================
   systems/printer.js — 印鈔機（Lv.5 解鎖）
   把未來的成本換成現在的現金：印出來的錢是真的，
   但通膨會讓升級費、保全費、營運費變貴，也會讓客戶要求更高利率。

   防無限刷錢的設計：
     1. 有冷卻天數，不能連按。
     2. 通膨增量與「印鈔量 / 總資產」成正比 —— 銀行越小，印一次的傷害越大；
        銀行越大，同樣的印鈔量對它的幫助也越小。
     3. 通膨推高存款利率需求與所有成本，長期是負和的。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.printer;

  class Printer {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.printer; }

    unlocked() { return this.game.upgrades.unlocked(C().unlockFeature); }
    owned() { return this.st.level > 0; }
    def(level) {
      const lv = level != null ? level : this.st.level;
      if (lv <= 0) return null;
      return BT.registries.printer.list[Math.min(lv, BT.registries.printer.size) - 1];
    }
    nextDef() {
      return this.st.level < BT.registries.printer.size ? BT.registries.printer.list[this.st.level] : null;
    }

    /** 取得/升級印鈔機的花費（含通膨）。 */
    upgradeCost() {
      const cur = this.def();
      const mult = this.game.economy.costMult();
      if (!cur) return U.money(BT.registries.printer.list[0].upCost / 2 * mult);  // 首次購入
      if (cur.upCost == null) return null;
      return U.money(cur.upCost * mult);
    }

    cooldownLeft(day) {
      const d = this.def();
      if (!d) return 0;
      return Math.max(0, d.cooldown - (day - this.st.lastPrintDay));
    }
    output() { const d = this.def(); return d ? d.output : 0; }

    /** 這次印鈔會增加多少通膨（UI 先顯示，讓玩家自己決定值不值得）。 */
    inflationCost(amount) {
      const cfg = C();
      const t = this.game.totals();
      const base = amount != null ? amount : this.output();
      const rel = base / Math.max(cfg.inflationAssetFloor, t.assets);
      const d = this.def();
      return 100 * rel * cfg.inflationMult + (d ? d.inflation : cfg.inflationFlat);
    }

    canBuy() {
      if (!this.unlocked()) {
        const lv = this.game.upgrades.featureLevel(C().unlockFeature);
        return { ok: false, why: `需要 Lv.${lv} 銀行` };
      }
      if (this.st.level >= BT.registries.printer.size) return { ok: false, why: '已經是最高級' };
      const cost = this.upgradeCost();
      if (cost == null) return { ok: false, why: '已經是最高級' };
      if (this.game.treasury.cash < cost) return { ok: false, why: '現金不足' };
      return { ok: true, cost };
    }

    /** 購入或升級（同一個動作，等級 0 → 1 就是購入）。 */
    upgrade() {
      const chk = this.canBuy();
      if (!chk.ok) return chk;
      if (!this.game.treasury.spend(chk.cost, 'upgrade')) return { ok: false, why: '現金不足' };
      this.st.level += 1;
      const def = this.def();
      this.game.bus.emit('printer:upgrade', { level: this.st.level, def, cost: chk.cost });
      return { ok: true, level: this.st.level, def, cost: chk.cost };
    }

    canPrint(day) {
      if (!this.owned()) return { ok: false, why: '尚未取得印鈔機' };
      const left = this.cooldownLeft(day);
      if (left > 0) return { ok: false, why: `冷卻中，還要 ${left} 天` };
      return { ok: true };
    }

    print(day) {
      const chk = this.canPrint(day);
      if (!chk.ok) return chk;
      const amount = U.money(this.output());
      const infl = this.inflationCost(amount);
      this.game.treasury.receive(amount, 'print');
      this.game.economy.addInflation(infl);
      this.st.lastPrintDay = day;
      this.st.printedTotal = U.money(this.st.printedTotal + amount);
      this.st.printCount += 1;
      this.game.state.stats.printedTotal = U.money(this.game.state.stats.printedTotal + amount);
      this.game.bus.emit('printer:print', { amount, inflation: infl, day });
      return { ok: true, amount, inflation: infl };
    }
  }

  BT.Printer = Printer;
})(typeof window !== 'undefined' ? window : globalThis);
