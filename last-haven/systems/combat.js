import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { clamp } from '../core/utils.js';

/**
 * CombatSystem：即時戰鬥狀態機。state.combat 的唯一寫入者。
 *  - 玩家攻擊：手動 intent 或 settings.autoAttack；冷卻 = 1 / attackSpeed
 *  - 怪物攻擊：各自冷卻
 *  - 命中管線 computeHit：hitCheck → baseDamage → armor(armorPen) → crit → clamp（元素/技能階段預留）
 *  - 逃跑：成功率取決於移動速度差與嘗試次數
 * 戰利品在戰鬥中累積於 combat.loot，結束時撿起（放不下的留在 exploration.lootPile）。
 */
export class CombatSystem extends System {
  constructor(ctx) { super(ctx, 'combat'); }

  get combat() { return this.state.combat; }
  get cfg() { return this.balance.combat; }

  start(enemies, { origin = 'exploration', returnTo = null } = {}) {
    if (!enemies || !enemies.length) return { ok: false, reason: 'noEnemies' };
    if (this.state.combat) {
      // 已在戰鬥中：加入隊伍（例如襲擊增援）
      this.state.combat.enemies.push(...enemies);
      return { ok: true, result: { joined: enemies.length } };
    }
    this.state.combat = {
      origin, enemies: [...enemies], targetUid: enemies[0].uid, playerCooldown: 0.3, fleeAttempts: 0,
      loot: [], coins: 0, xp: 0, log: [], returnTo, noAmmoWarned: false, startedAt: this.clock.time,
    };
    this.bus.emit(EV.COMBAT_START, { origin, enemies: enemies.map((e) => ({ uid: e.uid, name: e.name, level: e.level, tier: e.tier })) });
    this.log(`⚔️ 遭遇 ${enemies.map((e) => `${e.icon}${e.name} Lv.${e.level}`).join('、')}`, 'combat');
    return { ok: true };
  }

  startEncounter({ monsterId, level, count = 1, origin = 'event' }) {
    const lv = level ?? Math.max(1, this.state.player.level);
    const enemies = [];
    for (let i = 0; i < count; i++) enemies.push(this.systems.enemy.spawn(monsterId, lv));
    return this.start(enemies, { origin });
  }

  target() {
    const c = this.combat;
    if (!c) return null;
    let t = c.enemies.find((e) => e.uid === c.targetUid && e.hp > 0);
    if (!t) { t = c.enemies.find((e) => e.hp > 0) || null; if (t) c.targetUid = t.uid; }
    return t;
  }
  setTarget(uid) {
    const c = this.combat;
    if (!c) return { ok: false, reason: 'notInCombat' };
    const e = c.enemies.find((x) => x.uid === uid && x.hp > 0);
    if (!e) return { ok: false, reason: 'noTarget' };
    c.targetUid = uid;
    return { ok: true };
  }

  /** 命中管線（純函式，rng 注入） */
  computeHit(att, def, rng, { mult = 1 } = {}) {
    const hitChance = clamp((att.accuracy ?? 0.95) - (def.dodge ?? 0), 0.05, 1);
    if (!rng.chance(hitChance)) return { miss: true, crit: false, damage: 0 };
    let dmg = (att.attack || 0) * mult;
    const armor = (def.defense || 0) * (1 - clamp(att.armorPen || 0, 0, 1));
    dmg = Math.max(this.cfg.minDamage, dmg - armor);
    const crit = rng.chance(clamp(att.critChance || 0, 0, 1));
    if (crit) dmg *= att.critDamage || 1.5;
    // 元素傷害 / 狀態異常階段預留：att.element, def.resist
    return { miss: false, crit, damage: Math.max(this.cfg.minDamage, Math.round(dmg)) };
  }

