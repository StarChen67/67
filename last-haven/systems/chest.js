import { System } from './base.js';
import { EV } from '../core/events-catalog.js';

/**
 * ChestSystem：寶箱是物品（chest_<tier>），可帶回家再開。open() 擲 Loot Table + 金錢 + 圖紙。
 */
export class ChestSystem extends System {
  constructor(ctx) { super(ctx, 'chest'); }

  open(uid, container) {
    const inv = this.systems.inventory;
    let found = container ? inv.find(container, uid) : null;
    if (!found) found = inv.findAnywhere(uid);
    let fromPile = false;
    if (!found) {
      const pile = inv.lootPile();
      const inst = pile && pile.find((i) => i.uid === uid);
      if (inst) { found = { inst, container: null }; fromPile = true; }
    }
    if (!found) return { ok: false, reason: 'notFound' };
    const def = this.registry.item(found.inst.itemId);
    if (!def || def.subtype !== 'chest') return { ok: false, reason: 'notChest' };
    const chest = this.registry.chest(def.chestTier);
    if (!chest) return { ok: false, reason: 'notChest' };
    const rng = this.rng.loot;
    const ex = this.state.exploration;
    const area = ex ? this.registry.area(ex.areaId) : null;
    const level = Math.max(this.state.player.level, area ? area.levelRange[0] : 1);
    const res = this.systems.loot.rollTable(chest.lootTableId, { level, areaId: area?.id, rng });
    res.coins += rng.int(chest.coins[0], chest.coins[1]);
    const bpId = this.systems.loot.rollBlueprint({ source: 'chest', areaId: area?.id, chest, rng });
    if (bpId) res.blueprints.push(bpId);
    // 消耗寶箱
    if (fromPile) inv.dropLoot(uid); else inv.removeByUid(found.container, uid, 1);
    this.incStat('chestsOpened');
    this.systems.loot.deliver(res, { source: `chest:${chest.tier}` });
    this.log(`${chest.icon} 打開${chest.name}：${res.items.map((i) => `${this.registry.item(i.itemId)?.name}×${i.qty}`).join('、') || '空空如也'}${res.coins ? `、💰${res.coins}` : ''}`, 'loot');
    this.bus.emit(EV.CHEST_OPENED, { tier: chest.tier, items: res.items, coins: res.coins, blueprints: res.blueprints, chests: res.chests });
    return { ok: true, result: { tier: chest.tier, ...res } };
  }
}
