import { System } from './base.js';
import { weightedPick, clamp } from '../core/utils.js';

/**
 * EnemySystem：依等級與成長曲線產生怪物實例（生成時快照全部數值）。
 *   stat(L) = base × mult^(L−1) + add × (L−1)   （balance.monsterGrowth，可被 monster.growth 覆寫）
 * 不擁有狀態；實例存放於 combat.enemies / raid.queue / poi.data.enemies。
 */
export class EnemySystem extends System {
  constructor(ctx) { super(ctx, 'enemy'); }

  /** base 為 minLevel 時的數值；只對等級差成長 */
  statAt(base, level, g, minLevel = 1) {
    const d = Math.max(0, level - minLevel);
    return base * Math.pow(g.mult, d) + g.add * d;
  }
  growthFor(def) {
    const G = this.balance.monsterGrowth;
    const o = def.growth || {};
    return { hp: { ...G.hp, ...(o.hp || {}) }, attack: { ...G.attack, ...(o.attack || {}) }, defense: { ...G.defense, ...(o.defense || {}) }, xp: { ...G.xp, ...(o.xp || {}) } };
  }

  /** 預覽某等級的數值（UI／測試用） */
  statsFor(monsterId, level, tierOverride) {
    const def = this.registry.req('monsters', monsterId);
    const m = def.minLevel || 1;
    const L = Math.max(1, Math.round(Math.max(level, m)));
    const g = this.growthFor(def);
    const tier = tierOverride || def.tier;
    const T = this.balance.monsterTier[tier] || this.balance.monsterTier.normal;
    return {
      level: L, tier,
      hp: Math.max(1, Math.round(this.statAt(def.base.hp, L, g.hp, m) * T.hp * this.modifiers.resolve('enemyHp', 1))),
      attack: Math.max(1, Math.round(this.statAt(def.base.attack, L, g.attack, m) * T.attack * this.modifiers.resolve('enemyAttack', 1))),
      defense: Math.max(0, Math.round(this.statAt(def.base.defense, L, g.defense, m) * T.defense)),
      xp: Math.max(1, Math.round(this.statAt(def.base.xp, L, g.xp, m) * T.xp)),
      attackSpeed: def.base.attackSpeed, moveSpeed: def.base.moveSpeed,
      accuracy: def.base.accuracy ?? 0.9, dodge: def.base.dodge ?? 0.03,
    };
  }

  spawn(monsterId, level, { tierOverride, rng } = {}) {
    const def = this.registry.req('monsters', monsterId);
    const s = this.statsFor(monsterId, level, tierOverride);
    const r = rng || this.rng.combat;
    const elitePromoted = tierOverride === 'elite' && def.tier === 'normal';
    return {
      uid: this.uid('en'), defId: monsterId, name: elitePromoted ? `菁英${def.name}` : def.name, icon: def.icon,
      level: s.level, tier: s.tier, hp: s.hp, maxHp: s.hp, attack: s.attack, defense: s.defense,
      attackSpeed: s.attackSpeed, moveSpeed: s.moveSpeed, xp: s.xp, accuracy: s.accuracy, dodge: s.dodge,
      cooldown: this.balance.combat.enemyFirstStrikeDelay + r.range(0, 0.6),
      statusEffects: [],
    };
  }

  /** 為區域某深度產生一組怪物（1～2 隻，依 eliteChance 可能升格菁英） */
  spawnGroup(area, depth, { count, rng, forceElite = false } = {}) {
    const r = rng || this.rng.explore;
    const cfg = this.balance.exploration;
    const pair = Math.min(cfg.pairChanceMax ?? 0.45, (cfg.pairChanceBase ?? 0.12) + (cfg.pairChancePerDepth ?? 0.07) * (depth - 1));
    const n = count ?? (r.chance(pair) ? 2 : 1);
    const out = [];
    for (let i = 0; i < n; i++) {
      const pick = weightedPick(r, area.monsters.filter((mm) => !mm.minDepth || depth >= mm.minDepth));
      if (!pick) break;
      const def = this.registry.monster(pick.monsterId);
      // 等級隨深度遞增：第 1 層 = 區域最低等級（±1），每深一層 +depthLevelStep，不超過區域最高等級 + 深度加成
      const lo = area.levelRange[0] + (depth - 1) * this.balance.exploration.depthLevelStep;
      const hi = Math.min(lo + 1, area.levelRange[1] + Math.max(0, depth - 1));
      const level = clamp(r.int(lo, Math.max(lo, hi)) + (pick.levelOffset || 0), 1, 99);
      const elite = def.tier === 'normal' && (forceElite || r.chance(area.eliteChance || 0));
      out.push(this.spawn(pick.monsterId, level, { tierOverride: elite ? 'elite' : undefined, rng: r }));
    }
    return out;
  }

  spawnBoss(area, depth) {
    if (!area.bossId) return null;
    const level = area.levelRange[1] + (depth - 1) * this.balance.exploration.depthLevelStep;
    return this.spawn(area.bossId, level, { rng: this.rng.explore });
  }
}