  playerAttack({ mult = 1, source = 'attack' } = {}) {
    const c = this.combat;
    if (!c) return { ok: false, reason: 'notInCombat' };
    if (c.playerCooldown > 0) return { ok: false, reason: 'cooldown', left: c.playerCooldown };
    const t = this.target();
    if (!t) return { ok: false, reason: 'noTarget' };
    const stats = this.systems.player.getStats();
    // 彈藥：遠程武器需消耗 1 發，沒有則以 noAmmoMult 揮擊
    const w = this.systems.equipment.weapon();
    let dmgMult = mult;
    if (w && w.ammo) {
      if (this.systems.inventory.count('inventory', w.ammo) > 0) this.systems.inventory.remove('inventory', w.ammo, 1);
      else {
        dmgMult *= this.cfg.noAmmoMult;
        if (!c.noAmmoWarned) { c.noAmmoWarned = true; this.log(`沒有${this.registry.item(w.ammo)?.name || '彈藥'}！只能用槍托攻擊（傷害 ${Math.round(this.cfg.noAmmoMult * 100)}%）`, 'warn'); }
      }
    }
    c.playerCooldown = 1 / Math.max(0.05, stats.attackSpeed);
    const hit = this.computeHit(stats, t, this.rng.combat, { mult: dmgMult });
    this.bus.emit(EV.COMBAT_HIT, { attacker: 'player', targetUid: t.uid, damage: hit.damage, crit: hit.crit, miss: hit.miss, source });
    if (hit.miss) { c.log.push(`你的攻擊落空了`); return { ok: true, result: { miss: true } }; }
    this.damageEnemy(t, hit.damage, { source: 'player', ignoreDefense: true });
    c.log.push(`你${hit.crit ? '暴擊' : '攻擊'} ${t.name} 造成 ${hit.damage}`);
    return { ok: true, result: { damage: hit.damage, crit: hit.crit, killed: t.hp <= 0 } };
  }

  /** 技能預留：資料驅動 { id, cooldown, effects } → 走 EffectRegistry（damageEnemy / enemyStatus） */
  useSkill() { return { ok: false, reason: 'notImplemented' }; }

  damageTarget(amount, { source = 'skill' } = {}) {
    const t = this.target();
    if (!t) return 0;
    return this.damageEnemy(t, amount, { source, ignoreDefense: true });
  }
  applyStatusToTarget(id, duration) {
    const t = this.target();
    if (!t) return null;
    return this.systems.statusEffects.apply(id, { duration, subject: t, source: 'skill' });
  }

  damageEnemy(enemy, amount, { source = 'unknown', ignoreDefense = false } = {}) {
    if (!enemy || enemy.hp <= 0 || !(amount > 0)) return 0;
    // 不四捨五入：持續傷害（中毒/流血/炮塔）每步不足 1 點時會被抹平
    let dmg = ignoreDefense ? amount : Math.max(this.cfg.minDamage, amount - enemy.defense);
    dmg = Math.min(enemy.hp, dmg);
    enemy.hp = Math.max(0, enemy.hp - dmg);
    if (enemy.hp <= 0) this.onEnemyKilled(enemy, source);
    return dmg;
  }

  enemyAttack(e) {
    const stats = this.systems.player.getStats();
    const hit = this.computeHit({ attack: e.attack, accuracy: e.accuracy, critChance: 0.03, critDamage: 1.5, armorPen: 0 }, { defense: stats.defense, dodge: stats.dodge }, this.rng.combat);
    this.bus.emit(EV.COMBAT_HIT, { attacker: 'enemy', enemyUid: e.uid, damage: hit.damage, crit: hit.crit, miss: hit.miss });
    if (hit.miss) { this.combat?.log.push(`${e.name} 的攻擊被你閃開了`); return 0; }
    this.systems.player.damage(hit.damage, { source: `monster:${e.defId}`, ignoreDefense: true });
    this.combat?.log.push(`${e.name} ${hit.crit ? '重擊' : '攻擊'}你造成 ${hit.damage}`);
    const def = this.registry.monster(e.defId);
    if (def?.onHitStatus && this.rng.combat.chance(def.onHitStatus.chance)) {
      this.systems.statusEffects.apply(def.onHitStatus.id, { duration: def.onHitStatus.duration, source: `monster:${e.defId}` });
    }
    return hit.damage;
  }

  onEnemyKilled(enemy, source) {
    const c = this.combat;
    if (c) c.enemies = c.enemies.filter((x) => x.uid !== enemy.uid);
    this.incStat('kills');
    if (enemy.tier === 'elite') this.incStat('eliteKills');
    if (enemy.tier === 'boss') this.incStat('bossKills');
    if (c) c.xp += enemy.xp;
    if (this.state.exploration) { const a = this.state.world.areas[this.state.exploration.areaId]; if (a) a.kills = (a.kills || 0) + 1; }
    this.log(`擊敗 ${enemy.icon}${enemy.name} Lv.${enemy.level}（+${enemy.xp} XP）`, enemy.tier === 'boss' ? 'good' : 'combat');
    this.bus.emit(EV.COMBAT_ENEMY_KILLED, { enemy, origin: c?.origin || 'none', source });
  }

