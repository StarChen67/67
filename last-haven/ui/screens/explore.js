import { bar, esc, intentBtn, fmtTime, itemCard } from '../components.js';

/** 探索畫面：旅途 / 樓層 POI / 戰鬥 / 戰利品。 */
export function render(app) {
  const g = app.game, st = g.state;
  if (st.combat) return renderCombat(app);
  const ex = st.exploration;
  if (!ex) return `<div class="card"><p class="dim">目前不在探索中。</p><button class="b-sm" data-action="nav" data-panel="map">前往地圖</button></div>`;
  const area = g.registry.area(ex.areaId);
  if (ex.phase !== 'explore') {
    const out = ex.phase === 'travelOut';
    return `<div class="card">
      <h3>${out ? '🚶 前往' : '🏠 返回'} ${out ? area.icon + ' ' + esc(area.name) : '避難所'}</h3>
      <div id="travelBar">${bar('shelter', ex.travelTotal - ex.travelLeft, ex.travelTotal, { label: out ? '旅途' : '回程', showNum: false })}</div>
      <div class="small dim" style="margin-top:6px" id="travelText">剩餘約 ${fmtTime(ex.travelLeft)}（飢餓與口渴持續上升）</div>
      <div class="row" style="margin-top:10px">${out ? intentBtn('↩️ 折返回家', 'returnHome', {}, 'b-sm') : ''}${quickUse(app)}</div>
    </div>${lootPile(app, ex)}`;
  }
  const act = ex.activeAction;
  const poi = act ? ex.pois.find((p) => p.id === act.poiId) : null;
  return `
    <div class="card">
      <div class="row between"><h3>${area.icon} ${esc(area.name)} <span class="tag">第 ${ex.depth} / ${area.maxDepth} 層</span></h3><span class="danger small">危險 ${area.danger}</span></div>
      ${act ? `<div id="actionBox"><div class="small">${act.type === 'gather' ? '⛏️ 採集' : '🔍 搜索'}：${esc(poi?.name || '')}</div>${bar('xp', act.total - act.left, act.total, { label: '', showNum: false })}<div class="row" style="margin-top:6px"><span class="small dim" id="actionText">剩餘 ${fmtTime(act.left)}</span>${intentBtn('取消', 'cancelAction', {}, 'b-xs')}</div></div>` : ''}
      <div class="row" style="margin-top:8px">${intentBtn('🏠 返回避難所', 'returnHome', {}, 'b-sm b-green', !!act)}${quickUse(app)}</div>
    </div>
    <div class="card"><h2>地點</h2>
      ${ex.pois.map((p) => `<div class="poi ${p.done ? 'done' : ''}"><span class="ic">${p.icon}</span><div style="flex:1"><div class="nm">${esc(p.name)}</div><div class="tiny dim">${poiHint(app, p)}</div></div>
        ${p.done ? '<span class="tag ok">完成</span>' : intentBtn(poiLabel(p), 'interact', { poiId: p.id }, `b-sm ${p.kind === 'monster' ? 'b-red' : p.kind === 'path' ? 'b-blue' : p.kind === 'chest' ? 'b-gold' : 'b-green'}`, !!act)}</div>`).join('')}
    </div>
    ${lootPile(app, ex)}`;
}

function poiLabel(p) { return { resource: '採集', monster: '戰鬥', chest: '拿取', site: '搜索', path: '深入' }[p.kind] || '互動'; }
function poiHint(app, p) {
  const R = app.game.registry;
  if (p.kind === 'resource') return `${p.data.minQuantity}–${p.data.maxQuantity} 個 · ${p.data.gatherTime} 秒${p.data.rare ? ' · 稀有' : ''}`;
  if (p.kind === 'monster') return p.data.enemies.map((e) => `${e.tier === 'boss' ? '👑' : e.tier === 'elite' ? '⭐' : ''}HP ${e.hp} 攻 ${e.attack} 防 ${e.defense}`).join(' · ');
  if (p.kind === 'chest') return `${R.chest(p.data.tier)?.name}，可帶回或就地開啟`;
  if (p.kind === 'site') return `搜索 ${p.data.searchTime} 秒，可能找到物資、寶箱或圖紙`;
  if (p.kind === 'path') return '怪物等級 +1，地上的戰利品會留在這層';
  return '';
}

function quickUse(app) {
  const g = app.game, R = g.registry;
  const items = g.state.inventory.items.filter((it) => { const d = R.item(it.itemId); return d && (d.type === 'food' || d.type === 'water' || d.type === 'medicine'); }).slice(0, 6);
  return items.map((it) => { const d = R.item(it.itemId); return intentBtn(`${d.icon} ${esc(d.name)} ×${it.qty}`, 'useItem', { uid: it.uid, container: 'inventory' }, 'b-xs'); }).join('');
}

