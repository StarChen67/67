import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { isHome } from '../game/selectors.js';

/**
 * InventorySystem：背包（inventory.items）與倉庫（shelter.storage.items）。
 * 容量以重量計，軟上限：超過時不能再放入，不會銷毀既有物品；已裝備物品不計重。
 */
export class InventorySystem extends System {
  constructor(ctx) { super(ctx, 'inventory'); }

  items(container) {
    if (container === 'inventory') return this.state.inventory.items;
    if (container === 'storage') return this.state.shelter.storage.items;
    throw new Error(`unknown container ${container}`);
  }
  otherContainer(c) { return c === 'inventory' ? 'storage' : 'inventory'; }

  weightOf(items) {
    let w = 0;
    for (const it of items) w += (this.registry.item(it.itemId)?.weight || 0) * it.qty;
    return Math.round(w * 100) / 100;
  }
  weight(container) { return this.weightOf(this.items(container)); }
  carryCapacity() { return Math.round(this.modifiers.resolve('carryCapacity', this.balance.inventory.baseCarry)); }
  storageCapacity() {
    const lv = this.registry.shelterLevel(this.state.shelter.level) || this.registry.shelterLevel(1);
    let base = lv.storageCapacity;
    if (this.systems.building) base += this.systems.building.totalEffect('storage');
    return Math.round(this.modifiers.resolve('storageCapacity', base));
  }
  capacity(container) { return container === 'inventory' ? this.carryCapacity() : this.storageCapacity(); }
  free(container) { return this.capacity(container) - this.weight(container); }
  isOver(container) { return this.weight(container) > this.capacity(container) + 1e-9; }

  count(container, itemId) {
    let n = 0;
    for (const it of this.items(container)) if (it.itemId === itemId) n += it.qty;
    return n;
  }
  countAll(itemId) { return this.count('inventory', itemId) + this.count('storage', itemId); }
  has(container, itemId, qty = 1) { return this.count(container, itemId) >= qty; }
  hasAll(container, costs) { return (costs || []).every((c) => this.has(container, c.itemId, c.qty)); }
  /** 缺少清單（倉庫為主，背包可補） */
  missing(costs, containers = ['storage', 'inventory']) {
    const out = [];
    for (const c of costs || []) {
      let have = 0;
      for (const k of containers) have += this.count(k, c.itemId);
      if (have < c.qty) out.push({ itemId: c.itemId, need: c.qty, have });
    }
    return out;
  }
  find(container, uid) {
    const inst = this.items(container).find((i) => i.uid === uid);
    return inst ? { inst, container } : null;
  }
  findAnywhere(uid) { return this.find('inventory', uid) || this.find('storage', uid); }

  /**
   * 加入物品。回傳 { ok, added, leftover, inst }。堆疊物合併到同品質同 id 的堆；裝備各自一格。
   * force=true 忽略容量（卸裝備、退款用）。
   */
  add(container, itemId, qty = 1, { quality, force = false, instance } = {}) {
    const def = this.registry.item(itemId);
    if (!def || !(qty > 0)) return { ok: false, added: 0, leftover: qty, reason: 'unknownItem' };
    const list = this.items(container);
    qty = Math.floor(qty);
    let canAdd = qty;
    if (!force) {
      const free = this.free(container);
      const perUnit = def.weight || 0;
      canAdd = perUnit > 0 ? Math.min(qty, Math.floor((free + 1e-9) / perUnit)) : qty;
      if (canAdd <= 0) return { ok: false, added: 0, leftover: qty, reason: 'overweight' };
    }
    let remaining = canAdd;
    let last = null;
    if (def.stackMax > 1) {
      const q = quality || (instance && instance.quality);
      for (const it of list) {
        if (remaining <= 0) break;
        if (it.itemId !== itemId || (it.quality || null) !== (q || null)) continue;
        const room = def.stackMax - it.qty;
        if (room <= 0) continue;
        const n = Math.min(room, remaining);
        it.qty += n; remaining -= n; last = it;
      }
      while (remaining > 0) {
        const n = Math.min(def.stackMax, remaining);
        const inst = this.systems.item.createInstance(itemId, n, q);
        list.push(inst); remaining -= n; last = inst;
      }
    } else {
      // 裝備：每件一格
      if (instance && instance.itemId === itemId) { list.push(instance); remaining -= 1; last = instance; }
      while (remaining > 0) {
        const inst = this.systems.item.createInstance(itemId, 1, quality);
        list.push(inst); remaining -= 1; last = inst;
      }
    }
    this.bus.emit(EV.INVENTORY_CHANGED, { container });
    return { ok: canAdd === qty, added: canAdd, leftover: qty - canAdd, inst: last, reason: canAdd === qty ? undefined : 'overweight' };
  }

