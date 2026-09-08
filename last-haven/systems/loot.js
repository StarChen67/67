import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { weightedPick } from '../core/utils.js';

const TIERS = ['common', 'fine', 'rare', 'epic', 'legendary'];

/**
 * LootSystem：Loot Table 擲骰、怪物掉落、寶箱階級、圖紙掉落（唯一管線 rollBlueprint）。
 * 掉落物交付：戰鬥中 → combat.loot；否則 → inventory.grant。
 */
export class LootSystem extends System {
  constructor(ctx) { super(ctx, 'loot'); }

  init() {
    this.bus.on(EV.COMBAT_ENEMY_KILLED, ({ enemy }) => this.dropFor(enemy));
  }

  get cfg() { return this.balance.loot; }
  get bp() { return this.balance.blueprintDrop; }

  currentArea() {
    const ex = this.state.exploration;
    return ex ? this.registry.area(ex.areaId) : null;
  }

  /** 擲一張 Loot Table。回傳 { items:[{itemId,qty}], chests:[tier], blueprints:[id], coins } */
  rollTable(tableId, { level = 1, extraRolls = 0, areaId = null, rng = this.rng.loot, lootMult = 1 } = {}) {
    const table = this.registry.lootTable(tableId);
    const out = { items: [], chests: [], blueprints: [], coins: 0 };
    if (!table) return out;
    const entries = table.entries.filter((e) => !e.minimumEnemyLevel || e.minimumEnemyLevel <= level);
    if (!entries.length) return out;
    const rolls = Math.max(0, Math.round(rng.int(table.rolls[0], table.rolls[1]) * lootMult) + extraRolls);
    for (let i = 0; i < rolls; i++) {
      const e = weightedPick(rng, entries);
      if (!e || e.nothing) continue;
      if (e.itemId) {
        const qty = rng.int(e.minQuantity ?? 1, e.maxQuantity ?? e.minQuantity ?? 1);
        const ex = out.items.find((x) => x.itemId === e.itemId);
        if (ex) ex.qty += qty; else out.items.push({ itemId: e.itemId, qty });
      } else if (e.chest) out.chests.push(e.chest);
      else if (e.blueprint) { const id = this.rollBlueprint({ source: 'forced', areaId }); if (id) out.blueprints.push(id); }
      else if (e.coins) out.coins += rng.int(e.coins[0], e.coins[1]);
    }
    return out;
  }

  /** 依等級把寶箱階級權重往上移（每級 tierShiftPerLevel），Boss 有最低階級 */
  tierWeightsByLevel(weights, level, minTier) {
    const shift = Math.min(0.9, Math.max(0, (level - 1) * this.cfg.tierShiftPerLevel));
    const w = {};
    for (const t of TIERS) w[t] = weights[t] || 0;
    for (let i = 0; i < TIERS.length - 1; i++) {
      const move = w[TIERS[i]] * shift;
      w[TIERS[i]] -= move; w[TIERS[i + 1]] += move;
    }
    if (minTier) { const mi = TIERS.indexOf(minTier); for (let i = 0; i < mi; i++) { w[TIERS[mi]] += w[TIERS[i]]; w[TIERS[i]] = 0; } }
    return w;
  }

  rollChestTier(weights, level, minTier, rng = this.rng.loot) {
    return weightedPick(rng, this.tierWeightsByLevel(weights, level, minTier)) || 'common';
  }

  /** 怪物死亡掉落 → 交付 */
  dropFor(enemy) {
    const def = this.registry.monster(enemy.defId);
    if (!def) return null;
    const rng = this.rng.loot;
    const area = this.currentArea();
    const T = this.balance.monsterTier[enemy.tier] || this.balance.monsterTier.normal;
    const lootMult = this.modifiers.resolve('lootChance', 1) * this.cfg.dropChanceMult;
    const res = this.rollTable(def.lootTableId, { level: enemy.level, extraRolls: T.lootRolls || 0, areaId: area?.id, rng, lootMult });
    // 金錢
    if (def.coins) res.coins += rng.int(def.coins[0], def.coins[1]);
    // 寶箱
    const cd = def.chestDrop || this.cfg.defaultChestDrop[enemy.tier] || this.cfg.defaultChestDrop.normal;
    if (rng.chance(Math.min(1, cd.chance * this.cfg.chestChanceMult * lootMult))) res.chests.push(this.rollChestTier(cd.tierWeights, enemy.level, cd.minTier, rng));
    // 圖紙
    const bpId = this.rollBlueprint({ source: 'enemy', areaId: area?.id, monster: def, tier: enemy.tier });
    if (bpId) res.blueprints.push(bpId);
    this.deliver(res, { source: `monster:${def.id}` });
    return res;
  }

