/* 末日餘生：荒野避難所 — 資料驅動設定
 * 所有物品／凶獸／掉落表／寶箱／配方／地圖／植物／等級數值集中於此。
 * 新增內容（新怪、新武器、新地圖…）只需要擴充這裡的資料表，不需要修改邏輯程式。
 */
window.WSH = window.WSH || {};

WSH.Data = (function () {
  "use strict";

  const TILE = 40; // 1 世界單位 = 40px

  // ---------------- 小工具：決定性亂數（同一個 seed 永遠產生同樣的地圖佈局） ----------------
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randRange(rng, min, max) { return min + rng() * (max - min); }
  function randInt(rng, min, max) { return Math.floor(randRange(rng, min, max + 1)); }
  function pickQty(rng, qty) { return Array.isArray(qty) ? randInt(rng, qty[0], qty[1]) : qty; }

  // ---------------- 裝備品質（固定品質標籤，用於顏色與清單排序） ----------------
  const RARITY_DATA = {
    common: { id: "common", name: "普通", color: "#c8ccd6" },
    uncommon: { id: "uncommon", name: "優良", color: "#3ddc97" },
    rare: { id: "rare", name: "稀有", color: "#5aa9ff" },
    epic: { id: "epic", name: "史詩", color: "#c85dff" },
    legendary: { id: "legendary", name: "傳說", color: "#ffc84a" },
  };

  // ---------------- 物品 ----------------
  const ITEM_DATA = {
    wood: { id: "wood", name: "木材", icon: "🪵", type: "resource", stack: 99, weight: 0.5, desc: "從樹木砍伐取得的基礎建材。" },
    stone: { id: "stone", name: "石頭", icon: "🪨", type: "resource", stack: 99, weight: 0.8, desc: "敲擊岩石取得的基礎建材。" },
    fiber: { id: "fiber", name: "植物纖維", icon: "🌿", type: "resource", stack: 99, weight: 0.2, desc: "從草叢採集，可用於製藥與布料。" },
    iron_ore: { id: "iron_ore", name: "鐵礦", icon: "⛏️", type: "resource", stack: 99, weight: 1, desc: "礦脈中挖出的鐵礦石。" },
    berry: { id: "berry", name: "野莓", icon: "🫐", type: "food", stack: 99, weight: 0.1, heal: 6, desc: "酸甜的野莓，可以直接食用回復少量生命。" },
    potato: { id: "potato", name: "馬鈴薯", icon: "🥔", type: "food", stack: 99, weight: 0.2, heal: 14, desc: "農田收成的馬鈴薯，煮熟前也能直接吃。" },
    potato_seed: { id: "potato_seed", name: "馬鈴薯種子", icon: "🌱", type: "seed", plant: "potato", stack: 20, weight: 0.1, desc: "種在農田裡等待發芽。" },
    corn: { id: "corn", name: "玉米", icon: "🌽", type: "food", stack: 99, weight: 0.2, heal: 18, desc: "農田收成的玉米，飽足感十足。" },
    corn_seed: { id: "corn_seed", name: "玉米種子", icon: "🌱", type: "seed", plant: "corn", stack: 20, weight: 0.1, desc: "種在農田裡等待發芽。" },
    herb: { id: "herb", name: "藥草", icon: "🍀", type: "material", stack: 99, weight: 0.15, desc: "生長快速的藥用植物，可製作更強效的傷藥。" },
    herb_seed: { id: "herb_seed", name: "藥草種子", icon: "🌱", type: "seed", plant: "herb", stack: 20, weight: 0.1, desc: "種在農田裡，生長速度比一般作物快。" },
    moonlight_grass: { id: "moonlight_grass", name: "月光草", icon: "✨", type: "food", stack: 99, weight: 0.2, heal: 60, desc: "稀有的發光植物，直接食用能大幅回復生命。" },
    moonlight_seed: { id: "moonlight_seed", name: "月光草種子", icon: "🌱", type: "seed", plant: "moonlight_grass", stack: 20, weight: 0.1, desc: "極為稀有的種子，生長緩慢但收成珍貴。" },
    med_kit: { id: "med_kit", name: "簡易恢復藥", icon: "💊", type: "consumable", stack: 20, weight: 0.3, heal: 35, desc: "簡陋但有效的傷藥，立即回復生命。" },
    potent_salve: { id: "potent_salve", name: "強效藥膏", icon: "🧴", type: "consumable", stack: 20, weight: 0.3, heal: 60, desc: "用藥草熬製的強效傷藥，回復效果遠勝簡易恢復藥。" },
    raw_meat: { id: "raw_meat", name: "生肉", icon: "🥩", type: "material", stack: 99, weight: 0.4, desc: "凶獸身上取得的肉，可製作食物。" },
    rat_tail: { id: "rat_tail", name: "鼠尾", icon: "🐁", type: "material", stack: 99, weight: 0.1 },
    wolf_pelt: { id: "wolf_pelt", name: "狼皮", icon: "🐺", type: "material", stack: 99, weight: 0.6 },
    wolf_fang: { id: "wolf_fang", name: "狼牙", icon: "🦷", type: "material", stack: 99, weight: 0.2 },
    boar_hide: { id: "boar_hide", name: "野豬皮", icon: "🟤", type: "material", stack: 99, weight: 0.7 },
    boar_tusk: { id: "boar_tusk", name: "豬牙", icon: "🦴", type: "material", stack: 99, weight: 0.2 },
    flame_gland: { id: "flame_gland", name: "烈焰腺", icon: "🔥", type: "material", stack: 99, weight: 0.3, desc: "精英凶獸體內的異變器官，帶有灼熱能量。" },
    bear_pelt: { id: "bear_pelt", name: "熊皮", icon: "🟫", type: "material", stack: 99, weight: 1.2 },
    bear_claw: { id: "bear_claw", name: "巨熊爪", icon: "🐾", type: "material", stack: 99, weight: 0.5 },
    bear_fang: { id: "bear_fang", name: "熊王獠牙", icon: "🦷", type: "material", stack: 99, weight: 0.4 },
    venom_sac: { id: "venom_sac", name: "毒囊", icon: "🧪", type: "material", stack: 99, weight: 0.3, desc: "變異蠍體內的毒液囊，可用於製作毒藥或塗毒武器。" },
    carapace: { id: "carapace", name: "甲殼", icon: "🐚", type: "material", stack: 99, weight: 0.8, desc: "堅硬的蠍殼碎片，具備一定防護力。" },
    venom_spike: { id: "venom_spike", name: "毒針", icon: "🩸", type: "material", stack: 99, weight: 0.2 },
    feather: { id: "feather", name: "羽毛", icon: "🪶", type: "material", stack: 99, weight: 0.1, desc: "變異猛禽的羽毛，質輕而堅韌。" },
    talon: { id: "talon", name: "利爪", icon: "🦅", type: "material", stack: 99, weight: 0.3 },
    stick: { id: "stick", name: "木棍", icon: "🥢", type: "weapon", equip: "weapon", rarity: "common", stack: 1, weight: 1, atk: 4, atkSpeed: 1.3, range: 1.0, critChance: 0, desc: "最簡陋的武器，聊勝於無。" },
    stone_axe: { id: "stone_axe", name: "石斧", icon: "🪓", type: "weapon", equip: "weapon", rarity: "common", stack: 1, weight: 2, atk: 9, atkSpeed: 1.0, range: 1.1, critChance: 0.05, gatherBonus: 1.6, desc: "兼具伐木與戰鬥用途，採集效率更高。" },
    hunting_knife: { id: "hunting_knife", name: "獵刀", icon: "🔪", type: "weapon", equip: "weapon", rarity: "uncommon", stack: 1, weight: 1.5, atk: 15, atkSpeed: 1.6, range: 0.9, critChance: 0.15, critDamage: 0.4, desc: "鋒利輕便，攻擊速度與暴擊率更高的進階武器。" },
    iron_ingot: { id: "iron_ingot", name: "鐵錠", icon: "🔩", type: "material", stack: 99, weight: 0.8, desc: "熔爐冶煉出的鐵錠，是進階裝備的原料。" },
    cooked_meat: { id: "cooked_meat", name: "烤肉", icon: "🍖", type: "food", stack: 99, weight: 0.4, heal: 24, desc: "廚房烤過的肉，比生肉更能填飽肚子。" },
    iron_sword: { id: "iron_sword", name: "鐵劍", icon: "⚔️", type: "weapon", equip: "weapon", rarity: "rare", stack: 1, weight: 2.5, atk: 22, atkSpeed: 1.3, range: 1.0, critChance: 0.1, critDamage: 0.3, desc: "熔爐鐵錠打造的正規武器，全面超越獵刀。" },
    heavy_spear: { id: "heavy_spear", name: "重型長矛", icon: "🔱", type: "weapon", equip: "weapon", rarity: "epic", stack: 1, weight: 4, atk: 32, atkSpeed: 0.9, range: 1.4, critChance: 0.12, critDamage: 0.5, desc: "以巨熊爪與獠牙打造的頂級武器，範圍與傷害兼具。" },
    cloth_wrap: { id: "cloth_wrap", name: "布甲纏繞", icon: "🧣", type: "armor", equip: "armor", rarity: "common", stack: 1, weight: 1, def: 2, desc: "用纖維纏繞手臂與軀幹，聊勝於無的防護。" },
    leather_armor: { id: "leather_armor", name: "皮革護甲", icon: "🦺", type: "armor", equip: "armor", rarity: "uncommon", stack: 1, weight: 2.5, def: 5, hp: 10, desc: "獸皮鞣製而成，兼顧防禦與生命。" },
    iron_plate: { id: "iron_plate", name: "鐵甲", icon: "🛡️", type: "armor", equip: "armor", rarity: "rare", stack: 1, weight: 4, def: 10, hp: 15, desc: "鐵錠打造的板甲，大幅提升防禦力。" },
    beast_king_armor: { id: "beast_king_armor", name: "獸王重甲", icon: "🥋", type: "armor", equip: "armor", rarity: "epic", stack: 1, weight: 6, def: 18, hp: 30, desc: "以巨熊皮毛與爪骨打造的頂級護甲。" },
  };

  // ---------------- 採集資源點 ----------------
  const NODE_DATA = {
    tree: { id: "tree", name: "樹木", icon: "🌳", hp: 30, item: "wood", qtyPerHit: [1, 2], respawnSec: 35, gatherDmg: 4 },
    rock: { id: "rock", name: "岩石", icon: "🪨", hp: 40, item: "stone", qtyPerHit: [1, 2], respawnSec: 45, gatherDmg: 3 },
    bush: { id: "bush", name: "草叢", icon: "🌿", hp: 14, item: "fiber", qtyPerHit: [1, 1], respawnSec: 25, gatherDmg: 5, bonusItem: "berry", bonusChance: 0.35 },
    ore: { id: "ore", name: "鐵礦脈", icon: "⛰️", hp: 55, item: "iron_ore", qtyPerHit: [1, 1], respawnSec: 60, gatherDmg: 3 },
  };

  // ---------------- 精英詞綴 ----------------
  // 精英凶獸生成時會隨機額外獲得 0～2 個詞綴（見 entities.js 的 Enemy 建構子），詞綴越多屬性倍率越高
  const AFFIX_DATA = {
    flame: { id: "flame", name: "烈焰", icon: "🔥", onHit: "burn", desc: "攻擊附加燃燒傷害。" },
    frost: { id: "frost", name: "冰霜", icon: "❄️", onHit: "slow", desc: "攻擊會使玩家短暫減速。" },
    poison: { id: "poison", name: "劇毒", icon: "☠️", onHit: "poison", desc: "攻擊附加更強力的中毒傷害。" },
    armor: { id: "armor", name: "裝甲", icon: "🛡️", dmgReduction: 0.4, desc: "大幅減免受到的傷害。" },
    haste: { id: "haste", name: "迅捷", icon: "💨", speedMul: 1.35, desc: "移動速度大幅提升。" },
    vampiric: { id: "vampiric", name: "吸血", icon: "🩸", lifestealPct: 0.3, desc: "攻擊命中時回復自身生命。" },
  };

  // ---------------- 凶獸 ----------------
  // tier: normal / elite / boss。ai 決定戰鬥行為，見 entities.js 的 Enemy.updateAI
  const ENEMY_DATA = {
    rat: {
      id: "rat", name: "變異鼠", icon: "🐀", tier: "normal", levelRange: [1, 2],
      baseHp: 16, baseAtk: 2, baseDef: 0, speed: 1.7, aggroRange: 3.4, atkRange: 0.7, atkCooldown: 1.1, xpBase: 4, respawnSec: 30,
      ai: "skittish", desc: "數量多、攻擊弱，但受傷會驚慌逃竄。",
      loot: [
        { item: "raw_meat", chance: 0.7, qty: [1, 1] },
        { item: "rat_tail", chance: 0.5, qty: [1, 1] },
        { chest: "wood", chance: 0.03 },
      ],
    },
    wolf: {
      id: "wolf", name: "灰狼", icon: "🐺", tier: "normal", levelRange: [2, 4],
      baseHp: 30, baseAtk: 5, baseDef: 1, speed: 2.6, aggroRange: 5.5, atkRange: 0.85, atkCooldown: 1.0, xpBase: 9, respawnSec: 35,
      ai: "pack", packRange: 5, desc: "群體行動，會呼叫附近的同類一起圍攻。",
      loot: [
        { item: "wolf_pelt", chance: 0.85, qty: [1, 1] },
        { item: "wolf_fang", chance: 0.4, qty: [1, 2] },
        { item: "raw_meat", chance: 0.5, qty: [1, 1] },
        { chest: "wood", chance: 0.06 },
      ],
    },
    boar: {
      id: "boar", name: "狂暴野豬", icon: "🐗", tier: "normal", levelRange: [4, 6],
      baseHp: 50, baseAtk: 9, baseDef: 3, speed: 2.0, chargeSpeed: 4.6, aggroRange: 4.5, atkRange: 0.9, atkCooldown: 1.3, xpBase: 15, respawnSec: 40,
      ai: "charge", desc: "防禦力高，會蓄力直線衝撞玩家。",
      loot: [
        { item: "boar_hide", chance: 0.85, qty: [1, 1] },
        { item: "boar_tusk", chance: 0.45, qty: [1, 1] },
        { item: "raw_meat", chance: 0.6, qty: [1, 2] },
        { item: "leather_armor", chance: 0.03, qty: [1, 1] },
        { chest: "iron", chance: 0.05 },
      ],
    },
    scorpion: {
      id: "scorpion", name: "變異蠍", icon: "🦂", tier: "normal", levelRange: [5, 7],
      baseHp: 40, baseAtk: 7, baseDef: 2, speed: 1.4, aggroRange: 4.5, revealRange: 2.6, atkRange: 2.4, atkCooldown: 1.6, xpBase: 13, respawnSec: 35,
      ai: "burrow", affixes: ["poison"], desc: "潛伏在地下伺機突襲，會以毒針進行遠距離攻擊。",
      loot: [
        { item: "venom_sac", chance: 0.7, qty: [1, 1] },
        { item: "carapace", chance: 0.6, qty: [1, 2] },
        { item: "venom_spike", chance: 0.5, qty: [1, 2] },
        { chest: "wood", chance: 0.05 },
      ],
    },
    raptor: {
      id: "raptor", name: "變異猛禽", icon: "🦅", tier: "normal", levelRange: [6, 9],
      baseHp: 45, baseAtk: 8, baseDef: 1, speed: 2.2, diveSpeed: 5.2, aggroRange: 6, atkRange: 0.9, atkCooldown: 1.5, xpBase: 16, respawnSec: 35,
      ai: "flyer", desc: "在空中盤旋，會俯衝攻擊後迅速拉開距離，近戰不易命中。",
      loot: [
        { item: "feather", chance: 0.8, qty: [2, 3] },
        { item: "talon", chance: 0.5, qty: [1, 2] },
        { item: "raw_meat", chance: 0.4, qty: [1, 1] },
        { chest: "wood", chance: 0.05 },
      ],
    },
    elite_wolf: {
      id: "elite_wolf", name: "烈焰灰狼", icon: "🐺", tier: "elite", level: 8,
      baseHp: 130, baseAtk: 13, baseDef: 3, speed: 2.9, aggroRange: 6.5, atkRange: 0.9, atkCooldown: 0.85, xpBase: 45, respawnSec: 90,
      ai: "pack", packRange: 5, affixes: ["flame"], desc: "精英凶獸，攻擊帶有燃燒效果，會呼叫同伴支援。",
      loot: [
        { item: "wolf_pelt", chance: 1, qty: [2, 3] },
        { item: "wolf_fang", chance: 1, qty: [2, 3] },
        { item: "flame_gland", chance: 0.8, qty: [1, 1] },
        { item: "iron_plate", chance: 0.1, qty: [1, 1] },
        { chest: "iron", chance: 0.5 },
        { chest: "military", chance: 0.08 },
      ],
    },
    elite_boar: {
      id: "elite_boar", name: "裝甲野豬王", icon: "🐗", tier: "elite", level: 9,
      baseHp: 190, baseAtk: 14, baseDef: 8, speed: 2.0, chargeSpeed: 4.8, aggroRange: 5, atkRange: 0.95, atkCooldown: 1.2, xpBase: 48, respawnSec: 90,
      ai: "charge", affixes: ["armor"], desc: "精英凶獸，渾身裝甲大幅減免傷害，衝撞威力更強。",
      loot: [
        { item: "boar_hide", chance: 1, qty: [2, 3] },
        { item: "boar_tusk", chance: 1, qty: [2, 3] },
        { item: "carapace", chance: 0.4, qty: [1, 2] },
        { item: "iron_plate", chance: 0.15, qty: [1, 1] },
        { chest: "iron", chance: 0.5 },
        { chest: "military", chance: 0.08 },
      ],
    },
    boss_bear: {
      id: "boss_bear", name: "腐化巨熊", icon: "🐻", tier: "boss", level: 12,
      baseHp: 260, baseAtk: 16, baseDef: 5, speed: 1.6, aggroRange: 8, atkRange: 1.15, atkCooldown: 1.4, xpBase: 150, respawnSec: 240,
      ai: "boss_bear", enrageHpPct: 0.5, desc: "區域首領，血量低於一半時會進入狂暴階段，攻速與傷害提升。",
      loot: [
        { item: "bear_pelt", chance: 1, qty: [1, 2] },
        { item: "bear_claw", chance: 1, qty: [1, 2] },
        { item: "bear_fang", chance: 0.6, qty: [1, 1] },
        { item: "raw_meat", chance: 1, qty: [2, 3] },
        { item: "beast_king_armor", chance: 0.12, qty: [1, 1] },
        { chest: "boss", chance: 1 },
        { chest: "golden", chance: 0.1 },
      ],
    },
  };

  // ---------------- 寶箱 Loot Table ----------------
  const CHEST_DATA = {
    wood: {
      id: "wood", name: "木製寶箱", icon: "📦", color: "#c68642", quality: "普通",
      table: [
        { item: "wood", chance: 0.6, qty: [3, 6] },
        { item: "stone", chance: 0.5, qty: [2, 5] },
        { item: "fiber", chance: 0.4, qty: [1, 3] },
        { item: "potato", chance: 0.3, qty: [1, 2] },
        { item: "berry", chance: 0.3, qty: [1, 3] },
        { item: "potato_seed", chance: 0.15, qty: [1, 1] },
        { item: "corn_seed", chance: 0.12, qty: [1, 1] },
        { item: "med_kit", chance: 0.1, qty: [1, 1] },
        { item: "cloth_wrap", chance: 0.08, qty: [1, 1] },
      ],
    },
    iron: {
      id: "iron", name: "鐵製寶箱", icon: "🧰", color: "#3ddc97", quality: "優良",
      table: [
        { item: "iron_ore", chance: 0.55, qty: [2, 4] },
        { item: "wolf_fang", chance: 0.25, qty: [1, 2] },
        { item: "boar_tusk", chance: 0.25, qty: [1, 2] },
        { item: "med_kit", chance: 0.3, qty: [1, 2] },
        { item: "hunting_knife", chance: 0.05, qty: [1, 1] },
        { item: "leather_armor", chance: 0.08, qty: [1, 1] },
        { item: "potato_seed", chance: 0.2, qty: [1, 2] },
        { item: "herb_seed", chance: 0.15, qty: [1, 2] },
      ],
    },
    military: {
      id: "military", name: "軍用寶箱", icon: "🎖️", color: "#5aa9ff", quality: "稀有",
      table: [
        { item: "iron_ingot", chance: 0.6, qty: [3, 6] },
        { item: "iron_sword", chance: 0.2, qty: [1, 1] },
        { item: "iron_plate", chance: 0.25, qty: [1, 1] },
        { item: "med_kit", chance: 0.5, qty: [2, 3] },
        { item: "herb_seed", chance: 0.3, qty: [1, 2] },
        { item: "corn_seed", chance: 0.3, qty: [1, 2] },
      ],
    },
    boss: {
      id: "boss", name: "Boss 寶箱", icon: "🏆", color: "#c85dff", quality: "史詩",
      table: [
        { item: "iron_ore", chance: 0.7, qty: [3, 6] },
        { item: "bear_pelt", chance: 0.5, qty: [1, 1] },
        { item: "hunting_knife", chance: 0.35, qty: [1, 1] },
        { item: "iron_plate", chance: 0.2, qty: [1, 1] },
        { item: "med_kit", chance: 0.6, qty: [2, 3] },
        { item: "potato_seed", chance: 0.4, qty: [2, 3] },
      ],
    },
    golden: {
      id: "golden", name: "黃金寶箱", icon: "👑", color: "#ffd24a", quality: "傳說",
      table: [
        { item: "heavy_spear", chance: 0.35, qty: [1, 1] },
        { item: "beast_king_armor", chance: 0.35, qty: [1, 1] },
        { item: "iron_ingot", chance: 0.8, qty: [6, 10] },
        { item: "moonlight_seed", chance: 0.5, qty: [1, 2] },
        { item: "med_kit", chance: 1, qty: [3, 5] },
      ],
    },
  };

  // ---------------- 製造配方 ----------------
  const RECIPE_DATA = [
    { id: "craft_stick", name: "木棍", result: "stick", resultQty: 1, station: "workbench", minShelterLvl: 1, cost: [{ item: "wood", qty: 2 }] },
    { id: "craft_stone_axe", name: "石斧", result: "stone_axe", resultQty: 1, station: "workbench", minShelterLvl: 1, cost: [{ item: "wood", qty: 5 }, { item: "stone", qty: 8 }] },
    { id: "craft_hunting_knife", name: "獵刀", result: "hunting_knife", resultQty: 1, station: "workbench", minShelterLvl: 1, cost: [{ item: "wood", qty: 3 }, { item: "iron_ore", qty: 3 }, { item: "wolf_fang", qty: 2 }] },
    { id: "craft_med_kit", name: "簡易恢復藥", result: "med_kit", resultQty: 1, station: "workbench", minShelterLvl: 1, cost: [{ item: "fiber", qty: 4 }] },
    { id: "smelt_iron_ingot", name: "鐵錠", result: "iron_ingot", resultQty: 1, station: "furnace", minShelterLvl: 2, cost: [{ item: "iron_ore", qty: 2 }] },
    { id: "cook_meat", name: "烤肉", result: "cooked_meat", resultQty: 1, station: "kitchen", minShelterLvl: 2, cost: [{ item: "raw_meat", qty: 1 }, { item: "wood", qty: 1 }] },
    { id: "craft_iron_sword", name: "鐵劍", result: "iron_sword", resultQty: 1, station: "workbench", minShelterLvl: 2, cost: [{ item: "iron_ingot", qty: 4 }, { item: "wood", qty: 4 }] },
    { id: "craft_heavy_spear", name: "重型長矛", result: "heavy_spear", resultQty: 1, station: "advanced_workbench", minShelterLvl: 4, cost: [{ item: "iron_ingot", qty: 6 }, { item: "bear_claw", qty: 2 }, { item: "bear_fang", qty: 1 }, { item: "wood", qty: 5 }] },
    { id: "craft_cloth_wrap", name: "布甲纏繞", result: "cloth_wrap", resultQty: 1, station: "workbench", minShelterLvl: 1, cost: [{ item: "fiber", qty: 6 }] },
    { id: "craft_leather_armor", name: "皮革護甲", result: "leather_armor", resultQty: 1, station: "workbench", minShelterLvl: 2, cost: [{ item: "wolf_pelt", qty: 3 }, { item: "boar_hide", qty: 2 }, { item: "fiber", qty: 4 }] },
    { id: "craft_iron_plate", name: "鐵甲", result: "iron_plate", resultQty: 1, station: "workbench", minShelterLvl: 3, cost: [{ item: "iron_ingot", qty: 8 }, { item: "boar_hide", qty: 3 }] },
    { id: "craft_beast_king_armor", name: "獸王重甲", result: "beast_king_armor", resultQty: 1, station: "advanced_workbench", minShelterLvl: 4, cost: [{ item: "bear_pelt", qty: 2 }, { item: "bear_claw", qty: 2 }, { item: "iron_ingot", qty: 8 }] },
    { id: "craft_potent_salve", name: "強效藥膏", result: "potent_salve", resultQty: 1, station: "kitchen", minShelterLvl: 2, cost: [{ item: "herb", qty: 3 }, { item: "fiber", qty: 2 }] },
  ];

  // ---------------- 植物 / 種子 ----------------
  const PLANT_DATA = {
    potato: { id: "potato", name: "馬鈴薯", seedItem: "potato_seed", resultItem: "potato", growTimeSec: 100, resultQty: [2, 4], stageIcons: ["🌱", "🌿", "🥔"] },
    corn: { id: "corn", name: "玉米", seedItem: "corn_seed", resultItem: "corn", growTimeSec: 130, resultQty: [2, 3], stageIcons: ["🌱", "🌾", "🌽"] },
    herb: { id: "herb", name: "藥草", seedItem: "herb_seed", resultItem: "herb", growTimeSec: 70, resultQty: [2, 4], stageIcons: ["🌱", "☘️", "🍀"] },
    moonlight_grass: { id: "moonlight_grass", name: "月光草", seedItem: "moonlight_seed", resultItem: "moonlight_grass", growTimeSec: 220, resultQty: [1, 2], stageIcons: ["🌱", "🌙", "✨"] },
  };

  // ---------------- 避難所等級（升級消耗 cost，解鎖 unlock 清單；新增等級只需擴充這裡） ----------------
  const BUILDING_DATA = {
    1: { name: "簡陋避難所", farmPlots: 1, unlock: [{ id: "workbench", name: "基礎工作台" }, { id: "storage_box", name: "儲物箱" }, { id: "small_farm", name: "小型農田" }] },
    2: {
      name: "整備避難所", farmPlots: 1,
      cost: [{ item: "wood", qty: 30 }, { item: "stone", qty: 30 }, { item: "iron_ore", qty: 10 }],
      unlock: [{ id: "furnace", name: "熔爐（可冶煉鐵錠）" }, { id: "kitchen", name: "廚房（可烤肉）" }],
    },
    3: {
      name: "強化避難所", farmPlots: 2,
      cost: [{ item: "stone", qty: 60 }, { item: "iron_ore", qty: 40 }, { item: "fiber", qty: 20 }],
      unlock: [{ id: "mid_farm", name: "中型農田（多一塊農田）" }, { id: "water_tower", name: "水塔" }],
    },
    4: {
      name: "工業避難所", farmPlots: 2,
      cost: [{ item: "iron_ingot", qty: 15 }, { item: "wood", qty: 50 }, { item: "stone", qty: 40 }],
      unlock: [{ id: "generator", name: "發電機" }, { id: "advanced_workbench", name: "高級加工台（可製造重型長矛）" }, { id: "defense_post", name: "防禦設備" }],
    },
  };
  function maxShelterLevel() { return Math.max(...Object.keys(BUILDING_DATA).map(Number)); }

  // ---------------- 玩家升級數值（公式化，方便未來調整難度） ----------------
  const PLAYER_BASE = {
    maxHp: 100, atk: 5, def: 2, moveSpeed: 3.4, atkSpeedMul: 1, critChance: 0.05, critDamage: 1.5,
    carryCapacity: 30, gatherEff: 1, luck: 1,
  };
  const STAT_GROWTH = { maxHp: 9, atk: 1.1, def: 0.4, carryCapacity: 1.5 };
  function xpForLevel(lv) { return Math.floor(18 * Math.pow(lv, 1.4) + 12); }
  function maxLevel() { return 100; }

  // ---------------- 等級差 → 危險程度顏色 ----------------
  function levelDiffColor(playerLv, enemyLv) {
    const d = enemyLv - playerLv;
    if (d <= -5) return "#8a95a8"; // 灰：遠低於玩家
    if (d <= -2) return "#3ddc97"; // 綠：低於玩家
    if (d <= 1) return "#e9ecff"; // 白：接近玩家
    if (d <= 4) return "#ffc84a"; // 黃：稍高
    if (d <= 8) return "#ff9d2e"; // 橘：危險
    if (d <= 14) return "#ff5d73"; // 紅：極度危險
    return "#c85dff"; // 紫：幾乎無法挑戰
  }

  // ---------------- 森林地圖（固定 seed，佈局每次都一樣，方便平衡調整） ----------------
  // 地圖面積為初版的 9 倍（長寬各 3 倍：44x30 → 132x90），內容數量同步等比例放大，維持探索密度一致。
  function buildForestMap() {
    const rng = makeRng(20260821);
    const W = 132, H = 90;
    const resourceNodes = [];
    const enemySpawns = [];
    const chestSpawns = [];

    const shelterZone = { x: 3, y: H / 2, w: 5, h: 6 };
    function farEnoughFromShelter(x, y, min) {
      return Math.hypot(x - shelterZone.x, y - shelterZone.y) > min;
    }
    function scatter(count, xMin, xMax, yMin, yMax, place) {
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 20) {
        tries++;
        const x = randRange(rng, xMin, xMax), y = randRange(rng, yMin, yMax);
        if (!farEnoughFromShelter(x, y, 4)) continue;
        place(x, y);
        placed++;
      }
    }

    // 資源點：樹 144、岩石 90、草叢 72、鐵礦脈 54（原始密度 x9）
    const nodeCounts = [["tree", 144], ["rock", 90], ["bush", 72], ["ore", 54]];
    nodeCounts.forEach(([type, count]) => {
      scatter(count, 6, W - 3, 1.5, H - 1.5, (x, y) => resourceNodes.push({ type, x, y }));
    });

    // 凶獸：變異鼠 54、灰狼 54（18 群 x3）、野豬 36、變異蠍 30、變異猛禽 24
    scatter(54, W * 0.18, W * 0.6, 2, H - 2, (x, y) => enemySpawns.push({ type: "rat", x, y }));
    for (let p = 0; p < 18; p++) {
      const cx = randRange(rng, W * 0.3, W * 0.73), cy = randRange(rng, 3, H - 3);
      for (let i = 0; i < 3; i++) {
        enemySpawns.push({ type: "wolf", x: cx + randRange(rng, -2, 2), y: cy + randRange(rng, -2, 2) });
      }
    }
    scatter(36, W * 0.36, W * 0.86, 2, H - 2, (x, y) => enemySpawns.push({ type: "boar", x, y }));
    scatter(30, W * 0.25, W * 0.9, 2, H - 2, (x, y) => enemySpawns.push({ type: "scorpion", x, y }));
    scatter(24, W * 0.3, W * 0.92, 2, H - 2, (x, y) => enemySpawns.push({ type: "raptor", x, y }));

    // 精英凶獸：稀少但分布在地圖各處，維持「遇到精英」的驚喜感
    scatter(3, W * 0.55, W * 0.92, 2, H - 2, (x, y) => enemySpawns.push({ type: "elite_wolf", x, y }));
    scatter(3, W * 0.5, W * 0.92, 2, H - 2, (x, y) => enemySpawns.push({ type: "elite_boar", x, y }));

    const bossSpawn = { type: "boss_bear", x: W * 0.9, y: H / 2 };

    // 寶箱：木製 45、鐵製 18、軍用 3、黃金 1（稀有寶箱維持極低數量，強調驚喜感）
    scatter(45, W * 0.16, W * 0.82, 1.5, H - 1.5, (x, y) => chestSpawns.push({ tier: "wood", x, y }));
    scatter(18, W * 0.45, W * 0.91, 1.5, H - 1.5, (x, y) => chestSpawns.push({ tier: "iron", x, y }));
    scatter(3, W * 0.5, W * 0.92, 1.5, H - 1.5, (x, y) => chestSpawns.push({ tier: "military", x, y }));
    scatter(1, W * 0.7, W * 0.95, 1.5, H - 1.5, (x, y) => chestSpawns.push({ tier: "golden", x, y }));

    return {
      id: "forest", name: "荒野森林", width: W, height: H,
      shelterZone, playerStart: { x: shelterZone.x + 2, y: shelterZone.y },
      bossArea: { x: bossSpawn.x, y: bossSpawn.y, radius: 8 },
      resourceNodes, enemySpawns, bossSpawn, chestSpawns,
    };
  }

  const MAP_DATA = { forest: buildForestMap() };

  return {
    TILE, RARITY_DATA, AFFIX_DATA, ITEM_DATA, NODE_DATA, ENEMY_DATA, CHEST_DATA, RECIPE_DATA, PLANT_DATA, BUILDING_DATA,
    PLAYER_BASE, STAT_GROWTH, MAP_DATA,
    xpForLevel, maxLevel, levelDiffColor, maxShelterLevel,
    rng: { makeRng, randRange, randInt, pickQty },
  };
})();
