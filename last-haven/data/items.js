/**
 * 物品資料表（規格四、八、九）。圖紙物品與寶箱物品由 data/index.js 從 blueprints / chests 自動產生。
 * effects 只放 InstantEffect。equip.stats 為 common 品質的數值，實例品質再乘 balance.quality.mult。
 */
const M = (id, name, icon, weight, desc, extra = {}) => ({ id, name, icon, type: 'material', weight, stackMax: 99, quality: 'common', value: 1, desc, ...extra });
const FOOD = (id, name, icon, weight, hunger, desc, extra = {}) => ({ id, name, icon, type: 'food', weight, stackMax: 20, quality: 'common', value: 2, desc, effects: [{ type: 'hunger', value: -hunger }, ...(extra.effects || [])], ...omit(extra, 'effects') });
const WATER = (id, name, icon, weight, thirst, desc, extra = {}) => ({ id, name, icon, type: 'water', weight, stackMax: 20, quality: 'common', value: 2, desc, effects: [{ type: 'thirst', value: -thirst }, ...(extra.effects || [])], ...omit(extra, 'effects') });
const MED = (id, name, icon, weight, effects, desc, extra = {}) => ({ id, name, icon, type: 'medicine', weight, stackMax: 10, quality: 'common', value: 5, desc, effects, ...extra });
const WEAPON = (id, name, icon, weight, quality, stats, desc, extra = {}) => ({ id, name, icon, type: 'weapon', weight, stackMax: 1, quality, value: 10, desc, equip: { slot: 'weapon', stats, ...(extra.equip || {}) }, ...omit(extra, 'equip') });
const ARMOR = (id, name, icon, slot, weight, quality, stats, desc, extra = {}) => ({ id, name, icon, type: 'armor', weight, stackMax: 1, quality, value: 10, desc, equip: { slot, stats, ...(extra.equip || {}) }, ...omit(extra, 'equip') });
const AMMO = (id, name, icon, desc) => ({ id, name, icon, type: 'ammo', weight: 0.02, stackMax: 200, quality: 'common', value: 1, desc });
function omit(o, k) { const c = { ...o }; delete c[k]; return c; }

