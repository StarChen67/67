/* ============================================================
   data/insurance.js — 銀行搶劫保險
   保費每日從現金扣（付不出會變成待付義務）。
   保費是風險加權的：保全越好、風險值越低，保費越便宜。
   所以保險不能取代保全，只能補上殘餘風險。
   欄位：
     cover      理賠比例
     maxPayout  單次理賠上限
     loading    保費加成（越高級的方案，每元保額也越貴）
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  BT.define('insurance', [
    {
      id: 'basic', name: '基本保險', icon: '🧾', feature: 'insurance_basic', order: 1,
      cover: 0.40, maxPayout: 3000000, loading: 1.30,
      desc: '賠四成，上限 300 萬。理賠專員會來拍很多照片。',
    },
    {
      id: 'premium', name: '高級保險', icon: '📜', feature: 'insurance_premium', order: 2,
      cover: 0.65, maxPayout: 60000000, loading: 1.45,
      desc: '賠六成五，上限 6000 萬。適合開始有大額現金部位的銀行。',
    },
    {
      id: 'elite', name: '頂級保險', icon: '🏅', feature: 'insurance_elite', order: 3,
      cover: 0.85, maxPayout: 2000000000, loading: 1.60,
      desc: '賠八成五，上限 20 億。保費很痛，但一次大搶劫就回本。',
    },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
