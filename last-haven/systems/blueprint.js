import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { BLUEPRINT_TYPES } from '../core/registry.js';

/**
 * BlueprintSystem：圖紙的發現 / 學習 / 重複拆解（研究點）/ 兌換 / 配方使用權查詢 / 收藏統計。
 * 擁有：state.blueprints = { learned, discovered, researchPoints }。
 */
export class BlueprintSystem extends System {
  constructor(ctx) { super(ctx, 'blueprint'); }

  get bp() { return this.state.blueprints; }
  has(id) { return this.bp.learned.includes(id); }
  isDiscovered(id) { return this.bp.discovered.includes(id) || this.has(id); }
  researchValue(def) { return def.researchValue ?? this.balance.research.byRarity[def.rarity] ?? 5; }

  discover(id) {
    if (!this.registry.blueprint(id)) return false;
    if (!this.bp.discovered.includes(id)) { this.bp.discovered.push(id); return true; }
    return false;
  }

  /** 配方使用權：預設解鎖或已學任一張解鎖它的圖紙 */
  hasRecipe(recipeId) {
    const r = this.registry.recipe(recipeId);
    if (!r) return false;
    if (r.defaultUnlocked) return true;
    return (this.registry.blueprintsByRecipe.get(recipeId) || []).some((id) => this.has(id));
  }
  blueprintsForRecipe(recipeId) { return this.registry.blueprintsByRecipe.get(recipeId) || []; }

  learn(id, { source = 'item' } = {}) {
    const def = this.registry.blueprint(id);
    if (!def) return { ok: false, reason: 'notBlueprint' };
    if (this.has(id)) return { ok: false, reason: 'alreadyLearned' };
    this.bp.learned.push(id);
    this.discover(id);
    this.incStat('blueprintsLearned');
    const names = def.unlockedRecipeIds.map((r) => this.registry.item(this.registry.recipe(r)?.resultItemId)?.name).filter(Boolean);
    const gates = this.gatesOf(id).map((g) => g.label);
    this.log(`📜 學習圖紙「${def.name}」→ 已解鎖：${[...names, ...gates].join('、') || def.name}`, 'good');
    this.bus.emit(EV.BLUEPRINT_LEARNED, { blueprintId: id, recipeIds: def.unlockedRecipeIds, source });
    return { ok: true, result: { blueprintId: id, recipeIds: def.unlockedRecipeIds, gates } };
  }

  /** 在背包／倉庫／地上戰利品堆中找一件物品 */
  _locate(uid, container) {
    const inv = this.systems.inventory;
    const found = (container && container !== 'pile' && inv.find(container, uid)) || inv.findAnywhere(uid);
    if (found) return found;
    const pile = inv.lootPile();
    const inst = pile && pile.find((i) => i.uid === uid);
    return inst ? { inst, container: 'pile' } : null;
  }
  _consume(found, uid) {
    if (found.container === 'pile') this.systems.inventory.dropLoot(uid);
    else this.systems.inventory.removeByUid(found.container, uid, 1);
  }

  /** 從背包/倉庫/地上的圖紙物品學習（消耗 1 張） */
  learnFromItem(uid, container) {
    const found = this._locate(uid, container);
    if (!found) return { ok: false, reason: 'notFound' };
    const def = this.registry.item(found.inst.itemId);
    if (!def || def.type !== 'blueprint') return { ok: false, reason: 'notBlueprint' };
    if (this.has(def.blueprintId)) return { ok: false, reason: 'alreadyLearned' };
    const r = this.learn(def.blueprintId);
    if (r.ok) this._consume(found, uid);
    return r;
  }

  /** 重複（或不想要的）圖紙拆解為研究點 */
  dismantle(uid, container) {
    const found = this._locate(uid, container);
    if (!found) return { ok: false, reason: 'notFound' };
    const def = this.registry.item(found.inst.itemId);
    if (!def || def.type !== 'blueprint') return { ok: false, reason: 'notBlueprint' };
    const bpDef = this.registry.blueprint(def.blueprintId);
    const value = this.researchValue(bpDef);
    this._consume(found, uid);
    this.discover(def.blueprintId);
    this.addResearch(value);
    this.log(`🔬 拆解「${bpDef.name}」圖紙 → 研究點 +${value}（目前 ${this.bp.researchPoints}）`, 'loot');
    this.bus.emit(EV.BLUEPRINT_DISMANTLED, { blueprintId: def.blueprintId, research: value });
    return { ok: true, result: { blueprintId: def.blueprintId, research: value, total: this.bp.researchPoints } };
  }
  addResearch(n) { this.bp.researchPoints = Math.max(0, Math.round(this.bp.researchPoints + n)); return this.bp.researchPoints; }

  redeemCost(id) { const def = this.registry.blueprint(id); return def ? this.researchValue(def) * (this.balance.research.redeemMult || 3) : Infinity; }
  /** 用研究點兌換「已發現但未學習」的圖紙 */
  redeem(id) {
    const def = this.registry.blueprint(id);
    if (!def) return { ok: false, reason: 'notBlueprint' };
    if (this.has(id)) return { ok: false, reason: 'alreadyLearned' };
    if (!this.isDiscovered(id)) return { ok: false, reason: 'notDiscovered' };
    const cost = this.redeemCost(id);
    if (this.bp.researchPoints < cost) return { ok: false, reason: 'research', need: cost, have: this.bp.researchPoints };
    this.bp.researchPoints -= cost;
    return this.learn(id, { source: 'redeem' });
  }

  /** 此圖紙解鎖的建築/避難所升級 */
  gatesOf(id) {
    const out = [];
    for (const s of this.registry.list('shelterLevels')) if (s.requiredBlueprintId === id) out.push({ kind: 'shelter', level: s.level, label: `避難所 Lv.${s.level}` });
    for (const b of this.registry.list('buildings')) b.levels.forEach((lv, i) => { if (lv.requiredBlueprintId === id) out.push({ kind: 'building', id: b.id, level: i + 1, label: `${b.name} Lv.${i + 1}` }); });
    return out;
  }

  /** 圖紙完整資訊（UI 圖紙卡） */
  info(id) {
    const def = this.registry.blueprint(id);
    if (!def) return null;
    const wb = this.systems.building?.workbenchLevel() || 0;
    return {
      def, learned: this.has(id), discovered: this.isDiscovered(id), researchValue: this.researchValue(def), redeemCost: this.redeemCost(id),
      workbenchOk: wb >= def.requiredWorkbenchLevel, currentWorkbench: wb,
      recipes: def.unlockedRecipeIds.map((rid) => this.registry.recipe(rid)).filter(Boolean),
      gates: this.gatesOf(id),
    };
  }

  /** 收藏統計：依類型 */
  collection() {
    const out = [];
    for (const type of BLUEPRINT_TYPES) {
      const all = this.registry.list('blueprints').filter((b) => b.type === type).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
      if (!all.length) continue;
      const entries = all.map((def) => ({ def, status: this.has(def.id) ? 'learned' : this.isDiscovered(def.id) ? 'discovered' : 'unknown' }));
      out.push({ type, total: all.length, learned: entries.filter((e) => e.status === 'learned').length, discovered: entries.filter((e) => e.status !== 'unknown').length, entries });
    }
    return out;
  }
}
