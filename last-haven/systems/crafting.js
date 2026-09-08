import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { isHome } from '../game/selectors.js';
import { weightedPick } from '../core/utils.js';

const QUALITY_ORDER = ['common', 'fine', 'rare', 'epic', 'legendary'];
export const STATION_LABEL = { workbench: '工作台', medical: '醫療站', purifier: '淨水器', kitchen: '廚房' };

/**
 * CraftingSystem：五重檢查（圖紙 → 製作站等級 → 材料 → 其他條件 → 玩家等級）與製作佇列。
 * 擁有：state.crafting.queue。材料排入時扣除、取消退回、完成時擲品質；成品進倉庫（滿則背包）；只在家時進行。
 */
export class CraftingSystem extends System {
  constructor(ctx) { super(ctx, 'crafting'); }

  get queue() { return this.state.crafting.queue; }

  /** 五重檢查。回傳 { ok, reasons:[...], recipe, cost } */
  check(recipeId, qty = 1) {
    const r = this.registry.recipe(recipeId);
    if (!r) return { ok: false, reasons: [{ code: 'unknownRecipe' }], recipe: null, cost: [] };
    const reasons = [];
    // 1. 圖紙
    if (!this.systems.blueprint.hasRecipe(recipeId)) reasons.push({ code: 'blueprint', blueprintIds: this.systems.blueprint.blueprintsForRecipe(recipeId) });
    // 2. 製作站等級
    if (r.requiredStation) {
      const have = this.systems.building.stationLevel(r.requiredStation.station);
      if (have < r.requiredStation.level) reasons.push({ code: 'station', station: r.requiredStation.station, need: r.requiredStation.level, have });
    }
    // 3. 材料
    const cost = r.requiredItems.map((c) => ({ itemId: c.itemId, qty: c.qty * qty }));
    const missing = this.systems.inventory.missing(cost);
    if (missing.length) reasons.push({ code: 'materials', missing });
    // 4. 其他條件（設施 / 旗標 / 電力 / 避難所等級）
    for (const cond of r.conditions || []) {
      if (cond.type === 'building' && this.systems.building.levelOf(cond.id) < (cond.level || 1)) reasons.push({ code: 'condition', detail: `需要 ${this.registry.building(cond.id)?.name || cond.id} Lv.${cond.level || 1}` });
      else if (cond.type === 'flag' && !this.state.flags[cond.key]) reasons.push({ code: 'condition', detail: cond.label || cond.key });
      else if (cond.type === 'power' && this.systems.building.totalEffect('power') < cond.value) reasons.push({ code: 'condition', detail: `需要電力 ${cond.value}` });
      else if (cond.type === 'shelterLevel' && this.state.shelter.level < cond.value) reasons.push({ code: 'condition', detail: `需要避難所 Lv.${cond.value}` });
    }
    // 5. 玩家等級
    if (r.requiredLevel && this.state.player.level < r.requiredLevel) reasons.push({ code: 'level', need: r.requiredLevel, have: this.state.player.level });
    return { ok: reasons.length === 0, reasons, recipe: r, cost };
  }

  craft(recipeId, qty = 1) {
    qty = Math.max(1, Math.floor(qty));
    const c = this.check(recipeId, qty);
    if (!c.ok) return { ok: false, reason: c.reasons[0].code, reasons: c.reasons };
    this.systems.inventory.consume(c.cost);
    const total = c.recipe.craftingTime * qty;
    const job = { uid: this.uid('job'), recipeId, qty, left: total, total };
    this.queue.push(job);
    this.bus.emit(EV.CRAFT_QUEUED, { recipeId, qty, uid: job.uid });
    if (total <= 0) this.complete(job);
    else this.log(`🔨 開始製作 ${this.registry.item(c.recipe.resultItemId)?.name}${qty > 1 ? ` ×${qty}` : ''}（${Math.round(total)} 秒）`, 'info');
    return { ok: true, result: { uid: job.uid, recipeId, qty, time: total } };
  }

