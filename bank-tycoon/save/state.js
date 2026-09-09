/* ============================================================
   save/state.js — 存檔資料結構（單一真相來源）
   stateSkeleton() 給 migration 補齊缺鍵；createNewState() 產生新遊戲。
   所有金額都是整數元。state 必須能 JSON.stringify。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;

  BT.stateSkeleton = function () {
    return {
      schemaVersion: BT.CONFIG.schemaVersion,
      version: BT.CONFIG.version,
      createdAt: 0,
      seed: 1,
      rngState: 1,
      day: 0,
      speed: 1,
      paused: false,
      gameOver: null,          // { reason, text, day, summary }

      bank: {
        name: BT.CONFIG.start.bankName,
        level: 1,
        xp: 0,
        credit: BT.CONFIG.start.credit,
        cash: 0,
        depositRate: BT.CONFIG.start.depositRate,
        panic: 0,
        bankRun: false,
        bankRunDays: 0,
        calmCooldown: -99,
        negativeDays: 0,
      },

      customers: { list: [], nextId: 1, joinedToday: 0, leftToday: 0 },
      deposits: { payable: 0, nextPayDay: BT.CONFIG.deposits.payEveryDays, lastPaidDay: -1, lastPaidAmount: 0 },
      treasury: { obligations: [], loans: [], nextId: 1 },

      stocks: { prices: {}, prevPrices: {}, hist: {}, momentum: {}, holdings: {}, realized: 0, fees: 0 },
      products: { holdings: [], nextId: 1, realized: 0 },

      economy: { phase: 'normal', phaseDay: 0, marketRate: BT.CONFIG.economy.baseRate, inflation: 0 },
      printer: { level: 0, lastPrintDay: -999, printedTotal: 0, printCount: 0 },

      security: { devices: {}, guards: { count: 0, equip: 1, training: 1, injured: 0, healAcc: 0 } },
      insurance: { plan: null, sinceDay: -1, paidTotal: 0, payoutTotal: 0, switchDay: -999 },
      robbery: { risk: 0, lastAttemptDay: -999, history: [] },

      events: { active: [], log: [], lastFired: {} },

      reports: {
        today: { income: {}, expense: {} },
        yesterday: { income: {}, expense: {} },
        history: [],           // { d, assets, net, cash, dep, stock, prod }
        profitWindow: [],      // 最近 N 天的日淨利，信用系統用
      },

      stats: {
        maxAssets: 0, maxNetWorth: 0, maxCustomers: 0, maxLevel: 1, maxDeposits: 0,
        robberies: 0, defended: 0, stolen: 0, robLossMax: 0,
        insurancePaid: 0, insurancePayout: 0,
        printedTotal: 0, trades: 0, interestPaid: 0, opexPaid: 0, securityPaid: 0,
        upgrades: 0, eventsSeen: 0, customersTotal: 0, overdueDays: 0, loansTaken: 0,
      },

      settings: { autosave: true, pauseOnEvent: true, pauseOnRobbery: true, compact: false },
      flags: {},
    };
  };

  BT.createNewState = function (now, seed, bankName) {
    const s = BT.stateSkeleton();
    const cfg = BT.CONFIG;
    s.createdAt = now;
    s.seed = seed >>> 0 || 1;
    s.rngState = s.seed;
    s.bank.name = bankName || cfg.start.bankName;
    s.bank.cash = cfg.start.cash;
    s.bank.level = cfg.start.level;
    s.bank.credit = cfg.start.credit;
    s.bank.depositRate = cfg.start.depositRate;

    // 起始保全
    for (const [id, lv] of Object.entries(cfg.start.devices)) s.security.devices[id] = { level: lv, cond: 100 };

    // 股價初始化
    for (const st of BT.registries.stocks.all()) {
      s.stocks.prices[st.id] = st.base;
      s.stocks.prevPrices[st.id] = st.base;
      s.stocks.hist[st.id] = [st.base];
      s.stocks.momentum[st.id] = 0;
    }
    return s;
  };

  /** 空的每日收支桶。分類鍵集中在這裡，報表 UI 依此顯示。 */
  BT.INCOME_KEYS = ['reserve', 'stock', 'product', 'insurance', 'print', 'loan', 'other'];
  BT.EXPENSE_KEYS = ['interest', 'wage', 'maint', 'opex', 'premium', 'loanInterest', 'robbery', 'repair', 'fee', 'upgrade', 'invest', 'other'];
  BT.INCOME_LABEL = { reserve: '準備金利息', stock: '股票已實現損益', product: '理財商品收益', insurance: '保險理賠', print: '印鈔收入', loan: '貸款撥款', other: '其他收入' };
  BT.EXPENSE_LABEL = { interest: '存款利息', wage: '保全薪資', maint: '保全維護費', opex: '銀行營運費', premium: '保險費', loanInterest: '貸款利息', robbery: '搶劫損失', repair: '設備維修', fee: '交易手續費', upgrade: '升級與建設', invest: '投資已實現損失', other: '其他支出' };

  BT.emptyDayBook = function () {
    const income = {};
    const expense = {};
    for (const k of BT.INCOME_KEYS) income[k] = 0;
    for (const k of BT.EXPENSE_KEYS) expense[k] = 0;
    return { income, expense };
  };
})(typeof window !== 'undefined' ? window : globalThis);
