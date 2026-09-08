import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give } from './helpers.js';

test('blueprint: 學習消耗圖紙並永久解鎖配方；重複圖紙拆解為研究點', () => {
  const g = makeGame();
  const P = g.systems.blueprint;
  assert.equal(P.hasRecipe('r_bandage'), true);
  assert.equal(P.hasRecipe('r_iron_sword'), false);
  const r = give(g, 'inventory', 'bp_iron_sword', 2);
  const l = g.intent('learnBlueprint', { uid: r.inst.uid });
  assert.equal(l.ok, true);
  assert.deepEqual(l.result.recipeIds, ['r_iron_sword']);
  assert.equal(P.hasRecipe('r_iron_sword'), true);
  assert.equal(g.systems.inventory.count('inventory', 'bp_iron_sword'), 1);
  assert.equal(g.state.stats.blueprintsLearned, 1);
  const dup = g.systems.inventory.items('inventory').find((i) => i.itemId === 'bp_iron_sword');
  assert.equal(g.intent('learnBlueprint', { uid: dup.uid }).reason, 'alreadyLearned');
  const d = g.intent('dismantleBlueprint', { uid: dup.uid });
  assert.equal(d.ok, true);
  assert.equal(d.result.research, 10); // fine
  assert.equal(g.state.blueprints.researchPoints, 10);
  assert.equal(g.systems.inventory.count('inventory', 'bp_iron_sword'), 0);
});

test('blueprint: 存檔後仍記得已學圖紙', () => {
  const g = makeGame();
  const r = give(g, 'inventory', 'bp_machete', 1);
  g.intent('learnBlueprint', { uid: r.inst.uid });
  g.intent('save', { slot: 'slot1' });
  g.loadSlot('slot1');
  assert.ok(g.systems.blueprint.has('bp_machete'));
  assert.ok(g.systems.blueprint.hasRecipe('r_machete'));
});

test('blueprint: 研究點兌換已發現未學習的圖紙', () => {
  const g = makeGame();
  const P = g.systems.blueprint;
  assert.equal(g.intent('redeemBlueprint', { blueprintId: 'bp_pistol' }).reason, 'notDiscovered');
  P.discover('bp_pistol');
  assert.equal(g.intent('redeemBlueprint', { blueprintId: 'bp_pistol' }).reason, 'research');
  P.addResearch(75); // rare 25 × 3
  assert.equal(g.intent('redeemBlueprint', { blueprintId: 'bp_pistol' }).ok, true);
  assert.equal(g.state.blueprints.researchPoints, 0);
  assert.ok(P.has('bp_pistol'));
});

test('blueprint: 圖紙資訊與收藏統計；工作台不足提示', () => {
  const g = makeGame();
  const P = g.systems.blueprint;
  const info = P.info('bp_iron_sword');
  assert.equal(info.def.level, 2); assert.equal(info.def.requiredWorkbenchLevel, 2);
  assert.equal(info.workbenchOk, false); assert.equal(info.currentWorkbench, 0);
  assert.equal(info.recipes[0].id, 'r_iron_sword');
  const gate = P.info('bp_turret');
  assert.ok(gate.gates.find((x) => x.kind === 'building' && x.id === 'turret'));
  const col = P.collection();
  assert.ok(col.find((c) => c.type === 'weapon').total >= 10);
  assert.ok(col.every((c) => c.entries.every((e) => e.status === 'unknown')));
});

test('blueprint: 掉落管線——區域類型池、等級權重、dropLocations、Boss 保底', () => {
  const g = makeGame();
  const L = g.systems.loot;
  let n = 0, types = {};
  for (let i = 0; i < 300; i++) { const id = L.rollBlueprint({ source: 'forced', areaId: 'hospital' }); if (id) { n++; const t = g.registry.blueprint(id).type; types[t] = (types[t] || 0) + 1; } }
  assert.equal(n, 300);
  assert.ok((types.medicine || 0) > 150, JSON.stringify(types));
  for (let i = 0; i < 200; i++) { const id = L.rollBlueprint({ source: 'forced', areaId: 'forest' }); assert.ok(g.registry.blueprint(id).level <= 2, id); }
  // dropLocations：電漿步槍只在 lab/nest
  for (let i = 0; i < 300; i++) assert.notEqual(L.rollBlueprint({ source: 'forced', areaId: 'military' }), 'bp_plasma_rifle');
  // 機率型：普通怪很少掉
  let drops = 0;
  for (let i = 0; i < 500; i++) if (L.rollBlueprint({ source: 'enemy', areaId: 'forest', tier: 'normal' })) drops++;
  assert.ok(drops > 5 && drops < 60, `drops ${drops}`);
  let bossDrops = 0;
  for (let i = 0; i < 100; i++) if (L.rollBlueprint({ source: 'enemy', areaId: 'forest', tier: 'boss' })) bossDrops++;
  assert.ok(bossDrops > drops / 5 * 2, `boss ${bossDrops}`);
  // 圖紙掉落是物品，並記為已發現
  g.systems.combat.start([g.systems.enemy.spawn('rat', 1)], { origin: 'exploration' });
  L.deliver({ items: [], chests: [], blueprints: ['bp_nails'], coins: 0 });
  assert.ok(g.state.combat.loot.find((i) => i.itemId === 'bp_nails'));
  assert.ok(g.systems.blueprint.isDiscovered('bp_nails'));
});
