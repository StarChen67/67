import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give } from './helpers.js';

test('building: 建造工作台 → 工作台等級；升級需材料/圖紙；等級限制', () => {
  const g = makeGame();
  const B = g.systems.building;
  assert.equal(B.workbenchLevel(), 0);
  const r = g.intent('build', { buildingId: 'workbench' });
  assert.equal(r.ok, true);
  assert.equal(B.workbenchLevel(), 1);
  assert.equal(g.systems.inventory.countAll('wood'), 10);
  let c = B.check('workbench');
  assert.equal(c.nextLevel, 2);
  assert.ok(c.reasons.find((x) => x.code === 'materials'));
  give(g, 'storage', 'wood', 40); give(g, 'storage', 'metal', 20); give(g, 'storage', 'parts', 5);
  assert.equal(g.intent('upgradeBuilding', { buildingId: 'workbench' }).ok, true);
  assert.equal(B.workbenchLevel(), 2);
  // Lv3→4 需要圖紙
  give(g, 'storage', 'metal', 200); give(g, 'storage', 'parts', 20); give(g, 'storage', 'adv_parts', 30); give(g, 'storage', 'electronics', 20);
  assert.equal(g.intent('upgradeBuilding', { buildingId: 'workbench' }).ok, true);
  c = B.check('workbench');
  assert.ok(c.reasons.find((x) => x.code === 'blueprint' && x.blueprintId === 'bp_workbench_advanced'));
  g.state.blueprints.learned.push('bp_workbench_advanced');
  assert.equal(g.intent('upgradeBuilding', { buildingId: 'workbench' }).ok, true);
  assert.equal(B.workbenchLevel(), 4);
  // 避難所等級限制
  assert.ok(B.check('turret').reasons.find((x) => x.code === 'shelterLevel'));
});

test('building: 倉庫增加容量；損毀後效果停止；修理恢復', () => {
  const g = makeGame();
  const inv = g.systems.inventory, B = g.systems.building;
  const cap = inv.storageCapacity();
  give(g, 'storage', 'wood', 30); give(g, 'storage', 'stone', 10);
  assert.equal(g.intent('build', { buildingId: 'warehouse' }).ok, true);
  assert.equal(inv.storageCapacity(), cap + 50);
  B.damage('warehouse', 9999, { source: 'test' });
  assert.equal(inv.storageCapacity(), cap);
  assert.ok(B.get('warehouse'), 'not deleted');
  give(g, 'storage', 'metal', 20);
  const r = g.intent('repairBuilding', { buildingId: 'warehouse' });
  assert.equal(r.ok, true);
  assert.ok(inv.storageCapacity() > cap);
});

test('building: 產出設施每天把物品放進倉庫，倉庫滿則丟棄；醫療站只在家回血', () => {
  const g = makeGame();
  give(g, 'storage', 'plastic', 5); give(g, 'storage', 'rope', 2);
  assert.equal(g.intent('build', { buildingId: 'water_tank' }).ok, true);
  const before = g.systems.inventory.count('storage', 'rainwater');
  g.advance(g.registry.balance.time.dayLength + 10);
  assert.ok(g.systems.inventory.count('storage', 'rainwater') >= before + 2);
  // 倉庫塞滿
  g.systems.inventory.add('storage', 'concrete', 500, { force: true });
  const n = g.systems.inventory.count('storage', 'rainwater');
  g.advance(g.registry.balance.time.dayLength);
  assert.equal(g.systems.inventory.count('storage', 'rainwater'), n);
  // 醫療站
  const g2 = makeGame();
  g2.state.shelter.level = 2;
  give(g2, 'storage', 'cloth', 20); give(g2, 'storage', 'herb', 10); give(g2, 'storage', 'wood', 20);
  assert.equal(g2.intent('build', { buildingId: 'medical' }).ok, true);
  g2.systems.player.damage(60, { ignoreDefense: true });
  const hp = g2.state.player.hp;
  g2.advance(10);
  const homeGain = g2.state.player.hp - hp;
  assert.ok(homeGain > 10 * g2.registry.balance.survival.homeRegenPerSec, 'medical adds regen');
});

test('building: 發電機 modifier 加快製作速度', () => {
  const g = makeGame();
  const base = g.modifiers.resolve('craftSpeed', 1);
  g.state.shelter.level = 3; g.state.blueprints.learned.push('bp_generator');
  give(g, 'storage', 'metal', 50); give(g, 'storage', 'parts', 20); give(g, 'storage', 'wire', 10); give(g, 'storage', 'fuel', 5);
  assert.equal(g.intent('build', { buildingId: 'generator' }).ok, true);
  g.modifiers.invalidate();
  assert.ok(g.modifiers.resolve('craftSpeed', 1) > base);
});
