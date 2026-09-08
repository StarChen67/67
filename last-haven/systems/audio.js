import { System } from './base.js';
import { EV } from '../core/events-catalog.js';

/** 事件 → 音效名稱。實際播放器（WebAudio）由 UI 注入 setPlayer()。 */
export const SOUND_MAP = {
  [EV.COMBAT_HIT]: (p) => (p.attacker === 'player' ? (p.crit ? 'crit' : 'hit') : 'hurt'),
  [EV.COMBAT_ENEMY_KILLED]: () => 'kill',
  [EV.PLAYER_LEVELUP]: () => 'levelup',
  [EV.CHEST_OPENED]: () => 'chest',
  [EV.BLUEPRINT_FOUND]: () => 'blueprint',
  [EV.BLUEPRINT_LEARNED]: () => 'learn',
  [EV.CRAFT_DONE]: () => 'craft',
  [EV.SHELTER_UPGRADED]: () => 'upgrade',
  [EV.BUILDING_BUILT]: () => 'build',
  [EV.RAID_WARNING]: () => 'alarm',
  [EV.RAID_START]: () => 'alarm',
  [EV.DISASTER_START]: () => 'disaster',
  [EV.GAME_OVER]: () => 'gameover',
  [EV.ITEM_USED]: () => 'use',
  [EV.SURVIVAL_WARNING]: () => 'warn',
};

export class AudioSystem extends System {
  constructor(ctx) { super(ctx, 'audio'); this.player = null; this.enabled = true; }
  setPlayer(player) { this.player = player; }
  init() {
    for (const [ev, fn] of Object.entries(SOUND_MAP)) {
      this.bus.on(ev, (payload) => {
        if (!this.enabled || !this.player) return;
        if (payload && payload.silent) return;
        const name = fn(payload || {});
        if (name) { try { this.player.play(name); } catch { /* ignore */ } }
      });
    }
  }
}
