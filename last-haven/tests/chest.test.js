import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give } from './helpers.js';

test('chest: 寶箱是物品，開啟後消耗並產出物品/金錢', () => {
  const g = makeGame();
  const r = give(g, 'inventory', 'chest_fine', 1);
  const before = g.state.player.coins;
  const res = g.intent('openChest', { uid: r.inst.uid });
  assert.equal(res.ok, true);
  assert.equal(res.result.tier, 'fine');
  assert.ok(res.result.items.length >= 1 || res.result.coins > 0);
  assert.ok(g.state.player.coins > before);
  assert.equal(g.systems.inventory.count('inventory', 'chest_fine'), 0);
  assert.equal(g.state.stats.chestsOpened, 1);
  // 在家 → 物品進倉庫
  for (const it of res.result.items) assert.ok(g.systems.inventory.countAll(it.itemId) >= it.qty, it.itemId);
});

test('chest: 非寶箱不能開；useItem 也能開寶箱', () => {
  const g = makeGame();
  const w = give(g, 'inventory', 'wood', 1);
  assert.equal(g.intent('openChest', { uid: w.inst.uid }).reason, 'notChest');
  const c = give(g, 'storage', 'chest_common', 1);
  assert.equal(g.intent('useItem', { uid: c.inst.uid, container: 'storage' }).ok, true);
});

test('chest: 傳說寶箱掉落更好（平均價值高於普通）', () => {
  const val = (g, items) => items.reduce((a, i) => a + (g.registry.item(i.itemId)?.value || 0) * i.qty, 0);
  let common = 0, legendary = 0;
  for (let s = 0; s < 15; s++) {
    const g = makeGame({ seed: s });
    const c = give(g, 'inventory', 'chest_common', 1); common += val(g, g.intent('openChest', { uid: c.inst.uid }).result.items);
    const l = give(g, 'inventory', 'chest_legendary', 1); legendary += val(g, g.intent('openChest', { uid: l.inst.uid }).result.items);
  }
  assert.ok(legendary > common * 2, `${legendary} vs ${common}`);
});
