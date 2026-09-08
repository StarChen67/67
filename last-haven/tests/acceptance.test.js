import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give, find } from './helpers.js';
import { Game } from '../game/game.js';
import { findNonFinite } from '../core/utils.js';

/**
 * 規格二十四「第一版可玩目標」18 項逐條驗收（無頭）。瀏覽器對應步驟見 docs/CHANGELOG.md。
 */
test('acceptance #1 玩家可在避難所活動：位置為 shelter，可吃喝/整理/製作', () => {
  const g = makeGame();
  assert.equal(g.state.exploration, null);
  assert.equal(g.intent('depositAll').ok, true);
  assert.equal(g.intent('craft', { recipeId: 'r_bandage' }).ok, true);
});

test('acceptance #2 玩家有 HP/Atk/Def/Hunger/Thirst', () => {
  const g = makeGame();
  const s = g.systems.player.getStats(), p = g.state.player;
  for (const k of ['maxHp', 'attack', 'defense']) assert.ok(s[k] > 0, k);
  assert.ok(p.hp > 0 && p.hunger >= 0 && p.thirst >= 0);
});

test('acceptance #3/#4 飢渴隨時間增加；達 100 → Game Over 顯示死因', () => {
  const g = makeGame();
  g.advance(30);
  assert.ok(g.state.player.hunger > 0 && g.state.player.thirst > 0);
  g.advance(2000);
  assert.ok(g.state.gameOver && ['dehydrated', 'starved'].includes(g.state.gameOver.reason));
  assert.ok(['你死於脫水。', '你因飢餓而死亡。'].includes(g.state.gameOver.text));
});

test('acceptance #5 可以吃東西和喝水', () => {
  const g = makeGame();
  g.systems.survival.addHunger(60); g.systems.survival.addThirst(60);
  g.intent('useItem', { uid: find(g, 'inventory', 'berries').uid });
  g.intent('useItem', { uid: find(g, 'inventory', 'water_bottle').uid });
  assert.ok(g.state.player.hunger < 60 && g.state.player.thirst < 60);
});

test('acceptance #6/#7/#8 外出探索；地圖生成資源與怪物', () => {
  let res = 0, mon = 0;
  for (let s = 0; s < 6; s++) {
    const g = makeGame({ seed: s });
    assert.equal(g.intent('explore', { areaId: 'forest' }).ok, true);
    g.advance(25);
    assert.equal(g.state.exploration.phase, 'explore');
    res += g.state.exploration.pois.filter((p) => p.kind === 'resource').length;
    mon += g.state.exploration.pois.filter((p) => p.kind === 'monster').length;
  }
  assert.ok(res > 0 && mon > 0);
});

test('acceptance #9/#10 玩家攻擊怪物；怪物攻擊玩家', () => {
  const g = makeGame();
  g.state.settings.autoAttack = false;
  const e = g.systems.enemy.spawn('wild_dog', 2);
  g.systems.combat.start([e], { origin: 'exploration' });
  g.state.combat.playerCooldown = 0;
  const r = g.intent('attack');
  assert.equal(r.ok, true);
  assert.ok(e.hp < e.maxHp || r.result.miss);
  const hp = g.state.player.hp;
  g.advance(3);
  assert.ok(g.state.player.hp < hp);
});

test('acceptance #11/#12 怪物死亡掉落資源或寶箱；寶箱可開', () => {
  let items = 0, chests = 0;
  for (let s = 0; s < 30; s++) {
    const g = makeGame({ seed: s });
    g.systems.combat.start([g.systems.enemy.spawn('looter', 3)], { origin: 'exploration' });
    const res = g.systems.loot.dropFor(g.state.combat.enemies[0]);
    items += res.items.length; chests += res.chests.length;
  }
  assert.ok(items > 0 && chests > 0, `items ${items} chests ${chests}`);
  const g = makeGame();
  const c = give(g, 'inventory', 'chest_rare', 1);
  const r = g.intent('openChest', { uid: c.inst.uid });
  assert.equal(r.ok, true);
  assert.ok(r.result.items.length + r.result.coins > 0);
});

