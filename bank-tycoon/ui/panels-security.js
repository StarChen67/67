/* ============================================================
   ui/panels-security.js — 保全設備、金庫、保險、搶劫紀錄
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

  function deviceRow(game, def) {
    const sec = game.security;
    const lv = sec.levelOf(def.id);
    const cur = sec.stats(def.id);
    const next = sec.nextStats(def.id);
    const cond = sec.condOf(def.id);
    const chk = sec.canBuild(def.id);
    const cost = sec.buildCost(def.id);
    const repair = sec.repairCost(def.id);

    const effects = [];
    if (next) {
      if (next.defense) effects.push(`防禦 ${cur ? cur.defense : 0} → ${next.defense}`);
      if (next.protectCap != null) effects.push(`保護現金 ${U.fmtMoney(cur ? cur.protectCap : 0)} → ${U.fmtMoney(next.protectCap)}`);
      if (next.breachStrength != null) effects.push(`金庫強度 ${cur ? cur.breachStrength : 0} → ${next.breachStrength}`);
      if (next.attackMult != null) effects.push(`強盜攻擊 ×${next.attackMult}`);
      if (next.policeSpeed != null) effects.push(`警方速度 ${U.fmtPct(next.policeSpeed, 0)}`);
      if (next.panicMult != null) effects.push(`事後恐慌 ×${next.panicMult}`);
      if (next.abortChance != null) effects.push(`事前攔截 ${U.fmtPct(next.abortChance, 0)}`);
      effects.push(`維護 ${U.fmtMoney(next.maint)}/日`);
    }

    return D.el('div.dev' + (lv > 0 ? '.owned' : '') + (cond < 100 ? '.damaged' : ''), null, [
      D.el('div.devHead', null, [
        D.el('span.devName', { text: `${def.icon} ${def.name}` }),
        D.el('span.devLv', { text: lv > 0 ? `Lv.${lv} / ${def.levels.length}` : '未建置' }),
      ]),
      D.el('div.devDesc', { text: def.desc }),
      lv > 0 ? D.el('div.condRow', null, [
        D.el('span.small', { text: '設備狀態' }),
        D.bar(cond / 100, cond < 60 ? 'crit' : (cond < 95 ? 'warn' : ''), Math.round(cond) + '%'),
        repair > 0 ? D.btn(`維修 ${U.fmtMoney(repair)}`, () => {
          const r = game.security.repair(def.id);
          UI.toast(r.ok ? `${def.name} 已修復` : r.why, r.ok ? 'good' : 'bad');
          UI.app.render(true);
        }, { cls: 'mini' }) : null,
      ]) : null,
      next ? D.el('div.devNext', null, [
        D.el('div.small.dim', { text: effects.join('　') }),
        D.btn(
          (lv > 0 ? `升級至 Lv.${lv + 1}` : '建置') + `　${U.fmtMoney(cost)}`,
          () => {
            const r = game.security.build(def.id);
            UI.toast(r.ok ? `${def.name} → Lv.${r.level}` : r.why, r.ok ? 'good' : 'bad');
            UI.app.render(true);
          },
          { disabled: !chk.ok, title: chk.why, cls: 'mini go' }
        ),
        !chk.ok ? D.el('span.small.dim', { text: chk.why }) : null,
      ]) : D.el('div.small.dim', { text: '已達最高等級' }),
    ]);
  }

  /* ---------------- 保全 ---------------- */
  P.security = function (game) {
    const wrap = D.el('div');
    const sec = game.security;
    const rob = game.robbery;
    const risk = rob.risk();
    const rl = rob.riskLabel(risk);

    /* 風險總覽 */
    wrap.appendChild(card('搶劫風險', D.el('small.dim', { text: `每日發生機率約 ${U.fmtPct(rob.dailyChance(), 2)}` }), D.el('div', null, [
      D.el('div.bigNum.risk-' + rl.cls, { text: `${Math.round(risk)}　${rl.name}` }),
      D.bar(risk / 100, rl.cls === 'crit' || rl.cls === 'high' ? 'crit' : (rl.cls === 'mid' ? 'warn' : ''), ''),
      D.kv([
        ['現金曝光度', Math.round(rob.exposure()) + ' / 100'],
        ['這個現金量該有的防禦', Math.round(rob.requiredDefense())],
        ['目前總防禦力', D.el('b', { text: String(Math.round(sec.defense())), class: rob.coverage() >= 1 ? 'green' : 'amber' })],
        ['保全減免', U.fmtPct(rob.mitigation(), 0)],
        ['金庫保護額', U.fmtMoney(sec.protectCap())],
        ['金庫外的現金', D.el('b', { text: U.fmtMoney(rob.exposedCash()), class: rob.exposedCash() > 0 ? 'red' : 'green' })],
        ['被盯上時的期望損失', D.money(-rob.expectedLoss(), { plain: true })],
        ['每年期望損失', D.money(-rob.annualExpectedLoss(), { plain: true })],
      ]),
      D.el('div.note', { text: '風險值只代表「多久被光顧一次」。真正決定損失大小的是金庫保護額與金庫強度 —— 現金放在金庫保護範圍內，強盜就搬不走。' }),
    ])));

    /* 可能遇到的強盜 */
    const tier = rob.cashTier();
    const tbl = D.el('div.tbl');
    tbl.appendChild(D.el('div.tr.th', null, [
      D.el('span', { text: '強盜' }), D.el('span', { text: '出現機率' }), D.el('span', { text: '攻擊力' }),
      D.el('span', { text: '得手率' }), D.el('span', { text: '金庫' }), D.el('span', { text: '預估損失' }),
    ]));
    let totalW = 0;
    for (const r of BT.registries.robbers.all()) totalW += r.weights[tier] || 0;
    for (const r of BT.registries.robbers.all()) {
      const w = r.weights[tier] || 0;
      const pv = rob.preview(r.id);
      tbl.appendChild(D.el('div.tr' + (w ? '' : '.locked'), null, [
        D.el('span', null, [D.el('b', { text: r.icon + ' ' + r.name }), D.el('small.dim.block', { text: r.desc })]),
        D.el('span', { text: totalW ? U.fmtPct(w / totalW, 0) : '—' }),
        D.el('span', { text: Math.round(pv.attack) + '' }),
        D.el('span', { text: U.fmtPct(pv.pSuccess, 0), class: pv.pSuccess > 0.6 ? 'red' : (pv.pSuccess > 0.3 ? 'amber' : 'green') }),
        D.el('span.small', { text: pv.opened <= 0 ? '守得住' : (pv.opened >= 1 ? '整個被開' : `被撬開 ${U.fmtPct(pv.opened, 0)}`), class: pv.opened <= 0 ? 'green' : (pv.opened >= 1 ? 'red' : 'amber') }),
        D.el('span', { text: w ? U.fmtMoney(pv.expectedLoss) : '—', class: 'red' }),
      ]));
    }
    wrap.appendChild(card('目前這個規模會招來的對手', null, tbl));

    /* 設備 */
    const grid = D.el('div.devGrid');
    for (const def of sec.devices()) grid.appendChild(deviceRow(game, def));
    wrap.appendChild(card('保全設備', D.el('small.dim', { text: `每日維護 ${U.fmtMoney(sec.dailyCost())} 元` }), grid));

    /* 保全人員 */
    const g = sec.guards;
    const cfgS = BT.CONFIG.security;
    const guardBody = D.el('div');
    if (!sec.guardsUnlocked()) {
      guardBody.appendChild(D.el('div.desc', { text: `需要 Lv.${game.upgrades.featureLevel('guards')} 城市銀行才能配置保全人員。` }));
    } else {
      guardBody.appendChild(D.kv([
        ['人數', `${g.count} / ${sec.maxGuards()}`],
        ['受傷', String(g.injured)],
        ['裝備等級', `${g.equip} / ${cfgS.guardMaxEquip}`],
        ['訓練等級', `${g.training} / ${cfgS.guardMaxTraining}`],
        ['提供防禦', String(Math.round(sec.guardDefense()))],
        ['每日薪資', U.fmtMoney(sec.guardWage())],
      ]));
      const row = D.el('div.btnRow');
      row.appendChild(D.btn(`招募 1 名（${U.fmtMoney(sec.hireCost(1))}）`, () => {
        const r = sec.hire(1);
        UI.toast(r.ok ? '新的保全報到了' : r.why, r.ok ? 'good' : 'bad');
        UI.app.render(true);
      }, { cls: 'mini' }));
      row.appendChild(D.btn(`招募 5 名（${U.fmtMoney(sec.hireCost(5))}）`, () => {
        const r = sec.hire(5);
        UI.toast(r.ok ? `招募了 ${r.n} 名保全` : r.why, r.ok ? 'good' : 'bad');
        UI.app.render(true);
      }, { cls: 'mini' }));
      if (g.count > 0) {
        row.appendChild(D.btn('解僱 1 名', () => { sec.fire(1); UI.app.render(true); }, { cls: 'mini warn' }));
        const ec = sec.equipCost();
        row.appendChild(D.btn(ec == null ? '裝備已滿級' : `升級裝備（${U.fmtMoney(ec)}）`, () => {
          const r = sec.upgradeEquip();
          UI.toast(r.ok ? `裝備提升到 Lv.${r.level}` : r.why, r.ok ? 'good' : 'bad');
          UI.app.render(true);
        }, { cls: 'mini', disabled: ec == null }));
        const tc = sec.trainCost();
        row.appendChild(D.btn(tc == null ? '訓練已滿級' : `加強訓練（${U.fmtMoney(tc)}）`, () => {
          const r = sec.upgradeTraining();
          UI.toast(r.ok ? `訓練提升到 Lv.${r.level}` : r.why, r.ok ? 'good' : 'bad');
          UI.app.render(true);
        }, { cls: 'mini', disabled: tc == null }));
      }
      guardBody.appendChild(row);
      guardBody.appendChild(D.el('div.note', { text: '保全人員的防禦力隨人數、裝備與訓練成長，但薪水每天都要付。受傷的保全會暫時失去戰力，過幾天才歸隊。' }));
    }
    wrap.appendChild(card('保全人員', null, guardBody));
    return wrap;
  };

  /* ---------------- 金庫（獨立分頁，聚焦現金保護） ---------------- */
  P.vault = function (game) {
    const wrap = D.el('div');
    const sec = game.security;
    const rob = game.robbery;
    const t = game.totals();
    const cap = sec.protectCap();
    const exposed = rob.exposedCash();
    const covered = t.cash - exposed;

    wrap.appendChild(card('現金保護狀況', null, D.el('div', null, [
      D.el('div.vaultViz', null, [
        D.el('div.vaultBar', null, [
          D.el('i.covered', { style: { width: (t.cash > 0 ? (covered / t.cash) * 100 : 100).toFixed(1) + '%' } }),
          D.el('i.exposed', { style: { width: (t.cash > 0 ? (exposed / t.cash) * 100 : 0).toFixed(1) + '%' } }),
        ]),
        D.el('div.vaultLegend', null, [
          D.el('span.lg', null, [D.el('i', { style: { background: '#3ddc97' } }), `金庫內 ${U.fmtMoney(covered)}`]),
          D.el('span.lg', null, [D.el('i', { style: { background: '#ff5d73' } }), `金庫外 ${U.fmtMoney(exposed)}`]),
        ]),
      ]),
      D.kv([
        ['現金總額', U.fmtMoney(t.cash)],
        ['金庫保護上限', U.fmtMoney(cap)],
        ['金庫強度（突破門檻）', String(Math.round(sec.vaultStrength()))],
        ['金庫等級', `Lv.${sec.levelOf('vault')}` + (sec.levelOf('super_vault') ? `　地下超級金庫 Lv.${sec.levelOf('super_vault')}` : '')],
      ]),
      D.el('div.note', {
        text: exposed > 0
          ? `有 ${U.fmtMoney(exposed)} 元不在金庫保護範圍內。要嘛升級金庫，要嘛把現金拿去投資、少放一點在櫃台。`
          : '目前所有現金都在金庫保護範圍內。只要沒有人的攻擊力超過金庫強度，就搬不走。',
        class: 'note ' + (exposed > 0 ? 'amber' : 'green'),
      }),
    ])));

    const grid = D.el('div.devGrid');
    for (const id of ['vault', 'super_vault']) {
      const def = BT.registries.security.get(id);
      grid.appendChild(deviceRow(game, def));
    }
    wrap.appendChild(card('金庫升級', null, grid));

    /* 搶劫紀錄 */
    const hist = game.state.robbery.history.slice().reverse();
    const tbl = D.el('div.tbl');
    tbl.appendChild(D.el('div.tr.th', null, [
      D.el('span', { text: '日期' }), D.el('span', { text: '對手' }), D.el('span', { text: '結果' }), D.el('span', { text: '損失' }), D.el('span', { text: '理賠' }),
    ]));
    for (const h of hist.slice(0, 20)) {
      tbl.appendChild(D.el('div.tr', null, [
        D.el('span', { text: U.fmtDayShort(h.day) }),
        D.el('span', { text: h.name }),
        D.el('span', { text: h.aborted ? '事前攔截' : (h.success ? '得手' : '防守成功'), class: h.success ? 'red' : 'green' }),
        D.el('span', { text: h.loot ? U.fmtMoney(h.loot) : '—', class: 'red' }),
        D.el('span', { text: h.payout ? U.fmtMoney(h.payout) : '—', class: 'green' }),
      ]));
    }
    if (!hist.length) tbl.appendChild(D.el('div.empty', { text: '目前沒有搶劫紀錄。' }));
    const s = game.state.stats;
    wrap.appendChild(card('搶劫紀錄', D.el('small.dim', { text: `遭遇 ${s.robberies} 次｜防守成功 ${s.defended} 次｜被搶走 ${U.fmtMoney(s.stolen)}` }), tbl));
    return wrap;
  };

  /* ---------------- 保險 ---------------- */
  P.insurance = function (game) {
    const wrap = D.el('div');
    const ins = game.insurance;
    const cur = ins.plan();

    wrap.appendChild(card('目前投保', null, D.el('div', null, [
      cur
        ? D.kv([
          ['方案', `${cur.icon} ${cur.name}`],
          ['理賠比例', U.fmtPct(cur.cover, 0)],
          ['單次上限', U.fmtMoney(cur.maxPayout)],
          ['每日保費', U.fmtMoney(ins.premium())],
          ['投保起始', `第 ${game.state.insurance.sinceDay} 天`],
          ['累計繳費', U.fmtMoney(game.state.insurance.paidTotal)],
          ['累計理賠', D.el('b.green', { text: U.fmtMoney(game.state.insurance.payoutTotal) })],
        ])
        : D.el('div.desc', { text: '目前沒有投保。銀行被搶時全部損失自己承擔。' }),
      cur ? D.btn('解除投保', () => {
        const r = ins.cancel(game.state.day);
        UI.toast(r.ok ? '已解除投保' : r.why, r.ok ? 'warn' : 'bad');
        UI.app.render(true);
      }, { cls: 'warn' }) : null,
      D.el('div.note', { text: '保費是風險加權的：保全越好、風險值越低，保費越便宜。所以保險是用來補「殘餘風險」的，不能拿來取代金庫。' }),
    ])));

    const list = D.el('div.tbl');
    list.appendChild(D.el('div.tr.th', null, [
      D.el('span', { text: '方案' }), D.el('span', { text: '理賠比例' }), D.el('span', { text: '單次上限' }), D.el('span', { text: '每日保費' }), D.el('span', { text: '' }),
    ]));
    for (const p of ins.plans()) {
      const open = ins.available(p.id);
      const chk = ins.canSubscribe(p.id, game.state.day);
      list.appendChild(D.el('div.tr' + (open ? '' : '.locked') + (game.state.insurance.plan === p.id ? '.sel' : ''), null, [
        D.el('span', null, [D.el('b', { text: p.icon + ' ' + p.name }), D.el('small.dim.block', { text: p.desc })]),
        D.el('span', { text: U.fmtPct(p.cover, 0) }),
        D.el('span', { text: U.fmtMoney(p.maxPayout) }),
        D.el('span', { text: open ? U.fmtMoney(ins.premiumOf(p.id)) : '—' }),
        open
          ? (game.state.insurance.plan === p.id
            ? D.el('span.small.green', { text: '投保中' })
            : D.btn('投保', () => {
              const r = ins.subscribe(p.id, game.state.day);
              UI.toast(r.ok ? `已投保 ${p.name}` : r.why, r.ok ? 'good' : 'bad');
              UI.app.render(true);
            }, { cls: 'mini go', disabled: !chk.ok, title: chk.why }))
          : D.el('span.small.dim', { text: `Lv.${game.upgrades.featureLevel(p.feature)} 解鎖` }),
      ]));
    }
    wrap.appendChild(card('可選方案', null, list));
    return wrap;
  };
})(typeof window !== 'undefined' ? window : globalThis);
