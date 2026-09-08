import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './helpers.js';

test('exploration: 區域解鎖條件', () => {
  const g = makeGame();
  const list = g.systems.exploration.areas();
  assert.ok(list.find((a) => a.def.id === 'forest').unlocked);
  assert.ok(!list.find((a) => a.def.id === 'military').unlocked);
  assert.equal(g.intent('explore', { areaId: 'military' }).reason, 'locked');
  g.state.player.level = 14; g.state.shelter.level = 3;
  assert.ok(g.systems.exploration.areas().find((a) => a.def.id === 'military').unlocked);
});

test('exploration: 出發→旅途→抵達生成 POI（含資源與怪物）→採集→深入→返回', () => {
  const g = makeGame({ seed: 3 });
  const r = g.intent('explore', { areaId: 'forest' });
  assert.equal(r.ok, true);
  assert.equal(g.state.exploration.phase, 'travelOut');
  assert.equal(g.intent('explore', { areaId: 'forest' }).reason, 'notHome');
  g.advance(25);
  const ex = g.state.exploration;
  assert.equal(ex.phase, 'explore'); assert.equal(ex.depth, 1);
  assert.ok(ex.pois.length >= 3);
  assert.ok(ex.pois.some((p) => p.kind === 'path'));
  // 多次生成中一定會有資源與怪物
  let kinds = new Set();
  for (let s = 0; s < 10; s++) { const g2 = makeGame({ seed: s }); g2.intent('explore', { areaId: 'forest' }); g2.advance(25); g2.state.exploration.pois.forEach((p) => kinds.add(p.kind)); }
  assert.ok(kinds.has('resource') && kinds.has('monster'));
  const res = ex.pois.find((p) => p.kind === 'resource');
  if (res) {
    const before = g.systems.inventory.count('inventory', res.data.itemId);
    assert.equal(g.intent('interact', { poiId: res.id }).ok, true);
    assert.equal(g.intent('interact', { poiId: res.id }).reason, 'busy');
    g.advance(res.data.gatherTime + 1);
    assert.ok(res.done || g.state.combat, 'gather done (or ambushed)');
    if (res.done) assert.ok(g.systems.inventory.count('inventory', res.data.itemId) > before);
  }
  while (g.state.combat) g.step();
  if (g.state.gameOver) return;
  const d = g.intent('goDeeper');
  assert.equal(d.ok, true);
  assert.equal(g.state.exploration.depth, 2);
  assert.ok(g.state.world.areas.forest.maxDepth >= 2);
  const ret = g.intent('returnHome');
  assert.equal(ret.ok, true);
  assert.equal(g.state.exploration.phase, 'travelBack');
  g.advance(30);
  assert.equal(g.state.exploration, null);
  assert.ok(g.bus.history.some((h) => h.name === 'explore:home'));
});

test('exploration: 戰鬥期間探索計時暫停；勝利後 POI 完成', () => {
  const g = makeGame({ seed: 8 });
  g.intent('explore', { areaId: 'forest' }); g.advance(25);
  const mon = g.state.exploration.pois.find((p) => p.kind === 'monster');
  if (!mon) return;
  g.intent('interact', { poiId: mon.id });
  assert.ok(g.state.combat);
  const res = g.state.exploration.pois.find((p) => p.kind === 'resource');
  if (res) assert.equal(g.intent('interact', { poiId: res.id }).reason, 'notExploring');
  let n = 0; while (g.state.combat && n < 3000) { g.step(); n++; }
  if (!g.state.gameOver) assert.equal(mon.done, true);
});

test('exploration: 旅途中飢渴照常上升；探索速度 modifier 影響旅途時間', () => {
  const g = makeGame();
  g.intent('explore', { areaId: 'suburbs' });
  const t0 = g.state.exploration.travelLeft;
  g.advance(10);
  assert.ok(g.state.player.hunger > 0 && g.state.exploration.travelLeft < t0);
  const g2 = makeGame();
  g2.systems.statusEffects.apply('energized', { duration: 999 });
  g2.modifiers.invalidate();
  assert.ok(g2.systems.exploration.travelTimeFor(g2.registry.area('suburbs')) < g.registry.area('suburbs').travelTime);
});

test('exploration: 區域環境 modifier 只在區域內生效（荒野口渴 ×1.35）', () => {
  const g = makeGame();
  const base = g.systems.survival.thirstRate();
  g.state.player.level = 5;
  g.intent('explore', { areaId: 'wasteland' });
  g.modifiers.invalidate();
  assert.equal(g.systems.survival.thirstRate(), base); // 旅途中還不算在區域內
  g.advance(70);
  g.modifiers.invalidate();
  assert.ok(Math.abs(g.systems.survival.thirstRate() - base * 1.35) < 1e-9);
});

test('exploration: 寶箱 POI 拿取後成為背包物品；折返回家', () => {
  let found = false;
  for (let s = 0; s < 20 && !found; s++) {
    const g = makeGame({ seed: s });
    g.intent('explore', { areaId: 'forest' }); g.advance(25);
    const c = g.state.exploration.pois.find((p) => p.kind === 'chest');
    if (!c) continue;
    found = true;
    assert.equal(g.intent('interact', { poiId: c.id }).ok, true);
    assert.equal(g.systems.inventory.count('inventory', `chest_${c.data.tier}`), 1);
  }
  assert.ok(found);
  const g = makeGame();
  g.intent('explore', { areaId: 'forest' }); g.advance(5);
  assert.equal(g.intent('returnHome').ok, true);
  assert.equal(g.state.exploration.phase, 'travelBack');
});
