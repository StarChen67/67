import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { clamp } from '../core/utils.js';

/**
 * SurvivalSystem：飢餓／口渴隨時間上升（0 正常 → 100 死亡），閾值狀態，死亡通知。
 * 擁有：player.hunger / player.thirst。狀態 starving / dehydrated 以 left=null 由本系統加／移。
 */
export class SurvivalSystem extends System {
  constructor(ctx) { super(ctx, 'survival'); this._warned = { hunger: false, thirst: false, hp: false }; }

  get cfg() { return this.balance.survival; }
  hungerRate() { return this.modifiers.resolve('hungerRate', this.cfg.hungerPerSec); }
  thirstRate() { return this.modifiers.resolve('thirstRate', this.cfg.thirstPerSec); }

  addHunger(v) {
    const p = this.state.player;
    p.hunger = clamp(p.hunger + v, 0, 100);
    return p.hunger;
  }
  addThirst(v) {
    const p = this.state.player;
    p.thirst = clamp(p.thirst + v, 0, 100);
    return p.thirst;
  }

  onStateLoaded() { this._warned = { hunger: false, thirst: false, hp: false }; }
  onNewGame() { this.onStateLoaded(); }

  update(dt) {
    const p = this.state.player;
    if (p.hp <= 0) return;
    this.addHunger(this.hungerRate() * dt);
    this.addThirst(this.thirstRate() * dt);
    this._threshold('hunger', p.hunger, this.cfg.starvingStatus);
    this._threshold('thirst', p.thirst, this.cfg.dehydratedStatus);
    // HP 警告（邊緣觸發）
    const low = p.hp < this.systems.player.maxHp * this.cfg.hpWarnPct;
    if (low && !this._warned.hp) { this._warned.hp = true; this.bus.emit(EV.SURVIVAL_WARNING, { kind: 'hp', value: p.hp }); }
    else if (!low) this._warned.hp = false;

    if (p.hunger >= 100) this.bus.emit(EV.PLAYER_DIED, { reason: 'starved', detail: { source: 'hunger' } });
    else if (p.thirst >= 100) this.bus.emit(EV.PLAYER_DIED, { reason: 'dehydrated', detail: { source: 'thirst' } });
  }

  _threshold(kind, value, statusId) {
    const se = this.systems.statusEffects;
    const over = value > this.cfg.warnThreshold;
    if (over) {
      if (!se.has(statusId)) se.apply(statusId, { duration: null, silent: true });
      if (!this._warned[kind]) { this._warned[kind] = true; this.bus.emit(EV.SURVIVAL_WARNING, { kind, value }); }
    } else {
      if (se.has(statusId)) se.remove(statusId, { silent: true });
      this._warned[kind] = false;
    }
  }

  /** UI 用：目前警告狀態 */
  warnings() {
    const p = this.state.player;
    return {
      hunger: p.hunger > this.cfg.warnThreshold,
      thirst: p.thirst > this.cfg.warnThreshold,
      hp: p.hp < this.systems.player.maxHp * this.cfg.hpWarnPct,
    };
  }
}