  /** 放入既有實例（保留 uid/品質）。 */
  addInstance(container, inst, { force = false } = {}) {
    const def = this.registry.item(inst.itemId);
    if (!def) return { ok: false, added: 0, leftover: inst.qty };
    if (def.stackMax > 1) return this.add(container, inst.itemId, inst.qty, { quality: inst.quality, force });
    if (!force && this.free(container) + 1e-9 < (def.weight || 0)) return { ok: false, added: 0, leftover: 1, reason: 'overweight' };
    this.items(container).push(inst);
    this.bus.emit(EV.INVENTORY_CHANGED, { container });
    return { ok: true, added: 1, leftover: 0, inst };
  }

  remove(container, itemId, qty = 1) {
    const list = this.items(container);
    let left = Math.floor(qty);
    for (let i = list.length - 1; i >= 0 && left > 0; i--) {
      const it = list[i];
      if (it.itemId !== itemId) continue;
      const n = Math.min(it.qty, left);
      it.qty -= n; left -= n;
      if (it.qty <= 0) list.splice(i, 1);
    }
    const removed = Math.floor(qty) - left;
    if (removed > 0) this.bus.emit(EV.INVENTORY_CHANGED, { container });
    return removed;
  }
  removeByUid(container, uid, qty = Infinity) {
    const list = this.items(container);
    const i = list.findIndex((it) => it.uid === uid);
    if (i < 0) return 0;
    const it = list[i];
    const n = Math.min(it.qty, qty);
    it.qty -= n;
    if (it.qty <= 0) list.splice(i, 1);
    this.bus.emit(EV.INVENTORY_CHANGED, { container });
    return n;
  }
  /** 取出（不銷毀）一個實例或其中 qty 個，回傳新的獨立實例 */
  takeByUid(container, uid, qty = Infinity) {
    const found = this.find(container, uid);
    if (!found) return null;
    const { inst } = found;
    const n = Math.min(inst.qty, qty);
    if (n >= inst.qty) {
      const list = this.items(container);
      list.splice(list.indexOf(inst), 1);
      this.bus.emit(EV.INVENTORY_CHANGED, { container });
      return inst;
    }
    inst.qty -= n;
    this.bus.emit(EV.INVENTORY_CHANGED, { container });
    const copy = { ...inst, uid: this.uid('it'), qty: n };
    return copy;
  }
  removeAnywhere(itemId, qty = 1) {
    let left = qty;
    left -= this.remove('inventory', itemId, left);
    if (left > 0) left -= this.remove('storage', itemId, left);
    return qty - left;
  }
  /** 依成本扣除：先倉庫後背包（製作/建造用）。呼叫前請先確認足夠。 */
  consume(costs, containers = ['storage', 'inventory']) {
    for (const c of costs || []) {
      let left = c.qty;
      for (const k of containers) { if (left <= 0) break; left -= this.remove(k, c.itemId, left); }
    }
  }

