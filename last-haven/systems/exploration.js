import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { EffectRegistry } from '../core/effects.js';
import { weightedPick } from '../core/utils.js';

/**
 * ExplorationSystem：區域解鎖、旅途、樓層（depth）、POI 生成、採集／搜索、埋伏、深入、返回。
 * 擁有：state.exploration、state.world.areas。戰鬥由 CombatSystem 擁有（本系統只呼叫 combat.start）。
 */
export class ExplorationSystem extends System {
  constructor(ctx) { super(ctx, 'exploration'); }

  init() {
    this.modifiers.provide('area', (key) => {
      const ex = this.state.exploration;
      if (!ex || ex.phase !== 'explore') return null;
      const area = this.registry.area(ex.areaId);
      return EffectRegistry.modifiersOf(area?.environment, key, area?.name);
    });
    this.bus.on(EV.COMBAT_END, (e) => this.onCombatEnd(e));
  }

  get cfg() { return this.balance.exploration; }
  get ex() { return this.state.exploration; }
  area(id) { return this.registry.area(id || this.ex?.areaId); }

  // ---------- 區域 ----------
  isUnlocked(area) {
    const u = area.unlock || {};
    if (u.day && this.clock.day < u.day) return false;
    if (u.playerLevel && this.state.player.level < u.playerLevel) return false;
    if (u.shelterLevel && this.state.shelter.level < u.shelterLevel) return false;
    return true;
  }
  unlockReason(area) {
    const u = area.unlock || {};
    const r = [];
    if (u.playerLevel && this.state.player.level < u.playerLevel) r.push(`需要玩家 Lv.${u.playerLevel}`);
    if (u.shelterLevel && this.state.shelter.level < u.shelterLevel) r.push(`需要避難所 Lv.${u.shelterLevel}`);
    if (u.day && this.clock.day < u.day) r.push(`第 ${u.day} 天後`);
    return r.join('、');
  }
  areas() {
    return this.registry.list('areas').map((a) => ({
      def: a, unlocked: this.isUnlocked(a), reason: this.unlockReason(a),
      world: this.state.world.areas[a.id] || { discovered: false, visits: 0, maxDepth: 0, kills: 0 },
      travelTime: this.travelTimeFor(a),
    }));
  }
  travelTimeFor(area) {
    const speed = this.modifiers.resolve('exploreSpeed', 1) * this.systems.player.getStats().moveSpeed;
    return Math.round(area.travelTime / Math.max(0.2, speed));
  }

  start(areaId) {
    const area = this.registry.area(areaId);
    if (!area) return { ok: false, reason: 'unknownArea' };
    if (this.ex) return { ok: false, reason: 'notHome' };
    if (this.state.raid.active) return { ok: false, reason: 'raid' };
    if (!this.isUnlocked(area)) return { ok: false, reason: 'locked', detail: this.unlockReason(area) };
    const w = this.state.world.areas[areaId] || (this.state.world.areas[areaId] = { discovered: false, visits: 0, maxDepth: 0, kills: 0 });
    w.discovered = true; w.visits++;
    this.incStat('explorations');
    this.state.exploration = {
      areaId, depth: 0, phase: 'travelOut', travelTotal: area.travelTime, travelLeft: area.travelTime,
      pois: [], activeAction: null, lootPile: [], gathered: {}, startedAt: this.clock.time, ambushAcc: 0,
    };
    this.log(`🚶 出發前往 ${area.icon}${area.name}（約 ${this.travelTimeFor(area)} 秒）`, 'system');
    this.bus.emit(EV.EXPLORE_START, { areaId });
    return { ok: true, result: { areaId, travelTime: this.travelTimeFor(area) } };
  }

  // ---------- 每步 ----------
  update(dt) {
    const ex = this.ex;
    if (!ex || this.state.combat || this.state.player.hp <= 0) return;
    const area = this.area();
    if (!area) { this.state.exploration = null; return; }
    const speed = this.modifiers.resolve('exploreSpeed', 1) * this.systems.player.getStats().moveSpeed;
    if (ex.phase === 'travelOut') {
      ex.travelLeft -= dt * speed;
      if (ex.travelLeft <= 0) this.arrive();
      return;
    }
    if (ex.phase === 'travelBack') {
      ex.travelLeft -= dt * speed;
      if (ex.travelLeft <= 0) this.arriveHome();
      return;
    }
    // explore：環境持續效果
    if (area.environment?.length) this.effects.tickContinuous(area.environment, dt, { source: `area:${area.id}` });
    if (ex.activeAction) {
      const gs = this.modifiers.resolve('gatherSpeed', 1);
      ex.activeAction.left -= dt * gs;
      // 採集中埋伏（每秒機率）
      ex.ambushAcc += dt;
      if (ex.ambushAcc >= 1) {
        ex.ambushAcc -= 1;
        const chance = this.modifiers.resolve('ambushChance', this.cfg.ambushBase + this.cfg.ambushPerDanger * area.danger);
        if (this.rng.explore.chance(chance)) { this.ambush(); return; }
      }
      if (ex.activeAction.left <= 0) this.completeAction();
    }
  }

