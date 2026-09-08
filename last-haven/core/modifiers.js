/**
 * ModifierStack（provider 制）：數值修正的匿名管道。
 *
 * 各系統在 init() 註冊一次 provider：`provide(name, (key) => [{ mult?, add?, label }])`，
 * provider 讀取「當下 state」計算自己提供的修正（狀態效果、天災、建築、區域環境…）。
 * 使用方只問 `resolve(key, base)`。沒有 add/remove 生命週期 → 讀檔後不需重建。
 *
 * resolve(key, base) = clamp((base + Σadd) × Πmult, bounds[key])
 * 每個模擬步長內結果會快取（invalidate() 由 Game.step 每步呼叫）。
 */
export class ModifierStack {
  constructor(bounds = {}) {
    this.providers = new Map(); // name -> fn(key) => entries[]
    this.bounds = bounds;
    this.cache = new Map();
  }
  provide(name, fn) {
    this.providers.set(name, fn);
    this.cache.clear();
  }
  unprovide(name) {
    this.providers.delete(name);
    this.cache.clear();
  }
  invalidate() { this.cache.clear(); }

  /** 收集所有 provider 對 key 的修正 */
  collect(key) {
    const out = [];
    for (const [name, fn] of this.providers) {
      let entries;
      try { entries = fn(key); } catch (err) { if (typeof console !== 'undefined') console.error(`[Modifiers] provider ${name} failed`, err); continue; }
      if (!entries) continue;
      for (const e of entries) {
        if (!e) continue;
        out.push({ provider: name, label: e.label || name, mult: e.mult ?? 1, add: e.add ?? 0 });
      }
    }
    return out;
  }
  get(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    let mult = 1, add = 0;
    for (const e of this.collect(key)) { mult *= e.mult; add += e.add; }
    const r = { mult, add };
    this.cache.set(key, r);
    return r;
  }
  resolve(key, base) {
    const { mult, add } = this.get(key);
    let v = (base + add) * mult;
    const b = this.bounds[key];
    if (b) v = Math.max(b[0], Math.min(b[1], v));
    return v;
  }
  /** UI 顯示「口渴 ×1.5（熱浪）」用 */
  explain(key) { return this.collect(key); }
}

export const MODIFIER_KEYS = Object.freeze([
  'hungerRate', 'thirstRate', 'exploreSpeed', 'gatherSpeed', 'carryCapacity', 'storageCapacity',
  'playerAttack', 'playerDefense', 'playerMaxHp', 'attackSpeed', 'critChance', 'accuracy', 'dodge', 'moveSpeed',
  'enemyAttack', 'enemyHp', 'lootChance', 'blueprintChance', 'xpGain',
  'shelterDefense', 'raidDamage', 'healRate', 'craftSpeed', 'ambushChance', 'outdoorDamage',
]);
