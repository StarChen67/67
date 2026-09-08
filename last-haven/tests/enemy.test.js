import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './helpers.js';

test('enemy: 成長曲線隨等級單調上升，且 base 為 minLevel 時的值', () => {
  const g = makeGame();
  const E = g.systems.enemy;
  const def = g.registry.monster('infected');
  const at = E.statsFor('infected', def.minLevel);
  assert.equal(at.hp, def.base.hp); assert.equal(at.attack, def.base.attack); assert.equal(at.defense, def.base.defense);
  let prev = E.statsFor('rat', 1);
  for (let l = 2; l <= 40; l++) {
    const s = E.statsFor('rat', l);
    assert.ok(s.hp > prev.hp && s.attack > prev.attack && s.defense >= prev.defense && s.xp > prev.xp, `L${l}`);
    prev = s;
  }
});

test('enemy: 生成等級不低於 minLevel；菁英/Boss 倍率', () => {
  const g = makeGame();
  const E = g.systems.enemy;
  const gm = E.spawn('giant_mutant', 1);
  assert.equal(gm.level, 20);
  const n = E.statsFor('rat', 5), el = E.statsFor('rat', 5, 'elite');
  assert.equal(el.hp, Math.round(n.hp * 1.6));
  assert.ok(el.attack > n.attack);
  const boss = E.spawn('forest_guardian', 5);
  assert.equal(boss.tier, 'boss');
  assert.equal(boss.hp, g.registry.monster('forest_guardian').base.hp * 3);
  const promoted = E.spawn('rat', 3, { tierOverride: 'elite' });
  assert.equal(promoted.tier, 'elite');
  assert.ok(promoted.name.startsWith('菁英'));
});

test('enemy: 區域生成尊重 minDepth 與深度遞增', () => {
  const g = makeGame();
  const E = g.systems.enemy;
  const area = g.registry.area('forest');
  for (let i = 0; i < 50; i++) {
    for (const e of E.spawnGroup(area, 1)) {
      assert.ok(e.level <= 2, `depth1 level ${e.level}`);
      assert.ok(!['corrupted_hound', 'wild_dog'].includes(e.defId), `depth1 spawned ${e.defId}`);
    }
  }
  const deep = E.spawnGroup(area, 4, { count: 2 });
  assert.ok(deep.every((e) => e.level >= 4));
});

test('enemy: 所有怪物 minLevel 的數值符合平衡帶（3～10 下擊殺、每下 ≤ 15% 玩家血量）', () => {
  const g = makeGame();
  const E = g.systems.enemy, B = g.registry.balance;
  for (const m of g.registry.list('monsters')) {
    if (m.tier !== 'normal') continue;
    const L = m.minLevel;
    const s = E.statsFor(m.id, L);
    // 對應等級玩家的粗略數值（含中等裝備）
    const pAtk = B.player.base.attack + B.progression.perLevel.attack * (L - 1) + 4 + L * 1.3;
    const pDef = B.player.base.defense + B.progression.perLevel.defense * (L - 1) + L * 1.6;
    const pHp = B.player.base.maxHp + B.progression.perLevel.maxHp * (L - 1) + L * 4;
    const hits = s.hp / Math.max(1, pAtk - s.defense);
    const dmgPct = Math.max(1, s.attack - pDef) / pHp;
    assert.ok(hits >= 1.3 && hits <= 10, `${m.id} L${L}: ${hits.toFixed(1)} hits to kill`);
    assert.ok(dmgPct <= 0.15, `${m.id} L${L}: ${(dmgPct * 100).toFixed(0)}% per hit`);
    const dps = Math.max(1, s.attack - pDef) * s.attackSpeed / pHp;
    assert.ok(dps <= 0.13, `${m.id} L${L}: ${(dps * 100).toFixed(1)}% hp per second`);
  }
});
