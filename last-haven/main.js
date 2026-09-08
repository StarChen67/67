import { Game } from './game/game.js';
import { App } from './ui/app.js';
import { AudioPlayer } from './ui/audio-player.js';

const root = document.getElementById('app');
try {
  const game = new Game();
  const errors = game.registry.validate();
  if (errors.length) console.warn('[LastHaven] data validation:', errors);
  const app = new App(root, game);
  game.systems.audio.setPlayer(new AudioPlayer(() => game.systems.save.getPrefs().audio));
  window.LH = { game, app, EV: app.EV }; // 除錯／自動化測試用
  app.start();
} catch (err) {
  root.innerHTML = `<div class="card"><h3>啟動失敗</h3><pre style="white-space:pre-wrap;font-size:12px">${String(err && err.stack || err)}</pre></div>`;
  console.error(err);
}
