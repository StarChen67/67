import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { EffectRegistry } from '../core/effects.js';
import { weightedPick } from '../core/utils.js';

/**
 * DisasterSystem：排程（每 N 小時擲骰）、預警 → 生效 → 結束、效果交給 EffectRegistry / modifier provider。
 * 擁有：state.disasters = { active:[{id, phase, left, total}], cooldownUntil, nextRollAt }。
 */
export class DisasterSystem extends System {
  constructor(ctx) { super(ctx, 'disaster'); }

  init() {
    this.modifiers.provide('disasters', (key) => {
      const out = [];
      for (const d of this.state.disasters.active) {
        if (d.phase !== 'active') continue;
        const def = this.registry.disaster(d.id);
        out.push(...EffectRegistry.modifiersOf(def?.effects, key, def?.name));
      }
      return out;
    });
  }

  get cfg() { return this.balance.disaster; }
  get st() { return this.state.disasters; }
  active() { return this.st.active.map((d) => ({ ...d, def: this.registry.disaster(d.id) })); }

  eligible() {
    const day = this.clock.day, t = this.clock.time;
    return this.registry.list('disasters').filter((d) => (d.minDay || 1) <= day && (this.st.cooldownUntil[d.id] || 0) <= t && !this.st.active.some((a) => a.id === d.id));
  }

  /** 啟動（含預警）。force 略過上限與冷卻。 */
  trigger(id, { force = false } = {}) {
    const def = this.registry.disaster(id);
    if (!def) return { ok: false, reason: 'unknownDisaster' };
    if (!force && this.st.active.length >= this.cfg.maxActive) return { ok: false, reason: 'maxActive' };
    const total = this.rng.world.int(def.duration[0], def.duration[1]);
    const inst = { id, phase: def.warningSec > 0 ? 'warning' : 'active', left: def.warningSec > 0 ? def.warningSec : total, total };
    this.st.active.push(inst);
    if (inst.phase === 'warning') {
      this.log(`${def.icon} 天災預警：${def.name}將在 ${def.warningSec} 秒後來襲——${def.desc}`, 'warn');
      this.bus.emit(EV.DISASTER_WARNING, { id, inSec: def.warningSec });
    } else this.activate(inst, def);
    return { ok: true, result: { id, phase: inst.phase, total } };
  }

  activate(inst, def) {
    inst.phase = 'active';
    inst.left = inst.total;
    this.effects.applyInstant(def.onStart || [], { source: `disaster:${def.id}` });
    this.modifiers.invalidate();
    this.bus.emit(EV.DISASTER_START, { id: def.id, duration: inst.total });
  }
  end(inst, def) {
    const i = this.st.active.indexOf(inst); if (i >= 0) this.st.active.splice(i, 1);
    this.st.cooldownUntil[def.id] = this.clock.time + (def.cooldown || 0);
    this.effects.applyInstant(def.onEnd || [], { source: `disaster:${def.id}` });
    this.modifiers.invalidate();
    this.incStat('disastersSurvived');
    this.log(`${def.icon} ${def.name}結束了。`, 'good');
    this.bus.emit(EV.DISASTER_END, { id: def.id });
  }

  update(dt) {
    const st = this.st;
    for (const inst of [...st.active]) {
      const def = this.registry.disaster(inst.id);
      if (!def) { st.active.splice(st.active.indexOf(inst), 1); continue; }
      inst.left -= dt;
      if (inst.phase === 'warning') { if (inst.left <= 0) this.activate(inst, def); continue; }
      if (def.effects?.length) this.effects.tickContinuous(def.effects, dt, { source: `disaster:${def.id}` });
      if (inst.left <= 0) this.end(inst, def);
    }
    // 排程擲骰
    const t = this.clock.time;
    if (t >= st.nextRollAt) {
      st.nextRollAt = t + this.clock.hoursToSec(this.cfg.rollEveryHours);
      if (this.clock.day >= (this.cfg.firstDay || 1) && st.active.length < this.cfg.maxActive && this.rng.world.chance(this.cfg.chancePerRoll)) {
        const pick = weightedPick(this.rng.world, this.eligible());
        if (pick) this.trigger(pick.id);
      }
    }
  }
  onNewGame() { this.st.nextRollAt = this.clock.hoursToSec(this.cfg.rollEveryHours); }
}