export const ITEMS = [
  // ---------- 材料 ----------
  M('wood', '木材', '🪵', 1.0, '最基本的建材，森林隨處可得。'),
  M('stone', '石頭', '🪨', 1.5, '堅硬的石材，用於加固避難所。'),
  M('metal', '金屬', '🔩', 1.2, '廢鐵與金屬碎片，武器與設施的基礎。'),
  M('cloth', '布料', '🧵', 0.3, '撕下的布條，可做繃帶與防具。'),
  M('leather', '皮革', '🟫', 0.6, '動物或怪物的皮，製作防具。'),
  M('rope', '繩索', '🪢', 0.4, '結實的繩子。'),
  M('herb', '草藥', '🌿', 0.1, '有藥用價值的野草。'),
  M('parts', '零件', '⚙️', 0.5, '拆解機械得到的通用零件。'),
  M('adv_parts', '高級零件', '🔧', 0.6, '精密機械零件，高階製作必需。'),
  M('electronics', '電子零件', '🔌', 0.3, '電路、晶片與線材。'),
  M('circuit', '電路板', '🟩', 0.3, '完整的電路板，高科技設備核心。'),
  M('battery', '電池', '🔋', 0.4, '仍有電力的電池。'),
  M('wire', '電線', '〰️', 0.2, '銅線。'),
  M('fuel', '燃料', '⛽', 1.0, '汽油或柴油，發電機用。'),
  M('plastic', '塑膠', '♻️', 0.3, '塑膠廢料。'),
  M('glass', '玻璃', '🔷', 0.5, '玻璃碎片。'),
  M('concrete', '混凝土', '🧱', 2.0, '重型建材，堡壘級升級必需。'),
  M('adv_metal', '高級金屬', '⬜', 1.2, '合金與強化鋼材。'),
  M('gunpowder', '火藥', '🎇', 0.2, '製作彈藥的原料。'),
  M('chemical', '化學藥劑', '🧪', 0.3, '各種化學品，製藥用。'),
  M('spring', '彈簧', '🌀', 0.2, '機械彈簧。'),
  M('monster_hide', '怪物皮', '🐾', 0.7, '突變生物的厚皮，比皮革更堅韌。'),
  M('monster_fang', '怪物牙', '🦷', 0.2, '鋒利的牙齒，可做武器。'),
  M('mutant_core', '突變核心', '🔮', 0.5, '從強大突變獸體內取出的能量核心，終局科技材料。', { quality: 'epic', value: 50, rare: true }),
  M('radio_module', '無線模組', '📡', 0.5, '完整的通訊模組。', { quality: 'rare', value: 20, rare: true }),
  M('med_supplies', '醫療耗材', '🩹', 0.2, '針筒、酒精與紗布。'),
  M('nails', '釘子', '📌', 0.1, '製作的釘子，建造用。'),
  M('plank', '木板', '🟫', 0.8, '加工過的木板。'),
  M('metal_plate', '金屬板', '⬛', 1.5, '鍛造的金屬板。'),
  M('seed', '種子', '🌱', 0.05, '可在農場種植。', { stackMax: 50 }),
  M('scrap_gun', '槍械零件', '🔫', 0.5, '廢棄槍械的零件。', { quality: 'fine' }),

  // ---------- 食物 ----------
  FOOD('berries', '漿果', '🫐', 0.2, 12, '森林裡的野莓，聊勝於無。'),
  FOOD('mushroom', '蘑菇', '🍄', 0.2, 10, '不確定能不能吃…', { effects: [{ type: 'status', id: 'sick', duration: 40, chance: 0.15 }] }),
  FOOD('raw_meat', '生肉', '🥩', 0.6, 15, '生的肉，最好煮過再吃。', { effects: [{ type: 'status', id: 'sick', duration: 60, chance: 0.35 }] }),
  FOOD('cooked_meat', '熟肉', '🍖', 0.5, 40, '烤過的肉，營養又安全。'),
  FOOD('fish', '魚', '🐟', 0.5, 20, '新鮮的魚。'),
  FOOD('canned_food', '罐頭', '🥫', 0.5, 35, '末日前的罐頭，保存良好。'),
  FOOD('chips', '洋芋片', '🍟', 0.2, 15, '鹹鹹的零食，吃了會口渴。', { effects: [{ type: 'thirst', value: 5 }] }),
  FOOD('instant_noodles', '泡麵', '🍜', 0.3, 30, '需要熱水…直接乾吃也行。', { effects: [{ type: 'thirst', value: 5 }] }),
  FOOD('bread', '麵包', '🍞', 0.3, 30, '有點硬的麵包。'),
  FOOD('jerky', '肉乾', '🥓', 0.2, 25, '耐放的肉乾，探索必備。'),
  FOOD('energy_bar', '能量棒', '🍫', 0.1, 20, '高熱量，順便回一點血。', { effects: [{ type: 'heal', value: 5 }] }),
  FOOD('mre', '軍用口糧', '🎖️', 0.6, 60, '軍方的完整一餐。', { quality: 'fine', value: 8, effects: [{ type: 'status', id: 'well_fed', duration: 180 }] }),
  FOOD('stew', '燉菜', '🍲', 0.7, 50, '用罐頭與野菜煮成的熱食。', { effects: [{ type: 'heal', value: 10 }, { type: 'status', id: 'well_fed', duration: 180 }] }),
  FOOD('vegetables', '蔬菜', '🥬', 0.3, 18, '農場種出來的新鮮蔬菜。'),

  // ---------- 飲水 ----------
  WATER('dirty_water', '髒水', '🥤', 1.0, 20, '未過濾的水，可能讓你生病。', { value: 1, effects: [{ type: 'status', id: 'sick', duration: 60, chance: 0.35 }] }),
  WATER('rainwater', '雨水', '🌧️', 1.0, 25, '收集的雨水，還算乾淨。', { effects: [{ type: 'status', id: 'sick', duration: 40, chance: 0.12 }] }),
  WATER('water_bottle', '瓶裝水', '💧', 1.0, 35, '密封的瓶裝水。'),
  WATER('purified_water', '淨水', '🚰', 1.0, 45, '淨化過的乾淨水。', { quality: 'fine', value: 4 }),
  WATER('soda', '汽水', '🥫', 0.6, 25, '甜甜的汽水，稍微止飢。', { effects: [{ type: 'hunger', value: -5 }] }),
  WATER('juice', '果汁', '🧃', 0.5, 30, '果汁，順便補充熱量。', { effects: [{ type: 'hunger', value: -5 }] }),
  WATER('coffee', '咖啡', '☕', 0.3, 15, '提神！', { effects: [{ type: 'status', id: 'energized', duration: 120 }] }),

  // ---------- 藥品 ----------
  MED('bandage', '繃帶', '🩹', 0.1, [{ type: 'heal', value: 20 }, { type: 'cureStatus', id: 'bleeding' }], '止血並回復 20 生命。'),
  MED('herbal_salve', '草藥膏', '🧴', 0.2, [{ type: 'heal', value: 15 }], '草藥製成的藥膏，回復 15 生命。'),
  MED('painkillers', '止痛藥', '💊', 0.1, [{ type: 'heal', value: 30 }], '回復 30 生命。'),
  MED('first_aid_kit', '急救包', '🧰', 0.5, [{ type: 'heal', value: 60 }, { type: 'cureStatus', id: 'bleeding' }], '回復 60 生命並止血。', { quality: 'fine', value: 15 }),
  MED('antibiotics', '抗生素', '💊', 0.1, [{ type: 'cureStatus', id: 'infection' }, { type: 'cureStatus', id: 'sick' }, { type: 'heal', value: 10 }], '治療感染與腹瀉。', { quality: 'fine', value: 12 }),
  MED('antidote', '解毒劑', '🧪', 0.1, [{ type: 'cureStatus', id: 'poison' }, { type: 'heal', value: 10 }], '解除中毒。'),
  MED('anti_rad', '抗輻射藥', '☢️', 0.1, [{ type: 'cureStatus', id: 'radiation' }], '清除體內輻射。', { quality: 'fine', value: 15 }),
  MED('stimpack', '興奮劑', '💉', 0.1, [{ type: 'heal', value: 40 }, { type: 'status', id: 'stimmed', duration: 60 }], '回復 40 生命並進入興奮狀態。', { quality: 'rare', value: 25 }),
  MED('med_kit_adv', '高級醫療箱', '⛑️', 0.8, [{ type: 'heal', value: 150 }, { type: 'cureStatus', id: 'bleeding' }, { type: 'cureStatus', id: 'poison' }, { type: 'cureStatus', id: 'infection' }], '幾乎能治好一切。', { quality: 'epic', value: 60 }),
  MED('regen_serum', '再生血清', '💚', 0.1, [{ type: 'status', id: 'regen', duration: 30 }], '30 秒內每秒回復 1 生命。', { quality: 'rare', value: 20 }),

  // ---------- 武器 ----------
  WEAPON('wooden_club', '木棍', '🏏', 2.0, 'common', { attack: 4, attackSpeed: 1.0 }, '一根結實的木棍。'),
  WEAPON('kitchen_knife', '菜刀', '🔪', 0.8, 'common', { attack: 5, attackSpeed: 1.3, critChance: 0.05 }, '廚房裡最鋒利的東西。'),
  WEAPON('wooden_spear', '木矛', '🗡️', 2.5, 'common', { attack: 7, attackSpeed: 0.9 }, '削尖的長棍。'),
  WEAPON('crowbar', '撬棍', '🪛', 2.5, 'common', { attack: 8, attackSpeed: 0.9 }, '既能撬門也能敲頭。'),
  WEAPON('machete', '砍刀', '🔪', 1.8, 'fine', { attack: 9, attackSpeed: 1.1, critChance: 0.05 }, '寬刃砍刀。'),
  WEAPON('iron_sword', '鐵劍', '⚔️', 3.0, 'fine', { attack: 12, attackSpeed: 1.0, critChance: 0.08 }, '工作台鍛造的鐵劍。'),
  WEAPON('bone_dagger', '獠牙匕首', '🦷', 0.8, 'fine', { attack: 8, attackSpeed: 1.6, critChance: 0.15 }, '用怪物牙做的匕首，出手極快。'),
  WEAPON('pistol', '手槍', '🔫', 1.2, 'fine', { attack: 14, attackSpeed: 1.2, critChance: 0.1 }, '9mm 手槍，需要手槍彈。', { equip: { ammo: 'pistol_ammo' } }),
  WEAPON('steel_sword', '鋼劍', '🗡️', 3.2, 'rare', { attack: 17, attackSpeed: 1.1, critChance: 0.1 }, '鋼製長劍。'),
  WEAPON('chainsaw', '鏈鋸', '🪚', 5.0, 'rare', { attack: 18, attackSpeed: 1.4, critChance: 0.05 }, '需要燃料才能發動的恐怖武器。', { equip: { ammo: 'fuel' } }),
  WEAPON('shotgun', '霰彈槍', '🔫', 3.5, 'rare', { attack: 26, attackSpeed: 0.6, critChance: 0.05 }, '近距離毀滅性武器。', { equip: { ammo: 'shotgun_shells' } }),
  WEAPON('assault_rifle', '突擊步槍', '🔫', 3.8, 'rare', { attack: 20, attackSpeed: 1.6, critChance: 0.1 }, '全自動步槍。', { equip: { ammo: 'rifle_ammo' } }),
  WEAPON('war_hammer', '戰鎚', '🔨', 6.0, 'rare', { attack: 26, attackSpeed: 0.7, critChance: 0.1, armorPen: 0.3 }, '沉重的戰鎚，能穿透護甲。'),
  WEAPON('sniper_rifle', '狙擊槍', '🎯', 4.5, 'epic', { attack: 42, attackSpeed: 0.5, critChance: 0.3, critDamage: 0.5 }, '一擊必殺。', { equip: { ammo: 'rifle_ammo' } }),
  WEAPON('plasma_rifle', '電漿步槍', '⚡', 4.0, 'legendary', { attack: 48, attackSpeed: 1.5, critChance: 0.15 }, '研究所的終極武器。', { equip: { ammo: 'energy_cell' } }),

  // ---------- 彈藥 ----------
  AMMO('pistol_ammo', '手槍彈', '•', '9mm 子彈。'),
  AMMO('rifle_ammo', '步槍彈', '••', '5.56mm 子彈。'),
  AMMO('shotgun_shells', '霰彈', '🟥', '12 號霰彈。'),
  AMMO('energy_cell', '能量電池', '🔆', '電漿武器的能源。'),

  // ---------- 防具：頭 ----------
  ARMOR('cap', '棒球帽', '🧢', 'head', 0.3, 'common', { defense: 1 }, '至少能遮太陽。'),
  ARMOR('helmet', '頭盔', '⛑️', 'head', 1.2, 'common', { defense: 3, maxHp: 10 }, '工地安全帽。'),
  ARMOR('combat_helmet', '戰術頭盔', '🪖', 'head', 1.5, 'fine', { defense: 6, maxHp: 20 }, '軍用頭盔。'),
  ARMOR('riot_helmet', '防暴頭盔', '🪖', 'head', 2.0, 'rare', { defense: 9, maxHp: 30 }, '附面罩的防暴頭盔。'),
  ARMOR('gas_mask', '防毒面具', '😷', 'head', 0.8, 'rare', { defense: 4, maxHp: 10 }, '抵抗毒氣與輻射。', { equip: { resist: { poison: 0.5, radiation: 0.5 } } }),
  ARMOR('power_helmet', '動力頭盔', '🤖', 'head', 3.0, 'legendary', { defense: 16, maxHp: 60 }, '動力裝甲的一部分。', { equip: { resist: { poison: 0.3, radiation: 0.3 } } }),
  // ---------- 防具：身 ----------
  ARMOR('jacket', '夾克', '🧥', 'body', 1.0, 'common', { defense: 2, maxHp: 5 }, '一件舊夾克。'),
  ARMOR('leather_armor', '皮甲', '🦺', 'body', 2.5, 'common', { defense: 4, maxHp: 10 }, '皮革拼接的護甲。'),
  ARMOR('iron_armor', '鐵製護甲', '🛡️', 'body', 5.0, 'fine', { defense: 8, maxHp: 20 }, '沉重但可靠。'),
  ARMOR('tactical_vest', '戰術背心', '🦺', 'body', 3.0, 'rare', { defense: 12, maxHp: 30 }, '防彈背心。'),
  ARMOR('hide_armor', '獸皮甲', '🐾', 'body', 3.0, 'rare', { defense: 10, maxHp: 25 }, '怪物皮製成，耐毒。', { equip: { resist: { poison: 0.3 } } }),
  ARMOR('combat_armor', '高級戰鬥護甲', '🛡️', 'body', 5.5, 'epic', { defense: 18, maxHp: 50 }, '軍用複合護甲。'),
  ARMOR('power_armor', '動力裝甲', '🤖', 'body', 9.0, 'legendary', { defense: 30, maxHp: 100, attack: 5 }, '末日科技的巔峰。'),
  // ---------- 防具：腿 ----------
  ARMOR('jeans', '牛仔褲', '👖', 'legs', 0.6, 'common', { defense: 1 }, '耐磨的牛仔褲。'),
  ARMOR('knee_pads', '護膝', '🦵', 'legs', 0.8, 'common', { defense: 3, maxHp: 5 }, '滑板用護膝。'),
  ARMOR('tactical_pants', '戰術褲', '👖', 'legs', 1.2, 'fine', { defense: 6, maxHp: 10 }, '多口袋戰術褲。'),
  ARMOR('armored_legs', '裝甲護腿', '🦿', 'legs', 3.0, 'rare', { defense: 10, maxHp: 20 }, '金屬護腿。'),
  ARMOR('power_legs', '動力護腿', '🦿', 'legs', 4.0, 'legendary', { defense: 16, maxHp: 50, moveSpeed: 0.2 }, '動力輔助的腿甲。'),
  // ---------- 特殊裝備 ----------
  ARMOR('backpack', '背包', '🎒', 'accessory', 0.5, 'common', { carry: 15 }, '負重 +15。'),
  ARMOR('big_backpack', '大背包', '🎒', 'accessory', 0.8, 'fine', { carry: 30 }, '負重 +30。'),
  ARMOR('military_pack', '軍用行囊', '🎒', 'accessory', 1.0, 'rare', { carry: 45, defense: 1 }, '負重 +45。'),
  ARMOR('lucky_charm', '幸運符', '🍀', 'accessory', 0.1, 'rare', { critChance: 0.05 }, '暴擊 +5%。'),
  ARMOR('running_shoes', '跑鞋', '👟', 'accessory', 0.5, 'fine', { moveSpeed: 0.2, dodge: 0.03 }, '移速 +20%、閃避 +3%。'),
  ARMOR('watch', '手錶', '⌚', 'accessory', 0.1, 'common', { accuracy: 0.03 }, '掌握節奏，命中 +3%。'),
  ARMOR('exo_frame', '外骨骼', '🦾', 'accessory', 3.0, 'epic', { carry: 40, attack: 6, moveSpeed: 0.2 }, '負重 +40、攻擊 +6、移速 +20%。'),
];