test('acceptance #13 資源帶回避難所', () => {
  const g = makeGame({ seed: 3 });
  g.intent('explore', { areaId: 'forest' }); g.advance(25);
  const res = g.state.exploration.pois.find((p) => p.kind === 'resource');
  assert.ok(res);
  g.intent('interact', { poiId: res.id }); g.advance(res.data.gatherTime + 1);
  while (g.state.combat) g.step();
  const itemId = res.data.itemId;
  const carried = g.systems.inventory.count('inventory', itemId);
  assert.ok(carried > 0);
  g.intent('returnHome'); g.advance(30);
  assert.equal(g.state.exploration, null);
  const before = g.systems.inventory.count('storage', itemId);
  g.intent('depositAll');
  assert.equal(g.systems.inventory.count('storage', itemId), before + carried);
});

test('acceptance #14 升級避難所', () => {
  const g = makeGame();
  give(g, 'storage', 'wood', 100); give(g, 'storage', 'stone', 80); give(g, 'storage', 'metal', 30);
  assert.equal(g.intent('upgradeShelter').ok, true);
  assert.equal(g.state.shelter.level, 2);
});

test('acceptance #15 隨機天災會發生', () => {
  const g = makeGame({ seed: 4, quiet: false });
  g.state.raid.nextAt = 1e12;
  for (const e of g.registry.list('events')) g.state.events.cooldownUntil[e.id] = 1e12;
  give(g, 'storage', 'canned_food', 60); give(g, 'storage', 'water_bottle', 60);
  let n = 0; g.bus.on('disaster:start', () => n++);
  for (let t = 0; t < 480 * 4 && g.running; t += 20) { g.advance(20); const p = g.state.player; if (p.hunger > 40) g.intent('useItem', { uid: find(g, 'storage', 'canned_food').uid, container: 'storage' }); if (p.thirst > 40) g.intent('useItem', { uid: find(g, 'storage', 'water_bottle').uid, container: 'storage' }); }
  assert.ok(n >= 1);
});

test('acceptance #16 怪物會襲擊避難所（排程自然觸發）', () => {
  const g = makeGame({ seed: 5, quiet: false });
  g.state.disasters.nextRollAt = 1e12;
  for (const e of g.registry.list('events')) g.state.events.cooldownUntil[e.id] = 1e12;
  give(g, 'storage', 'canned_food', 60); give(g, 'storage', 'water_bottle', 60); give(g, 'storage', 'bandage', 20);
  let warned = false; g.bus.on('raid:warning', () => { warned = true; });
  for (let t = 0; t < 480 * 3 && g.running && !g.state.raid.active; t += 10) { g.advance(10); const p = g.state.player; if (p.hunger > 40) g.intent('useItem', { uid: find(g, 'storage', 'canned_food').uid, container: 'storage' }); if (p.thirst > 40) g.intent('useItem', { uid: find(g, 'storage', 'water_bottle').uid, container: 'storage' }); }
  assert.ok(warned && g.state.raid.active);
  assert.ok(g.state.raid.active.phase === 'warning');
});

test('acceptance #17/#18 存檔/讀檔；重開後恢復（新 Game 實例 = 關閉再開）', () => {
  const g = makeGame({ seed: 6 });
  g.intent('build', { buildingId: 'workbench' });
  g.intent('explore', { areaId: 'forest' }); g.advance(25);
  g.systems.disaster.trigger('rainstorm', { force: true }); g.advance(21);
  g.systems.raid.trigger();
  const r = g.intent('save', { slot: 'slot1' });
  assert.equal(r.ok, true);
  const snap = JSON.stringify(g.systems.save.serialize()).replace(/"updatedAt":\d+/, '');
  const g2 = new Game({ storage: g.systems.save.storage, now: () => 0 });
  assert.equal(g2.loadSlot('slot1').ok, true);
  assert.equal(JSON.stringify(g2.systems.save.serialize()).replace(/"updatedAt":\d+/, ''), snap);
  assert.equal(g2.state.exploration.areaId, 'forest');
  assert.equal(g2.state.shelter.buildings.workbench.level, 1);
  assert.ok(g2.state.disasters.active.some((d) => d.id === 'rainstorm'));
  assert.equal(g2.state.raid.active.phase, 'warning');
  g2.modifiers.invalidate();
  assert.ok(g2.modifiers.resolve('exploreSpeed', 1) < 1, 'disaster modifier rebuilt from state');
  g2.advance(5);
  assert.deepEqual(findNonFinite(g2.state), []);
});

