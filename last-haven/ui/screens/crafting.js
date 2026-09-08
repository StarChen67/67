import { esc, intentBtn, fmtTime } from '../components.js';
import { reasonLines } from './shelter.js';
import { isHome } from '../../game/selectors.js';

const TABS = [['all', '全部'], ['weapon', '武器'], ['armor', '防具'], ['tool', '工具'], ['medicine', '醫療'], ['shelter', '避難所'], ['defense', '防禦'], ['special', '特殊']];
const STATION = { workbench: '工作台', medical: '醫療站', purifier: '淨水器' };

/** 工作台 UI（規格四十三）：分類、每項顯示名稱/圖示/品質/所需工作台/圖紙/材料（擁有/需要）/製作時間，缺什麼直接寫。 */
export function render(app) {
  const g = app.game, st = g.state, B = g.systems.building, C = g.systems.crafting, R = g.registry;
  const ui = app.ui.crafting || (app.ui.crafting = { tab: 'all', showLocked: true });
  const home = isHome(st) && !st.combat;
  const rows = C.list(ui.tab).filter((x) => ui.showLocked || x.known);
  const stations = ['workbench', 'medical', 'purifier'].map((s) => `<span class="tag ${B.stationLevel(s) ? 'ok' : ''}">${STATION[s]} Lv.${B.stationLevel(s)}</span>`).join('');
  return `
    <div class="card">
      <div class="row between"><h3>🔨 製作</h3><div class="row">${stations}</div></div>
      ${!home ? '<div class="reason">只能在避難所製作（探索中製作佇列會暫停）。</div>' : ''}
      ${!B.workbenchLevel() ? '<div class="reason">尚未建造工作台：只能徒手製作繃帶、熟肉等簡單物品。到「避難所」建造工作台。</div>' : ''}
      ${renderQueue(app)}
    </div>
    <div class="tabs">${TABS.map(([k, l]) => `<button class="${ui.tab === k ? 'active' : ''}" data-action="craft:tab" data-tab="${k}">${l}</button>`).join('')}
      <button class="b-xs" data-action="craft:toggleLocked">${ui.showLocked ? '隱藏未學會' : '顯示未學會'}</button></div>
    <div class="card">${rows.length ? rows.map((x) => recipeRow(app, x)).join('') : '<p class="small dim">此分類沒有配方。</p>'}</div>`;
}

function recipeRow(app, { recipe: r, item, check, known }) {
  const g = app.game, R = g.registry, inv = g.systems.inventory, B = g.systems.building;
  const q = item.quality || 'common';
  const st = r.requiredStation;
  const have = st ? B.stationLevel(st.station) : 0;
  const stationTxt = st ? `<span class="${have >= st.level ? 'have' : 'lack'}">${STATION[st.station] || st.station} Lv.${st.level}${have < st.level ? `（目前 Lv.${have}）` : ''}</span>` : '<span class="dim">徒手</span>';
  const bpIds = g.systems.blueprint.blueprintsForRecipe(r.id);
  const bpTxt = r.defaultUnlocked ? '<span class="have">不需圖紙</span>' : known ? '<span class="have">✓ 已學習圖紙</span>' : `<span class="lack">✗ 需要圖紙：${bpIds.map((id) => esc(R.blueprint(id)?.name)).join('/')}</span>`;
  const mats = r.requiredItems.map((c) => { const h = inv.countAll(c.itemId); const d = R.item(c.itemId); return `<span class="${h >= c.qty ? 'have' : 'lack'}">${d?.icon || ''}${esc(d?.name)} ${h}/${c.qty}</span>`; }).join('　');
  const time = Math.round(r.craftingTime / g.modifiers.resolve('craftSpeed', 1));
  const canMany = check.ok && r.resultQty >= 1 && item.stackMax > 1;
  return `<div class="listRow"><div style="flex:1">
      <div class="nm"><span class="q-${q}">${item.icon} ${esc(item.name)}</span>${r.resultQty > 1 ? ` <span class="dim">×${r.resultQty}</span>` : ''} <span class="tiny dim">${g.systems.item.qualityLabel(q)} · ${fmtTime(time)}</span></div>
      <div class="meta">${stationTxt} · ${bpTxt}</div>
      <div class="need">${mats}</div>
      ${check.ok ? '' : `<div class="reason">${reasonLines(app, check.reasons).join('；')}</div>`}
    </div><div class="acts">${intentBtn('製作', 'craft', { recipeId: r.id, qty: 1 }, 'b-sm b-gold', !check.ok || !isHome(g.state) || !!g.state.combat)}${canMany ? intentBtn('×5', 'craft', { recipeId: r.id, qty: 5 }, 'b-sm', !g.systems.crafting.check(r.id, 5).ok || !isHome(g.state)) : ''}</div></div>`;
}

function renderQueue(app) {
  const g = app.game, R = g.registry, q = g.state.crafting.queue;
  if (!q.length) return '';
  return `<div id="craftQueue" style="margin-top:8px">${q.map((j, i) => { const r = R.recipe(j.recipeId), it = R.item(r.resultItemId); return `<div class="listRow"><div style="flex:1"><div class="nm">${it.icon} ${esc(it.name)}${j.qty > 1 ? ` ×${j.qty}` : ''} ${i === 0 ? '<span class="tag ok">製作中</span>' : '<span class="tag">排隊</span>'}</div><div class="progress"><div class="fill" data-live="job:${j.uid}" style="width:${((j.total - j.left) / j.total * 100).toFixed(0)}%"></div></div><div class="tiny dim" data-live="jobt:${j.uid}">剩餘 ${fmtTime(j.left)}</div></div>${intentBtn('取消', 'cancelCraft', { uid: j.uid }, 'b-xs')}</div>`; }).join('')}</div>`;
}

export function renderLive(app, el) {
  const q = app.game.state.crafting.queue;
  const box = el.querySelector('#craftQueue');
  if ((q.length && !box) || (!q.length && box) || (box && box.querySelectorAll('.listRow').length !== q.length)) { app.dirty = true; return; }
  for (const j of q) {
    const f = el.querySelector(`[data-live="job:${j.uid}"]`); if (f) f.style.width = `${((j.total - j.left) / j.total * 100).toFixed(0)}%`;
    const t = el.querySelector(`[data-live="jobt:${j.uid}"]`); if (t) t.textContent = `剩餘 ${fmtTime(j.left)}`;
  }
}

export function onAction(app, ds) {
  if (ds.action === 'craft:tab') { app.ui.crafting.tab = ds.tab; app.dirty = true; return true; }
  if (ds.action === 'craft:toggleLocked') { app.ui.crafting.showLocked = !app.ui.crafting.showLocked; app.dirty = true; return true; }
  return false;
}
