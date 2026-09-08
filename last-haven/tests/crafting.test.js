import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give } from './helpers.js';

test('crafting: 五重檢查原因碼（圖紙 / 工作台等級 / 材料 / 條件 / 等級）', () => {
  const g = makeGame();
  const C = g.systems.crafting;
  const c = C.check('r_iron_sword');
  const codes = c.reasons.map((r) => r.code);
  assert.deepEqual(codes, ['blueprint', 'station', 'materials']);
  assert.equal(c.reasons[1].need, 2); assert.equal(c.reasons[1].have, 0);
  assert.ok(c.reasons[2].missing.find((m) => m.itemId === 'metal' && m.need === 12 && m.have === 5));
  // 學圖紙、建工作台 Lv2、給材料 → ok
  g.state.blueprints.learned.push('bp_iron_sword');
  g.intent('build', { buildingId: 'workbench' });
  give(g, 'storage', 'wood', 40); give(g, 'storage', 'metal', 20); give(g, 'storage', 'parts', 5);
  g.intent('upgradeBuilding', { buildingId: 'workbench' });
  give(g, 'storage', 'metal', 12); give(g, 'storage', 'wood', 4); give(g, 'storage', 'leather', 2);
  assert.equal(C.check('r_iron_sword').ok, true);
  // 玩家等級 / 條件
  g.registry.recipe('r_iron_sword').requiredLevel = 5;
  assert.ok(C.check('r_iron_sword').reasons.find((r) => r.code === 'level'));
  g.registry.recipe('r_iron_sword').requiredLevel = 1;
  g.registry.recipe('r_iron_sword').conditions = [{ type: 'building', id: 'generator' }];
  assert.ok(C.check('r_iron_sword').reasons.find((r) => r.code === 'condition'));
  delete g.registry.recipe('r_iron_sword').conditions;
});

test('crafting: 排入時扣材料、完成後成品進倉庫、取消退回；探索中暫停', () => {
  const g = makeGame();
  give(g, 'storage', 'cloth', 10);
  const before = g.systems.inventory.countAll('cloth');
  const r = g.intent('craft', { recipeId: 'r_bandage', qty: 2 });
  assert.equal(r.ok, true);
  assert.equal(g.systems.inventory.countAll('cloth'), before - 4);
  assert.equal(g.state.crafting.queue.length, 1);
  g.advance(7);
  assert.equal(g.state.crafting.queue.length, 0);
  assert.equal(g.systems.inventory.count('storage', 'bandage'), 4);
  assert.equal(g.state.stats.crafted, 2);
  // 取消退回
  g.intent('craft', { recipeId: 'r_bandage' });
  const uid = g.state.crafting.queue[0].uid;
  const c2 = g.systems.inventory.countAll('cloth');
  assert.equal(g.intent('cancelCraft', { uid }).ok, true);
  assert.equal(g.systems.inventory.countAll('cloth'), c2 + 2);
  // 探索中暫停
  g.intent('craft', { recipeId: 'r_bandage' });
  g.state.exploration = { areaId: 'forest', phase: 'travelOut', lootPile: [], pois: [], gathered: {}, travelLeft: 100, travelTotal: 100, depth: 0, activeAction: null, startedAt: 0, ambushAcc: 0 };
  const left = g.state.crafting.queue[0].left;
  g.advance(2);
  assert.equal(g.state.crafting.queue[0].left, left);
  g.state.exploration = null;
});

test('crafting: 裝備品質由工作台等級與圖紙稀有度決定', () => {
  const counts = { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0 };
  for (let s = 0; s < 40; s++) {
    const g = makeGame({ seed: s });
    g.state.blueprints.learned.push('bp_machete'); // fine 圖紙
    g.state.shelter.buildings.workbench = { id: 'workbench', level: 5, hp: 600, acc: 0 };
    give(g, 'storage', 'metal', 6); give(g, 'storage', 'wood', 2); give(g, 'storage', 'cloth', 1);
    g.intent('craft', { recipeId: 'r_machete' });
    g.advance(13);
    const it = g.systems.inventory.items('storage').find((i) => i.itemId === 'machete');
    counts[it.quality]++;
  }
  assert.ok(counts.rare + counts.epic + counts.legendary > 5, JSON.stringify(counts));
  // 工作台 Lv1 只會做出 common/fine（砍刀基礎品質 fine）
  for (let s = 0; s < 10; s++) {
    const g = makeGame({ seed: s });
    g.state.blueprints.learned.push('bp_machete');
    g.state.shelter.buildings.workbench = { id: 'workbench', level: 1, hp: 200, acc: 0 };
    give(g, 'storage', 'metal', 6); give(g, 'storage', 'wood', 2); give(g, 'storage', 'cloth', 1);
    g.intent('craft', { recipeId: 'r_machete' }); g.advance(13);
    const it = g.systems.inventory.items('storage').find((i) => i.itemId === 'machete');
    assert.ok(['common', 'fine'].includes(it.quality));
  }
});

test('crafting: list 分頁與已知排序', () => {
  const g = makeGame();
  const w = g.systems.crafting.list('weapon');
  assert.ok(w.every((x) => ['weapon', 'ammo'].includes(x.recipe.category)));
  assert.ok(w[0].known, 'known recipes first');
});
