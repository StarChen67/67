/* ============================================================
   systems/deposits.js — 存款利率與應付利息
   利息每天累計成負債，每 30 天真正付一次現金。
   付息日現金不夠 → 變成待付義務 → 逾期就是違約，信用重挫。
   利率是玩家最重要的一根槓桿：調高吸客戶，但每天的利息成本也跟著上去。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.deposits;

  class Deposits {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.deposits; }
    get bank() { return this.game.state.bank; }

    rate() { return this.bank.depositRate; }
    setRate(r) {
      const cfg = C();
      const step = cfg.rateStep;
      const v = U.clamp(Math.round(r / step) * step, cfg.minRate, cfg.maxRate);
      const before = this.bank.depositRate;
      this.bank.depositRate = v;
      if (v !== before) this.game.bus.emit('deposits:rate', { from: before, to: v });
      return v;
    }
    /** 相對市場的倍率，UI 用來提示「太低會流失 / 太高會虧損」。 */
    rateRatio() {
      const d = this.game.economy.demandedRate();
      return d > 0 ? this.bank.depositRate / d : 0;
    }
    /** 今天會累計多少利息。 */
    dailyInterest() {
      return this.game.customers.totalDeposits() * this.bank.depositRate / 365;
    }
    payable() { return this.st.payable; }
    daysToPay(day) { return Math.max(0, this.st.nextPayDay - day); }

    tick(day) {
      this.st.payable = U.money(this.st.payable + this.dailyInterest());
      if (day >= this.st.nextPayDay) return this.payInterest(day);
      return null;
    }

    /** 付息日：把累計利息真的付出去。 */
    payInterest(day) {
      const amount = U.money(this.st.payable);
      this.st.nextPayDay = day + C().payEveryDays;
      if (amount <= 0) return null;
      this.st.payable = 0;
      const r = this.game.treasury.charge(amount, 'interest', { kind: 'interest', day, label: '存款利息' });
      this.st.lastPaidDay = day;
      this.st.lastPaidAmount = amount;
      this.game.state.stats.interestPaid = U.money(this.game.state.stats.interestPaid + r.paid);
      this.game.bus.emit('deposits:paid', { amount, paid: r.paid, unpaid: r.unpaid, day });
      return { amount, paid: r.paid, unpaid: r.unpaid };
    }
  }

  BT.Deposits = Deposits;
})(typeof window !== 'undefined' ? window : globalThis);
