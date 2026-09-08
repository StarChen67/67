import { bar, esc, fmtClock } from './components.js';
import { getLocation, LOCATION_LABEL } from '../game/selectors.js';

export function renderTopbar(app) {
  const g = app.game, st = g.state, c = g.clock;
  const loc = getLocation(st);
  return `<div><b>第 ${c.day} 天</b> ${fmtClock(c.hour)} ${c.isNight ? '🌙' : '☀️'} · <b>${LOCATION_LABEL[loc]}</b></div>
    <div>${esc(st.player.name)} · 💰${st.player.coins} · <span class="dim">🔬${st.blueprints.researchPoints}</span></div>`;
}

export function renderHud(app) {
  const g = app.game, st = g.state, p = st.player;
  const stats = g.systems.player.getStats();
  const warn = g.systems.survival.warnings();
  const prog = g.systems.progression.progress();
  const inv = g.systems.inventory;
  const w = g.systems.equipment.weapon();
  const carryOver = inv.isOver('inventory');
  return `
    <div class="hud-lv">Lv.${p.level}<div class="xp">XP ${prog.xp}/${prog.next}</div></div>
    ${bar('hp', p.hp, stats.maxHp, { label: 'HP', warn: warn.hp })}
    ${bar('hunger', p.hunger, 100, { label: '飢餓', warn: warn.hunger })}
    ${bar('thirst', p.thirst, 100, { label: '口渴', warn: warn.thirst })}
    <div class="hud-side">
      <span title="攻擊力">⚔️ ${stats.attack}</span><span title="防禦力">🛡️ ${stats.defense}</span>
      <span title="武器">${w ? `${w.def.icon} ${esc(w.def.name)}` : '👊 徒手'}</span>
      <span class="${carryOver ? 'warn' : ''}" title="負重">🎒 ${inv.weight('inventory').toFixed(1)}/${inv.carryCapacity()}</span>
    </div>`;
}

export function renderStatusRow(app) {
  const list = app.game.systems.statusEffects.list();
  if (!list.length) return '';
  return list.map((s) => `<span class="${s.def?.kind || ''}" title="${esc(s.def?.desc || '')}">${s.def?.icon || ''} ${esc(s.def?.name || s.id)}${s.stacks > 1 ? ` ×${s.stacks}` : ''}${s.left != null ? ` <span class="dim">${Math.ceil(s.left)}s</span>` : ''}</span>`).join('');
}
