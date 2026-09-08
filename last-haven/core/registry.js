/**
 * Data Registry：把 data/ 的陣列轉成 id → def 的索引，提供查詢與交叉引用驗證。
 * 系統只透過這裡讀資料，不直接 import data/*。
 */
const QUALITIES = ['common', 'fine', 'rare', 'epic', 'legendary'];
const BLUEPRINT_TYPES = ['weapon', 'armor', 'tool', 'medicine', 'building', 'defense', 'shelter', 'utility', 'special'];
const ITEM_TYPES = ['food', 'water', 'material', 'medicine', 'weapon', 'armor', 'ammo', 'blueprint', 'quest', 'special'];
const SLOTS = ['weapon', 'head', 'body', 'legs', 'accessory'];

export class Registry {
  constructor(data) {
    this.raw = data;
    this.balance = data.balance;
    this.items = index(data.items);
    this.statusEffects = index(data.statusEffects);
    this.monsters = index(data.monsters);
    this.lootTables = index(data.lootTables);
    this.chests = index(data.chests, 'tier');
    this.areas = index(data.areas);
    this.shelterLevels = index(data.shelterLevels, 'level');
    this.buildings = index(data.buildings);
    this.recipes = index(data.recipes);
    this.blueprints = index(data.blueprints);
    this.disasters = index(data.disasters);
    this.events = index(data.events);
    this.raids = index(data.raids);
    // 反查：recipeId → 解鎖它的圖紙們
    this.blueprintsByRecipe = new Map();
    for (const bp of this.blueprints.values()) {
      for (const rid of bp.unlockedRecipeIds || []) {
        if (!this.blueprintsByRecipe.has(rid)) this.blueprintsByRecipe.set(rid, []);
        this.blueprintsByRecipe.get(rid).push(bp.id);
      }
    }
    // 圖紙 → 物品
    this.blueprintItem = new Map();
    for (const it of this.items.values()) if (it.type === 'blueprint' && it.blueprintId) this.blueprintItem.set(it.blueprintId, it.id);
  }

  item(id) { return this.items.get(id); }
  monster(id) { return this.monsters.get(id); }
  lootTable(id) { return this.lootTables.get(id); }
  chest(tier) { return this.chests.get(tier); }
  area(id) { return this.areas.get(id); }
  shelterLevel(l) { return this.shelterLevels.get(l); }
  building(id) { return this.buildings.get(id); }
  recipe(id) { return this.recipes.get(id); }
  blueprint(id) { return this.blueprints.get(id); }
  disaster(id) { return this.disasters.get(id); }
  event(id) { return this.events.get(id); }
  raid(id) { return this.raids.get(id); }
  status(id) { return this.statusEffects.get(id); }

  /** 取不到就丟錯（用於程式邏輯錯誤而非玩家輸入） */
  req(kind, id) {
    const v = this[kind]?.get(id);
    if (!v) throw new Error(`Registry: ${kind} "${id}" not found`);
    return v;
  }
  list(kind) { return [...this[kind].values()]; }