function lootPile(app, ex) {
  if (!ex || !ex.lootPile.length) return '';
  return `<div class="card"><h2>地上的戰利品（離開此層即消失）</h2><div class="row" style="margin-bottom:8px">${intentBtn('全部撿起', 'takeAllLoot', {}, 'b-sm b-gold')}<span class="small dim">背包 ${app.game.systems.inventory.weight('inventory').toFixed(1)}/${app.game.systems.inventory.carryCapacity()}</span></div>
    <div class="itemGrid">${ex.lootPile.map((it) => itemCard(app, it, { actions: [{ label: '撿起', intent: 'takeLoot', cls: 'b-xs b-green' }, ...(app.game.registry.item(it.itemId)?.subtype === 'chest' ? [{ label: '就地打開', intent: 'openChest', cls: 'b-xs b-gold' }] : []), { label: '放棄', intent: 'dropLoot', cls: 'b-xs' }] })).join('')}</div></div>`;
}

function renderCombat(app) {
  const g = app.game, st = g.state, c = st.combat;
  const stats = g.systems.player.getStats();
  const cd = Math.max(0, c.playerCooldown), cdTotal = 1 / Math.max(0.05, stats.attackSpeed);
  const w = g.systems.equipment.weapon();
  const ammo = w?.ammo ? `${g.registry.item(w.ammo)?.icon || ''}${g.systems.inventory.count('inventory', w.ammo)}` : '';
  return `
    <div class="card">
      <div class="row between"><h3>⚔️ 戰鬥${c.origin === 'raid' ? '（防守避難所）' : ''}</h3><span class="small dim">${w ? `${w.def.icon} ${esc(w.def.name)}${ammo ? ' · 彈藥 ' + ammo : ''}` : '👊 徒手'} · 攻 ${stats.attack} 防 ${stats.defense}</span></div>
      <canvas class="scene" id="combatCanvas" width="900" height="200"></canvas>
      <div id="enemies">${c.enemies.map((e) => `<div class="enemy ${e.uid === c.targetUid ? 'target' : ''}" data-action="intent" data-intent="setTarget" data-uid="${e.uid}">
        <span class="ic">${e.icon}</span>
        <div style="flex:1"><div class="row between"><span class="nm">${e.tier === 'boss' ? '👑 ' : e.tier === 'elite' ? '⭐ ' : ''}${esc(e.name)} <span class="tiny dim">Lv.${e.level} · 攻 ${e.attack} 防 ${e.defense}</span></span><span class="tiny dim">${(e.statusEffects || []).map((s) => g.registry.status(s.id)?.icon || '').join('')}</span></div>
          <div data-live="ehp:${e.uid}">${bar('enemy', e.hp, e.maxHp, { label: 'HP' })}</div>
          <div class="cd"><div class="fill" data-live="ecd:${e.uid}" style="width:${Math.max(0, 100 - (Math.max(0, e.cooldown) / (1 / Math.max(0.05, e.attackSpeed))) * 100).toFixed(0)}%"></div></div></div>
      </div>`).join('')}</div>
      <div style="margin-top:8px"><div class="small dim">你的攻擊冷卻</div><div class="cd"><div class="fill" data-live="pcd" style="width:${Math.max(0, 100 - (cd / cdTotal) * 100).toFixed(0)}%"></div></div></div>
      <div class="row" style="margin-top:10px">
        ${intentBtn('⚔️ 攻擊', 'attack', {}, 'bigbtn b-red')}
        ${c.origin === 'raid' ? '' : intentBtn('🏃 逃跑', 'flee', {}, 'bigbtn')}
        <label class="small dim" style="margin-left:auto"><input type="checkbox" data-change="setting" data-key="autoAttack" ${st.settings.autoAttack ? 'checked' : ''}> 自動攻擊</label>
      </div>
      <div class="row" style="margin-top:8px">${quickUse(app)}</div>
      <div class="small" style="margin-top:8px;color:#bcc6d6" id="combatLog">${c.log.slice(-5).map(esc).join('<br>')}</div>
      ${c.loot.length ? `<div class="small dim" style="margin-top:6px">戰利品：${c.loot.map((i) => `${g.registry.item(i.itemId)?.icon}${g.registry.item(i.itemId)?.name}×${i.qty}`).join('、')}${c.coins ? ` 💰${c.coins}` : ''}</div>` : ''}
    </div>`;
}

