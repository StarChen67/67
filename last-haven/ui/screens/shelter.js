import { bar, esc, intentBtn } from '../components.js';
import { isHome } from '../../game/selectors.js';

/** 避難所總覽：等級/HP/倉庫/食水庫存、升級、修理、設施建造與升級。 */
export function render(app) {
  const g = app.game, st = g.state, R = g.registry;
  const S = g.systems.shelter, B = g.systems.building, inv = g.systems.inventory;
  const lv = S.def();
  const maxHp = S.maxHp(), def = S.defense();
  const stock = S.getStock();
  const over = inv.isOver('storage');
  const home = isHome(st) && !st.combat;
  const up = S.canUpgrade();
  const hpMissing = maxHp - st.shelter.hp;
  return `
    <div class="card">
      <div class="row between"><h3>🏚️ ${esc(lv.name)} <span class="tag">Lv.${st.shelter.level}</span></h3><span class="small dim">防禦 ${def}${B.wall() ? ` · 🧱 牆 ${B.wall().hp}/${B.maxHpOf('wall')}` : ''}${B.turretDps() ? ` · 🗼 炮塔 ${B.turretDps()} DPS` : ''}</span></div>
      ${bar('shelter', st.shelter.hp, maxHp, { label: '避難所 HP', warn: st.shelter.hp < maxHp * 0.3 })}
      <div class="row" style="margin-top:8px">
        <span class="tag">🍖 食物庫存 ${stock.food}</span><span class="tag">💧 飲水庫存 ${stock.water}</span>
        <span class="tag ${over ? 'warn' : ''}">📦 倉庫 ${inv.weight('storage').toFixed(1)} / ${inv.storageCapacity()}</span>
        <span class="tag">🔨 工作台 Lv.${B.workbenchLevel()}</span>
      </div>
      <div class="row" style="margin-top:10px">
        ${intentBtn('📥 存入全部背包物資', 'depositAll', {}, 'b-sm b-blue', !home)}
        <button class="b-sm b-gold" data-action="nav" data-panel="map">🗺️ 出發探索</button>
        ${hpMissing > 0 ? intentBtn(`🔧 修理（${R.item(g.registry.balance.shelter.repairCost.itemId)?.name} ${S.repairCostFor(hpMissing).qty}）`, 'repairShelter', {}, 'b-sm b-green') : ''}
        ${intentBtn('💾 儲存', 'save', { slot: 'slot1' }, 'b-sm')}
      </div>
    </div>
    <div class="card"><h2>避難所升級</h2>${renderUpgrade(app, up)}</div>
    <div class="card"><h2>設施</h2>${renderBuildings(app, home)}</div>
    <div class="card"><h2>快速補給（倉庫）</h2><div class="row">${quickUse(app)}</div></div>`;
}

function costLine(app, cost) {
  const inv = app.game.systems.inventory, R = app.game.registry;
  return cost.map((c) => { const have = inv.countAll(c.itemId); const d = R.item(c.itemId); return `<span class="${have >= c.qty ? 'have' : 'lack'}">${d?.icon || ''}${esc(d?.name || c.itemId)} ${have}/${c.qty}</span>`; }).join('　');
}
export function reasonLines(app, reasons) {
  const R = app.game.registry;
  return reasons.map((r) => {
    if (r.code === 'blueprint') { const ids = r.blueprintIds || [r.blueprintId]; return `缺少：${ids.map((id) => esc(R.blueprint(id)?.name || id)).join('/')}圖紙`; }
    if (r.code === 'materials') return `缺少 ${r.missing.map((m) => `${esc(R.item(m.itemId)?.name || m.itemId)} x${m.need - m.have}`).join('、')}`;
    if (r.code === 'station') return `需要${({ workbench: '工作台', medical: '醫療站', purifier: '淨水器' })[r.station] || r.station} Lv.${r.need}（目前 Lv.${r.have}）`;
    if (r.code === 'shelterLevel') return `需要避難所 Lv.${r.need}`;
    if (r.code === 'level') return `需要玩家 Lv.${r.need}`;
    if (r.code === 'condition') return esc(r.detail || '條件不足');
    if (r.code === 'maxLevel') return '已達最高等級';
    if (r.code === 'inCombat') return '戰鬥中';
    return esc(r.code);
  });
}

