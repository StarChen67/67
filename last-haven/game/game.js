import { Registry } from '../core/registry.js';
import { EventBus } from '../core/events.js';
import { ModifierStack } from '../core/modifiers.js';
import { EffectRegistry } from '../core/effects.js';
import { Clock } from '../core/clock.js';
import { RNGSet, seedFromString } from '../core/rng.js';
import { EV } from '../core/events-catalog.js';
import { DATA } from '../data/index.js';
import { createSystems, UPDATE_ORDER } from '../systems/index.js';
import { createNewState } from './state.js';
import { INTENTS } from './intents.js';

const DEATH_PRIORITY = ['killed', 'dehydrated', 'starved', 'shelterDestroyed'];
export const DEATH_TEXT = {
  killed: '你被怪物殺死。', dehydrated: '你死於脫水。', starved: '你因飢餓而死亡。', shelterDestroyed: '避難所已被摧毀。',
};

/**
 * Game：組合根。建立 ctx、系統、固定步長迴圈、intent 分派、Game Over 判定。
 * 不碰 DOM。UI 透過 game.intent()/game.state/bus 互動。
 */
export class Game {
  constructor({ data = DATA, storage = null, now = () => Date.now() } = {}) {
    this.registry = new Registry(data);
    this.bus = new EventBus();
    this.modifiers = new ModifierStack(this.registry.balance.modifierBounds);
    this.rng = new RNGSet(1);
    this.now = now;
    const ctx = {
      state: null, bus: this.bus, registry: this.registry, modifiers: this.modifiers, rng: this.rng, now, game: this,
      systems: null, effects: null, clock: null,
      uid: (prefix = 'i') => `${prefix}_${(ctx.state.seq++).toString(36)}`,
    };
    ctx.effects = new EffectRegistry(ctx);
    ctx.clock = new Clock(ctx);
    this.ctx = ctx;
    this.systems = createSystems(ctx, { storage });
    for (const s of Object.values(this.systems)) s.init();
    this._deaths = [];
    this.bus.on(EV.PLAYER_DIED, (e) => this._deaths.push(e));
    this.bus.on(EV.SHELTER_DESTROYED, (e) => this._deaths.push({ reason: 'shelterDestroyed', detail: { source: e?.source || 'raid' } }));
    this._acc = 0;
    this.speed = 1;
    this.stepSize = this.registry.balance.time.step;
  }

  get state() { return this.ctx.state; }
  get clock() { return this.ctx.clock; }
  get running() { return !!this.state && !this.state.gameOver; }

  // ---------- 生命週期 ----------
  newGame({ name = '倖存者', seed } = {}) {
    const s = seed ?? seedFromString(`${name}:${this.now()}`);
    const state = createNewState({ seed: s, name, now: this.now(), registry: this.registry });
    this.rng.reseed(s);
    state.rng = this.rng.getState();
    this.ctx.state = state;
    this._deaths.length = 0;
    this._acc = 0;
    this._giveStartingKit();
    for (const sys of Object.values(this.systems)) sys.onNewGame();
    this.bus.emit(EV.GAME_NEW, { name, seed: s });
    return state;
  }

  _giveStartingKit() {
    const b = this.registry.balance.player;
    const inv = this.systems.inventory, eq = this.systems.equipment;
    for (const [slot, itemId] of Object.entries(b.startingEquipment || {})) {
      if (!this.registry.item(itemId)) continue;
      this.state.player.equipment[slot] = this.systems.item.createInstance(itemId, 1);
    }
    for (const it of b.startingInventory || []) inv.add('inventory', it.itemId, it.qty, { force: true });
    for (const it of b.startingStorage || []) inv.add('storage', it.itemId, it.qty, { force: true });
    this.state.player.hp = this.systems.player.maxHp;
    void eq;
  }

