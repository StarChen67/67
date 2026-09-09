/* ============================================================
   data/security.js — 保全設備（資料驅動）
   每個設備有 levels[]，索引 0 = Lv.1。每級欄位：
     cost      購買/升級到這一級的花費（再乘通膨 costMult）
     maint     每日維護費
     defense   防禦值（對抗強盜攻擊力）
   選用欄位（沒寫就是沒有這個效果）：
     attackMult    強盜攻擊力乘數（越小越好，全部設備相乘）
     policeSpeed   警方到達速度 0–1（取全部設備最大值，減少損失）
     panicMult     搶劫後的恐慌與信用衝擊乘數（取最小值）
     abortChance   搶劫「開始前」被自動封鎖的機率（取最大值）
     protectCap    保護的現金上限（各金庫相加）
     breachStrength 金庫被突破所需的強盜攻擊力（取最大值）
   feature：需要的解鎖旗標（null = 一開始就能蓋）
   levelFeature：某些等級才解鎖（例如金庫 Lv.4 以上）
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  BT.define('security', [
    {
      id: 'door_lock', name: '門鎖強化', icon: '🚪', feature: null, order: 1,
      desc: '最基礎的防盜設備。擋不住專業團隊，但小偷會嫌麻煩。',
      levels: [
        { cost: 8000,    maint: 2,    defense: 6 },
        { cost: 25000,   maint:  6,   defense: 15 },
        { cost: 90000,   maint: 23,   defense: 34 },
        { cost: 400000,  maint: 100,  defense: 78 },
        { cost: 1800000, maint: 450,  defense: 170 },
      ],
    },
    {
      id: 'alarm', name: '警報器', icon: '🔔', feature: null, order: 2,
      desc: '遇到搶劫時通報警方。警方越快到，強盜能搬走的就越少。',
      levels: [
        { cost: 12000,   maint: 3,    defense: 4,  policeSpeed: 0.10 },
        { cost: 45000,   maint: 11,   defense: 10, policeSpeed: 0.18 },
        { cost: 160000,  maint: 40,   defense: 22, policeSpeed: 0.28 },
        { cost: 700000,  maint: 175,  defense: 50, policeSpeed: 0.38 },
        { cost: 3000000, maint: 750,  defense: 110, policeSpeed: 0.50 },
      ],
    },
    {
      id: 'camera', name: '監視器', icon: '📹', feature: 'camera', order: 3,
      desc: '全天候錄影。強盜知道自己被拍，動作會綁手綁腳。',
      levels: [
        { cost: 30000,    maint:  8,   defense: 8,   attackMult: 0.95 },
        { cost: 110000,   maint: 28,   defense: 20,  attackMult: 0.91 },
        { cost: 400000,   maint: 100,  defense: 45,  attackMult: 0.87 },
        { cost: 1600000,  maint: 400,  defense: 100, attackMult: 0.82 },
        { cost: 6500000,  maint: 1625, defense: 220, attackMult: 0.76 },
        { cost: 26000000, maint: 6500, defense: 480, attackMult: 0.70 },
      ],
    },
    {
      id: 'glass', name: '防彈玻璃', icon: '🪟', feature: 'glass', order: 4,
      desc: '保護櫃台與員工。就算被搶，員工沒受傷，客戶的恐慌會小很多。',
      levels: [
        { cost: 200000,   maint: 50,   defense: 25,  panicMult: 0.85 },
        { cost: 900000,   maint: 225,  defense: 60,  panicMult: 0.70 },
        { cost: 4000000,  maint: 1000, defense: 140, panicMult: 0.55 },
        { cost: 18000000, maint: 4500, defense: 320, panicMult: 0.40 },
      ],
    },
    {
      id: 'access', name: '電子門禁', icon: '🔐', feature: 'access', order: 5,
      desc: '限制強盜進入重要區域。沒有識別證，連走廊都過不去。',
      levels: [
        { cost: 1500000,   maint: 375,   defense: 60,  attackMult: 0.95 },
        { cost: 6000000,   maint: 1500,  defense: 140, attackMult: 0.91 },
        { cost: 24000000,  maint: 6000,  defense: 320, attackMult: 0.86 },
        { cost: 95000000,  maint: 23750, defense: 720, attackMult: 0.81 },
        { cost: 380000000, maint: 95000, defense: 1600, attackMult: 0.75 },
      ],
    },
    {
      id: 'smart', name: '智慧保全系統', icon: '🛰️', feature: 'smart', order: 6,
      desc: '整合監控、警報、自動封鎖與身分辨識。有機會在搶劫發生前就把人擋在門外。',
      levels: [
        { cost: 60000000,   maint: 15000,  defense: 250,  abortChance: 0.08, attackMult: 0.95 },
        { cost: 240000000,  maint: 60000,  defense: 600,  abortChance: 0.15, attackMult: 0.92 },
        { cost: 900000000,  maint: 225000, defense: 1400, abortChance: 0.23, attackMult: 0.88 },
        { cost: 3500000000, maint: 875000, defense: 3200, abortChance: 0.31, attackMult: 0.84 },
        { cost: 14000000000,maint: 3500000,defense: 7000, abortChance: 0.40, attackMult: 0.80 },
      ],
    },
    {
      id: 'vault', name: '銀行金庫', icon: '🏛️', feature: null, order: 7,
      desc: '金庫保護的現金強盜搬不走，除非他的攻擊力超過金庫強度。',
      levelFeature: { 4: 'vault_mid', 5: 'vault_mid', 6: 'vault_mid', 7: 'vault_big', 8: 'vault_big', 9: 'vault_big' },
      levels: [
        { cost: 0,          maint: 5,      defense: 5,    protectCap: 250000,        breachStrength: 40 },
        { cost: 30000,      maint: 12,     defense: 12,   protectCap: 900000,        breachStrength: 110 },
        { cost: 55000,      maint: 22,     defense: 28,   protectCap: 3500000,       breachStrength: 300 },
        { cost: 900000,     maint: 240,    defense: 65,   protectCap: 14000000,      breachStrength: 1200 },
        { cost: 3500000,    maint: 900,    defense: 150,  protectCap: 55000000,      breachStrength: 2600 },
        { cost: 12000000,   maint: 3000,   defense: 340,  protectCap: 220000000,     breachStrength: 5200 },
        { cost: 45000000,   maint: 11000,  defense: 760,  protectCap: 900000000,     breachStrength: 10000 },
        { cost: 180000000,  maint: 45000,  defense: 1700, protectCap: 3600000000,    breachStrength: 19000 },
        { cost: 700000000,  maint: 170000, defense: 3800, protectCap: 15000000000,   breachStrength: 36000 },
      ],
    },
    {
      id: 'super_vault', name: '地下超級金庫', icon: '⛓️', feature: 'super_vault', order: 8,
      desc: '地下三十公尺、鈦合金門、獨立電源。只有傳奇級的對手才敢想。',
      levels: [
        { cost: 600000000,    maint: 150000,   defense: 1200,  protectCap: 12000000000,    breachStrength: 45000 },
        { cost: 2400000000,   maint: 600000,   defense: 2800,  protectCap: 60000000000,    breachStrength: 90000 },
        { cost: 9000000000,   maint: 2200000,  defense: 6500,  protectCap: 300000000000,   breachStrength: 170000 },
        { cost: 35000000000,  maint: 8500000,  defense: 15000, protectCap: 1500000000000,  breachStrength: 320000 },
        { cost: 140000000000, maint: 34000000, defense: 34000, protectCap: 8000000000000,  breachStrength: 600000 },
      ],
    },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
