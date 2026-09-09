/* 基礎：開局狀態、資料完整性、每日推進不會爆炸、帳目守恆。 */
'use strict';
module.exports = function (H) {
  const { test, suite, assert } = H;
  suite('core — 開局與基本推進');

  test('開局狀態符合設定', () => {
    const { game, BT } = H.newGame();
    assert.strictEqual(game.state.bank.cash, BT.CONFIG.start.cash);
    assert.strictEqual(game.state.bank.level, 1);
    assert.strictEqual(game.state.bank.credit, BT.CONFIG.start.credit);
    assert.strictEqual(game.customers.count(), 0);
    assert.strictEqual(game.totals().net, BT.CONFIG.start.cash);
    assert.strictEqual(game.credit.rating().id, 'BBB');
  });

  test('起始保全設備存在且有防禦力', () => {
    const { game } = H.newGame();
    assert.ok(game.security.levelOf('vault') >= 1, '應有金庫');
    assert.ok(game.security.defense() > 0, '防禦力應大於 0');
    assert.ok(game.security.protectCap() > 0, '金庫應保護部分現金');
  });

  test('資料表完整性：等級、股票、保全、強盜、事件', () => {
    const { BT } = H.newGame();
    const R = BT.registries;
    assert.strictEqual(R.levels.size, 8);
    assert.ok(R.stocks.size >= 20);
    assert.ok(R.security.size >= 8);
    assert.strictEqual(R.robbers.size, 5);
    assert.ok(R.events.size >= 20);
    // 每個等級的權重都指向存在的客戶類型
    for (const lv of R.levels.all()) {
      for (const id of Object.keys(lv.mix)) assert.ok(R.customerTypes.has(id), `等級 ${lv.level} 的客戶類型 ${id} 不存在`);
      for (const f of lv.features || []) assert.strictEqual(typeof f, 'string');
    }
    // 強盜權重長度要跟現金級距一致
    for (const r of R.robbers.all()) assert.strictEqual(r.weights.length, BT.CASH_TIERS.length);
    // 保全每一級的花費與維護費遞增
    for (const s of R.security.all()) {
      for (let i = 1; i < s.levels.length; i++) {
        assert.ok(s.levels[i].cost >= s.levels[i - 1].cost, `${s.id} Lv${i + 1} 花費應遞增`);
        assert.ok(s.levels[i].defense >= s.levels[i - 1].defense, `${s.id} Lv${i + 1} 防禦應遞增`);
      }
    }
    // 事件的 mods 有 days
    for (const e of R.events.all()) {
      if (e.mods) assert.ok(e.days > 0, `事件 ${e.id} 有 mods 就必須有 days`);
      assert.ok(e.w > 0, `事件 ${e.id} 需要權重`);
    }
  });

  test('跑 120 天不會出現 NaN 或負現金', () => {
    const { game } = H.newGame({ seed: 7 });
    H.run(game, 120);
    const t = game.totals();
    for (const [k, v] of Object.entries(t)) assert.ok(isFinite(v), `${k} 不是有限數：${v}`);
    assert.ok(game.state.bank.cash >= 0, '現金不可為負');
    assert.ok(game.state.day === 120 || game.state.gameOver, '應推進 120 天');
  });

  test('帳目守恆：淨資產變化 = 收入 − 支出 + 未實現變化', () => {
    const { game } = H.newGame({ seed: 21 });
    H.run(game, 30);
    const before = game.totals().net;
    const beforeUnreal = game.stocks.totalUnrealized() + game.products.totalValue(game.state.day) - game.products.totalPrincipal();
    game.sim.advanceDay();
    const after = game.totals().net;
    const afterUnreal = game.stocks.totalUnrealized() + game.products.totalValue(game.state.day) - game.products.totalPrincipal();
    const book = game.state.reports.today;
    const income = game.reports.totalIncome(book);
    const expense = game.reports.totalExpense(book);
    const expected = income - expense + (afterUnreal - beforeUnreal);
    // 允許四捨五入誤差（每筆金額都會 round）
    assert.ok(Math.abs((after - before) - expected) < 50,
      `淨資產變化 ${after - before} 與帳目 ${expected} 不符`);
  });

  test('存款是負債：客戶存錢不會增加淨資產', () => {
    const { game } = H.newGame({ seed: 3 });
    const before = game.totals().net;
    game.customers.spawn(game.rng, 0, { type: 'retail', amount: 50000 });
    const after = game.totals().net;
    assert.strictEqual(after, before, '存款應同時增加資產與負債');
    assert.strictEqual(game.totals().cash, before + 50000);
  });

  test('提款：現金不足會產生待付義務而不是負現金', () => {
    const { game } = H.newGame({ seed: 5 });
    const c = game.customers.spawn(game.rng, 0, { type: 'retail', amount: 100000, cap: false });
    game.state.bank.cash = 20000;                       // 假裝錢拿去投資了
    const r = game.customers.withdraw(c, 100000, 1);
    assert.strictEqual(r.paid, 20000);
    assert.strictEqual(r.unpaid, 80000);
    assert.strictEqual(game.state.bank.cash, 0, '現金不可為負');
    assert.strictEqual(game.treasury.obligationsTotal(), 80000);
  });
};
