/* 星辰大陸 Online — 共用遊戲資料（伺服器與客戶端共用） */
(function (exports) {
  "use strict";

  /* ============ 職業（6種） ============
     六大屬性：atk攻擊 / hp血量 / def防禦 / mdef魔抗 / spd速度 / con體質            */
  /* mana = 法力值屬性；藍量上限 = 法力值 × 10。noAttack = 無法使用攻擊的純輔助職業 */
  exports.MP_PER_MANA = 10;
  exports.CLS = {
    warrior:  { name: "戰士",   hp: 150, mana: 4,  atk: 12, def: 8, mdef: 4,  spd: 200, con: 10, range: 70,  multi: 3, magic: false, color: "#ef5350", desc: "高血量高防禦<br>近戰橫掃可打多隻怪" },
    mage:     { name: "法師",   hp: 90,  mana: 10, atk: 16, def: 3, mdef: 12, spd: 210, con: 5,  range: 180, multi: 1, magic: true,  color: "#7e57c2", desc: "強力範圍魔法<br>火球與隕石群傷" },
    archer:   { name: "弓箭手", hp: 110, mana: 6,  atk: 14, def: 5, mdef: 6,  spd: 230, con: 7,  range: 220, multi: 2, magic: false, color: "#66bb6a", desc: "遠距離攻擊<br>多重射擊打多隻怪" },
    assassin: { name: "刺客",   hp: 100, mana: 5,  atk: 18, def: 4, mdef: 5,  spd: 250, con: 6,  range: 60,  multi: 1, magic: false, color: "#455a64", desc: "極高單體爆發<br>速度最快的職業" },
    priest:   { name: "牧師",   hp: 120, mana: 12, atk: 8,  def: 6, mdef: 14, spd: 205, con: 9,  range: 150, multi: 1, magic: true,  color: "#ffca28", noAttack: true,
                desc: "純輔助職業<br><b>無法攻擊</b>，專職治療<br>靠治療隊友取得經驗" },
    dragoon:  { name: "龍騎士", hp: 140, mana: 6,  atk: 14, def: 7, mdef: 8,  spd: 215, con: 9,  range: 90,  multi: 2, magic: false, color: "#26a69a", desc: "攻守兼備<br>龍槍橫掃戰場" },
    summoner: { name: "召喚師", hp: 100, mana: 13, atk: 10, def: 5, mdef: 10, spd: 205, con: 7,  range: 160, multi: 1, magic: true,  color: "#ec407a", desc: "召喚夥伴替你作戰<br>召喚物會自動攻擊敵人" },
    sniper:   { name: "狙擊手", hp: 95,  mana: 7,  atk: 15, def: 4, mdef: 6,  spd: 235, con: 6,  range: 260, multi: 1, magic: false, color: "#00e5ff", rare: true,
                desc: "⭐稀有職業⭐<br><b>距離越遠傷害越高</b><br>射程隨等級持續變遠" },
  };
  /* 稀有職業出現機率（每次連線由伺服器抽一次） */
  exports.RARE_CHANCE = 0.01;
  /* 狙擊手：射程隨等級成長 */
  exports.sniperRange = lv => 260 + lv * 4;
  /* 狙擊手：距離加成，貼臉 1.0 倍 → 極限射程 2.5 倍 */
  exports.sniperDmgMul = (d, range) => 1 + Math.min(1, d / Math.max(1, range)) * 1.5;

  /* 每提升1級的屬性成長 */
  exports.GROWTH = { atk: 2, hp: 18, mana: 0.6, def: 1, mdef: 0.8, spd: 0.2, con: 0.5 };
  /* 每次升級：全六大屬性各 +1，並獲得 5 點自由屬性點 */
  exports.LEVEL_BONUS = 1;
  exports.POINTS_PER_LEVEL = 5;
  /* 每投入 1 點自由屬性點所提升的數值 */
  exports.ALLOC_VALUE = { atk: 2, hp: 20, mana: 2, def: 2, mdef: 2, spd: 3, con: 2 };
  /* 洗點費用：依已分配的點數計價（點越多才越貴，低等玩家也洗得起） */
  exports.resetCost = spent => 100 + (spent || 0) * 60;
  /* 屬性中文名與圖示 */
  exports.STAT_INFO = {
    atk:  { name: "攻擊", icon: "⚔️", desc: "決定你造成的傷害" },
    hp:   { name: "血量", icon: "❤️", desc: "生命上限，歸零即死亡" },
    mana: { name: "法力值", icon: "🔷", desc: "藍量上限 ＝ 法力值 × 10" },
    def:  { name: "防禦", icon: "🛡️", desc: "減免物理傷害" },
    mdef: { name: "魔抗", icon: "🔮", desc: "減免魔法傷害" },
    spd:  { name: "速度", icon: "💨", desc: "就是遊戲中的移動速度，也加快攻速" },
    con:  { name: "體質", icon: "💪", desc: "每點+8血量上限，並加快回血" },
  };

  /* ============ 技能（職業限定；heal=治療型） ============ */
  exports.SKILLS = {
    w1: { id:"w1", cls:"warrior",  name:"重斬",     lv:1,  mp:5,  cd:2,  mult:1.8, aoe:1,  price:0,      desc:"對單體造成180%傷害" },
    w2: { id:"w2", cls:"warrior",  name:"橫掃千軍", lv:5,  mp:12, cd:5,  mult:1.3, aoe:5,  price:300,    desc:"對周圍5隻怪造成130%傷害" },
    w3: { id:"w3", cls:"warrior",  name:"戰吼",     lv:15, mp:20, cd:12, mult:2.5, aoe:8,  price:1500,   desc:"對周圍8隻怪造成250%傷害" },
    m1: { id:"m1", cls:"mage",     name:"火球術",   lv:1,  mp:6,  cd:2,  mult:1.9, aoe:2,  price:0,      desc:"火球爆炸傷害2隻怪190%" },
    m2: { id:"m2", cls:"mage",     name:"冰霜新星", lv:5,  mp:15, cd:5,  mult:1.4, aoe:6,  price:300,    desc:"對周圍6隻怪造成140%傷害" },
    m3: { id:"m3", cls:"mage",     name:"隕石術",   lv:15, mp:30, cd:12, mult:3.0, aoe:10, price:1500,   desc:"隕石轟擊10隻怪300%傷害" },
    a1: { id:"a1", cls:"archer",   name:"穿雲箭",   lv:1,  mp:5,  cd:2,  mult:1.8, aoe:1,  price:0,      desc:"強力一箭180%傷害" },
    a2: { id:"a2", cls:"archer",   name:"多重射擊", lv:5,  mp:12, cd:5,  mult:1.2, aoe:5,  price:300,    desc:"射出5箭各120%傷害" },
    a3: { id:"a3", cls:"archer",   name:"箭雨",     lv:15, mp:25, cd:12, mult:2.2, aoe:9,  price:1500,   desc:"箭雨覆蓋9隻怪220%傷害" },
    s1: { id:"s1", cls:"assassin", name:"背刺",     lv:1,  mp:5,  cd:2,  mult:2.4, aoe:1,  price:0,      desc:"單體240%高傷害" },
    s2: { id:"s2", cls:"assassin", name:"影襲",     lv:5,  mp:12, cd:5,  mult:3.2, aoe:1,  price:300,    desc:"瞬身突襲，單體320%傷害" },
    s3: { id:"s3", cls:"assassin", name:"千刃亂舞", lv:15, mp:22, cd:12, mult:1.8, aoe:6,  price:1500,   desc:"對周圍6隻怪造成180%傷害" },
    // 牧師是純輔助職業，無法攻擊，技能全部是治療
    p1: { id:"p1", cls:"priest",   name:"治療術",   lv:1,  mp:8,  cd:3,  heal:0.22, aoe:3, price:0,      desc:"治療自己與附近隊友22%最大生命" },
    p2: { id:"p2", cls:"priest",   name:"治癒之光", lv:5,  mp:18, cd:6,  heal:0.40, aoe:5, price:300,    desc:"治療自己與附近隊友40%最大生命" },
    p3: { id:"p3", cls:"priest",   name:"神聖庇護", lv:15, mp:32, cd:12, heal:0.75, aoe:8, price:1500,   desc:"大範圍治療，回復隊伍75%最大生命" },
    d1: { id:"d1", cls:"dragoon",  name:"龍槍突刺", lv:1,  mp:5,  cd:2,  mult:1.9, aoe:2,  price:0,      desc:"貫穿2隻怪190%傷害" },
    d2: { id:"d2", cls:"dragoon",  name:"跳躍重擊", lv:5,  mp:14, cd:5,  mult:1.6, aoe:4,  price:300,    desc:"躍擊4隻怪160%傷害" },
    d3: { id:"d3", cls:"dragoon",  name:"真龍降臨", lv:15, mp:28, cd:12, mult:2.6, aoe:9,  price:1500,   desc:"龍魂爆發，9隻怪260%傷害" },
    // 召喚師：小妖永久存在（血歸零才消失），全場上限3隻
    // count = 本次最多召喚幾隻（隨技能等級成長）；lvRate = 小妖等級 ≈ 主人等級 × lvRate
    u1: { id:"u1", cls:"summoner", name:"召喚小妖", lv:1,  mp:10, cd:6,  summon:{count:1,lvRate:0.5}, price:0,    desc:"召喚小妖永久跟隨（血歸零才消失）。技能每5級多召1隻、等級更高" },
    u2: { id:"u2", cls:"summoner", name:"召喚石魔", lv:5,  mp:20, cd:10, summon:{count:2,lvRate:0.7}, price:300,  desc:"召喚更強的小妖，等級約主人的70%" },
    u3: { id:"u3", cls:"summoner", name:"遠古龍魂", lv:15, mp:35, cd:20, summon:{count:3,lvRate:0.9}, price:1500, desc:"召喚最強小妖，等級約主人的90%" },
    // 狙擊手（稀有）：傷害另外再吃距離加成
    n1: { id:"n1", cls:"sniper",   name:"精準射擊",   lv:1,  mp:6,  cd:2,  mult:2.0, aoe:1, price:0,    desc:"單體200%傷害，距離越遠越痛" },
    n2: { id:"n2", cls:"sniper",   name:"貫穿彈",     lv:5,  mp:14, cd:5,  mult:1.6, aoe:3, price:300,  desc:"子彈貫穿3隻怪各160%傷害" },
    n3: { id:"n3", cls:"sniper",   name:"死神凝視",   lv:15, mp:30, cd:14, mult:4.0, aoe:1, price:1500, desc:"致命一擊，單體400%超高傷害" },
  };

  /* ============ 裝備 ============ */
  const WEAPON_NAMES = {
    warrior:  ["鐵劍",   "騎士大劍",  "屠龍刀",    "寒冰巨劍",  "熔岩魔劍"],
    mage:     ["木杖",   "祕法之杖",  "賢者權杖",  "冰晶法杖",  "炎獄魔典"],
    archer:   ["短弓",   "精靈長弓",  "風神之弓",  "霜語獵弓",  "鳳凰神弓"],
    assassin: ["匕首",   "月影雙刃",  "毒牙刺",    "冰魄短刃",  "焚天魔爪"],
    priest:   ["聖木杖", "祈禱之杖",  "聖光權杖",  "冰聖法杖",  "熾天使杖"],
    dragoon:  ["長槍",   "龍紋騎槍",  "屠龍聖槍",  "冰龍之牙",  "炎龍霸槍"],
    summoner: ["召喚之書", "精靈法典", "魔導契約書", "冰晶魔典", "炎魔召喚書"],
    sniper:   ["獵弩",   "精準長弩",  "穿甲狙擊弩", "寒冰狙擊槍", "星辰狙擊槍"],
  };
  const WEAPON_TIERS = [
    { lv: 1,  atk: 5,   price: 100 },
    { lv: 10, atk: 20,  price: 800 },
    { lv: 30, atk: 60,  price: 5000 },
    { lv: 60, atk: 150, price: 25000 },
    { lv: 90, atk: 400, price: 100000 },
  ];
  // 各職業武器的附加屬性比例（以攻擊力為基準）
  const WEAPON_FLAVOR = {
    warrior:  { def: .18, mdef: .05, spd: .00, con: .10 },
    mage:     { def: .03, mdef: .25, spd: .00, con: .05 },
    archer:   { def: .06, mdef: .08, spd: .04, con: .06 },
    assassin: { def: .04, mdef: .06, spd: .06, con: .05 },
    priest:   { def: .08, mdef: .28, spd: .00, con: .12 },
    dragoon:  { def: .15, mdef: .12, spd: .01, con: .12 },
    summoner: { def: .04, mdef: .22, spd: .02, con: .08 },
    sniper:   { def: .03, mdef: .05, spd: .08, con: .04 },
  };
  const EQUIPS = [];
  let eid = 0;
  for (const cls of Object.keys(WEAPON_NAMES)) {
    const f = WEAPON_FLAVOR[cls];
    WEAPON_TIERS.forEach((t, i) => {
      EQUIPS.push({
        id: "w" + (eid++), name: WEAPON_NAMES[cls][i], cls, slot: "weapon", lv: t.lv, price: t.price,
        atk: t.atk, hp: 0,
        def: Math.round(t.atk * f.def), mdef: Math.round(t.atk * f.mdef),
        spd: Math.round(t.atk * f.spd), con: Math.round(t.atk * f.con),
      });
    });
  }
  [
    { name: "皮甲",       cls: "any",      lv: 1,  atk: 0,  def: 4,   mdef: 2,   spd: 2,  con: 2,  hp: 20,   price: 120 },
    { name: "鎖子甲",     cls: "warrior",  lv: 10, atk: 0,  def: 15,  mdef: 5,   spd: 0,  con: 6,  hp: 80,   price: 900 },
    { name: "法師長袍",   cls: "mage",     lv: 10, atk: 8,  def: 8,   mdef: 18,  spd: 3,  con: 3,  hp: 40,   price: 900 },
    { name: "遊俠披風",   cls: "archer",   lv: 10, atk: 5,  def: 10,  mdef: 8,   spd: 8,  con: 4,  hp: 60,   price: 900 },
    { name: "夜行衣",     cls: "assassin", lv: 10, atk: 10, def: 8,   mdef: 6,   spd: 12, con: 3,  hp: 50,   price: 900 },
    { name: "聖職祭袍",   cls: "priest",   lv: 10, atk: 5,  def: 10,  mdef: 20,  spd: 2,  con: 6,  hp: 70,   price: 900 },
    { name: "龍騎鎧",     cls: "dragoon",  lv: 10, atk: 5,  def: 14,  mdef: 10,  spd: 0,  con: 6,  hp: 70,   price: 900 },
    { name: "召喚師長袍", cls: "summoner", lv: 10, atk: 7,  def: 7,   mdef: 19,  spd: 3,  con: 5,  hp: 50,   price: 900 },
    { name: "狙擊斗篷",   cls: "sniper",   lv: 10, atk: 12, def: 6,   mdef: 6,   spd: 14, con: 3,  hp: 40,   price: 900 },
    { name: "龍鱗鎧甲",   cls: "any",      lv: 30, atk: 0,  def: 40,  mdef: 25,  spd: 0,  con: 15, hp: 250,  price: 6000 },
    { name: "寒冰霜甲",   cls: "any",      lv: 60, atk: 0,  def: 90,  mdef: 60,  spd: 5,  con: 30, hp: 700,  price: 30000 },
    { name: "熔岩神鎧",   cls: "any",      lv: 90, atk: 0,  def: 220, mdef: 150, spd: 10, con: 70, hp: 2200, price: 120000 },
  ].forEach(a => EQUIPS.push({ id: "a" + (eid++), slot: "armor", ...a }));
  exports.EQUIPS = EQUIPS;

  /* ============ 強化與技能升級（費用逐級遞增） ============ */
  exports.MAX_ENH = 20;        // 裝備最高強化 +20
  exports.MAX_SKILL_LV = 20;   // 技能最高 Lv.20
  // 裝備每強化 1 級，全部屬性 +12%（以原始數值計）
  exports.enhMul = enh => 1 + (enh || 0) * 0.12;
  // 強化費用：每一級都比上一級貴 1.55 倍
  exports.enhCost = it => Math.round(((it.price || 100) * 0.35 + 120) * Math.pow(1.55, it.enh || 0));
  // 技能每升 1 級，威力 +10%、治療 +8%
  exports.skillMul = (s, slv) => (s.mult || 0) * (1 + ((slv || 1) - 1) * 0.10);
  exports.skillHealRate = (s, slv) => (s.heal || 0) * (1 + ((slv || 1) - 1) * 0.08);
  // 技能升級費用：每一級都比上一級貴 1.6 倍
  exports.skillUpCost = (s, slv) => Math.round(((s.price || 0) * 0.3 + 200) * Math.pow(1.6, (slv || 1) - 1));

  exports.POTIONS = [
    { id: "p1", name: "小型紅藥水", heal: 60,   price: 30 },
    { id: "p2", name: "大型紅藥水", heal: 250,  price: 100 },
    { id: "p3", name: "特級紅藥水", heal: 1200, price: 500 },
    { id: "p4", name: "小型藍藥水", mana: 40,   price: 30 },
    { id: "p5", name: "大型藍藥水", mana: 150,  price: 100 },
  ];

  /* ============ 地圖（4張） ============ */
  exports.MAPS = {
    novice: {
      key: "novice", name: "新手村", w: 1600, h: 1600, safe: true, allowFaction: false,
      lvMin: 1, lvMax: 10, monsterCount: 30, bg: "#3e5a2e", deep: null,
      spawn: { x: 800, y: 900 },
      portals: [{ x: 800, y: 1500, to: "wild", tx: 2000, ty: 260, minLv: 10, label: "前往荒野（需Lv10）" }],
      desc: "安全區，禁止PvP。怪物1~10級。等級10以上才能離開。",
    },
    wild: {
      key: "wild", name: "荒野", w: 4000, h: 4000, safe: false, allowFaction: true,
      lvMin: 1, lvMax: 100, monsterCount: 180, bg: "#16321a", deep: { x: 2000, y: 200 },
      spawn: { x: 2000, y: 260 },
      portals: [
        { x: 2000, y: 150,  to: "novice", tx: 800,  ty: 1400, minLv: 0,  label: "返回新手村" },
        { x: 200,  y: 2200, to: "frost",  tx: 1500, ty: 260,  minLv: 40, label: "前往冰霜雪原（需Lv40）" },
      ],
      boss: { x: 3400, y: 3400, lv: 1000, name: "新手村Boss·滅世魔龍", win: true },
      tower: { x: 3500, y: 600 },
      npcFaction: { name: "暗影軍團", x: 700, y: 3500, hp: 8000 },
      desc: "怪物1~100級，離入口越深越強。可PvP、可建陣營。死亡即輸！",
    },
    frost: {
      key: "frost", name: "冰霜雪原", w: 3000, h: 3000, safe: false, allowFaction: true,
      lvMin: 100, lvMax: 300, monsterCount: 120, bg: "#1c2e40", deep: { x: 1500, y: 200 },
      spawn: { x: 1500, y: 260 },
      portals: [
        { x: 1500, y: 150,  to: "wild",    tx: 300,  ty: 2200, minLv: 0,  label: "返回荒野" },
        { x: 1500, y: 2850, to: "inferno", tx: 1500, ty: 260,  minLv: 80, label: "前往炎獄火山（需Lv80）" },
      ],
      boss: { x: 2600, y: 2600, lv: 300, name: "冰霜女皇", win: false },
      desc: "怪物100~300級。可PvP、可建陣營。",
    },
    inferno: {
      key: "inferno", name: "炎獄火山", w: 3000, h: 3000, safe: false, allowFaction: true,
      lvMin: 300, lvMax: 600, monsterCount: 100, bg: "#3a1a10", deep: { x: 1500, y: 200 },
      spawn: { x: 1500, y: 260 },
      portals: [{ x: 1500, y: 150, to: "frost", tx: 1500, ty: 2750, minLv: 0, label: "返回冰霜雪原" }],
      boss: { x: 2500, y: 2500, lv: 600, name: "炎獄魔王", win: false },
      desc: "怪物300~600級，最兇險的地帶。",
    },
  };

  exports.MONSTER_NAMES = ["野狼", "哥布林", "骷髏兵", "巨蜘蛛", "石像鬼", "半獸人", "暗影刺客", "炎魔", "冰霜巨人", "雪怪", "霜狼", "熔岩魔", "火焰惡魔", "地獄犬"];

  /* ============ 副本（50 個，獨立實例，可組隊共同進入） ============
     每個副本由多波怪物組成，清光一波才會出現下一波，最後一波是王。
     難度、獎勵、王等級都隨編號遞增。                                    */
  // [副本名稱, 王的名稱]
  const DUNGEON_DEFS = [
    ["哥布林洞窟", "哥布林王"], ["野狼巢穴", "銀月狼王"], ["廢棄礦坑", "礦坑巨鼠"], ["蜘蛛巢穴", "劇毒蛛后"], ["骷髏墓地", "骸骨將軍"],
    ["盜賊營地", "盜賊頭目"], ["腐爛沼澤", "沼澤泥怪"], ["幽暗蝙蝠洞", "血翼蝠王"], ["石像迴廊", "遠古石像鬼"], ["半獸人要塞", "半獸人酋長"],
    ["幽暗地城", "地城領主"], ["亡靈墓穴", "亡靈巫妖"], ["詛咒神殿", "詛咒祭司"], ["暗影迷宮", "暗影君主"], ["血色監獄", "血色典獄長"],
    ["毒霧森林", "腐毒樹妖"], ["沉沒教堂", "墮落聖徒"], ["鏽蝕鐵獄", "鋼鐵魔像"], ["白骨深淵", "骨龍"], ["惡魔祭壇", "召喚惡魔"],
    ["冰封洞窟", "冰霜巨熊"], ["霜狼領地", "霜狼領主"], ["極寒冰宮", "冰宮女妖"], ["雪怪山谷", "雪怪首領"], ["冰晶迷城", "冰晶守衛"],
    ["凍原墓場", "凍屍王"], ["寒冰要塞", "寒冰指揮官"], ["霜巨人堡", "霜巨人王"], ["永凍深淵", "深淵冰魔"], ["冰霜王座", "冰霜女皇"],
    ["熔岩洞窟", "熔岩魔"], ["火焰深淵", "深淵炎魔"], ["灰燼荒原", "灰燼行者"], ["硫磺礦坑", "硫磺惡鬼"], ["炎魔祭壇", "大炎魔"],
    ["熔火要塞", "熔火統帥"], ["焦土戰場", "焦土霸主"], ["烈焰神殿", "烈焰神官"], ["岩漿之心", "岩漿泰坦"], ["炎獄王座", "炎獄魔王"],
    ["龍之巢穴", "遠古巨龍"], ["星隕之地", "隕星巨獸"], ["虛空裂隙", "虛空吞噬者"], ["混沌迴廊", "混沌化身"], ["時空亂流", "時空扭曲者"],
    ["深淵魔域", "深淵魔神"], ["天空之城", "天空守護者"], ["諸神黃昏", "墮落神祇"], ["世界之樹", "世界樹之靈"], ["星辰盡頭", "星辰主宰"],
  ];
  const TIER_BG = ["#2f2a22", "#1b2430", "#1c3040", "#33161a", "#251a38"];
  const TIER_NAME = ["初階", "中階", "冰霜", "熾熱", "終極"];

  const DUNGEONS = {};
  DUNGEON_DEFS.forEach(([name, boss], i) => {
    const n = i + 1;
    const tier = Math.min(4, Math.floor(i / 10));
    const minLv = 5 + i * 4;                                  // 5 → 201
    const bossLv = Math.round(minLv * 4);                     // 20 → 804
    const waveCount = Math.min(8, 3 + Math.floor(i / 10));    // 3 → 7
    const waves = [];
    for (let w = 0; w < waveCount - 1; w++) {
      const lo = Math.round(minLv * (1 + w * 0.35));
      waves.push({ count: 6 + w * 2 + Math.floor(i / 12), lv: [lo, Math.round(lo * 1.6)] });
    }
    waves.push({ count: 1, lv: [bossLv], boss });
    DUNGEONS["d" + n] = {
      key: "d" + n, no: n, tier, tierName: TIER_NAME[tier], name, minLv,
      fee: Math.round(100 * Math.pow(1.12, i) / 10) * 10,
      w: 1400 + tier * 200, h: 1000 + tier * 180, bg: TIER_BG[tier],
      desc: `${TIER_NAME[tier]}副本 No.${n}。${waveCount} 波怪物，終王「${boss}」(Lv.${bossLv}) 鎮守。`,
      timeLimit: (30 + tier * 5) * 60,
      waves,
      gold: Math.round(2000 * Math.pow(1.13, i) / 10) * 10,
      exp: Math.round(1500 * Math.pow(1.14, i) / 10) * 10,
      dropLv: Math.min(90, Math.max(1, Math.round(minLv * 0.6))),
    };
  });
  exports.DUNGEONS = DUNGEONS;
  exports.DUNGEON_TIERS = TIER_NAME;
  /* Boss 回血：戰鬥中每秒回復最大血量的比例，脫離戰鬥時 ×10 快速回復 */
  exports.BOSS_REGEN_RATE = 0.0015;
  exports.OUT_OF_COMBAT_MULT = 10;
  /* 怪物速度屬性（就是牠們的移動速度，玩家基礎 200~250，所以怪比玩家慢、可以拉扯） */
  exports.monsterSpd = (lv, boss) => boss
    ? Math.round(85 + Math.min(25, lv * 0.05))
    : Math.round(55 + Math.min(40, lv * 0.25));
  /* 牧師靠治療隊友取得經驗：每治療這麼多血量得 1 點經驗 */
  exports.HEAL_EXP_DIVISOR = 20;

  /* ============ 小妖（召喚師的召喚物） ============
     永久存在（血歸零才消失）、全場上限 3 隻、有自己的職業與等級，能打怪升級。 */
  exports.PET_CAP = 3;              // 同時存在的小妖上限
  exports.PET_POWER = 0.55;         // 小妖強度＝同等級玩家的 55%
  exports.PET_EXP_SHARE = 0.5;      // 同伴小妖分到的經驗比例
  // 本次施放可召喚幾隻：技能每 5 級 +1，最多 PET_CAP
  exports.petCount = (s, slv) => Math.min(exports.PET_CAP, (s.summon.count || 1) + Math.floor(((slv || 1) - 1) / 5));
  // 小妖等級：主人等級 × 技能倍率，技能每升 1 級再 +2
  exports.petLevel = (ownerLv, s, slv) =>
    Math.max(1, Math.round(ownerLv * (s.summon.lvRate || 0.5)) + ((slv || 1) - 1) * 2);
  exports.petExpNeed = lv => lv * 50;
  /* 小妖職業隨機抽取：不可能抽到召喚師，有 RARE_CHANCE 機率抽中稀有職業 */
  exports.petClassPool = () => Object.keys(exports.CLS).filter(k => k !== "summoner" && !exports.CLS[k].rare);
  exports.petRarePool  = () => Object.keys(exports.CLS).filter(k => k !== "summoner" && exports.CLS[k].rare);

  /* ============ 天賦系統（10000 種，F ~ SSS 共八個等級） ============
     每個角色建立時自動抽取一個天賦，機率由 F 級最高遞減到 SSS 級最低。
     天賦名稱由「詞首 × 詞核 × 詞尾」組合而成，25×20×20 = 10000 種，各不重複。*/
  const T_PREFIX = ["微弱的","平凡的","堅實的","靈巧的","銳利的","沉靜的","熾熱的","冰寒的","疾風的","大地的",
                    "星辰的","深淵的","神聖的","暗影的","雷霆的","遠古的","不朽的","混沌的","秩序的","鮮血的",
                    "黃金的","水晶的","幽冥的","龍族的","虛空的"];
  const T_CORE   = ["體魄","意志","直覺","鬥志","天資","脈動","印記","共鳴","烙印","血脈",
                    "覺醒","領域","法則","契約","祝福","詛咒","幻影","迴響","氣息","心臟"];
  const T_SUFFIX = ["之力","之心","之魂","之眼","之翼","之息","之痕","之語","之歌","之誓",
                    "之影","之種","之焰","之霜","之刃","之盾","之冠","之淚","之鑰","之章"];
  exports.TALENT_COUNT = T_PREFIX.length * T_CORE.length * T_SUFFIX.length;   // = 10000

  /* 八個等級：p 為抽中機率，count 為該等級的天賦數量，mul 為效果倍率 */
  exports.TALENT_GRADES = [
    { key:"F",   name:"F級",   p:0.5000, count:5000, mul:1.0,  color:"#9e9e9e" },
    { key:"E",   name:"E級",   p:0.2500, count:2500, mul:1.6,  color:"#8d6e63" },
    { key:"C",   name:"C級",   p:0.1300, count:1300, mul:2.4,  color:"#4caf50" },
    { key:"B",   name:"B級",   p:0.0700, count:700,  mul:3.5,  color:"#2196f3" },
    { key:"A",   name:"A級",   p:0.0350, count:350,  mul:5.0,  color:"#9c27b0" },
    { key:"S",   name:"S級",   p:0.0120, count:120,  mul:7.5,  color:"#ff9800" },
    { key:"SS",  name:"SS級",  p:0.0025, count:25,   mul:11.0, color:"#f44336" },
    { key:"SSS", name:"SSS級", p:0.0005, count:5,    mul:18.0, color:"#ffd54f" },
  ];

  /* 天賦效果種類：base 是 F 級的數值，實際數值 = base × 該等級倍率 */
  exports.TALENT_EFFECTS = [
    { type:"atk",    base:3,   icon:"⚔️", label:v=>`攻擊力 +${v}%` },
    { type:"hp",     base:4,   icon:"❤️", label:v=>`血量上限 +${v}%` },
    { type:"mana",   base:4,   icon:"🔷", label:v=>`法力值 +${v}%` },
    { type:"def",    base:4,   icon:"🛡️", label:v=>`防禦力 +${v}%` },
    { type:"mdef",   base:4,   icon:"🔮", label:v=>`魔抗 +${v}%` },
    { type:"spd",    base:2,   icon:"💨", label:v=>`速度 +${v}%` },
    { type:"con",    base:4,   icon:"💪", label:v=>`體質 +${v}%` },
    { type:"exp",    base:5,   icon:"📘", label:v=>`獲得經驗 +${v}%` },
    { type:"gold",   base:5,   icon:"💰", label:v=>`獲得金幣 +${v}%` },
    { type:"crit",   base:2,   icon:"💥", label:v=>`暴擊率 +${v}%（暴擊造成 1.8 倍傷害）` },
    { type:"dmgRed", base:1.5, icon:"🪖", label:v=>`受到的傷害 -${v}%` },
    { type:"regen",  base:0.3, icon:"💚", label:v=>`每秒回復 ${v}% 最大血量` },
    { type:"cdr",    base:2,   icon:"⏱️", label:v=>`技能冷卻 -${v}%` },
    { type:"mpCost", base:3,   icon:"🌀", label:v=>`技能耗魔 -${v}%` },
    { type:"pet",    base:5,   icon:"👾", label:v=>`小妖強度 +${v}%（召喚師專屬）` },
    { type:"drop",   base:5,   icon:"🎁", label:v=>`副本獎勵 +${v}%` },
  ];
  /* 效果上限，避免高等級天賦造成無敵 */
  const T_CAP = { dmgRed:60, cdr:50, mpCost:70, crit:60 };

  /* 由天賦編號取得完整資料（純函式，伺服器與客戶端算出來完全一致） */
  exports.talentOf = function (id) {
    id = Math.max(0, Math.min(exports.TALENT_COUNT - 1, id | 0));
    // 等級：依 count 切成連續區段，編號越大等級越高
    let gi = 0, acc = 0;
    for (let i = 0; i < exports.TALENT_GRADES.length; i++) {
      acc += exports.TALENT_GRADES[i].count;
      if (id < acc) { gi = i; break; }
      gi = i;
    }
    const g = exports.TALENT_GRADES[gi];
    const name = T_PREFIX[Math.floor(id / 400)] + T_CORE[Math.floor((id % 400) / 20)] + T_SUFFIX[id % 20];
    // 效果種類：低階天賦什麼都可能，高階只會出現泛用強效（不會浪費在職業限定效果上）
    const all = exports.TALENT_EFFECTS.map(x => x.type);
    const pool = gi >= 6 ? ["atk", "hp", "crit", "dmgRed", "spd", "def", "exp", "gold"]   // SS / SSS
               : gi >= 4 ? all.filter(t => t !== "pet")                                   // A / S
               : all;                                                                     // F ~ B
    const h = ((id * 2654435761) >>> 0) % pool.length;
    const e = exports.TALENT_EFFECTS.find(x => x.type === pool[h]);
    let value = e.base * g.mul;
    value = Math.round(value * 10) / 10;
    if (T_CAP[e.type] !== undefined) value = Math.min(value, T_CAP[e.type]);
    return {
      id, name, grade: g.key, gradeName: g.name, gradeIdx: gi, color: g.color,
      effect: { type: e.type, value }, icon: e.icon, desc: e.label(value),
    };
  };
  /* 抽天賦：先依機率決定等級，再從該等級的天賦裡隨機取一個 */
  exports.rollTalentId = function (rnd) {
    rnd = rnd || Math.random;
    const r = rnd();
    let acc = 0, gi = 0, start = 0;
    for (let i = 0; i < exports.TALENT_GRADES.length; i++) {
      acc += exports.TALENT_GRADES[i].p;
      if (r < acc) { gi = i; break; }
      gi = i;
    }
    for (let i = 0; i < gi; i++) start += exports.TALENT_GRADES[i].count;
    return start + Math.floor(rnd() * exports.TALENT_GRADES[gi].count);
  };

  /* ============ 常數 ============ */
  exports.CONST = {
    TIME_SCALE: 12,          // 1真實秒 = 12遊戲秒
    MON_RESPAWN: 10 * 60,    // 怪物刷新 10 遊戲分
    BOSS_RESPAWN: 15 * 60,   // Boss 刷新 15 遊戲分
    SIEGE_INTERVAL: 60 * 60, // 陣營攻城間隔 1 遊戲小時
    TOWER_FEE: 100,          // 試煉塔入場費
    TOWER_MAX_LV: 1000,      // 塔內怪物最高等級
    MAX_ONLINE: 1000000,     // 在線人數上限
    FACTION_CLEAR_R: 350,    // 建陣營需清空怪物的半徑
    SPEED: 220,              // 玩家移動速度
  };
})(typeof module !== "undefined" ? module.exports : (window.DATA = {}));
