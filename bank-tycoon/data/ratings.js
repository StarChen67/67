/* ============================================================
   data/ratings.js — 信用評級（分數 → 等級）
   min 由高到低排列；credit.js 由上往下找第一個符合的。
   attract 是吸引客戶的乘數，depositMult 影響大額客戶願不願意上門。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  BT.define('ratings', [
    { id: 'AAA', min: 900, name: 'AAA', color: '#3ddc97', attract: 1.40, desc: '最高信用評等。全國的資金都想放你這裡。' },
    { id: 'AA',  min: 800, name: 'AA',  color: '#7ce0b0', attract: 1.25, desc: '極為穩健，機構投資人的白名單。' },
    { id: 'A',   min: 700, name: 'A',   color: '#a8e06a', attract: 1.10, desc: '穩健經營，大型企業願意往來。' },
    { id: 'BBB', min: 600, name: 'BBB', color: '#ffc84a', attract: 1.00, desc: '投資等級的底線。還過得去。' },
    { id: 'BB',  min: 480, name: 'BB',  color: '#ffa94a', attract: 0.80, desc: '掉出投資等級。貴賓客戶開始猶豫。' },
    { id: 'B',   min: 360, name: 'B',   color: '#ff8c42', attract: 0.60, desc: '投機等級。存款流失中。' },
    { id: 'CCC', min: 220, name: 'CCC', color: '#ff6b6b', attract: 0.35, desc: '瀕臨違約。新聞開始報導你的銀行。' },
    { id: 'D',   min: -1,  name: 'D',   color: '#ff3355', attract: 0.15, desc: '違約等級。只剩沒注意到的人還把錢放這裡。' },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