  flee() {
    const c = this.combat;
    if (!c) return { ok: false, reason: 'notInCombat' };
    if (c.origin === 'raid') return { ok: false, reason: 'cannotFleeRaid' };
    const stats = this.systems.player.getStats();
    const alive = c.enemies.filter((e) => e.hp > 0);
    const avgSpeed = alive.reduce((a, e) => a + e.moveSpeed, 0) / Math.max(1, alive.length);
    const chance = clamp(this.cfg.fleeBase + (stats.moveSpeed - avgSpeed) * this.cfg.fleeSpeedFactor - c.fleeAttempts * 0.1, this.cfg.fleeMin, this.cfg.fleeMax);
    c.fleeAttempts++;
    if (this.rng.combat.chance(chance)) {
      this.log('你成功逃離了戰鬥。', 'warn');
      this.bus.emit(EV.COMBAT_FLED, { success: true });
      this.end('fled');
      return { ok: true, result: { success: true, chance } };
    }
    this.log('逃跑失敗！敵人趁機攻擊。', 'bad');
    for (const e of alive.slice(0, this.cfg.fleeFailPenalty)) this.enemyAttack(e);
    this.bus.emit(EV.COMBAT_FLED, { success: false });
    return { ok: false, reason: 'fleeFailed', chance };
  }

  update(dt) {
    const c = this.combat;
    if (!c) return;
    const p = this.state.player;
    if (p.hp <= 0) { this.end('dead'); return; }
    // 敵人狀態效果（中毒等）
    for (const e of [...c.enemies]) {
      if (e.statusEffects?.length) this.systems.statusEffects.tick(e, dt);
      if (e.hp <= 0 && c.enemies.includes(e)) this.onEnemyKilled(e, 'status');
    }
    if (!c.enemies.length) { this.end('win'); return; }
    // 玩家
    c.playerCooldown -= dt;
    if (this.state.settings.autoAttack && c.playerCooldown <= 0) this.playerAttack();
    if (!this.combat) return; // 擊殺後可能已結束
    if (!this.combat.enemies.length) { this.end('win'); return; }
    // 敵人
    for (const e of [...this.combat.enemies]) {
      if (e.hp <= 0) continue;
      const stunned = e.statusEffects?.some((s) => s.id === 'stunned');
      e.cooldown -= dt;
      if (e.cooldown <= 0 && !stunned) {
        e.cooldown = 1 / Math.max(0.05, e.attackSpeed);
        this.enemyAttack(e);
        if (this.state.player.hp <= 0) { this.end('dead'); return; }
      }
    }
  }

  /** 結束戰鬥：撿起戰利品、發事件、清空 combat */
  end(result) {
    const c = this.combat;
    if (!c) return;
    const summary = { result, origin: c.origin, xp: c.xp, coins: c.coins, loot: c.loot.map((i) => ({ itemId: i.itemId, qty: i.qty })), returnTo: c.returnTo, remaining: c.enemies.length };
    const inv = this.systems.inventory;
    if (result === 'win' || result === 'fled') {
      const pile = [...c.loot];
      c.loot.length = 0;
      this.state.combat = null;
      const leftovers = [];
      for (const inst of pile) {
        if (c.origin === 'raid') { inv.grant(inst.itemId, inst.qty, { quality: inst.quality, source: 'raid' }); continue; }
        const r = inv.addInstance('inventory', inst);
        if (!r.ok) {
          if (r.added > 0) inst.qty = r.leftover;
          leftovers.push(inst);
        }
      }
      if (leftovers.length) {
        const ex = this.state.exploration;
        if (ex) { ex.lootPile.push(...leftovers); this.log(`背包放不下，${leftovers.length} 種戰利品留在地上。`, 'warn'); }
      }
      if (result === 'win') this.log(`戰鬥勝利！${summary.loot.length ? '獲得戰利品。' : ''}`, 'good');
    } else {
      this.state.combat = null;
    }
    this.bus.emit(EV.COMBAT_END, summary);
  }
}
