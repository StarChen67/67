import { EV } from './events-catalog.js';
import { isOutdoor } from '../game/selectors.js';

/**
 * EffectRegistry：資料表裡的 `effects[]` 由這裡執行，取代散落各處的 if/else。
 *
 * 兩類效果：
 *  - InstantEffect（value 型）→ applyInstant(effects, opts)
 *  - ContinuousEffect（perSec 型 / modifier）→ 擁有者每步呼叫 tickContinuous(effects, dt, opts)；
 *    modifier 型不在這裡執行，而是由各系統的 modifier provider 讀資料表提供（見 core/modifiers.js）。
 *
 * handler 簽名：(effect, amount, ctx, opts)
 *   amount：即時效果 = effect.value；持續效果 = perSec × dt
 *   opts：{ source, subject?, instant, dt }；subject = 受作用的實體（玩家用 null，敵人用 EnemyInstance）
 * 新增效果型別 = register(type, handler)。
 */
export class EffectRegistry {
  constructor(ctx) {
    this.ctx = ctx;
    this.handlers = new Map();
    registerBuiltins(this);
  }
  register(type, fn) { this.handlers.set(type, fn); }
  has(type) { return this.handlers.has(type); }

  applyInstant(effects, opts = {}) {
    const results = [];
    for (const eff of effects || []) {
      if (!eff || eff.type === 'modifier' || eff.perSec != null) continue;
      if (eff.outdoorOnly && !isOutdoor(this.ctx.state)) continue;
      if (eff.chance != null && !this.ctx.rng.world.chance(eff.chance)) continue;
      const h = this.handlers.get(eff.type);
      if (!h) { this.warn(eff); continue; }
      results.push(h(eff, eff.value, this.ctx, { ...opts, instant: true }));
    }
    return results;
  }

  tickContinuous(effects, dt, opts = {}) {
    if (!effects || !effects.length) return;
    const outdoors = isOutdoor(this.ctx.state);
    for (const eff of effects) {
      if (!eff || eff.perSec == null) continue;
      if (eff.outdoorOnly && !outdoors) continue;
      const h = this.handlers.get(eff.type);
      if (!h) { this.warn(eff); continue; }
      h(eff, eff.perSec * dt * (opts.scale || 1), this.ctx, { ...opts, instant: false, dt });
    }
  }

  /** 從一組 ContinuousEffect 取出 modifier 條目（給 provider 用） */
  static modifiersOf(effects, key, label) {
    const out = [];
    for (const eff of effects || []) if (eff && eff.type === 'modifier' && eff.key === key) out.push({ mult: eff.mult, add: eff.add, label });
    return out;
  }

  warn(eff) {
    if (!this._warned) this._warned = new Set();
    if (this._warned.has(eff.type)) return;
    this._warned.add(eff.type);
    if (typeof console !== 'undefined') console.warn('[EffectRegistry] unknown effect type', eff.type);
  }
}

function registerBuiltins(reg) {
  const S = () => reg.ctx.systems;
  // 對主體造成傷害：subject 為敵人時直接扣血；否則作用於玩家
  reg.register('damage', (eff, amount, ctx, opts) => {
    if (opts.subject && opts.subject.hp != null && opts.subject !== ctx.state.player) {
      return S().combat?.damageEnemy(opts.subject, amount, { source: opts.source, ignoreDefense: true }) ?? (opts.subject.hp = Math.max(0, opts.subject.hp - amount));
    }
    return S().player.damage(amount, { source: opts.source || 'effect', ignoreDefense: eff.ignoreDefense !== false, silent: !opts.instant });
  });
  reg.register('damagePlayer', (eff, amount, ctx, opts) => S().player.damage(amount, { source: opts.source || 'effect', ignoreDefense: eff.ignoreDefense !== false, silent: !opts.instant }));
  reg.register('heal', (eff, amount, ctx, opts) => {
    if (opts.subject && opts.subject.hp != null && opts.subject !== ctx.state.player) { opts.subject.hp = Math.min(opts.subject.maxHp ?? opts.subject.hp, opts.subject.hp + amount); return amount; }
    return S().player.heal(amount, { source: opts.source, silent: !opts.instant });
  });
  reg.register('hunger', (eff, amount) => S().survival.addHunger(amount));
  reg.register('thirst', (eff, amount) => S().survival.addThirst(amount));
  reg.register('status', (eff, amount, ctx, opts) => {
    if (!opts.instant && !ctx.rng.world.chance(amount)) return; // perSec = 每秒套用機率
    return S().statusEffects.apply(eff.id, { duration: eff.duration, stacks: eff.stacks, subject: opts.subject, source: opts.source });
  });
  reg.register('cureStatus', (eff, amount, ctx, opts) => S().statusEffects.remove(eff.id, { subject: opts.subject }));
  reg.register('damageShelter', (eff, amount, ctx, opts) => S().shelter?.damage(amount, { source: opts.source || 'effect', silent: !opts.instant }));
  reg.register('damageBuilding', (eff, amount, ctx, opts) => {
    const B = S().building; if (!B) return 0;
    let id = eff.buildingId;
    if (!id) { const cands = B.targetableBuildings(); if (!cands.length) return 0; id = ctx.rng.world.pick(cands).id; }
    return B.damage(id, amount, { source: opts.source });
  });
  reg.register('grantRandomBlueprint', (eff, amount, ctx, opts) => {
    const id = S().loot?.rollBlueprint({ source: 'forced', areaId: eff.areaId || null });
    if (!id) return null;
    S().loot.deliver({ items: [], chests: [], blueprints: [id], coins: 0 }, { source: opts.source || 'event' });
    return id;
  });
  reg.register('grantItem', (eff, amount, ctx, opts) => S().inventory.grant(eff.itemId, eff.qty ?? 1, { source: opts.source }));
  reg.register('removeItem', (eff) => S().inventory.removeAnywhere(eff.itemId, eff.qty ?? 1));
  reg.register('grantXp', (eff, amount) => S().progression.addXp(amount));
  reg.register('grantCoins', (eff, amount) => S().player.addCoins(amount));
  reg.register('grantResearch', (eff, amount) => S().blueprint?.addResearch(amount));
  reg.register('spawnRaid', (eff) => S().raid?.trigger({ difficultyMult: eff.difficultyMult || 1 }));
  reg.register('spawnCombat', (eff) => S().combat?.startEncounter({ monsterId: eff.monsterId, level: eff.level, count: eff.count || 1, origin: 'event' }));
  reg.register('damageEnemy', (eff, amount, ctx, opts) => S().combat?.damageTarget(amount, { source: opts.source || 'skill' }));
  reg.register('enemyStatus', (eff, amount, ctx) => S().combat?.applyStatusToTarget(eff.id, eff.duration));
  reg.register('flag', (eff, amount, ctx) => { ctx.state.flags[eff.key] = eff.value; });
  reg.register('log', (eff, amount, ctx) => ctx.bus.emit(EV.LOG, { text: eff.text, kind: eff.kind || 'info' }));
}