export function renderLive(app, el) {
  const g = app.game, st = g.state;
  if (st.combat) {
    const c = st.combat;
    for (const e of c.enemies) {
      const hp = el.querySelector(`[data-live="ehp:${e.uid}"] .fill`); if (hp) hp.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100).toFixed(1)}%`;
      const lbl = el.querySelector(`[data-live="ehp:${e.uid}"] .lbl span:last-child`); if (lbl) lbl.textContent = `${Math.round(e.hp)} / ${e.maxHp}`;
      const cd = el.querySelector(`[data-live="ecd:${e.uid}"]`); if (cd) cd.style.width = `${Math.max(0, 100 - (Math.max(0, e.cooldown) / (1 / Math.max(0.05, e.attackSpeed))) * 100).toFixed(0)}%`;
    }
    const stats = g.systems.player.getStats();
    const pcd = el.querySelector('[data-live="pcd"]'); if (pcd) pcd.style.width = `${Math.max(0, 100 - (Math.max(0, c.playerCooldown) / (1 / Math.max(0.05, stats.attackSpeed))) * 100).toFixed(0)}%`;
    const log = el.querySelector('#combatLog'); if (log) log.innerHTML = c.log.slice(-5).map(esc).join('<br>');
    if (c.enemies.length !== el.querySelectorAll('.enemy').length) app.dirty = true;
    drawCombat(app);
    return;
  }
  const ex = st.exploration;
  if (!ex) return;
  if (ex.phase !== 'explore') {
    const f = el.querySelector('#travelBar .fill'); if (f) f.style.width = `${Math.max(0, Math.min(100, ((ex.travelTotal - ex.travelLeft) / ex.travelTotal) * 100)).toFixed(1)}%`;
    const t = el.querySelector('#travelText'); if (t) t.textContent = `剩餘約 ${fmtTime(ex.travelLeft)}（飢餓與口渴持續上升）`;
    return;
  }
  const act = ex.activeAction;
  const box = el.querySelector('#actionBox');
  if ((act && !box) || (!act && box)) { app.dirty = true; return; }
  if (act) {
    const f = box.querySelector('.fill'); if (f) f.style.width = `${Math.max(0, Math.min(100, ((act.total - act.left) / act.total) * 100)).toFixed(1)}%`;
    const t = box.querySelector('#actionText'); if (t) t.textContent = `剩餘 ${fmtTime(act.left)}`;
  }
}

export function afterRender(app) { if (app.game.state.combat) drawCombat(app); }

/** 程式繪圖戰鬥場景：左玩家、右敵人，HP 條與簡單動畫 */
function drawCombat(app) {
  const cv = app.root.querySelector('#combatCanvas');
  if (!cv) return;
  const g = app.game, c = g.state.combat;
  if (!c) return;
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const t = performance.now() / 1000;
  ctx.fillStyle = c.origin === 'raid' ? '#1a1014' : '#0a0e15'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1b2330'; ctx.fillRect(0, H - 40, W, 40);
  // 玩家
  const px = 140, py = H - 70;
  ctx.font = '48px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🧍', px + Math.sin(t * 6) * 2, py);
  const st = g.systems.player.getStats(), p = g.state.player;
  ctx.fillStyle = '#000'; ctx.fillRect(px - 40, py - 50, 80, 8);
  ctx.fillStyle = '#ff5d73'; ctx.fillRect(px - 40, py - 50, 80 * Math.max(0, p.hp / st.maxHp), 8);
  ctx.fillStyle = '#e6ebf5'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(`${p.name} Lv.${p.level}`, px, py - 62);
  // 敵人
  const n = c.enemies.length;
  c.enemies.forEach((e, i) => {
    const ex = W - 160 - i * 130, ey = H - 70 + (i % 2) * 6;
    const isT = e.uid === c.targetUid;
    ctx.font = `${e.tier === 'boss' ? 64 : e.tier === 'elite' ? 54 : 44}px sans-serif`;
    ctx.fillText(e.icon, ex + Math.sin(t * 5 + i) * 3, ey);
    ctx.fillStyle = '#000'; ctx.fillRect(ex - 40, ey - 50, 80, 8);
    ctx.fillStyle = isT ? '#ffc84a' : '#ff8a5d'; ctx.fillRect(ex - 40, ey - 50, 80 * Math.max(0, e.hp / e.maxHp), 8);
    ctx.fillStyle = isT ? '#ffc84a' : '#bcc6d6'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(`${e.name} Lv.${e.level}`, ex, ey - 62);
    if (isT) { ctx.font = '14px sans-serif'; ctx.fillText('🎯', ex, ey - 80); }
  });
  void n;
}

export function onAction() { return false; }
