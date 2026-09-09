/* ============================================================
   ui/app.js — 分頁切換、主迴圈、事件監聽
   主迴圈用 setInterval：預覽窗格裡 requestAnimationFrame 不會觸發。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const UI = BT.UI;
  const D = UI.dom;

  const TABS = [
    { id: 'bank', icon: '🏦', name: '銀行', render: () => UI.panels.bank },
    { id: 'customers', icon: '👥', name: '客戶', render: () => UI.panels.customers },
    { id: 'deposits', icon: '💴', name: '存款', render: () => UI.panels.deposits },
    { id: 'stocks', icon: '📈', name: '股票', render: () => UI.panels.stocks },
    { id: 'products', icon: '📗', name: '投資', render: () => UI.panels.products },
    { id: 'printer', icon: '🖨️', name: '印鈔機', render: () => UI.panels.printer, locked: (g) => !g.printer.unlocked() },
    { id: 'upgrade', icon: '⭐', name: '升級', render: () => UI.panels.upgrade },
    { id: 'security', icon: '🛡️', name: '保全', render: () => UI.panels.security },
    { id: 'vault', icon: '🏛️', name: '金庫', render: () => UI.panels.vault },
    { id: 'insurance', icon: '🧾', name: '保險', render: () => UI.panels.insurance, locked: (g) => !g.upgrades.unlocked('insurance_basic') },
    { id: 'report', icon: '📊', name: '財務報表', render: () => UI.panels.report },
    { id: 'events', icon: '📰', name: '事件', render: () => UI.panels.events },
    { id: 'settings', icon: '⚙️', name: '設定', render: () => UI.panels.settings },
  ];

  UI.app = {
    state: { tab: 'bank', stock: null, product: null, reportRange: 180 },
    game: null,
    _timer: null,

    init(game) {
      this.game = game;
      const wrap = D.$('#app');
      D.clear(wrap);

      wrap.appendChild(UI.topbar.build(game));
      wrap.appendChild(UI.topbar.buildTime(game));
      wrap.appendChild(UI.topbar.buildWarn());

      this.tabBar = D.el('div.tabs');
      wrap.appendChild(this.tabBar);
      this.panel = D.el('div#panel');
      wrap.appendChild(this.panel);

      this.buildTabs();
      this.bind(game);
      this.applyCompact();
      this.render(true);
      this.start();
    },

    buildTabs() {
      D.clear(this.tabBar);
      this.tabBtns = {};
      for (const t of TABS) {
        const b = D.btn(t.icon + ' ' + t.name, () => { this.state.tab = t.id; this.render(true); }, { cls: 'tabBtn' });
        this.tabBtns[t.id] = { btn: b, def: t };
        this.tabBar.appendChild(b);
      }
    },

    bind(game) {
      const S = () => game.state.settings;
      game.bus.on('event:fire', (payload) => {
        UI.toast(`${payload.def.icon} ${payload.def.name}`, payload.def.kind === 'good' ? 'good' : (payload.def.kind === 'neutral' ? '' : 'bad'), 4000);
        if (S().pauseOnEvent && payload.def.kind !== 'neutral') {
          game.setPaused(true);
          UI.modals.event(game, payload);
        }
      });
      game.bus.on('robbery:done', ({ report }) => {
        if (S().pauseOnRobbery) game.setPaused(true);
        UI.modals.robbery(game, report);
      });
      game.bus.on('game:over', (over) => {
        UI.modals.gameOver(game, over);
        this.render(true);
      });
      game.bus.on('bankrun:start', () => {
        game.setPaused(true);
        UI.toast('🚨 銀行擠兌開始了！客戶正在大量提領存款。', 'bad', 8000);
      });
      game.bus.on('bankrun:end', ({ days }) => UI.toast(`擠兌結束，撐過了 ${days} 天。`, 'good', 5000));
      game.bus.on('bank:levelup', () => this.buildTabs());
      game.bus.on('credit:rating', ({ from, to }) => {
        UI.toast(`銀行信用評級 ${from} → ${to}`, BT.registries.ratings.get(to).min > BT.registries.ratings.get(from).min ? 'good' : 'bad', 5000);
      });
      game.bus.on('deposits:paid', ({ amount, unpaid }) => {
        if (unpaid > 0) UI.toast(`付息 ${U.fmtMoney(amount)} 元，有 ${U.fmtMoney(unpaid)} 付不出來！`, 'bad', 6000);
      });
      game.bus.on('products:mature', ({ def, gain }) => UI.toast(`${def.name} 到期，獲利 ${U.fmtMoney(gain)} 元`, 'good'));
      game.bus.on('products:default', ({ def, lost }) => UI.toast(`${def.name} 發行方違約，損失 ${U.fmtMoney(lost)} 元`, 'bad', 6000));
      game.bus.on('stocks:crash', ({ name, drop }) => UI.toast(`${name} 暴跌 ${U.fmtPct(drop, 0)}`, 'bad'));
      game.bus.on('treasury:obligation', ({ ob }) => {
        UI.toast(`付不出 ${U.fmtMoney(ob.amount)} 元（${ob.label || ob.kind}），${ob.dueDay - game.state.day} 天內要補上`, 'bad', 6000);
      });

      document.addEventListener('keydown', (e) => {
        if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
        if (e.code === 'Space') { e.preventDefault(); game.togglePause(); this.render(); }
        else if (e.key === '.') { game.step(); this.render(true); }
        else if (e.key >= '1' && e.key <= '4') {
          const sp = BT.CONFIG.time.speeds[+e.key - 1];
          if (sp) { game.setPaused(false); game.setSpeed(sp); this.render(); }
        } else if (e.key === 'Escape') UI.closeModal();
      });
    },

    applyCompact() {
      document.body.classList.toggle('compact', !!this.game.state.settings.compact);
    },

    /** full = true 重繪整個面板；否則只更新狀態列。 */
    render(full) {
      const game = this.game;
      if (!game || !game.state) return;
      UI.topbar.render(game);
      this.applyCompact();

      for (const id in this.tabBtns) {
        const { btn, def } = this.tabBtns[id];
        btn.classList.toggle('sel', this.state.tab === id);
        const locked = def.locked && def.locked(game);
        btn.classList.toggle('lock', !!locked);
      }
      if (!full) return;

      const tab = TABS.find((t) => t.id === this.state.tab) || TABS[0];
      const fn = tab.render();
      D.clear(this.panel);
      try {
        this.panel.appendChild(fn(game));
      } catch (err) {
        console.error('[ui] 面板繪製失敗', err);
        this.panel.appendChild(D.el('div.card', null, [
          D.el('div.cardTitle', { text: '這個分頁出錯了' }),
          D.el('pre.small', { text: String(err && err.stack || err) }),
        ]));
      }
      this.panel.scrollTop = 0;
    },

    start() {
      if (this._timer) clearInterval(this._timer);
      let lastDay = -1;
      this._timer = setInterval(() => {
        const game = this.game;
        if (!game || !game.state) return;
        const n = game.tick(Date.now());
        if (n > 0 || game.state.day !== lastDay) {
          lastDay = game.state.day;
          this.render(true);
        } else {
          this.render(false);
        }
      }, 200);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
