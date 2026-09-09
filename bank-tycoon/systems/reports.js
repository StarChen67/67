/* ============================================================
   systems/reports.js — 每日收支帳與歷史曲線
   所有現金進出都要經過 Treasury，Treasury 再呼叫這裡記帳，
   所以「每日收入 / 支出」永遠與現金變化對得起來。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;

  class Reports {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.reports; }

    income(key, amount) {
      if (!(amount > 0)) return;
      const b = this.st.today.income;
      b[key] = (b[key] || 0) + U.money(amount);
    }
    expense(key, amount) {
      if (!(amount > 0)) return;
      const b = this.st.today.expense;
      b[key] = (b[key] || 0) + U.money(amount);
    }
    totalIncome(book) { return U.sum(Object.values((book || this.st.today).income)); }
    totalExpense(book) { return U.sum(Object.values((book || this.st.today).expense)); }

    /** 今天開始：把昨天的帳本收起來，開一本新的。 */
    startDay() {
      this.st.yesterday = this.st.today;
      this.st.today = BT.emptyDayBook();
    }

    /**
     * 今天結束：記錄資產快照與日淨利。
     * 日淨利用「淨資產變化」而不是「收入−支出」，
     * 因為股票未實現損益與商品應計利息也算獲利。
     */
    endDay(day) {
      const g = this.game;
      const t = g.totals();
      const hist = this.st.history;
      const prevNet = hist.length ? hist[hist.length - 1].net : t.net;
      const profit = t.net - prevNet;

      hist.push({
        d: day,
        assets: U.money(t.assets),
        net: U.money(t.net),
        cash: U.money(t.cash),
        dep: U.money(t.deposits),
        stock: U.money(t.stockValue),
        prod: U.money(t.productValue),
        profit: U.money(profit),
      });
      const max = BT.CONFIG.time.historyMaxDays;
      if (hist.length > max) hist.splice(0, hist.length - max);

      const w = this.st.profitWindow;
      w.push(U.money(profit));
      if (w.length > BT.CONFIG.credit.profitWindow) w.shift();

      const s = g.state.stats;
      if (t.assets > s.maxAssets) s.maxAssets = U.money(t.assets);
      if (t.net > s.maxNetWorth) s.maxNetWorth = U.money(t.net);
      if (t.deposits > s.maxDeposits) s.maxDeposits = U.money(t.deposits);
      const n = g.state.customers.list.length;
      if (n > s.maxCustomers) s.maxCustomers = n;
      return profit;
    }

    /** 最近 N 天的累計淨利，信用系統用。 */
    windowProfit() { return U.sum(this.st.profitWindow); }

    todayProfit() {
      const h = this.st.history;
      if (!h.length) return 0;
      return h[h.length - 1].profit;
    }

    /** 取最近 n 天的曲線資料（UI 圖表用）。 */
    series(n) {
      const h = this.st.history;
      return n && h.length > n ? h.slice(h.length - n) : h.slice();
    }
  }

  BT.Reports = Reports;
})(typeof window !== 'undefined' ? window : globalThis);
