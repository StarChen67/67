import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give } from './helpers.js';

test('raid: 難度隨天數/等級/避難所等級提升，樣板依難度選取', () => {
  const g = makeGame();
  const R = g.systems.raid;
  const d0 = R.difficulty();
  g.state.player.level = 10; g.state.shelter.level = 3;
  assert.ok(R.difficulty() > d0);
  assert.equal(R.templateFor(0.5).id, 'raid_t1');
  assert.equal(R.templateFor(2.6).id, 'raid_t3');
  assert.equal(R.templateFor(100).id, 'raid_t7');
});

test('raid: 排程 → 警告 60 秒 → 波次 → 前排戰鬥 → 勝利獎勵 → 下一次排程', () => {
  const g = makeGame({ seed: 5, quiet: false });
  g.state.disasters.nextRollAt = 1e12;
  const R = g.systems.raid;
  assert.ok(g.state.raid.nextAt >= g.clock.dayToTime(2));
  const r = R.trigger();
  assert.equal(r.ok, true);
  assert.equal(g.state.raid.active.phase, 'warning');
  assert.equal(Math.round(r.result.warningSec), 60);
  assert.equal(g.intent('explore', { areaId: 'forest' }).reason, 'raid');
  g.advance(61);
  assert.equal(g.state.raid.active.phase, 'active');
  assert.ok(g.state.combat && g.state.combat.origin === 'raid');
  assert.equal(g.intent('flee').reason, 'cannotFleeRaid');
  let n = 0;
  while (g.state.raid.active && n < 6000 && !g.state.gameOver) { g.step(); n++; }
  assert.equal(g.state.gameOver, null);
  assert.equal(g.state.raid.active, null);
  assert.equal(g.state.stats.raidsSurvived, 1);
  assert.equal(g.state.raid.count, 1);
  assert.ok(g.state.raid.nextAt > g.state.clock.time);
  assert.ok(g.bus.history.some((h) => h.name === 'raid:end' && h.payload.result === 'won'));
});

test('raid: 玩家不在家時怪物攻擊牆→設施→核心；核心 0 → shelterDestroyed', () => {
  const g = makeGame({ seed: 3 });
  give(g, 'storage', 'wood', 40); give(g, 'storage', 'stone', 30);
  g.intent('build', { buildingId: 'wall' });
  g.intent('explore', { areaId: 'lab' }); // 遠處（未解鎖會失敗）
  if (!g.state.exploration) { g.state.player.level = 18; g.state.shelter.level = 3; g.intent('explore', { areaId: 'lab' }); }
  assert.ok(g.state.exploration);
  g.systems.raid.trigger();
  g.advance(61);
  const wallHp = g.state.shelter.buildings.wall.hp;
  g.advance(20);
  assert.ok(g.state.shelter.buildings.wall.hp < wallHp, 'wall takes damage first');
  assert.equal(g.state.shelter.hp, 1000, 'core untouched while wall stands');
  let n = 0;
  while (g.state.raid.active && n < 30000 && !g.state.gameOver) { g.step(); n++; if (g.state.combat) while (g.state.combat && !g.state.gameOver) g.step(); }
  // 牆倒後核心受損，可能被摧毀
  assert.ok(g.state.shelter.hp < 1000 || g.state.gameOver);
  if (g.state.gameOver) assert.equal(g.state.gameOver.reason, 'shelterDestroyed');
});

test('raid: 炮塔對隊列輸出並擊殺；擊殺有掉落', () => {
  const g = makeGame({ seed: 9 });
  g.state.shelter.level = 3;
  g.state.shelter.buildings.turret = { id: 'turret', level: 3, hp: 450, acc: 0 };
  g.state.player.hp = 0.001; // 避免玩家介入：讓玩家無法戰鬥？改成離家
  g.state.player.hp = g.systems.player.maxHp;
  g.intent('explore', { areaId: 'forest' });
  g.systems.raid.trigger();
  g.advance(61);
  const q0 = g.state.raid.active.queue.length;
  g.advance(30);
  assert.ok(g.state.raid.active === null || g.state.raid.active.queue.length < q0 || g.state.raid.active.kills > 0, 'turret killed something');
  assert.ok(g.state.stats.kills > 0);
});

test('raid: 回家途中遇到襲擊，到家後立刻接戰', () => {
  const g = makeGame({ seed: 12 });
  g.intent('explore', { areaId: 'forest' });
  g.advance(25);
  g.intent('returnHome');
  g.systems.raid.trigger();
  g.advance(61);
  assert.ok(g.state.raid.active.phase === 'active');
  let n = 0;
  while (g.state.exploration && n < 600) { g.step(); n++; }
  assert.equal(g.state.exploration, null);
  g.advance(1);
  assert.ok(!g.state.raid.active || g.state.combat?.origin === 'raid', 'engaged on arrival');
});

test('raid: 事件可觸發襲擊（spawnRaid）', () => {
  const g = makeGame();
  g.state.clock.time = g.clock.dayToTime(3);
  g.systems.event.trigger('night_raiders', { force: true });
  assert.ok(g.state.raid.active);
  assert.equal(g.state.raid.active.phase, 'warning');
});
