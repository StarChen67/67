import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { SLOTS } from '../core/registry.js';

/**
 * EquipmentSystem：五個裝備槽。擁有 player.equipment。
 * 裝備數值透過 getBonus() 彙總給 Player.getStats()；負重加成透過 modifier provider 'equipment'。
 */
export class EquipmentSystem extends System {
  constructor(ctx) { super(ctx, 'equipment'); }

  init() {
    this.modifiers.provide('equipment', (key) => {
      if (key !== 'carryCapacity') return null;
      const b = this.getBonus();
      return b.carry ? [{ add: b.carry, label: '裝備' }] : null;
    });
  }

  slots() { return SLOTS; }
  get(slot) { return this.state.player.equipment[slot] || null; }
  all() { return SLOTS.map((slot) => ({ slot, inst: this.get(slot) })); }

  /** 彙總所有裝備數值 */
  getBonus() {
    const out = { resist: {} };
    for (const slot of SLOTS) {
      const inst = this.get(slot);
      if (!inst) continue;
      const stats = this.systems.item.getStats(inst) || {};
      for (const [k, v] of Object.entries(stats)) {
        // 武器的攻速是「取代」基礎攻速而非相加；其他裝備的攻速為加成
        if (k === 'attackSpeed' && slot === 'weapon') { out.weaponAttackSpeed = v; continue; }
        out[k] = (out[k] || 0) + v;
      }
      const def = this.registry.item(inst.itemId);
      for (const [k, v] of Object.entries(def?.equip?.resist || {})) out.resist[k] = Math.min(0.9, (out.resist[k] || 0) + v);
    }
    return out;
  }

  weapon() {
    const inst = this.get('weapon');
    if (!inst) return null;
    const def = this.registry.item(inst.itemId);
    return { inst, def, ammo: def?.equip?.ammo || null, stats: this.systems.item.getStats(inst) };
  }

  /** 從背包或倉庫裝備 uid；舊裝備回到來源容器（強制放入，容量軟上限）。 */
  equip(uid) {
    const inv = this.systems.inventory;
    const found = inv.findAnywhere(uid);
    if (!found) return { ok: false, reason: 'notFound' };
    const def = this.registry.item(found.inst.itemId);
    if (!def?.equip) return { ok: false, reason: 'notEquipment' };
    const slot = def.equip.slot;
    const taken = inv.takeByUid(found.container, uid, 1);
    const old = this.get(slot);
    this.state.player.equipment[slot] = taken;
    if (old) inv.addInstance(found.container, old, { force: true });
    this.bus.emit(EV.EQUIPMENT_CHANGED, { slot, itemId: taken.itemId, previous: old?.itemId || null });
    this.bus.emit(EV.PLAYER_STATS_CHANGED, {});
    return { ok: true, result: { slot, itemId: taken.itemId, previous: old?.itemId || null } };
  }

  unequip(slot, to) {
    const inv = this.systems.inventory;
    const inst = this.get(slot);
    if (!inst) return { ok: false, reason: 'empty' };
    const container = to || (this.state.exploration ? 'inventory' : 'storage');
    this.state.player.equipment[slot] = null;
    inv.addInstance(container, inst, { force: true });
    this.bus.emit(EV.EQUIPMENT_CHANGED, { slot, itemId: null, previous: inst.itemId });
    this.bus.emit(EV.PLAYER_STATS_CHANGED, {});
    return { ok: true, result: { slot, itemId: inst.itemId, container } };
  }
}
