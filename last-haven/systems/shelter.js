import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { stockOf } from '../game/selectors.js';

/**
 * ShelterSystem：避難所等級 / HP / 防禦 / 升級（成本、圖紙）/ 修理 / 食水庫存。
 * 擁有：shelter.level / shelter.hp。
 */
export class ShelterSystem extends System {
  constructor(ctx) { super(ctx, 'shelter'); }

  get level() { return this.state.shelter.level; }
  def(level = this.level) { return this.registry.shelterLevel(level) || this.registry.shelterLevel(1); }
  nextDef() { return this.registry.shelterLevel(this.level + 1) || null; }
  maxHp() { return this.def().maxHp + (this.systems.building?.totalEffect('shelterMaxHp') || 0); }
  defense() {
    const base = this.def().defense + (this.systems.building?.totalEffect('defense') || 0);
    return Math.round(this.modifiers.resolve('shelterDefense', base));
  }
  hpPct() { return this.state.shelter.hp / this.maxHp(); }
  getStock() { return { food: stockOf(this.state, this.registry, 'food'), water: stockOf(this.state, this.registry, 'water') }; }

  costFor(def) {
    const mult = this.balance.shelter.upgradeCostMult || 1;
    return (def?.cost || []).map((c) => ({ itemId: c.itemId, qty: Math.ceil(c.qty * mult) }));
  }

  /** 升級檢查：回傳 { ok, reasons:[{code,...}] }，UI 直接顯示原因 */
  canUpgrade() {
    const next = this.nextDef();
    const reasons = [];
    if (!next) return { ok: false, reasons: [{ code: 'maxLevel' }], next: null, cost: [] };
    const cost = this.costFor(next);
    if (next.requiredBlueprintId && !this.systems.blueprint?.has(next.requiredBlueprintId)) reasons.push({ code: 'blueprint', blueprintId: next.requiredBlueprintId });
    const missing = this.systems.inventory.missing(cost);
    if (missing.length) reasons.push({ code: 'materials', missing });
    if (this.state.combat) reasons.push({ code: 'inCombat' });
    return { ok: reasons.length === 0, reasons, next, cost };
  }

  upgrade() {
    const c = this.canUpgrade();
    if (!c.ok) return { ok: false, reason: c.reasons[0].code, reasons: c.reasons };
    const prevMax = this.maxHp();
    this.systems.inventory.consume(c.cost);
    this.state.shelter.level += 1;
    const gain = this.maxHp() - prevMax;
    this.state.shelter.hp = Math.min(this.maxHp(), this.state.shelter.hp + Math.max(0, gain));
    const def = this.def();
    this.log(`🏠 避難所升級為 Lv.${this.level} ${def.name}！最大 HP ${prevMax}→${this.maxHp()}、防禦 ${this.defense()}${def.unlocks?.length ? `，解鎖：${def.unlocks.map((b) => this.registry.building(b)?.name || b).join('、')}` : ''}`, 'good');
    this.bus.emit(EV.SHELTER_UPGRADED, { level: this.level, unlocks: def.unlocks || [] });
    return { ok: true, result: { level: this.level, unlocks: def.unlocks || [] } };
  }

  damage(amount, { source = 'unknown', silent = false } = {}) {
    const s = this.state.shelter;
    if (!(amount > 0) || s.hp <= 0) return 0;
    const dmg = Math.min(s.hp, Math.round(amount));
    s.hp -= dmg;
    this.bus.emit(EV.SHELTER_DAMAGED, { amount: dmg, hp: s.hp, source, silent });
    if (s.hp <= 0) {
      this.log('💥 避難所核心已被摧毀！', 'bad');
      this.bus.emit(EV.SHELTER_DESTROYED, { source });
    }
    return dmg;
  }

  repairCostFor(amount) {
    const rc = this.balance.shelter.repairCost;
    return { itemId: rc.itemId, qty: Math.ceil(amount * rc.perHp) };
  }
  /** 修理：amount 省略 = 修到滿（受材料限制） */
  repair(amount) {
    const s = this.state.shelter, max = this.maxHp();
    const missing = max - s.hp;
    if (missing <= 0) return { ok: false, reason: 'fullHp' };
    const rc = this.balance.shelter.repairCost;
    const have = this.systems.inventory.countAll(rc.itemId);
    const affordable = Math.floor(have / rc.perHp);
    let amt = Math.min(missing, amount ?? missing, affordable);
    if (amt <= 0) return { ok: false, reason: 'materials', missing: [{ itemId: rc.itemId, need: Math.ceil(Math.min(missing, amount ?? missing) * rc.perHp), have }] };
    amt = Math.round(amt);
    const cost = this.repairCostFor(amt);
    this.systems.inventory.consume([cost]);
    s.hp = Math.min(max, s.hp + amt);
    this.log(`🔧 修理避難所 +${amt} HP（消耗 ${this.registry.item(cost.itemId)?.name}×${cost.qty}）`, 'good');
    this.bus.emit(EV.SHELTER_REPAIRED, { amount: amt, cost });
    return { ok: true, result: { repaired: amt, cost } };
  }

  onNewGame() { this.state.shelter.hp = this.maxHp(); }
}