  /** 轉移 qty 個（預設整堆）到另一容器，受容量限制。 */
  transfer(from, uid, qty = Infinity, to) {
    to = to || this.otherContainer(from);
    const found = this.find(from, uid);
    if (!found) return { ok: false, reason: 'notFound' };
    const { inst } = found;
    const def = this.registry.item(inst.itemId);
    const n = Math.min(inst.qty, qty);
    const perUnit = def.weight || 0;
    const can = perUnit > 0 ? Math.min(n, Math.floor((this.free(to) + 1e-9) / perUnit)) : n;
    if (can <= 0) return { ok: false, reason: 'overweight', moved: 0 };
    const taken = this.takeByUid(from, uid, can);
    const r = this.addInstance(to, taken, { force: true });
    return { ok: can === n, moved: can, leftover: n - can, reason: can === n ? undefined : 'overweight', inst: r.inst };
  }
  /** 把背包全部存入倉庫（放不下的留在背包） */
  depositAll() {
    let moved = 0, blocked = 0;
    for (const it of [...this.items('inventory')]) {
      const r = this.transfer('inventory', it.uid, Infinity, 'storage');
      moved += r.moved || 0;
      if (!r.ok) blocked++;
    }
    return { moved, blocked };
  }

  /**
   * 給予物品（效果、產出、掉落）：在家 → 倉庫，滿則背包；在外 → 背包，滿則戰利品暫存區。
   */
  grant(itemId, qty = 1, { quality, source } = {}) {
    let leftover = qty;
    const order = isHome(this.state) ? ['storage', 'inventory'] : ['inventory'];
    for (const c of order) {
      if (leftover <= 0) break;
      const r = this.add(c, itemId, leftover, { quality });
      leftover = r.leftover;
    }
    if (leftover > 0) {
      const inst = this.systems.item.createInstance(itemId, leftover, quality);
      const pile = this.lootPile();
      if (pile) pile.push(inst); else this.add('inventory', itemId, leftover, { quality, force: true });
    }
    this.bus.emit(EV.LOOT_DROPPED, { items: [{ itemId, qty }], source, leftover });
    return { ok: true, leftover };
  }
  /** 目前可用的戰利品暫存區（戰鬥中 → combat.loot；探索中 → exploration.lootPile；否則 null） */
  lootPile() {
    if (this.state.combat) return this.state.combat.loot;
    if (this.state.exploration) return this.state.exploration.lootPile;
    return null;
  }
  /** 從暫存區撿起 */
  takeLoot(uid, qty = Infinity) {
    const pile = this.lootPile();
    if (!pile) return { ok: false, reason: 'noPile' };
    const i = pile.findIndex((it) => it.uid === uid);
    if (i < 0) return { ok: false, reason: 'notFound' };
    const inst = pile[i];
    const def = this.registry.item(inst.itemId);
    const n = Math.min(inst.qty, qty);
    const perUnit = def?.weight || 0;
    const can = perUnit > 0 ? Math.min(n, Math.floor((this.free('inventory') + 1e-9) / perUnit)) : n;
    if (can <= 0) return { ok: false, reason: 'overweight' };
    if (can >= inst.qty) { pile.splice(i, 1); this.addInstance('inventory', inst, { force: true }); }
    else { inst.qty -= can; this.add('inventory', inst.itemId, can, { quality: inst.quality, force: true }); }
    return { ok: true, moved: can, leftover: n - can };
  }
  takeAllLoot() {
    const pile = this.lootPile();
    if (!pile) return { moved: 0, blocked: 0 };
    let moved = 0, blocked = 0;
    for (const it of [...pile]) { const r = this.takeLoot(it.uid); if (r.ok) moved += r.moved; else blocked++; }
    return { moved, blocked };
  }
  dropLoot(uid) {
    const pile = this.lootPile();
    if (!pile) return false;
    const i = pile.findIndex((it) => it.uid === uid);
    if (i < 0) return false;
    pile.splice(i, 1);
    return true;
  }
}