function renderUpgrade(app, up) {
  const g = app.game, R = g.registry, st = g.state;
  if (!up.next) return '<p class="small dim">避難所已達最高等級。</p>';
  const cur = g.systems.shelter.def(), nx = up.next;
  return `<div class="listRow"><div>
      <div class="nm">Lv.${st.shelter.level} → Lv.${nx.level} ${esc(nx.name)}</div>
      <div class="meta">最大 HP ${cur.maxHp} → ${nx.maxHp} · 防禦 ${cur.defense} → ${nx.defense} · 儲物 ${cur.storageCapacity} → ${nx.storageCapacity}${nx.unlocks?.length ? ` · 解鎖：${nx.unlocks.map((b) => R.building(b)?.name).join('、')}` : ''}</div>
      <div class="need">${costLine(app, up.cost)}${nx.requiredBlueprintId ? `　<span class="${g.systems.blueprint.has(nx.requiredBlueprintId) ? 'have' : 'lack'}">📜 ${esc(R.blueprint(nx.requiredBlueprintId)?.name)}圖紙 ${g.systems.blueprint.has(nx.requiredBlueprintId) ? '✓' : '✗'}</span>` : ''}</div>
      ${up.ok ? '' : `<div class="reason">${reasonLines(app, up.reasons).join('；')}</div>`}
    </div><div class="acts">${intentBtn('⬆️ 升級', 'upgradeShelter', {}, 'b-sm b-gold', !up.ok)}</div></div>`;
}

function renderBuildings(app, home) {
  const g = app.game, B = g.systems.building, st = g.state;
  const list = B.list();
  const built = list.filter((b) => b.inst), avail = list.filter((b) => !b.inst && st.shelter.level >= b.def.requiresShelterLevel), locked = list.filter((b) => !b.inst && st.shelter.level < b.def.requiresShelterLevel);
  const row = (b) => {
    const { def, inst, check } = b;
    const lvDef = inst ? def.levels[inst.level - 1] : null;
    const eff = inst ? effectText(app, lvDef.effects) : effectText(app, def.levels[0].effects);
    const nextEff = check.levelDef && inst ? `→ ${effectText(app, check.levelDef.effects)}` : '';
    const hpMax = b.maxHp;
    return `<div class="listRow"><div style="flex:1">
        <div class="nm">${def.icon} ${esc(def.name)}${inst ? ` <span class="tag ${b.active ? 'ok' : 'warn'}">Lv.${inst.level}${lvDef?.name ? ' ' + esc(lvDef.name) : ''}${b.active ? '' : ' 已損毀'}</span>` : ''}</div>
        <div class="meta">${esc(def.desc)}</div>
        ${inst ? `<div style="max-width:220px;margin:4px 0">${bar('shelter', inst.hp, hpMax, { label: 'HP', warn: inst.hp < hpMax * 0.3 })}</div>` : ''}
        <div class="meta">效果：${eff}${nextEff ? ` <span class="dim">${nextEff}</span>` : ''}</div>
        ${check.nextLevel ? `<div class="need">${inst ? `升級 Lv.${check.nextLevel}：` : '建造：'}${costLine(app, check.cost)}${check.levelDef?.requiredBlueprintId ? `　<span class="${g.systems.blueprint.has(check.levelDef.requiredBlueprintId) ? 'have' : 'lack'}">📜 ${esc(g.registry.blueprint(check.levelDef.requiredBlueprintId)?.name)}圖紙 ${g.systems.blueprint.has(check.levelDef.requiredBlueprintId) ? '✓' : '✗'}</span>` : ''}</div>` : ''}
        ${check.ok || !check.nextLevel ? '' : `<div class="reason">${reasonLines(app, check.reasons).join('；')}</div>`}
      </div><div class="acts">
        ${!inst ? intentBtn('🏗️ 建造', 'build', { buildingId: def.id }, 'b-sm b-green', !check.ok || !home) : ''}
        ${inst && check.nextLevel ? intentBtn(`⬆️ 升級`, 'upgradeBuilding', { buildingId: def.id }, 'b-sm b-gold', !check.ok || !home) : ''}
        ${inst && inst.hp < hpMax ? intentBtn('🔧 修理', 'repairBuilding', { buildingId: def.id }, 'b-sm') : ''}
      </div></div>`;
  };
  return `${built.length ? built.map(row).join('') : '<p class="small dim">還沒有任何設施。先建造工作台吧！</p>'}
    ${avail.length ? `<h2 style="margin-top:10px">可建造</h2>${avail.map(row).join('')}` : ''}
    ${locked.length ? `<h2 style="margin-top:10px">尚未解鎖</h2>${locked.map((b) => `<div class="listRow" style="opacity:.55"><div><div class="nm">${b.def.icon} ${esc(b.def.name)}</div><div class="meta">${esc(b.def.desc)}</div></div><span class="tag">🔒 避難所 Lv.${b.def.requiresShelterLevel}</span></div>`).join('')}` : ''}`;
}

