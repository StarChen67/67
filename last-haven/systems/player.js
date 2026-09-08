import { System } from './base.js';
import { EV } from '../core/events-catalog.js';
import { clamp } from '../core/utils.js';
import { isHome } from '../game/selectors.js';

const STAT_KEYS = ['maxHp', 'attack', 'defense', 'attackSpeed', 'critChance', 'critDamage', 'moveSpeed', 'accuracy', 'dodge', 'armorPen'];
const MOD_KEY = { maxHp: 'playerMaxHp', attack: 'playerAttack', defense: 'playerDefense', attackSpeed: 'attackSpeed', critChance: 'critChance', moveSpeed: 'moveSpeed', accuracy: 'accuracy', dodge: 'dodge' };

/**
 * PlayerSystem：衍生數值、受傷/治療、死亡通知（不寫 gameOver）。
 * 擁有：player.hp / coins / bonus。
 */
export class PlayerSystem extends System {
  constructor(ctx) { super(ctx, 'player'); }

  /** 衍生數值 = base + perLevel×(level−1) + bonus + 裝備 → modifiers */
  getStats() {
    const p = this.state.player;
    const base = this.balance.player.base;
    const per = this.balance.progression.perLevel;
    const eq = this.systems.equipment ? this.systems.equipment.getBonus() : {};
    const out = {};
    for (const k of STAT_KEYS) {
      const baseV = k === 'attackSpeed' && eq.weaponAttackSpeed != null ? eq.weaponAttackSpeed : (base[k] ?? 0);
      let v = baseV + (per[k] ?? 0) * (p.level - 1) + (p.bonus?.[k] ?? 0) + (eq[k] ?? 0);
      if (MOD_KEY[k]) v = this.modifiers.resolve(MOD_KEY[k], v);
      out[k] = v;
    }
    out.maxHp = Math.max(1, Math.round(out.maxHp));
    out.attack = Math.max(1, Math.round(out.attack));
    out.defense = Math.max(0, Math.round(out.defense));
    out.resist = eq.resist || {};
    out.carry = this.systems.inventory ? this.systems.inventory.carryCapacity() : this.balance.inventory.baseCarry;
    return out;
  }
  get maxHp() { return this.getStats().maxHp; }

  /** 受傷。回傳實際扣除的 HP。 */
  damage(amount, { source = 'unknown', ignoreDefense = false, silent = false } = {}) {
    const p = this.state.player;
    if (!(amount > 0) || p.hp <= 0) return 0;
    let dmg = amount;
    if (!ignoreDefense) dmg = Math.max(this.balance.combat.minDamage, amount - this.getStats().defense);
    dmg = Math.min(p.hp, dmg);
    p.hp = clamp(p.hp - dmg, 0, this.maxHp);
    this.bus.emit(EV.PLAYER_DAMAGED, { amount: dmg, source, hp: p.hp, silent });
    if (p.hp <= 0) this.bus.emit(EV.PLAYER_DIED, { reason: 'killed', detail: { source } });
    return dmg;
  }

  heal(amount, { source = 'heal', silent = false, raw = false } = {}) {
    const p = this.state.player;
    if (!(amount > 0) || p.hp <= 0) return 0;
    const max = this.maxHp;
    const eff = raw ? amount : amount * this.modifiers.resolve('healRate', 1);
    const healed = Math.min(max - p.hp, eff);
    if (healed <= 0) return 0;
    p.hp = clamp(p.hp + healed, 0, max);
    this.bus.emit(EV.PLAYER_HEALED, { amount: healed, hp: p.hp, source, silent });
    return healed;
  }

  addCoins(n) {
    const p = this.state.player;
    p.coins = Math.max(0, Math.round((p.coins || 0) + n));
    return p.coins;
  }
  spendCoins(n) {
    const p = this.state.player;
    if ((p.coins || 0) < n) return false;
    p.coins -= n;
    return true;
  }

  hpPct() { return this.state.player.hp / this.maxHp; }

  update(dt) {
    const p = this.state.player;
    const max = this.maxHp;
    if (p.hp > max) p.hp = max;            // maxHp 下降時夾住
    if (isHome(this.state) && !this.state.combat && p.hp < max && p.hp > 0) {
      this.heal(this.balance.survival.homeRegenPerSec * dt, { source: 'rest', silent: true });
    }
  }
}
