/**
 * 避難所設施（規格十、二十七、三十八、三十九）。
 * levels[0] = 建造需求（cost / requiredBlueprintId），levels[i] = 升到 Lv.i+1 的需求與效果。
 * effects：storage / waterPerDay(itemId) / foodPerDay(itemId) / healPerSec / wallHp / turretDps / power /
 *          craftStation {station, level} / raidWarningSec / defense / shelterMaxHp / modifiers {key:{mult,add}}
 */
const C = (...pairs) => pairs.map(([itemId, qty]) => ({ itemId, qty }));

export const BUILDINGS = [
  {
    id: 'workbench', name: '工作台', icon: '🔨', category: 'crafting', requiresShelterLevel: 1, maxLevel: 5,
    desc: '製作武器、防具、工具與零件的核心設施。等級越高，能使用的圖紙越高級、成品品質越好。',
    levels: [
      { name: '簡陋工作台', cost: C(['wood', 20], ['stone', 10]), hp: 200, effects: { craftStation: { station: 'workbench', level: 1 } } },
      { name: '金屬工作台', cost: C(['wood', 40], ['metal', 20], ['parts', 5]), hp: 300, effects: { craftStation: { station: 'workbench', level: 2 } } },
      { name: '精密工作台', cost: C(['metal', 60], ['parts', 20], ['adv_parts', 5], ['electronics', 3]), hp: 400, effects: { craftStation: { station: 'workbench', level: 3 } } },
      { name: '高級工作台', cost: C(['metal', 100], ['adv_parts', 15], ['electronics', 10]), requiredBlueprintId: 'bp_workbench_advanced', hp: 500, effects: { craftStation: { station: 'workbench', level: 4 } } },
      { name: '大師工作台', cost: C(['adv_metal', 80], ['electronics', 30], ['circuit', 10], ['mutant_core', 2]), requiredBlueprintId: 'bp_workbench_master', hp: 600, effects: { craftStation: { station: 'workbench', level: 5 }, modifiers: { craftSpeed: { mult: 1.25 } } } },
    ],
  },
  {
    id: 'warehouse', name: '倉庫', icon: '📦', category: 'storage', requiresShelterLevel: 1, maxLevel: 4,
    desc: '增加倉庫容量。',
    levels: [
      { cost: C(['wood', 30], ['stone', 10]), hp: 150, effects: { storage: 50 } },
      { cost: C(['wood', 60], ['stone', 30], ['nails', 10]), hp: 250, effects: { storage: 100 } },
      { cost: C(['wood', 100], ['metal', 30], ['plank', 10]), requiredBlueprintId: 'bp_warehouse_expansion', hp: 350, effects: { storage: 160 } },
      { cost: C(['metal', 80], ['concrete', 30], ['metal_plate', 5]), hp: 500, effects: { storage: 240 } },
    ],
  },
  {
    id: 'water_tank', name: '蓄水桶', icon: '🛢️', category: 'production', requiresShelterLevel: 1, maxLevel: 3,
    desc: '收集雨水，每天產出雨水到倉庫。',
    levels: [
      { cost: C(['wood', 20], ['plastic', 5], ['rope', 2]), hp: 120, effects: { waterPerDay: 2, waterItem: 'rainwater', storage: 10 } },
      { cost: C(['metal', 20], ['plastic', 10]), requiredBlueprintId: 'bp_water_tank_improved', hp: 200, effects: { waterPerDay: 4, waterItem: 'rainwater', storage: 20 } },
      { cost: C(['metal', 40], ['plastic', 20], ['glass', 5]), hp: 280, effects: { waterPerDay: 6, waterItem: 'rainwater', storage: 30 } },
    ],
  },
  {
    id: 'food_cellar', name: '食物儲藏室', icon: '🥫', category: 'storage', requiresShelterLevel: 2, maxLevel: 3,
    desc: '陰涼的儲藏室，增加倉庫容量並每天醃製少量肉乾。',
    levels: [
      { cost: C(['wood', 40], ['stone', 30], ['cloth', 5]), hp: 150, effects: { storage: 30 } },
      { cost: C(['wood', 60], ['metal', 20], ['nails', 10]), hp: 250, effects: { storage: 60, foodPerDay: 1, foodItem: 'jerky' } },
      { cost: C(['metal', 50], ['concrete', 20], ['glass', 5]), requiredBlueprintId: 'bp_cold_storage', hp: 350, effects: { storage: 100, foodPerDay: 2, foodItem: 'jerky' } },
    ],
  },
  {
    id: 'wall', name: '防禦牆', icon: '🧱', category: 'defense', requiresShelterLevel: 1, maxLevel: 4,
    desc: '襲擊時怪物必須先攻破防禦牆才能傷害其他設施與核心。',
    levels: [
      { name: '木柵欄', cost: C(['wood', 40], ['stone', 30]), hp: 300, effects: { wallHp: 300, defense: 5 } },
      { name: '石牆', cost: C(['stone', 80], ['metal', 20]), hp: 600, effects: { wallHp: 600, defense: 10 } },
      { name: '強化牆', cost: C(['concrete', 40], ['metal', 60], ['metal_plate', 5]), requiredBlueprintId: 'bp_reinforced_wall', hp: 1000, effects: { wallHp: 1000, defense: 15 } },
      { name: '要塞城牆', cost: C(['concrete', 100], ['adv_metal', 20], ['metal_plate', 10]), requiredBlueprintId: 'bp_wall_fortified', hp: 1500, effects: { wallHp: 1500, defense: 25 } },
    ],
  },
  {
    id: 'turret', name: '自動炮塔', icon: '🗼', category: 'defense', requiresShelterLevel: 3, maxLevel: 3,
    desc: '襲擊時自動攻擊來犯的怪物。',
    levels: [
      { cost: C(['metal', 60], ['parts', 20], ['electronics', 10], ['scrap_gun', 2]), requiredBlueprintId: 'bp_turret', hp: 250, effects: { turretDps: 8 } },
      { cost: C(['adv_parts', 15], ['electronics', 15], ['adv_metal', 10]), hp: 350, effects: { turretDps: 16 } },
      { cost: C(['adv_metal', 30], ['circuit', 5], ['energy_cell', 10]), requiredBlueprintId: 'bp_turret_advanced', hp: 450, effects: { turretDps: 30 } },
    ],
  },
  {
    id: 'medical', name: '醫療站', icon: '🏥', category: 'medical', requiresShelterLevel: 2, maxLevel: 3,
    desc: '在避難所時持續回復生命，並可製作藥品。',
    levels: [
      { name: '急救站', cost: C(['cloth', 20], ['herb', 10], ['wood', 20]), hp: 150, effects: { healPerSec: 0.3, craftStation: { station: 'medical', level: 1 } } },
      { name: '高級醫療站', cost: C(['med_supplies', 20], ['metal', 20], ['chemical', 5]), requiredBlueprintId: 'bp_medical_advanced', hp: 250, effects: { healPerSec: 0.7, craftStation: { station: 'medical', level: 2 } } },
      { name: '手術室', cost: C(['electronics', 15], ['chemical', 15], ['adv_parts', 5]), hp: 350, effects: { healPerSec: 1.2, craftStation: { station: 'medical', level: 3 }, modifiers: { healRate: { mult: 1.3 } } } },
    ],
  },
  {
    id: 'farm', name: '農場', icon: '🌾', category: 'production', requiresShelterLevel: 2, maxLevel: 3,
    desc: '種植蔬菜，每天產出食物到倉庫。',
    levels: [
      { name: '菜園', cost: C(['wood', 30], ['seed', 5]), hp: 100, effects: { foodPerDay: 2, foodItem: 'vegetables' } },
      { name: '溫室', cost: C(['wood', 60], ['seed', 10], ['plastic', 10], ['glass', 5]), requiredBlueprintId: 'bp_greenhouse', hp: 180, effects: { foodPerDay: 4, foodItem: 'vegetables' } },
      { name: '水耕農場', cost: C(['electronics', 10], ['plastic', 20], ['wire', 10], ['seed', 15]), requiredBlueprintId: 'bp_hydroponic_farm', hp: 260, effects: { foodPerDay: 7, foodItem: 'vegetables', modifiers: { hungerRate: { mult: 0.95 } } } },
    ],
  },
  {
    id: 'purifier', name: '淨水器', icon: '🚰', category: 'utility', requiresShelterLevel: 3, maxLevel: 2,
    desc: '每天產出淨水，並可用髒水製作淨水。',
    levels: [
      { cost: C(['metal', 30], ['plastic', 10], ['glass', 5], ['chemical', 3]), requiredBlueprintId: 'bp_purifier', hp: 150, effects: { waterPerDay: 4, waterItem: 'purified_water', craftStation: { station: 'purifier', level: 1 } } },
      { cost: C(['electronics', 10], ['adv_parts', 5], ['chemical', 5]), hp: 250, effects: { waterPerDay: 8, waterItem: 'purified_water', craftStation: { station: 'purifier', level: 2 } } },
    ],
  },
  {
    id: 'generator', name: '發電機', icon: '⚡', category: 'utility', requiresShelterLevel: 3, maxLevel: 2,
    desc: '提供電力，加快製作速度並強化炮塔。',
    levels: [
      { cost: C(['metal', 50], ['parts', 20], ['wire', 10], ['fuel', 5]), requiredBlueprintId: 'bp_generator', hp: 200, effects: { power: 5, modifiers: { craftSpeed: { mult: 1.2 } } } },
      { cost: C(['adv_parts', 10], ['electronics', 10], ['battery', 5]), hp: 300, effects: { power: 12, modifiers: { craftSpeed: { mult: 1.4 }, shelterDefense: { add: 5 } } } },
    ],
  },
  {
    id: 'radar', name: '雷達', icon: '📡', category: 'utility', requiresShelterLevel: 4, maxLevel: 1,
    desc: '提早偵測怪物襲擊（警告時間 +60 秒），並更容易找到圖紙。',
    levels: [
      { cost: C(['electronics', 20], ['circuit', 3], ['adv_metal', 10], ['radio_module', 1]), requiredBlueprintId: 'bp_radar', hp: 200, effects: { raidWarningSec: 60, modifiers: { blueprintChance: { mult: 1.15 } } } },
    ],
  },
];
