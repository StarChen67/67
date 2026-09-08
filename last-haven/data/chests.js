/**
 * 寶箱五階（規格七、三十四）。tier 與品質同一枚舉。
 * blueprintLevelWeights：普通→Lv1、精良→Lv1–2、稀有→Lv2–3、史詩→Lv3–4、傳說→Lv4–5（規格三十四）。
 */
export const CHESTS = [
  { tier: 'common', name: '普通寶箱', icon: '📦', color: '#b9c2cf', lootTableId: 'lt_chest_common', rolls: [2, 3], coins: [2, 8], blueprintChance: 0.10, blueprintLevelWeights: { 1: 90, 2: 10 } },
  { tier: 'fine', name: '精良寶箱', icon: '🧰', color: '#3ddc97', lootTableId: 'lt_chest_fine', rolls: [2, 4], coins: [6, 16], blueprintChance: 0.20, blueprintLevelWeights: { 1: 55, 2: 40, 3: 5 } },
  { tier: 'rare', name: '稀有寶箱', icon: '🎁', color: '#5aa9ff', lootTableId: 'lt_chest_rare', rolls: [3, 4], coins: [15, 40], blueprintChance: 0.35, blueprintLevelWeights: { 2: 50, 3: 45, 4: 5 }, rarityWeights: { common: 40, fine: 32, rare: 20, epic: 6, legendary: 2 } },
  { tier: 'epic', name: '史詩寶箱', icon: '💎', color: '#c85dff', lootTableId: 'lt_chest_epic', rolls: [3, 5], coins: [40, 90], blueprintChance: 0.55, blueprintLevelWeights: { 3: 55, 4: 40, 5: 5 }, rarityWeights: { common: 25, fine: 32, rare: 28, epic: 12, legendary: 3 } },
  { tier: 'legendary', name: '傳說寶箱', icon: '👑', color: '#ffc84a', lootTableId: 'lt_chest_legendary', rolls: [4, 5], coins: [100, 250], blueprintChance: 0.85, blueprintLevelWeights: { 4: 55, 5: 45 }, rarityWeights: { common: 10, fine: 25, rare: 35, epic: 22, legendary: 8 } },
];