  /** 以已正規化的 state 取代目前狀態（SaveSystem.load 的結果） */
  loadState(state, { slot = null } = {}) {
    this.ctx.state = state;
    this.rng.setState(state.rng);
    this._deaths.length = 0;
    this._acc = 0;
    this.modifiers.invalidate();
    for (const sys of Object.values(this.systems)) sys.onStateLoaded();
    this.bus.emit(EV.SAVE_LOADED, { slot });
    return state;
  }
  loadSlot(slot) {
    const r = this.systems.save.load(slot);
    if (!r.ok) return r;
    this.loadState(r.state, { slot });
    return { ok: true, result: { slot, warnings: r.warnings, migrations: r.migrations, usedBackup: r.usedBackup } };
  }
  save(slot) { return this.systems.save.save(slot); }

  // ---------- 迴圈 ----------
  /** 真實時間 tick：累積後以固定步長模擬 */
  tick(dtReal) {
    if (!this.running) return 0;
    this._acc += Math.min(dtReal, 0.25) * this.speed;
    let steps = 0;
    while (this._acc >= this.stepSize - 1e-9 && steps < 50) {
      this.step(this.stepSize);
      this._acc -= this.stepSize;
      steps++;
      if (!this.running) break;
    }
    return steps;
  }
  /** 無頭模擬入口：推進一個固定步長 */
  step(dt = this.stepSize) {
    const st = this.state;
    if (!st || st.gameOver) return;
    this.modifiers.invalidate();
    this.clock.advance(dt);
    for (const name of UPDATE_ORDER) {
      const sys = this.systems[name];
      if (sys) sys.update(dt);
      if (st.gameOver) break;
    }
    this.checkGameOver();
    st.meta.playTime += dt;
    this.bus.emit(EV.TICK, { dt });
  }
  /** 模擬 N 秒（測試用） */
  advance(seconds) {
    const n = Math.round(seconds / this.stepSize);
    for (let i = 0; i < n && this.running; i++) this.step(this.stepSize);
  }

  checkGameOver() {
    const st = this.state;
    if (!st || st.gameOver || !this._deaths.length) { this._deaths.length = 0; return null; }
    let best = null;
    for (const d of this._deaths) {
      if (!best || DEATH_PRIORITY.indexOf(d.reason) < DEATH_PRIORITY.indexOf(best.reason)) best = d;
    }
    this._deaths.length = 0;
    st.gameOver = { reason: best.reason, detail: best.detail || {}, at: Math.round(st.clock.time * 10) / 10, text: DEATH_TEXT[best.reason] || '遊戲結束。' };
    st.stats.deaths = (st.stats.deaths || 0) + 1;
    this.bus.emit(EV.GAME_OVER, { ...st.gameOver });
    return st.gameOver;
  }

  // ---------- Intent ----------
  intent(name, params = {}) {
    const def = INTENTS[name];
    if (!def) return { ok: false, reason: 'unknownIntent', intent: name };
    if (!this.state) return { ok: false, reason: 'noGame', intent: name };
    if (this.state.gameOver && !def.allowAfterGameOver) return { ok: false, reason: 'gameOver', intent: name };
    if (def.allowedWhen) {
      const a = def.allowedWhen(this.state, this.ctx, params);
      if (a !== true) return { ok: false, reason: a || 'notAllowed', intent: name };
    }
    try {
      const r = def.run(this.ctx, params || {});
      const out = normalizeResult(r);
      out.intent = name;
      this.modifiers.invalidate();
      return out;
    } catch (err) {
      if (typeof console !== 'undefined') console.error(`[intent ${name}]`, err);
      return { ok: false, reason: 'error', error: String(err && err.message || err), intent: name };
    }
  }
  intents() { return Object.keys(INTENTS); }
}

function normalizeResult(r) {
  if (r && typeof r === 'object' && 'ok' in r) return r;
  if (r === false || r == null) return { ok: false, reason: 'failed' };
  return { ok: true, result: r };
}
