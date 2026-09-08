/**
 * 製作配方（規格十四、二十七、三十六）。
 * requiredStation：{ station:'workbench'|'medical'|'purifier', level } 或 null（徒手）。
 * defaultUnlocked=false 的配方必須由某張圖紙解鎖（data-integrity 驗證）。
 * category → UI 分頁：weapon/ammo→武器、armor→防具、tool/material/food→工具、medicine→醫療、shelter→避難所、defense→防禦、special→特殊
 */
const C = (...pairs) => pairs.map(([itemId, qty]) => ({ itemId, qty }));
const WB = (l) => ({ station: 'workbench', level: l });
const MED = (l) => ({ station: 'medical', level: l });
const R = (id, resultItemId, resultQty, requiredItems, craftingTime, requiredStation, category, extra = {}) => ({ id, resultItemId, resultQty, requiredItems, craftingTime, requiredStation, requiredLevel: 1, category, defaultUnlocked: false, ...extra });

export const RECIPES = [
  // ---------- 預設配方（不需圖紙） ----------
  R('r_bandage', 'bandage', 2, C(['cloth', 2]), 3, null, 'medicine', { defaultUnlocked: true }),
  R('r_cooked_meat', 'cooked_meat', 1, C(['raw_meat', 1], ['wood', 1]), 4, null, 'food', { defaultUnlocked: true }),
  R('r_rope', 'rope', 1, C(['cloth', 3]), 3, null, 'tool', { defaultUnlocked: true }),
  R('r_wooden_club', 'wooden_club', 1, C(['wood', 5]), 5, WB(1), 'weapon', { defaultUnlocked: true }),
  R('r_cap', 'cap', 1, C(['cloth', 3]), 4, WB(1), 'armor', { defaultUnlocked: true }),
  R('r_jeans', 'jeans', 1, C(['cloth', 4]), 4, WB(1), 'armor', { defaultUnlocked: true }),
  R('r_fish_cook', 'cooked_meat', 1, C(['fish', 1], ['wood', 1]), 4, null, 'food', { defaultUnlocked: true }),
  // ---------- Lv1 圖紙 ----------
  R('r_nails', 'nails', 10, C(['metal', 1]), 3, WB(1), 'material'),
  R('r_plank', 'plank', 2, C(['wood', 3]), 4, WB(1), 'material'),
  R('r_wooden_spear', 'wooden_spear', 1, C(['wood', 8], ['rope', 1]), 8, WB(1), 'weapon'),
  R('r_machete', 'machete', 1, C(['metal', 6], ['wood', 2], ['cloth', 1]), 12, WB(1), 'weapon'),
  R('r_leather_armor', 'leather_armor', 1, C(['leather', 6], ['cloth', 4], ['rope', 1]), 14, WB(1), 'armor'),
  R('r_knee_pads', 'knee_pads', 1, C(['leather', 3], ['cloth', 2]), 8, WB(1), 'armor'),
  R('r_backpack', 'backpack', 1, C(['cloth', 8], ['leather', 3], ['rope', 2]), 12, WB(1), 'tool'),
  R('r_herbal_salve', 'herbal_salve', 2, C(['herb', 3], ['cloth', 1]), 5, null, 'medicine'),
  R('r_jerky', 'jerky', 3, C(['raw_meat', 2], ['wood', 1]), 8, null, 'food'),
  R('r_stew', 'stew', 2, C(['canned_food', 1], ['herb', 1], ['rainwater', 1]), 8, null, 'food'),
  // ---------- Lv2 圖紙 ----------
  R('r_iron_sword', 'iron_sword', 1, C(['metal', 12], ['wood', 4], ['leather', 2]), 20, WB(2), 'weapon'),
  R('r_bone_dagger', 'bone_dagger', 1, C(['monster_fang', 4], ['leather', 2], ['rope', 1]), 15, WB(2), 'weapon'),
  R('r_pistol', 'pistol', 1, C(['scrap_gun', 2], ['metal', 8], ['spring', 2]), 25, WB(2), 'weapon'),
  R('r_pistol_ammo', 'pistol_ammo', 12, C(['metal', 2], ['gunpowder', 1]), 6, WB(2), 'ammo'),
  R('r_shotgun_shells', 'shotgun_shells', 6, C(['metal', 2], ['gunpowder', 2], ['plastic', 1]), 6, WB(2), 'ammo'),
  R('r_gunpowder', 'gunpowder', 3, C(['chemical', 1], ['stone', 2]), 6, WB(2), 'material'),
  R('r_metal_plate', 'metal_plate', 1, C(['metal', 5]), 8, WB(2), 'material'),
  R('r_iron_armor', 'iron_armor', 1, C(['metal', 18], ['leather', 4], ['cloth', 4]), 30, WB(2), 'armor'),
  R('r_helmet', 'helmet', 1, C(['metal', 6], ['cloth', 2]), 12, WB(2), 'armor'),
  R('r_tactical_pants', 'tactical_pants', 1, C(['cloth', 10], ['leather', 4], ['metal', 2]), 15, WB(2), 'armor'),
  R('r_big_backpack', 'big_backpack', 1, C(['cloth', 12], ['leather', 6], ['rope', 3], ['metal', 2]), 18, WB(2), 'tool'),
  R('r_running_shoes', 'running_shoes', 1, C(['leather', 5], ['cloth', 4], ['plastic', 2]), 12, WB(2), 'tool'),
  R('r_painkillers', 'painkillers', 2, C(['chemical', 1], ['herb', 2]), 8, MED(1), 'medicine'),
  R('r_antidote', 'antidote', 2, C(['herb', 3], ['chemical', 1], ['monster_fang', 1]), 10, MED(1), 'medicine'),
  R('r_first_aid_kit', 'first_aid_kit', 1, C(['bandage', 3], ['med_supplies', 2], ['painkillers', 1]), 12, MED(1), 'medicine'),
  R('r_purified_water', 'purified_water', 2, C(['dirty_water', 2], ['chemical', 1]), 6, { station: 'purifier', level: 1 }, 'food'),
  R('r_rain_to_pure', 'purified_water', 1, C(['rainwater', 1]), 4, { station: 'purifier', level: 1 }, 'food'),
  // ---------- Lv3 圖紙 ----------
  R('r_steel_sword', 'steel_sword', 1, C(['adv_metal', 6], ['metal', 10], ['leather', 3]), 35, WB(3), 'weapon'),
  R('r_shotgun', 'shotgun', 1, C(['scrap_gun', 3], ['metal', 15], ['wood', 6], ['spring', 3]), 40, WB(3), 'weapon'),
  R('r_assault_rifle', 'assault_rifle', 1, C(['scrap_gun', 4], ['metal', 20], ['adv_parts', 4], ['spring', 4]), 50, WB(3), 'weapon'),
  R('r_chainsaw', 'chainsaw', 1, C(['metal', 25], ['parts', 10], ['adv_parts', 3], ['fuel', 2]), 45, WB(3), 'weapon'),
  R('r_war_hammer', 'war_hammer', 1, C(['adv_metal', 8], ['metal', 20], ['wood', 8]), 45, WB(3), 'weapon'),
  R('r_rifle_ammo', 'rifle_ammo', 15, C(['metal', 3], ['gunpowder', 2]), 8, WB(3), 'ammo'),
  R('r_concrete', 'concrete', 3, C(['stone', 4], ['chemical', 1]), 8, WB(3), 'material'),
  R('r_tactical_vest', 'tactical_vest', 1, C(['metal', 20], ['cloth', 15], ['parts', 5]), 40, WB(3), 'armor'),
  R('r_combat_helmet', 'combat_helmet', 1, C(['metal', 12], ['cloth', 4], ['plastic', 3]), 25, WB(3), 'armor'),
  R('r_hide_armor', 'hide_armor', 1, C(['monster_hide', 8], ['leather', 4], ['monster_fang', 2]), 35, WB(3), 'armor'),
  R('r_armored_legs', 'armored_legs', 1, C(['metal', 15], ['leather', 5], ['cloth', 4]), 30, WB(3), 'armor'),
  R('r_gas_mask', 'gas_mask', 1, C(['plastic', 6], ['glass', 2], ['cloth', 3], ['chemical', 2]), 25, WB(3), 'armor'),
  R('r_military_pack', 'military_pack', 1, C(['cloth', 15], ['leather', 8], ['metal', 4], ['rope', 4]), 30, WB(3), 'tool'),
  R('r_antibiotics', 'antibiotics', 2, C(['chemical', 2], ['med_supplies', 2]), 12, MED(2), 'medicine'),
  R('r_anti_rad', 'anti_rad', 2, C(['chemical', 3], ['herb', 2], ['med_supplies', 1]), 12, MED(2), 'medicine'),
  R('r_energy_cell', 'energy_cell', 5, C(['battery', 1], ['electronics', 1], ['chemical', 1]), 10, WB(4), 'ammo'),
  // ---------- Lv4 圖紙 ----------
  R('r_sniper_rifle', 'sniper_rifle', 1, C(['scrap_gun', 5], ['adv_metal', 10], ['adv_parts', 6], ['glass', 2]), 70, WB(4), 'weapon'),
  R('r_combat_armor', 'combat_armor', 1, C(['adv_metal', 30], ['cloth', 20], ['electronics', 8]), 80, WB(4), 'armor'),
  R('r_riot_helmet', 'riot_helmet', 1, C(['adv_metal', 8], ['plastic', 6], ['glass', 3]), 40, WB(4), 'armor'),
  R('r_exo_frame', 'exo_frame', 1, C(['adv_metal', 20], ['adv_parts', 12], ['electronics', 10], ['battery', 4]), 90, WB(4), 'special'),
  R('r_stimpack', 'stimpack', 1, C(['chemical', 3], ['med_supplies', 2], ['mutant_core', 1]), 15, MED(2), 'medicine'),
  R('r_med_kit_adv', 'med_kit_adv', 1, C(['first_aid_kit', 2], ['antibiotics', 1], ['chemical', 3]), 20, MED(3), 'medicine'),
  R('r_regen_serum', 'regen_serum', 1, C(['mutant_core', 1], ['chemical', 4], ['med_supplies', 2]), 20, MED(3), 'medicine'),
  // ---------- Lv5 圖紙 ----------
  R('r_plasma_rifle', 'plasma_rifle', 1, C(['circuit', 6], ['adv_metal', 20], ['energy_cell', 20], ['mutant_core', 3]), 120, WB(5), 'weapon'),
  R('r_power_armor', 'power_armor', 1, C(['adv_metal', 50], ['circuit', 8], ['adv_parts', 20], ['mutant_core', 4]), 150, WB(5), 'armor'),
  R('r_power_helmet', 'power_helmet', 1, C(['adv_metal', 15], ['circuit', 3], ['glass', 4]), 80, WB(5), 'armor'),
  R('r_power_legs', 'power_legs', 1, C(['adv_metal', 20], ['circuit', 3], ['adv_parts', 8]), 90, WB(5), 'armor'),
];
