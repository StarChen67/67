import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { isHome } from '../game/selectors.js';

/**
 * RaidSystem：週期性怪物襲擊。警告 → 波次到達 → 前排與玩家戰鬥（CombatSystem）/ 其餘攻擊牆→設施→核心 → 炮塔輸出 → 勝利獎勵。
 * 擁有：state.raid = { nextAt, count, active }。核心 HP 歸零由 ShelterSystem 發 shelter:destroyed → Game 判定失敗。
 */
export class RaidSystem extends System {
  constructor(ctx) { super(ctx, 'raid'); }

  init() {
    this.bus.on(EV.COMBAT_END, (e) => this.onCombatEnd(e));
    this.bus.on(EV.EXPLORE_HOME, () => { if (this.active) this.log('你回到避難所——怪物還在攻擊！', 'bad'); });
    this.bus.on(EV.SHELTER_DESTROYED, () => { if (this.active) this.finish('lost'); });
  }

  get cfg() { return this.balance.raid; }
  get active() { return this.state.raid.active; }

  difficulty(mult = 1) {
    const d = this.cfg.difficulty;
    return (d.base + d.perDay * this.clock.day + d.perPlayerLevel * this.state.player.level + d.perShelterLevel * this.state.shelter.level) * mult;
  }
  templateFor(diff) {
    const list = this.registry.list('raids').filter((r) => r.minDifficulty <= diff).sort((a, b) => b.minDifficulty - a.minDifficulty);
    return list[0] || this.registry.list('raids')[0];
  }
  warningSec() { return this.cfg.warningSec + (this.systems.building?.totalEffect('raidWarningSec') || 0); }
  scheduleNext() {
    const days = Math.max(this.cfg.intervalMinDays, this.cfg.intervalDays - this.state.raid.count * this.cfg.intervalDecayPerRaid);
    this.state.raid.nextAt = this.clock.time + days * this.balance.time.dayLength * this.rng.world.range(0.85, 1.15);
    this.bus.emit(EV.RAID_SCHEDULED, { at: this.state.raid.nextAt });
  }
  onNewGame() {
    this.state.raid.nextAt = this.clock.dayToTime(this.cfg.firstDay) + this.rng.world.range(0, this.balance.time.dayLength * 0.5);
  }

  /** 立即進入警告階段（排程到期或事件觸發） */
  trigger({ difficultyMult = 1 } = {}) {
    if (this.active) return { ok: false, reason: 'raidActive' };
    const diff = this.difficulty(difficultyMult);
    const tpl = this.templateFor(diff);
    // 怪物等級以玩家等級為基準（難度只決定樣板與波數），避免第一次襲擊就出現遠高於玩家的怪
    const level = Math.max(1, Math.round(this.state.player.level * this.cfg.levelPlayerFactor + this.clock.day * this.cfg.levelDayFactor + (difficultyMult - 1) * 3));
    const warn = this.warningSec();
    this.state.raid.active = { templateId: tpl.id, difficulty: Math.round(diff * 100) / 100, level, wave: 0, waves: tpl.waves.length, queue: [], phase: 'warning', warningLeft: warn, waveDelayLeft: 0, playerEngaged: false, damageDealt: { wall: 0, buildings: 0, core: 0 }, kills: 0, startedAt: this.clock.time };
    this.log(`🚨 警告：怪物群（${tpl.name}，約 Lv.${level}）將在 ${Math.round(warn)} 秒後抵達！修理、備彈、補血！`, 'bad');
    this.bus.emit(EV.RAID_WARNING, { inSec: warn, difficulty: diff, template: tpl.id, level });
    return { ok: true, result: { template: tpl.id, difficulty: diff, level, warningSec: warn } };
  }

  begin() {
    const a = this.active;
    a.phase = 'active';
    this.log('🚨 怪物群抵達避難所！', 'bad');
    this.bus.emit(EV.RAID_START, { waves: a.waves, level: a.level });
    this.spawnWave();
  }
  spawnWave() {
    const a = this.active, tpl = this.registry.raid(a.templateId);
    const w = tpl.waves[a.wave];
    if (!w) return false;
    for (const m of w.monsters) for (let i = 0; i < m.count; i++) a.queue.push(this.systems.enemy.spawn(m.monsterId, a.level + a.wave + (m.levelOffset || 0), { rng: this.rng.world }));
    a.wave += 1;
    a.waveDelayLeft = tpl.waves[a.wave]?.delay ?? 0;
    this.log(`第 ${a.wave} / ${a.waves} 波：${w.monsters.map((m) => `${this.registry.monster(m.monsterId)?.icon}${this.registry.monster(m.monsterId)?.name}×${m.count}`).join('、')}`, 'combat');
    this.bus.emit(EV.RAID_WAVE, { wave: a.wave, count: a.queue.length });
    return true;
  }

  engage() {
    const a = this.active;
    if (!a || a.phase !== 'active' || this.state.combat || !isHome(this.state) || this.state.player.hp <= 0) return;
    if (!a.queue.length) return;
    const frontN = a.difficulty < this.cfg.frontLineDifficulty ? 1 : this.cfg.frontLine;
    const front = a.queue.splice(0, frontN);
    a.playerEngaged = true;
    this.systems.combat.start(front, { origin: 'raid' });
  }

  onCombatEnd(e) {
    const a = this.active;
    if (!a || e.origin !== 'raid') return;
    a.playerEngaged = false;
    if (e.result === 'win') { a.kills += 1; }
    // 下一批
    if (e.result !== 'dead') this.engage();
  }

