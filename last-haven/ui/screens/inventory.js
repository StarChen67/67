import { itemCard } from '../components.js';
import { isHome } from '../../game/selectors.js';

const TYPE_TABS = [['all', '全部'], ['food', '食物'], ['water', '飲水'], ['medicine', '藥品'], ['weapon', '武器'], ['armor', '防具'], ['material', '材料'], ['ammo', '彈藥'], ['blueprint', '圖紙'], ['special', '特殊']];

export function render(app) {
  const g = app.game, st = g.state, inv = g.systems.inventory, R = g.registry;
  const ui = app.ui.inventory || (app.ui.inventory = { tab: 'inventory', type: 'all' });
  const home = isHome(st);
  const container = home ? ui.tab : 'inventory';
  const items = inv.items(container).filter((it) => ui.type === 'all' || R.item(it.itemId)?.type === ui.type);
  const cap = inv.capacity(container), w = inv.weight(container);
  const pile = inv.lootPile();
  return `
    ${home ? `<div class="tabs"><button class="${ui.tab === 'inventory' ? 'active' : ''}" data-action="tab" data-panel="inventory" data-tab="inventory">🎒 背包</button><button class="${ui.tab === 'storage' ? 'active' : ''}" data-action="tab" data-panel="inventory" data-tab="storage">📦 倉庫</button></div>` : ''}
    <div class="card">
      <div class="capline ${w > cap ? 'over' : ''}">${container === 'inventory' ? '背包負重' : '倉庫容量'} <b>${w.toFixed(1)} / ${cap}</b>${w > cap ? '（超重！無法再放入）' : ''}
        ${home ? ` · <button class="b-xs" data-action="intent" data-intent="depositAll">全部存入倉庫</button>` : ''}</div>
      <div class="tabs">${TYPE_TABS.map(([k, l]) => `<button class="b-xs ${ui.type === k ? 'active' : ''}" data-action="inv:type" data-type="${k}">${l}</button>`).join('')}</div>
      ${items.length ? `<div class="itemGrid">${items.map((it) => itemCard(app, it, { container, actions: actionsFor(app, it, container, home) })).join('')}</div>` : '<p class="small dim">沒有物品。</p>'}
    </div>
    ${pile && pile.length ? `<div class="card"><h2>地上的戰利品</h2><div class="row" style="margin-bottom:8px"><button class="b-sm b-gold" data-action="intent" data-intent="takeAllLoot">全部撿起</button></div><div class="itemGrid">${pile.map((it) => itemCard(app, it, { actions: [{ label: '撿起', intent: 'takeLoot', cls: 'b-xs b-green' }, { label: '放棄', intent: 'dropLoot', cls: 'b-xs' }] })).join('')}</div></div>` : ''}`;
}

function actionsFor(app, it, container, home) {
  const g = app.game, d = g.registry.item(it.itemId);
  const acts = [];
  if (!d) return acts;
  if (d.equip) acts.push({ label: '裝備', intent: 'equip', cls: 'b-xs b-blue' });
  else if (d.type === 'blueprint') { acts.push({ label: '學習', intent: 'learnBlueprint', cls: 'b-xs b-purple' }); acts.push({ label: '拆解', intent: 'dismantleBlueprint', cls: 'b-xs' }); }
  else if (d.subtype === 'chest') acts.push({ label: '打開', intent: 'openChest', cls: 'b-xs b-gold' });
  else if (g.systems.item.isConsumable(it.itemId)) acts.push({ label: '使用', intent: 'useItem', cls: 'b-xs b-green' });
  if (home) acts.push({ label: container === 'inventory' ? '存入' : '取出', intent: 'transfer', params: { from: container }, cls: 'b-xs' });
  if (it.qty > 1 && home) acts.push({ label: container === 'inventory' ? '存1' : '取1', intent: 'transfer', params: { from: container, qty: 1 }, cls: 'b-xs' });
  acts.push({ label: '丟棄', intent: 'dropItem', params: { qty: 1 }, cls: 'b-xs' });
  return acts;
}

export function onAction(app, ds) {
  if (ds.action === 'inv:type') { app.ui.inventory.type = ds.type; app.dirty = true; return true; }
  return false;
}
