import * as Saves from './saves.js';

export function render(app) {
  const p = app.game.systems.save.getPrefs();
  const s = app.game.state.settings;
  return `<div class="card"><h2>遊戲設定</h2>
    <table class="statTable">
      <tr><td>音效</td><td><input type="checkbox" data-change="pref" data-key="audio" ${p.audio ? 'checked' : ''}></td></tr>
      <tr><td>遊戲速度</td><td><select data-change="pref" data-key="speed">${[0.5, 1, 2, 4].map((v) => `<option value="${v}" ${p.speed === v ? 'selected' : ''}>×${v}</option>`).join('')}</select></td></tr>
      <tr><td>自動存檔間隔（秒，0=關閉）</td><td><input type="number" min="0" max="600" style="width:80px" data-change="pref" data-key="autosaveSec" value="${p.autosaveSec}"></td></tr>
      <tr><td>戰鬥自動攻擊</td><td><input type="checkbox" data-change="setting" data-key="autoAttack" ${s.autoAttack ? 'checked' : ''}></td></tr>
    </table>
    <div class="row" style="margin-top:10px"><button class="b-sm b-red" data-action="settings:menu">返回主選單</button></div>
  </div>
  ${Saves.render(app)}`;
}

export function onAction(app, ds) {
  if (ds.action === 'settings:menu') {
    app.openModal({ title: '返回主選單？', body: '<p>會先自動存檔到「自動存檔」槽。</p>', buttons: [{ label: '取消', action: 'modal:close' }, { label: '返回', action: 'settings:menuConfirm', cls: 'b-red' }] });
    return true;
  }
  if (ds.action === 'settings:menuConfirm') { app.game.intent('save', { slot: 'autosave' }); app.modal = null; app.showMenu(); return true; }
  return Saves.onAction(app, ds);
}
