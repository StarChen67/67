/* ============================================================
   ui/modals.js — 事件彈窗、搶劫結算、升級、破產、新遊戲、確認框
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const UI = BT.UI;
  const D = UI.dom;

  let layer = null;
  const queue = [];
  let showing = false;

  function ensureLayer() {
    if (!layer) {
      layer = D.el('div#modalLayer');
      document.body.appendChild(layer);
    }
    return layer;
  }

  /** 一次只顯示一個彈窗，其餘排隊。 */
  function open(node, opts = {}) {
    queue.push({ node, opts });
    pump();
  }
  function pump() {
    if (showing || !queue.length) return;
    const { node, opts } = queue.shift();
    showing = true;
    const box = D.el('div.modal' + (opts.cls ? '.' + opts.cls : ''), null, node);
    const back = D.el('div.modalBack', {
      onclick: (e) => { if (e.target === back && !opts.sticky) close(); },
    }, box);
    ensureLayer().appendChild(back);
    back._close = () => { back.remove(); showing = false; setTimeout(pump, 60); };
    layer._current = back;
    requestAnimationFrame(() => box.classList.add('in'));
  }
  function close() {
    const cur = layer && layer._current;
    if (cur && cur._close) { cur._close(); layer._current = null; }
  }
  UI.closeModal = close;

  function footer(buttons) {
    return D.el('div.modalFoot', null, buttons);
  }

  UI.modals = {
    /* ---------------- 通用確認 ---------------- */
    confirm(title, text, onYes) {
      open([
        D.el('h3', { text: title }),
        D.el('p', { text }),
        footer([
          D.btn('取消', close, { cls: 'ghost' }),
          D.btn('確定', () => { close(); onYes(); }, { cls: 'danger' }),
        ]),
      ]);
    },

    /* ---------------- 新遊戲 ---------------- */
    newGame(onStart) {
      const input = D.el('input.amt', { type: 'text', maxlength: 12, value: BT.CONFIG.start.bankName, placeholder: '銀行名稱' });
      const start = () => {
        const name = (input.value || '').trim() || BT.CONFIG.start.bankName;
        close();
        onStart(name);
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
      open([
        D.el('h3', { text: '🏦 開一家銀行' }),
        D.el('p', { text: `你有 ${U.fmtMoney(BT.CONFIG.start.cash)} 元本金、一間小型銀行、一個只放得下 ${U.fmtMoney(250000)} 元的金庫。` }),
        D.el('p.dim', { text: '銀行賺錢的方式是利差：用便宜的存款去買報酬更高的資產。存款是別人的錢，虧的卻是你的資本 —— 所以現金準備、投資風險與金庫，三件事要一起顧。' }),
        input,
        footer([D.btn('開始經營', start, { cls: 'go' })]),
      ], { sticky: true, cls: 'wide' });
      setTimeout(() => input.focus(), 100);
    },

    /* ---------------- 存檔損壞 ---------------- */
    corrupt(info, onReset) {
      open([
        D.el('h3', { text: '⚠️ 存檔讀取失敗' }),
        D.el('p', { text: `錯誤：${info.error}` }),
        D.el('p.dim', { text: '主存檔與備份都無法讀取。可以重新開始一局新的銀行。' }),
        footer([D.btn('重新開始', () => { close(); onReset(); }, { cls: 'danger' })]),
      ], { sticky: true });
    },

    /* ---------------- 事件 ---------------- */
    event(game, payload) {
      const def = payload.def;
      const body = [
        D.el('div.evBig.' + def.kind, { text: def.icon }),
        D.el('h3', { text: def.name }),
        D.el('p', { text: def.text }),
      ];
      if (payload.detail && payload.detail.length) {
        body.push(D.el('ul.detail', null, payload.detail.map((d) => D.el('li', { text: d }))));
      }
      if (def.days) body.push(D.el('p.dim.small', { text: `影響持續 ${def.days} 天。` }));
      body.push(footer([D.btn('知道了', close, { cls: 'go' })]));
      open(body, { cls: 'ev-' + def.kind });
    },

    /* ---------------- 搶劫 ---------------- */
    robbery(game, report) {
      const r = report;
      const rows = [
        ['強盜類型', `${r.robber.icon} ${r.robber.name}（${r.robber.members} 人）`],
        ['強盜攻擊力', String(r.robber.attack)],
        ['銀行防禦力', String(r.defense)],
        ['金庫等級', `Lv.${r.vaultLevel}` + (r.superVaultLevel ? ` + 超級金庫 Lv.${r.superVaultLevel}` : '')],
        ['金庫保護額', U.fmtMoney(r.protectCap)],
        ['金庫強度', String(r.vaultStrength)],
      ];
      if (!r.aborted) {
        rows.push(['得手機率', U.fmtPct(r.pSuccess, 0)]);
        if (r.success) {
          rows.push(['金庫狀況', r.vaultOpened >= 1 ? '整個被撬開' : (r.vaultOpened > 0 ? `被撬開 ${U.fmtPct(r.vaultOpened, 0)}` : '守住了')]);
          rows.push(['可被搬走的現金', U.fmtMoney(r.accessible)]);
        }
      }

      const head = r.aborted
        ? { icon: '🛰️', title: '智慧保全事前攔截', cls: 'good', text: '系統在他們踏進大門前就辨識出異常，自動封鎖並通報警方。今天什麼事都沒發生。' }
        : (r.success
          ? (r.loot > 0
            ? { icon: '🚨', title: '警告！銀行遭到搶劫', cls: 'bad', text: '他們得手了。' }
            : { icon: '🏛️', title: '闖進來了，但金庫守住了', cls: 'good', text: '保全沒擋下他們，不過金庫紋風不動。現金一毛都沒少，只是門面被砸了。' })
          : { icon: '🛡️', title: '防守成功', cls: 'good', text: '保全擋下了這次攻擊，一分錢都沒有損失。' });

      const body = [
        D.el('div.robHead.' + head.cls, null, [
          D.el('div.robIcon', { text: head.icon }),
          D.el('h3', { text: head.title }),
        ]),
        D.el('p', { text: head.text }),
        D.kv(rows),
      ];

      if (r.success && r.loot > 0) {
        body.push(D.el('div.lootBox', null, [
          D.el('div.lootRow', null, [D.el('span', { text: '搶走現金' }), D.el('b.red', { text: '−' + U.fmtMoney(r.loot) })]),
          r.payout ? D.el('div.lootRow', null, [D.el('span', { text: '保險理賠' }), D.el('b.green', { text: '+' + U.fmtMoney(r.payout) })]) : null,
          D.el('div.lootRow', null, [D.el('span', { text: '淨損失' }), D.el('b.red', { text: U.fmtMoney(r.loot - r.payout) })]),
          D.el('div.lootRow', null, [D.el('span', { text: '搶劫前現金' }), D.el('span', { text: U.fmtMoney(r.cashBefore) })]),
          D.el('div.lootRow', null, [D.el('span', { text: '搶劫後現金' }), D.el('span', { text: U.fmtMoney(game.totals().cash) })]),
        ]));
      }
      const after = [];
      if (r.creditDelta) after.push(`銀行信用 ${U.fmtSigned(r.creditDelta, 0)}`);
      if (r.panicDelta) after.push(`客戶恐慌 +${r.panicDelta}`);
      if (r.injured) after.push(`${r.injured} 名保全受傷`);
      for (const d of r.damaged) after.push(`${d.name} 受損 ${d.lost}%`);
      if (after.length) body.push(D.el('ul.detail', null, after.map((x) => D.el('li', { text: x }))));

      body.push(footer([D.btn('繼續', close, { cls: 'go' })]));
      open(body, { cls: 'rob ' + head.cls });
    },

    /* ---------------- 升級 ---------------- */
    levelUp(game, r) {
      const def = r.def;
      open([
        D.el('div.evBig.good', { text: '⭐' }),
        D.el('h3', { text: `Lv.${r.to} ${def.name}` }),
        D.el('p', { text: def.desc }),
        def.features && def.features.length
          ? D.el('div.featList', null, def.features.map((f) => D.el('span.tag', { text: UI.FEATURE_NAME[f] || f })))
          : null,
        D.kv([
          ['客戶上限', String(def.maxCustomers)],
          ['資本槓桿上限', def.maxLeverage + '×'],
          ['每日營運費', U.fmtMoney(def.opex)],
        ]),
        footer([D.btn('繼續經營', close, { cls: 'go' })]),
      ], { cls: 'ev-good' });
    },

    /* ---------------- 破產 ---------------- */
    gameOver(game, over) {
      const s = over.summary;
      open([
        D.el('div.evBig.bad', { text: '💀' }),
        D.el('h2', { text: '你的銀行倒閉了！' }),
        D.el('p', { text: over.text }),
        D.el('div.split'),
        D.kv([
          ['經營天數', `${s.days} 天（${U.fmtDay(s.days)}）`],
          ['最高總資產', U.fmtMoney(s.maxAssets)],
          ['最高淨資產', U.fmtMoney(s.maxNetWorth)],
          ['最大客戶數', String(s.maxCustomers)],
          ['最高存款規模', U.fmtMoney(s.maxDeposits)],
          ['股票總損益', D.money(s.stockPnl, { sign: true })],
          ['理財商品損益', D.money(s.productPnl, { sign: true })],
          ['遭遇搶劫次數', `${s.robberies} 次`],
          ['成功防守次數', `${s.defended} 次`],
          ['被搶走總金額', U.fmtMoney(s.stolen)],
          ['保險理賠總額', U.fmtMoney(s.insurancePayout)],
          ['累計印鈔', U.fmtMoney(s.printed)],
          ['最高銀行等級', `Lv.${s.maxLevel} ${s.levelName}`],
          ['最終負債', U.fmtMoney(s.finalLiabilities)],
          ['最終淨資產', D.el('b.red', { text: U.fmtMoney(s.finalNet) })],
          ['最終信用', `${s.finalRating}（${s.finalCredit}）`],
        ]),
        footer([
          D.btn('看看帳目', close, { cls: 'ghost' }),
          D.btn('重新開一家銀行', () => {
            BT.Save.clear(game.storage);
            location.reload();
          }, { cls: 'danger' }),
        ]),
      ], { sticky: true, cls: 'over wide' });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
