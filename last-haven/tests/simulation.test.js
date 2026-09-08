import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './helpers.js';
import { findNonFinite } from '../core/utils.js';

/** 無頭跑核心循環：定期吃喝，撐過數天不出現 NaN 也不死。 */
test('simulation: 定期吃喝可存活 3 天且無非有限數字', () => {
  const g = makeGame({ seed: 7 });
  const inv = g.systems.inventory;
  inv.add('storage', 'canned_food', 60, { force: true });
  inv.add('storage', 'water_bottle', 60, { force: true });
  const days = 3, dayLen = g.registry.balance.time.dayLength;
  for (let t = 0; t < days * dayLen && g.running; t += 10) {
    g.advance(10);
    const p = g.state.player;
    if (p.hunger > 50) { const f = inv.items('storage').find((i) => i.itemId === 'canned_food'); if (f) g.intent('useItem', { uid: f.uid, container: 'storage' }); }
    if (p.thirst > 50) { const w = inv.items('storage').find((i) => i.itemId === 'water_bottle'); if (w) g.intent('useItem', { uid: w.uid, container: 'storage' }); }
  }
  assert.equal(g.state.gameOver, null);
  assert.equal(g.clock.day, days + 1);
  assert.deepEqual(findNonFinite(g.state), []);
});

test('simulation: 同 seed 同操作 → 相同結果（決定性）', () => {
  const run = () => {
    const g = makeGame({ seed: 123 });
    for (let i = 0; i < 50; i++) { g.advance(5); g.systems.statusEffects.apply('poison', { duration: 3 }); }
    return JSON.stringify({ hp: g.state.player.hp, hunger: g.state.player.hunger, rng: g.rng.getState() });
  };
  assert.equal(run(), run());
});

test('simulation: 所有 intent 被拒絕時不丟例外', () => {
  const g = makeGame();
  for (const name of g.intents()) {
    const r = g.intent(name, {});
    assert.ok(typeof r.ok === 'boolean', name);
    assert.notEqual(r.reason, 'error', `${name}: ${r.error}`);
  }
});
