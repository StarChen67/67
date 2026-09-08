import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { Storage } from '../core/storage.js';
import { clamp, findNonFinite } from '../core/utils.js';
import { SAVE_VERSION, createNewState, deepDefault } from '../game/state.js';
import { SLOTS } from '../core/registry.js';

/**
 * 存檔版本與 migration 鏈。每次改動存檔結構：SAVE_VERSION +1，並加入 MIGRATIONS[from]。
 * 轉換函式必須就地補齊／改名，不得假設欄位存在。
 */
export const MIGRATIONS = {
  // 範例：1: (data) => { data.newField = data.newField ?? 0; data.version = 2; return data; },
};

export function migrate(data) {
  let v = Number(data.version) || 1;
  const log = [];
  while (v < SAVE_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) throw new Error(`No migration from version ${v}`);
    data = fn(data);
    log.push(`${v}→${v + 1}`);
    v += 1;
    data.version = v;
  }
  return { data, log };
}

export const SLOT_IDS = ['slot1', 'slot2', 'slot3', 'autosave'];
const DEFAULT_PREFS = { audio: true, speed: 1, autosaveSec: 30 };

/**
 * SaveSystem：槽位、自動存檔、備份、版本與 migration、normalize、validate、匯入匯出、裝置偏好。
 * 讀檔管線：parse → 形狀檢查 → migrate → normalize → validate → 回傳 state（由 Game 替換並通知系統）。
 */
export class SaveSystem extends System {
  constructor(ctx, storage) {
    super(ctx, 'save');
    this.storage = storage || new Storage();
    this._autoAcc = 0;
    this.prefs = { ...DEFAULT_PREFS, ...(this.storage.get('prefs') || {}) };
  }
  slotKey(slot) { return `save.${slot}`; }
  backupKey(slot) { return `save.${slot}.backup`; }

  // ---------- 偏好 ----------
  getPrefs() { return { ...this.prefs }; }
  setPrefs(patch) {
    this.prefs = { ...this.prefs, ...patch };
    this.storage.set('prefs', this.prefs);
    return this.getPrefs();
  }

  // ---------- 序列化 ----------
  serialize() {
    const st = this.state;
    st.rng = this.rng.getState();
    st.meta.updatedAt = this.ctx.now();
    st.version = SAVE_VERSION;
    return JSON.parse(JSON.stringify(st));
  }

  save(slot = 'slot1', { auto = false } = {}) {
    if (!SLOT_IDS.includes(slot)) return { ok: false, reason: 'badSlot' };
    if (!this.state) return { ok: false, reason: 'noGame' };
    const data = this.serialize();
    const prev = this.storage.getRaw(this.slotKey(slot));
    if (prev) this.storage.backend.setItem(this.storage.prefix + this.backupKey(slot), prev);
    if (!this.storage.set(this.slotKey(slot), data)) return { ok: false, reason: 'writeFailed' };
    const back = this.storage.get(this.slotKey(slot));
    if (!back || back.meta?.updatedAt !== data.meta.updatedAt) {
      if (prev) this.storage.backend.setItem(this.storage.prefix + this.slotKey(slot), prev);
      return { ok: false, reason: 'verifyFailed' };
    }
    this.bus.emit(EV.SAVE_DONE, { slot, auto });
    return { ok: true, result: { slot, auto } };
  }

  /** 讀取並正規化；不替換 state（Game.loadSlot 負責）。 */
  load(slot = 'slot1') {
    if (!SLOT_IDS.includes(slot)) return { ok: false, reason: 'badSlot' };
    let raw = this.storage.get(this.slotKey(slot));
    let usedBackup = false;
    if (!raw) { raw = this.storage.get(this.backupKey(slot)); usedBackup = !!raw; }
    if (!raw) return { ok: false, reason: 'empty' };
    const r = this.prepare(raw);
    if (!r.ok) {
      const backup = !usedBackup && this.storage.get(this.backupKey(slot));
      if (backup) { const r2 = this.prepare(backup); if (r2.ok) return { ...r2, usedBackup: true }; }
      return r;
    }
    return { ...r, usedBackup };
  }

