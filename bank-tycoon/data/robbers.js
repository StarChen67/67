/* ============================================================
   data/robbers.js — 強盜等級（資料驅動）
   欄位：
     attack      攻擊/突破能力範圍（會再依銀行現金級距放大）
     lootFrac    搶劫成功時，搬走「可拿到的現金」的比例範圍
     maxLoot     單次搶劫金額上限（現場能搬走的實體上限）
     weights     依銀行現金級距的出現權重，對應 CASH_TIERS
                 [<50萬, <200萬, <1000萬, <5000萬, ≥5000萬]
     members     人數（顯示用）
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  /** 現金級距的上界；強盜權重與攻擊力加成都用這個索引。 */
  BT.CASH_TIERS = [500000, 2000000, 10000000, 50000000, Infinity];

  BT.define('robbers', [
    {
      id: 'thief', name: '普通小偷', icon: '🧢', order: 1, members: 1,
      attack: [8, 20], lootFrac: [0.05, 0.15], maxLoot: 40000,
      weights: [72, 45, 15, 5, 0],
      desc: '趁午休時間翻櫃台抽屜的那種。目標通常是小型銀行。',
    },
    {
      id: 'robber', name: '普通搶匪', icon: '🔫', order: 2, members: 2,
      attack: [25, 60], lootFrac: [0.10, 0.25], maxLoot: 150000,
      weights: [26, 44, 38, 15, 5],
      desc: '兩個人、一把槍、一台機車。會挑中型銀行下手。',
    },
    {
      id: 'crew', name: '專業搶劫團隊', icon: '🎭', order: 3, members: 5,
      attack: [80, 200], lootFrac: [0.15, 0.35], maxLoot: 900000,
      weights: [2, 11, 33, 36, 25],
      desc: '踩點三個月、破壞電網、九十秒撤離。他們挑的是有錢的銀行。',
    },
    {
      id: 'syndicate', name: '高級犯罪組織', icon: '🕴️', order: 4, members: 12,
      attack: [300, 800], lootFrac: [0.20, 0.45], maxLoot: 12000000,
      weights: [0, 0, 13, 39, 50],
      desc: '有內線、有工程師、有律師。他們不搶銀行，他們接管銀行的金庫。',
    },
    {
      id: 'legend', name: '傳奇級搶匪', icon: '👑', order: 5, members: 1,
      attack: [1500, 4000], lootFrac: [0.30, 0.60], maxLoot: 300000000,
      weights: [0, 0, 1, 5, 20],
      desc: '沒有人知道他的長相。他只出現在夠大的金庫前面，而且從沒失手兩次。',
    },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
