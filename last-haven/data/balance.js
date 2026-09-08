/**
 * 遊戲平衡參數（規格二十三 + 四十）。調整難度只改這裡。
 * 所有速率單位：每遊戲秒；時間單位：秒；機率 0~1。
 */
export const BALANCE = {
  time: { dayLength: 480, step: 0.1 },

  player: {
    base: { maxHp: 100, attack: 10, defense: 2, attackSpeed: 1.0, critChance: 0.05, critDamage: 1.5, moveSpeed: 1.0, accuracy: 0.95, dodge: 0.03, armorPen: 0 },
    startingEquipment: { weapon: 'wooden_club', body: 'jacket' },
    startingInventory: [{ itemId: 'water_bottle', qty: 2 }, { itemId: 'berries', qty: 3 }, { itemId: 'bandage', qty: 1 }],
    startingStorage: [{ itemId: 'wood', qty: 30 }, { itemId: 'stone', qty: 15 }, { itemId: 'cloth', qty: 5 }, { itemId: 'water_bottle', qty: 4 }, { itemId: 'canned_food', qty: 3 }, { itemId: 'metal', qty: 5 }],
  },

  survival: {
    hungerPerSec: 0.14,      // 約 12 分鐘從 0 到 100
    thirstPerSec: 0.19,      // 約 9 分鐘從 0 到 100
    warnThreshold: 75,
    hpWarnPct: 0.25,
    starvingStatus: 'starving',
    dehydratedStatus: 'dehydrated',
    // 在避難所時基礎自然回血（每秒），受 healRate modifier
    homeRegenPerSec: 0.15,
  },

  progression: {
    xpBase: 30, xpGrowth: 1.35, maxLevel: 60,
    perLevel: { maxHp: 10, attack: 2, defense: 1 },
    exploreXp: { perDepth: 8, perGather: 3, perSiteSearch: 6 },
  },

  // 依「等級差」成長：stat(L) = base × mult^(L−minLevel) + add × (L−minLevel)
  monsterGrowth: {
    hp: { mult: 1.06, add: 8 },
    attack: { mult: 1.04, add: 1.2 },
    defense: { mult: 1.02, add: 0.5 },
    xp: { mult: 1.06, add: 2 },
  },
  monsterTier: {
    normal: { hp: 1, attack: 1, defense: 1, xp: 1, lootRolls: 0 },
    elite: { hp: 1.6, attack: 1.3, defense: 1.2, xp: 2, lootRolls: 1 },
    boss: { hp: 3.0, attack: 1.25, defense: 1.2, xp: 5, lootRolls: 2 },
  },

  combat: {
    minDamage: 1,
    fleeBase: 0.5, fleeSpeedFactor: 0.3, fleeMin: 0.1, fleeMax: 0.95, fleeFailPenalty: 1, // 逃跑失敗被打一次
    noAmmoMult: 0.3,       // 遠程武器沒彈藥時的傷害倍率
    enemyFirstStrikeDelay: 0.6, // 遭遇時敵人第一擊的延遲（秒）
  },

  loot: {
    dropChanceMult: 1, chestChanceMult: 1,
    tierShiftPerLevel: 0.02,   // 每級把寶箱品質權重往上一階移轉 2%
    defaultChestDrop: {
      normal: { chance: 0.12, tierWeights: { common: 70, fine: 22, rare: 7, epic: 1, legendary: 0 } },
      elite: { chance: 0.40, tierWeights: { common: 30, fine: 40, rare: 22, epic: 7, legendary: 1 } },
      boss: { chance: 1.0, minTier: 'rare', tierWeights: { common: 0, fine: 0, rare: 55, epic: 35, legendary: 10 } },
    },
  },

  blueprintDrop: {
    enemy: 0.04, resource: 0.03, chest: 0.25,
    eliteMult: 2.5, bossMult: 6,
    areaLevelModifier: 0.03,     // × area.danger
    rarityWeights: { common: 55, fine: 25, rare: 13, epic: 5, legendary: 2 },
    levelWeights: { 1: 50, 2: 28, 3: 14, 4: 6, 5: 2 },
    typeWeights: { weapon: 3, armor: 3, tool: 3, medicine: 2, building: 2, defense: 2, shelter: 1, utility: 2, special: 1 },
  },

  research: {
    byRarity: { common: 5, fine: 10, rare: 25, epic: 60, legendary: 150 },
    redeemMult: 3,   // 兌換已發現未學習圖紙的價格 = researchValue × redeemMult
  },

  quality: {
    mult: { common: 1.0, fine: 1.15, rare: 1.35, epic: 1.6, legendary: 2.0 },
    label: { common: '普通', fine: '精良', rare: '稀有', epic: '史詩', legendary: '傳說' },
    color: { common: '#b9c2cf', fine: '#3ddc97', rare: '#5aa9ff', epic: '#c85dff', legendary: '#ffc84a' },
    order: ['common', 'fine', 'rare', 'epic', 'legendary'],
  },

  craftQuality: {
    byWorkbenchLevel: {
      0: { common: 100 },
      1: { common: 90, fine: 10 },
      2: { common: 70, fine: 25, rare: 5 },
      3: { common: 50, fine: 33, rare: 15, epic: 2 },
      4: { common: 30, fine: 38, rare: 24, epic: 7, legendary: 1 },
      5: { common: 15, fine: 35, rare: 30, epic: 15, legendary: 5 },
    },
    blueprintRarityShift: { common: 0, fine: 0, rare: 1, epic: 1, legendary: 2 },
  },

  inventory: { baseCarry: 40, chestWeight: 2, blueprintWeight: 0.1 },

  shelter: {
    upgradeCostMult: 1,
    repairCost: { itemId: 'wood', perHp: 0.05 },   // 修 100 HP 需 5 木材
    buildingRepairCost: { itemId: 'metal', perHp: 0.04 },
  },

  disaster: { rollEveryHours: 6, chancePerRoll: 0.25, maxActive: 1, firstDay: 1 },
  event: { chancePerHour: 0.12 },

  raid: {
    firstDay: 2, intervalDays: 2, intervalMinDays: 0.75, intervalDecayPerRaid: 0.1,
    warningSec: 60,
    difficulty: { base: 1, perDay: 0.1, perPlayerLevel: 0.05, perShelterLevel: 0.15 },
    levelPlayerFactor: 0.8, levelDayFactor: 0.25,   // 怪物等級 ≈ 0.8×玩家等級 + 0.25×天數（+波次）
    frontLine: 2, frontLineDifficulty: 2.4,          // 難度 < 2.4 時前排只有 1 隻
    structureAttackMult: 0.5,     // 攻擊結構的怪物傷害倍率
    coreDefenseFactor: 0.5,       // 避難所 defense 對結構傷害的減免比例 (dmg - def*factor)
    awayStructureMult: 1.3,       // 玩家不在家時結構受傷倍率
    rewardChestChance: 0.6,
  },

  exploration: {
    poiPerDepth: [3, 5],
    pairChanceBase: 0.12, pairChancePerDepth: 0.07, pairChanceMax: 0.45,   // 兩隻一組的機率隨深度上升
    ambushBase: 0.08, ambushPerDanger: 0.01,
    resourceQtyMult: 1,
    depthLevelStep: 1,            // 每深入一層怪物等級 +1
    travelSpeedBase: 1,
    poiWeightsDefault: { resource: 45, monster: 30, chest: 10, site: 15 },
    gatherXp: 3,
  },

  save: { autosaveSec: 30, slots: 3 },

  modifierBounds: {
    hungerRate: [0, 10], thirstRate: [0, 10], exploreSpeed: [0.2, 5], gatherSpeed: [0.2, 5],
    carryCapacity: [5, 1000], storageCapacity: [10, 100000],
    playerAttack: [1, 1e6], playerDefense: [0, 1e6], playerMaxHp: [10, 1e6], attackSpeed: [0.2, 10],
    critChance: [0, 1], accuracy: [0.05, 1], dodge: [0, 0.9], moveSpeed: [0.2, 5],
    enemyAttack: [0.1, 1e6], enemyHp: [1, 1e7], lootChance: [0, 10], blueprintChance: [0, 1], xpGain: [0, 10],
    shelterDefense: [0, 1e6], raidDamage: [0, 10], healRate: [0, 10], craftSpeed: [0.1, 10], ambushChance: [0, 1],
  },
};
