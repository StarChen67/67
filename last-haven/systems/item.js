import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { isHome } from '../game/selectors.js';

const SCALED = ['attack', 'defense', 'maxHp', 'carry'];

/**
 * ItemSystem：物品定義查詢、實例建立（品質）、裝備數值計算、使用消耗品。
 * 不擁有狀態；實例的存放由 InventorySystem 負責。
 */
export class ItemSystem extends System {
  constructor(ctx) { super(ctx, 'item'); }

  def(id) { return this.registry.item(id); }
  isEquip(id) { return !!this.def(id)?.equip; }
  isStackable(id) { return (this.def(id)?.stackMax || 1) > 1; }

  createInstance(itemId, qty = 1, quality) {
    const def = this.registry.req('items', itemId);
    const inst = { uid: this.uid('it'), itemId, qty: Math.max(1, Math.floor(qty)) };
    if (def.equip) inst.quality = quality || def.quality || 'common';
    else if (quality && quality !== def.quality) inst.quality = quality;
    return inst;
  }

  qualityOf(inst) { return inst.quality || this.def(inst.itemId)?.quality || 'common'; }
  qualityMult(q) { return this.balance.quality.mult[q] ?? 1; }
  qualityLabel(q) { return this.balance.quality.label[q] || q; }
  qualityColor(q) { return this.balance.quality.color[q] || '#fff'; }

  /** 裝備實際數值 = def.equip.stats × 品質倍率（僅 attack/defense/maxHp/carry 縮放） */
  getStats(inst) {
    const def = this.def(inst.itemId);
    if (!def?.equip) return null;
    const mult = this.qualityMult(this.qualityOf(inst));
    const out = {};
    for (const [k, v] of Object.entries(def.equip.stats || {})) {
      out[k] = SCALED.includes(k) ? Math.round(v * mult) : v;
    }
    return out;
  }
  weightOf(inst) { return (this.def(inst.itemId)?.weight || 0) * inst.qty; }

  /** 消耗品類型 */
  isConsumable(id) {
    const d = this.def(id);
    return !!(d && ['food', 'water', 'medicine', 'special'].includes(d.type) && d.effects && d.effects.length);
  }

  /**
   * 使用物品（吃、喝、藥、開寶箱、學圖紙）。回傳 { ok, reason?, result? }。
   * container: 'inventory' | 'storage'
   */
  use(uid, container = 'inventory') {
    const inv = this.systems.inventory;
    const found = inv.find(container, uid) || inv.find(container === 'inventory' ? 'storage' : 'inventory', uid);
    if (!found) return { ok: false, reason: 'notFound' };
    const { inst, container: where } = found;
    if (where === 'storage' && !isHome(this.state)) return { ok: false, reason: 'notHome' }; // 外出時碰不到倉庫
    const def = this.def(inst.itemId);
    if (!def) return { ok: false, reason: 'unknownItem' };
    if (def.subtype === 'chest') {
      if (!this.systems.chest) return { ok: false, reason: 'notImplemented' };
      return this.systems.chest.open(uid, where);
    }
    if (def.type === 'blueprint') {
      if (!this.systems.blueprint) return { ok: false, reason: 'notImplemented' };
      return this.systems.blueprint.learnFromItem(uid, where);
    }
    if (!this.isConsumable(inst.itemId)) return { ok: false, reason: 'notUsable' };
    if (this.state.player.hp <= 0) return { ok: false, reason: 'dead' };
    const before = { hp: this.state.player.hp, hunger: this.state.player.hunger, thirst: this.state.player.thirst };
    this.effects.applyInstant(def.effects, { source: `item:${def.id}` });
    inv.removeByUid(where, uid, 1);
    const p = this.state.player;
    const delta = { hp: Math.round(p.hp - before.hp), hunger: Math.round(p.hunger - before.hunger), thirst: Math.round(p.thirst - before.thirst) };
    this.bus.emit(EV.ITEM_USED, { itemId: def.id, delta, container: where });
    return { ok: true, result: { itemId: def.id, delta } };
  }

  /** 顯示用摘要 */
  describe(inst) {
    const def = this.def(inst.itemId);
    if (!def) return { name: inst.itemId, icon: '❓', lines: [] };
    const lines = [];
    if (def.equip) {
      const s = this.getStats(inst);
      const L = { attack: '攻擊', defense: '防禦', maxHp: '最大生命', attackSpeed: '攻速', critChance: '暴擊率', critDamage: '暴擊傷害', moveSpeed: '移速', carry: '負重', accuracy: '命中', dodge: '閃避', armorPen: '穿甲' };
      for (const [k, v] of Object.entries(s)) {
        const pct = ['critChance', 'moveSpeed', 'accuracy', 'dodge', 'armorPen', 'critDamage'].includes(k);
        lines.push(`${L[k] || k} ${v > 0 ? '+' : ''}${pct ? Math.round(v * 100) + '%' : v}`);
      }
      if (def.equip.ammo) lines.push(`彈藥：${this.def(def.equip.ammo)?.name || def.equip.ammo}`);
      if (def.equip.resist) for (const [k, v] of Object.entries(def.equip.resist)) lines.push(`${this.registry.status(k)?.name || k}抗性 ${Math.round(v * 100)}%`);
    }
    for (const e of def.effects || []) {
      if (e.type === 'hunger') lines.push(`飢餓 ${e.value > 0 ? '+' : ''}${e.value}`);
      else if (e.type === 'thirst') lines.push(`口渴 ${e.value > 0 ? '+' : ''}${e.value}`);
      else if (e.type === 'heal') lines.push(`回復 ${e.value} 生命`);
      else if (e.type === 'status') lines.push(`${e.chance ? Math.round(e.chance * 100) + '% 機率' : ''}${this.registry.status(e.id)?.name || e.id}`);
      else if (e.type === 'cureStatus') lines.push(`治療${this.registry.status(e.id)?.name || e.id}`);
    }
    return { name: def.name, icon: def.icon, lines, quality: this.qualityOf(inst), weight: def.weight, desc: def.desc, type: def.type };
  }
}
