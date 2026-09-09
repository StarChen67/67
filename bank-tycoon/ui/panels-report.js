/* ============================================================
   ui/panels-report.js — 財務報表、升級、事件紀錄、設定
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const UI = BT.UI;
  const D = UI.dom;
  const P = (UI.panels = UI.panels || {});

  function card(title, extra, body) {
    return D.el('div.card', null, [
      D.el('div.cardTitle', null, [D.el('span', { text: title }), extra || null]),
      body,
    ]);
  }

  /* ---------------- 財務報表 ---------------- */
  P.report = function (game) {
    const wrap = D.el('div');
    const t = game.totals();
    const s = game.state;
    const R = s.reports;

    /* 資產負債表 */
    const bs = D.el('div.bsheet');
    const side = (title, rows, total, cls) => {
      const box = D.el('div.bsCol', null, [D.el('div.subTitle', { text: title })]);
      for (const [k, v] of rows) box.appendChild(D.el('div.bsRow', null, [D.el('span', { text: k }), D.el('span', { text: U.fmtMoney(v) })]));
      box.appendChild(D.el('div.bsRow.total', null, [D.el('span', { text: '合計' }), D.el('span', { text: U.fmtMoney(total), class: cls })]));
      return box;
    };
    bs.appendChild(side('資產', [
      ['現金', t.cash],
      ['股票', t.stockValue],
      ['理財商品', t.productValue],
    ], t.assets));
    bs.appendChild(side('負債', [
      ['客戶存款', t.deposits],
      ['應付利息', t.payable],
      ['待付款項', t.obligations],
      ['貸款', t.loans],
    ], t.liabilities, 'red'));
    wrap.appendChild(card('資產負債表', D.el('small.dim', { text: U.fmtDay(s.day) }), D.el('div', null, [
      bs,
      D.el('div.netRow', null, [
        D.el('span', { text: '淨資產 ＝ 資產 － 負債' }),
        D.el('b', { text: U.fmtMoney(t.net), class: t.net >= 0 ? 'green' : 'red' }),
      ]),
    ])));

    /* 昨日損益表 */
    const book = R.yesterday && (game.reports.totalIncome(R.yesterday) + game.reports.totalExpense(R.yesterday)) > 0 ? R.yesterday : R.today;
    const pl = D.el('div.bsheet');
    const incRows = BT.INCOME_KEYS.filter((k) => book.income[k] > 0).map((k) => [BT.INCOME_LABEL[k], book.income[k]]);
    const expRows = BT.EXPENSE_KEYS.filter((k) => book.expense[k] > 0).map((k) => [BT.EXPENSE_LABEL[k], book.expense[k]]);
    pl.appendChild(side('收入', incRows.length ? incRows : [['—', 0]], game.reports.totalIncome(book), 'green'));
    pl.appendChild(side('支出', expRows.length ? expRows : [['—', 0]], game.reports.totalExpense(book), 'red'));
    const profit = game.reports.todayProfit();
    wrap.appendChild(card('損益表（最近一日）', null, D.el('div', null, [
      pl,
      D.el('div.netRow', null, [
        D.el('span', { text: '當日淨利（含未實現損益）' }),
        D.el('b', { text: U.fmtMoney(profit), class: profit >= 0 ? 'green' : 'red' }),
      ]),
      D.el('div.note', { text: '存提款與買賣本金只是資產負債表的搬移，不計入收入支出；這裡只記真正的損益。' }),
    ])));

    /* 曲線 */
    const range = UI.app.state.reportRange || 180;
    const hist = game.reports.series(range);
    const chartBody = D.el('div');
    const rangeBtns = D.el('div.btnRow');
    for (const r of [90, 180, 360, 1080]) {
      rangeBtns.appendChild(D.btn(r >= 360 ? (r / 360) + ' 年' : r + ' 天', () => { UI.app.state.reportRange = r; UI.app.render(true); }, { cls: 'mini' + (range === r ? ' sel' : '') }));
    }
    if (hist.length > 1) {
      const series = [
        { name: '總資產', color: '#5aa9ff', values: hist.map((h) => h.assets), fill: true },
        { name: '淨資產', color: '#3ddc97', values: hist.map((h) => h.net) },
        { name: '客戶存款', color: '#ff8fb1', values: hist.map((h) => h.dep), dashed: true },
      ];
      chartBody.appendChild(UI.chart(series, { height: 220, labels: [U.fmtDayShort(hist[0].d), U.fmtDayShort(hist[hist.length - 1].d)] }));
      chartBody.appendChild(UI.legend(series));
      const profits = hist.map((h) => h.profit);
      chartBody.appendChild(D.el('div.subTitle', { text: '每日淨利' }));
      chartBody.appendChild(UI.chart([{ name: '每日淨利', color: '#ffc84a', values: profits }], { height: 120 }));
    } else {
      chartBody.appendChild(D.el('div.dim.small', { text: '資料還太少。' }));
    }
    wrap.appendChild(card('歷史走勢', rangeBtns, chartBody));

    /* 統計 */
    const st = s.stats;
    wrap.appendChild(card('經營統計', null, D.kv([
      ['經營天數', String(s.day)],
      ['歷史最高總資產', U.fmtMoney(st.maxAssets)],
      ['歷史最高淨資產', U.fmtMoney(st.maxNetWorth)],
      ['最多客戶數', String(st.maxCustomers)],
      ['最高存款規模', U.fmtMoney(st.maxDeposits)],
      ['股票總損益', D.money(game.stocks.lifetimePnl(), { sign: true })],
      ['商品總損益', D.money(s.products.realized, { sign: true })],
      ['累計付出利息', U.fmtMoney(st.interestPaid)],
      ['累計保全支出', U.fmtMoney(st.securityPaid)],
      ['累計營運費', U.fmtMoney(st.opexPaid)],
      ['遭遇搶劫', `${st.robberies} 次`],
      ['成功防守', `${st.defended} 次`],
      ['被搶走總額', U.fmtMoney(st.stolen)],
      ['保險理賠', U.fmtMoney(st.insurancePayout)],
      ['累計印鈔', U.fmtMoney(st.printedTotal)],
      ['交易次數', String(st.trades)],
      ['經歷事件', `${st.eventsSeen} 次`],
    ])));
    return wrap;
  };

  /* ---------------- 升級 ---------------- */
  P.upgrade = function (game) {
    const wrap = D.el('div');
    const up = game.upgrades;
    const lv = up.level();
    const next = up.next();

    if (!next) {
      wrap.appendChild(card('銀行等級', null, D.el('div', null, [
        D.el('div.bigNum', { text: `Lv.${lv.level} ${lv.name}` }),
        D.el('div.desc', { text: lv.desc }),
        D.el('div.note.green', { text: '你已經到達最高等級。剩下的只有把數字做得更大。' }),
      ])));
    } else {
      const req = up.requirements();
      const chk = up.canUpgrade();
      const rows = D.el('div');
      for (const k of ['cost', 'assets', 'customers', 'credit', 'xp']) {
        const r = req[k];
        const isMoney = k === 'cost' || k === 'assets';
        rows.appendChild(D.el('div.reqRow' + (r.ok ? '.ok' : ''), null, [
          D.el('span.reqIcon', { text: r.ok ? '✔' : '✘' }),
          D.el('span.reqLabel', { text: r.label }),
          D.el('span.reqVal', { text: `${isMoney ? U.fmtMoney(r.have) : r.have} / ${isMoney ? U.fmtMoney(r.need) : r.need}` }),
          D.bar(U.clamp(r.have / r.need, 0, 1), r.ok ? 'ok' : ''),
        ]));
      }
      wrap.appendChild(card(`升級到 Lv.${next.level} ${next.name}`, null, D.el('div', null, [
        D.el('div.desc', { text: next.desc }),
        rows,
        D.el('div.split'),
        D.el('div.subTitle', { text: '升級後改變' }),
        D.kv([
          ['客戶上限', `${lv.maxCustomers} → ${next.maxCustomers}`],
          ['每日新客戶', `${lv.arrivals} → ${next.arrivals}`],
          ['資本槓桿上限', `${lv.maxLeverage}× → ${next.maxLeverage}×`],
          ['每日營運費', `${U.fmtMoney(lv.opex)} → ${U.fmtMoney(next.opex)}`],
          ['貸款額度', `${U.fmtMoney(lv.loanCap)} → ${U.fmtMoney(next.loanCap)}`],
          ['信用上限', `${lv.creditCap} → ${next.creditCap}`],
          ['保全人數上限', `${lv.maxGuards} → ${next.maxGuards}`],
        ]),
        next.features && next.features.length ? D.el('div.feat', null, [
          D.el('div.subTitle', { text: '解鎖功能' }),
          D.el('div.featList', null, next.features.map((f) => D.el('span.tag', { text: FEATURE_NAME[f] || f }))),
        ]) : null,
        D.btn(`升級（${U.fmtMoney(up.upgradeCost())}）`, () => {
          const r = up.upgrade();
          if (r.ok) {
            UI.toast(`銀行升級為 ${r.def.name}！`, 'good', 5000);
            UI.modals.levelUp(game, r);
          } else UI.toast(r.why, 'bad');
          UI.app.render(true);
        }, { disabled: !chk.ok, title: chk.why, cls: 'big' }),
        D.el('div.note', { text: '升級費從現金扣，也就是從股東權益扣。升級會拉高營運費與槓桿上限 —— 是投資，不是獎勵。' }),
      ])));
    }

    /* 等級總表 */
    const tbl = D.el('div.tbl');
    tbl.appendChild(D.el('div.tr.th', null, [
      D.el('span', { text: '等級' }), D.el('span', { text: '客戶上限' }), D.el('span', { text: '槓桿' }),
      D.el('span', { text: '營運費/日' }), D.el('span', { text: '解鎖' }),
    ]));
    for (const l of BT.registries.levels.all()) {
      tbl.appendChild(D.el('div.tr' + (l.level === lv.level ? '.sel' : (l.level < lv.level ? '' : '.locked')), null, [
        D.el('span', null, [D.el('b', { text: `Lv.${l.level} ${l.name}` })]),
        D.el('span', { text: String(l.maxCustomers) }),
        D.el('span', { text: l.maxLeverage + '×' }),
        D.el('span', { text: U.fmtMoney(l.opex) }),
        D.el('span.small.dim', { text: (l.features || []).map((f) => FEATURE_NAME[f] || f).join('、') || '—' }),
      ]));
    }
    wrap.appendChild(card('等級一覽', null, tbl));
    return wrap;
  };

  const FEATURE_NAME = {
    deposits: '存款業務', stocks_t1: '基礎股票', security_basic: '基礎保全',
    camera: '監視器', stocks_t2: '進階股票', guards: '保全人員', glass: '防彈玻璃',
    insurance_basic: '基本保險', products: '高階理財', access: '電子門禁',
    vault_mid: '強化金庫', insurance_premium: '高級保險', printer: '印鈔機',
    smart: '智慧保全', vault_big: '大型金庫', insurance_elite: '頂級保險',
    stocks_fund: '基金與 ETF', super_vault: '地下超級金庫', stocks_intl: '國際投資',
    stocks_global: '全球金融市場',
  };
  UI.FEATURE_NAME = FEATURE_NAME;

  /* ---------------- 事件紀錄 ---------------- */
  P.events = function (game) {
    const wrap = D.el('div');
    const ev = game.events;

    const act = ev.activeDefs();
    const actBody = D.el('div');
    if (act.length) {
      for (const { entry, def } of act) {
        const left = entry.endDay - game.state.day;
        actBody.appendChild(D.el('div.evActive.' + def.kind, null, [
          D.el('span.evIcon', { text: def.icon }),
          D.el('div.evBody', null, [
            D.el('b', { text: def.name }),
            D.el('div.small.dim', { text: def.text }),
            D.el('div.small', { text: modSummary(def) }),
          ]),
          D.el('span.evLeft', { text: `剩 ${left} 天` }),
        ]));
      }
    } else {
      actBody.appendChild(D.el('div.empty', { text: '目前沒有進行中的事件。' }));
    }
    wrap.appendChild(card('進行中的事件', null, actBody));

    const log = ev.log();
    const logBody = D.el('div.evLog');
    for (const l of log.slice(0, 60)) {
      logBody.appendChild(D.el('div.evLine.' + l.kind, null, [
        D.el('span.evDay', { text: U.fmtDayShort(l.day) }),
        D.el('span.evIcon', { text: l.icon }),
        D.el('span', { text: l.text }),
      ]));
    }
    if (!log.length) logBody.appendChild(D.el('div.empty', { text: '還沒有發生任何事件。' }));
    wrap.appendChild(card('事件紀錄', D.el('small.dim', { text: `已經歷 ${game.state.stats.eventsSeen} 次` }), logBody));
    return wrap;
  };

  function modSummary(def) {
    if (!def.mods) return '';
    const parts = [];
    const m = def.mods;
    if (m.withdrawMult) parts.push(`提款 ×${m.withdrawMult}`);
    if (m.arrivalMult) parts.push(`新客戶 ×${m.arrivalMult}`);
    if (m.volMult) parts.push(`股市波動 ×${m.volMult}`);
    if (m.riskAdd) parts.push(`搶劫風險 ${U.fmtSigned(m.riskAdd, 0)}`);
    if (m.maintMult) parts.push(`維護費 ×${m.maintMult}`);
    if (m.driftAdd) {
      for (const [sec, v] of Object.entries(m.driftAdd)) {
        const nm = sec === 'all' ? '全市場' : (BT.SECTORS[sec] ? BT.SECTORS[sec].name : sec);
        parts.push(`${nm} ${U.fmtSigned(v * 100, 0)}%/年`);
      }
    }
    return parts.join('　');
  }

  /* ---------------- 設定 ---------------- */
  P.settings = function (game) {
    const wrap = D.el('div');
    const s = game.state.settings;
    const toggle = (label, key, note) => D.el('div.setRow', null, [
      D.el('label', null, [
        D.el('input', { type: 'checkbox', checked: s[key] ? true : null, onchange: (e) => { s[key] = e.target.checked; game.save(); UI.app.render(true); } }),
        D.el('span', { text: label }),
      ]),
      note ? D.el('div.small.dim', { text: note }) : null,
    ]);

    wrap.appendChild(card('遊戲設定', null, D.el('div', null, [
      toggle('自動存檔', 'autosave', `每 ${BT.CONFIG.time.autosaveEveryDays} 天自動存一次，並保留上一份備份。`),
      toggle('發生事件時自動暫停', 'pauseOnEvent', '重要事件跳出時把時間停下來。'),
      toggle('遭遇搶劫時自動暫停', 'pauseOnRobbery', '搶劫結算畫面跳出時把時間停下來。'),
      toggle('精簡版面', 'compact', '縮小字級與間距，一頁看到更多資訊。'),
    ])));

    wrap.appendChild(card('存檔', null, D.el('div', null, [
      D.el('div.btnRow', null, [
        D.btn('立即存檔', () => { UI.toast(game.save() ? '已存檔' : '存檔失敗', game.save() ? 'good' : 'bad'); }),
        D.btn('匯出存檔', () => {
          const str = game.exportSave();
          const ta = D.$('#exportBox');
          ta.value = str;
          ta.select();
          UI.toast('已產生存檔字串，請複製保存。', 'good');
        }),
        D.btn('匯入存檔', () => {
          const str = D.$('#exportBox').value.trim();
          if (!str) { UI.toast('請先貼上存檔字串', 'bad'); return; }
          const r = game.importSave(str);
          if (r.state) { UI.toast('讀取成功', 'good'); UI.app.render(true); }
          else UI.toast('存檔字串無效：' + r.error, 'bad');
        }),
      ]),
      D.el('textarea#exportBox', { placeholder: '匯出的存檔字串會出現在這裡；也可以把先前的字串貼進來再按「匯入存檔」。', rows: 4 }),
      D.el('div.split'),
      D.btn('⚠️ 刪除存檔並重新開始', () => {
        UI.modals.confirm('確定要刪除存檔？', '目前的銀行、所有紀錄都會消失，沒辦法復原。', () => {
          BT.Save.clear(game.storage);
          location.reload();
        });
      }, { cls: 'danger' }),
    ])));

    wrap.appendChild(card('關於', null, D.el('div', null, [
      D.el('div.desc', { text: `銀行大亨 Bank Tycoon v${BT.CONFIG.version}｜存檔格式 v${BT.CONFIG.schemaVersion}` }),
      D.el('div.note', { text: '純前端單機遊戲，資料存在瀏覽器的 localStorage。關掉分頁遊戲會暫停，不會在背景繼續跑。' }),
    ])));
    return wrap;
  };
})(typeof window !== 'undefined' ? window : globalThis);