/** 整局模擬：一個簡單的 bot 玩 5 天（探索→採集→戰鬥→返回→存倉→吃喝→建造→製作→防守） */
test('acceptance: 5 天整局模擬不崩潰、無 NaN、有成長', () => {
  const g = makeGame({ seed: 77, quiet: false });
  const inv = g.systems.inventory;
  const eatDrink = () => {
    const p = g.state.player;
    const use = (type, key, thr) => { if (p[key] > thr) { for (const c of ['inventory', 'storage']) { const it = inv.items(c).find((i) => g.registry.item(i.itemId)?.type === type && (g.state.exploration ? c === 'inventory' : true)); if (it) { g.intent('useItem', { uid: it.uid, container: c }); return; } } } };
    use('food', 'hunger', 45); use('water', 'thirst', 45);
    if (p.hp < g.systems.player.maxHp * 0.6) { const cs = g.state.exploration ? ['inventory'] : ['inventory', 'storage']; for (const c of cs) { const b = inv.items(c).find((i) => i.itemId === 'bandage'); if (b) { g.intent('useItem', { uid: b.uid, container: c }); break; } } }
  };
  let trips = 0, crafted = 0;
  for (let t = 0; t < 480 * 5 && g.running; t += 5) {
    g.advance(5);
    eatDrink();
    if (g.state.events.pending) g.intent('resolveEvent', { choiceId: g.state.events.pending.defaultChoiceId });
    if (g.state.combat) continue;
    const ex = g.state.exploration;
    if (!ex) {
      // 在家：存倉、建造、製作、補給後出發
      g.intent('depositAll');
      if (!g.systems.building.get('workbench')) g.intent('build', { buildingId: 'workbench' });
      if (!g.systems.building.get('wall')) g.intent('build', { buildingId: 'wall' });
      if (g.systems.crafting.check('r_bandage').ok && inv.countAll('bandage') < 4) { if (g.intent('craft', { recipeId: 'r_bandage' }).ok) crafted++; }
      if (g.state.raid.active) continue;
      const food = inv.items('storage').find((i) => g.registry.item(i.itemId)?.type === 'food');
      const water = inv.items('storage').find((i) => g.registry.item(i.itemId)?.type === 'water');
      if (food) g.intent('transfer', { uid: food.uid, from: 'storage', qty: 2 });
      if (water) g.intent('transfer', { uid: water.uid, from: 'storage', qty: 2 });
      const band = inv.items('storage').find((i) => i.itemId === 'bandage');
      if (band && inv.count('inventory', 'bandage') < 2) g.intent('transfer', { uid: band.uid, from: 'storage', qty: 2 });
      if (g.state.player.hp > g.systems.player.maxHp * 0.85 && g.intent('explore', { areaId: g.state.player.level >= 4 ? 'suburbs' : 'forest' }).ok) trips++;
    } else if (ex.phase === 'explore' && !ex.activeAction) {
      if (g.state.player.hp < g.systems.player.maxHp * 0.55 || inv.free('inventory') < 3) { g.intent('returnHome'); continue; }
      const safe = g.state.player.hp > g.systems.player.maxHp * 0.7;
      const poi = ex.pois.find((p) => !p.done && p.kind !== 'path' && !(p.kind === 'monster' && (p.data.boss || !safe || p.data.enemies.length > 1)));
      if (poi) g.intent('interact', { poiId: poi.id });
      else if (ex.depth < 2) g.intent('goDeeper'); else g.intent('returnHome');
    }
  }
  assert.deepEqual(findNonFinite(g.state), []);
  assert.ok(trips >= 3, `trips ${trips}`);
  assert.ok(g.state.player.level >= 2, `level ${g.state.player.level}`);
  assert.ok(g.state.stats.kills >= 3, `kills ${g.state.stats.kills}`);
  assert.ok(crafted >= 1);
  if (g.state.gameOver) assert.ok(['killed', 'shelterDestroyed'].includes(g.state.gameOver.reason) && g.clock.day >= 3, `died of ${g.state.gameOver.reason} at day ${g.clock.day}`);
  else assert.ok(g.clock.day >= 5);
});