  /** 完整交叉引用驗證；回傳錯誤字串陣列（空 = 通過） */
  validate() {
    const errs = [];
    const hasItem = (id) => this.items.has(id);
    const need = (cond, msg) => { if (!cond) errs.push(msg); };

    for (const it of this.items.values()) {
      need(ITEM_TYPES.includes(it.type), `item ${it.id}: bad type ${it.type}`);
      need(QUALITIES.includes(it.quality || 'common'), `item ${it.id}: bad quality ${it.quality}`);
      need(typeof it.weight === 'number' && it.weight >= 0, `item ${it.id}: weight`);
      need(Number.isInteger(it.stackMax) && it.stackMax >= 1, `item ${it.id}: stackMax`);
      if (it.equip) {
        need(SLOTS.includes(it.equip.slot), `item ${it.id}: bad slot ${it.equip.slot}`);
        need(it.stackMax === 1, `item ${it.id}: equipment must stackMax 1`);
      }
      if (it.type === 'blueprint') need(this.blueprints.has(it.blueprintId), `item ${it.id}: blueprintId ${it.blueprintId} missing`);
      for (const eff of it.effects || []) need(eff.type !== 'status' || this.statusEffects.has(eff.id), `item ${it.id}: status ${eff.id} missing`);
    }
    for (const bp of this.blueprints.values()) {
      need(BLUEPRINT_TYPES.includes(bp.type), `blueprint ${bp.id}: bad type ${bp.type}`);
      need(bp.level >= 1 && bp.level <= 5, `blueprint ${bp.id}: level`);
      need(QUALITIES.includes(bp.rarity), `blueprint ${bp.id}: rarity`);
      need(bp.requiredWorkbenchLevel >= 0 && bp.requiredWorkbenchLevel <= 5, `blueprint ${bp.id}: requiredWorkbenchLevel`);
      need(Array.isArray(bp.unlockedRecipeIds), `blueprint ${bp.id}: unlockedRecipeIds`);
      const gates = [...this.shelterLevels.values()].some((s) => s.requiredBlueprintId === bp.id) || [...this.buildings.values()].some((b) => b.levels.some((l) => l.requiredBlueprintId === bp.id));
      need(bp.unlockedRecipeIds.length > 0 || gates, `blueprint ${bp.id}: unlocks nothing (no recipes, no building/shelter gate)`);
      const wbMax = Math.max(0, ...bp.unlockedRecipeIds.map((rid) => this.recipes.get(rid)).filter((x) => x && x.requiredStation?.station === 'workbench').map((x) => x.requiredStation.level));
      if (bp.unlockedRecipeIds.length) need(bp.requiredWorkbenchLevel >= wbMax, `blueprint ${bp.id}: requiredWorkbenchLevel ${bp.requiredWorkbenchLevel} < recipe workbench level ${wbMax}`);
      for (const rid of bp.unlockedRecipeIds || []) need(this.recipes.has(rid), `blueprint ${bp.id}: recipe ${rid} missing`);
      for (const a of bp.dropLocations || []) need(this.areas.has(a), `blueprint ${bp.id}: area ${a} missing`);
      need(this.blueprintItem.has(bp.id), `blueprint ${bp.id}: no item of type blueprint references it`);
    }
    for (const r of this.recipes.values()) {
      need(hasItem(r.resultItemId), `recipe ${r.id}: result ${r.resultItemId} missing`);
      for (const c of r.requiredItems || []) need(hasItem(c.itemId), `recipe ${r.id}: ingredient ${c.itemId} missing`);
      need(r.defaultUnlocked || this.blueprintsByRecipe.has(r.id), `recipe ${r.id}: locked but no blueprint unlocks it`);
      need(r.requiredStation === null || (r.requiredStation && typeof r.requiredStation.station === 'string' && r.requiredStation.level >= 1), `recipe ${r.id}: requiredStation`);
      need(Number.isInteger(r.resultQty) && r.resultQty >= 1, `recipe ${r.id}: resultQty`);
      need(typeof r.craftingTime === 'number' && r.craftingTime >= 0, `recipe ${r.id}: craftingTime`);
      need(['weapon', 'armor', 'tool', 'medicine', 'food', 'ammo', 'material', 'shelter', 'defense', 'special'].includes(r.category), `recipe ${r.id}: category`);
    }
    for (const lt of this.lootTables.values()) {
      for (const e of lt.entries || []) {
        if (e.itemId) need(hasItem(e.itemId), `lootTable ${lt.id}: item ${e.itemId} missing`);
        if (e.chest) need(this.chests.has(e.chest), `lootTable ${lt.id}: chest ${e.chest} missing`);
        need(e.itemId || e.chest || e.blueprint || e.coins || e.nothing, `lootTable ${lt.id}: entry has no payload`);
        need(typeof e.weight === 'number' && e.weight > 0, `lootTable ${lt.id}: entry weight`);
      }
    }
    for (const m of this.monsters.values()) {
      need(this.lootTables.has(m.lootTableId), `monster ${m.id}: lootTable ${m.lootTableId} missing`);
      need(['normal', 'elite', 'boss'].includes(m.tier), `monster ${m.id}: tier`);
      for (const k of ['hp', 'attack', 'defense', 'attackSpeed', 'moveSpeed', 'xp']) need(typeof m.base?.[k] === 'number', `monster ${m.id}: base.${k}`);
      if (m.onHitStatus) need(this.statusEffects.has(m.onHitStatus.id), `monster ${m.id}: status ${m.onHitStatus.id}`);
    }
    for (const c of this.chests.values()) need(this.lootTables.has(c.lootTableId), `chest ${c.tier}: lootTable ${c.lootTableId} missing`);
    for (const a of this.areas.values()) {
      for (const r of a.resources || []) need(hasItem(r.itemId), `area ${a.id}: resource ${r.itemId} missing`);
      for (const m of a.monsters || []) need(this.monsters.has(m.monsterId), `area ${a.id}: monster ${m.monsterId} missing`);
      if (a.bossId) need(this.monsters.has(a.bossId), `area ${a.id}: boss ${a.bossId} missing`);
      for (const s of a.sites || []) need(this.lootTables.has(s.lootTableId), `area ${a.id}: site lootTable ${s.lootTableId} missing`);
      for (const t of Object.keys(a.blueprintPool || {})) {
        need(BLUEPRINT_TYPES.includes(t), `area ${a.id}: blueprintPool type ${t}`);
        need([...this.blueprints.values()].some((b) => b.type === t && (!b.dropLocations?.length || b.dropLocations.includes(a.id))), `area ${a.id}: no blueprint of type ${t} can drop here`);
      }
    }
    for (const sl of this.shelterLevels.values()) {
      for (const c of sl.cost || []) need(hasItem(c.itemId), `shelterLevel ${sl.level}: cost ${c.itemId} missing`);
      if (sl.requiredBlueprintId) need(this.blueprints.has(sl.requiredBlueprintId), `shelterLevel ${sl.level}: blueprint ${sl.requiredBlueprintId} missing`);
      for (const b of sl.unlocks || []) need(this.buildings.has(b), `shelterLevel ${sl.level}: unlock ${b} missing`);
    }
    for (const b of this.buildings.values()) {
      need(Array.isArray(b.levels) && b.levels.length === b.maxLevel, `building ${b.id}: levels length != maxLevel`);
      need(b.requiredBlueprintId === undefined, `building ${b.id}: use levels[0].requiredBlueprintId instead of top-level`);
      for (const lv of b.levels || []) {
        for (const c of lv.cost || []) need(hasItem(c.itemId), `building ${b.id}: cost ${c.itemId} missing`);
        if (lv.requiredBlueprintId) need(this.blueprints.has(lv.requiredBlueprintId), `building ${b.id}: level blueprint ${lv.requiredBlueprintId} missing`);
      }
    }
    for (const d of this.disasters.values()) {
      for (const e of [...(d.effects || []), ...(d.onStart || []), ...(d.onEnd || [])]) need(e.type !== 'status' || this.statusEffects.has(e.id), `disaster ${d.id}: status ${e.id}`);
    }
    for (const ev of this.events.values()) {
      for (const ch of ev.choices || []) for (const c of (Array.isArray(ch.cost) ? ch.cost : [])) need(hasItem(c.itemId), `event ${ev.id}: cost ${c.itemId}`);
      for (const e of ev.effects || []) if (e.itemId) need(hasItem(e.itemId), `event ${ev.id}: item ${e.itemId}`);
      for (const ch of ev.choices || []) for (const e of ch.effects || []) if (e.itemId) need(hasItem(e.itemId), `event ${ev.id}: choice item ${e.itemId}`);
    }
    for (const r of this.raids.values()) {
      for (const w of r.waves || []) for (const m of w.monsters || []) need(this.monsters.has(m.monsterId), `raid ${r.id}: monster ${m.monsterId}`);
    }
    return errs;
  }
}

function index(arr, key = 'id') {
  const m = new Map();
  for (const d of arr || []) {
    if (m.has(d[key])) throw new Error(`Registry: duplicate ${key} "${d[key]}"`);
    m.set(d[key], d);
  }
  return m;
}

export { QUALITIES, BLUEPRINT_TYPES, ITEM_TYPES, SLOTS };
