import { EV } from '../core/events-catalog.js';
import { esc, reasonText, dataAttrs } from './components.js';
import { renderHud, renderTopbar, renderStatusRow } from './hud.js';
import * as MainMenu from './screens/main-menu.js';
import * as Shelter from './screens/shelter.js';
import * as Player from './screens/player.js';
import * as Inventory from './screens/inventory.js';
import * as Saves from './screens/saves.js';
import * as Settings from './screens/settings.js';
import * as GameOver from './screens/gameover.js';
import * as MapScreen from './screens/map.js';
import * as Crafting from './screens/crafting.js';
import * as Blueprints from './screens/blueprints.js';
import { raidBanner, disasterBanner, eventBanner, eventModal } from './banners.js';

/**
 * App：UI 根。畫面 = 'menu' | 'game'；遊戲內以 panel 切換。
 * 只讀 state、呼叫 game.intent()、監聽 bus。所有點擊透過 data-action 委派。
 */
export class App {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.EV = EV;
    this.screen = 'menu';
    this.panel = 'shelter';
    this.panels = { shelter: Shelter, player: Player, inventory: Inventory, saves: Saves, settings: Settings, map: MapScreen, crafting: Crafting, blueprints: Blueprints };
    this.nav = [
      { id: 'shelter', ic: '🏚️', label: '避難所' }, { id: 'player', ic: '🧍', label: '玩家' }, { id: 'inventory', ic: '🎒', label: '背包' },
      { id: 'crafting', ic: '🔨', label: '製作' }, { id: 'blueprints', ic: '📜', label: '圖紙' }, { id: 'map', ic: '🗺️', label: '地圖' }, { id: 'settings', ic: '⚙️', label: '設定' },
    ];
    this.logs = [];
    this.dirty = true;
    this.hudDirty = true;
    this.modal = null;
    this.ui = {}; // 各 panel 的 UI 狀態（分頁等）
    this._last = 0;
    this._lastHud = 0;
  }

  registerPanel(id, mod) { this.panels[id] = mod; }

  start() {
    this.bindBus();
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      e.preventDefault();
      this.handleAction(el.dataset, el);
    });
    this.root.addEventListener('change', (e) => {
      const el = e.target.closest('[data-change]');
      if (el) this.handleChange(el.dataset, el);
    });
    this.render();
    this._last = performance.now();
    this.ticker = setInterval(() => this.onTick(), 100);
    window.addEventListener('beforeunload', () => { if (this.game.running) this.game.intent('save', { slot: 'autosave' }); });
  }

  onTick() {
    const now = performance.now();
    const dt = (now - this._last) / 1000;
    this._last = now;
    if (this.screen === 'game' && this.game.state) {
      this.game.speed = this.game.systems.save.getPrefs().speed || 1;
      this.game.tick(dt);
      if (this.dirty) { this.render(); }
      else if (now - this._lastHud > 250) { this.renderHudOnly(); this._lastHud = now; }
    }
  }

  bindBus() {
    const b = this.game.bus;
    const mark = () => { this.dirty = true; };
    b.on(EV.LOG, (e) => this.pushLog(e));
    b.on(EV.TOAST, (e) => this.toast(e.text, e.kind));
    for (const ev of [EV.INVENTORY_CHANGED, EV.EQUIPMENT_CHANGED, EV.PLAYER_LEVELUP, EV.STATUS_APPLIED, EV.STATUS_EXPIRED, EV.SAVE_DONE,
      EV.COMBAT_START, EV.COMBAT_END, EV.COMBAT_ENEMY_KILLED, EV.EXPLORE_START, EV.EXPLORE_ARRIVED, EV.EXPLORE_POI, EV.EXPLORE_DEEPER, EV.EXPLORE_RETURNING, EV.EXPLORE_HOME, EV.EXPLORE_AMBUSH,
      EV.SHELTER_UPGRADED, EV.SHELTER_DAMAGED, EV.SHELTER_REPAIRED, EV.BUILDING_BUILT, EV.BUILDING_UPGRADED, EV.BUILDING_DAMAGED, EV.CRAFT_QUEUED, EV.CRAFT_DONE,
      EV.BLUEPRINT_FOUND, EV.BLUEPRINT_LEARNED, EV.BLUEPRINT_DISMANTLED, EV.CHEST_OPENED, EV.DISASTER_START, EV.DISASTER_END, EV.DISASTER_WARNING,
      EV.RAID_WARNING, EV.RAID_START, EV.RAID_WAVE, EV.RAID_END, EV.EVENT_TRIGGERED, EV.EVENT_RESOLVED, EV.GAME_NEW, EV.SAVE_LOADED, EV.CLOCK_HOUR]) b.on(ev, mark);
    b.on(EV.GAME_OVER, () => { this.dirty = true; this.render(); });
    b.on(EV.EXPLORE_START, () => this.setPanel('map'));
    b.on(EV.COMBAT_START, () => this.setPanel('map'));
    b.on(EV.EXPLORE_HOME, () => this.setPanel('shelter'));
    b.on(EV.COMBAT_END, (e) => { if (e.result === 'win') this.toast('⚔️ 戰鬥勝利！', 'good'); });
    b.on(EV.CHEST_OPENED, (e) => this.toast('📦 開箱：' + (e.items.map((i) => (this.game.registry.item(i.itemId)?.name || i.itemId) + '×' + i.qty).join('、') || '空的'), 'loot'));
    b.on(EV.BLUEPRINT_FOUND, (e) => this.toast('📜 發現圖紙：' + (this.game.registry.blueprint(e.blueprintId)?.name || e.blueprintId), 'loot'));
    this.addBannerProvider((app) => { const st = app.game.state; if (st.combat && app.panel !== 'map') return '<div class="alert raid" data-action="nav" data-panel="map">⚔️ 戰鬥中！點此前往戰鬥畫面</div>'; if (st.exploration && app.panel !== 'map') return '<div class="alert event" data-action="nav" data-panel="map">🧭 探索中（' + (st.exploration.phase === 'explore' ? '第 ' + st.exploration.depth + ' 層' : '旅途中') + '）點此查看</div>'; return ''; });
    this.addBannerProvider(raidBanner);
    this.addBannerProvider(disasterBanner);
    this.addBannerProvider(eventBanner);
    b.on(EV.RAID_WARNING, (e) => this.toast(`🚨 怪物群將在 ${Math.round(e.inSec)} 秒後抵達！`, 'bad'));
    b.on(EV.RAID_START, () => { this.toast('🚨 怪物群抵達避難所！', 'bad'); if (!this.game.state.exploration) this.setPanel('map'); });
    b.on(EV.RAID_END, (e) => this.toast(e.result === 'won' ? '🎉 擊退了襲擊！' : '避難所淪陷……', e.result === 'won' ? 'good' : 'bad'));
    b.on(EV.DISASTER_WARNING, (e) => this.toast(`${this.game.registry.disaster(e.id)?.icon} 天災預警：${this.game.registry.disaster(e.id)?.name}`, 'warn'));
    b.on(EV.DISASTER_START, (e) => this.toast(`${this.game.registry.disaster(e.id)?.icon} ${this.game.registry.disaster(e.id)?.name}來襲！`, 'bad'));
    b.on(EV.EVENT_TRIGGERED, (e) => { if (e.choices && e.choices.length) { const m = eventModal(this); if (m) this.openModal(m); } else this.toast(`${this.game.registry.event(e.id)?.icon} ${this.game.registry.event(e.id)?.name}`, 'warn'); });
    b.on(EV.PLAYER_LEVELUP, (e) => this.toast(`🎉 升級！Lv.${e.level}`, 'good'));
    b.on(EV.SURVIVAL_WARNING, (e) => this.toast(e.kind === 'hp' ? '⚠️ 生命值過低！' : e.kind === 'hunger' ? '⚠️ 你快餓死了，趕快吃東西！' : '⚠️ 你快脫水了，趕快喝水！', 'bad'));
    b.on(EV.ITEM_USED, (e) => {
      const d = e.delta || {}, parts = [];
      if (d.hunger) parts.push(`飢餓 ${d.hunger}`); if (d.thirst) parts.push(`口渴 ${d.thirst}`); if (d.hp) parts.push(`HP +${d.hp}`);
      const def = this.game.registry.item(e.itemId);
      this.pushLog({ text: `使用 ${def?.icon || ''}${def?.name || e.itemId}${parts.length ? '：' + parts.join('、') : ''}`, kind: 'good' });
    });
    b.on(EV.SAVE_DONE, (e) => { if (!e.auto) this.toast('💾 已儲存', 'good'); });
    b.on(EV.STATUS_APPLIED, (e) => { if (!e.silent) { const d = this.game.registry.status(e.id); this.pushLog({ text: `${d?.icon || ''} 狀態：${d?.name || e.id}`, kind: d?.kind === 'buff' ? 'good' : 'warn' }); } });
  }

  // ---------- 畫面 ----------
  showMenu() { this.screen = 'menu'; this.dirty = true; this.render(); }
  showGame(panel = 'shelter') { this.screen = 'game'; this.panel = panel; this.logs = this.logs.slice(-60); this.dirty = true; this.render(); }
  setPanel(id) { this.panel = id; this.dirty = true; this.render(); }

  render() {
    this.dirty = false;
    if (this.screen === 'menu' || !this.game.state) { this.root.innerHTML = MainMenu.render(this); return; }
    const st = this.game.state;
    const mod = this.panels[this.panel];
    let body;
    try { body = mod ? mod.render(this) : `<div class="card"><h3>${esc(this.panel)}</h3><p class="dim">此畫面將在後續階段開放。</p></div>`; }
    catch (err) { console.error(err); body = `<div class="card"><h3>畫面錯誤</h3><pre class="small">${esc(err.stack || err)}</pre></div>`; }
    this.root.innerHTML = `
      <div class="wrap">
        <div id="topbar">${renderTopbar(this)}</div>
        <div id="hud">${renderHud(this)}</div>
        <div id="statusRow">${renderStatusRow(this)}</div>
        <div id="banner">${this.renderBanners()}</div>
        <div id="panel">${body}</div>
        <div class="card"><h2>記錄</h2><div id="log">${this.renderLog()}</div></div>
      </div>
      <div id="nav">${this.nav.map((n) => `<button data-action="nav" data-panel="${n.id}" class="${this.panel === n.id ? 'active' : ''}"><span class="ic">${n.ic}</span>${n.label}</button>`).join('')}</div>
      ${st.gameOver ? GameOver.render(this) : ''}
      ${this.modal ? this.renderModal() : ''}`;
    if (mod && mod.afterRender) { try { mod.afterRender(this); } catch (err) { console.error(err); } }
    this.toastRoot();
  }
  renderHudOnly() {
    const hud = this.root.querySelector('#hud'); if (hud) hud.innerHTML = renderHud(this);
    const top = this.root.querySelector('#topbar'); if (top) top.innerHTML = renderTopbar(this);
    const sr = this.root.querySelector('#statusRow'); if (sr) sr.innerHTML = renderStatusRow(this);
    const bn = this.root.querySelector('#banner'); if (bn) bn.innerHTML = this.renderBanners();
    if (this.modal && this.game.state && !this.game.state.events.pending && this.modal.title && this.root.querySelector('[data-action="event:choose"]')) { this.modal = null; this.dirty = true; }
    const mod = this.panels[this.panel];
    if (mod && mod.renderLive) { const el = this.root.querySelector('#panel'); if (el) mod.renderLive(this, el); }
  }
  renderBanners() {
    const out = [];
    for (const fn of this.bannerProviders || []) { try { const h = fn(this); if (h) out.push(h); } catch (e) { console.error(e); } }
    return out.join('');
  }
  addBannerProvider(fn) { (this.bannerProviders = this.bannerProviders || []).push(fn); }

  // ---------- 記錄 / toast / modal ----------
  pushLog(e) {
    const t = this.game.state ? this.game.clock : null;
    this.logs.push({ text: e.text, kind: e.kind || 'info', day: t ? t.day : 0, hour: t ? t.hour : 0 });
    if (this.logs.length > 120) this.logs.shift();
    const el = this.root.querySelector('#log');
    if (el) el.innerHTML = this.renderLog();
  }
  renderLog() {
    return this.logs.slice(-40).reverse().map((l) => `<div class="${l.kind}"><span class="t">D${l.day} ${String(l.hour).padStart(2, '0')}h</span>${esc(l.text)}</div>`).join('');
  }
  /** toast 容器掛在 document.body，避免被畫面重繪清掉 */
  toastRoot() {
    if (!this._toastEl || !this._toastEl.isConnected) {
      this._toastEl = document.getElementById('toasts') || document.createElement('div');
      this._toastEl.id = 'toasts';
      if (!this._toastEl.isConnected) document.body.appendChild(this._toastEl);
    }
    return this._toastEl;
  }
  toast(text, kind = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    const root = this.toastRoot();
    root.appendChild(t);
    while (root.childElementCount > 6) root.firstElementChild.remove();
    setTimeout(() => t.remove(), 3000);
  }
  openModal(m) { this.modal = m; this.dirty = true; this.render(); }
  closeModal() { this.modal = null; this.dirty = true; this.render(); }
  renderModal() {
    const m = this.modal;
    return `<div class="modal-mask" data-action="modal:close"><div class="modal" data-action="noop">
      <h3>${m.title || ''}</h3>${m.body || ''}
      <div class="row" style="justify-content:flex-end;margin-top:10px">${(m.buttons || [{ label: '關閉', action: 'modal:close' }]).map((b) => `<button class="${b.cls || ''}" data-action="${esc(b.action)}" ${dataAttrs(b.params)}>${esc(b.label)}</button>`).join('')}</div>
    </div></div>`;
  }

  // ---------- 操作 ----------
  paramsFrom(ds) {
    const p = {};
    for (const [k, v] of Object.entries(ds)) {
      if (k === 'action' || k === 'intent') continue;
      p[k] = v === 'true' ? true : v === 'false' ? false : v !== '' && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    }
    return p;
  }
  doIntent(name, params = {}) {
    const r = this.game.intent(name, params);
    if (!r.ok) this.toast(`✖ ${reasonText(r.reason)}${r.error ? '：' + r.error : ''}`, 'bad');
    this.dirty = true;
    return r;
  }
  handleAction(ds, el) {
    const a = ds.action;
    if (a === 'nav') { this.setPanel(ds.panel); return; }
    if (a === 'intent') { this.doIntent(ds.intent, this.paramsFrom(ds)); if (this.dirty) this.render(); return; }
    if (a === 'noop') return;
    if (a === 'modal:close') { this.closeModal(); return; }
    if (a === 'event:open') { const m = eventModal(this); if (m) this.openModal(m); return; }
    if (a === 'event:choose') { this.modal = null; this.doIntent('resolveEvent', { choiceId: ds.choiceId }); this.render(); return; }
    if (a === 'tab') { this.ui[ds.panel] = { ...(this.ui[ds.panel] || {}), tab: ds.tab }; this.dirty = true; this.render(); return; }
    if (a.startsWith('menu:')) { MainMenu.onAction(this, ds, el); return; }
    if (a.startsWith('gameover:')) { GameOver.onAction(this, ds); return; }
    for (const mod of Object.values(this.panels)) {
      if (mod.onAction && mod.onAction(this, ds, el)) { if (this.dirty) this.render(); return; }
    }
    console.warn('unhandled action', ds);
  }
  handleChange(ds, el) {
    if (ds.change === 'pref') {
      const v = el.type === 'checkbox' ? el.checked : el.type === 'number' || el.type === 'range' ? Number(el.value) : el.value;
      this.game.systems.save.setPrefs({ [ds.key]: v });
      this.toast('設定已更新', 'good');
    } else if (ds.change === 'setting') {
      const v = el.type === 'checkbox' ? el.checked : el.value;
      this.doIntent('setSetting', { key: ds.key, value: v });
    }
    for (const mod of Object.values(this.panels)) if (mod.onChange && mod.onChange(this, ds, el)) break;
  }

  // ---------- 遊戲流程 ----------
  newGame(name) {
    this.game.newGame({ name: name || '倖存者' });
    this.logs = [];
    this.pushLog({ text: '這是你的避難所。外面的世界很危險——帶好食物和水再出發。', kind: 'system' });
    this.showGame('shelter');
  }
  loadSlot(slot) {
    const r = this.game.loadSlot(slot);
    if (!r.ok) { this.toast(`✖ 讀取失敗：${reasonText(r.reason)}`, 'bad'); return false; }
    this.logs = [];
    this.pushLog({ text: `讀取存檔 ${slot}${r.result.usedBackup ? '（使用備份）' : ''}${r.result.warnings.length ? '，已修正 ' + r.result.warnings.length + ' 項' : ''}`, kind: 'system' });
    const st = this.game.state;
    this.showGame(st.exploration || st.combat ? 'map' : 'shelter');
    return true;
  }
}
