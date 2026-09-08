import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give } from './helpers.js';
import { Game } from '../game/game.js';
import { Storage, MemoryStorage } from '../core/storage.js';
import { SAVE_VERSION } from '../game/state.js';
import { findNonFinite } from '../core/utils.js';

test('save: roundtrip 後狀態相同且可繼續模擬', () => {
  const g = makeGame();
  g.advance(30);
  give(g, 'inventory', 'iron_sword', 1, { quality: 'rare' });
  g.systems.statusEffects.apply('poison', { duration: 10 });
  const r = g.intent('save', { slot: 'slot2' });
  assert.equal(r.ok, true);
  const snapshot = JSON.stringify(g.systems.save.serialize());
  const g2 = new Game({ storage: g.systems.save.storage, now: () => 0 });
  const l = g2.loadSlot('slot2');
  assert.equal(l.ok, true);
  assert.deepEqual(l.result.warnings, []);
  assert.equal(JSON.stringify(g2.systems.save.serialize()).replace(/"updatedAt":\d+/, ''), snapshot.replace(/"updatedAt":\d+/, ''));
  // 兩邊繼續跑 10 秒結果一致（決定性）
  g.advance(10); g2.advance(10);
  assert.equal(g.state.player.hunger, g2.state.player.hunger);
  assert.equal(g.state.player.hp, g2.state.player.hp);
  assert.ok(g2.systems.statusEffects.has('poison'));
});

test('save: 自動存檔到 autosave 槽；gameOver 後停止', () => {
  const g = makeGame();
  g.systems.save.setPrefs({ autosaveSec: 5 });
  g.advance(6);
  assert.ok(!g.systems.save.list().find((s) => s.slot === 'autosave').empty);
  g.state.gameOver = { reason: 'starved' };
  const raw = g.systems.save.storage.getRaw('save.autosave');
  g.advance(10);
  assert.equal(g.systems.save.storage.getRaw('save.autosave'), raw);
});

test('save: normalize 幂等且補齊缺欄位；損毀存檔被拒', () => {
  const g = makeGame();
  const S = g.systems.save;
  const partial = { version: SAVE_VERSION, player: { name: 'x', level: 3 }, shelter: { level: 2 } };
  const r = S.prepare(JSON.stringify(partial));
  assert.equal(r.ok, true);
  assert.equal(r.state.player.level, 3);
  assert.equal(r.state.player.hunger, 0);
  assert.ok(Array.isArray(r.state.inventory.items));
  const again = S.normalize(JSON.parse(JSON.stringify(r.state)));
  assert.deepEqual(again, r.state);
  assert.equal(S.prepare('not json').ok, false);
  assert.equal(S.prepare('[]').ok, false);
  assert.equal(S.prepare(JSON.stringify({ version: 999, player: {}, shelter: {} })).reason, 'version');
});

test('save: validate 丟棄未知 id 並回報警告；seq 不重複', () => {
  const g = makeGame();
  const data = g.systems.save.serialize();
  data.inventory.items.push({ uid: 'it_zz', itemId: 'nope', qty: 1 });
  data.player.equipment.head = { uid: 'it_a', itemId: 'wood', qty: 1 };
  data.player.statusEffects.push({ id: 'ghost', left: 5, stacks: 1 });
  data.player.hp = NaN;
  const r = g.systems.save.prepare(data);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.length >= 2);
  assert.ok(!r.state.inventory.items.find((i) => i.itemId === 'nope'));
  assert.equal(r.state.player.equipment.head, null);
  assert.equal(r.state.player.statusEffects.length, 0);
  assert.deepEqual(findNonFinite(r.state), []);
  const maxSeq = Math.max(...r.state.inventory.items.map((i) => parseInt(i.uid.split('_')[1], 36)));
  assert.ok(r.state.seq > maxSeq);
});

test('save: 匯出/匯入', () => {
  const g = makeGame();
  const json = g.systems.save.exportJson();
  const r = g.systems.save.importJson(json, 'slot3');
  assert.equal(r.ok, true);
  const g2 = new Game({ storage: g.systems.save.storage });
  assert.equal(g2.loadSlot('slot3').ok, true);
  assert.equal(g2.state.player.name, '測試');
});

test('save: 備份槽在寫入失敗時可用', () => {
  const g = makeGame();
  g.intent('save', { slot: 'slot1' });
  g.advance(5);
  g.intent('save', { slot: 'slot1' });
  const S = g.systems.save;
  S.storage.backend.setItem(S.storage.prefix + 'save.slot1', '{broken');
  const l = S.load('slot1');
  assert.equal(l.ok, true);
  assert.equal(l.usedBackup, true);
});

test('save: 讀檔後系統作用於新 state 而非舊物件', () => {
  const g = makeGame();
  g.intent('save', { slot: 'slot1' });
  const old = g.state;
  g.loadSlot('slot1');
  g.advance(5);
  assert.notEqual(g.state, old);
  assert.equal(old.clock.time, 0);
  assert.ok(g.state.clock.time > 0);
});

test('save: 存檔包含規格十七要求的全部區塊', () => {
  const g = makeGame();
  const d = g.systems.save.serialize();
  for (const k of ['version', 'player', 'inventory', 'shelter', 'exploration', 'combat', 'raid', 'disasters', 'events', 'world', 'clock', 'settings', 'blueprints', 'crafting', 'stats', 'rng', 'meta']) assert.ok(k in d, k);
  assert.ok(['equipment', 'level', 'xp', 'hp', 'hunger', 'thirst'].every((k) => k in d.player));
  assert.ok('buildings' in d.shelter && 'storage' in d.shelter);
});
