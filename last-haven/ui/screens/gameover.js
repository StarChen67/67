import { esc, fmtTime } from '../components.js';

export function render(app) {
  const st = app.game.state, go = st.gameOver;
  const src = go.detail?.source || '';
  let detail = '';
  if (go.reason === 'killed' && src.startsWith('monster:')) detail = `兇手：${esc(app.game.registry.monster(src.slice(8))?.name || src)}`;
  else if (go.reason === 'killed' && src.startsWith('disaster:')) detail = `死因：${esc(app.game.registry.disaster(src.slice(9))?.name || src)}`;
  else if (go.reason === 'killed' && src.startsWith('status:')) detail = `死因：${esc(app.game.registry.status(src.slice(7))?.name || src)}`;
  const hasSave = app.game.systems.save.hasAny();
  return `<div id="gameover">
    <h1>GAME OVER</h1>
    <p>${esc(go.text)}</p>
    ${detail ? `<p class="small dim">${detail}</p>` : ''}
    <div class="stats">存活 ${app.game.clock.day} 天 · 等級 ${st.player.level} · 擊殺 ${st.stats.kills} · 開箱 ${st.stats.chestsOpened} · 學習圖紙 ${st.stats.blueprintsLearned}<br>遊玩時間 ${fmtTime(st.meta.playTime)}</div>
    <div class="btns">
      <button class="b-gold" data-action="gameover:restart">重新開始</button>
      <button class="b-blue" data-action="gameover:load" ${hasSave ? '' : 'disabled'}>讀取存檔</button>
      <button data-action="gameover:menu">返回主選單</button>
    </div>
  </div>`;
}

export function onAction(app, ds) {
  if (ds.action === 'gameover:restart') { app.newGame(app.game.state.player.name); }
  else if (ds.action === 'gameover:load') { app.ui.menuLoad = true; app.showMenu(); }
  else if (ds.action === 'gameover:menu') { app.ui.menuLoad = false; app.showMenu(); }
}
