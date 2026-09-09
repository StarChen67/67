/* 各系統：股票、商品、升級、印鈔、保全、搶劫、保險、事件、信用、破產。 */
'use strict';
module.exports = function (H) {
  const { test, suite, assert } = H;

  /* ---------------- 股票 ---------------- */
  suite('stocks — 交易與價格');

  test('買賣有手續費，來回一定虧損（不能零成本套利）', () => {
    const { game } = H.newGame({ seed: 11 });
    const before = game.totals().net;
    const b = game.stocks.buy('harvest', 100);
    assert.ok(b.ok, b.why);
    const s = game.stocks.sell('harvest', 100);
    assert.ok(s.ok, s.why);
    const after = game.totals().net;
    assert.ok(after < before, '來回交易應該虧手續費');
    assert.ok(before - after >= b.fee, '至少虧掉買進手續費');
  });

  test('現金不足不能買；沒有持股不能賣', () => {
    const { game } = H.newGame();
    assert.strictEqual(game.stocks.buy('harvest', 999999999).ok, false);
    assert.strictEqual(game.stocks.sell('harvest', 1).ok, false);
  });

  test('未解鎖的股票買不到', () => {
    const { game } = H.newGame();
    assert.strictEqual(game.stocks.buy('quantum', 1).ok, false, 'tier2 需要 Lv.3');
    game.state.bank.level = 3;
    assert.ok(game.stocks.isAvailable('quantum'));
  });

  test('平均成本正確，賣出後計入已實現損益', () => {
    const { game } = H.newGame({ seed: 13 });
    game.state.stocks.prices.harvest = 10;
    game.stocks.buy('harvest', 100);
    game.state.stocks.prices.harvest = 20;
    game.stocks.buy('harvest', 100);
    assert.strictEqual(game.stocks.avgCost('harvest'), 15);
    game.state.stocks.prices.harvest = 30;
    assert.strictEqual(game.stocks.unrealized('harvest'), (30 - 15) * 200);
    const r = game.stocks.sell('harvest', 200);
    assert.strictEqual(r.pnl, (30 - 15) * 200);
    assert.strictEqual(game.stocks.qty('harvest'), 0);
  });

  test('價格會變動且永遠為正', () => {
    const { game } = H.newGame({ seed: 4 });
    H.run(game, 200);
    for (const s of game.stocks.available()) {
      const p = game.stocks.price(s.id);
      assert.ok(p > 0 && isFinite(p), `${s.id} 價格異常 ${p}`);
    }
    const h = game.stocks.hist('harvest');
    assert.ok(h.length > 1, '應累積歷史價');
  });

  test('緊急賣股能換到現金', () => {
    const { game } = H.newGame({ seed: 9 });
    game.stocks.buy('harvest', 1000);
    const cashBefore = game.totals().cash;
    const raised = game.stocks.liquidate(10000);
    assert.ok(raised >= 10000 * 0.9, `應湊到約 10000，實際 ${raised}`);
    assert.ok(game.totals().cash > cashBefore);
  });

  /* ---------------- 理財商品 ---------------- */
  suite('products — 期限投資');

  test('到期回本金加利息，提前贖回要罰', () => {
    const { game } = H.newGame({ seed: 17 });
    H.enrich(game, { cash: 20000000, level: 4 });
    H.disableRobbery(game);
    const r = game.products.buy('gov_short', 1000000, game.state.day);
    assert.ok(r.ok, r.why);
    assert.strictEqual(game.totals().cash, 19000000);
    const def = game.products.def('gov_short');
    const expected = Math.round(1000000 * (1 + def.yield * def.termDays / 365));
    // 推進到到期
    H.run(game, def.termDays + 1);
    assert.strictEqual(game.products.holdings().length, 0, '應已到期');
    assert.ok(game.state.products.realized > 0, '應有收益');
    assert.ok(Math.abs(game.state.products.realized - (expected - 1000000)) < 5);
  });

  test('提前贖回會虧罰則', () => {
    const { game } = H.newGame({ seed: 19 });
    H.enrich(game, { cash: 20000000, level: 4 });
    const r = game.products.buy('gov_long', 1000000, game.state.day);
    const back = game.products.redeemEarly(r.holding.id, game.state.day + 5);
    assert.ok(back.ok);
    assert.ok(back.loss > 0, '提前贖回應有損失');
    assert.strictEqual(back.back, Math.round(1000000 * (1 - game.products.def('gov_long').earlyPenalty)));
  });

  test('公債開局就能買，高階商品要等級', () => {
    const { game } = H.newGame();
    H.enrich(game, { cash: 20000000 });
    assert.ok(game.products.buy('gov_short', 1000000, 0).ok, '短期公債 Lv.1 就開放');
    assert.strictEqual(game.products.buy('junk_bond', 5000000, 0).ok, false, '高收益債需要 Lv.4');
    game.state.bank.level = 4;
    assert.ok(game.products.isAvailable('junk_bond'));
  });

  /* ---------------- 升級 ---------------- */
  suite('upgrades — 等級與解鎖');

  test('條件不足不能升級，全部滿足才能升', () => {
    const { game } = H.newGame({ seed: 23 });
    assert.strictEqual(game.upgrades.canUpgrade().ok, false);
    H.enrich(game, { cash: 500000, credit: 700, customers: 20, customerOpts: { type: 'retail', amount: 20000 } });
    game.state.bank.xp = 9999;
    const chk = game.upgrades.canUpgrade();
    assert.ok(chk.ok, JSON.stringify(chk.req));
    const before = game.totals().cash;
    const r = game.upgrades.upgrade();
    assert.ok(r.ok);
    assert.strictEqual(game.state.bank.level, 2);
    assert.strictEqual(game.state.bank.xp, 0, '升級後經驗歸零');
    assert.ok(game.totals().cash < before, '應扣款');
  });

  test('功能解鎖是累積的', () => {
    const { game } = H.newGame();
    assert.ok(game.upgrades.unlocked('deposits'));
    assert.strictEqual(game.upgrades.unlocked('printer'), false);
    game.state.bank.level = 5;
    assert.ok(game.upgrades.unlocked('printer'));
    assert.ok(game.upgrades.unlocked('camera'), 'Lv.2 的功能在 Lv.5 仍然有效');
    assert.strictEqual(game.upgrades.featureLevel('printer'), 5);
  });

  test('通膨會推高升級費用', () => {
    const { game } = H.newGame();
    const base = game.upgrades.upgradeCost();
    game.state.economy.inflation = 100;
    assert.strictEqual(game.upgrades.upgradeCost(), base * 2);
  });

  /* ---------------- 印鈔機 ---------------- */
  suite('printer — 印鈔與通膨');

  test('等級不足不能買印鈔機', () => {
    const { game } = H.newGame();
    H.enrich(game, { cash: 999999999 });
    assert.strictEqual(game.printer.canBuy().ok, false);
  });

  test('印鈔給現金但推高通膨，且有冷卻', () => {
    const { game } = H.newGame({ seed: 31 });
    H.enrich(game, { cash: 20000000, level: 5 });
    assert.ok(game.printer.upgrade().ok);
    const cash0 = game.totals().cash;
    const r = game.printer.print(game.state.day);
    assert.ok(r.ok, r.why);
    assert.strictEqual(game.totals().cash, cash0 + r.amount);
    assert.ok(game.state.economy.inflation > 0, '通膨應上升');
    assert.strictEqual(game.printer.canPrint(game.state.day).ok, false, '應有冷卻');
  });

  test('小銀行狂印鈔會被通膨反噬（不是無限刷錢）', () => {
    const { game } = H.newGame({ seed: 37 });
    H.enrich(game, { cash: 20000000, level: 5 });
    game.printer.upgrade();
    const costBefore = game.security.buildCost('door_lock');
    for (let i = 0; i < 10; i++) {
      game.state.printer.lastPrintDay = -999;
      game.printer.print(game.state.day);
    }
    assert.ok(game.state.economy.inflation > 20, `通膨應顯著上升，實際 ${game.state.economy.inflation}`);
    assert.ok(game.security.buildCost('door_lock') > costBefore * 1.2, '成本應被通膨推高');
    assert.ok(game.economy.demandedRate() > game.state.economy.marketRate, '客戶會要求更高利率');
  });

  /* ---------------- 保全 ---------------- */
  suite('security — 設備與防禦');

  test('蓋設備要花錢、加防禦，等級不足蓋不了', () => {
    const { game } = H.newGame({ seed: 41 });
    H.enrich(game, { cash: 5000000 });
    const d0 = game.security.defense();
    const r = game.security.build('door_lock');
    assert.ok(r.ok, r.why);
    assert.ok(game.security.defense() > d0);
    assert.strictEqual(game.security.build('smart').ok, false, '智慧保全需要 Lv.5');
  });

  test('耐久下降會折損防禦力，維修可恢復', () => {
    const { game } = H.newGame({ seed: 43 });
    H.enrich(game, { cash: 5000000, devices: { door_lock: 3, alarm: 2, vault: 2 } });
    const full = game.security.defense();
    game.security.damage('door_lock', 0.5);
    assert.ok(game.security.defense() < full, '損壞後防禦下降');
    const cost = game.security.repairCost('door_lock');
    assert.ok(cost > 0);
    assert.ok(game.security.repair('door_lock').ok);
    assert.ok(Math.abs(game.security.defense() - full) < 0.001, '維修後恢復');
  });

  test('保全人員：人數、裝備、訓練都加防禦，也都要付薪水', () => {
    const { game } = H.newGame({ seed: 47 });
    H.enrich(game, { cash: 50000000, level: 3 });
    assert.ok(game.security.hire(4).ok);
    const d1 = game.security.guardDefense();
    const w1 = game.security.guardWage();
    assert.ok(d1 > 0 && w1 > 0);
    assert.ok(game.security.upgradeEquip().ok);
    assert.ok(game.security.guardDefense() > d1);
    assert.ok(game.security.guardWage() > w1, '裝備升級後薪資變高');
    game.security.injure(4);
    assert.strictEqual(game.security.guardDefense(), 0, '全員受傷就沒有防禦');
  });

  test('維護費每天照付，會變成待付義務', () => {
    const { game } = H.newGame({ seed: 53 });
    H.enrich(game, { cash: 5000000, devices: { door_lock: 5, alarm: 5, vault: 3 } });
    const maint = game.security.maintCost();
    assert.ok(maint > 0);
    game.state.bank.cash = 0;
    game.security.tick(game.state.day);
    assert.ok(game.treasury.obligationsTotal() > 0, '付不出維護費應產生待付義務');
  });

  /* ---------------- 搶劫 ---------------- */
  suite('robbery — 風險與結算');

  test('現金越多風險越高，保全越好風險越低', () => {
    const { game } = H.newGame({ seed: 59 });
    game.state.bank.cash = 100000;
    const low = game.robbery.risk();
    game.state.bank.cash = 20000000;
    const high = game.robbery.risk();
    assert.ok(high > low, `現金多應更危險 ${low} → ${high}`);
    H.enrich(game, { devices: { door_lock: 5, alarm: 5, camera: 6, vault: 6 } });
    assert.ok(game.robbery.risk() < high, '保全應降低風險');
  });

  test('開局前 10 天不會被搶', () => {
    const { game } = H.newGame({ seed: 61 });
    game.state.bank.cash = 500000000;
    for (let d = 1; d < 10; d++) {
      game.state.day = d;
      assert.strictEqual(game.robbery.tick(game.rng, d), null, `第 ${d} 天不該被搶`);
    }
  });

  test('金庫保護的現金搶不走', () => {
    const { game } = H.newGame({ seed: 67 });
    H.enrich(game, { cash: 300000, devices: { vault: 1 } });   // vault Lv1 保護 10 萬
    game.state.day = 50;
    // 讓一個弱小偷來搶，攻擊力遠低於金庫強度
    const r = game.robbery.attempt(() => 0.99, 50, { tier: 'thief' });
    if (r.success) {
      assert.ok(!r.breached, '弱小偷不該突破金庫');
      assert.ok(r.accessible <= 200000 + 1, `可拿到的錢應扣掉保護額，實際 ${r.accessible}`);
    }
  });

  test('搶劫成功會扣現金、扣信用、加恐慌，且現金不會變負', () => {
    const { game } = H.newGame({ seed: 71 });
    H.enrich(game, { cash: 5000000 });
    game.state.day = 50;
    const credit0 = game.credit.score;
    const r = game.robbery.attempt(() => 0.0001, 50, { tier: 'legend' });  // rng 極小 → 成功判定必過
    assert.ok(r.success, '傳奇搶匪對上基礎保全應該會成功');
    assert.ok(r.loot > 0);
    assert.ok(game.state.bank.cash >= 0);
    assert.strictEqual(game.state.bank.cash, 5000000 - r.loot);
    assert.ok(game.credit.score < credit0, '信用應下降');
    assert.ok(game.state.bank.panic > 0, '恐慌應上升');
    assert.strictEqual(game.state.stats.stolen, r.loot);
  });

  test('防守成功會加信用與經驗', () => {
    const { game } = H.newGame({ seed: 73 });
    H.enrich(game, { cash: 300000, devices: { door_lock: 5, alarm: 5, vault: 3 } });
    game.state.day = 50;
    const credit0 = game.credit.score;
    const xp0 = game.state.bank.xp;
    const r = game.robbery.attempt(() => 0.9999, 50, { tier: 'thief' });  // rng 極大 → 成功判定必敗
    assert.ok(!r.success, '小偷對上滿級門鎖應該失敗');
    assert.ok(game.credit.score > credit0);
    assert.ok(game.state.bank.xp > xp0);
    assert.strictEqual(game.state.stats.defended, 1);
  });

  /* ---------------- 保險 ---------------- */
  suite('insurance — 保費與理賠');

  test('保費隨風險上升，理賠有比例與上限', () => {
    const { game } = H.newGame({ seed: 79 });
    H.enrich(game, { cash: 50000000, level: 5 });
    assert.ok(game.insurance.subscribe('basic', game.state.day).ok);
    const p1 = game.insurance.premium();
    H.enrich(game, { devices: { door_lock: 5, alarm: 5, camera: 6, vault: 6 } });
    const p2 = game.insurance.premium();
    assert.ok(p2 < p1, `保全變好保費應變便宜 ${p1} → ${p2}`);
    const cash0 = game.totals().cash;
    const payout = game.insurance.claim(10000000, game.state.day);
    assert.strictEqual(payout, 3000000, '基本保險上限 300 萬');
    assert.strictEqual(game.totals().cash, cash0 + payout);
  });

  test('沒保險就沒有理賠', () => {
    const { game } = H.newGame();
    assert.strictEqual(game.insurance.claim(1000000, 0), 0);
  });

  /* ---------------- 事件 ---------------- */
  suite('events — 修正值與一次性效果');

  test('持續事件提供修正值，到期後消失', () => {
    const { game } = H.newGame({ seed: 83 });
    game.events.fire('police_patrol', game.rng, 10);
    assert.strictEqual(game.events.mod('riskAdd'), -15);
    game.state.day = 10 + game.events.activeDefs()[0].def.days + 1;
    game.events.tick(() => 1, game.state.day);
    assert.strictEqual(game.events.mod('riskAdd'), 0, '到期後應歸零');
  });

  test('股市崩盤立即壓低所有股價', () => {
    const { game } = H.newGame({ seed: 89 });
    const before = game.stocks.price('harvest');
    game.events.fire('market_crash', game.rng, 5);
    assert.ok(game.stocks.price('harvest') < before);
    assert.ok(game.events.mod('volMult') > 1, '崩盤期間波動變大');
  });

  test('大型客戶存款會真的進帳', () => {
    const { game } = H.newGame({ seed: 97 });
    const cash0 = game.totals().cash;
    game.events.fire('big_deposit', game.rng, 3);
    assert.ok(game.totals().cash > cash0);
    assert.ok(game.customers.count() > 0);
  });

  test('事件冷卻期間不會重複抽到', () => {
    const { game, BT } = H.newGame({ seed: 101 });
    const def = BT.registries.events.get('rate_up');
    assert.ok(game.events.eligible(def, 10), '一開始應該可以抽到');
    game.events.fire('rate_up', game.rng, 10);
    assert.strictEqual(game.state.events.lastFired.rate_up, 10);
    assert.strictEqual(game.events.eligible(def, 10 + def.cooldown - 1), false, '冷卻中不該再抽到');
    assert.ok(game.events.eligible(def, 10 + def.cooldown), '冷卻結束後可以再抽');
  });

  test('最低等級限制：高階事件在小銀行不會出現', () => {
    const { game, BT } = H.newGame({ seed: 102 });
    const def = BT.registries.events.get('syndicate_target');
    assert.strictEqual(game.events.eligible(def, 100), false, 'Lv.5 事件不該在 Lv.1 出現');
    game.state.bank.level = 5;
    assert.ok(game.events.eligible(def, 100));
  });

  /* ---------------- 信用 ---------------- */
  suite('credit — 評級');

  test('分數對應正確評級', () => {
    const { game } = H.newGame();
    assert.strictEqual(game.credit.rating(950).id, 'AAA');
    assert.strictEqual(game.credit.rating(700).id, 'A');
    assert.strictEqual(game.credit.rating(599).id, 'BB');
    assert.strictEqual(game.credit.rating(0).id, 'D');
  });

  test('逾期未付會持續扣信用', () => {
    const { game } = H.newGame({ seed: 103 });
    const c = game.customers.spawn(game.rng, 0, { type: 'retail', amount: 200000, cap: false });
    game.state.bank.cash = 0;
    game.customers.withdraw(c, 200000, 1);
    game.state.day = 20;                     // 遠超過 5 天寬限
    const before = game.credit.score;
    game.credit.tick(20);
    assert.ok(game.credit.score < before, '逾期應扣分');
    assert.ok(game.treasury.hasOverdue(20));
  });

  /* ---------------- 破產 ---------------- */
  suite('bankruptcy — 失敗條件');

  test('逾期付不出客戶提款會倒閉', () => {
    const { game } = H.newGame({ seed: 107 });
    const c = game.customers.spawn(game.rng, 0, { type: 'retail', amount: 300000, cap: false });
    game.state.bank.cash = 0;
    game.customers.withdraw(c, 300000, 1);
    game.state.day = 10;
    const over = game.bankruptcy.tick(10);
    assert.ok(over, '應該倒閉');
    assert.strictEqual(over.reason, 'withdraw');
    assert.ok(over.summary.days === 10);
    assert.ok(game.state.gameOver);
  });

  test('淨資產為負連續 10 天會倒閉', () => {
    const { game, BT } = H.newGame({ seed: 109 });
    const c = game.customers.spawn(game.rng, 0, { type: 'retail', amount: 1000000, cap: false });
    game.state.bank.cash = 100;              // 錢不見了，負債還在
    for (let d = 1; d <= BT.CONFIG.bankruptcy.negativeNetWorthDays; d++) {
      game.state.day = d;
      game.bankruptcy.tick(d);
    }
    assert.ok(game.state.gameOver, '應該倒閉');
    assert.strictEqual(game.state.gameOver.reason, 'netWorth');
  });

  test('單純有存款負債不會倒閉', () => {
    const { game } = H.newGame({ seed: 113 });
    for (let i = 0; i < 20; i++) game.customers.spawn(game.rng, 0, { type: 'retail', amount: 30000 });
    H.run(game, 60);
    assert.ok(!game.state.gameOver, '正常經營不該倒閉');
    assert.ok(game.totals().liabilities > 0, '應該有負債');
  });
};
