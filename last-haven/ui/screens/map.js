import { esc, intentBtn } from '../components.js';
import * as Explore from './explore.js';
import { isHome } from '../../game/selectors.js';

/** 地圖畫面：程式繪製的世界地圖 + 區域卡片。探索中則顯示探索畫面。 */
export function render(app) {
  const st = app.game.state;
  if (st.exploration || st.combat) return Explore.render(app);
  const list = app.game.systems.exploration.areas();
  const inv = app.game.systems.inventory;
  const p = st.player;
  const food = inv.items('inventory').filter((i) => app.game.registry.item(i.itemId)?.type === 'food').reduce((a, i) => a + i.qty, 0);
  const water = inv.items('inventory').filter((i) => app.game.registry.item(i.itemId)?.type === 'water').reduce((a, i) => a + i.qty, 0);
  const warn = (!food || !water) ? `<div class="alert disaster">⚠️ 背包裡${!food ? '沒有食物' : ''}${!food && !water ? '、' : ''}${!water ? '沒有水' : ''}。外出時飢餓與口渴照樣上升，請先到倉庫補給。</div>` : '';
  return `
    <div class="card"><h2>世界地圖</h2>
      <canvas class="scene" id="mapCanvas" width="900" height="420"></canvas>
      <div class="small dim" style="margin-top:6px">背包：🍖 食物 ${food} · 💧 水 ${water} · 🎒 ${inv.weight('inventory').toFixed(1)}/${inv.carryCapacity()} · 飢餓 ${Math.round(p.hunger)} · 口渴 ${Math.round(p.thirst)}</div>
    </div>
    ${warn}
    <div class="grid3">
      ${list.map(({ def: a, unlocked, reason, world, travelTime }) => `
        <div class="areaCard ${unlocked ? '' : 'locked'}">
          <div class="row between"><span class="nm">${a.icon} ${esc(a.name)}</span><span class="danger">${'☠'.repeat(Math.min(5, Math.ceil(a.danger / 2)))} 危險 ${a.danger}</span></div>
          <div class="small dim">怪物 Lv.${a.levelRange[0]}–${a.levelRange[1]} · 旅途 ${travelTime} 秒 · 最深 ${a.maxDepth} 層${world.visits ? ` · 到訪 ${world.visits} 次（最深第 ${world.maxDepth} 層）` : ''}</div>
          <div class="small">${esc(a.desc)}</div>
          <div class="small dim">資源：${a.resources.slice(0, 6).map((r) => app.game.registry.item(r.itemId)?.icon).join(' ')} · 圖紙：${Object.keys(a.blueprintPool).map(typeLabel).join('/')}${a.bossId ? ` · Boss：${app.game.registry.monster(a.bossId)?.icon}` : ''}</div>
          <div class="row" style="margin-top:4px">${unlocked ? intentBtn('🚶 出發', 'explore', { areaId: a.id }, 'b-sm b-gold', !isHome(st)) : `<span class="tag warn">🔒 ${esc(reason)}</span>`}</div>
        </div>`).join('')}
    </div>`;
}

const TYPE_LABEL = { weapon: '武器', armor: '防具', tool: '工具', medicine: '醫療', building: '建築', defense: '防禦', shelter: '避難所', utility: '功能', special: '特殊' };
export const typeLabel = (t) => TYPE_LABEL[t] || t;

export function afterRender(app) {
  const st = app.game.state;
  if (st.exploration || st.combat) return Explore.afterRender?.(app);
  const cv = app.root.querySelector('#mapCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.fillStyle = '#0a0e15'; ctx.fillRect(0, 0, W, H);
  // 背景格線
  ctx.strokeStyle = '#141c28'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const list = app.game.systems.exploration.areas();
  const cx = W / 2, cy = H / 2;
  const pos = list.map((a, i) => {
    const ang = -Math.PI / 2 + (i / list.length) * Math.PI * 2;
    const r = 90 + a.def.danger * 12;
    return { a, x: cx + Math.cos(ang) * r * 2.1, y: cy + Math.sin(ang) * r * 0.85 };
  });
  // 路徑
  for (const p of pos) {
    ctx.strokeStyle = p.a.unlocked ? '#3a4a5c' : '#222a36'; ctx.setLineDash(p.a.unlocked ? [] : [4, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  // 避難所
  ctx.fillStyle = '#3ddc97'; ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fill();
  ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🏚️', cx, cy);
  ctx.fillStyle = '#e6ebf5'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('避難所', cx, cy + 30);
  // 區域
  for (const p of pos) {
    const d = p.a.def, danger = d.danger;
    const col = danger <= 2 ? '#3ddc97' : danger <= 4 ? '#ffc84a' : danger <= 6 ? '#ff9d2e' : danger <= 8 ? '#ff5d73' : '#c85dff';
    ctx.globalAlpha = p.a.unlocked ? 1 : 0.4;
    ctx.fillStyle = '#141a23'; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = '18px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(d.icon, p.x, p.y);
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = p.a.unlocked ? '#e6ebf5' : '#8b96a8';
    ctx.fillText(`${d.name}${p.a.unlocked ? '' : ' 🔒'}`, p.x, p.y + 32);
    ctx.font = '10px sans-serif'; ctx.fillStyle = col; ctx.fillText(`Lv.${d.levelRange[0]}–${d.levelRange[1]}`, p.x, p.y + 44);
    if (p.a.world.visits) { ctx.fillStyle = '#5aa9ff'; ctx.beginPath(); ctx.arc(p.x + 15, p.y - 15, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

export function renderLive(app, el) { if (app.game.state.exploration || app.game.state.combat) Explore.renderLive(app, el); }
export function onAction(app, ds, el) { return Explore.onAction(app, ds, el); }
