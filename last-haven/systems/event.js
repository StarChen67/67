import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { getLocation, evalPredicates } from '../game/selectors.js';
import { weightedPick } from '../core/utils.js';

/**
 * EventSystem：世界事件的觸發（隨機 / 條件）、冷卻、選項與到期預設、持續事件。
 * 擁有：state.events = { active, pending, cooldownUntil, log }、state.flags。
 */
export class EventSystem extends System {
  constructor(ctx) { super(ctx, 'event'); }

  init() {
    this.bus.on(EV.CLOCK_HOUR, () => this.onHour());
  }

  get cfg() { return this.balance.event || { chancePerHour: 0.12 }; }
  get st() { return this.state.events; }

  eligible(kind) {
    const day = this.clock.day, t = this.clock.time, loc = getLocation(this.state);
    return this.registry.list('events').filter((e) => {
      const tr = e.trigger || {};
      if (tr.type !== kind) return false;
      if ((tr.minDay || 1) > day) return false;
      if (tr.location && !tr.location.includes(loc)) return false;
      if ((this.st.cooldownUntil[e.id] || 0) > t) return false;
      if (this.st.pending && this.st.pending.id === e.id) return false;
      if (tr.conditions && !evalPredicates(this.state, this.ctx, tr.conditions)) return false;
      return true;
    });
  }

  onHour() {
    if (this.state.player.hp <= 0 || this.state.gameOver) return;
    // 條件事件：成立即觸發
    for (const e of this.eligible('condition')) if (this.rng.world.chance(e.probability ?? 1)) this.trigger(e.id);
    // 隨機事件：每小時一次機率，抽一個
    if (this.st.pending) return;
    if (this.rng.world.chance(this.cfg.chancePerHour)) {
      const pick = weightedPick(this.rng.world, this.eligible('random'));
      if (pick && this.rng.world.chance(pick.probability ?? 1)) this.trigger(pick.id);
    }
  }

  trigger(id, { force = false } = {}) {
    const def = this.registry.event(id);
    if (!def) return { ok: false, reason: 'unknownEvent' };
    if (!force && (this.st.cooldownUntil[id] || 0) > this.clock.time) return { ok: false, reason: 'cooldown' };
    this.st.cooldownUntil[id] = this.clock.time + (def.cooldown || 0);
    this.log(`${def.icon} ${def.name}：${def.desc}`, 'system');
    this.st.log.push({ id, at: this.clock.time });
    if (this.st.log.length > 50) this.st.log.shift();
    if (def.choices?.length) {
      if (this.st.pending) return { ok: false, reason: 'busy' };
      this.st.pending = { id, expiresAt: this.clock.time + (def.expiresIn || 120), defaultChoiceId: def.defaultChoiceId || def.choices[def.choices.length - 1].id };
      this.bus.emit(EV.EVENT_TRIGGERED, { id, choices: def.choices.map((c) => c.id) });
      return { ok: true, result: { id, pending: true } };
    }
    this.effects.applyInstant(def.effects || [], { source: `event:${id}` });
    if (def.duration && def.continuous?.length) this.st.active.push({ id, left: def.duration });
    this.bus.emit(EV.EVENT_TRIGGERED, { id, choices: [] });
    return { ok: true, result: { id } };
  }

  /** 選項成本是否可負擔 */
  canAfford(choice) {
    if (!choice.cost) return { ok: true };
    if (Array.isArray(choice.cost)) { const missing = this.systems.inventory.missing(choice.cost); return missing.length ? { ok: false, reason: 'materials', missing } : { ok: true }; }
    if (choice.cost.coins != null && this.state.player.coins < choice.cost.coins) return { ok: false, reason: 'coins', need: choice.cost.coins, have: this.state.player.coins };
    return { ok: true };
  }

  resolve(choiceId) {
    const p = this.st.pending;
    if (!p) return { ok: false, reason: 'noEvent' };
    const def = this.registry.event(p.id);
    const choice = def.choices.find((c) => c.id === choiceId);
    if (!choice) return { ok: false, reason: 'badChoice' };
    const aff = this.canAfford(choice);
    if (!aff.ok) return { ok: false, reason: aff.reason, ...aff };
    if (Array.isArray(choice.cost)) this.systems.inventory.consume(choice.cost);
    else if (choice.cost?.coins) this.systems.player.spendCoins(choice.cost.coins);
    this.st.pending = null;
    this.effects.applyInstant(choice.effects || [], { source: `event:${def.id}` });
    this.log(`${def.icon} ${def.name}：${choice.label}`, 'info');
    this.bus.emit(EV.EVENT_RESOLVED, { id: def.id, choiceId });
    return { ok: true, result: { id: def.id, choiceId } };
  }

  update(dt) {
    const p = this.st.pending;
    if (p && this.clock.time >= p.expiresAt) {
      const def = this.registry.event(p.id);
      const choice = def?.choices.find((c) => c.id === p.defaultChoiceId) || def?.choices.at(-1);
      this.st.pending = null;
      if (choice) { this.effects.applyInstant(choice.effects || [], { source: `event:${p.id}` }); this.log(`${def.icon} ${def.name}：時間到，${choice.label}`, 'info'); this.bus.emit(EV.EVENT_RESOLVED, { id: p.id, choiceId: choice.id, expired: true }); }
    }
    for (const a of [...this.st.active]) {
      const def = this.registry.event(a.id);
      if (def?.continuous?.length) this.effects.tickContinuous(def.continuous, dt, { source: `event:${a.id}` });
      a.left -= dt;
      if (a.left <= 0) this.st.active.splice(this.st.active.indexOf(a), 1);
    }
  }

  /** UI 用 */
  pendingInfo() {
    const p = this.st.pending;
    if (!p) return null;
    const def = this.registry.event(p.id);
    return { def, expiresIn: Math.max(0, p.expiresAt - this.clock.time), choices: def.choices.map((c) => ({ ...c, afford: this.canAfford(c) })) };
  }
}
