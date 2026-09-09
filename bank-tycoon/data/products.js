/* ============================================================
   data/products.js — 理財商品（固定期限投資）
   與股票的差別：鎖定期限、報酬固定、不受股市波動影響，
   但資金被鎖住 → 客戶提款時救不了你。這是流動性與報酬的取捨。

   公債從開局就能買：這是銀行最基本的獲利方式 ——
   用 2% 收來的存款，去買 3.5% 的短債，賺中間的利差。
   高收益的商品才需要更高的銀行等級。

   欄位：
     minLevel     需要的銀行等級
     termDays     期限（天）
     yield        年化報酬
     min / max    單筆申購上下限（max = null 不限）
     defaultProb  每日違約機率（違約損失本金 defaultLoss 比例）
     earlyPenalty 提前贖回罰則（本金比例）；提前贖回還會沒收已累積的利息，
                  所以「把每一塊錢都鎖進債券」是會被反覆罰錢的打法
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  BT.define('products', [
    {
      id: 'gov_short', name: '短期公債', icon: '📗', minLevel: 1,
      termDays: 30, yield: 0.080, min: 20000, max: null,
      defaultProb: 0, defaultLoss: 0, earlyPenalty: 0.01,
      desc: '30 天到期，政府擔保。年化 8%，比 2% 的存款成本高不少，但比放著現金好，也是銀行最基本的利差來源。',
    },
    {
      id: 'gov_long', name: '長期公債', icon: '📘', minLevel: 2,
      termDays: 180, yield: 0.105, min: 200000, max: null,
      defaultProb: 0, defaultLoss: 0, earlyPenalty: 0.03,
      desc: '半年期。利率比短債好，但半年內你都動不了這筆錢。',
    },
    {
      id: 'corp_bond', name: '企業債券', icon: '📙', minLevel: 3,
      termDays: 90, yield: 0.13, min: 1000000, max: null,
      defaultProb: 0.00014, defaultLoss: 0.6, earlyPenalty: 0.04,
      desc: '年化 13%。發行公司偶爾會倒，倒了本金賠六成。',
    },
    {
      id: 'junk_bond', name: '高收益債', icon: '📕', minLevel: 4,
      termDays: 120, yield: 0.26, min: 3000000, max: null,
      defaultProb: 0.00026, defaultLoss: 0.85, earlyPenalty: 0.08,
      desc: '業務員叫它「高收益」，風控部門叫它垃圾債。',
    },
    {
      id: 'reit', name: '不動產信託', icon: '🏘️', minLevel: 4,
      termDays: 240, yield: 0.15, min: 5000000, max: null,
      defaultProb: 0.00014, defaultLoss: 0.4, earlyPenalty: 0.06,
      desc: '收租金的商辦組合。穩，但鎖得很久。',
    },
    {
      id: 'structured', name: '結構型商品', icon: '🧊', minLevel: 6,
      termDays: 60, yield: 0.21, min: 20000000, max: null,
      defaultProb: 0.00027, defaultLoss: 0.5, earlyPenalty: 0.10,
      desc: '連結一籃子標的的衍生性商品。合約有 87 頁，沒有人讀完過。',
    },
    {
      id: 'sovereign', name: '主權基金聯貸', icon: '🌍', minLevel: 7,
      termDays: 360, yield: 0.18, min: 100000000, max: null,
      defaultProb: 0.00018, defaultLoss: 0.3, earlyPenalty: 0.05,
      desc: '借給某個產油國一整年。到期前別想拿回來。',
    },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
