import { esc, fmtTime, intentBtn, dataAttrs } from './components.js';

/** 襲擊 / 天災 / 事件 橫幅與事件對話框（掛在 App 的 banner providers）。 */
export function raidBanner(app) {
  const s = app.game.systems.raid.status();
  if (!s.active) return '';
  if (s.phase === 'warning') return `<div class="alert raid">🚨 怪物群（${esc(s.template)}，Lv.${s.level}）將在 <b data-live="raidWarn">${Math.ceil(s.warningLeft)}</b> 秒後抵達！修理、備彈、補血！${app.game.state.exploration ? ' 你還在外面——快回避難所！' : ''}</div>`;
  const B = app.game.systems.building, st = app.game.state;
  const wall = B.wall();
  return `<div class="alert raid" data-action="nav" data-panel="map">🚨 襲擊中！第 ${s.wave}/${s.waves} 波 · 等待中的怪物 ${s.queue} · 已擊殺 ${s.kills}${wall ? ` · 🧱 牆 ${wall.hp}/${B.maxHpOf('wall')}` : ' · 沒有防禦牆！'} · 🏚️ 核心 ${st.shelter.hp}${B.turretDps() ? ` · 🗼 炮塔 ${B.turretDps()} DPS` : ''}${s.engaged ? '' : app.game.state.exploration ? ' · 你不在家，設施正獨自抵抗' : ''}</div>`;
}

export function disasterBanner(app) {
  const list = app.game.systems.disaster.active();
  if (!list.length) return '';
  return list.map((d) => `<div class="alert disaster">${d.def.icon} ${d.phase === 'warning' ? `天災預警：${esc(d.def.name)}將在 ${Math.ceil(d.left)} 秒後來襲` : `${esc(d.def.name)}進行中（剩餘 ${fmtTime(d.left)}）`} — ${esc(d.def.desc)}</div>`).join('');
}

export function eventBanner(app) {
  const p = app.game.systems.event.pendingInfo();
  if (!p) return '';
  return `<div class="alert event" data-action="event:open">${p.def.icon} ${esc(p.def.name)}：${esc(p.def.desc)}（${Math.ceil(p.expiresIn)} 秒後自動選擇）— 點此處理</div>`;
}

export function eventModal(app) {
  const p = app.game.systems.event.pendingInfo();
  if (!p) return null;
  const R = app.game.registry;
  const costText = (c) => !c.cost ? '' : Array.isArray(c.cost) ? `（需要 ${c.cost.map((x) => `${R.item(x.itemId)?.name}×${x.qty}`).join('、')}）` : c.cost.coins ? `（💰${c.cost.coins}）` : '';
  return {
    title: `${p.def.icon} ${p.def.name}`,
    body: `<p>${esc(p.def.desc)}</p><p class="small dim">${Math.ceil(p.expiresIn)} 秒內不決定將自動選擇「${esc(p.choices.find((c) => c.id === app.game.state.events.pending.defaultChoiceId)?.label || '')}」</p>
      <div style="display:flex;flex-direction:column;gap:6px">${p.choices.map((c) => `<button class="${c.afford.ok ? 'b-blue' : ''}" data-action="event:choose" ${dataAttrs({ choiceId: c.id })} ${c.afford.ok ? '' : 'disabled'} style="text-align:left">${esc(c.label)}${c.afford.ok ? '' : ' <span class="tiny">（' + (c.afford.reason === 'coins' ? '瓶蓋不足' : '材料不足') + '）</span>'}</button>`).join('')}</div>`,
    buttons: [{ label: '稍後再說', action: 'modal:close' }],
  };
}
void intentBtn;
