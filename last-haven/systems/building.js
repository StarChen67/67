import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { isHome } from '../game/selectors.js';

/**
 * BuildingSystem：設施建造/升級/修理、效果彙總（容量、產出、治療、牆、炮塔、製作站等級、modifier）。
 * 擁有：shelter.buildings。hp 0 = 停用（效果不算、可修理、不會被刪除）。
 */
export class BuildingSystem extends System {
  constructor(ctx) { super(ctx, 'building'); this._overflowLoggedDay = -1; }

  init() {
    this.modifiers.provide('buildings', (key) => {
      const out = [];
      for (const { def, inst } of this.built()) {
        if (!this.isActive(inst)) continue;
        const m = this.levelDef(def, inst.level).effects?.modifiers?.[key];
        if (m) out.push({ mult: m.mult, add: m.add, label: def.name });
      }
      return out;
    });
  }

  get map() { return this.state.shelter.buildings; }
  get(id) { return this.map[id] || null; }
  levelOf(id) { return this.get(id)?.level || 0; }
  isActive(inst) { return !!inst && inst.hp > 0; }
  levelDef(def, level) { return def.levels[Math.max(0, Math.min(def.levels.length, level) - 1)]; }
  maxHpOf(id) { const def = this.registry.building(id), inst = this.get(id); return def && inst ? this.levelDef(def, inst.level).hp : 0; }
  effectsOf(id) { const def = this.registry.building(id), inst = this.get(id); return def && inst && this.isActive(inst) ? this.levelDef(def, inst.level).effects || {} : {}; }
  built() { return Object.keys(this.map).map((id) => ({ id, def: this.registry.building(id), inst: this.map[id] })).filter((x) => x.def); }

  totalEffect(key) {
    let t = 0;
    for (const { id } of this.built()) { const v = this.effectsOf(id)[key]; if (typeof v === 'number') t += v; }
    return t;
  }
  stationLevel(station) {
    let lv = 0;
    for (const { id } of this.built()) { const cs = this.effectsOf(id).craftStation; if (cs && cs.station === station) lv = Math.max(lv, cs.level); }
    return lv;
  }
  workbenchLevel() { return this.stationLevel('workbench'); }
  /** 防禦牆 HP（襲擊用）；牆的 HP 就是建築 HP */
  wall() { const inst = this.get('wall'); return inst && inst.hp > 0 ? inst : null; }
  turretDps() { return this.totalEffect('turretDps'); }

  /** 建造或升級的檢查。回傳 { ok, reasons, def, inst, nextLevel, cost, levelDef } */
  check(id) {
    const def = this.registry.building(id);
    if (!def) return { ok: false, reasons: [{ code: 'unknownBuilding' }] };
    const inst = this.get(id);
    const nextLevel = (inst?.level || 0) + 1;
    const reasons = [];
    if (nextLevel > def.maxLevel) return { ok: false, reasons: [{ code: 'maxLevel' }], def, inst, nextLevel: null, cost: [], levelDef: null };
    const lv = def.levels[nextLevel - 1];
    if (this.state.shelter.level < def.requiresShelterLevel) reasons.push({ code: 'shelterLevel', need: def.requiresShelterLevel, have: this.state.shelter.level });
    if (lv.requiredBlueprintId && !this.systems.blueprint?.has(lv.requiredBlueprintId)) reasons.push({ code: 'blueprint', blueprintId: lv.requiredBlueprintId });
    const missing = this.systems.inventory.missing(lv.cost);
    if (missing.length) reasons.push({ code: 'materials', missing });
    if (this.state.combat) reasons.push({ code: 'inCombat' });
    return { ok: reasons.length === 0, reasons, def, inst, nextLevel, cost: lv.cost, levelDef: lv };
  }

