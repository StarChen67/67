import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, find, give } from './helpers.js';

test('inventory: 堆疊與 stackMax', () => {
  const g = makeGame();
  const inv = g.systems.inventory;
  inv.items('inventory').length = 0;
  inv.add('inventory', 'cloth', 150, { force: true });
  const stacks = inv.items('inventory').filter((i) => i.itemId === 'cloth');
  assert.equal(stacks.length, 2);
  assert.equal(inv.count('inventory', 'cloth'), 150);
  assert.equal(inv.remove('inventory', 'cloth', 120), 120);
  assert.equal(inv.count('inventory', 'cloth'), 30);
});

test('inventory: 重量上限（軟上限）', () => {
  const g = makeGame();
  const inv = g.systems.inventory;
  inv.items('inventory').length = 0;
  const cap = inv.carryCapacity();
  const r = inv.add('inventory', 'stone', 100); // 1.5 each
  assert.equal(r.ok, false);
  assert.equal(r.added, Math.floor(cap / 1.5));
  assert.ok(inv.weight('inventory') <= cap);
  const r2 = inv.add('inventory', 'concrete', 1); // 剩餘 1kg，混凝土 2kg 放不下
  assert.equal(r2.added, 0);
  assert.equal(r2.reason, 'overweight');
});

test('inventory: 背包→倉庫轉移與倉庫容量', () => {
  const g = makeGame();
  const inv = g.systems.inventory;
  const w = find(g, 'inventory', 'water_bottle');
  const before = inv.count('storage', 'water_bottle');
  const r = g.intent('transfer', { uid: w.uid, from: 'inventory' });
  assert.equal(r.ok, true);
  assert.equal(inv.count('storage', 'water_bottle'), before + 2);
  // 塞滿倉庫
  inv.add('storage', 'concrete', 1000, { force: true });
  assert.ok(inv.isOver('storage'));
  give(g, 'inventory', 'wood', 3);
  const wd = find(g, 'inventory', 'wood');
  const r2 = g.intent('transfer', { uid: wd.uid, from: 'inventory' });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'overweight');
});

test('inventory: depositAll 只轉移放得下的', () => {
  const g = makeGame();
  const inv = g.systems.inventory;
  const r = g.intent('depositAll');
  assert.equal(r.ok, true);
  assert.equal(inv.items('inventory').length, 0);
  assert.ok(inv.count('storage', 'berries') >= 3);
});

test('inventory: 探索中不能轉移到倉庫', () => {
  const g = makeGame();
  g.state.exploration = { areaId: 'forest', phase: 'travelOut', lootPile: [], pois: [], gathered: {}, travelLeft: 10, travelTotal: 10, depth: 1, activeAction: null, startedAt: 0 };
  const w = find(g, 'inventory', 'water_bottle');
  const r = g.intent('transfer', { uid: w.uid, from: 'inventory' });
  assert.equal(r.reason, 'notHome');
  g.state.exploration = null;
});

test('inventory: grant 在家進倉庫、在外進背包、放不下進戰利品堆', () => {
  const g = makeGame();
  const inv = g.systems.inventory;
  inv.grant('wood', 5);
  assert.equal(inv.count('storage', 'wood'), 35);
  g.state.exploration = { areaId: 'forest', phase: 'explore', lootPile: [], pois: [], gathered: {}, travelLeft: 0, travelTotal: 0, depth: 1, activeAction: null, startedAt: 0 };
  inv.grant('stone', 200);
  assert.ok(inv.count('inventory', 'stone') > 0);
  assert.ok(g.state.exploration.lootPile.length === 1);
  const pile = g.state.exploration.lootPile[0];
  const r = g.intent('takeLoot', { uid: pile.uid });
  assert.equal(r.reason, 'overweight');
  g.intent('dropItem', { uid: find(g, 'inventory', 'stone').uid, container: 'inventory', qty: 10 });
  const r2 = g.intent('takeLoot', { uid: pile.uid });
  assert.equal(r2.ok, true); // 只撿得起部分
  assert.ok(r2.leftover > 0 && r2.moved > 0);
  g.state.exploration = null;
});

test('inventory: dropItem 移除數量', () => {
  const g = makeGame();
  const b = find(g, 'inventory', 'berries');
  const r = g.intent('dropItem', { uid: b.uid, qty: 1 });
  assert.equal(r.result.removed, 1);
  assert.equal(g.systems.inventory.count('inventory', 'berries'), 2);
});
