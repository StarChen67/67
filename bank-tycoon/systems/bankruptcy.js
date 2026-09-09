/* ============================================================
   systems/bankruptcy.js — 破產判定
   單純欠客戶錢不會倒（那是銀行的正常狀態）。
   真正會倒的是兩件事：
     1. 到期還付不出來（提款 5 天、利息 7 天的寬限過了）
     2. 淨資產連續為負超過 10 天（投資虧光、被搶到見底）
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.bankruptcy;

  class Bankruptcy {
    constructor(game) { this.game = game; }

    /** 警告狀態，UI 用紅色橫幅顯示。 */
    warnings(day) {
      const g = this.game;
      const out = [];
      const overdue = g.treasury.overdueList(day);
      if (overdue.length) {
        out.push({
          level: 'crit',
          text: `有 ${overdue.length} 筆款項已逾期（共 ${U.fmtMoney(U.sum(overdue, (o) => o.amount))} 元），銀行隨時可能倒閉`,
        });
      } else {
        const soon = g.treasury.soonestDue(day);
        if (soon !== null && soon <= 2) {
          out.push({ level: 'warn', text: `還有 ${U.fmtMoney(g.treasury.obligationsTotal())} 元待付款，${soon} 天內必須付清` });
        }
      }
      const neg = g.state.bank.negativeDays;
      if (neg > 0) {
        const left = C().negativeNetWorthDays - neg;
        out.push({ level: neg >= C().warnNegativeDays ? 'crit' : 'warn', text: `淨資產為負已 ${neg} 天，再 ${left} 天銀行將被接管` });
      }
      if (g.state.bank.bankRun) out.push({ level: 'crit', text: '銀行擠兌中！客戶正在大量提領存款' });
      return out;
    }

    tick(day) {
      const g = this.game;
      const cfg = C();
      const t = g.totals();

      // 淨資產為負的連續天數
      if (t.net < 0) g.state.bank.negativeDays += 1;
      else g.state.bank.negativeDays = 0;

      // 逾期未付
      const overdue = g.treasury.overdueList(day);
      if (overdue.length) {
        g.state.stats.overdueDays += 1;
        const kinds = new Set(overdue.map((o) => o.kind));
        const reason = kinds.has('withdraw') ? 'withdraw' : (kinds.has('interest') ? 'interest' : 'other');
        const text = reason === 'withdraw'
          ? '客戶的提款請求超過期限仍未付清。監理機關接管了你的銀行。'
          : (reason === 'interest'
            ? '存款利息拖欠超過期限。銀行被宣告違約，遭到接管。'
            : '應付款項逾期未清。銀行被宣告違約，遭到接管。');
        return this.fail(reason, text, day);
      }

      if (g.state.bank.negativeDays >= cfg.negativeNetWorthDays) {
        return this.fail('netWorth', `淨資產連續 ${cfg.negativeNetWorthDays} 天為負數。資本被完全侵蝕，銀行宣告破產。`, day);
      }
      return null;
    }

    fail(reason, text, day) {
      const g = this.game;
      if (g.state.gameOver) return g.state.gameOver;
      const t = g.totals();
      const s = g.state.stats;
      const summary = {
        days: day,
        maxAssets: s.maxAssets,
        maxNetWorth: s.maxNetWorth,
        maxCustomers: s.maxCustomers,
        maxDeposits: s.maxDeposits,
        stockPnl: g.stocks.lifetimePnl(),
        productPnl: g.state.products.realized,
        robberies: s.robberies,
        defended: s.defended,
        stolen: s.stolen,
        maxLevel: s.maxLevel,
        levelName: g.upgrades.level(s.maxLevel).name,
        printed: s.printedTotal,
        interestPaid: s.interestPaid,
        securityPaid: s.securityPaid,
        insurancePayout: s.insurancePayout,
        finalCash: t.cash,
        finalAssets: t.assets,
        finalLiabilities: t.liabilities,
        finalNet: t.net,
        finalCredit: Math.round(g.credit.score),
        finalRating: g.credit.rating().name,
        customers: g.customers.count(),
      };
      g.state.gameOver = { reason, text, day, summary };
      g.state.paused = true;
      g.bus.emit('game:over', g.state.gameOver);
      return g.state.gameOver;
    }
  }

  BT.Bankruptcy = Bankruptcy;
})(typeof window !== 'undefined' ? window : globalThis);
