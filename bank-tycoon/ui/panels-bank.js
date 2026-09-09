/* ============================================================
   ui/panels-bank.js — 銀行總覽、客戶、存款
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

  /* ---------------- 銀行總覽 ---------------- */
  P.bank = function (game) {
    const t = game.totals();
    const s = game.state;
    const lv = game.upgrades.level();
    const wrap = D.el('div');

    wrap.appendChild(card(`${s.bank.name}　${lv.name}`, D.el('small.dim', { text: lv.desc }), D.el('div', null, [
      D.kv([
        ['現金', D.money(t.cash, { plain: true })],
        ['股票市值', D.money(t.stockValue, { plain: true })],
        ['理財商品', D.money(t.productValue, { plain: true })],
        ['總資產', D.el('b', { text: U.fmtMoney(t.assets) })],
        ['客戶存款', D.money(-t.deposits, { plain: true })],
        ['應付利息', D.money(-t.payable, { plain: true })],
        ['待付款項', D.money(-t.obligations, { plain: true })],
        ['貸款餘額', D.money(-t.loans, { plain: true })],
        ['負債合計', D.el('b.red', { text: U.fmtMoney(t.liabilities) })],
        ['淨資產', D.el('b', { text: U.fmtMoney(t.net), class: t.net >= 0 ? 'green' : 'red' })],
      ]),
      D.el('div.split'),
      D.kv([
        ['現金準備率', D.el('span', { text: U.fmtPct(t.reserveRatio, 1), class: t.reserveRatio < 0.08 ? 'red' : (t.reserveRatio < 0.15 ? 'amber' : 'green') })],
        ['資本槓桿', `${(t.deposits / Math.max(1, t.net)).toFixed(1)}× / 上限 ${game.customers.maxLeverage()}×`],
        ['客戶數', `${game.customers.count()} / ${lv.maxCustomers}`],
        ['信用評級', D.el('b', { text: game.credit.rating().name + '（' + Math.round(s.bank.credit) + '）', style: { color: game.credit.rating().color } })],
        ['客戶恐慌', D.el('span', { text: Math.round(s.bank.panic) + (s.bank.bankRun ? '（擠兌中！）' : ''), class: s.bank.panic > 40 ? 'red' : (s.bank.panic > 15 ? 'amber' : 'dim') })],
      ]),
    ])));

    /* 資產曲線 */
    const hist = game.reports.series(360);
    const chartBody = D.el('div');
    if (hist.length > 1) {
      const series = [
        { name: '總資產', color: '#5aa9ff', values: hist.map((h) => h.assets), fill: true },
        { name: '淨資產', color: '#3ddc97', values: hist.map((h) => h.net) },
        { name: '現金', color: '#ffc84a', values: hist.map((h) => h.cash) },
        { name: '客戶存款', color: '#ff8fb1', values: hist.map((h) => h.dep), dashed: true },
      ];
      chartBody.appendChild(UI.chart(series, { height: 210, labels: [U.fmtDayShort(hist[0].d), U.fmtDayShort(hist[hist.length - 1].d)] }));
      chartBody.appendChild(UI.legend(series));
    } else {
      chartBody.appendChild(D.el('div.dim.small', { text: '再經營幾天就會有曲線了。' }));
    }
    wrap.appendChild(card('資產走勢（最近一年）', null, chartBody));

    /* 每日損益概要 */
    const inc = game.dailyIncome();
    const exp = game.dailyExpense();
    wrap.appendChild(card('每日損益（預估）', null, D.el('div', null, [
      D.kv([
        ['準備金利息', D.money(inc.reserve, { plain: true })],
        ['理財商品孳息', D.money(inc.products, { plain: true })],
        ['收入合計', D.el('b.green', { text: U.fmtMoney(inc.total) })],
        ['存款利息', D.money(-exp.interest, { plain: true })],
        ['銀行營運費', D.money(-exp.opex, { plain: true })],
        ['保全成本', D.money(-exp.security, { plain: true })],
        ['保險費', D.money(-exp.premium, { plain: true })],
        ['貸款利息', D.money(-exp.loanInterest, { plain: true })],
        ['支出合計', D.el('b.red', { text: U.fmtMoney(exp.total) })],
        ['預估日淨利', D.el('b', { text: U.fmtMoney(inc.total - exp.total), class: inc.total >= exp.total ? 'green' : 'red' })],
      ]),
      D.el('div.note', { text: '這裡只算固定進出。股價與商品的未實現損益要看財務報表的每日淨利。' }),
    ])));

    /* 緊急籌錢 */
    const tre = game.treasury;
    const loanBody = D.el('div');
    loanBody.appendChild(D.el('div.desc', { text: `緊急貸款額度 ${U.fmtMoney(tre.loanCap())}，已用 ${U.fmtMoney(tre.loanTotal())}。日利率 ${U.fmtPct(BT.CONFIG.treasury.loan.dailyRate, 3)}（年化約 ${U.fmtPct(BT.CONFIG.treasury.loan.dailyRate * 365, 0)}），比任何投資都貴，只在救急時用。` }));
    loanBody.appendChild(D.amountRow({
      placeholder: '借款金額',
      action: '借款',
      quick: [
        { label: '10萬', value: () => 100000 },
        { label: '一半額度', value: () => tre.loanRoom() / 2 },
        { label: '全額', value: () => tre.loanRoom() },
      ],
      onSubmit: (v) => {
        const r = tre.borrow(v);
        UI.toast(r.ok ? `借入 ${U.fmtMoney(v)} 元` : r.why, r.ok ? 'good' : 'bad');
        UI.app.render(true);
        return r.ok;
      },
    }));
    for (const loan of game.state.treasury.loans) {
      loanBody.appendChild(D.el('div.row', null, [
        D.el('span', { text: `第 ${loan.startDay} 天借入　本金 ${U.fmtMoney(loan.principal)}　日息 ${U.fmtMoney(loan.principal * loan.dailyRate)}` }),
        D.btn('全額償還', () => {
          const r = tre.repay(loan.id);
          UI.toast(r.ok ? `償還 ${U.fmtMoney(r.repaid)} 元` : r.why, r.ok ? 'good' : 'bad');
          UI.app.render(true);
        }, { cls: 'mini' }),
      ]));
    }
    /* 待付款項 */
    const obs = game.state.treasury.obligations;
    if (obs.length) {
      loanBody.appendChild(D.el('div.split'));
      loanBody.appendChild(D.el('div.subTitle.red', { text: `待付款項 ${obs.length} 筆，合計 ${U.fmtMoney(tre.obligationsTotal())} 元` }));
      for (const o of obs.slice(0, 8)) {
        const left = o.dueDay - game.state.day;
        loanBody.appendChild(D.el('div.row.small' + (left < 0 ? '.crit' : ''), null, [
          D.el('span', { text: `${o.label || o.kind}　${U.fmtMoney(o.amount)} 元` }),
          D.el('span', { text: left < 0 ? `已逾期 ${-left} 天` : `剩 ${left} 天`, class: left < 0 ? 'red' : (left <= 2 ? 'amber' : 'dim') }),
        ]));
      }
    }
    wrap.appendChild(card('資金調度', null, loanBody));
    return wrap;
  };

  /* ---------------- 客戶 ---------------- */
  P.customers = function (game) {
    const wrap = D.el('div');
    const a = game.customers.attract();
    const cap = game.customers.depositCapacity();
    const used = game.customers.capacityUsed();
    const lv = game.upgrades.level();

    const attrBody = D.el('div', null, [
      D.el('div.desc', { text: '客戶會依這些條件決定要不要把錢放你這裡。乘數越高，來的人越多、存得越多。' }),
      D.kv([
        ['利率吸引力', a.rate.toFixed(2) + '×'],
        ['信用評級', a.credit.toFixed(2) + '×'],
        ['安全程度', a.safety.toFixed(2) + '×'],
        ['客戶信心', a.panic.toFixed(2) + '×'],
        ['景氣', a.phase.toFixed(2) + '×'],
        ['事件影響', a.event.toFixed(2) + '×'],
        ['綜合吸引力', D.el('b', { text: a.total.toFixed(2) + '×', class: a.total >= 1 ? 'green' : 'red' })],
        ['每日預期新客戶', game.customers.arrivalRate().toFixed(1) + ' 位'],
      ]),
      D.el('div.split'),
      D.el('div.subTitle', { text: '資本吸收上限' }),
      D.bar(used, used > 0.9 ? 'crit' : (used > 0.7 ? 'warn' : ''), `${U.fmtMoney(game.customers.totalDeposits())} / ${U.fmtMoney(cap)}`),
      D.el('div.note', { text: `你的淨資產只能支撐 ${game.customers.maxLeverage()} 倍的客戶存款。額度用滿之後，想收更多存款就必須先把淨資產做大。單筆存款上限 ${U.fmtMoney(game.customers.sizeCap())} 元。` }),
    ]);
    wrap.appendChild(card('客戶吸引力', D.el('small.dim', { text: `${game.customers.count()} / ${lv.maxCustomers} 位` }), attrBody));

    /* 安撫客戶 */
    if (game.state.bank.panic > 0) {
      const chk = game.customers.canCalm(game.state.day);
      wrap.appendChild(card('客戶信心', null, D.el('div', null, [
        D.el('div.desc', { text: `目前恐慌值 ${Math.round(game.state.bank.panic)}。恐慌越高，客戶提款越兇；超過 ${BT.CONFIG.customers.bankRunStart} 會引發擠兌。` }),
        D.bar(game.state.bank.panic / 100, game.state.bank.panic > 60 ? 'crit' : 'warn', String(Math.round(game.state.bank.panic))),
        D.btn(`召開記者會安撫客戶（${U.fmtMoney(game.customers.calmCost())} 元，恐慌 −${BT.CONFIG.customers.calm.panicDrop}）`, () => {
          const r = game.customers.calm(game.state.day);
          UI.toast(r.ok ? '記者會結束，客戶冷靜了一些。' : r.why, r.ok ? 'good' : 'bad');
          UI.app.render(true);
        }, { disabled: !chk.ok, title: chk.why }),
      ])));
    }

    /* 類型分布 */
    const byType = game.customers.byType();
    const depByType = game.customers.depositsByType();
    const rows = D.el('div.tbl');
    rows.appendChild(D.el('div.tr.th', null, [
      D.el('span', { text: '類型' }), D.el('span', { text: '人數' }), D.el('span', { text: '存款' }), D.el('span', { text: '平均' }), D.el('span', { text: '狀態' }),
    ]));
    for (const type of BT.registries.customerTypes.all()) {
      const n = byType[type.id] || 0;
      const dep = depByType[type.id] || 0;
      const inMix = (lv.mix[type.id] || 0) > 0;
      const creditOk = game.credit.score >= type.minCredit;
      rows.appendChild(D.el('div.tr', null, [
        D.el('span', { text: `${type.icon} ${type.name}`, style: { color: type.color } }),
        D.el('span', { text: String(n) }),
        D.el('span', { text: U.fmtMoney(dep) }),
        D.el('span', { text: n ? U.fmtMoney(dep / n) : '—' }),
        D.el('span.small', { text: !inMix ? '更高等級解鎖' : (creditOk ? '往來中' : `需信用 ${type.minCredit}`), class: !inMix || !creditOk ? 'dim' : 'green' }),
      ]));
    }
    wrap.appendChild(card('客戶結構', null, rows));

    /* 前 12 大客戶 */
    const top = game.customers.top(12);
    const list = D.el('div.tbl');
    list.appendChild(D.el('div.tr.th', null, [
      D.el('span', { text: '客戶' }), D.el('span', { text: '類型' }), D.el('span', { text: '存款餘額' }), D.el('span', { text: '往來天數' }),
    ]));
    for (const c of top) {
      const type = BT.registries.customerTypes.get(c.type);
      list.appendChild(D.el('div.tr', null, [
        D.el('span', { text: c.name }),
        D.el('span', { text: type.icon + type.name, style: { color: type.color } }),
        D.el('span', { text: U.fmtMoney(c.balance) }),
        D.el('span', { text: String(game.state.day - c.joinedDay) }),
      ]));
    }
    if (!top.length) list.appendChild(D.el('div.empty', { text: '還沒有客戶。把存款利率調到市場水準以上，客戶就會慢慢上門。' }));
    wrap.appendChild(card('主要客戶', D.el('small.dim', { text: `今日 +${game.state.customers.joinedToday} / −${game.state.customers.leftToday}` }), list));
    return wrap;
  };

  /* ---------------- 存款 ---------------- */
  P.deposits = function (game) {
    const wrap = D.el('div');
    const cfg = BT.CONFIG.deposits;
    const dep = game.deposits;
    const demanded = game.economy.demandedRate();
    const ratio = dep.rateRatio();

    const rateBody = D.el('div');
    rateBody.appendChild(D.el('div.desc', { text: `客戶目前期望的利率是 ${U.fmtPct(demanded)}（市場利率 ${U.fmtPct(game.state.economy.marketRate)}，再加上通膨的影響）。給得比這高會吸引更多存款，但每天的利息成本也跟著上去。` }));

    const rateVal = D.el('div.bigNum', { text: U.fmtPct(dep.rate()) });
    const ctrl = D.el('div.rateCtrl');
    const step = (n) => D.btn(n > 0 ? `+${(n * 100).toFixed(2)}%` : `${(n * 100).toFixed(2)}%`, () => {
      dep.setRate(dep.rate() + n);
      UI.app.render(true);
    }, { cls: 'mini' });
    ctrl.appendChild(step(-0.005));
    ctrl.appendChild(step(-cfg.rateStep));
    ctrl.appendChild(rateVal);
    ctrl.appendChild(step(cfg.rateStep));
    ctrl.appendChild(step(0.005));
    ctrl.appendChild(D.btn('貼齊市場', () => { dep.setRate(demanded); UI.app.render(true); }, { cls: 'mini' }));
    rateBody.appendChild(ctrl);

    const cls = ratio < 0.6 ? 'crit' : (ratio < 0.95 ? 'warn' : (ratio > cfg.warnRateMult ? 'crit' : ''));
    rateBody.appendChild(D.bar(U.clamp(ratio / 2.5, 0, 1), cls, `目前是客戶期望的 ${ratio.toFixed(2)} 倍`));
    rateBody.appendChild(D.el('div.note', {
      text: ratio < 0.6
        ? '利率明顯偏低，客戶正在流失，新客戶也不太願意上門。'
        : (ratio > cfg.warnRateMult
          ? '利率遠高於市場，存款會衝很快，但利息成本可能吃掉全部利差。'
          : '利率在合理區間。'),
      class: 'note ' + (cls === 'crit' ? 'red' : (cls === 'warn' ? 'amber' : 'dim')),
    }));
    wrap.appendChild(card('存款利率', null, rateBody));

    const daysLeft = dep.daysToPay(game.state.day);
    wrap.appendChild(card('利息帳務', null, D.kv([
      ['存款總額', U.fmtMoney(game.customers.totalDeposits())],
      ['目前利率', U.fmtPct(dep.rate())],
      ['每日累計利息', U.fmtMoney(dep.dailyInterest())],
      ['已累計應付利息', D.el('b', { text: U.fmtMoney(dep.payable()) })],
      ['下次付息', `第 ${game.state.deposits.nextPayDay} 天（還有 ${daysLeft} 天）`],
      ['上次付息', game.state.deposits.lastPaidDay >= 0 ? `第 ${game.state.deposits.lastPaidDay} 天，${U.fmtMoney(game.state.deposits.lastPaidAmount)} 元` : '尚未付過'],
    ])));

    wrap.appendChild(card('付息提醒', null, D.el('div.note', {
      text: `每 ${cfg.payEveryDays} 天結算一次利息。付息日現金不足的話，未付部分會變成待付款項，${BT.CONFIG.treasury.dueDays.interest} 天內沒補上就是違約，信用會重挫、客戶會恐慌，再拖下去銀行就倒了。`,
    })));
    return wrap;
  };
})(typeof window !== 'undefined' ? window : globalThis);
