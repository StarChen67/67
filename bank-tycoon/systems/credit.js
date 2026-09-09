/* ============================================================
   systems/credit.js — 銀行信用評級
   分數 0–1000，每日往「基本面目標」靠攏，事件與搶劫直接給衝擊。
   目標由五件事決定：資本適足、流動性、獲利、保全、銀行等級，
   任何一項待付義務逾期都會壓低目標並每日扣分。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.credit;

  class Credit {
    constructor(game) { this.game = game; }
    get bank() { return this.game.state.bank; }
    get score() { return this.bank.credit; }

    /** 分數 → 評級定義（AAA…D）。 */
    rating(score) {
      const s = score != null ? score : this.score;
      for (const r of BT.registries.ratings.all()) if (s >= r.min) return r;
      return BT.registries.ratings.get('D');
    }
    ratingId(score) { return this.rating(score).id; }
    attractFactor() { return this.rating().attract; }

    /** 目前基本面對應的信用目標分數（UI 會顯示，讓玩家知道往哪走）。 */
    target() {
      const g = this.game;
      const cfg = C();
      const t = g.totals();
      const capital = t.assets > 0 ? U.clamp((t.net / t.assets) / cfg.capitalTarget, 0, 1) : 0;
      const liquidity = t.deposits > 0
        ? U.clamp((t.cash / t.deposits - cfg.liquidityFloor) / cfg.liquiditySpan, 0, 1)
        : 1;
      const profit = t.net > 0
        ? U.clamp(0.5 + (g.reports.windowProfit() / t.net) / cfg.profitSpan, 0, 1)
        : 0;
      const security = 1 - g.robbery.risk() / 100;
      const levelS = (this.bank.level - 1) / Math.max(1, BT.registries.levels.size - 1);
      const overdue = g.treasury.hasOverdue(g.state.day) ? 0 : 1;

      const raw = cfg.base
        + cfg.wCapital * capital
        + cfg.wLiquidity * liquidity
        + cfg.wProfit * profit
        + cfg.wSecurity * security
        + cfg.wLevel * levelS
        + cfg.wOverdue * overdue;
      const cap = g.upgrades.level().creditCap;
      return { score: Math.min(cap, raw), parts: { capital, liquidity, profit, security, levelS, overdue }, cap };
    }

    /** 直接加減分（事件、搶劫、升級）。 */
    add(v, reason) {
      if (!v) return;
      const before = this.bank.credit;
      this.bank.credit = U.clamp(this.bank.credit + v, C().min, C().max);
      if (this.ratingId(before) !== this.ratingId(this.bank.credit)) {
        this.game.bus.emit('credit:rating', { from: this.ratingId(before), to: this.ratingId(this.bank.credit), reason });
      }
    }

    tick(day) {
      const cfg = C();
      const t = this.target();
      this.add((t.score - this.bank.credit) * cfg.approach, 'drift');
      if (this.game.treasury.hasOverdue(day)) this.add(cfg.shock.overdue, 'overdue');
    }
  }

  BT.Credit = Credit;
})(typeof window !== 'undefined' ? window : globalThis);
