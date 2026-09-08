import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give } from './helpers.js';

test('event: 選項事件 → 選擇（成本檢查）→ 效果 → 冷卻', () => {
  const g = makeGame();
  const E = g.systems.event;
  assert.equal(g.intent('resolveEvent', { choiceId: 'food' }).reason, 'noEvent');
  const r = E.trigger('merchant', { force: true });
  assert.equal(r.ok, true);
  assert.ok(g.state.events.pending);
  assert.equal(g.intent('resolveEvent', { choiceId: 'food' }).reason, 'coins');
  g.state.player.coins = 20;
  const before = g.systems.inventory.countAll('canned_food');
  assert.equal(g.intent('resolveEvent', { choiceId: 'food' }).ok, true);
  assert.equal(g.systems.inventory.countAll('canned_food'), before + 4);
  assert.equal(g.state.player.coins, 0);
  assert.equal(g.state.events.pending, null);
  assert.equal(E.trigger('merchant').reason, 'cooldown');
});

test('event: 到期自動採用預設選項', () => {
  const g = makeGame();
  g.systems.event.trigger('stranger', { force: true });
  g.advance(95);
  assert.equal(g.state.events.pending, null);
  assert.ok(g.bus.history.some((h) => h.name === 'event:resolved' && h.payload.expired));
});

test('event: 條件事件（食物短缺）在條件成立時觸發，且有冷卻', () => {
  const g = makeGame({ quiet: false });
  g.state.raid.nextAt = 1e12; g.state.disasters.nextRollAt = 1e12;
  g.systems.inventory.items('storage').length = 0;
  g.state.clock.time = g.clock.dayToTime(2);
  let n = 0;
  g.bus.on('event:triggered', (e) => { if (e.id === 'food_shortage') n++; });
  g.advance(60); // 跨小時
  assert.ok(n >= 1, 'shortage fired');
  g.advance(120);
  assert.equal(n, 1, 'cooldown prevents spam');
});

test('event: 即時效果事件（空投）給物品；區域事件生成戰鬥', () => {
  const g = makeGame();
  g.state.clock.time = g.clock.dayToTime(3);
  g.systems.event.trigger('supply_drop', { force: true });
  assert.ok(g.systems.inventory.countAll('mre') >= 2);
  assert.ok(g.systems.inventory.countAll('chest_fine') >= 1);
  const g2 = makeGame();
  g2.intent('explore', { areaId: 'forest' }); g2.advance(25);
  g2.systems.event.trigger('rare_monster_low', { force: true });
  assert.ok(g2.state.combat && g2.state.combat.enemies[0].defId === 'alpha_hound');
});

test('event: 隨機事件會在小時邊界自然觸發（統計）', () => {
  let total = 0;
  for (let s = 0; s < 5; s++) {
    const g = makeGame({ seed: 100 + s, quiet: false });
    g.state.raid.nextAt = 1e12; g.state.disasters.nextRollAt = 1e12;
    give(g, 'storage', 'canned_food', 50); give(g, 'storage', 'water_bottle', 50);
    g.bus.on('event:triggered', () => total++);
    for (let t = 0; t < 480 * 3 && g.running; t += 20) {
      g.advance(20);
      const p = g.state.player;
      if (p.hunger > 40) { const f = g.systems.inventory.items('storage').find((i) => i.itemId === 'canned_food'); if (f) g.intent('useItem', { uid: f.uid, container: 'storage' }); }
      if (p.thirst > 40) { const w = g.systems.inventory.items('storage').find((i) => i.itemId === 'water_bottle'); if (w) g.intent('useItem', { uid: w.uid, container: 'storage' }); }
      if (g.state.events.pending) g.intent('resolveEvent', { choiceId: g.state.events.pending.defaultChoiceId });
    }
  }
  assert.ok(total >= 3, `events ${total}`);
});
