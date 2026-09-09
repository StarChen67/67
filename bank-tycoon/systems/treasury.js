/* ============================================================
   systems/treasury.js — 現金唯一出入口 + 待付義務 + 緊急貸款

   三個層級的付款：
     spend(amount, key)  自願支出（買股票、升級、蓋保全）。
                         現金不夠就直接失敗，不會欠錢。
     charge(amount, key, opts)  義務支出（客戶提款、利息、薪資、維護、保費）。
                         現金不夠 → 未付部分變成「待付義務」，有到期日。
     receive(amount, key)  收入。

   待付義務逾期 = 銀行付不出錢 → 信用重挫、恐慌上升，超過寬限直接倒閉。
   這是整個遊戲的失敗管道，所以現金流管理才是核心。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.treasury;

  class Treasury {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.treasury; }
    get bank() { return this.game.state.bank; }
    get cash() { return this.bank.cash; }

    _id() { return this.st.nextId++; }

    /* ---------------- 現金進出 ----------------
       key = null 代表「不記進損益表」。
       客戶存提款、買賣股票本金都只是資產負債表的搬移，不是收入或支出；
       記進去的話每日收支會被本金淹沒，報表就沒有意義了。 */
    receive(amount, key = 'other') {
      amount = U.money(amount);
      if (!(amount > 0)) return 0;
      this.bank.cash = U.money(this.bank.cash + amount);
      if (key) this.game.reports.income(key, amount);
      return amount;
    }

    /** 自願支出。現金不足回傳 false，不改變任何狀態。 */
    spend(amount, key = 'other') {
      amount = U.money(amount);
      if (!(amount > 0)) return true;
      if (this.bank.cash < amount) return false;
      this.bank.cash = U.money(this.bank.cash - amount);
      if (key) this.game.reports.expense(key, amount);
      return true;
    }

    /**
     * 義務支出。付得出多少付多少，剩下的變成待付義務。
     * opts: { kind: 'withdraw'|'interest'|'other', label, customerId, day }
     * 回傳 { paid, unpaid, obligation }
     */
    charge(amount, key = 'other', opts = {}) {
      amount = U.money(amount);
      if (!(amount > 0)) return { paid: 0, unpaid: 0, obligation: null };
      const paid = Math.min(this.bank.cash, amount);
      if (paid > 0) {
        this.bank.cash = U.money(this.bank.cash - paid);
        if (key) this.game.reports.expense(key, paid);
      }
      const unpaid = amount - paid;
      let ob = null;
      if (unpaid > 0) ob = this._addObligation(unpaid, key, opts);
      return { paid, unpaid, obligation: ob };
    }

    _addObligation(amount, key, opts = {}) {
      const day = opts.day != null ? opts.day : this.game.state.day;
      const kind = opts.kind || 'other';
      const grace = C().dueDays[kind] != null ? C().dueDays[kind] : C().dueDays.other;
      const ob = {
        id: this._id(), kind, key, amount: U.money(amount),
        label: opts.label || '',
        customerId: opts.customerId != null ? opts.customerId : null,
        createdDay: day, dueDay: day + grace,
      };
      this.st.obligations.push(ob);
      this.game.bus.emit('treasury:obligation', { ob });
      return ob;
    }

    obligationsTotal() { return U.sum(this.st.obligations, (o) => o.amount); }
    hasOverdue(day) { return this.st.obligations.some((o) => day > o.dueDay); }
    overdueList(day) { return this.st.obligations.filter((o) => day > o.dueDay); }
    /** 最急迫的義務還剩幾天。沒有義務回傳 null。 */
    soonestDue(day) {
      let m = null;
      for (const o of this.st.obligations) { const d = o.dueDay - day; if (m === null || d < m) m = d; }
      return m;
    }

    /** 每日結清：FIFO 付掉待付義務。 */
    settle(day) {
      const list = this.st.obligations;
      if (!list.length) return { paid: 0, cleared: 0 };
      list.sort((a, b) => a.dueDay - b.dueDay || a.id - b.id);
      let paid = 0;
      let cleared = 0;
      for (const o of list) {
        if (this.bank.cash <= 0) break;
        const p = Math.min(this.bank.cash, o.amount);
        if (p <= 0) continue;
        this.bank.cash = U.money(this.bank.cash - p);
        o.amount = U.money(o.amount - p);
        if (o.key) this.game.reports.expense(o.key, p);
        paid += p;
        if (o.amount <= 0) cleared += 1;
      }
      this.st.obligations = list.filter((o) => o.amount > 0);
      if (paid > 0) this.game.bus.emit('treasury:settled', { paid, cleared });
      return { paid, cleared };
    }

    /* ---------------- 準備金利息 ----------------
       閒置現金放在央行帳戶，會有一點利息收入。
       利率低於客戶存款成本，所以「全部放現金」仍然是慢性虧損，
       但不會像完全零收益那樣逼玩家把每一塊錢都鎖進債券。 */
    reserveYieldRate() {
      return this.game.state.economy.marketRate * BT.CONFIG.economy.reserveYieldFrac;
    }
    tickReserveYield() {
      const v = U.money(this.cash * this.reserveYieldRate() / 365);
      if (v > 0) this.receive(v, 'reserve');
      return v;
    }

    /* ---------------- 緊急貸款 ---------------- */
    loanCap() { return this.game.upgrades.level().loanCap; }
    loanTotal() { return U.sum(this.st.loans, (l) => l.principal); }
    loanRoom() { return Math.max(0, this.loanCap() - this.loanTotal()); }
    canBorrow(amount) {
      amount = U.money(amount);
      if (amount < C().minLoan) return { ok: false, why: `最低借款 ${U.fmtMoney(C().minLoan)} 元` };
      if (this.st.loans.length >= C().loan.maxLoans) return { ok: false, why: `最多同時 ${C().loan.maxLoans} 筆貸款` };
      if (amount > this.loanRoom()) return { ok: false, why: `額度不足（剩 ${U.fmtMoney(this.loanRoom())}）` };
      return { ok: true };
    }
    borrow(amount) {
      amount = U.money(amount);
      const chk = this.canBorrow(amount);
      if (!chk.ok) return chk;
      const loan = { id: this._id(), principal: amount, dailyRate: C().loan.dailyRate, startDay: this.game.state.day };
      this.st.loans.push(loan);
      this.receive(amount, 'loan');
      this.game.state.stats.loansTaken += 1;
      this.game.bus.emit('treasury:borrow', { loan });
      return { ok: true, loan };
    }
    repay(loanId, amount) {
      const loan = this.st.loans.find((l) => l.id === loanId);
      if (!loan) return { ok: false, why: '找不到這筆貸款' };
      amount = U.money(Math.min(amount != null ? amount : loan.principal, loan.principal));
      if (amount <= 0) return { ok: false, why: '金額無效' };
      if (!this.spend(amount, 'other')) return { ok: false, why: '現金不足' };
      loan.principal = U.money(loan.principal - amount);
      if (loan.principal <= 0) this.st.loans = this.st.loans.filter((l) => l.id !== loanId);
      return { ok: true, repaid: amount };
    }
    /** 每日貸款利息（滾入本金會太狠，這裡直接當成現金支出）。 */
    tickLoans() {
      let interest = 0;
      for (const l of this.st.loans) interest += l.principal * l.dailyRate;
      interest = U.money(interest);
      if (interest > 0) this.charge(interest, 'loanInterest', { kind: 'other', label: '貸款利息' });
      return interest;
    }

    /** 總負債：客戶存款 + 應付利息 + 待付義務 + 貸款本金。 */
    liabilities() {
      const s = this.game.state;
      return U.money(this.game.customers.totalDeposits() + s.deposits.payable + this.obligationsTotal() + this.loanTotal());
    }
  }

  BT.Treasury = Treasury;
})(typeof window !== 'undefined' ? window : globalThis);
