/* ============================================================
   systems/simulation.js — 每日推進（唯一會讓世界前進的入口）
   固定順序，任何新系統都插在這裡，不要在別的地方偷推進時間。

   順序有意義：
     先經濟（決定今天的環境）→ 事件（可能改變環境）→ 市場價格
     → 客戶行為（產生現金流）→ 利息 → 固定支出 → 結清欠款
     → 搶劫（打在結清後的現金上）→ 信用 → 經驗 → 報表 → 破產判定
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;

  class Simulation {
    constructor(game) { this.game = game; }

    /** 推進一天。回傳當天摘要（UI 與 sim-bot 用）。 */
    advanceDay() {
      const g = this.game;
      if (g.state.gameOver) return null;
      const rng = g.rng;
      const day = (g.state.day += 1);

      g.reports.startDay();

      // 1. 總體經濟
      g.economy.tick(rng);

      // 2. 準備金利息（用當日開盤現金計算）
      g.treasury.tickReserveYield();

      // 3. 事件
      const event = g.events.tick(rng, day);

      // 4. 市場
      g.stocks.tick(rng);
      const products = g.products.tick(rng, day);

      // 5. 客戶
      const cust = g.customers.tick(rng, day);

      // 6. 存款利息
      const interest = g.deposits.tick(day);

      // 7. 固定支出：營運費、保全、保險、貸款利息
      const opex = U.money(g.upgrades.level().opex * g.economy.costMult());
      if (opex > 0) {
        g.treasury.charge(opex, 'opex', { kind: 'other', day, label: '銀行營運費' });
        g.state.stats.opexPaid = U.money(g.state.stats.opexPaid + opex);
      }
      const sec = g.security.tick(day);
      const premium = g.insurance.tick(day);
      g.treasury.tickLoans();

      // 8. 結清待付義務（有現金就先還債）
      const settled = g.treasury.settle(day);
      if (g.treasury.hasOverdue(day)) {
        g.customers.addPanic(BT.CONFIG.customers.overduePanicPerDay, 'overdue');
      }

      // 9. 搶劫（事件強制觸發的優先）
      let robbery = null;
      const forced = g.state.flags.pendingRobbery;
      if (forced !== undefined && forced !== null) {
        g.state.flags.pendingRobbery = null;
        if (day >= BT.CONFIG.start.graceDays) robbery = g.robbery.attempt(rng, day, { tier: forced });
      }
      if (!robbery) robbery = g.robbery.tick(rng, day);
      g.state.robbery.risk = U.round(g.robbery.risk(), 1);

      // 10. 信用
      g.credit.tick(day);

      // 11. 報表與經驗
      const profit = g.reports.endDay(day);
      g.upgrades.tick(profit, cust.joined);

      // 12. 破產判定
      const over = g.bankruptcy.tick(day);

      const summary = { day, event, cust, interest, opex, sec, premium, settled, robbery, profit, products, over };
      g.bus.emit('day:end', summary);
      return summary;
    }
  }

  BT.Simulation = Simulation;
})(typeof window !== 'undefined' ? window : globalThis);
