/**
 * 怪物資料表（規格五）。
 * base = 在 minLevel 時的數值（設計時直接寫出場等級的合理值）；實際數值由 balance.monsterGrowth 曲線依「等級差」推算：
 *   stat(L) = base × mult^(L − minLevel) + add × (L − minLevel)
 * tier elite/boss 再乘 balance.monsterTier 倍率。
 * 平衡模型（normal）：擊殺需 3～8 下；每下對玩家造成約 6～10% 最大生命。
 */
const N = (id, name, icon, minLevel, base, lootTableId, extra = {}) => ({ id, name, icon, tier: 'normal', tags: [], minLevel, base, lootTableId, ...extra });
const E = (id, name, icon, minLevel, base, lootTableId, extra = {}) => ({ id, name, icon, tier: 'elite', tags: [], minLevel, base, lootTableId, ...extra });
const B = (id, name, icon, minLevel, base, lootTableId, extra = {}) => ({ id, name, icon, tier: 'boss', tags: ['boss'], minLevel, base, lootTableId, ...extra });

export const MONSTERS = [
  // ---------- 低階（森林 / 住宅 / 超市） ----------
  N('rat', '變異老鼠', '🐀', 1, { hp: 25, attack: 9, defense: 1, attackSpeed: 1.0, moveSpeed: 1.2, xp: 6 }, 'lt_animal_small', { tags: ['animal'], coins: [0, 2] }),
  N('crow', '變異烏鴉', '🐦‍⬛', 1, { hp: 22, attack: 9, defense: 0, attackSpeed: 1.2, moveSpeed: 1.6, xp: 6, dodge: 0.15 }, 'lt_animal_small', { tags: ['animal', 'flying'] }),
  N('wild_dog', '野狗', '🐕', 2, { hp: 35, attack: 12, defense: 1, attackSpeed: 1.1, moveSpeed: 1.4, xp: 9 }, 'lt_animal', { tags: ['animal'] }),
  N('looter', '掠奪者', '🧟', 3, { hp: 55, attack: 15, defense: 2, attackSpeed: 1.0, moveSpeed: 1.0, xp: 12 }, 'lt_human_low', { tags: ['human'], coins: [2, 8] }),
  N('corrupted_hound', '腐化獵犬', '🐺', 5, { hp: 90, attack: 22, defense: 3, attackSpeed: 1.3, moveSpeed: 1.6, xp: 16 }, 'lt_animal', { tags: ['animal', 'mutant'], onHitStatus: { id: 'bleeding', chance: 0.2, duration: 10 } }),
  N('mutant_spider', '變異蜘蛛', '🕷️', 5, { hp: 75, attack: 20, defense: 4, attackSpeed: 1.2, moveSpeed: 1.3, xp: 15 }, 'lt_mutant_low', { tags: ['mutant'], onHitStatus: { id: 'poison', chance: 0.35, duration: 12 } }),
  N('scavenger', '拾荒者', '🧑‍🦯', 6, { hp: 115, attack: 25, defense: 4, attackSpeed: 1.0, moveSpeed: 1.0, xp: 18 }, 'lt_human_low', { tags: ['human'], coins: [3, 10] }),
  N('ghoul', '食屍鬼', '🧟‍♂️', 8, { hp: 160, attack: 32, defense: 6, attackSpeed: 0.9, moveSpeed: 0.8, xp: 24 }, 'lt_mutant_low', { tags: ['mutant', 'undead'], onHitStatus: { id: 'infection', chance: 0.15, duration: 90 } }),
  // ---------- 中階（加油站 / 荒野 / 工廠 / 醫院） ----------
  N('infected', '變異感染者', '🧟‍♀️', 10, { hp: 190, attack: 40, defense: 8, attackSpeed: 1.0, moveSpeed: 1.0, xp: 32 }, 'lt_mutant_mid', { tags: ['mutant', 'undead'], onHitStatus: { id: 'infection', chance: 0.2, duration: 90 } }),
  N('raider', '劫掠者', '🥷', 10, { hp: 180, attack: 42, defense: 8, attackSpeed: 1.1, moveSpeed: 1.1, xp: 32, accuracy: 0.9 }, 'lt_human_mid', { tags: ['human'], coins: [8, 20] }),
  N('mutant_boar', '突變野豬', '🐗', 12, { hp: 250, attack: 46, defense: 10, attackSpeed: 0.8, moveSpeed: 1.3, xp: 40 }, 'lt_animal', { tags: ['animal', 'mutant'] }),
  N('acid_crawler', '酸液爬行者', '🦂', 13, { hp: 220, attack: 48, defense: 9, attackSpeed: 1.0, moveSpeed: 0.9, xp: 42 }, 'lt_mutant_mid', { tags: ['mutant'], onHitStatus: { id: 'poison', chance: 0.4, duration: 15 } }),
  N('sentry_bot', '哨戒機器人', '🤖', 12, { hp: 200, attack: 44, defense: 14, attackSpeed: 1.2, moveSpeed: 0.7, xp: 40, accuracy: 0.98 }, 'lt_machine', { tags: ['machine'] }),
  // ---------- 高階（城市 / 軍事基地 / 研究所 / 巢穴） ----------
  N('rad_ghoul', '輻射食屍鬼', '☢️', 16, { hp: 290, attack: 58, defense: 13, attackSpeed: 0.9, moveSpeed: 0.9, xp: 55 }, 'lt_mutant_high', { tags: ['mutant', 'undead'], onHitStatus: { id: 'radiation', chance: 0.3, duration: 60 } }),
  N('mercenary', '傭兵', '🪖', 17, { hp: 300, attack: 62, defense: 14, attackSpeed: 1.2, moveSpeed: 1.1, xp: 60, accuracy: 0.95, dodge: 0.08 }, 'lt_human_high', { tags: ['human'], coins: [15, 40] }),
  N('war_drone', '戰鬥無人機', '🛸', 20, { hp: 300, attack: 75, defense: 20, attackSpeed: 1.5, moveSpeed: 1.8, xp: 70, dodge: 0.2 }, 'lt_machine', { tags: ['machine', 'flying'] }),
  N('lab_horror', '實驗體', '👾', 22, { hp: 450, attack: 84, defense: 19, attackSpeed: 1.1, moveSpeed: 1.0, xp: 90 }, 'lt_mutant_high', { tags: ['mutant'], onHitStatus: { id: 'radiation', chance: 0.25, duration: 60 } }),
  N('hive_drone', '巢穴工蟲', '🐜', 24, { hp: 470, attack: 90, defense: 22, attackSpeed: 1.3, moveSpeed: 1.2, xp: 95 }, 'lt_mutant_high', { tags: ['mutant', 'insect'], onHitStatus: { id: 'poison', chance: 0.3, duration: 15 } }),
  N('hive_warrior', '巢穴戰蟲', '🪳', 28, { hp: 620, attack: 105, defense: 26, attackSpeed: 1.0, moveSpeed: 1.1, xp: 120 }, 'lt_mutant_high', { tags: ['mutant', 'insect'], onHitStatus: { id: 'bleeding', chance: 0.3, duration: 12 } }),
  // ---------- 菁英（乘 monsterTier.elite：HP×1.6 攻×1.3 防×1.2） ----------
  E('alpha_hound', '頭狼', '🐺', 6, { hp: 110, attack: 26, defense: 4, attackSpeed: 1.3, moveSpeed: 1.7, xp: 20 }, 'lt_animal', { tags: ['animal', 'mutant'], onHitStatus: { id: 'bleeding', chance: 0.3, duration: 12 } }),
  E('brute', '蠻力者', '👹', 12, { hp: 250, attack: 48, defense: 10, attackSpeed: 0.7, moveSpeed: 0.9, xp: 45 }, 'lt_human_mid', { tags: ['human'], coins: [20, 50] }),
  E('abomination', '憎惡', '👺', 18, { hp: 340, attack: 66, defense: 15, attackSpeed: 0.9, moveSpeed: 0.9, xp: 75 }, 'lt_mutant_high', { tags: ['mutant', 'undead'], onHitStatus: { id: 'infection', chance: 0.3, duration: 120 } }),
  E('giant_mutant', '巨型突變獸', '🦍', 20, { hp: 385, attack: 75, defense: 17, attackSpeed: 0.7, moveSpeed: 0.8, xp: 90 }, 'lt_mutant_high', { tags: ['mutant'] }),
  // ---------- Boss（乘 monsterTier.boss：HP×3 攻×1.25 防×1.2；各區域最深層） ----------
  B('forest_guardian', '森林守護獸', '🐻', 5, { hp: 100, attack: 24, defense: 4, attackSpeed: 0.8, moveSpeed: 1.0, xp: 60 }, 'lt_boss_forest', { tags: ['animal', 'mutant'], blueprintLevelBonus: 0 }),
  B('factory_overseer', '工廠監工', '🦾', 14, { hp: 250, attack: 54, defense: 12, attackSpeed: 1.0, moveSpeed: 0.7, xp: 150, accuracy: 0.98 }, 'lt_boss_factory', { tags: ['machine'], blueprintLevelBonus: 1, blueprintTypeOverride: { tool: 3, building: 3, utility: 2, defense: 2 } }),
  B('hospital_matron', '病棟之母', '🧌', 15, { hp: 260, attack: 55, defense: 11, attackSpeed: 1.1, moveSpeed: 1.0, xp: 150 }, 'lt_boss_hospital', { tags: ['mutant', 'undead'], onHitStatus: { id: 'infection', chance: 0.4, duration: 120 }, blueprintLevelBonus: 1, blueprintTypeOverride: { medicine: 5, utility: 2 } }),
  B('military_commander', '基地指揮官', '🎖️', 24, { hp: 480, attack: 92, defense: 22, attackSpeed: 1.2, moveSpeed: 1.0, xp: 300, accuracy: 0.97, dodge: 0.1 }, 'lt_boss_military', { tags: ['human'], coins: [80, 200], blueprintLevelBonus: 1, blueprintTypeOverride: { weapon: 4, armor: 4, defense: 2 } }),
  B('lab_prototype', '原型體', '🧬', 28, { hp: 620, attack: 105, defense: 25, attackSpeed: 1.2, moveSpeed: 1.1, xp: 400 }, 'lt_boss_lab', { tags: ['mutant', 'machine'], onHitStatus: { id: 'radiation', chance: 0.4, duration: 60 }, blueprintLevelBonus: 2, blueprintTypeOverride: { special: 4, weapon: 2, utility: 2, shelter: 1 } }),
  B('hive_queen', '巢穴女王', '👑', 32, { hp: 800, attack: 125, defense: 30, attackSpeed: 1.0, moveSpeed: 0.8, xp: 600 }, 'lt_boss_hive', { tags: ['mutant', 'insect'], onHitStatus: { id: 'poison', chance: 0.5, duration: 20 }, blueprintLevelBonus: 2, blueprintTypeOverride: { special: 4, shelter: 2, defense: 2, armor: 2 } }),
];
