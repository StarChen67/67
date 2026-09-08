import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './helpers.js';
import { RNG } from '../core/rng.js';

test('loot: seeded 擲骰可重現；minimumEnemyLevel 過濾', () => {
  const g = makeGame();
  const L = g.systems.loot;
  const a = L.rollTable('lt_human_high', { level: 30, rng: new RNG(5) });
  const b = L.rollTable('lt_human_high', { level: 30, rng: new RNG(5) });
  assert.deepEqual(a, b);
  // lt_mutant_low 的 mutant_core 需 Lv.8
  for (let i = 0; i < 300; i++) {
    const r = L.rollTable('lt_mutant_low', { level: 1, rng: new RNG(i) });
    assert.ok(!r.items.find((x) => x.itemId === 'mutant_core'), 'level-gated item should not drop');
  }
});

test('loot: 金錢條目累加到 coins', () => {
  const g = makeGame();
  let coins = 0;
  for (let i = 0; i < 200; i++) coins += g.systems.loot.rollTable('lt_human_low', { level: 5, rng: new RNG(i) }).coins;
  assert.ok(coins > 0);
});

test('loot: 怪物掉落進 combat.loot；等級越高寶箱品質越好；Boss 必掉 rare+', () => {
  const g = makeGame();
  const L = g.systems.loot;
  g.systems.combat.start([g.systems.enemy.spawn('rat', 1)], { origin: 'exploration' });
  const res = L.dropFor(g.state.combat.enemies[0]);
  assert.ok(res);
  const w1 = L.tierWeightsByLevel({ common: 70, fine: 22, rare: 7, epic: 1, legendary: 0 }, 1);
  const w20 = L.tierWeightsByLevel({ common: 70, fine: 22, rare: 7, epic: 1, legendary: 0 }, 20);
  assert.ok(w20.common < w1.common && w20.rare + w20.epic + w20.legendary > w1.rare + w1.epic + w1.legendary);
  const wb = L.tierWeightsByLevel({ common: 50, fine: 30, rare: 20, epic: 0, legendary: 0 }, 5, 'rare');
  assert.equal(wb.common, 0); assert.equal(wb.fine, 0); assert.ok(wb.rare > 0);
  // 統計：boss 每次都掉寶箱
  let chests = 0;
  for (let i = 0; i < 20; i++) {
    const g2 = makeGame({ seed: i });
    g2.systems.combat.start([g2.systems.enemy.spawn('forest_guardian', 5)], { origin: 'exploration' });
    const r = g2.systems.loot.dropFor(g2.state.combat.enemies[0]);
    if (r.chests.length) chests++;
  }
  assert.equal(chests, 20);
});

test('loot: 沒有圖紙資料時 rollBlueprint 回傳 null 且不丟錯', () => {
  const g = makeGame();
  if (g.registry.blueprints.size === 0) assert.equal(g.systems.loot.rollBlueprint({ source: 'forced', areaId: 'forest' }), null);
});

test('loot: 在家時掉落物直接進倉庫', () => {
  const g = makeGame();
  const before = g.systems.inventory.count('storage', 'wood');
  g.systems.loot.deliver({ items: [{ itemId: 'wood', qty: 3 }], chests: [], blueprints: [], coins: 5 }, { source: 'test' });
  assert.equal(g.systems.inventory.count('storage', 'wood'), before + 3);
  assert.equal(g.state.player.coins, 5);
});
