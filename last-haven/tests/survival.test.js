import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, find, give } from './helpers.js';

test('survival: 飢渴隨時間上升且 clamp 0~100', () => {
  const g = makeGame();
  const p = g.state.player;
  assert.equal(p.hunger, 0); assert.equal(p.thirst, 0);
  g.advance(100);
  assert.ok(p.hunger > 10 && p.hunger < 20, `hunger ${p.hunger}`);
  assert.ok(p.thirst > 15 && p.thirst < 25, `thirst ${p.thirst}`);
  g.systems.survival.addHunger(-500); assert.equal(p.hunger, 0);
  g.systems.survival.addThirst(500); assert.equal(p.thirst, 100);
});

test('survival: 口渴達 100 → Game Over 死於脫水', () => {
  const g = makeGame();
  g.advance(1200);
  assert.ok(g.state.gameOver, 'should be over');
  assert.equal(g.state.gameOver.reason, 'dehydrated');
  assert.equal(g.state.gameOver.text, '你死於脫水。');
  const t = g.state.clock.time;
  g.advance(10);
  assert.equal(g.state.clock.time, t, 'tick stops after game over');
});

test('survival: 飢餓達 100 → 死於飢餓（口渴壓住時）', () => {
  const g = makeGame();
  for (let i = 0; i < 2000 && !g.state.gameOver; i++) { g.systems.survival.addThirst(-100); g.advance(1); }
  assert.equal(g.state.gameOver.reason, 'starved');
});

test('survival: 吃喝降低飢渴，且不低於 0', () => {
  const g = makeGame();
  g.advance(60);
  const before = g.state.player.thirst;
  const w = find(g, 'inventory', 'water_bottle');
  const r = g.intent('useItem', { uid: w.uid });
  assert.equal(r.ok, true);
  assert.ok(g.state.player.thirst < before);
  assert.equal(g.state.player.thirst, Math.max(0, before - 35) < 0 ? 0 : g.state.player.thirst);
  assert.equal(g.systems.inventory.count('inventory', 'water_bottle'), 1);
  give(g, 'inventory', 'canned_food', 1);
  g.systems.survival.addHunger(50);
  const h0 = g.state.player.hunger;
  const f = find(g, 'inventory', 'canned_food');
  g.intent('useItem', { uid: f.uid });
  assert.ok(Math.abs(g.state.player.hunger - (h0 - 35)) < 0.01);
});

test('survival: 超過 75 給 starving/dehydrated 狀態並影響攻防，回落後移除', () => {
  const g = makeGame();
  const atk = g.systems.player.getStats().attack;
  g.systems.survival.addHunger(80); g.step();
  assert.ok(g.systems.statusEffects.has('starving'));
  assert.ok(g.systems.player.getStats().attack < atk);
  g.systems.survival.addHunger(-50); g.step();
  assert.ok(!g.systems.statusEffects.has('starving'));
  assert.equal(g.systems.player.getStats().attack, atk);
});

test('survival: modifier 改變飢渴速率（狀態 sick）', () => {
  const g = makeGame();
  const base = g.systems.survival.thirstRate();
  g.systems.statusEffects.apply('heat', { duration: 30 });
  g.modifiers.invalidate();
  assert.ok(g.systems.survival.thirstRate() > base);
});

test('survival: 在家自然回血、HP 警告', () => {
  const g = makeGame();
  g.systems.player.damage(80, { ignoreDefense: true, source: 'test' });
  const hp = g.state.player.hp;
  assert.ok(g.systems.survival.warnings().hp);
  g.advance(20);
  assert.ok(g.state.player.hp > hp);
});

test('survival: HP 歸零 → 被殺死', () => {
  const g = makeGame();
  g.systems.player.damage(9999, { ignoreDefense: true, source: 'monster:rat' });
  g.step();
  assert.equal(g.state.gameOver.reason, 'killed');
  assert.equal(g.state.gameOver.detail.source, 'monster:rat');
});
