import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './helpers.js';

test('disaster: 預警 → 生效（modifier 套用）→ 結束（解除、冷卻、統計）', () => {
  const g = makeGame();
  const D = g.systems.disaster;
  const base = g.systems.survival.thirstRate();
  const r = D.trigger('heatwave');
  assert.equal(r.ok, true);
  assert.equal(g.state.disasters.active[0].phase, 'warning');
  g.advance(5); g.modifiers.invalidate();
  assert.equal(g.systems.survival.thirstRate(), base, 'warning phase has no effect');
  g.advance(16); g.modifiers.invalidate();
  assert.equal(g.state.disasters.active[0].phase, 'active');
  assert.ok(Math.abs(g.systems.survival.thirstRate() - base * 1.6) < 1e-9);
  assert.ok(g.bus.history.some((h) => h.name === 'disaster:start'));
  g.advance(260); g.modifiers.invalidate();
  assert.equal(g.state.disasters.active.length, 0);
  assert.equal(g.systems.survival.thirstRate(), base);
  assert.equal(g.state.stats.disastersSurvived, 1);
  assert.ok(g.state.disasters.cooldownUntil.heatwave > g.state.clock.time);
  assert.equal(D.trigger('heatwave').ok, true, 'force not needed (cooldown only affects roll)');
});

test('disaster: 地震 onStart 損壞避難所與隨機設施；酸雨只在戶外扣血', () => {
  const g = makeGame();
  g.intent('build', { buildingId: 'workbench' });
  g.systems.disaster.trigger('earthquake');
  g.advance(6);
  assert.equal(g.state.shelter.hp, 1000 - 120);
  assert.ok(g.state.shelter.buildings.workbench.hp < 200);
  const g2 = makeGame();
  g2.systems.disaster.trigger('acidrain'); g2.advance(21);
  const hp = g2.state.player.hp;
  g2.advance(10);
  assert.ok(g2.state.player.hp >= hp - 0.01, 'indoors: no damage (home regen may add)');
  g2.intent('explore', { areaId: 'forest' });
  const hp2 = g2.state.player.hp;
  g2.advance(10);
  assert.ok(g2.state.player.hp < hp2 - 5, `outdoors damage ${hp2} → ${g2.state.player.hp}`);
});

test('disaster: 排程擲骰隨時間自然發生且不超過 maxActive；存檔後持續', () => {
  const g = makeGame({ seed: 4, quiet: false });
  g.state.raid.nextAt = 1e12; // 只看天災
  g.state.events.cooldownUntil.night_raiders = 1e12; g.state.events.cooldownUntil.rare_monster_low = 1e12;
  g.systems.inventory.add('storage', 'canned_food', 50, { force: true }); g.systems.inventory.add('storage', 'water_bottle', 50, { force: true });
  let starts = 0;
  g.bus.on('disaster:start', () => starts++);
  for (let t = 0; t < 480 * 6 && g.running; t += 20) {
    g.advance(20);
    assert.ok(g.state.disasters.active.length <= 1);
    const p = g.state.player;
    if (p.hunger > 40) { const f = g.systems.inventory.items('storage').find((i) => i.itemId === 'canned_food'); if (f) g.intent('useItem', { uid: f.uid, container: 'storage' }); }
    if (p.thirst > 40) { const w = g.systems.inventory.items('storage').find((i) => i.itemId === 'water_bottle'); if (w) g.intent('useItem', { uid: w.uid, container: 'storage' }); }
    if (g.state.events.pending) g.intent('resolveEvent', { choiceId: g.state.events.pending.defaultChoiceId });
  }
  assert.ok(starts >= 2 && starts <= 12, `starts ${starts}`);
  // 存檔 roundtrip 保留進行中的天災
  g.systems.disaster.trigger('rainstorm', { force: true });
  g.advance(25);
  g.intent('save', { slot: 'slot1' });
  g.loadSlot('slot1');
  assert.ok(g.state.disasters.active.some((d) => d.id === 'rainstorm'));
  g.modifiers.invalidate();
  assert.ok(g.modifiers.resolve('exploreSpeed', 1) < 1);
});