  /** parse → 形狀檢查 → migrate → normalize → validate */
  prepare(raw) {
    let data = raw;
    if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch { return { ok: false, reason: 'parse' }; } }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'shape' };
    const v = Number(data.version);
    if (!Number.isInteger(v) || v < 1 || v > SAVE_VERSION) return { ok: false, reason: 'version', version: data.version };
    if (!data.player || !data.shelter) return { ok: false, reason: 'shape' };
    let log = [];
    try { ({ data, log } = migrate(data)); } catch (e) { return { ok: false, reason: 'migration', error: String(e) }; }
    data = this.normalize(data);
    const warnings = this.validate(data);
    return { ok: true, state: data, warnings, migrations: log };
  }

  normalize(data) {
    const def = createNewState({ seed: data?.meta?.seed ?? 1, name: data?.meta?.name ?? data?.player?.name ?? '倖存者', now: 0, registry: this.registry });
    deepDefault(data, def);
    data.version = SAVE_VERSION;
    // 非有限數字 → 補預設或 0
    for (const path of findNonFinite(data)) {
      const parts = path.split('.');
      let t = data, d = def;
      for (let i = 0; i < parts.length - 1; i++) { t = t?.[parts[i]]; d = d?.[parts[i]]; }
      if (t) t[parts.at(-1)] = typeof d?.[parts.at(-1)] === 'number' ? d[parts.at(-1)] : 0;
    }
    return data;
  }

  /** 依 Registry 檢查交叉引用；未知 id 丟棄並回傳警告，不丟錯。 */
  validate(st) {
    const R = this.registry, warn = [];
    const fixItems = (list, label) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        if (!it || !R.item(it.itemId) || !(it.qty >= 1)) { warn.push(`${label}: dropped ${it?.itemId}`); list.splice(i, 1); continue; }
        it.qty = Math.floor(it.qty);
        if (!it.uid) it.uid = `it_${(st.seq++).toString(36)}`;
      }
    };
    fixItems(st.inventory.items, 'inventory');
    fixItems(st.shelter.storage.items, 'storage');
    for (const slot of SLOTS) {
      const inst = st.player.equipment[slot];
      if (inst && (!R.item(inst.itemId) || R.item(inst.itemId).equip?.slot !== slot)) { warn.push(`equipment ${slot}: dropped ${inst.itemId}`); st.player.equipment[slot] = null; }
    }
    st.player.statusEffects = st.player.statusEffects.filter((s) => s && R.status(s.id));
    for (const id of Object.keys(st.shelter.buildings)) {
      const def = R.building(id);
      if (!def) { warn.push(`building: dropped ${id}`); delete st.shelter.buildings[id]; continue; }
      const b = st.shelter.buildings[id];
      b.level = clamp(Math.floor(b.level || 1), 1, def.maxLevel);
      b.hp = clamp(b.hp ?? def.levels[b.level - 1].hp, 0, def.levels[b.level - 1].hp);
    }
    st.blueprints.learned = st.blueprints.learned.filter((id) => R.blueprint(id));
    st.blueprints.discovered = st.blueprints.discovered.filter((id) => R.blueprint(id));
    st.crafting.queue = st.crafting.queue.filter((j) => j && R.recipe(j.recipeId));
    if (st.exploration && !R.area(st.exploration.areaId)) { warn.push('exploration: unknown area, cleared'); st.exploration = null; }
    if (st.exploration) { st.exploration.lootPile = (st.exploration.lootPile || []).filter((it) => R.item(it.itemId)); fixItems(st.exploration.lootPile, 'lootPile'); }
    if (st.combat) {
      st.combat.enemies = (st.combat.enemies || []).filter((e) => e && R.monster(e.defId) && e.hp > 0);
      st.combat.loot = (st.combat.loot || []).filter((it) => R.item(it.itemId));
      if (!st.combat.enemies.length) { warn.push('combat: no enemies, cleared'); st.combat = null; }
    }
    if (st.raid.active) st.raid.active.queue = (st.raid.active.queue || []).filter((e) => e && R.monster(e.defId));
    st.disasters.active = st.disasters.active.filter((d) => d && R.disaster(d.id));
    st.events.active = st.events.active.filter((e) => e && R.event(e.id));
    if (st.events.pending && !R.event(st.events.pending.id)) st.events.pending = null;
    const maxLv = Math.max(...[...R.shelterLevels.keys()]);
    st.shelter.level = clamp(Math.floor(st.shelter.level || 1), 1, maxLv);
    st.player.level = Math.max(1, Math.floor(st.player.level || 1));
    st.player.hunger = clamp(st.player.hunger, 0, 100);
    st.player.thirst = clamp(st.player.thirst, 0, 100);
    st.player.hp = Math.max(0, st.player.hp);
    // seq 必須大於所有既有 uid 的序號
    let maxSeq = st.seq || 1;
    const scan = (list) => { for (const it of list || []) { const n = parseInt(String(it?.uid || '').split('_').pop(), 36); if (Number.isFinite(n) && n >= maxSeq) maxSeq = n + 1; } };
    scan(st.inventory.items); scan(st.shelter.storage.items); scan(Object.values(st.player.equipment)); scan(st.exploration?.lootPile); scan(st.combat?.loot); scan(st.combat?.enemies); scan(st.raid.active?.queue); scan(st.crafting.queue);
    st.seq = maxSeq;
    return warn;
  }

  list() {
    return SLOT_IDS.map((slot) => {
      const raw = this.storage.get(this.slotKey(slot));
      if (!raw) return { slot, empty: true };
      return {
        slot, empty: false, name: raw.meta?.name, day: Math.floor((raw.clock?.time || 0) / this.balance.time.dayLength) + 1,
        level: raw.player?.level, updatedAt: raw.meta?.updatedAt, playTime: raw.meta?.playTime, version: raw.version, gameOver: !!raw.gameOver,
      };
    });
  }
  delete(slot) { this.storage.remove(this.slotKey(slot)); this.storage.remove(this.backupKey(slot)); return { ok: true }; }
  hasAny() { return this.list().some((s) => !s.empty); }
  /** 最近更新的槽位（「繼續遊戲」用） */
  latestSlot() {
    const list = this.list().filter((s) => !s.empty);
    if (!list.length) return null;
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0].slot;
  }

  exportJson() { return this.state ? JSON.stringify(this.serialize()) : null; }
  importJson(json, slot = 'slot1') {
    const r = this.prepare(json);
    if (!r.ok) return r;
    this.storage.set(this.slotKey(slot), r.state);
    return { ok: true, result: { slot, warnings: r.warnings } };
  }

  update(dt) {
    if (!this.state || this.state.gameOver) return;
    const every = this.prefs.autosaveSec;
    if (!(every > 0)) return;
    this._autoAcc += dt;
    if (this._autoAcc >= every) {
      this._autoAcc = 0;
      this.save('autosave', { auto: true });
    }
  }
}
