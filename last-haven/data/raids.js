/**
 * 襲擊波次樣板（規格十三）。RaidSystem 依難度挑「minDifficulty ≤ 難度」中最高的一個。
 * 難度 = base + perDay×天數 + perPlayerLevel×玩家等級 + perShelterLevel×避難所等級（balance.raid.difficulty）。
 * 怪物等級 = max(minLevel, 難度 × levelPerDifficulty) + 波次序號 + levelOffset。
 */
const W = (monsters, delay = 0) => ({ monsters, delay });
const M = (monsterId, count, levelOffset = 0) => ({ monsterId, count, levelOffset });

export const RAIDS = [
  { id: 'raid_t1', name: '鼠群騷擾', minDifficulty: 0, waves: [W([M('rat', 3)]), W([M('rat', 2), M('crow', 2)], 15)] },
  { id: 'raid_t2', name: '野狗群', minDifficulty: 1.8, waves: [W([M('wild_dog', 2), M('rat', 2)]), W([M('looter', 2), M('wild_dog', 1)], 20), W([M('corrupted_hound', 1), M('rat', 2)], 20)] },
  { id: 'raid_t3', name: '拾荒者襲擊', minDifficulty: 2.5, waves: [W([M('looter', 2), M('scavenger', 2)]), W([M('mutant_spider', 2), M('ghoul', 1)], 20), W([M('alpha_hound', 1), M('corrupted_hound', 2)], 25)] },
  { id: 'raid_t4', name: '感染潮', minDifficulty: 3.5, waves: [W([M('infected', 3)]), W([M('raider', 2), M('ghoul', 2)], 20), W([M('brute', 1), M('infected', 2)], 25)] },
  { id: 'raid_t5', name: '突變獸群', minDifficulty: 5, waves: [W([M('mutant_boar', 2), M('acid_crawler', 1)]), W([M('sentry_bot', 2), M('raider', 2)], 20), W([M('abomination', 1), M('acid_crawler', 2)], 25)] },
  { id: 'raid_t6', name: '傭兵團', minDifficulty: 7, waves: [W([M('mercenary', 3)]), W([M('war_drone', 2), M('rad_ghoul', 2)], 20), W([M('giant_mutant', 1), M('mercenary', 2)], 25), W([M('war_drone', 3)], 20)] },
  { id: 'raid_t7', name: '巢穴傾巢', minDifficulty: 9.5, waves: [W([M('hive_drone', 3)]), W([M('lab_horror', 2), M('hive_drone', 2)], 20), W([M('hive_warrior', 2), M('abomination', 1)], 25), W([M('giant_mutant', 2), M('hive_warrior', 2)], 25)] },
];