  arrive() {
    const ex = this.ex, area = this.area();
    ex.phase = 'explore'; ex.depth = 1; ex.travelLeft = 0;
    this.generatePois();
    const w = this.state.world.areas[area.id]; if (w) w.maxDepth = Math.max(w.maxDepth, 1);
    this.log(`📍 抵達 ${area.icon}${area.name}。${area.desc}`, 'system');
    this.bus.emit(EV.EXPLORE_ARRIVED, { areaId: area.id, depth: 1 });
  }

  arriveHome() {
    const ex = this.ex;
    const gathered = ex.gathered, lost = ex.lootPile.length;
    this.state.exploration = null;
    this.log(`🏚️ 回到避難所。${Object.keys(gathered).length ? '帶回：' + Object.entries(gathered).map(([k, v]) => `${this.registry.item(k)?.name}×${v}`).join('、') : ''}${lost ? `（留在地上的 ${lost} 種物品已遺失）` : ''}`, 'good');
    this.bus.emit(EV.EXPLORE_HOME, { gathered });
  }

  // ---------- POI ----------
  generatePois() {
    const ex = this.ex, area = this.area(), rng = this.rng.explore;
    const n = rng.int(this.cfg.poiPerDepth[0], this.cfg.poiPerDepth[1]);
    const weights = { ...this.cfg.poiWeightsDefault, ...(area.poiWeights || {}) };
    if (!area.sites?.length) weights.site = 0;
    const pois = [];
    const isBossDepth = area.bossId && ex.depth === (area.bossDepth || area.maxDepth);
    const bossDone = !!this.state.flags[`boss:${area.id}`];
    for (let i = 0; i < n; i++) {
      const kind = weightedPick(rng, weights);
      const poi = this.makePoi(kind, area, ex.depth, rng, i);
      if (poi) pois.push(poi);
    }
    if (isBossDepth && !bossDone) {
      const boss = this.systems.enemy.spawnBoss(area, ex.depth);
      if (boss) pois.unshift({ id: this.uid('poi'), kind: 'monster', name: `${boss.name}（Boss）`, icon: boss.icon, done: false, data: { enemies: [boss], boss: true } });
    }
    if (ex.depth < area.maxDepth) pois.push({ id: this.uid('poi'), kind: 'path', name: `深入第 ${ex.depth + 1} 層`, icon: '➡️', done: false, data: {} });
    ex.pois = pois;
  }
  makePoi(kind, area, depth, rng) {
    const id = this.uid('poi');
    if (kind === 'resource') {
      const cands = area.resources.filter((r) => !r.minDepth || depth >= r.minDepth);
      const r = weightedPick(rng, cands);
      if (!r) return null;
      const def = this.registry.item(r.itemId);
      return { id, kind, name: `${def.name}${r.rare ? '（稀有）' : ''}`, icon: def.icon, done: false, data: { itemId: r.itemId, minQuantity: r.minQuantity, maxQuantity: r.maxQuantity, gatherTime: r.gatherTime, rare: !!r.rare } };
    }
    if (kind === 'monster') {
      const enemies = this.systems.enemy.spawnGroup(area, depth, { rng });
      if (!enemies.length) return null;
      return { id, kind, name: enemies.map((e) => `${e.name} Lv.${e.level}`).join('、'), icon: enemies[0].icon, done: false, data: { enemies } };
    }
    if (kind === 'chest') {
      const tier = this.systems.loot.rollChestTier(area.chestTierWeights, area.levelRange[0] + depth - 1, null, rng);
      const c = this.registry.chest(tier);
      return { id, kind, name: c.name, icon: c.icon, done: false, data: { tier } };
    }
    if (kind === 'site') {
      const s = weightedPick(rng, area.sites);
      if (!s) return null;
      return { id, kind, name: s.name, icon: s.icon, done: false, data: { siteId: s.id, searchTime: s.searchTime, lootTableId: s.lootTableId } };
    }
    return null;
  }
  poi(poiId) { return this.ex?.pois.find((p) => p.id === poiId) || null; }