  cancel(uid) {
    const i = this.queue.findIndex((j) => j.uid === uid);
    if (i < 0) return { ok: false, reason: 'notFound' };
    const job = this.queue[i];
    const r = this.registry.recipe(job.recipeId);
    this.queue.splice(i, 1);
    for (const c of r.requiredItems) this.systems.inventory.grant(c.itemId, c.qty * job.qty, { source: 'refund' });
    this.log(`取消製作 ${this.registry.item(r.resultItemId)?.name}，材料已退回。`, 'warn');
    return { ok: true };
  }

  rollQuality(recipe) {
    const item = this.registry.item(recipe.resultItemId);
    if (!item?.equip) return undefined;
    const wb = this.systems.building.workbenchLevel();
    const base = this.balance.craftQuality.byWorkbenchLevel[Math.min(5, wb)] || { common: 100 };
    const bpIds = this.systems.blueprint.blueprintsForRecipe(recipe.id).filter((id) => this.systems.blueprint.has(id));
    const rarity = bpIds.map((id) => this.registry.blueprint(id).rarity).sort((a, b) => QUALITY_ORDER.indexOf(b) - QUALITY_ORDER.indexOf(a))[0] || 'common';
    const shift = this.balance.craftQuality.blueprintRarityShift[rarity] || 0;
    const w = {};
    for (const [q, v] of Object.entries(base)) { const i = Math.min(4, QUALITY_ORDER.indexOf(q) + shift); w[QUALITY_ORDER[i]] = (w[QUALITY_ORDER[i]] || 0) + v; }
    const q = weightedPick(this.rng.craft, w) || 'common';
    // 不低於物品本身的基礎品質
    return QUALITY_ORDER.indexOf(q) > QUALITY_ORDER.indexOf(item.quality || 'common') ? q : item.quality || 'common';
  }

  complete(job) {
    const r = this.registry.recipe(job.recipeId);
    const i = this.queue.indexOf(job); if (i >= 0) this.queue.splice(i, 1);
    const made = [];
    for (let n = 0; n < job.qty; n++) {
      const quality = this.rollQuality(r);
      let res = this.systems.inventory.add('storage', r.resultItemId, r.resultQty, { quality });
      if (res.leftover > 0) this.systems.inventory.add('inventory', r.resultItemId, res.leftover, { quality, force: true });
      made.push({ itemId: r.resultItemId, qty: r.resultQty, quality });
    }
    this.incStat('crafted', job.qty);
    const item = this.registry.item(r.resultItemId);
    this.log(`✅ 製作完成：${item?.icon}${item?.name}${made[0].quality && made[0].quality !== 'common' ? `（${this.systems.item.qualityLabel(made[0].quality)}）` : ''} ×${r.resultQty * job.qty}`, 'good');
    this.bus.emit(EV.CRAFT_DONE, { recipeId: r.id, items: made });
  }

  update(dt) {
    if (!this.queue.length || !isHome(this.state) || this.state.combat) return;
    const job = this.queue[0];
    job.left -= dt * this.modifiers.resolve('craftSpeed', 1);
    if (job.left <= 0) this.complete(job);
  }

  /** UI 用：配方清單（依分類）含檢查結果 */
  list(category = 'all') {
    const TAB = { weapon: 'weapon', ammo: 'weapon', armor: 'armor', tool: 'tool', material: 'tool', food: 'tool', medicine: 'medicine', shelter: 'shelter', defense: 'defense', special: 'special' };
    return this.registry.list('recipes')
      .filter((r) => category === 'all' || TAB[r.category] === category)
      .map((r) => ({ recipe: r, item: this.registry.item(r.resultItemId), check: this.check(r.id), known: this.systems.blueprint.hasRecipe(r.id) }))
      .sort((a, b) => (b.known - a.known) || (a.recipe.requiredStation?.level || 0) - (b.recipe.requiredStation?.level || 0));
  }
}
