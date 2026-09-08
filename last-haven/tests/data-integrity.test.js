import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../core/registry.js';
import { DATA } from '../data/index.js';

/** 後續階段才會填入的資料所造成的已知錯誤（Phase 4 填入 buildings/blueprints 後必須清空） */
const PENDING = [];

test('data: Registry 交叉引用驗證', () => {
  const R = new Registry(DATA);
  const errs = R.validate().filter((e) => !PENDING.some((re) => re.test(e)));
  assert.deepEqual(errs, []);
});

test('data: 物品欄位完整', () => {
  const R = new Registry(DATA);
  for (const it of R.list('items')) {
    assert.ok(it.name && it.icon, `item ${it.id} name/icon`);
    assert.ok(typeof it.desc === 'string', `item ${it.id} desc`);
    if (it.effects) for (const e of it.effects) assert.ok(e.perSec == null, `item ${it.id}: effects 只能放 InstantEffect`);
  }
});

test('data: 起始物品存在', () => {
  const R = new Registry(DATA);
  const b = R.balance.player;
  for (const [, id] of Object.entries(b.startingEquipment)) assert.ok(R.item(id), id);
  for (const it of [...b.startingInventory, ...b.startingStorage]) assert.ok(R.item(it.itemId), it.itemId);
});

test('data: 狀態效果 tick 只放 ContinuousEffect', () => {
  const R = new Registry(DATA);
  for (const s of R.list('statusEffects')) {
    for (const e of s.tick || []) assert.ok(e.perSec != null, `${s.id} tick ${e.type} 缺 perSec`);
    for (const e of s.onExpire || []) assert.ok(e.perSec == null, `${s.id} onExpire 只能放 InstantEffect`);
  }
});

test('data: 品質權重 key 屬於 Quality', () => {
  const R = new Registry(DATA);
  const Q = R.balance.quality.order;
  for (const k of Object.keys(R.balance.blueprintDrop.rarityWeights)) assert.ok(Q.includes(k));
  for (const t of Object.values(R.balance.loot.defaultChestDrop)) for (const k of Object.keys(t.tierWeights)) assert.ok(Q.includes(k), k);
  for (const lv of Object.values(R.balance.craftQuality.byWorkbenchLevel)) for (const k of Object.keys(lv)) assert.ok(Q.includes(k), k);
});

test('data: 所有成本物品皆可取得（區域資源 / 掉落表 / 配方成品）', () => {
  const R = new Registry(DATA);
  const obtainable = new Set();
  for (const a of R.list('areas')) for (const r of a.resources) obtainable.add(r.itemId);
  for (const lt of R.list('lootTables')) for (const e of lt.entries) if (e.itemId) obtainable.add(e.itemId);
  for (const r of R.list('recipes')) obtainable.add(r.resultItemId);
  for (const b of R.list('buildings')) for (const lv of b.levels) { if (lv.effects.waterItem) obtainable.add(lv.effects.waterItem); if (lv.effects.foodItem) obtainable.add(lv.effects.foodItem); }
  const missing = [];
  for (const s of R.list('shelterLevels')) for (const c of s.cost) if (!obtainable.has(c.itemId)) missing.push(`shelter L${s.level}: ${c.itemId}`);
  for (const b of R.list('buildings')) for (const lv of b.levels) for (const c of lv.cost) if (!obtainable.has(c.itemId)) missing.push(`building ${b.id}: ${c.itemId}`);
  for (const r of R.list('recipes')) for (const c of r.requiredItems) if (!obtainable.has(c.itemId)) missing.push(`recipe ${r.id}: ${c.itemId}`);
  assert.deepEqual(missing, []);
});

test('data: 每種圖紙類型都有圖紙；區域圖紙池類型都有可掉落圖紙；每張圖紙都可在某處掉落', () => {
  const R = new Registry(DATA);
  const types = new Set(R.list('blueprints').map((b) => b.type));
  for (const t of ['weapon', 'armor', 'tool', 'medicine', 'building', 'defense', 'shelter', 'utility', 'special']) assert.ok(types.has(t), t);
  for (const bp of R.list('blueprints')) {
    const areas = R.list('areas').filter((a) => a.blueprintPool[bp.type] && (!bp.dropLocations.length || bp.dropLocations.includes(a.id)));
    assert.ok(areas.length > 0, `blueprint ${bp.id} (${bp.type}) cannot drop anywhere`);
  }
});
