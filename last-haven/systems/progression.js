import { System } from './base.js';
import { EV } from '../core/events-catalog.js';

/**
 * ProgressionSystem：經驗值與升級曲線。升級獎勵由 balance.progression.perLevel 決定，
 * 加成本身在 Player.getStats() 由等級推導（不存絕對值），未來技能樹寫 player.bonus。
 * 擁有：player.xp / player.level。
 */
export class ProgressionSystem extends System {
  constructor(ctx) { super(ctx, 'progression'); }

  init() {
    this.bus.on(EV.COMBAT_ENEMY_KILLED, ({ enemy }) => { if (enemy?.xp) this.addXp(enemy.xp, { source: 'kill' }); });
  }

  get cfg() { return this.balance.progression; }
  xpToNext(level = this.state.player.level) {
    return Math.round(this.cfg.xpBase * Math.pow(this.cfg.xpGrowth, level - 1));
  }
  /** 總累積 XP（顯示用） */
  addXp(amount, { source = 'xp' } = {}) {
    const p = this.state.player;
    if (!(amount > 0)) return 0;
    const gain = Math.max(1, Math.round(amount * this.modifiers.resolve('xpGain', 1)));
    p.xp += gain;
    const ups = [];
    while (p.level < this.cfg.maxLevel && p.xp >= this.xpToNext(p.level)) {
      p.xp -= this.xpToNext(p.level);
      p.level += 1;
      const gains = { ...this.cfg.perLevel };
      // 升級時回復新增的最大生命（不重算全額）
      p.hp = Math.min(this.systems.player.maxHp, p.hp + (gains.maxHp || 0));
      ups.push(p.level);
      this.bus.emit(EV.PLAYER_LEVELUP, { level: p.level, gains });
      this.bus.emit(EV.PLAYER_STATS_CHANGED, {});
    }
    if (p.level >= this.cfg.maxLevel) p.xp = Math.min(p.xp, this.xpToNext(p.level) - 1);
    this.bus.emit(EV.PLAYER_XP, { amount: gain, xp: p.xp, next: this.xpToNext(p.level), source, levelUps: ups });
    return gain;
  }
  progress() {
    const p = this.state.player;
    return { xp: p.xp, next: this.xpToNext(p.level), pct: Math.min(1, p.xp / this.xpToNext(p.level)) };
  }
}
