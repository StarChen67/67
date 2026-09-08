/**
 * 避難所等級表（規格十、十一、三十七）。cost 於執行時乘 balance.shelter.upgradeCostMult。
 * storageCapacity 單位 = 重量（與背包相同）。
 */
export const SHELTER_LEVELS = [
  { level: 1, name: '臨時避難所', maxHp: 1000, defense: 20, storageCapacity: 100, cost: [], unlocks: ['workbench', 'warehouse', 'water_tank', 'wall'] },
  { level: 2, name: '加固避難所', maxHp: 1500, defense: 30, storageCapacity: 150,
    cost: [{ itemId: 'wood', qty: 100 }, { itemId: 'stone', qty: 80 }, { itemId: 'metal', qty: 30 }],
    unlocks: ['food_cellar', 'medical', 'farm'] },
  { level: 3, name: '堅固據點', maxHp: 2200, defense: 45, storageCapacity: 220,
    cost: [{ itemId: 'wood', qty: 180 }, { itemId: 'stone', qty: 150 }, { itemId: 'metal', qty: 80 }, { itemId: 'parts', qty: 20 }],
    unlocks: ['generator', 'turret', 'purifier'] },
  { level: 4, name: '強化堡壘', maxHp: 3200, defense: 65, storageCapacity: 300,
    cost: [{ itemId: 'metal', qty: 200 }, { itemId: 'adv_parts', qty: 30 }, { itemId: 'concrete', qty: 100 }],
    requiredBlueprintId: 'bp_shelter_reinforced', unlocks: ['radar'] },
  { level: 5, name: '地下要塞', maxHp: 4500, defense: 90, storageCapacity: 400,
    cost: [{ itemId: 'concrete', qty: 250 }, { itemId: 'adv_metal', qty: 80 }, { itemId: 'electronics', qty: 40 }, { itemId: 'adv_parts', qty: 50 }],
    requiredBlueprintId: 'bp_shelter_bunker', unlocks: [] },
  { level: 6, name: '最後庇護所', maxHp: 6500, defense: 120, storageCapacity: 550,
    cost: [{ itemId: 'adv_metal', qty: 200 }, { itemId: 'electronics', qty: 100 }, { itemId: 'mutant_core', qty: 5 }, { itemId: 'circuit', qty: 40 }],
    requiredBlueprintId: 'bp_shelter_fortress', unlocks: [] },
];