export function effectText(app, e = {}) {
  const R = app.game.registry, parts = [];
  if (e.storage) parts.push(`倉庫 +${e.storage}`);
  if (e.waterPerDay) parts.push(`每天 ${R.item(e.waterItem)?.icon || '💧'}${R.item(e.waterItem)?.name || '水'} ×${e.waterPerDay}`);
  if (e.foodPerDay) parts.push(`每天 ${R.item(e.foodItem)?.icon || '🍖'}${R.item(e.foodItem)?.name || '食物'} ×${e.foodPerDay}`);
  if (e.healPerSec) parts.push(`在家每秒回復 ${e.healPerSec} HP`);
  if (e.wallHp) parts.push(`牆 HP ${e.wallHp}`);
  if (e.defense) parts.push(`避難所防禦 +${e.defense}`);
  if (e.turretDps) parts.push(`炮塔 ${e.turretDps} DPS`);
  if (e.power) parts.push(`電力 ${e.power}`);
  if (e.craftStation) parts.push(`${({ workbench: '工作台', medical: '醫療站', purifier: '淨水器' })[e.craftStation.station]} Lv.${e.craftStation.level}`);
  if (e.raidWarningSec) parts.push(`襲擊預警 +${e.raidWarningSec} 秒`);
  if (e.shelterMaxHp) parts.push(`避難所 HP +${e.shelterMaxHp}`);
  for (const [k, m] of Object.entries(e.modifiers || {})) parts.push(`${({ craftSpeed: '製作速度', healRate: '回復', blueprintChance: '圖紙機率', hungerRate: '飢餓速度', shelterDefense: '避難所防禦' })[k] || k}${m.mult ? ` ×${m.mult}` : ''}${m.add ? ` +${m.add}` : ''}`);
  return parts.join('、') || '—';
}

function quickUse(app) {
  const g = app.game, R = g.registry;
  const items = g.state.shelter.storage.items.filter((it) => { const d = R.item(it.itemId); return d && (d.type === 'food' || d.type === 'water' || d.type === 'medicine'); });
  if (!items.length) return '<span class="small dim">倉庫裡沒有可用的食物、水或藥品。</span>';
  return items.slice(0, 12).map((it) => { const d = R.item(it.itemId); return intentBtn(`${d.icon} ${esc(d.name)} ×${it.qty}`, 'useItem', { uid: it.uid, container: 'storage' }, 'b-sm'); }).join('');
}

export function onAction() { return false; }
