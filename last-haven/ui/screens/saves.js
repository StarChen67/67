import { esc, fmtDate, fmtTime } from '../components.js';

export function render(app) {
  const save = app.game.systems.save;
  const slots = save.list();
  return `<div class="card"><h2>存檔</h2>
    ${slots.map((s) => `<div class="listRow"><div><div class="nm">${s.slot === 'autosave' ? '自動存檔' : '存檔 ' + s.slot.slice(-1)}</div>
      <div class="meta">${s.empty ? '（空）' : `${esc(s.name)} · 第 ${s.day} 天 · Lv.${s.level} · 遊玩 ${fmtTime(s.playTime || 0)}${s.gameOver ? ' · 已結束' : ''}<br>${fmtDate(s.updatedAt)}`}</div></div>
      <div class="acts">${s.slot !== 'autosave' ? `<button class="b-sm b-green" data-action="intent" data-intent="save" data-slot="${s.slot}">儲存</button>` : ''}
      ${s.empty ? '' : `<button class="b-sm b-blue" data-action="saves:load" data-slot="${s.slot}">讀取</button><button class="b-sm b-red" data-action="saves:delete" data-slot="${s.slot}">刪除</button>`}</div></div>`).join('')}
    <div class="row" style="margin-top:8px"><button class="b-sm" data-action="saves:export">匯出存檔 JSON</button><button class="b-sm" data-action="saves:import">匯入存檔 JSON</button></div>
  </div>`;
}

export function onAction(app, ds) {
  const a = ds.action;
  if (a === 'saves:load') { app.loadSlot(ds.slot); return true; }
  if (a === 'saves:delete') { app.game.systems.save.delete(ds.slot); app.toast('已刪除'); app.dirty = true; return true; }
  if (a === 'saves:export') {
    const json = app.game.systems.save.exportJson();
    app.openModal({ title: '匯出存檔', body: `<p>複製下方文字即可備份。</p><textarea readonly>${esc(json)}</textarea>` });
    return true;
  }
  if (a === 'saves:import') {
    app.openModal({ title: '匯入存檔', body: '<p>貼上存檔 JSON，將寫入「存檔 3」。</p><textarea id="importJson"></textarea>', buttons: [{ label: '取消', action: 'modal:close' }, { label: '匯入', action: 'saves:importConfirm', cls: 'b-gold' }] });
    return true;
  }
  if (a === 'saves:importConfirm') {
    const ta = app.root.querySelector('#importJson');
    const r = app.game.systems.save.importJson(ta ? ta.value : '', 'slot3');
    app.modal = null;
    if (r.ok) app.toast('匯入成功（存檔 3）', 'good'); else app.toast(`匯入失敗：${r.reason}`, 'bad');
    app.dirty = true;
    return true;
  }
  return false;
}
