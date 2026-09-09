/* 存檔：往返、校驗、備份復原、migration 補鍵、亂數接續。 */
'use strict';
module.exports = function (H) {
  const { test, suite, assert } = H;
  suite('save — 存檔與讀檔');

  test('存檔往返後狀態完全一致', () => {
    const { game, BT, storage } = H.newGame({ seed: 211 });
    H.run(game, 40);
    game.save();
    const g2 = new BT.Game({ storage, clock: () => 1 });
    const r = g2.load();
    assert.ok(r.state, r.error);
    assert.strictEqual(g2.state.day, game.state.day);
    assert.strictEqual(g2.totals().net, game.totals().net);
    assert.strictEqual(g2.customers.count(), game.customers.count());
    assert.deepStrictEqual(g2.state.stocks.holdings, game.state.stocks.holdings);
  });

  test('讀檔後亂數接續同一條序列（結果可重現）', () => {
    const { game, BT, storage } = H.newGame({ seed: 307 });
    H.run(game, 25);
    game.save();
    const snapshot = JSON.parse(JSON.stringify(game.state));
    H.run(game, 15);
    const expected = game.totals().net;

    const g2 = new BT.Game({ storage, clock: () => 1 });
    g2.load();
    assert.deepStrictEqual(g2.state.rngState, snapshot.rngState);
    H.run(g2, 15);
    assert.strictEqual(g2.totals().net, expected, '讀檔後應走出一樣的結果');
  });

  test('校驗碼不符會被判定為損壞', () => {
    const { game, BT } = H.newGame();
    const str = BT.Save.serialize(game.state, 1);
    const env = JSON.parse(str);
    env.data = env.data.replace('"day":0', '"day":9999');
    assert.strictEqual(BT.Save.parse(JSON.stringify(env)).error, 'checksum');
  });

  test('主存檔損壞時自動用備份復原', () => {
    const { game, BT, storage } = H.newGame({ seed: 401 });
    H.run(game, 10);
    game.save();                       // 主檔（第 10 天）
    H.run(game, 5);
    game.save();                       // 主檔（15），備份（10）
    storage.setItem(BT.CONFIG.saveKey, '{壞掉的內容');
    const g2 = new BT.Game({ storage, clock: () => 1 });
    const r = g2.load();
    assert.ok(r.state, '應該用備份救回來');
    assert.strictEqual(r.source, 'backup');
    assert.strictEqual(g2.state.day, 10);
    assert.ok(storage.getItem(BT.CONFIG.saveKey + '_corrupt'), '壞檔應保留供除錯');
  });

  test('舊存檔缺少的欄位會被補齊', () => {
    const { game, BT, storage } = H.newGame({ seed: 503 });
    H.run(game, 5);
    const state = JSON.parse(JSON.stringify(game.state));
    delete state.insurance;
    delete state.printer;
    delete state.stats.robberies;
    storage.setItem(BT.CONFIG.saveKey, BT.Save.serialize(state, 1));
    const g2 = new BT.Game({ storage, clock: () => 1 });
    const r = g2.load();
    assert.ok(r.state, r.error);
    assert.strictEqual(g2.state.insurance.plan, null);
    assert.strictEqual(g2.state.printer.level, 0);
    assert.strictEqual(g2.state.stats.robberies, 0);
    H.run(g2, 3);                     // 補齊後還能繼續跑
    assert.strictEqual(g2.state.day, 8);
  });

  test('repair 會清掉不存在的股票與設備', () => {
    const { game, BT } = H.newGame();
    game.state.stocks.holdings.這支不存在 = { qty: 5, avgCost: 1 };
    game.state.security.devices.幽靈設備 = { level: 3, cond: 100 };
    game.state.customers.list.push({ id: 999, name: '壞資料', type: '不存在', balance: 100 });
    BT.Save.repair(game.state);
    assert.strictEqual(game.state.stocks.holdings.這支不存在, undefined);
    assert.strictEqual(game.state.security.devices.幽靈設備, undefined);
    assert.strictEqual(game.state.customers.list.find((c) => c.id === 999), undefined);
  });

  test('匯出／匯入字串', () => {
    const { game, BT } = H.newGame({ seed: 601 });
    H.run(game, 12);
    const str = game.exportSave();
    const g2 = new BT.Game({ storage: BT.Save.memoryStorage(), clock: () => 1 });
    g2.newGame('別的銀行', 1);
    const r = g2.importSave(str);
    assert.ok(r.state, r.error);
    assert.strictEqual(g2.state.day, 12);
    assert.strictEqual(g2.state.bank.name, game.state.bank.name);
    assert.strictEqual(BT.Save.importString('這不是 base64').error, 'base64');
  });

  test('新增股票時舊存檔會自動補上初始價', () => {
    const { game, BT } = H.newGame();
    delete game.state.stocks.prices.harvest;
    delete game.state.stocks.hist.harvest;
    BT.Save.repair(game.state);
    assert.strictEqual(game.state.stocks.prices.harvest, BT.registries.stocks.get('harvest').base);
    assert.ok(Array.isArray(game.state.stocks.hist.harvest));
  });
};
