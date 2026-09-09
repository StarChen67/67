/* ============================================================
   ui/topbar.js — 頂部狀態列、時間控制、警告橫幅
   規格要求的欄位全部在這裡：現金、總資產、客戶存款、負債、股票資產、
   每日收入、每日支出、應付利息、等級、經驗、淨資產、保全、搶劫風險。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const UI = BT.UI;
  const D = UI.dom;

  const STATS = [
    { k: 'cash', icon: '💰', label: '現金' },
    { k: 'assets', icon: '🏦', label: '銀行總資產' },
    { k: 'deposits', icon: '👥', label: '客戶存款' },
    { k: 'liab', icon: '💳', label: '負債總額' },
    { k: 'net', icon: '💵', label: '淨資產' },
    { k: 'stock', icon: '📈', label: '投資資產' },
    { k: 'income', icon: '📥', label: '每日收入' },
    { k: 'expense', icon: '📤', label: '每日支出' },
    { k: 'payable', icon: '🧾', label: '應付利息' },
    { k: 'level', icon: '⭐', label: '銀行等級' },
    { k: 'xp', icon: '✨', label: '經營經驗' },
    { k: 'credit', icon: '🏅', label: '銀行信用' },
    { k: 'security', icon: '🛡️', label: '保全等級' },
    { k: 'risk', icon: '🚨', label: '搶劫風險' },
  ];

  UI.topbar = {
    build(game) {
      const bar = D.el('div#statbar.statbar');
      this.cells = {};
      for (const s of STATS) {
        const v = D.el('div.v', { text: '—' });
        const cell = D.el('div.stat', { title: s.label }, [
          D.el('div.k', { text: s.icon + ' ' + s.label }),
          v,
        ]);
        this.cells[s.k] = { v, cell };
        bar.appendChild(cell);
      }
      return bar;
    },

    buildTime(game) {
      const wrap = D.el('div.timebar');
      this.dayLabel = D.el('div.dayLabel');
      this.phaseLabel = D.el('div.phase');
      this.progress = D.el('div.dayProg', null, [D.el('i')]);

      const speeds = D.el('div.speeds');
      this.speedBtns = {};
      for (const sp of BT.CONFIG.time.speeds) {
        const b = D.btn(sp + '×', () => { game.setPaused(false); game.setSpeed(sp); this.syncTime(game); }, { cls: 'sp' });
        this.speedBtns[sp] = b;
        speeds.appendChild(b);
      }
      this.pauseBtn = D.btn('⏸ 暫停', () => { game.togglePause(); this.syncTime(game); }, { cls: 'sp pause' });
      this.stepBtn = D.btn('下一天 ▶', () => { game.step(); UI.app.render(true); }, { cls: 'sp step' });

      wrap.appendChild(D.el('div.timeLeft', null, [this.dayLabel, this.phaseLabel]));
      wrap.appendChild(this.progress);
      wrap.appendChild(D.el('div.timeRight', null, [this.pauseBtn, speeds, this.stepBtn]));
      return wrap;
    },

    buildWarn() {
      this.warnBox = D.el('div#warnBox');
      return this.warnBox;
    },

    syncTime(game) {
      const s = game.state;
      D.setText(this.dayLabel, `第 ${s.day} 天 · ${U.fmtDay(s.day)}`);
      const ph = game.economy.phase();
      D.setText(this.phaseLabel, `景氣：${ph.name}　市場利率 ${U.fmtPct(s.economy.marketRate)}　通膨 ${U.round(s.economy.inflation, 1)}`);
      this.phaseLabel.className = 'phase ' + s.economy.phase;
      for (const sp in this.speedBtns) this.speedBtns[sp].classList.toggle('sel', !s.paused && s.speed === +sp);
      this.pauseBtn.textContent = s.paused ? '▶ 繼續' : '⏸ 暫停';
      this.pauseBtn.classList.toggle('sel', s.paused);
    },

    render(game) {
      const s = game.state;
      const t = game.totals();
      const c = this.cells;
      const inc = game.dailyIncome();
      const exp = game.dailyExpense();

      const set = (k, text, cls) => {
        const cell = c[k];
        if (!cell) return;
        D.setText(cell.v, text);
        cell.v.className = 'v' + (cls ? ' ' + cls : '');
      };

      set('cash', U.fmtMoney(t.cash));
      set('assets', U.fmtMoney(t.assets));
      set('deposits', U.fmtMoney(t.deposits));
      set('liab', U.fmtMoney(t.liabilities), 'red');
      set('net', U.fmtMoney(t.net), t.net >= 0 ? 'green' : 'red');
      set('stock', U.fmtMoney(t.stockValue + t.productValue));
      set('income', U.fmtMoney(inc.total), 'green');
      set('expense', U.fmtMoney(exp.total), 'red');
      set('payable', U.fmtMoney(t.payable));
      const lv = game.upgrades.level();
      set('level', `Lv.${s.bank.level} ${lv.name}`);
      const nextLv = game.upgrades.next();
      set('xp', nextLv ? `${Math.floor(s.bank.xp)} / ${lv.reqXp}` : '已滿級');
      const rating = game.credit.rating();
      set('credit', `${rating.name} (${Math.round(s.bank.credit)})`);
      c.credit.v.style.color = rating.color;
      set('security', `${game.security.grade()} 分`, game.security.grade() >= 100 ? 'green' : (game.security.grade() >= 60 ? 'amber' : 'red'));
      const risk = game.robbery.risk();
      const rl = game.robbery.riskLabel(risk);
      set('risk', `${Math.round(risk)} ${rl.name}`, 'risk-' + rl.cls);

      this.syncTime(game);
      const p = game.dayProgress();
      this.progress.firstChild.style.width = (p * 100).toFixed(1) + '%';
      this.renderWarnings(game);
    },

    renderWarnings(game) {
      const ws = game.bankruptcy.warnings(game.state.day);
      const t = game.totals();
      // 額外的經營提醒
      if (t.deposits > 0 && t.reserveRatio < 0.06) {
        ws.push({ level: 'warn', text: `現金準備率只有 ${U.fmtPct(t.reserveRatio, 1)}，客戶一波提款就可能付不出來` });
      }
      const exposed = game.robbery.exposedCash();
      if (exposed > Math.max(0, t.net) * 0.5 && exposed > 0) {
        ws.push({ level: 'warn', text: `有 ${U.fmtMoney(exposed)} 元現金在金庫保護範圍之外，被搶就直接是損失` });
      }
      if (game.security.damagedList().length) {
        ws.push({ level: 'warn', text: `有 ${game.security.damagedList().length} 項保全設備受損，防禦力與金庫保護額都在打折` });
      }
      const key = ws.map((w) => w.level + w.text).join('|');
      if (key === this._warnKey) return;
      this._warnKey = key;
      D.clear(this.warnBox);
      for (const w of ws) this.warnBox.appendChild(D.el('div.warn.' + w.level, { text: (w.level === 'crit' ? '🚨 ' : '⚠️ ') + w.text }));
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