  build(id) {
    const c = this.check(id);
    if (!c.ok) return { ok: false, reason: c.reasons[0].code, reasons: c.reasons };
    if (c.inst) return this.upgrade(id);
    this.systems.inventory.consume(c.cost);
    this.map[id] = { id, level: 1, hp: c.levelDef.hp, acc: 0 };
    this.log(`🏗️ 建造 ${c.def.icon}${c.levelDef.name || c.def.name}`, 'good');
    this.bus.emit(EV.BUILDING_BUILT, { id, level: 1 });
    this.bus.emit(EV.PLAYER_STATS_CHANGED, {});
    return { ok: true, result: { id, level: 1 } };
  }
  upgrade(id) {
    const c = this.check(id);
    if (!c.ok) return { ok: false, reason: c.reasons[0].code, reasons: c.reasons };
    if (!c.inst) return this.build(id);
    this.systems.inventory.consume(c.cost);
    const prevMax = this.maxHpOf(id);
    c.inst.level = c.nextLevel;
    c.inst.hp = Math.min(this.maxHpOf(id), c.inst.hp + Math.max(0, this.maxHpOf(id) - prevMax));
    this.log(`⬆️ ${c.def.icon}${c.def.name} 升級為 Lv.${c.inst.level}${c.levelDef.name ? `（${c.levelDef.name}）` : ''}`, 'good');
    this.bus.emit(EV.BUILDING_UPGRADED, { id, level: c.inst.level });
    return { ok: true, result: { id, level: c.inst.level } };
  }

  damage(id, amount, { source = 'unknown' } = {}) {
    const inst = this.get(id);
    if (!inst || inst.hp <= 0 || !(amount > 0)) return 0;
    const dmg = Math.min(inst.hp, Math.round(amount));
    inst.hp -= dmg;
    this.bus.emit(EV.BUILDING_DAMAGED, { id, hp: inst.hp, damage: dmg, source });
    if (inst.hp <= 0) this.log(`💥 ${this.registry.building(id)?.name} 被摧毀，停止運作（可修理）`, 'bad');
    return dmg;
  }
  /** 隨機挑一個可被攻擊的設施（襲擊用）：非牆、hp>0 */
  targetableBuildings() { return this.built().filter((b) => b.id !== 'wall' && b.inst.hp > 0); }

  repair(id) {
    const inst = this.get(id);
    if (!inst) return { ok: false, reason: 'notFound' };
    const max = this.maxHpOf(id), missing = max - inst.hp;
    if (missing <= 0) return { ok: false, reason: 'fullHp' };
    const rc = this.balance.shelter.buildingRepairCost;
    const have = this.systems.inventory.countAll(rc.itemId);
    const amt = Math.round(Math.min(missing, Math.floor(have / rc.perHp)));
    if (amt <= 0) return { ok: false, reason: 'materials', missing: [{ itemId: rc.itemId, need: Math.ceil(missing * rc.perHp), have }] };
    const cost = { itemId: rc.itemId, qty: Math.ceil(amt * rc.perHp) };
    this.systems.inventory.consume([cost]);
    inst.hp = Math.min(max, inst.hp + amt);
    this.log(`🔧 修理 ${this.registry.building(id)?.name} +${amt} HP（${this.registry.item(cost.itemId)?.name}×${cost.qty}）`, 'good');
    return { ok: true, result: { id, repaired: amt, cost } };
  }

  /** UI 用：全部設施的狀態 */
  list() {
    return this.registry.list('buildings').map((def) => {
      const inst = this.get(def.id);
      const c = this.check(def.id);
      return { def, inst, level: inst?.level || 0, maxHp: inst ? this.maxHpOf(def.id) : 0, active: this.isActive(inst), check: c, effects: inst ? this.levelDef(def, inst.level).effects : null };
    });
  }

  update(dt) {
    const dayLen = this.balance.time.dayLength;
    const home = isHome(this.state) && !this.state.combat;
    let heal = 0;
    for (const { id, def, inst } of this.built()) {
      if (!this.isActive(inst)) continue;
      const eff = this.levelDef(def, inst.level).effects || {};
      for (const [rateKey, itemKey] of [['waterPerDay', 'waterItem'], ['foodPerDay', 'foodItem']]) {
        if (!eff[rateKey] || !eff[itemKey]) continue;
        inst.acc = (inst.acc || 0) + (dt / dayLen) * eff[rateKey];
        while (inst.acc >= 1) {
          inst.acc -= 1;
          const r = this.systems.inventory.add('storage', eff[itemKey], 1);
          if (r.ok) this.bus.emit(EV.BUILDING_PRODUCED, { id, itemId: eff[itemKey], qty: 1 });
          else if (this._overflowLoggedDay !== this.clock.day) { this._overflowLoggedDay = this.clock.day; this.log(`倉庫已滿，${def.name} 的產出被丟棄。`, 'warn'); }
        }
      }
      if (eff.healPerSec) heal += eff.healPerSec;
    }
    if (heal > 0 && home && this.state.player.hp > 0) this.systems.player.heal(heal * dt, { source: 'medical', silent: true });
  }
  onStateLoaded() { this._overflowLoggedDay = -1; }
}
