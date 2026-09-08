import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './helpers.js';

test('progression: XP 曲線單調遞增', () => {
  const g = makeGame();
  const P = g.systems.progression;
  let prev = 0;
  for (let l = 1; l <= 30; l++) { const n = P.xpToNext(l); assert.ok(n > prev); prev = n; }
});

test('progression: 升級提升 MaxHP/Atk/Def 並回復對應 HP', () => {
  const g = makeGame();
  const s0 = g.systems.player.getStats();
  g.systems.player.damage(50, { ignoreDefense: true });
  const hp = g.state.player.hp;
  g.systems.progression.addXp(30);
  assert.equal(g.state.player.level, 2);
  const s1 = g.systems.player.getStats();
  assert.equal(s1.maxHp, s0.maxHp + 10);
  assert.equal(s1.attack, s0.attack + 2);
  assert.equal(s1.defense, s0.defense + 1);
  assert.equal(g.state.player.hp, hp + 10);
});

test('progression: 一次大量 XP 連升多級，且不超過上限', () => {
  const g = makeGame();
  g.systems.progression.addXp(100000);
  assert.ok(g.state.player.level > 5);
  assert.ok(g.state.player.level <= g.registry.balance.progression.maxLevel);
});

test('progression: 擊殺事件給 XP', () => {
  const g = makeGame();
  g.bus.emit('combat:enemyKilled', { enemy: { xp: 10 } });
  assert.equal(g.state.player.xp, 10);
});