  interact(poiId) {
    const ex = this.ex;
    if (!ex || ex.phase !== 'explore') return { ok: false, reason: 'notExploring' };
    if (ex.activeAction) return { ok: false, reason: 'busy' };
    const poi = this.poi(poiId);
    if (!poi) return { ok: false, reason: 'notFound' };
    if (poi.done) return { ok: false, reason: 'done' };
    const inv = this.systems.inventory;
    switch (poi.kind) {
      case 'resource':
        ex.activeAction = { type: 'gather', poiId, total: poi.data.gatherTime, left: poi.data.gatherTime };
        return { ok: true, result: { action: 'gather', time: poi.data.gatherTime } };
      case 'site':
        ex.activeAction = { type: 'search', poiId, total: poi.data.searchTime, left: poi.data.searchTime };
        return { ok: true, result: { action: 'search', time: poi.data.searchTime } };
      case 'monster':
        return this.systems.combat.start(poi.data.enemies, { origin: 'exploration', returnTo: { poiId } });
      case 'chest': {
        poi.done = true;
        const r = inv.add('inventory', `chest_${poi.data.tier}`, 1);
        if (!r.ok) ex.lootPile.push(this.systems.item.createInstance(`chest_${poi.data.tier}`, 1));
        this.bus.emit(EV.CHEST_FOUND, { tier: poi.data.tier, source: 'poi' });
        this.log(`💰 找到 ${poi.name}${r.ok ? '，已放入背包' : '，背包放不下，先放在地上'}。`, 'loot');
        this.bus.emit(EV.EXPLORE_POI, { poi, result: { chest: poi.data.tier } });
        return { ok: true, result: { chest: poi.data.tier, inBag: r.ok } };
      }
      case 'path':
        return this.goDeeper();
      default:
        return { ok: false, reason: 'unknownPoi' };
    }
  }
  cancelAction() {
    const ex = this.ex;
    if (!ex?.activeAction) return { ok: false, reason: 'noAction' };
    ex.activeAction = null;
    return { ok: true };
  }

  completeAction() {
    const ex = this.ex, area = this.area(), rng = this.rng.explore;
    const act = ex.activeAction; ex.activeAction = null;
    const poi = this.poi(act.poiId);
    if (!poi) return;
    poi.done = true;
    const inv = this.systems.inventory;
    const result = { items: [], blueprints: [], chests: [], coins: 0 };
    if (act.type === 'gather') {
      const qty = Math.max(1, Math.round(rng.int(poi.data.minQuantity, poi.data.maxQuantity) * this.cfg.resourceQtyMult));
      this.give(poi.data.itemId, qty, result);
      ex.gathered[poi.data.itemId] = (ex.gathered[poi.data.itemId] || 0) + qty;
      this.incStat('itemsGathered', qty);
      this.systems.progression.addXp(this.balance.progression.exploreXp.perGather, { source: 'gather' });
      const bp = this.systems.loot.rollBlueprint({ source: 'resource', areaId: area.id, rng: this.rng.loot });
      if (bp) this.giveBlueprint(bp, result, '你在雜物堆裡發現了一張圖紙！');
      this.log(`⛏️ 採集 ${this.registry.item(poi.data.itemId)?.icon}${this.registry.item(poi.data.itemId)?.name} ×${qty}`, 'loot');
    } else if (act.type === 'search') {
      const res = this.systems.loot.rollTable(poi.data.lootTableId, { level: area.levelRange[0] + ex.depth - 1, areaId: area.id, rng: this.rng.loot });
      for (const it of res.items) { this.give(it.itemId, it.qty, result); ex.gathered[it.itemId] = (ex.gathered[it.itemId] || 0) + it.qty; }
      for (const tier of res.chests) { this.give(`chest_${tier}`, 1, result); result.chests.push(tier); this.bus.emit(EV.CHEST_FOUND, { tier, source: 'site' }); }
      for (const id of res.blueprints) this.giveBlueprint(id, result, `你在${poi.name}裡發現了一張圖紙！`);
      const bp = this.systems.loot.rollBlueprint({ source: 'resource', areaId: area.id, rng: this.rng.loot });
      if (bp) this.giveBlueprint(bp, result, `你在${poi.name}的廢棄箱子裡發現了一張圖紙！`);
      if (res.coins) { this.systems.player.addCoins(res.coins); result.coins = res.coins; }
      this.incStat('itemsGathered', res.items.reduce((a, i) => a + i.qty, 0));
      this.systems.progression.addXp(this.balance.progression.exploreXp.perSiteSearch, { source: 'search' });
      this.log(`🔍 搜索 ${poi.name}：${result.items.map((i) => `${this.registry.item(i.itemId)?.name}×${i.qty}`).join('、') || '什麼都沒找到'}${result.coins ? `、💰${result.coins}` : ''}`, 'loot');
    }
    this.bus.emit(EV.EXPLORE_POI, { poi, result });
  }
  give(itemId, qty, result) {
    const inv = this.systems.inventory;
    const r = inv.add('inventory', itemId, qty);
    if (r.leftover > 0) { this.ex.lootPile.push(this.systems.item.createInstance(itemId, r.leftover)); if (!this._overWarned) { this._overWarned = true; this.log('背包快滿了！放不下的物品會留在地上。', 'warn'); } }
    result.items.push({ itemId, qty, inBag: r.added, onGround: r.leftover });
  }
  giveBlueprint(id, result, text) {
    this.give(id, 1, result);
    result.blueprints.push(id);
    this.systems.blueprint?.discover(id, { source: 'explore' });
    this.bus.emit(EV.BLUEPRINT_FOUND, { blueprintId: id, source: 'explore' });
    this.log(`📜 ${text}（${this.registry.blueprint(id)?.name}）`, 'loot');
  }

