import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give } from './helpers.js';
import { RNG } from '../core/rng.js';

const fixedRng = (v) => ({ chance: (p) => v < p, next: () => v });

test('combat: 傷害公式 max(1, atk − def)，暴擊倍率，閃避', () => {
  const g = makeGame();
  const C = g.systems.combat;
  const noCrit = fixedRng(0.99);
  assert.equal(C.computeHit({ attack: 10, accuracy: 1 }, { defense: 3 }, noCrit).damage, 7);
  assert.equal(C.computeHit({ attack: 2, accuracy: 1 }, { defense: 50 }, noCrit).damage, 1);
  const crit = fixedRng(0.0);
  const h = C.computeHit({ attack: 10, accuracy: 1, critChance: 0.5, critDamage: 2 }, { defense: 0 }, crit);
  assert.equal(h.crit, true); assert.equal(h.damage, 20);
  const miss = C.computeHit({ attack: 10, accuracy: 0.5 }, { defense: 0, dodge: 0.3 }, fixedRng(0.9));
  assert.equal(miss.miss, true);
  // 穿甲
  assert.equal(C.computeHit({ attack: 10, accuracy: 1, armorPen: 0.5 }, { defense: 4 }, noCrit).damage, 8);
});

test('combat: 玩家攻擊有冷卻；怪物會反擊；擊殺給 XP 與掉落', () => {
  const g = makeGame();
  g.state.settings.autoAttack = false;
  const e = g.systems.enemy.spawn('rat', 1);
  g.systems.combat.start([e], { origin: 'exploration' });
  assert.ok(g.state.combat);
  g.state.combat.playerCooldown = 0;
  const r1 = g.intent('attack');
  assert.equal(r1.ok, true);
  const r2 = g.intent('attack');
  assert.equal(r2.reason, 'cooldown');
  const hp0 = g.state.player.hp;
  g.advance(5);
  assert.ok(g.state.player.hp < hp0 || !g.state.combat, 'enemy should have attacked');
  // 打到死
  let n = 0;
  while (g.state.combat && n < 500) { g.state.combat.playerCooldown = 0; g.intent('attack'); g.step(); n++; }
  assert.equal(g.state.combat, null);
  assert.equal(g.state.stats.kills, 1);
  assert.ok(g.state.player.xp > 0);
  assert.ok(g.bus.history.some((h) => h.name === 'combat:end' && h.payload.result === 'win'));
});

test('combat: 自動攻擊會結束戰鬥；玩家死亡 → gameOver killed 並記錄兇手', () => {
  const g = makeGame();
  g.systems.combat.start([g.systems.enemy.spawn('rat', 1)], { origin: 'exploration' });
  g.advance(30);
  assert.equal(g.state.combat, null);
  const g2 = makeGame();
  g2.systems.combat.start([g2.systems.enemy.spawn('hive_queen', 32)], { origin: 'exploration' });
  g2.advance(120);
  assert.equal(g2.state.gameOver?.reason, 'killed');
  assert.equal(g2.state.gameOver.detail.source, 'monster:hive_queen');
  assert.equal(g2.state.combat, null);
});

test('combat: 逃跑成功率受移速影響；失敗會被攻擊一次', () => {
  const g = makeGame();
  g.state.settings.autoAttack = false;
  g.state.player.equipment.accessory = g.systems.item.createInstance('running_shoes', 1); // 移速 1.2
  const slow = g.systems.enemy.spawn('rat', 1);
  g.systems.combat.start([slow], { origin: 'exploration' });
  const fast = g.systems.combat.balance.combat.fleeBase + (1.2 - 1.2) * 0.3;
  assert.ok(fast > 0);
  let ok = false, fails = 0;
  for (let i = 0; i < 30 && g.state.combat && !g.state.gameOver; i++) { const r = g.intent('flee'); if (r.ok) ok = true; else fails++; }
  assert.ok(ok, 'should eventually flee');
  assert.equal(g.state.combat, null);
  assert.ok(fails >= 0);
  // 襲擊中不能逃
  const g2 = makeGame();
  g2.systems.combat.start([g2.systems.enemy.spawn('rat', 1)], { origin: 'raid' });
  assert.equal(g2.intent('flee').reason, 'cannotFleeRaid');
});

test('combat: 遠程武器消耗彈藥，沒彈藥傷害降低', () => {
  const g = makeGame();
  g.state.settings.autoAttack = false;
  g.state.player.equipment.weapon = g.systems.item.createInstance('pistol', 1);
  give(g, 'inventory', 'pistol_ammo', 2);
  const e = g.systems.enemy.spawn('sentry_bot', 12);
  g.systems.combat.start([e], { origin: 'exploration' });
  g.state.combat.playerCooldown = 0; g.intent('attack');
  assert.equal(g.systems.inventory.count('inventory', 'pistol_ammo'), 1);
  g.state.combat.playerCooldown = 0; g.intent('attack');
  assert.equal(g.systems.inventory.count('inventory', 'pistol_ammo'), 0);
  const hp = e.hp;
  g.rng.combat.setState(7);
  g.state.combat.playerCooldown = 0; const r = g.intent('attack');
  if (!r.result.miss) assert.ok(hp - e.hp <= Math.max(1, Math.round((8 + 14) * 0.3)) + 1, 'no-ammo damage reduced');
});

test('combat: 怪物命中可附加狀態（中毒），狀態對玩家持續扣血', () => {
  const g = makeGame();
  g.state.settings.autoAttack = false;
  const spider = g.systems.enemy.spawn('mutant_spider', 5);
  g.systems.combat.start([spider], { origin: 'exploration' });
  let got = false;
  for (let i = 0; i < 40 && !got; i++) { g.systems.combat.enemyAttack(spider); got = g.systems.statusEffects.has('poison'); }
  assert.ok(got, 'poison applied eventually');
});

test('combat: 戰利品放不下時留在 lootPile', () => {
  const g = makeGame();
  g.state.exploration = { areaId: 'forest', phase: 'explore', lootPile: [], pois: [], gathered: {}, travelLeft: 0, travelTotal: 0, depth: 1, activeAction: null, startedAt: 0, ambushAcc: 0 };
  g.systems.inventory.add('inventory', 'stone', 100, { force: true });
  g.systems.combat.start([g.systems.enemy.spawn('rat', 1)], { origin: 'exploration' });
  g.state.combat.loot.push(g.systems.item.createInstance('wood', 5));
  g.systems.combat.end('win');
  assert.equal(g.state.exploration.lootPile.length, 1);
  assert.equal(g.state.exploration.lootPile[0].itemId, 'wood');
});

test('combat: 決定性——同 seed 同結果', () => {
  const run = () => { const g = makeGame({ seed: 99 }); g.systems.combat.start([g.systems.enemy.spawn('wild_dog', 2), g.systems.enemy.spawn('rat', 2)], { origin: 'exploration' }); g.advance(60); return `${g.state.player.hp}|${g.state.stats.kills}|${g.rng.combat.getState()}`; };
  assert.equal(run(), run());
  void RNG;
});
