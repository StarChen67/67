import { System } from './base.js';
import { EV } from '../core/events-catalog.js';

/**
 * StatusEffectSystem：對任何實體（玩家或敵人）套用／移除／計時狀態，執行 tick 效果，提供 modifier。
 * 擁有：player.statusEffects（敵人的 statusEffects 由 Combat 交給本系統 tick）。
 */
export class StatusEffectSystem extends System {
  constructor(ctx) { super(ctx, 'statusEffects'); }

  init() {
    this.modifiers.provide('status', (key) => this._provide(key));
  }

  _listOf(subject) {
    const s = subject || this.state.player;
    if (!s.statusEffects) s.statusEffects = [];
    return s.statusEffects;
  }
  isPlayer(subject) { return !subject || subject === this.state.player; }

  has(id, subject) { return this._listOf(subject).some((s) => s.id === id); }
  get(id, subject) { return this._listOf(subject).find((s) => s.id === id) || null; }
  list(subject) { return this._listOf(subject).map((s) => ({ ...s, def: this.registry.status(s.id) })); }

  /** 套用（重複：層數+1 至上限、剩餘時間取較長者）。回傳實例或 null。 */
  apply(id, { duration, stacks = 1, subject = null, source = 'unknown', silent = false } = {}) {
    const def = this.registry.status(id);
    if (!def) return null;
    let dur = duration === undefined ? def.defaultDuration : duration;
    // 抗性：玩家裝備 resist[id]
    if (this.isPlayer(subject) && dur != null) {
      const resist = this.systems.player.getStats().resist?.[id] || 0;
      if (resist >= 1) return null;
      if (resist > 0 && this.rng.world.chance(resist)) return null;
    }
    const list = this._listOf(subject);
    let inst = list.find((s) => s.id === id);
    if (inst) {
      inst.stacks = Math.min(def.maxStacks || 1, inst.stacks + stacks);
      if (dur == null) inst.left = null; else if (inst.left != null) inst.left = Math.max(inst.left, dur); else inst.left = dur;
    } else {
      inst = { id, left: dur == null ? null : dur, stacks: Math.min(def.maxStacks || 1, stacks) };
      list.push(inst);
    }
    if (this.isPlayer(subject)) this.bus.emit(EV.STATUS_APPLIED, { id, stacks: inst.stacks, duration: inst.left, source, silent });
    return inst;
  }

  remove(id, { subject = null, silent = false, expired = false } = {}) {
    const list = this._listOf(subject);
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    if (this.isPlayer(subject)) this.bus.emit(EV.STATUS_EXPIRED, { id, silent, expired });
    return true;
  }
  clearAll(subject) { this._listOf(subject).length = 0; }

  /** 對一個實體推進 dt：計時、tick 效果、到期 onExpire */
  tick(subject, dt) {
    const list = this._listOf(subject);
    if (!list.length) return;
    for (const inst of [...list]) {
      const def = this.registry.status(inst.id);
      if (!def) { this.remove(inst.id, { subject, silent: true }); continue; }
      if (def.tick && def.tick.length) {
        this.effects.tickContinuous(def.tick, dt, { subject: this.isPlayer(subject) ? null : subject, source: `status:${inst.id}`, scale: def.perStack ? inst.stacks : 1 });
      }
      if (inst.left != null) {
        inst.left -= dt;
        if (inst.left <= 0) {
          this.remove(inst.id, { subject, expired: true });
          if (def.onExpire) this.effects.applyInstant(def.onExpire, { subject: this.isPlayer(subject) ? null : subject, source: `status:${inst.id}` });
        }
      }
    }
  }

  update(dt) {
    if (this.state.player.hp <= 0) return;
    this.tick(null, dt);
  }

  _provide(key) {
    const out = [];
    for (const inst of this._listOf(null)) {
      const def = this.registry.status(inst.id);
      const m = def?.modifiers?.[key];
      if (!m) continue;
      const n = def.perStack ? inst.stacks : 1;
      out.push({ mult: m.mult == null ? 1 : Math.pow(m.mult, n), add: (m.add || 0) * n, label: def.name });
    }
    return out;
  }
}
