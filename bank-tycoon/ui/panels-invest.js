/* ============================================================
   ui/panels-invest.js — 股票、理財商品、印鈔機
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
  function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

  /* ---------------- 股票 ---------------- */
  P.stocks = function (game) {
    const wrap = D.el('div');
    const st = game.stocks;
    const sel = UI.app.state.stock || (st.available()[0] && st.available()[0].id);

    /* 持股總覽 */
    const holdings = Object.keys(game.state.stocks.holdings);
    wrap.appendChild(card('投資組合', D.el('small.dim', { text: `手續費 ${U.fmtPct(BT.CONFIG.stocks.fee, 1)}（買賣皆收）` }), D.el('div', null, [
      D.kv([
        ['持股市值', U.fmtMoney(st.totalValue())],
        ['投入成本', U.fmtMoney(st.totalCost())],
        ['未實現損益', D.money(st.totalUnrealized(), { sign: true })],
        ['已實現損益', D.money(game.state.stocks.realized, { sign: true })],
        ['累計手續費', U.fmtMoney(game.state.stocks.fees)],
        ['佔總資產', U.fmtPct(game.totals().assets > 0 ? st.totalValue() / game.totals().assets : 0, 1)],
      ]),
      holdings.length ? D.btn('全部變現（緊急用）', () => {
        const got = st.liquidate(st.totalValue());
        UI.toast(`賣出全部持股，入帳 ${U.fmtMoney(got)} 元`, 'good');
        UI.app.render(true);
      }, { cls: 'warn' }) : null,
      D.el('div.note', { text: '持股市值超過股東權益太多時，一次崩盤就可能讓淨資產轉負。用客戶的錢投資，虧的是你的資本。' }),
    ])));

    /* 市場清單 */
    const list = D.el('div.tbl.stocks');
    list.appendChild(D.el('div.tr.th', null, [
      D.el('span', { text: '標的' }), D.el('span', { text: '股價' }), D.el('span', { text: '漲跌' }),
      D.el('span', { text: '走勢' }), D.el('span', { text: '風險' }), D.el('span', { text: '持有' }), D.el('span', { text: '損益' }),
    ]));
    for (const s of BT.registries.stocks.all()) {
      const open = st.isAvailable(s.id);
      const chg = st.changePct(s.id);
      const sec = BT.SECTORS[s.sector];
      const qty = st.qty(s.id);
      const un = st.unrealized(s.id);
      const row = D.el('div.tr' + (open ? '.click' : '.locked') + (sel === s.id ? '.sel' : ''), {
        onclick: open ? () => { UI.app.state.stock = s.id; UI.app.render(true); } : null,
      }, [
        D.el('span', null, [
          D.el('b', { text: s.name }),
          D.el('small.dim', { text: ` ${s.code}　` }),
          D.el('small', { text: sec.icon + sec.name, style: { color: sec.color } }),
        ]),
        D.el('span', { text: open ? U.fmtPrice(st.price(s.id)) : '—' }),
        D.el('span', { text: open ? U.fmtSigned(chg * 100) + '%' : '', class: chg > 0 ? 'green' : (chg < 0 ? 'red' : 'dim') }),
        D.el('span', null, open ? UI.spark(st.hist(s.id).slice(-40), chg >= 0 ? '#3ddc97' : '#ff5d73') : null),
        D.el('span.small', { text: open ? stars(s.risk) : `Lv.${game.upgrades.featureLevel(BT.STOCK_TIER_FEATURE[s.tier])} 解鎖`, class: 'dim' }),
        D.el('span', { text: qty ? String(qty) : '—' }),
        D.el('span', { text: qty ? U.fmtMoney(un) : '', class: un > 0 ? 'green' : (un < 0 ? 'red' : 'dim') }),
      ]);
      list.appendChild(row);
    }
    wrap.appendChild(card('股票市場', null, list));

    /* 個股交易 */
    if (sel && st.isAvailable(sel)) {
      const s = st.def(sel);
      const price = st.price(sel);
      const hist = st.hist(sel);
      const body = D.el('div');
      body.appendChild(D.el('div.desc', { text: s.desc }));
      body.appendChild(D.kv([
        ['股價', U.fmtPrice(price)],
        ['公司評級', s.rating],
        ['風險等級', stars(s.risk)],
        ['年化期望', U.fmtPct(s.drift, 0)],
        ['日波動', U.fmtPct(s.vol, 1)],
        ['持有股數', String(st.qty(sel))],
        ['平均成本', st.qty(sel) ? U.fmtPrice(st.avgCost(sel)) : '—'],
        ['未實現損益', D.money(st.unrealized(sel), { sign: true })],
      ]));
      if (hist.length > 2) {
        body.appendChild(UI.chart([{ name: s.name, color: BT.SECTORS[s.sector].color, values: hist, fill: true }], { height: 160, fmt: (v) => v.toFixed(0) }));
      }
      body.appendChild(D.amountRow({
        placeholder: '買進股數',
        action: '買進',
        quick: [
          { label: '25%', value: () => st.maxBuy(sel) * 0.25 },
          { label: '50%', value: () => st.maxBuy(sel) * 0.5 },
          { label: '全部', value: () => st.maxBuy(sel) },
        ],
        onSubmit: (v) => {
          const r = st.buy(sel, v);
          UI.toast(r.ok ? `買進 ${r.qty} 股，共 ${U.fmtMoney(r.total)} 元` : r.why, r.ok ? 'good' : 'bad');
          UI.app.render(true);
          return r.ok;
        },
      }));
      if (st.qty(sel) > 0) {
        body.appendChild(D.amountRow({
          placeholder: '賣出股數',
          action: '賣出',
          quick: [
            { label: '25%', value: () => st.qty(sel) * 0.25 },
            { label: '50%', value: () => st.qty(sel) * 0.5 },
            { label: '全部', value: () => st.qty(sel) },
          ],
          onSubmit: (v) => {
            const r = st.sell(sel, v);
            UI.toast(r.ok ? `賣出 ${r.qty} 股，入帳 ${U.fmtMoney(r.net)}（損益 ${U.fmtSigned(r.pnl, 0)}）` : r.why, r.ok ? 'good' : 'bad');
            UI.app.render(true);
            return r.ok;
          },
        }));
      }
      wrap.appendChild(card(`${s.name} ${s.code}`, null, body));
    }
    return wrap;
  };

  /* ---------------- 理財商品 ---------------- */
  P.products = function (game) {
    const wrap = D.el('div');
    const pr = game.products;
    const day = game.state.day;

    wrap.appendChild(card('固定收益部位', null, D.el('div', null, [
      D.kv([
        ['投入本金', U.fmtMoney(pr.totalPrincipal())],
        ['目前價值（含應計）', U.fmtMoney(pr.totalValue(day))],
        ['累計已實現', D.money(game.state.products.realized, { sign: true })],
        ['持有筆數', `${pr.holdings().length} / ${BT.CONFIG.products.maxHoldings}`],
      ]),
      D.el('div.note', { text: '固定收益是銀行最主要的獲利來源：用便宜的存款買下比存款利率高的資產，賺中間的利差。但錢會被鎖到到期日，客戶提款時救不了你。' }),
    ])));

    /* 可申購清單 */
    const list = D.el('div.tbl');
    list.appendChild(D.el('div.tr.th', null, [
      D.el('span', { text: '商品' }), D.el('span', { text: '年化' }), D.el('span', { text: '期限' }),
      D.el('span', { text: '最低申購' }), D.el('span', { text: '風險' }), D.el('span', { text: '' }),
    ]));
    for (const p of BT.registries.products.all()) {
      const open = pr.isAvailable(p.id);
      const annualDefault = p.defaultProb * 365 * p.defaultLoss;
      list.appendChild(D.el('div.tr' + (open ? '' : '.locked'), null, [
        D.el('span', null, [D.el('b', { text: p.icon + ' ' + p.name }), D.el('small.dim.block', { text: p.desc })]),
        D.el('span.green', { text: U.fmtPct(p.yield, 1) }),
        D.el('span', { text: p.termDays + ' 天' }),
        D.el('span', { text: U.fmtMoney(p.min) }),
        D.el('span.small', { text: p.defaultProb ? `違約損耗約 ${U.fmtPct(annualDefault, 1)}/年` : '無違約風險', class: p.defaultProb ? 'amber' : 'dim' }),
        open
          ? D.btn('申購', () => { UI.app.state.product = p.id; UI.app.render(true); }, { cls: 'mini' })
          : D.el('span.small.dim', { text: `Lv.${p.minLevel} 解鎖` }),
      ]));
    }
    wrap.appendChild(card('可申購商品', null, list));

    /* 申購表單 */
    const selId = UI.app.state.product;
    if (selId && pr.isAvailable(selId)) {
      const p = pr.def(selId);
      const cash = game.totals().cash;
      wrap.appendChild(card(`申購 ${p.name}`, D.btn('關閉', () => { UI.app.state.product = null; UI.app.render(true); }, { cls: 'mini' }), D.el('div', null, [
        D.el('div.desc', { text: `${p.termDays} 天後可領回本金加 ${U.fmtPct(p.yield * p.termDays / 365, 2)} 的利息；提前贖回要罰本金的 ${U.fmtPct(p.earlyPenalty, 0)}，而且已累積的利息全部沒收。` }),
        D.amountRow({
          placeholder: `最低 ${U.fmtMoney(p.min)}`,
          action: '申購',
          quick: [
            { label: '最低', value: () => p.min },
            { label: '現金 25%', value: () => cash * 0.25 },
            { label: '現金 50%', value: () => cash * 0.5 },
          ],
          onSubmit: (v) => {
            const r = pr.buy(selId, v, game.state.day);
            UI.toast(r.ok ? `申購 ${U.fmtMoney(v)} 元 ${p.name}` : r.why, r.ok ? 'good' : 'bad');
            UI.app.render(true);
            return r.ok;
          },
        }),
      ])));
    }

    /* 持有明細 */
    const hs = pr.holdings();
    const hold = D.el('div.tbl');
    hold.appendChild(D.el('div.tr.th', null, [
      D.el('span', { text: '商品' }), D.el('span', { text: '本金' }), D.el('span', { text: '目前價值' }),
      D.el('span', { text: '到期' }), D.el('span', { text: '' }),
    ]));
    for (const h of hs.slice().sort((a, b) => a.matureDay - b.matureDay)) {
      const p = pr.def(h.productId);
      const left = h.matureDay - day;
      hold.appendChild(D.el('div.tr', null, [
        D.el('span', { text: p.icon + ' ' + p.name }),
        D.el('span', { text: U.fmtMoney(h.amount) }),
        D.el('span.green', { text: U.fmtMoney(pr.accruedValue(h, day)) }),
        D.el('span', null, [
          D.bar(1 - U.clamp(left / p.termDays, 0, 1), '', `剩 ${left} 天`),
        ]),
        D.btn('提前贖回', () => {
          const r = pr.redeemEarly(h.id, day);
          UI.toast(r.ok ? `贖回 ${U.fmtMoney(r.back)} 元，罰則 ${U.fmtMoney(r.loss || 0)}` : r.why, r.ok ? 'warn' : 'bad');
          UI.app.render(true);
        }, { cls: 'mini warn' }),
      ]));
    }
    if (!hs.length) hold.appendChild(D.el('div.empty', { text: '目前沒有固定收益部位。' }));
    wrap.appendChild(card('持有明細', null, hold));
    return wrap;
  };

  /* ---------------- 印鈔機 ---------------- */
  P.printer = function (game) {
    const wrap = D.el('div');
    const pt = game.printer;
    const day = game.state.day;

    if (!pt.unlocked()) {
      wrap.appendChild(card('印鈔機', null, D.el('div', null, [
        D.el('div.locked-big', { text: '🔒' }),
        D.el('div.desc', { text: `需要 Lv.${game.upgrades.featureLevel(BT.CONFIG.printer.unlockFeature)} 全國銀行才能取得印鈔機。` }),
        D.el('div.note', { text: '這是遊戲裡的特殊機制，不照現實銀行制度運作。它會把未來的成本換成現在的現金。' }),
      ])));
      return wrap;
    }

    const def = pt.def();
    const next = pt.nextDef();
    const cd = pt.cooldownLeft(day);
    const body = D.el('div');

    if (!pt.owned()) {
      body.appendChild(D.el('div.desc', { text: '你還沒有印鈔機。取得之後就能定期無中生有一筆現金，代價是通貨膨脹。' }));
    } else {
      body.appendChild(D.el('div.bigNum', { text: def.icon + ' ' + def.name }));
      body.appendChild(D.el('div.desc', { text: def.desc }));
      body.appendChild(D.kv([
        ['每次產出', U.fmtMoney(def.output)],
        ['冷卻時間', def.cooldown + ' 天'],
        ['本次通膨代價', '+' + U.round(pt.inflationCost(), 2)],
        ['累計印鈔', U.fmtMoney(game.state.printer.printedTotal)],
        ['印鈔次數', String(game.state.printer.printCount)],
      ]));
      body.appendChild(D.btn(
        cd > 0 ? `冷卻中（還要 ${cd} 天）` : `🖨️ 印鈔 ${U.fmtMoney(def.output)} 元`,
        () => {
          const r = pt.print(day);
          UI.toast(r.ok ? `印出 ${U.fmtMoney(r.amount)} 元，通膨 +${U.round(r.inflation, 2)}` : r.why, r.ok ? 'good' : 'bad');
          UI.app.render(true);
        },
        { disabled: cd > 0, cls: 'big' }
      ));
    }

    const cost = pt.upgradeCost();
    if (next || !pt.owned()) {
      const chk = pt.canBuy();
      body.appendChild(D.el('div.split'));
      const target = pt.owned() ? next : BT.registries.printer.list[0];
      body.appendChild(D.el('div.subTitle', { text: pt.owned() ? `升級到 ${target.name}` : `取得 ${target.name}` }));
      body.appendChild(D.kv([
        ['產出', `${U.fmtMoney(pt.owned() ? def.output : 0)} → ${U.fmtMoney(target.output)}`],
        ['冷卻', `${pt.owned() ? def.cooldown : '—'} → ${target.cooldown} 天`],
        ['費用', U.fmtMoney(cost)],
      ]));
      body.appendChild(D.btn(pt.owned() ? '升級印鈔機' : '取得印鈔機', () => {
        const r = pt.upgrade();
        UI.toast(r.ok ? `${r.def.name} 上線` : r.why, r.ok ? 'good' : 'bad');
        UI.app.render(true);
      }, { disabled: !chk.ok, title: chk.why }));
    }
    wrap.appendChild(card('印鈔機', null, body));

    /* 通膨面板 */
    const infl = game.state.economy.inflation;
    wrap.appendChild(card('通貨膨脹', null, D.el('div', null, [
      D.el('div.bigNum', { text: U.round(infl, 1), class: 'bigNum ' + (infl > 60 ? 'red' : (infl > 25 ? 'amber' : 'green')) }),
      D.bar(U.clamp(infl / 120, 0, 1), infl > 60 ? 'crit' : (infl > 25 ? 'warn' : ''), ''),
      D.kv([
        ['成本倍率', game.economy.costMult().toFixed(3) + '×'],
        ['客戶要求利率', U.fmtPct(game.economy.demandedRate())],
        ['市場基準利率', U.fmtPct(game.state.economy.marketRate)],
        ['每日自然衰退', U.fmtPct(BT.CONFIG.economy.inflationDecay, 0)],
      ]),
      D.el('div.note', { text: '通膨會推高升級費、保全建設費與維護費、銀行營運費，也會讓客戶要求更高的存款利率。印越多，之後的每一步都越貴。' }),
    ])));
    return wrap;
  };
})(typeof window !== 'undefined' ? window : globalThis);
