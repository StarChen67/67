/* ============================================================
   data/events.js — 隨機事件（資料驅動）
   每日有機會抽一個「合格」事件（等級、冷卻、條件都符合）。

   欄位：
     w         權重；minLevel 最低銀行等級；cooldown 冷卻天數
     kind      good / bad / danger / neutral（決定顏色與是否彈窗）
     days      持續天數（有 mods 時必填）
     mods      持續期間的修正值，由各系統呼叫 events.mod(key) 取得：
                 driftAdd:{sector:值}  股票年化漂移加成（依產業）
                 volMult               股票波動倍率
                 withdrawMult          客戶提款機率倍率
                 arrivalMult           新客戶倍率
                 riskAdd               搶劫風險加值
                 maintMult             保全維護費倍率
     once      立即效果：
                 stockShock:{sector|id:比例}   股價立刻變動
                 marketRate:值                市場利率加減
                 panic:值                     恐慌加減
                 credit:值                    信用分數加減
                 cash:值                      現金加減（負值可能變成待付義務）
                 inflation:值                 通膨加減
                 bigDeposit:{frac:[..],min:n} 大額存款（比例取自總存款）
                 bigWithdraw:{frac:[..],min:n}大額提款
                 deviceDamage:{ids?,count,range} 保全設備損壞
                 forceRobbery:{tier}          強制觸發搶劫
                 setPhase:'crisis'            直接切換景氣階段
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  BT.define('events', [
    /* ---------------- 總體經濟 ---------------- */
    {
      id: 'crisis', name: '金融危機', icon: '🌋', kind: 'danger', w: 5, minLevel: 2, cooldown: 240, days: 45,
      text: '國際金融市場全面崩潰，各國央行緊急開會。客戶開始把錢搬回家裡的床墊底下。',
      mods: { withdrawMult: 1.6, arrivalMult: 0.5, volMult: 1.5 },
      once: { setPhase: 'crisis', panic: 15, marketRate: 0.012 },
    },
    {
      id: 'boom', name: '經濟繁榮', icon: '🌅', kind: 'good', w: 10, minLevel: 1, cooldown: 150, days: 60,
      text: '景氣熱絡，薪水與利潤同步成長，大家手上都有閒錢。',
      mods: { arrivalMult: 1.25 },
      once: { setPhase: 'boom' },
    },
    {
      id: 'recession', name: '經濟衰退', icon: '🌧️', kind: 'bad', w: 9, minLevel: 1, cooldown: 150, days: 60,
      text: '訂單減少、失業率上升。存款成長趨緩，提款變多。',
      mods: { withdrawMult: 1.2, arrivalMult: 0.8 },
      once: { setPhase: 'recession' },
    },
    {
      id: 'rate_up', name: '央行升息', icon: '📈', kind: 'neutral', w: 12, minLevel: 1, cooldown: 60,
      text: '央行宣布升息一碼。客戶會期待更高的存款利率，否則就把錢搬去別家。',
      once: { marketRate: 0.005 },
    },
    {
      id: 'rate_down', name: '央行降息', icon: '📉', kind: 'neutral', w: 12, minLevel: 1, cooldown: 60,
      text: '央行降息以刺激景氣。你的利息成本壓力變小了。',
      once: { marketRate: -0.005 },
    },
    {
      id: 'capital_flight', name: '資金外逃', icon: '🛫', kind: 'bad', w: 6, minLevel: 3, cooldown: 120, days: 20,
      text: '匯率預期轉弱，大戶把資金匯往海外。',
      mods: { withdrawMult: 1.5, arrivalMult: 0.7 },
    },

    /* ---------------- 股市 ---------------- */
    {
      id: 'market_crash', name: '股市崩盤', icon: '💥', kind: 'danger', w: 6, minLevel: 1, cooldown: 180, days: 25,
      text: '恐慌性賣壓湧現，指數單日暴跌。持股的帳面損益會很難看。',
      mods: { volMult: 1.8 },
      once: { stockShock: { all: -0.14 } },
    },
    {
      id: 'tech_rally', name: '科技股大漲', icon: '🚀', kind: 'good', w: 10, minLevel: 1, cooldown: 90, days: 30,
      text: '新一代晶片發表會引爆買盤，科技股全面噴出。',
      mods: { driftAdd: { tech: 0.5 } },
      once: { stockShock: { tech: 0.14 } },
    },
    {
      id: 'energy_crisis', name: '能源危機', icon: '🛢️', kind: 'bad', w: 9, minLevel: 1, cooldown: 120, days: 40,
      text: '產油國減產，油價一飛沖天。能源股大漲，其他產業成本上升。',
      mods: { driftAdd: { energy: 0.45, build: -0.2, food: -0.15 } },
      once: { stockShock: { energy: 0.18, build: -0.06 }, inflation: 2 },
    },
    {
      id: 'medical_breakthrough', name: '醫療突破', icon: '🧬', kind: 'good', w: 8, minLevel: 1, cooldown: 120, days: 35,
      text: '某家生技公司的三期臨床成功，整個醫療類股跟著漲。',
      mods: { driftAdd: { health: 0.55 } },
      once: { stockShock: { health: 0.16 } },
    },
    {
      id: 'build_wave', name: '建設潮', icon: '🏗️', kind: 'good', w: 8, minLevel: 1, cooldown: 120, days: 40,
      text: '政府公布十年基礎建設計畫，營建類股一路開紅盤。',
      mods: { driftAdd: { build: 0.4 } },
      once: { stockShock: { build: 0.12 } },
    },
    {
      id: 'food_scandal', name: '食品安全事件', icon: '🧪', kind: 'bad', w: 7, minLevel: 1, cooldown: 120, days: 30,
      text: '知名廠商爆出添加物醜聞，食品股集體重挫。',
      mods: { driftAdd: { food: -0.35 } },
      once: { stockShock: { food: -0.15 } },
    },
    {
      id: 'finance_rally', name: '金融股利多', icon: '🏦', kind: 'good', w: 8, minLevel: 2, cooldown: 120, days: 30,
      text: '主管機關放寬金融業投資限制，金融股全面走揚。',
      mods: { driftAdd: { finance: 0.35 } },
      once: { stockShock: { finance: 0.10 }, credit: 10 },
    },

    /* ---------------- 客戶 ---------------- */
    {
      id: 'big_deposit', name: '大型客戶存款', icon: '💰', kind: 'good', w: 14, minLevel: 1, cooldown: 30,
      text: '一位大戶被你的條件說服，把整筆資金搬了進來。',
      once: { bigDeposit: { frac: [0.05, 0.14], min: 60000 } },
    },
    {
      id: 'big_withdraw', name: '大型客戶提款', icon: '🏧', kind: 'bad', w: 12, minLevel: 1, cooldown: 30,
      text: '一位大戶臨時需要用錢，要求全額提領。現金準備夠嗎？',
      once: { bigWithdraw: { frac: [0.06, 0.16], min: 50000 } },
    },
    {
      id: 'media_praise', name: '媒體正面報導', icon: '📰', kind: 'good', w: 9, minLevel: 1, cooldown: 90, days: 20,
      text: '財經雜誌把你的銀行選為年度最佳成長銀行。',
      mods: { arrivalMult: 1.35 },
      once: { credit: 25, panic: -10 },
    },
    {
      id: 'audit', name: '監管稽核', icon: '🔍', kind: 'neutral', w: 8, minLevel: 2, cooldown: 100,
      text: '金融監理機關前來查核帳目。準備金充足的銀行會加分，不足的會被記點。',
      once: { audit: true },
    },
    {
      id: 'hacker', name: '駭客攻擊', icon: '👾', kind: 'bad', w: 7, minLevel: 3, cooldown: 100,
      text: '網路銀行系統遭入侵，部分資金被轉走，客戶信心受損。',
      once: { cashFrac: -0.04, credit: -30, panic: 8 },
    },

    /* ---------------- 治安與保全 ---------------- */
    {
      id: 'rob_small', name: '普通搶劫', icon: '🔫', kind: 'danger', w: 6, minLevel: 1, cooldown: 60,
      text: '有人拿著槍衝進大廳。',
      once: { forceRobbery: { tier: 'robber' } },
    },
    {
      id: 'rob_big', name: '大型搶劫', icon: '🎭', kind: 'danger', w: 5, minLevel: 3, cooldown: 90,
      text: '一支訓練有素的隊伍同時切斷了電力與通訊。',
      once: { forceRobbery: { tier: 'crew' } },
    },
    {
      id: 'syndicate_target', name: '犯罪集團鎖定銀行', icon: '🕴️', kind: 'danger', w: 5, minLevel: 5, cooldown: 90, days: 30,
      text: '情報顯示，一個跨國犯罪組織把你的金庫列入了名單。接下來一個月要特別小心。',
      mods: { riskAdd: 18 },
    },
    {
      id: 'device_fault', name: '保全設備故障', icon: '⚠️', kind: 'bad', w: 9, minLevel: 1, cooldown: 40,
      text: '例行檢查發現多項保全設備老化失效，需要維修才能恢復防禦力。',
      once: { deviceDamage: { count: [1, 2], range: [0.10, 0.28] } },
    },
    {
      id: 'vault_fault', name: '金庫故障', icon: '🚧', kind: 'bad', w: 6, minLevel: 2, cooldown: 60,
      text: '金庫的液壓門卡住了，保護能力大幅下降。修好之前現金是裸奔的。',
      once: { deviceDamage: { ids: ['vault', 'super_vault'], count: 1, range: [0.20, 0.45] } },
    },
    {
      id: 'police_patrol', name: '警方加強巡邏', icon: '🚓', kind: 'good', w: 9, minLevel: 1, cooldown: 60, days: 30,
      text: '轄區警力增派，銀行門口整天都有巡邏車經過。',
      mods: { riskAdd: -15 },
    },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
