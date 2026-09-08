import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give } from './helpers.js';

test('shelter: 升級成本/效果/原因碼；Lv3→4 需要圖紙', () => {
  const g = makeGame();
  const S = g.systems.shelter;
  const c0 = S.canUpgrade();
  assert.equal(c0.ok, false);
  assert.equal(c0.reasons[0].code, 'materials');
  assert.ok(c0.reasons[0].missing.find((m) => m.itemId === 'wood' && m.need === 100));
  give(g, 'storage', 'wood', 100); give(g, 'storage', 'stone', 80); give(g, 'storage', 'metal', 30);
  const cap0 = g.systems.inventory.storageCapacity();
  const r = g.intent('upgradeShelter');
  assert.equal(r.ok, true);
  assert.equal(g.state.shelter.level, 2);
  assert.equal(S.maxHp(), 1500);
  assert.equal(g.state.shelter.hp, 1500);
  assert.equal(S.defense(), 30);
  assert.ok(g.systems.inventory.storageCapacity() > cap0);
  assert.equal(g.systems.inventory.countAll('wood'), 30); // 100 消耗，剩起始 30
  g.state.shelter.level = 3;
  const c = S.canUpgrade();
  assert.ok(c.reasons.find((x) => x.code === 'blueprint' && x.blueprintId === 'bp_shelter_reinforced'));
  g.state.blueprints.learned.push('bp_shelter_reinforced');
  assert.ok(!S.canUpgrade().reasons.find((x) => x.code === 'blueprint'));
});

test('shelter: 受損、修理、摧毀 → gameOver shelterDestroyed', () => {
  const g = makeGame();
  const S = g.systems.shelter;
  S.damage(400, { source: 'quake' });
  assert.equal(g.state.shelter.hp, 600);
  const r = g.intent('repairShelter');
  assert.equal(r.ok, true);
  assert.ok(r.result.repaired > 0);
  assert.equal(r.result.cost.itemId, 'wood');
  assert.equal(g.state.shelter.hp, 600 + r.result.repaired);
  S.damage(99999, { source: 'raid' });
  g.step();
  assert.equal(g.state.gameOver.reason, 'shelterDestroyed');
  assert.equal(g.state.gameOver.text, '避難所已被摧毀。');
});

test('shelter: 探索中不能升級', () => {
  const g = makeGame();
  give(g, 'storage', 'wood', 100); give(g, 'storage', 'stone', 80); give(g, 'storage', 'metal', 30);
  g.intent('explore', { areaId: 'forest' });
  assert.equal(g.intent('upgradeShelter').reason, 'notHome');
});
