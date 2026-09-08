import { esc, intentBtn } from '../components.js';
import { typeLabel } from './map.js';

/** 圖紙／科技收藏（規格三十一、四十四）：已學習全資訊、已發現名稱與類型、未取得 ？？？。 */
export function render(app) {
  const g = app.game, st = g.state, P = g.systems.blueprint, R = g.registry, inv = g.systems.inventory;
  const ui = app.ui.blueprints || (app.ui.blueprints = { type: 'all', open: null });
  const col = P.collection();
  const owned = [...inv.items('inventory'), ...inv.items('storage')].filter((it) => R.item(it.itemId)?.type === 'blueprint');
  const total = col.reduce((a, c) => a + c.total, 0), learned = col.reduce((a, c) => a + c.learned, 0);
  const groups = col.filter((c) => ui.type === 'all' || c.type === ui.type);
  return `
    <div class="card">
      <div class="row between"><h3>📜 圖紙／科技</h3><span class="tag">🔬 研究點 ${st.blueprints.researchPoints}</span></div>
      <div class="row small" style="margin-top:6px">${col.map((c) => `<span class="tag ${c.learned === c.total ? 'ok' : ''}">${typeLabel(c.type)}圖紙 ${c.learned} / ${c.total}</span>`).join('')}<span class="tag">總計 ${learned} / ${total}</span></div>
      <div class="small dim" style="margin-top:6px">重複圖紙可在背包「拆解」為研究點（普通 5／精良 10／稀有 25／史詩 60／傳說 150）；已發現但未學習的圖紙可用研究點兌換（×3）。</div>
      ${owned.length ? `<div class="row" style="margin-top:8px"><span class="small">持有圖紙：</span>${owned.map((it) => `<span class="tag q-${R.item(it.itemId).quality}">${esc(R.item(it.itemId).name)}${it.qty > 1 ? ' ×' + it.qty : ''}${P.has(it.itemId) ? '（重複）' : ''}</span>${intentBtn(P.has(it.itemId) ? '拆解' : '學習', P.has(it.itemId) ? 'dismantleBlueprint' : 'learnBlueprint', { uid: it.uid }, 'b-xs ' + (P.has(it.itemId) ? '' : 'b-purple'))}`).join('')}</div>` : ''}
    </div>
    <div class="tabs"><button class="${ui.type === 'all' ? 'active' : ''}" data-action="bp:type" data-type="all">全部</button>${col.map((c) => `<button class="${ui.type === c.type ? 'active' : ''}" data-action="bp:type" data-type="${c.type}">${typeLabel(c.type)}</button>`).join('')}</div>
    ${groups.map((c) => `<div class="card"><h2>${typeLabel(c.type)}圖紙 ${c.learned}/${c.total}</h2>${c.entries.map((e) => entryRow(app, e, ui)).join('')}</div>`).join('')}`;
}

function entryRow(app, { def, status }, ui) {
  const g = app.game, R = g.registry, P = g.systems.blueprint;
  const q = def.rarity, ql = g.systems.item.qualityLabel(q);
  if (status === 'unknown') return `<div class="listRow" style="opacity:.55"><div><div class="nm">？？？</div><div class="meta">${typeLabel(def.type)}圖紙 · Lv.${def.level} · ${ql}</div></div><span class="tag">尚未取得</span></div>`;
  const info = P.info(def.id);
  const open = ui.open === def.id;
  const wbTxt = def.requiredWorkbenchLevel > 0 ? `<span class="${info.workbenchOk ? 'have' : 'lack'}">需要工作台 Lv.${def.requiredWorkbenchLevel}${info.workbenchOk ? '' : `（目前工作台 Lv.${info.currentWorkbench}）`}</span>` : '<span class="dim">不需工作台</span>';
  return `<div class="listRow"><div style="flex:1">
      <div class="nm"><span class="q-${q}">📜 ${esc(def.name)}圖紙</span> <span class="tag ${status === 'learned' ? 'ok' : ''}">${status === 'learned' ? '已學習' : '已發現'}</span></div>
      <div class="meta">種類：${typeLabel(def.type)}圖紙 · 圖紙等級：Lv.${def.level} · 品質：${ql} · ${wbTxt}</div>
      ${open ? `<div class="meta">${esc(def.description)}</div>
        ${info.recipes.length ? `<div class="meta">可以製作：${info.recipes.map((r) => { const it = R.item(r.resultItemId); return `${it.icon}${esc(it.name)}${r.resultQty > 1 ? '×' + r.resultQty : ''}（${r.requiredItems.map((c) => `${esc(R.item(c.itemId)?.name)} x${c.qty}`).join('、')}）`; }).join('；')}</div>` : ''}
        ${info.gates.length ? `<div class="meta">解鎖：${info.gates.map((x) => esc(x.label)).join('、')}</div>` : ''}
        <div class="meta">狀態：${status === 'learned' ? '已學習' : '尚未學習'} · 拆解研究點 ${info.researchValue}${status !== 'learned' ? ` · 兌換需 ${info.redeemCost} 研究點` : ''}</div>` : ''}
    </div><div class="acts"><button class="b-xs" data-action="bp:open" data-id="${def.id}">${open ? '收合' : '詳情'}</button>${status === 'discovered' ? intentBtn(`🔬 兌換 ${info.redeemCost}`, 'redeemBlueprint', { blueprintId: def.id }, 'b-xs b-purple', g.state.blueprints.researchPoints < info.redeemCost) : ''}</div></div>`;
}

export function onAction(app, ds) {
  if (ds.action === 'bp:type') { app.ui.blueprints.type = ds.type; app.dirty = true; return true; }
  if (ds.action === 'bp:open') { app.ui.blueprints.open = app.ui.blueprints.open === ds.id ? null : ds.id; app.dirty = true; return true; }
  return false;
}
