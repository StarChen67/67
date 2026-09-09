/* ============================================================
   config/config.js — 所有平衡數值（唯一真相來源）
   程式碼裡不該出現魔法數字；要調整遊戲手感就改這裡。
   對應文件：docs/GAME_DESIGN.md、docs/BALANCING.md
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  BT.CONFIG = {
    version: '1.0.0',
    schemaVersion: 1,
    saveKey: 'bt_save',

    /* ---------- 開局 ---------- */
    start: {
      cash: 200000,
      level: 1,
      credit: 600,
      depositRate: 0.02,
      bankName: '星辰銀行',
      /** 開局就有的保全（等級 1）。 */
      devices: { door_lock: 1, alarm: 1, vault: 1 },
      /** 前 N 天不會發生搶劫，讓玩家先熟悉。 */
      graceDays: 10,
    },

    /* ---------- 時間 ---------- */
    time: {
      msPerDay: 2000,        // 1× 速度時，一個遊戲日 = 2 秒
      speeds: [1, 2, 4, 8],
      daysPerMonth: 30,
      daysPerYear: 360,
      autosaveEveryDays: 5,
      historyMaxDays: 3600,  // 資產曲線最多保留 10 年
      logMax: 200,
    },

    /* ---------- 總體經濟 ---------- */
    economy: {
      baseRate: 0.020,       // 市場基準利率長期均值
      rateMeanRevert: 0.02,
      rateNoise: 0.0004,
      rateMin: 0.005,
      rateMax: 0.10,
      inflationDecay: 0.02,  // 每日通膨自然衰退比例
      inflationMax: 500,
      /** demandedRate = marketRate × (1 + inflation / inflationRateDiv) */
      inflationRateDiv: 50,
      /** 閒置現金存在央行的準備金利率 = marketRate × 此比例。
          讓「保留現金」不是純粹的損失，安全路線才會是一條真的路 ——
          但仍低於存款成本，所以完全不投資還是會慢慢虧。 */
      reserveYieldFrac: 0.90,
      phases: {
        normal:    { id: 'normal',    name: '平穩',     driftAdd: 0,     volMult: 1.0, arrivalMult: 1.0,  withdrawMult: 1.0, to: { boom: 0.010, recession: 0.008 } },
        boom:      { id: 'boom',      name: '繁榮',     driftAdd: 0.10,  volMult: 0.9, arrivalMult: 1.3,  withdrawMult: 0.9, to: { normal: 0.030 } },
        recession: { id: 'recession', name: '衰退',     driftAdd: -0.15, volMult: 1.3, arrivalMult: 0.75, withdrawMult: 1.3, to: { normal: 0.030, crisis: 0.010 } },
        crisis:    { id: 'crisis',    name: '金融危機', driftAdd: -0.35, volMult: 1.8, arrivalMult: 0.5,  withdrawMult: 1.8, to: { recession: 0.050 } },
      },
    },

    /* ---------- 客戶 ---------- */
    customers: {
      rateFactorMin: 0.3,
      rateFactorMax: 2.5,
      /** rateFactor = base + span × (myRate / demandedRate) */
      rateFactorBase: 0.3,
      rateFactorSpan: 0.7,
      creditFactor: { AAA: 1.4, AA: 1.25, A: 1.1, BBB: 1.0, BB: 0.8, B: 0.6, CCC: 0.35, D: 0.15 },
      /** 資本槓桿上限：客戶存款總額最多是淨資產的幾倍。
          達到上限就吸收不了新存款 —— 這是整個遊戲的成長節奏閥門：
          想要更多存款可以用，就得先把自己的淨資產做大。 */
      maxLeverage: 5,          // 預設值；levels.js 的 maxLeverage 會覆寫
      /** 單筆存款上限 = 淨資產 × 此比例（至少 depositCapMin）。
          沒有人會把 40 萬放進一間資本只有 20 萬的銀行。 */
      depositCapFrac: 0.25,
      depositCapMin: 20000,
      leaveBase: 0.002,
      panicDecay: 3,
      panicDecayGoodCredit: 5,   // 信用 ≥ A 時每日衰退
      panicMax: 100,
      bankRunStart: 70,          // 恐慌 ≥ 此值 → 擠兌
      bankRunEnd: 40,
      bankRunWithdrawP: 0.35,
      bankRunFrac: [0.5, 1.0],
      /** 花錢安撫：費用 = 存款總額 × costFrac，最低 minCost。 */
      calm: { costFrac: 0.004, minCost: 20000, panicDrop: 20, cooldownDays: 5 },
      overduePanicPerDay: 5,
      robPanicBase: 10,
      robPanicLootMult: 40,
      crisisPanicAdd: 15,
    },

    /* ---------- 存款利息 ---------- */
    deposits: {
      minRate: 0,
      maxRate: 0.20,
      rateStep: 0.0025,
      payEveryDays: 30,
      /** 玩家把利率調到高於此倍率的市場利率時，UI 會警告。 */
      warnRateMult: 2.0,
    },

    /* ---------- 金庫帳務 ---------- */
    treasury: {
      dueDays: { withdraw: 5, interest: 7, other: 10 },
      overdueCreditPerDay: 25,
      loan: { dailyRate: 0.0005, maxLoans: 2 },
      minLoan: 10000,
    },

    /* ---------- 股票 ---------- */
    stocks: {
      fee: 0.001,
      minPrice: 0.5,
      histDays: 180,
      momentumKeep: 0.85,
      momentumGain: 0.12,
      momentumClamp: 0.006,
      crisisCrashMult: 3,
      /** 事件對某產業的漂移修正上下限（年化）。 */
      driftModClamp: 1.5,
    },

    /* ---------- 理財商品 ---------- */
    products: {
      maxHoldings: 40,
    },

    /* ---------- 信用 ---------- */
    credit: {
      min: 0, max: 1000,
      approach: 0.08,
      base: 150,
      wCapital: 250, wLiquidity: 200, wProfit: 150, wSecurity: 100, wLevel: 100, wOverdue: 50,
      capitalTarget: 0.12,     // 淨資產/總資產 達此比例算滿分
      liquidityFloor: 0.03,    // 現金/存款 低於此為 0 分
      liquiditySpan: 0.17,     // 到 0.20 為滿分
      profitSpan: 0.06,        // 30 日淨利/淨資產 ±3% 對應 0/1
      profitWindow: 30,
      shock: { robSuccess: -40, robSuccessLoot: -40, robDefend: 8, overdue: -25, levelUp: 30 },
    },

    /* ---------- 銀行升級與經驗 ---------- */
    upgrades: {
      xpPerDay: 5,
      xpPerNewCustomer: 2,
      /** 日淨利換 XP 的除數會隨等級指數放大，避免後期經驗爆表。 */
      xpProfitDiv: 1000,
      xpProfitLevelPow: 4,
      xpPerDefend: 50,
    },

    /* ---------- 印鈔機 ---------- */
    printer: {
      unlockFeature: 'printer',
      maxLevel: 8,
      baseOutput: 300000,
      outputPow: 1.6,
      baseUpgradeCost: 5000000,
      upgradeCostPow: 2.2,
      cooldownBase: 4,
      cooldownPerLevels: 3,
      cooldownMin: 1,
      /** inflation += 100 × output / max(assets, assetFloor) × mult + flat */
      inflationMult: 2.5,
      inflationFlat: 0.3,
      inflationAssetFloor: 1000000,
    },

    /* ---------- 保全 ---------- */
    security: {
      guardBaseDefense: 8,
      guardEquipDefense: 4,
      guardTrainDefense: 3,
      guardBaseWage: 60,
      guardEquipWage: 20,
      guardTrainWage: 15,
      guardHireCost: 3000,
      guardEquipCost: 25000,   // × 目前裝備等級
      guardTrainCost: 20000,   // × 目前訓練等級
      guardMaxEquip: 5,
      guardMaxTraining: 5,
      guardHealDays: 10,       // 受傷保全每 N 天回復 1 位
      condMin: 0,
      repairCostFrac: 0.12,     // 維修費 = 該級購買價 × 損失比例 × 此值
      damageOnLoss: [0.10, 0.40],
      damageOnDefend: [0.05, 0.15],
      damageOnDefendChance: 0.35,
    },

    /* ---------- 搶劫 ---------- */
    robbery: {
      /** 現金 → 曝光度（0–100）。分段內插。 */
      exposure: [
        [0, 0], [100000, 3], [200000, 8], [500000, 25], [1000000, 40], [2000000, 55],
        [5000000, 68], [10000000, 80], [50000000, 90], [200000000, 96], [1000000000, 100],
      ],
      /** 現金 → 「維持低風險所需的防禦值」。對數內插。 */
      requiredDefense: [
        [200000, 12], [500000, 30], [1000000, 50], [2000000, 85], [5000000, 150], [10000000, 230],
        [20000000, 340], [50000000, 520], [100000000, 750], [300000000, 1100], [1000000000, 1800],
        [5000000000, 3000], [20000000000, 5000],
      ],
      mitigationMax: 0.95,
      mitigationK: 1.6,
      dailyChanceAtMaxRisk: 0.018,
      cooldownDays: 20,
      /** 強盜攻擊力 = 基礎 × (1 + attackScalePerDecade × log10(現金 / attackScaleBase))。
          銀行越大，來的人越強 —— 保全必須跟著銀行一起長大。 */
      attackScaleBase: 1000000,
      attackScalePerDecade: 0.45,
      attackScaleMax: 6,
      successMin: 0.03,
      successMax: 0.97,
      breachRoll: [0.8, 1.2],
      policeLossMult: 0.5,       // 損失 × (1 − 0.5 × policeSpeed)
      /** 單次搶劫最多帶走淨資產的這個比例。搶劫要能重傷，但不該一次即死。 */
      maxLootFracOfNet: 0.40,
      /** 損失也隨保全減免下降：防禦充足時，強盜能搬走的比例也變少。
          損失 × (1 − lootMitigation × mitigation) */
      lootMitigation: 0.7,
      guardInjureChanceLoss: 0.5,
      guardInjureChanceDefend: 0.2,
      riskLabels: [
        { max: 20, name: '非常安全', cls: 'ok' },
        { max: 40, name: '低風險', cls: 'low' },
        { max: 60, name: '中等風險', cls: 'mid' },
        { max: 80, name: '高風險', cls: 'high' },
        { max: 101, name: '極高風險', cls: 'crit' },
      ],
    },

    /* ---------- 保險 ---------- */
    insurance: {
      /** 日保費 = max(minPremium, 可被搶金額 × cover × rateBase × risk/100 × riskWeight × loading) */
      rateBase: 0.05,
      riskWeight: 0.2,
      minPremiumFrac: 0.00002,   // 至少收 可被搶金額 × 此值
      minPremium: 200,
      switchCooldownDays: 10,
    },

    /* ---------- 事件 ---------- */
    events: {
      dailyChance: 0.08,
      defaultCooldown: 45,
      logMax: 120,
    },

    /* ---------- 破產 ---------- */
    bankruptcy: {
      negativeNetWorthDays: 10,
      warnNegativeDays: 5,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