  /** 交付掉落結果：戰鬥中進 combat.loot，否則 grant */
  deliver(res, { source = 'loot' } = {}) {
    const c = this.state.combat;
    const push = (itemId, qty) => {
      if (c) c.loot.push(this.systems.item.createInstance(itemId, qty));
      else this.systems.inventory.grant(itemId, qty, { source });
    };
    for (const it of res.items) push(it.itemId, it.qty);
    for (const tier of res.chests) { push(`chest_${tier}`, 1); this.bus.emit(EV.CHEST_FOUND, { tier, source }); this.log(`💰 發現了 ${this.registry.chest(tier)?.name || tier}！`, 'loot'); }
    for (const id of res.blueprints) {
      push(id, 1);
      this.systems.blueprint?.discover(id, { source });
      this.bus.emit(EV.BLUEPRINT_FOUND, { blueprintId: id, source });
      this.log(`📜 你發現了一張圖紙：${this.registry.blueprint(id)?.name || id}！`, 'loot');
    }
    if (res.coins > 0) { this.systems.player.addCoins(res.coins); if (c) c.coins += res.coins; }
    if (res.items.length || res.chests.length || res.blueprints.length || res.coins) {
      this.bus.emit(EV.LOOT_DROPPED, { items: res.items, chests: res.chests, blueprints: res.blueprints, coins: res.coins, source });
    }
    return res;
  }

  /**
   * 圖紙擲骰（唯一管線，見 DATA_MODEL §4）。
   * source: 'enemy' | 'resource' | 'chest' | 'forced'
   * 回傳 blueprintId 或 null。
   */
  rollBlueprint({ source, areaId = null, monster = null, tier = 'normal', chest = null, rng = this.rng.loot } = {}) {
    if (!this.registry.blueprints.size) return null;
    const area = areaId ? this.registry.area(areaId) : null;
    if (source !== 'forced') {
      let chance = source === 'chest' ? (chest?.blueprintChance ?? this.bp.chest) : (this.bp[source] ?? 0);
      if (tier === 'elite') chance *= this.bp.eliteMult;
      if (tier === 'boss') chance *= this.bp.bossMult;
      chance *= 1 + this.bp.areaLevelModifier * (area?.danger || 0);
      chance *= monster?.blueprintChanceMult ?? 1;
      chance = this.modifiers.resolve('blueprintChance', chance);
      if (!rng.chance(Math.min(1, chance))) return null;
    }
    const typeWeights = monster?.blueprintTypeOverride || area?.blueprintPool || this.bp.typeWeights;
    const levelWeights = { ...(chest?.blueprintLevelWeights || area?.blueprintLevelWeights || this.bp.levelWeights) };
    if (monster?.blueprintLevelBonus) {
      for (const k of Object.keys(levelWeights)) { const nk = Math.min(5, Number(k) + monster.blueprintLevelBonus); if (nk !== Number(k)) { levelWeights[nk] = (levelWeights[nk] || 0) + levelWeights[k]; delete levelWeights[k]; } }
    }
    const rarityWeights = chest?.rarityWeights || this.bp.rarityWeights;
    const type = weightedPick(rng, typeWeights);
    const level = Number(weightedPick(rng, levelWeights)) || 1;
    const all = this.registry.list('blueprints');
    const eligible = (b) => (!b.dropLocations?.length || !areaId || b.dropLocations.includes(areaId)) && (!b.minimumAreaLevel || !area || b.minimumAreaLevel <= area.danger);
    const tryPick = (filter) => {
      const cands = all.filter((b) => eligible(b) && filter(b));
      if (!cands.length) return null;
      return weightedPick(rng, cands, (b) => rarityWeights[b.rarity] || 1)?.id || null;
    };
    return tryPick((b) => b.type === type && b.level === level)
      || tryPick((b) => b.type === type && Math.abs(b.level - level) === 1)
      || tryPick((b) => b.level === level)
      || tryPick((b) => Math.abs(b.level - level) <= 1)
      || tryPick(() => true);
  }
}