  ambush() {
    const ex = this.ex, area = this.area();
    const enemies = this.systems.enemy.spawnGroup(area, ex.depth, { rng: this.rng.explore });
    if (!enemies.length) return;
    this.log('⚠️ 遭到埋伏！', 'bad');
    this.bus.emit(EV.EXPLORE_AMBUSH, { enemies: enemies.map((e) => e.name) });
    this.systems.combat.start(enemies, { origin: 'exploration', returnTo: null });
  }

  goDeeper() {
    const ex = this.ex, area = this.area();
    if (!ex || ex.phase !== 'explore') return { ok: false, reason: 'notExploring' };
    if (ex.activeAction) return { ok: false, reason: 'busy' };
    if (ex.depth >= area.maxDepth) return { ok: false, reason: 'maxDepth' };
    ex.depth++;
    ex.lootPile.length = 0;
    this._overWarned = false;
    const w = this.state.world.areas[area.id]; if (w) w.maxDepth = Math.max(w.maxDepth || 0, ex.depth);
    this.generatePois();
    this.systems.progression.addXp(this.balance.progression.exploreXp.perDepth * ex.depth, { source: 'explore' });
    this.log(`⬇️ 深入 ${area.name} 第 ${ex.depth} 層。怪物更強了。`, 'system');
    this.bus.emit(EV.EXPLORE_DEEPER, { depth: ex.depth });
    return { ok: true, result: { depth: ex.depth } };
  }

  returnHome() {
    const ex = this.ex;
    if (!ex) return { ok: false, reason: 'notExploring' };
    if (ex.phase === 'travelBack') return { ok: false, reason: 'alreadyReturning' };
    const area = this.area();
    const wasTravellingOut = ex.phase === 'travelOut';   // 先判斷再改 phase
    ex.activeAction = null;
    ex.phase = 'travelBack';
    // 半路折返：回程 = 已經走過的距離；從區域內返回：走完整段路
    ex.travelLeft = Math.max(1, wasTravellingOut ? area.travelTime - ex.travelLeft : area.travelTime);
    ex.travelTotal = ex.travelLeft;
    this.log(`🏠 啟程返回避難所（約 ${this.travelTimeFor(area)} 秒）`, 'system');
    this.bus.emit(EV.EXPLORE_RETURNING, {});
    return { ok: true, result: { travelTime: this.travelTimeFor(area) } };
  }

  onCombatEnd(e) {
    const ex = this.ex;
    if (!ex || e.origin !== 'exploration') return;
    if (e.result === 'win' && e.returnTo?.poiId) {
      const poi = this.poi(e.returnTo.poiId);
      if (poi) { poi.done = true; if (poi.data?.boss) this.state.flags[`boss:${ex.areaId}`] = true; }
    }
    if (e.result === 'dead') this.state.exploration = null;
    this._overWarned = false;
  }
  onStateLoaded() { this._overWarned = false; }
}
