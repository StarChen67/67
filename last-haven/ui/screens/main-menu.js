import { esc, fmtDate } from '../components.js';

export function render(app) {
  const save = app.game.systems.save;
  const latest = save.latestSlot();
  const slots = save.list();
  const showLoad = app.ui.menuLoad;
  return `<div id="menu">
    <h1>末日庇護所</h1>
    <div class="sub">Last Haven · 避難所生存 × 探索 × 戰鬥 × 建設<br>維持飢餓與口渴、外出搜刮、學圖紙升工作台、抵禦天災與襲擊。</div>
    ${showLoad ? `
      <div class="card" style="width:min(420px,100%);text-align:left">
        <h2>載入遊戲</h2>
        ${slots.map((s) => `<div class="listRow"><div><div class="nm">${s.slot === 'autosave' ? '自動存檔' : '存檔 ' + s.slot.slice(-1)}</div>
          <div class="meta">${s.empty ? '（空）' : `${esc(s.name)} · 第 ${s.day} 天 · Lv.${s.level}${s.gameOver ? ' · 已結束' : ''} · ${fmtDate(s.updatedAt)}`}</div></div>
          <div class="acts">${s.empty ? '' : `<button class="b-sm b-blue" data-action="menu:load" data-slot="${s.slot}">讀取</button><button class="b-sm b-red" data-action="menu:delete" data-slot="${s.slot}">刪除</button>`}</div></div>`).join('')}
        <button class="b-sm" data-action="menu:back">返回</button>
      </div>` : `
      <input id="playerName" placeholder="輸入名字" value="${esc(app.ui.menuName || '倖存者')}" maxlength="12">
      <div class="menuBtns">
        <button class="b-gold" data-action="menu:new">新遊戲</button>
        <button class="b-green" data-action="menu:continue" ${latest ? '' : 'disabled'}>繼續遊戲</button>
        <button class="b-blue" data-action="menu:loadlist">載入遊戲</button>
        <button data-action="menu:settings">設定</button>
        <button data-action="menu:exit">離開遊戲</button>
      </div>`}
    <div class="tiny dim" style="margin-top:18px">v0.2 · Phase 2 · 存檔保存在此瀏覽器</div>
  </div>`;
}

export function onAction(app, ds) {
  const a = ds.action;
  if (a === 'menu:new') {
    const input = app.root.querySelector('#playerName');
    const name = (input && input.value.trim()) || '倖存者';
    app.ui.menuName = name;
    if (app.game.systems.save.hasAny() && !app.ui.confirmNew) {
      app.ui.confirmNew = true;
      app.openModal({ title: '開始新遊戲？', body: '<p>既有存檔不會被覆蓋（自動存檔槽除外）。</p>', buttons: [{ label: '取消', action: 'modal:close' }, { label: '開始', action: 'menu:new', cls: 'b-gold' }] });
      return;
    }
    app.ui.confirmNew = false; app.modal = null;
    app.newGame(name);
  } else if (a === 'menu:continue') {
    const slot = app.game.systems.save.latestSlot();
    if (slot) app.loadSlot(slot);
  } else if (a === 'menu:loadlist') { app.ui.menuLoad = true; app.dirty = true; app.render(); }
  else if (a === 'menu:back') { app.ui.menuLoad = false; app.dirty = true; app.render(); }
  else if (a === 'menu:load') { app.ui.menuLoad = false; app.loadSlot(ds.slot); }
  else if (a === 'menu:delete') { app.game.systems.save.delete(ds.slot); app.toast('已刪除存檔'); app.dirty = true; app.render(); }
  else if (a === 'menu:settings') {
    const p = app.game.systems.save.getPrefs();
    app.openModal({ title: '設定', body: `<p><label><input type="checkbox" data-change="pref" data-key="audio" ${p.audio ? 'checked' : ''}> 音效</label></p><p><label>遊戲速度 <select data-change="pref" data-key="speed">${[0.5, 1, 2, 4].map((v) => `<option value="${v}" ${p.speed === v ? 'selected' : ''}>×${v}</option>`).join('')}</select></label></p><p><label>自動存檔間隔（秒，0=關閉） <input type="number" min="0" max="600" data-change="pref" data-key="autosaveSec" value="${p.autosaveSec}"></label></p>` });
  } else if (a === 'menu:exit') {
    app.openModal({ title: '離開遊戲', body: '<p>這是網頁遊戲，關閉分頁即可離開。要回到遊樂園大廳嗎？</p>', buttons: [{ label: '取消', action: 'modal:close' }, { label: '回大廳', action: 'menu:lobby', cls: 'b-gold' }] });
  } else if (a === 'menu:lobby') { window.location.href = 'platform.html'; }
}
