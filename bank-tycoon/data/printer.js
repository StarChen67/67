/* ============================================================
   data/printer.js — 印鈔機等級（資料驅動）
   Lv.5「全國銀行」解鎖。這是遊戲機制，不是現實銀行制度。
     output      每次印鈔產生的現金
     cooldown    冷卻天數
     upCost      升級到「下一級」的花費（最高級為 null）
     inflation   每次印鈔增加的通膨基準值（另外還會依「印鈔量/總資產」加成）
   通膨會讓升級費、保全費、營運費變貴，也會讓客戶要求更高利率。
   所以印鈔是「把未來的成本換成現在的現金」。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  BT.define('printer', [
    { id: 'p1', level: 1, name: '桌上型印鈔機', icon: '🖨️', output: 300000,      cooldown: 3, upCost: 5000000,      inflation: 0.3, desc: '半合法的紙鈔印表機。聲音有點大。' },
    { id: 'p2', level: 2, name: '工業印鈔機',   icon: '🖨️', output: 480000,      cooldown: 3, upCost: 11000000,     inflation: 0.3, desc: '搬進地下室了，鄰居以為是洗衣機。' },
    { id: 'p3', level: 3, name: '央行級印鈔線', icon: '🏭', output: 768000,      cooldown: 3, upCost: 24000000,     inflation: 0.4, desc: '有防偽線與浮水印，肉眼分不出真假。' },
    { id: 'p4', level: 4, name: '自動化印鈔廠', icon: '🏭', output: 1228800,     cooldown: 2, upCost: 53000000,     inflation: 0.4, desc: '整條產線二十四小時運轉。' },
    { id: 'p5', level: 5, name: '數位貨幣鑄造', icon: '💾', output: 1966080,     cooldown: 2, upCost: 117000000,    inflation: 0.5, desc: '連紙都不用了，直接改帳本的數字。' },
    { id: 'p6', level: 6, name: '主權貨幣機',   icon: '🪙', output: 3145728,     cooldown: 2, upCost: 258000000,    inflation: 0.5, desc: '你發行的東西，已經被別人當成錢在用。' },
    { id: 'p7', level: 7, name: '影子準備系統', icon: '🌑', output: 5033164,     cooldown: 1, upCost: 567000000,    inflation: 0.6, desc: '沒有任何帳本記得這些錢從哪來。' },
    { id: 'p8', level: 8, name: '無限流動性引擎', icon: '♾️', output: 8053063,   cooldown: 1, upCost: null,         inflation: 0.6, desc: '流動性由你定義。物價也是。' },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
