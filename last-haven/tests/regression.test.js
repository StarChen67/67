import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './helpers.js';

/** 已修復 bug 的回歸測試（每個 case 對應 docs/CHANGELOG.md 的一筆修復） */

test('regression: 地上的圖紙可以直接學習與拆解（不必先撿起）', () => {
  const g = makeGame();
  g.intent('explore', { areaId: 'forest' }); g.advance(25);
  const bp = g.systems.item.createInstance('bp_nails', 1);
  const bp2 = g.systems.item.createInstance('bp_plank', 1);
  g.state.exploration.lootPile.push(bp, bp2);
  const r = g.intent('learnBlueprint', { uid: bp.uid });
  assert.equal(r.ok, true);
  assert.ok(g.systems.blueprint.has('bp_nails'));
  assert.equal(g.state.exploration.lootPile.length, 1, '學過的圖紙從地上消失');
  const d = g.intent('dismantleBlueprint', { uid: bp2.uid });
  assert.equal(d.ok, true);
  assert.equal(g.state.blueprints.researchPoints, 5);
  assert.equal(g.state.exploration.lootPile.length, 0);
});

test('regression: 出發途中折返，回程時間等於已走過的時間', () => {
  const g = makeGame();
  const area = g.registry.area('suburbs');
  g.intent('explore', { areaId: 'suburbs' });
  g.advance(10);
  assert.equal(g.intent('returnHome').ok, true);
  assert.ok(Math.abs(g.state.exploration.travelLeft - 10) < 1, `travelLeft=${g.state.exploration.travelLeft}`);
  assert.equal(g.state.exploration.travelTotal, g.state.exploration.travelLeft, '進度條總長 = 回程長度');
  g.advance(12);
  assert.equal(g.state.exploration, null, '應已到家');
  // 從區域內返回：走完整段路
  const g2 = makeGame();
  g2.intent('explore', { areaId: 'suburbs' }); g2.advance(40);
  assert.equal(g2.state.exploration.phase, 'explore');
  g2.intent('returnHome');
  assert.ok(Math.abs(g2.state.exploration.travelLeft - area.travelTime) < 1);
});

test('regression: 敵人身上的持續傷害不會被四捨五入抹平（中毒可致死）', () => {
  const g = makeGame();
  g.state.settings.autoAttack = false;
  const e = g.systems.enemy.spawn('rat', 1);
  e.hp = 3;
  g.systems.combat.start([e], { origin: 'exploration' });
  g.systems.statusEffects.apply('poison', { subject: e, duration: 20, stacks: 3 }); // 3 dps
  g.advance(2);
  assert.equal(g.state.stats.kills, 1, '中毒應該打死牠');
  assert.equal(g.state.combat, null);
});

test('regression: 炮塔的小數 DPS 也能累積傷害', () => {
  const g = makeGame();
  g.state.settings.autoAttack = false;
  const e = g.systems.enemy.spawn('rat', 1);
  g.systems.combat.start([e], { origin: 'raid' });
  const hp0 = e.hp;
  for (let i = 0; i < 10; i++) g.systems.combat.damageEnemy(e, 0.4, { source: 'turret', ignoreDefense: true });
  assert.ok(e.hp < hp0 - 3, `hp ${hp0} → ${e.hp}`);
});

test('regression: 探索/戰鬥中的存檔，讀檔後直接回到對應畫面資料（不遺失 POI）', () => {
  const g = makeGame({ seed: 11 });
  g.intent('explore', { areaId: 'forest' }); g.advance(25);
  const names = g.state.exploration.pois.map((p) => p.name);
  g.intent('save', { slot: 'slot1' });
  assert.equal(g.loadSlot('slot1').ok, true);
  assert.deepEqual(g.state.exploration.pois.map((p) => p.name), names);
});

test('regression: 外出時無法使用倉庫裡的物品', () => {
  const g = makeGame();
  g.intent('explore', { areaId: 'forest' });
  const food = g.state.shelter.storage.items.find((i) => i.itemId === 'canned_food');
  assert.equal(g.intent('useItem', { uid: food.uid, container: 'storage' }).reason, 'notHome');
  g.state.exploration = null;
  assert.equal(g.intent('useItem', { uid: food.uid, container: 'storage' }).ok, true);
});