  update(dt) {
    const r = this.state.raid;
    if (!r.active) {
      if (this.clock.time >= r.nextAt) this.trigger();
      return;
    }
    const a = r.active;
    if (a.phase === 'warning') {
      a.warningLeft -= dt;
      if (a.warningLeft <= 0) this.begin();
      return;
    }
    // 波次推進
    const tpl = this.registry.raid(a.templateId);
    if (a.wave < a.waves) {
      a.waveDelayLeft -= dt;
      if (a.waveDelayLeft <= 0) this.spawnWave();
    }
    void tpl;
    // 前排與玩家交戰
    this.engage();
    // 其餘怪物攻擊結構；炮塔輸出
    this.structurePhase(dt);
    this.turretPhase(dt);
    // 結束判定
    const combatEnemies = this.state.combat?.origin === 'raid' ? this.state.combat.enemies.length : 0;
    if (a.wave >= a.waves && !a.queue.length && !combatEnemies) this.finish('won');
  }

  structurePhase(dt) {
    const a = this.active;
    if (!a.queue.length) return;
    const B = this.systems.building, S = this.systems.shelter;
    const def = S.defense() * this.cfg.coreDefenseFactor;
    const away = isHome(this.state) ? 1 : this.cfg.awayStructureMult;
    let dmg = 0;
    for (const e of a.queue) dmg += Math.max(0.5, e.attack * this.cfg.structureAttackMult * e.attackSpeed - def) * dt * away;
    dmg *= this.modifiers.resolve('raidDamage', 1);
    if (dmg <= 0) return;
    const wall = B.wall();
    if (wall) { a.damageDealt.wall += dmg; a._acc = (a._acc || 0) + dmg; if (a._acc >= 1) { const n = Math.floor(a._acc); a._acc -= n; B.damage('wall', n, { source: 'raid' }); this.bus.emit(EV.RAID_STRUCTURE_HIT, { target: 'wall', id: 'wall', damage: n }); } return; }
    const targets = B.targetableBuildings();
    if (targets.length && this.rng.world.chance(0.5)) {
      const t = this.rng.world.pick(targets);
      a.damageDealt.buildings += dmg; a._accB = (a._accB || 0) + dmg;
      if (a._accB >= 1) { const n = Math.floor(a._accB); a._accB -= n; B.damage(t.id, n, { source: 'raid' }); this.bus.emit(EV.RAID_STRUCTURE_HIT, { target: 'building', id: t.id, damage: n }); }
      return;
    }
    a.damageDealt.core += dmg; a._accC = (a._accC || 0) + dmg;
    if (a._accC >= 1) { const n = Math.floor(a._accC); a._accC -= n; S.damage(n, { source: 'raid', silent: true }); this.bus.emit(EV.RAID_STRUCTURE_HIT, { target: 'core', id: 'core', damage: n }); }
  }

  turretPhase(dt) {
    const a = this.active;
    const dps = this.systems.building.turretDps();
    if (dps <= 0) return;
    // 優先打隊列最前面的，沒有隊列則打與玩家交戰的敵人
    let target = a.queue[0] || (this.state.combat?.origin === 'raid' ? this.state.combat.enemies[0] : null);
    if (!target) return;
    a._accT = (a._accT || 0) + dps * dt;
    if (a._accT < 1) return;
    const n = Math.floor(a._accT); a._accT -= n;
    if (a.queue.includes(target)) {
      target.hp -= n;
      if (target.hp <= 0) { a.queue.splice(a.queue.indexOf(target), 1); a.kills += 1; this.incStat('kills'); this.log(`🗼 炮塔擊毀 ${target.icon}${target.name}`, 'combat'); this.systems.loot.dropFor(target); this.systems.progression.addXp(Math.round(target.xp * 0.5), { source: 'turret' }); }
    } else this.systems.combat.damageEnemy(target, n, { source: 'turret', ignoreDefense: true });
  }

  finish(result) {
    const a = this.active;
    if (!a) return;
    this.state.raid.active = null;
    this.state.raid.count += 1;
    if (result === 'won') {
      this.incStat('raidsSurvived');
      const rng = this.rng.loot;
      const rewards = [];
      if (rng.chance(this.cfg.rewardChestChance)) {
        const tier = this.systems.loot.rollChestTier({ common: 50, fine: 35, rare: 12, epic: 3, legendary: 0 }, a.level, null, rng);
        this.systems.inventory.grant(`chest_${tier}`, 1, { source: 'raid' });
        rewards.push(this.registry.chest(tier)?.name);
      }
      this.systems.progression.addXp(Math.round(20 * a.difficulty), { source: 'raid' });
      this.log(`🎉 擊退了襲擊（第 ${this.state.raid.count} 次）！${rewards.length ? '獎勵：' + rewards.join('、') : ''} 記得修理受損的設施。`, 'good');
    } else {
      this.log('避難所在襲擊中淪陷……', 'bad');
    }
    this.scheduleNext();
    this.bus.emit(EV.RAID_END, { result, count: this.state.raid.count, damage: a.damageDealt });
  }

  /** UI 用摘要 */
  status() {
    const a = this.active;
    if (!a) return { active: false, nextIn: Math.max(0, this.state.raid.nextAt - this.clock.time) };
    return { active: true, phase: a.phase, warningLeft: a.warningLeft, wave: a.wave, waves: a.waves, queue: a.queue.length, level: a.level, template: this.registry.raid(a.templateId)?.name, kills: a.kills, engaged: !!(this.state.combat && this.state.combat.origin === 'raid'), damage: a.damageDealt };
  }
}
