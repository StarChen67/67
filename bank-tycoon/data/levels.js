/* ============================================================
   data/levels.js — 銀行等級（資料驅動）
   要加第 9 級只要往這裡加一筆；systems/upgrades.js 不用改。
   欄位：
     upCost      升到下一級的費用（會再乘上通膨 costMult）；最高級為 null
     reqAssets / reqCustomers / reqCredit / reqXp   升級門檻
     maxCustomers  客戶數上限
     arrivals      每日新客戶基數（會被吸引力係數放大縮小）
     opex          每日營運費
     loanCap       緊急貸款額度上限
     creditCap     信用分數上限（等級越高才可能拿到 AAA）
     maxLeverage   客戶存款最多是淨資產的幾倍。等級越高槓桿越大 ——
                   利差被放大，但一次投資失利或大搶劫也更容易資不抵債
     maxGuards     保全人員人數上限
     features      解鎖的功能旗標（upgrades.unlocked(x) 查詢）
     mix           新客戶類型權重
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  BT.define('levels', [
    {
      id: 'lv1', level: 1, name: '小型銀行', desc: '一間櫃台、兩名行員，附近居民偶爾來存點錢。',
      upCost: 25000, reqAssets: 350000, reqCustomers: 15, reqCredit: 480, reqXp: 100,
      maxCustomers: 40, arrivals: 2, opex: 10, loanCap: 100000, creditCap: 720, maxLeverage: 6, maxGuards: 2,
      features: ['deposits', 'stocks_t1', 'security_basic'],
      mix: { retail: 100 },
    },
    {
      id: 'lv2', level: 2, name: '社區銀行', desc: '街坊都知道這家銀行，小商家開始把營收放進來。',
      upCost: 45000, reqAssets: 2000000, reqCustomers: 50, reqCredit: 540, reqXp: 400,
      maxCustomers: 110, arrivals: 5, opex: 20, loanCap: 500000, creditCap: 780, maxLeverage: 8, maxGuards: 4,
      features: ['camera'],
      mix: { retail: 65, small_biz: 35 },
    },
    {
      id: 'lv3', level: 3, name: '城市銀行', desc: '市中心的分行大樓落成，開始接待貴賓客戶。',
      upCost: 220000, reqAssets: 8000000, reqCustomers: 120, reqCredit: 600, reqXp: 1200,
      maxCustomers: 260, arrivals: 9, opex: 60, loanCap: 2000000, creditCap: 840, maxLeverage: 8, maxGuards: 8,
      features: ['stocks_t2', 'guards', 'glass', 'insurance_basic'],
      mix: { retail: 50, small_biz: 35, vip: 15 },
    },
    {
      id: 'lv4', level: 4, name: '大型銀行', desc: '跨區域經營，理財部門與大型金庫同時上線。',
      upCost: 700000, reqAssets: 30000000, reqCustomers: 300, reqCredit: 650, reqXp: 3000,
      maxCustomers: 600, arrivals: 13, opex: 400, loanCap: 8000000, creditCap: 900, maxLeverage: 10, maxGuards: 16,
      features: ['products', 'access', 'vault_mid', 'insurance_premium'],
      mix: { retail: 40, small_biz: 35, vip: 25 },
    },
    {
      id: 'lv5', level: 5, name: '全國銀行', desc: '全國都有分行，並且取得了那台不該存在的機器。',
      upCost: 2400000, reqAssets: 120000000, reqCustomers: 600, reqCredit: 700, reqXp: 7000,
      maxCustomers: 1200, arrivals: 24, opex: 1500, loanCap: 30000000, creditCap: 950, maxLeverage: 12, maxGuards: 30,
      features: ['printer', 'smart', 'vault_big', 'insurance_elite'],
      mix: { retail: 35, small_biz: 30, vip: 25, corp: 10 },
    },
    {
      id: 'lv6', level: 6, name: '國際銀行', desc: '海外據點與大型金融商品部門成立。',
      upCost: 8000000, reqAssets: 500000000, reqCustomers: 1000, reqCredit: 750, reqXp: 15000,
      maxCustomers: 2000, arrivals: 38, opex: 6000, loanCap: 120000000, creditCap: 1000, maxLeverage: 15, maxGuards: 50,
      features: ['stocks_fund', 'super_vault'],
      mix: { retail: 30, small_biz: 30, vip: 28, corp: 12 },
    },
    {
      id: 'lv7', level: 7, name: '金融集團', desc: '控股架構完成，主權基金與保險公司都是你的客戶。',
      upCost: 26000000, reqAssets: 2000000000, reqCustomers: 1600, reqCredit: 800, reqXp: 30000,
      maxCustomers: 3000, arrivals: 55, opex: 25000, loanCap: 500000000, creditCap: 1000, maxLeverage: 18, maxGuards: 80,
      features: ['stocks_intl'],
      mix: { retail: 25, small_biz: 28, vip: 28, corp: 15, inst: 4 },
    },
    {
      id: 'lv8', level: 8, name: '世界級銀行', desc: '全球金融市場的莊家。你就是利率本身。',
      upCost: null, reqAssets: null, reqCustomers: null, reqCredit: null, reqXp: null,
      maxCustomers: 4500, arrivals: 75, opex: 100000, loanCap: 2000000000, creditCap: 1000, maxLeverage: 22, maxGuards: 120,
      features: ['stocks_global'],
      mix: { retail: 22, small_biz: 25, vip: 30, corp: 17, inst: 6 },
    },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
