/* ============================================================
   main.js — 開機流程
   1. 建 Game（localStorage）
   2. 讀檔；沒有存檔 → 新遊戲對話框；存檔損壞 → 提示
   3. 啟動 UI 與主迴圈
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const UI = BT.UI;

  BT.main = {
    boot() {
      const game = new BT.Game({});
      const info = BT.Save.load(game.storage);

      const start = (name) => {
        if (name != null) game.newGame(name);
        UI.app.init(game);
        if (name != null) {
          UI.toast('先把存款利率調到市場水準，客戶就會開始上門。', '', 8000);
        }
        if (game.state.gameOver) UI.modals.gameOver(game, game.state.gameOver);
        root.game = game;   // 除錯用
      };

      if (info.state) {
        game.state = info.state;
        game._wire();
        if (info.source === 'backup') UI.toast('主存檔損壞，已從備份復原。', 'warn', 6000);
        start(null);
        return;
      }
      if (info.hadData) {
        UI.modals.corrupt(info, () => {
          BT.Save.clear(game.storage);
          UI.modals.newGame(start);
        });
        // 損壞時也要先把 UI 撐起來，否則畫面是空的
        game.newGame(BT.CONFIG.start.bankName);
        UI.app.init(game);
        return;
      }
      UI.modals.newGame(start);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
