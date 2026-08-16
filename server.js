/* 星辰大陸 Online — 多人連線伺服器（Node.js + ws） */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const DATA = require("./public/data.js");
const { CLS, SKILLS, EQUIPS, POTIONS, MAPS, MONSTER_NAMES, CONST } = DATA;

const PORT = Number(process.env.PORT) || 3000;

/* ============ HTTP 靜態檔案 ============ */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css" };
const server = http.createServer((req, res) => {
  let file = req.url.split("?")[0];
  if (file === "/") file = "/index.html";
  const fp = path.join(__dirname, "public", path.normalize(file).replace(/^(\.\.[\/\\])+/, ""));
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(buf);
  });
});

/* ============ 工具 ============ */
const rand = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rand(a, b + 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============ 世界狀態 ============ */
let nextId = 1;
const players = new Map();   // id -> player
const parties = new Map();   // id -> {id, leaderId, members:[]}
const factions = new Map();  // id -> {id, name, map, hq:{x,y,hp,maxHp}, members:[], leaderId, alive, isNpc, lastSiege}
let auctions = [];           // {id, item, price, sellerId, sellerName}
let auctionId = 1;
const pendingInvites = new Map(); // targetPlayerId -> {type:'party'|'faction'|'trade', fromId, ...}
const trades = new Map();    // tradeId -> {a:{id,gold,invIdx,confirmed}, b:{...}}
let tradeId = 1;
let gameSec = 8 * 3600, gameDay = 1;
const world = {};            // mapKey -> {monsters:[]}

function monsterLevelAt(mapKey, x, y) {
  const M = MAPS[mapKey];
  if (!M.deep) return ri(M.lvMin, M.lvMax);
  const d = dist({ x, y }, M.deep);
  const maxD = Math.hypot(M.w, M.h) * 0.85;
  return clamp(Math.round(M.lvMin + (d / maxD) * (M.lvMax - M.lvMin) + rand(-5, 5)), M.lvMin, M.lvMax);
}
const MAGIC_MONSTERS = new Set(["石像鬼", "炎魔", "冰霜巨人", "熔岩魔", "火焰惡魔"]);
function makeMonster(mapKey, x, y, lv, boss) {
  const name = boss ? "" : MONSTER_NAMES[clamp(Math.floor(lv / 45), 0, MONSTER_NAMES.length - 1)];
  const maxHp = boss ? lv * 400 : lv * 22 + 30;
  return {
    id: nextId++, map: mapKey, x, y, homeX: x, homeY: y, lv, boss: !!boss,
    maxHp, hp: maxHp,
    atk: boss ? lv * 1.6 : lv * 2 + 3, alive: true, respawnAt: 0, aggroId: null, atkCd: 0, siege: false, targetFac: null,
    dmgType: boss ? "mixed" : MAGIC_MONSTERS.has(name) ? "magic" : "phys",
    def: Math.round(lv * 0.8), mdef: Math.round(lv * 0.6),
    spd: DATA.monsterSpd(lv, boss),   // 速度屬性＝實際追擊移動速度
    // Boss 會緩慢回血；一般怪只在脫離戰鬥時回復
    regen: boss ? maxHp * DATA.BOSS_REGEN_RATE : 0,
    name,
  };
}
/* 取得地圖定義（一般地圖或副本實例） */
function mapOf(key) { return MAPS[key] || (instances.has(key) ? instances.get(key).def : null) || MAPS.novice; }
function genWorld() {
  for (const key of Object.keys(MAPS)) {
    const M = MAPS[key];
    const mons = [];
    for (let i = 0; i < M.monsterCount; i++) {
      let x, y, tries = 0;
      do {
        x = rand(80, M.w - 80); y = rand(80, M.h - 80); tries++;
      } while (tries < 20 && (
        dist({ x, y }, M.spawn) < 250 ||
        (M.boss && dist({ x, y }, M.boss) < 300) ||
        (M.tower && dist({ x, y }, M.tower) < 200) ||
        M.portals.some(p => dist({ x, y }, p) < 200)
      ));
      mons.push(makeMonster(key, x, y, monsterLevelAt(key, x, y)));
    }
    if (M.boss) {
      const b = makeMonster(key, M.boss.x, M.boss.y, M.boss.lv, true);
      b.name = M.boss.name; b.win = !!M.boss.win;
      mons.push(b);
    }
    world[key] = { monsters: mons };
    if (M.npcFaction) {
      const f = { id: nextId++, name: M.npcFaction.name, map: key, isNpc: true, alive: true, members: [], leaderId: null, lastSiege: gameSec, hq: { x: M.npcFaction.x, y: M.npcFaction.y, hp: M.npcFaction.hp, maxHp: M.npcFaction.hp } };
      factions.set(f.id, f);
    }
  }
  genAuctions();
}
function genAuctions() {
  const pool = [...EQUIPS, ...POTIONS];
  const names = ["劍聖阿光", "夜刃", "冰雪女王", "龍傲天", "歐皇", "打錢仔", "星塵", "無名商人"];
  for (let i = 0; i < 12; i++) {
    const it = pool[ri(0, pool.length - 1)];
    auctions.push({ id: auctionId++, item: { ...it }, price: Math.round(it.price * rand(0.6, 1.4)), sellerId: null, sellerName: names[ri(0, names.length - 1)] });
  }
}

/* ============ 玩家六大屬性 ============
   攻擊 atk / 血量 hp / 防禦 def / 魔抗 mdef / 速度 spd / 體質 con
   來源 = 職業基礎 + 等級成長 + 裝備（含強化加成）                     */
function stats(p) {
  const c = CLS[p.cls], G = DATA.GROWTH;
  const lb = (p.lv - 1) * DATA.LEVEL_BONUS;     // 每次升級全屬性 +1
  const base = {
    atk: c.atk + p.lv * G.atk + lb, def: c.def + p.lv * G.def + lb, mdef: c.mdef + p.lv * G.mdef + lb,
    spd: c.spd + p.lv * G.spd + lb, con: c.con + p.lv * G.con + lb, hpFlat: c.hp + (p.lv - 1) * G.hp + lb,
    mana: c.mana + (p.lv - 1) * G.mana + lb,
  };
  // 自由屬性點加成
  const A = DATA.ALLOC_VALUE, al = p.alloc || {};
  const alloc = {
    atk: (al.atk || 0) * A.atk, def: (al.def || 0) * A.def, mdef: (al.mdef || 0) * A.mdef,
    spd: (al.spd || 0) * A.spd, con: (al.con || 0) * A.con, hpFlat: (al.hp || 0) * A.hp,
    mana: (al.mana || 0) * A.mana,
  };
  base.atk += alloc.atk; base.def += alloc.def; base.mdef += alloc.mdef;
  base.spd += alloc.spd; base.con += alloc.con; base.hpFlat += alloc.hpFlat; base.mana += alloc.mana;
  const gear = { atk: 0, def: 0, mdef: 0, spd: 0, con: 0, hpFlat: 0, mana: 0 };
  for (const slot of ["weapon", "armor"]) {
    const it = p.equip[slot];
    if (!it) continue;
    const m = DATA.enhMul(it.enh || 0);
    gear.atk += (it.atk || 0) * m;
    gear.def += (it.def || 0) * m;
    gear.mdef += (it.mdef || 0) * m;
    gear.con += (it.con || 0) * m;
    gear.spd += (it.spd || 0) * m;
    gear.hpFlat += (it.hp || 0) * m;
    gear.mana += (it.mana || 0) * m;
  }
  const r = n => Math.round(n);
  const s = {
    atk: r(base.atk + gear.atk), def: r(base.def + gear.def), mdef: r(base.mdef + gear.mdef),
    spd: r(base.spd + gear.spd), con: r(base.con + gear.con), mana: r(base.mana + gear.mana),
    base: { atk: r(base.atk - alloc.atk), def: r(base.def - alloc.def), mdef: r(base.mdef - alloc.mdef), spd: r(base.spd - alloc.spd), con: r(base.con - alloc.con), hp: r(base.hpFlat - alloc.hpFlat), mana: r(base.mana - alloc.mana) },
    alloc: { atk: r(alloc.atk), def: r(alloc.def), mdef: r(alloc.mdef), spd: r(alloc.spd), con: r(alloc.con), hp: r(alloc.hpFlat), mana: r(alloc.mana) },
    gear: { atk: r(gear.atk), def: r(gear.def), mdef: r(gear.mdef), spd: r(gear.spd), con: r(gear.con), hp: r(gear.hpFlat), mana: r(gear.mana) },
  };
  // 天賦加成（百分比，套在最終數值上）
  s.atk = r(s.atk * talMul(p, "atk"));
  s.def = r(s.def * talMul(p, "def"));
  s.mdef = r(s.mdef * talMul(p, "mdef"));
  s.spd = r(s.spd * talMul(p, "spd"));
  s.con = r(s.con * talMul(p, "con"));
  s.mana = r(s.mana * talMul(p, "mana"));
  s.maxHp = r((base.hpFlat + gear.hpFlat + s.con * 8) * talMul(p, "hp"));  // 體質每點 +8 血量上限
  s.maxMp = Math.max(1, r(s.mana * DATA.MP_PER_MANA));                     // 藍量 = 法力值 × 10
  s.hp = s.maxHp;
  s.talent = p.talent || null;
  return s;
}
function pAtk(p) { return stats(p).atk; }
function pDef(p) { return stats(p).def; }
function pMaxHp(p) { return stats(p).maxHp; }
function pMaxMp(p) { return stats(p).maxMp; }   // 藍量 = 法力值 × 10
/* 依傷害類型計算減免：物理看防禦、魔法看魔抗、混合各半 */
function mitigate(p, dmg, type) {
  const s = stats(p);
  const armor = type === "magic" ? s.mdef : type === "mixed" ? (s.def + s.mdef) / 2 : s.def;
  return Math.max(1, (dmg - armor) * talCut(p, "dmgRed"));   // 天賦：傷害減免
}
/* 天賦暴擊：回傳 {dmg, crit} */
function applyCrit(p, dmg) {
  const c = tal(p, "crit");
  if (c > 0 && Math.random() * 100 < c) return { dmg: dmg * 1.8, crit: true };
  return { dmg, crit: false };
}
function skillLv(p, sid) { return (p.skillLv && p.skillLv[sid]) || 1; }

/* ============ 天賦效果 ============ */
/* 取得玩家天賦對某類效果的加成值（不符合就是 0） */
function tal(p, type) {
  const t = p && p.talent;
  if (!t || !t.effect || t.effect.type !== type) return 0;
  return t.effect.value;
}
const talMul = (p, type) => 1 + tal(p, type) / 100;   // 加成型：1.xx 倍
const talCut = (p, type) => 1 - tal(p, type) / 100;   // 減免型：0.xx 倍
/* 攻擊射程：狙擊手的射程隨等級成長 */
function pRange(p) { return p.cls === "sniper" ? DATA.sniperRange(p.lv) : CLS[p.cls].range; }
/* 狙擊手：距離越遠傷害越高（貼臉1.0倍 → 極限射程2.5倍），其他職業無加成 */
function distMul(p, target) {
  if (p.cls !== "sniper") return 1;
  return DATA.sniperDmgMul(dist(p, target), pRange(p));
}

/* ============ 小妖（召喚師的召喚物） ============
   永久存在（血歸零才消失）、全場上限 3 隻、有自己的隨機職業與等級，
   會打怪升級，也會跟著主人存檔。                                      */
const pets = new Map();   // petId -> pet

/* 隨機抽職業：排除召喚師，有 RARE_CHANCE 機率抽中稀有職業 */
function rollPetClass() {
  const rares = DATA.petRarePool();
  if (rares.length && Math.random() < DATA.RARE_CHANCE) return rares[ri(0, rares.length - 1)];
  const pool = DATA.petClassPool();
  return pool[ri(0, pool.length - 1)];
}
/* 小妖屬性：用牠自己的職業與等級計算，整體強度為同級玩家的 PET_POWER 倍 */
function petStats(cls, lv) {
  const c = CLS[cls], G = DATA.GROWTH, P = DATA.PET_POWER, lb = (lv - 1) * DATA.LEVEL_BONUS;
  const con = c.con + lv * G.con + lb;
  return {
    atk: Math.max(1, Math.round((c.atk + lv * G.atk + lb) * P)),
    def: Math.round((c.def + lv * G.def + lb) * P),
    mdef: Math.round((c.mdef + lv * G.mdef + lb) * P),
    spd: Math.round(c.spd + lv * G.spd),
    con: Math.round(con * P),
    maxHp: Math.max(10, Math.round((c.hp + (lv - 1) * G.hp + con * 8) * P)),
    range: cls === "sniper" ? DATA.sniperRange(lv) : c.range,
  };
}
function makePet(owner, lv, cls) {
  cls = cls || rollPetClass();
  const st = petStats(cls, lv);
  const pb = talMul(owner, "pet");        // 天賦：小妖強度加成
  if (pb !== 1) { st.atk = Math.round(st.atk * pb); st.maxHp = Math.round(st.maxHp * pb); st.def = Math.round(st.def * pb); st.mdef = Math.round(st.mdef * pb); }
  return {
    id: nextId++, ownerId: owner.id, ownerName: owner.name, map: owner.map,
    x: owner.x + rand(-60, 60), y: owner.y + rand(-60, 60),
    cls, lv, exp: 0, rare: !!CLS[cls].rare,
    hp: st.maxHp, maxHp: st.maxHp, atk: st.atk, def: st.def, mdef: st.mdef,
    spd: st.spd, range: st.range, atkCd: 0,
  };
}
function petsOf(ownerId) { return [...pets.values()].filter(pe => pe.ownerId === ownerId); }

function summonPets(p, s) {
  const alive = petsOf(p.id);
  const free = DATA.PET_CAP - alive.length;
  if (free <= 0) {
    send(p, { t: "log", msg: `❌ 小妖已達上限 ${DATA.PET_CAP} 隻（永久存在，要等牠們陣亡才能再召喚）。`, color: "#ff8a65" });
    return false;
  }
  const slv = skillLv(p, s.id);
  const want = Math.min(free, DATA.petCount(s, slv));
  const lv = DATA.petLevel(p.lv, s, slv);
  const made = [];
  for (let i = 0; i < want; i++) {
    const pet = makePet(p, lv);
    pets.set(pet.id, pet);
    made.push(pet);
    if (pet.rare) {
      broadcast({ t: "chat", from: "系統", text: `🎉 ${p.name} 召喚出了稀有職業小妖【${CLS[pet.cls].name}】(Lv.${pet.lv})！`, sys: true });
    }
  }
  send(p, {
    t: "log",
    msg: `🔮 召喚了 ${made.length} 隻小妖：${made.map(x => `${CLS[x.cls].name}Lv.${x.lv}${x.rare ? "⭐稀有" : ""}`).join("、")}
（永久存在，共 ${alive.length + made.length}/${DATA.PET_CAP} 隻）`.replace(/\n/g, ""),
    color: "#ec407a",
  });
  return true;
}
function despawnPets(ownerId) {
  for (const [id, pe] of pets) if (pe.ownerId === ownerId) pets.delete(id);
}
/* 小妖獲得經驗並升級 */
function petGainExp(pet, n) {
  if (n <= 0) return;
  pet.exp += n;
  let leveled = false;
  while (pet.exp >= DATA.petExpNeed(pet.lv)) {
    pet.exp -= DATA.petExpNeed(pet.lv);
    pet.lv++;
    leveled = true;
  }
  if (leveled) {
    const st = petStats(pet.cls, pet.lv);
    const owner0 = players.get(pet.ownerId);
    const pb = talMul(owner0, "pet");
    if (pb !== 1) { st.atk = Math.round(st.atk * pb); st.maxHp = Math.round(st.maxHp * pb); st.def = Math.round(st.def * pb); st.mdef = Math.round(st.mdef * pb); }
    const ratio = pet.hp / pet.maxHp;
    Object.assign(pet, { maxHp: st.maxHp, atk: st.atk, def: st.def, mdef: st.mdef, spd: st.spd, range: st.range });
    pet.hp = Math.min(pet.maxHp, Math.round(pet.maxHp * Math.max(ratio, 0.5)));
    const owner = players.get(pet.ownerId);
    if (owner) send(owner, { t: "log", msg: `⬆️ 你的小妖【${CLS[pet.cls].name}】升到 Lv.${pet.lv}！`, color: "#ce93d8" });
  }
}
function updatePets(dt) {
  for (const [id, pet] of pets) {
    const owner = players.get(pet.ownerId);
    if (!owner || owner.dead) { pets.delete(id); continue; }
    if (pet.hp <= 0) {                       // 只有血歸零才消失
      pets.delete(id);
      send(owner, { t: "log", msg: `💀 你的小妖【${CLS[pet.cls].name}】(Lv.${pet.lv}) 陣亡了。`, color: "#ff8a65" });
      continue;
    }
    if (owner.inTower) continue;             // 主人在塔內時小妖原地待命
    if (pet.map !== owner.map) {             // 主人換地圖，小妖跟過去
      pet.map = owner.map; pet.x = owner.x + rand(-50, 50); pet.y = owner.y + rand(-50, 50);
    }
    // 血量緩慢回復
    if (pet.hp < pet.maxHp) pet.hp = Math.min(pet.maxHp, pet.hp + pet.maxHp * 0.01 * dt);

    const noAtk = !!CLS[pet.cls].noAttack;
    if (noAtk) {
      /* 牧師小妖：治療主人與其他小妖，靠治療取得經驗 */
      pet.atkCd -= dt;
      const d = dist(pet, owner);
      if (d > 110) { pet.x += (owner.x - pet.x) / d * pet.spd * dt; pet.y += (owner.y - pet.y) / d * pet.spd * dt; }
      if (pet.atkCd <= 0) {
        const targets = [owner, ...petsOf(pet.ownerId)].filter(t => t.hp < t.maxHp && dist(t, pet) < 300);
        if (targets.length) {
          pet.atkCd = 4;
          let healed = 0;
          const evts = [];
          for (const t of targets) {
            const before = t.hp;
            t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.12);
            healed += t.hp - before;
            evts.push({ e: "heal", x: t.x, y: t.y - 24, v: Math.round(t.hp - before) });
          }
          if (evts.length) queueEvents(pet.map, evts);
          petGainExp(pet, Math.floor(healed / DATA.HEAL_EXP_DIVISOR));
          if (owner) sendYou(owner);
        }
      }
      continue;
    }

    /* 一般小妖：自動追擊並攻擊附近怪物 */
    const mons = world[pet.map] ? world[pet.map].monsters : null;
    const reach = Math.max(320, pet.range + 60);
    const tg = mons ? mons.filter(m => m.alive && dist(m, pet) < reach).sort((a, b) => dist(a, pet) - dist(b, pet))[0] : null;
    if (tg) {
      const d = dist(pet, tg);
      const stopAt = Math.max(45, Math.min(pet.range, 200));
      if (d > stopAt) { pet.x += (tg.x - pet.x) / d * pet.spd * dt; pet.y += (tg.y - pet.y) / d * pet.spd * dt; }
      else {
        pet.atkCd -= dt;
        if (pet.atkCd <= 0) {
          pet.atkCd = clamp(1.1 * (220 / Math.max(60, pet.spd)), 0.5, 1.6);
          // 狙擊手小妖同樣享有距離加成
          const mul = pet.cls === "sniper" ? DATA.sniperDmgMul(d, pet.range) : 1;
          const evts = [];
          const dmg = Math.max(1, pet.atk * rand(0.85, 1.15) * mul);
          damageMonster(owner, tg, dmg, evts, pet);
          evts.push({ e: "line", x1: pet.x, y1: pet.y, x2: tg.x, y2: tg.y, c: CLS[pet.cls].color });
          queueEvents(pet.map, evts);
        }
      }
    } else {                                  // 沒有目標就跟著主人
      const d = dist(pet, owner);
      if (d > 90) { pet.x += (owner.x - pet.x) / d * pet.spd * dt; pet.y += (owner.y - pet.y) / d * pet.spd * dt; }
    }
  }
}

/* ============ 副本實例 ============ */
const instances = new Map();   // instKey -> {key, def, d, waveIdx, members, startedAt, cleared, ejectAt}
let instSeq = 1;

function enterDungeon(p, key) {
  const d = DATA.DUNGEONS[key];
  if (!d) return;
  if (p.dungeon) { send(p, { t: "log", msg: "你已經在副本中了。" }); return; }
  if (p.inTower) { send(p, { t: "log", msg: "請先離開試煉塔再進入副本。" }); return; }
  if (p.dead) return;
  if (p.lv < d.minLv) { send(p, { t: "log", msg: `❌ 需要 Lv.${d.minLv} 才能進入【${d.name}】。`, color: "#ff8a65" }); return; }
  if (p.gold < d.fee) { send(p, { t: "log", msg: `❌ 進入【${d.name}】需要 ${d.fee} 金幣，你只有 ${p.gold}。`, color: "#ff8a65" }); return; }
  p.gold -= d.fee;

  const instKey = `dg_${key}_${instSeq++}`;
  const def = {
    key: instKey, name: d.name, w: d.w, h: d.h, safe: false, allowFaction: false,
    bg: d.bg, deep: null, portals: [], spawn: { x: Math.round(d.w / 2), y: d.h - 110 },
    dungeon: true, dungeonKey: key, desc: d.desc,
  };
  const inst = { key: instKey, def, d, waveIdx: -1, members: [], startedAt: gameSec, cleared: false, ejectAt: 0 };
  instances.set(instKey, inst);
  world[instKey] = { monsters: [] };

  // 同隊且在附近的隊友一起進入
  const group = [p];
  if (p.partyId) {
    const pt = parties.get(p.partyId);
    if (pt) for (const id of pt.members) {
      const m = players.get(id);
      if (m && m.id !== p.id && m.map === p.map && !m.dead && !m.inTower && !m.dungeon && dist(m, p) < 600) group.push(m);
    }
  }
  for (const g of group) {
    g.retMap = g.map; g.retX = g.x; g.retY = g.y;
    g.dungeon = instKey;
    g.map = instKey;
    g.x = def.spawn.x + rand(-40, 40);
    g.y = def.spawn.y;
    inst.members.push(g.id);
    send(g, { t: "log", msg: `🏰 進入副本【${d.name}】！共 ${d.waves.length} 波，清光一波才會出現下一波。時限 ${Math.round(d.timeLimit / 60)} 遊戲分鐘。`, color: "#ffd54f" });
    sendYou(g);
  }
  if (group.length > 1) send(p, { t: "log", msg: `👥 ${group.length - 1} 位隊友與你一同進入副本。`, color: "#8bc34a" });
  nextWave(inst);
}

function nextWave(inst) {
  inst.waveIdx++;
  const d = inst.d;
  if (inst.waveIdx >= d.waves.length) { clearDungeon(inst); return; }
  const w = d.waves[inst.waveIdx];
  const mons = world[inst.key].monsters;
  for (let i = 0; i < w.count; i++) {
    const lv = w.lv.length > 1 ? ri(w.lv[0], w.lv[1]) : w.lv[0];
    const isBoss = !!w.boss;
    const x = isBoss ? inst.def.w / 2 : rand(120, inst.def.w - 120);
    const y = isBoss ? 200 : rand(140, inst.def.h - 300);
    const m = makeMonster(inst.key, x, y, lv, isBoss);
    if (isBoss) m.name = w.boss;
    m.respawnAt = -1;              // 副本怪不重生
    mons.push(m);
  }
  for (const id of inst.members) {
    const g = players.get(id);
    if (!g) continue;
    send(g, w.boss
      ? { t: "log", msg: `☠️ 最終王【${w.boss}】(Lv.${w.lv[0]}) 出現了！牠會緩慢回血，火力要夠猛！`, color: "#ff5252" }
      : { t: "log", msg: `⚔️ 第 ${inst.waveIdx + 1}/${d.waves.length} 波：${w.count} 隻怪物來襲！`, color: "#ffd54f" });
    sendYou(g);
  }
}

function clearDungeon(inst) {
  if (inst.cleared) return;
  inst.cleared = true;
  const d = inst.d;
  const n = Math.max(1, inst.members.length);
  const names = [];
  for (const id of inst.members) {
    const g = players.get(id);
    if (!g) continue;
    names.push(g.name);
    const bonus = talMul(g, "drop") * talMul(g, "gold");   // 天賦：副本獎勵／金幣加成
    const gold = Math.round(d.gold / Math.sqrt(n) * bonus);
    g.gold += gold;
    gainExp(g, Math.round(d.exp / Math.sqrt(n) * talMul(g, "drop")));
    const pool = EQUIPS.filter(e => e.lv <= Math.max(d.dropLv, g.lv) && (e.cls === "any" || e.cls === g.cls));
    const drop = pool.length ? pool[ri(0, pool.length - 1)] : null;
    if (drop) g.inv.push({ ...drop, enh: 0 });
    send(g, { t: "log", msg: `🏆 副本【${d.name}】通關！獲得 ${gold} 金幣${drop ? `、${drop.name}` : ""}！5 秒後自動離開。`, color: "#ffd54f" });
    sendYou(g);
  }
  if (names.length) broadcast({ t: "chat", from: "系統", text: `🏰 ${names.join("、")} 通關了副本【${d.name}】！`, sys: true });
  inst.ejectAt = gameSec + 5 * CONST.TIME_SCALE;   // 5 真實秒後傳送出去
}

function leaveDungeon(p, msg) {
  const key = p.dungeon;
  if (!key) return;
  const inst = instances.get(key);
  p.dungeon = null;
  p.map = p.retMap || "wild";
  const back = mapOf(p.map);
  p.x = clamp(p.retX ?? back.spawn.x, 20, back.w - 20);
  p.y = clamp(p.retY ?? back.spawn.y, 20, back.h - 20);
  if (inst) {
    inst.members = inst.members.filter(id => id !== p.id);
    if (inst.members.length === 0) { instances.delete(inst.key); delete world[inst.key]; }
  }
  if (msg) send(p, { t: "log", msg, color: "#ffd54f" });
  sendYou(p);
}

function dungeonInfo(p) {
  const inst = instances.get(p.dungeon);
  if (!inst) return null;
  const mons = world[inst.key] ? world[inst.key].monsters.filter(m => m.alive) : [];
  return {
    name: inst.d.name, wave: Math.max(1, inst.waveIdx + 1), waves: inst.d.waves.length,
    alive: mons.length, cleared: inst.cleared,
    minsLeft: Math.max(0, Math.ceil((inst.startedAt + inst.d.timeLimit - gameSec) / 60)),
    members: inst.members.map(id => {
      const m = players.get(id);
      return m ? { name: m.name, lv: m.lv, cls: m.cls, hp: Math.round(m.hp), maxHp: m.maxHp } : null;
    }).filter(Boolean),
  };
}

/* ============ 角色存檔 ============
   用隨機令牌(token)辨識角色，存在玩家瀏覽器的 localStorage；
   伺服器把完整角色資料寫進 characters.json，重啟也不會遺失。
   註：任何人拿到令牌就能載入該角色，這是單機/區網小遊戲的簡化設計。 */
const CHARS_FILE = path.join(__dirname, "characters.json");
let chars = {};                 // token -> 角色存檔
try {
  const raw = JSON.parse(fs.readFileSync(CHARS_FILE, "utf8"));
  if (raw && typeof raw === "object") chars = raw;
} catch { chars = {}; }

let charSaveTimer = null;
function persistChars() {
  if (charSaveTimer) return;    // 節流，避免頻繁寫檔
  charSaveTimer = setTimeout(() => {
    charSaveTimer = null;
    fs.writeFile(CHARS_FILE, JSON.stringify(chars), () => {});
  }, 2000);
}
function serializeChar(p) {
  // 副本是臨時實例，存檔時改回一般地圖
  let map = MAPS[p.map] ? p.map : (MAPS[p.retMap] ? p.retMap : "wild");
  let x = p.x, y = p.y;
  if (!MAPS[p.map]) { x = MAPS[map].spawn.x; y = MAPS[map].spawn.y; }
  return {
    token: p.token, name: p.name, cls: p.cls, lv: p.lv, exp: p.exp, gold: p.gold,
    statPoints: p.statPoints || 0, alloc: p.alloc, skills: p.skills, skillLv: p.skillLv,
    inv: p.inv, equip: p.equip, map, x: Math.round(x), y: Math.round(y),
    hp: Math.round(p.hp), mp: Math.round(p.mp), victor: !!p.victor, savedAt: Date.now(),
    talentId: p.talent ? p.talent.id : null,
    // 小妖是永久的，跟著角色一起存檔
    pets: petsOf(p.id).map(pe => ({ cls: pe.cls, lv: pe.lv, exp: pe.exp, hp: Math.round(pe.hp) })),
  };
}
function saveChar(p) {
  if (!p || !p.token || p.dead) return;
  chars[p.token] = serializeChar(p);
  persistChars();
}
function deleteChar(token) {
  if (chars[token]) { delete chars[token]; persistChars(); return true; }
  return false;
}
function charSummary(rec) {
  return {
    token: rec.token, name: rec.name, cls: rec.cls, lv: rec.lv, gold: rec.gold,
    map: MAPS[rec.map] ? MAPS[rec.map].name : "荒野", victor: !!rec.victor, savedAt: rec.savedAt,
    talent: rec.talentId != null ? DATA.talentOf(rec.talentId) : null,
  };
}

/* ============ 等級排行榜 ============ */
const RECORDS_FILE = path.join(__dirname, "records.json");
let hallOfFame = [];   // 歷史名人堂（跨連線保存）
try {
  hallOfFame = JSON.parse(fs.readFileSync(RECORDS_FILE, "utf8"));
  if (!Array.isArray(hallOfFame)) hallOfFame = [];
} catch { hallOfFame = []; }

let saveTimer = null;
function saveRecords() {
  if (saveTimer) return;                       // 節流，避免頻繁寫檔
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFile(RECORDS_FILE, JSON.stringify(hallOfFame, null, 1), () => {});
  }, 2000);
}
/* 把玩家目前成績寫入名人堂（同名只保留最佳紀錄） */
function recordPlayer(p) {
  if (!p || p.lv < 2) return;                  // 太低等級不記錄
  const entry = { name: p.name, cls: p.cls, lv: p.lv, exp: p.exp, gold: p.gold, victor: !!p.victor, at: Date.now() };
  const i = hallOfFame.findIndex(r => r.name === p.name && r.cls === p.cls);
  if (i >= 0) {
    if (hallOfFame[i].lv > entry.lv || (hallOfFame[i].lv === entry.lv && hallOfFame[i].exp >= entry.exp)) return;
    hallOfFame[i] = entry;
  } else hallOfFame.push(entry);
  hallOfFame.sort((a, b) => b.lv - a.lv || b.exp - a.exp);
  hallOfFame = hallOfFame.slice(0, 50);
  saveRecords();
}
function sendLeaderboard(p) {
  const online = [...players.values()]
    .filter(q => !q.dead)
    .sort((a, b) => b.lv - a.lv || b.exp - a.exp)
    .map((q, i) => ({
      rank: i + 1, id: q.id, name: q.name, cls: q.cls, lv: q.lv, exp: q.exp,
      gold: q.gold, map: q.map, victor: !!q.victor, me: q.id === p.id,
    }));
  send(p, {
    t: "leaderboard",
    online: online.slice(0, 20),
    myRank: online.find(o => o.me) || null,
    total: online.length,
    fame: hallOfFame.slice(0, 20).map((r, i) => ({ rank: i + 1, ...r })),
  });
}
function expNeed(p) { return p.lv * 60; }
function gainExp(p, n) {
  p.exp += Math.round(n * talMul(p, "exp"));   // 天賦：經驗加成
  while (p.exp >= expNeed(p)) {
    p.exp -= expNeed(p); p.lv++;
    p.statPoints = (p.statPoints || 0) + DATA.POINTS_PER_LEVEL;
    p.maxHp = pMaxHp(p); p.hp = p.maxHp;
    p.maxMp = pMaxMp(p); p.mp = p.maxMp;
    send(p, { t: "log", msg: `🎉 升到 Lv.${p.lv}！血魔全滿，全屬性 +${DATA.LEVEL_BONUS}，獲得 ${DATA.POINTS_PER_LEVEL} 點自由屬性點（按C分配）！`, color: "#8bc34a" });
    if (p.lv === 10) send(p, { t: "log", msg: "你已達到10級，可以離開新手村了！", color: "#ffd54f" });
    recordPlayer(p);
    // 進榜播報：擠進線上前三名時全服公告
    const rank = [...players.values()].filter(q => !q.dead && (q.lv > p.lv || (q.lv === p.lv && q.exp > p.exp))).length + 1;
    if (rank <= 3 && p.lv % 5 === 0) {
      broadcast({ t: "chat", from: "系統", text: `🏅 ${p.name}（${CLS[p.cls].name}）升到 Lv.${p.lv}，目前排行榜第 ${rank} 名！`, sys: true });
    }
    sendYou(p);
  }
}

/* ============ 傳訊 ============ */
function send(p, obj) { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(obj)); }
function broadcast(obj, mapKey) {
  const s = JSON.stringify(obj);
  for (const p of players.values()) {
    if (mapKey && p.map !== mapKey) continue;
    if (p.ws.readyState === 1) p.ws.send(s);
  }
}
function sendYou(p) {
  const s = stats(p);
  send(p, {
    t: "you", id: p.id, name: p.name, cls: p.cls, map: p.map, x: Math.round(p.x), y: Math.round(p.y), lv: p.lv, exp: p.exp, expNeed: expNeed(p),
    hp: Math.round(p.hp), maxHp: p.maxHp, mp: Math.round(p.mp), maxMp: p.maxMp, gold: p.gold,
    atk: s.atk, def: s.def, mdef: s.mdef, spd: s.spd, con: s.con, mana: s.mana, stats: s,
    noAttack: !!CLS[p.cls].noAttack,
    statPoints: p.statPoints || 0, alloc: p.alloc, range: Math.round(pRange(p)),
    skills: p.skills, skillLv: p.skillLv, inv: p.inv, equip: p.equip, cds: p.cds,
    party: partyInfo(p), faction: factionInfo(p),
    dungeon: p.dungeon ? dungeonInfo(p) : null, talent: p.talent,
    mapDef: MAPS[p.map] ? null : (instances.get(p.map) || {}).def || null,
  });
}
function partyInfo(p) {
  if (!p.partyId) return null;
  const pt = parties.get(p.partyId); if (!pt) return null;
  return { id: pt.id, leaderId: pt.leaderId, members: pt.members.map(id => { const m = players.get(id); return m ? { id: m.id, name: m.name, lv: m.lv, cls: m.cls, map: m.map } : null; }).filter(Boolean) };
}
function factionInfo(p) {
  if (!p.factionId) return null;
  const f = factions.get(p.factionId); if (!f || !f.alive) return null;
  const nextSiege = Math.max(0, Math.ceil((f.lastSiege + CONST.SIEGE_INTERVAL - gameSec) / 60));
  return { id: f.id, name: f.name, map: f.map, hq: { x: f.hq.x, y: f.hq.y, hp: Math.round(f.hq.hp), maxHp: f.hq.maxHp }, nextSiege, members: f.members.map(id => { const m = players.get(id); return m ? { id: m.id, name: m.name, lv: m.lv } : null; }).filter(Boolean) };
}

/* ============ 加入/離開 ============ */
function addPlayer(ws, name, cls, token) {
  if (players.size >= CONST.MAX_ONLINE) { ws.send(JSON.stringify({ t: "full" })); ws.close(); return null; }

  // ---- 載入既有角色 ----
  const rec = token ? chars[token] : null;
  if (token && !rec) {
    ws.send(JSON.stringify({ t: "log", msg: "⚠️ 找不到這個角色存檔，已為你建立新角色。", color: "#ff8a65" }));
  }
  if (rec && [...players.values()].some(q => q.token === token)) {
    ws.send(JSON.stringify({ t: "loadFail", msg: "這個角色已經在線上了，無法重複登入。" }));
    return null;
  }

  if (!rec) {
    if (!CLS[cls]) cls = "warrior";
    // 稀有職業必須是本次連線抽中的，否則退回戰士（防止直接指定）
    if (CLS[cls].rare && !ws.rareUnlocked) {
      ws.send(JSON.stringify({ t: "log", msg: "⚠️ 你這次連線沒有抽中稀有職業，已改為戰士。重新整理頁面可再抽一次。", color: "#ff8a65" }));
      cls = "warrior";
    }
  } else {
    cls = rec.cls;   // 載入存檔時沿用原職業（狙擊手存檔可以直接續玩）
  }

  const M = rec ? (MAPS[rec.map] || MAPS.novice) : MAPS.novice;
  const freeSkill = Object.values(SKILLS).find(s => s.cls === cls && s.price === 0);
  const p = {
    ws, id: nextId++, token: rec ? rec.token : crypto.randomUUID(),
    name: rec ? rec.name : (name || "勇者").slice(0, 12), cls,
    map: rec ? (MAPS[rec.map] ? rec.map : "novice") : "novice",
    x: rec ? rec.x : M.spawn.x + rand(-40, 40),
    y: rec ? rec.y : M.spawn.y + rand(-40, 40),
    lv: rec ? rec.lv : 1, exp: rec ? rec.exp : 0, gold: rec ? rec.gold : 200,
    statPoints: rec ? (rec.statPoints || 0) : 0,
    alloc: rec ? { atk: 0, hp: 0, mana: 0, def: 0, mdef: 0, spd: 0, con: 0, ...(rec.alloc || {}) }
               : { atk: 0, hp: 0, mana: 0, def: 0, mdef: 0, spd: 0, con: 0 },
    skills: rec ? rec.skills.slice() : [freeSkill.id],
    skillLv: rec ? { ...rec.skillLv } : { [freeSkill.id]: 1 },
    cds: {},
    inv: rec ? rec.inv.map(i => ({ ...i })) : [{ ...POTIONS[0], count: 3 }],
    equip: rec ? { weapon: rec.equip.weapon ? { ...rec.equip.weapon } : null, armor: rec.equip.armor ? { ...rec.equip.armor } : null }
               : { weapon: null, armor: null },
    partyId: null, factionId: null, dead: false, victor: rec ? !!rec.victor : false,
    inTower: false, tower: null, atkCd: 0, lastYou: 0,
    // 天賦：建立角色時自動抽取一次，之後跟著角色永久保留
    talent: DATA.talentOf(rec && rec.talentId != null ? rec.talentId : DATA.rollTalentId()),
  };
  p.maxHp = pMaxHp(p); p.maxMp = pMaxMp(p);
  p.hp = rec ? clamp(rec.hp, 1, p.maxHp) : p.maxHp;
  p.mp = rec ? clamp(rec.mp, 0, p.maxMp) : p.maxMp;
  players.set(p.id, p);
  send(p, { t: "joined", id: p.id, token: p.token });
  sendYou(p);
  if (rec) {
    send(p, { t: "log", msg: `💾 讀取存檔成功！歡迎回來，${p.name}（Lv.${p.lv} ${CLS[cls].name}）。`, color: "#8bc34a" });
    send(p, { t: "log", msg: "你的進度會每 20 秒自動存檔，離線時也會存檔。", color: "#90a4ae" });
  } else {
    send(p, { t: "log", msg: `歡迎來到星辰大陸，${p.name}！你出生在新手村。`, color: "#ffd54f" });
    send(p, { t: "log", msg: "🏆 獲勝條件：擊敗荒野深處的 1000級Boss·滅世魔龍！新手村外死亡即輸！", color: "#ffd54f" });
    send(p, { t: "log", msg: "💾 已為你建立角色存檔，進度會自動保存，下次可直接接續遊玩。", color: "#8bc34a" });
  }
  // 還原存檔裡的小妖
  if (rec && Array.isArray(rec.pets)) {
    for (const sp of rec.pets.slice(0, DATA.PET_CAP)) {
      if (!CLS[sp.cls] || sp.cls === "summoner") continue;
      const pet = makePet(p, Math.max(1, sp.lv | 0), sp.cls);
      pet.exp = sp.exp || 0;
      pet.hp = clamp(sp.hp || pet.maxHp, 1, pet.maxHp);
      pets.set(pet.id, pet);
    }
    if (rec.pets.length) {
      send(p, { t: "log", msg: `🔮 ${rec.pets.length} 隻小妖回到你身邊了。`, color: "#ec407a" });
    }
  }
  saveChar(p);
  broadcast({ t: "chat", from: "系統", text: `${p.name}（${CLS[cls].name}）${rec ? "回到" : "進入"}了遊戲！目前在線 ${players.size} 人。`, sys: true });
  // 新角色，或舊存檔第一次補抽到天賦時，都要揭曉
  const firstTalent = !rec || rec.talentId == null;
  if (firstTalent) {
    const tg = p.talent.gradeIdx;
    send(p, { t: "talentRoll", talent: p.talent });
    send(p, { t: "log", msg: `🌟 你抽到了天賦【${p.talent.name}】（${p.talent.gradeName}）：${p.talent.icon} ${p.talent.desc}`, color: p.talent.color });
    if (tg >= 5) {   // S 級以上全服公告
      broadcast({ t: "chat", from: "系統", text: `🌟🌟🌟 ${p.name} 抽到了 ${p.talent.gradeName} 天賦【${p.talent.name}】！`, sys: true });
    }
  }
  return p;
}
function removePlayer(p) {
  recordPlayer(p);          // 離線前把成績存進名人堂
  saveChar(p);              // 離線前存檔
  despawnPets(p.id);        // 清掉召喚物
  if (p.dungeon) {          // 從副本實例移除，空了就銷毀
    const inst = instances.get(p.dungeon);
    if (inst) {
      inst.members = inst.members.filter(id => id !== p.id);
      if (inst.members.length === 0) { instances.delete(inst.key); delete world[inst.key]; }
    }
    p.dungeon = null;
  }
  leaveParty(p, true);
  leaveFactionOnDisconnect(p);
  cancelTradeFor(p, "對方離線，交易取消。");
  pendingInvites.delete(p.id);
  players.delete(p.id);
  broadcast({ t: "chat", from: "系統", text: `${p.name} 離開了遊戲。`, sys: true });
}
function leaveParty(p, silent) {
  if (!p.partyId) return;
  const pt = parties.get(p.partyId);
  p.partyId = null;
  if (!pt) return;
  pt.members = pt.members.filter(id => id !== p.id);
  if (pt.members.length <= 1) {
    for (const id of pt.members) { const m = players.get(id); if (m) { m.partyId = null; send(m, { t: "log", msg: "隊伍已解散。" }); sendYou(m); } }
    parties.delete(pt.id);
  } else {
    if (pt.leaderId === p.id) pt.leaderId = pt.members[0];
    for (const id of pt.members) { const m = players.get(id); if (m) { if (!silent) send(m, { t: "log", msg: `${p.name} 離開了隊伍。` }); sendYou(m); } }
  }
}
function leaveFactionOnDisconnect(p) {
  if (!p.factionId) return;
  const f = factions.get(p.factionId);
  p.factionId = null;
  if (!f) return;
  f.members = f.members.filter(id => id !== p.id);
  if (f.leaderId === p.id && f.members.length > 0) f.leaderId = f.members[0];
  if (f.members.length === 0 && !f.isNpc) { f.alive = false; factions.delete(f.id); }
}

/* ============ 戰鬥 ============ */
function damageMonster(p, m, dmg, events, byPet) {
  m.hp -= dmg; m.aggroId = p.id;
  events.push({ e: "dmg", x: m.x, y: m.y - 20, v: Math.round(dmg) });
  events.push({ e: "line", x1: p.x, y1: p.y, x2: m.x, y2: m.y, c: CLS[p.cls].color });
  if (m.hp > 0) return;
  m.alive = false; m.aggroId = null;
  // respawnAt === -1 代表副本/攻城怪，死了就不重生
  if (m.respawnAt !== -1) m.respawnAt = gameSec + (m.boss ? CONST.BOSS_RESPAWN : CONST.MON_RESPAWN);
  const exp = m.lv * 12 + (m.boss ? m.lv * 50 : 0);
  const gold = Math.round(m.lv * rand(3, 7)) + (m.boss ? m.lv * 100 : 0);
  // 小妖也會從擊殺中取得經驗（出手的那隻拿全額，同伴分一半）
  if (p) {
    for (const pe of petsOf(p.id)) {
      if (pe.map !== m.map) continue;
      if (byPet && pe.id === byPet.id) petGainExp(pe, exp);
      else if (dist(pe, m) < 500) petGainExp(pe, Math.round(exp * DATA.PET_EXP_SHARE));
    }
  }
  // 組隊平分：隊友在同地圖且附近也拿獎勵
  const sharers = [p];
  if (p.partyId) {
    const pt = parties.get(p.partyId);
    if (pt) for (const id of pt.members) {
      const m2 = players.get(id);
      if (m2 && m2.id !== p.id && m2.map === p.map && !m2.dead && dist(m2, m) < 800) sharers.push(m2);
    }
  }
  for (const s of sharers) {
    gainExp(s, Math.round(exp / Math.sqrt(sharers.length)));
    s.gold += Math.round(gold / sharers.length * talMul(s, "gold"));   // 天賦：金幣加成
    send(s, { t: "log", msg: `擊敗 ${m.name || "怪物"}(Lv.${m.lv})！獲得經驗與金幣${sharers.length > 1 ? "（隊伍平分）" : ""}。` });
    sendYou(s);
  }
  if (m.boss && m.win) {
    const names = sharers.map(s => s.name);
    for (const s of sharers) { s.victor = true; recordPlayer(s); send(s, { t: "victory", names }); }
    broadcast({ t: "chat", from: "系統", text: `🏆 ${names.join("、")} 擊敗了新手村1000級Boss·滅世魔龍，贏得了遊戲！`, sys: true });
  } else if (m.boss) {
    broadcast({ t: "chat", from: "系統", text: `⚔️ ${p.name} 的隊伍擊敗了 ${m.name}（Lv.${m.lv}）！`, sys: true });
  }
}
function defeat(p, reason) {
  recordPlayer(p);
  p.dead = true;
  // 輸掉遊戲＝角色陣亡，存檔一併刪除（成績仍留在名人堂）
  if (p.token) { deleteChar(p.token); send(p, { t: "charGone", token: p.token }); }
  leaveParty(p, false);
  send(p, { t: "defeat", reason });
  broadcast({ t: "chat", from: "系統", text: `💀 ${p.name} ${reason}`, sys: true });
}

/* ============ 訊息處理 ============ */
function onMessage(p, msg) {
  const M = mapOf(p.map);
  switch (msg.t) {
    case "move": {
      if (p.dead || p.inTower) break;
      if (!isFinite(msg.x) || !isFinite(msg.y)) break;
      p.x = clamp(+msg.x, 20, M.w - 20);
      p.y = clamp(+msg.y, 20, M.h - 20);
      break;
    }
    case "portal": {
      if (p.dead || p.inTower) break;
      const pt = M.portals.find(q => dist(p, q) < 120);
      if (!pt) break;
      if (p.lv < pt.minLv) { send(p, { t: "log", msg: `🚧 等級未達 Lv.${pt.minLv}，無法通過！${p.map === "novice" ? "先在村裡打怪練級吧。" : ""}`, color: "#ff8a65" }); break; }
      p.map = pt.to; p.x = pt.tx; p.y = pt.ty;
      send(p, { t: "log", msg: `📍 你來到了【${MAPS[pt.to].name}】。${MAPS[pt.to].desc}`, color: "#ffd54f" });
      sendYou(p);
      break;
    }
    case "attack": {
      if (p.dead || p.inTower || p.atkCd > 0) break;
      if (CLS[p.cls].noAttack) {   // 牧師是純輔助，無法攻擊
        send(p, { t: "log", msg: "☮️ 牧師無法攻擊。請用治療技能支援隊友換取經驗（按1~3）。", color: "#ffca28" });
        p.atkCd = 1;
        break;
      }
      p.atkCd = clamp(0.35 * (220 / Math.max(60, stats(p).spd)), 0.12, 0.6); // 速度越高攻擊越快
      const c = CLS[p.cls], rng = pRange(p);
      const events = [];
      const targets = world[p.map].monsters.filter(m => m.alive && dist(m, p) <= rng + 20).sort((a, b) => dist(a, p) - dist(b, p)).slice(0, c.multi);
      for (const m of targets) {
        const hit = applyCrit(p, pAtk(p) * rand(0.9, 1.1) * distMul(p, m));   // 天賦：暴擊
        damageMonster(p, m, Math.max(1, hit.dmg), events);
        if (hit.crit) events.push({ e: "crit", x: m.x, y: m.y - 44 });
      }
      // 攻擊敵對陣營總部
      for (const f of factions.values()) {
        if (!f.alive || f.map !== p.map || f.id === p.factionId) continue;
        if (dist(p, f.hq) < rng + 50) {
          f.hq.hp -= pAtk(p) * 0.8;
          events.push({ e: "dmg", x: f.hq.x, y: f.hq.y - 40, v: Math.round(pAtk(p) * 0.8) });
          if (f.hq.hp <= 0) destroyFaction(f, p);
        }
      }
      if (events.length) queueEvents(p.map, events);
      break;
    }
    case "skill": {
      if (p.dead || p.inTower) break;
      const sid = p.skills[msg.i]; if (!sid) break;
      const s = SKILLS[sid];
      if ((p.cds[sid] || 0) > 0) break;
      const mpCost = Math.max(1, Math.round(s.mp * talCut(p, "mpCost")));   // 天賦：耗魔減免
      const cdTime = s.cd * talCut(p, "cdr");                               // 天賦：冷卻縮減
      if (p.mp < mpCost) { send(p, { t: "log", msg: "魔力不足！", color: "#64b5f6" }); break; }
      // 召喚類技能不需要目標；召喚失敗（已達上限）不扣魔不進冷卻
      if (s.summon) {
        if (!summonPets(p, s)) break;
        p.mp -= mpCost; p.cds[sid] = cdTime;
        saveChar(p);
        sendYou(p);
        break;
      }
      const events = [];
      if (s.heal) {
        p.mp -= mpCost; p.cds[sid] = cdTime;
        const healed = [p];
        if (p.partyId) { const pt = parties.get(p.partyId); if (pt) for (const id of pt.members) { const m2 = players.get(id); if (m2 && m2.id !== p.id && m2.map === p.map && dist(m2, p) < 300) healed.push(m2); } }
        const rate = DATA.skillHealRate(s, skillLv(p, sid));
        let healedOthers = 0;
        for (const h of healed) {
          const before = h.hp;
          h.hp = Math.min(h.maxHp, h.hp + h.maxHp * rate);
          const amount = h.hp - before;
          if (h.id !== p.id) healedOthers += amount;
          events.push({ e: "heal", x: h.x, y: h.y - 24, v: Math.round(amount) });
          sendYou(h);
        }
        // 治療隊友可換取經驗（純輔助職業的成長來源）
        const healExp = Math.floor(healedOthers / DATA.HEAL_EXP_DIVISOR);
        if (healExp > 0) {
          gainExp(p, healExp);
          send(p, { t: "log", msg: `✨【${s.name}】治療了 ${healed.length} 人，支援獲得 ${healExp} 經驗！`, color: "#8bc34a" });
        } else {
          send(p, { t: "log", msg: `✨【${s.name}】治療了 ${healed.length} 人！${healed.length === 1 ? "（治療隊友才有經驗）" : ""}`, color: "#8bc34a" });
        }
        if (!s.mult) { queueEvents(p.map, events); sendYou(p); break; }
      }
      const range = pRange(p) + 80;
      const targets = world[p.map].monsters.filter(m => m.alive && dist(m, p) <= range).sort((a, b) => dist(a, p) - dist(b, p)).slice(0, s.aoe);
      if (!targets.length && !s.heal) { send(p, { t: "log", msg: "附近沒有怪物。" }); break; }
      if (!s.heal) { p.mp -= mpCost; p.cds[sid] = cdTime; }
      const mult = DATA.skillMul(s, skillLv(p, sid));
      for (const m of targets) {
        const hit = applyCrit(p, pAtk(p) * mult * rand(0.95, 1.05) * distMul(p, m));
        damageMonster(p, m, Math.max(1, hit.dmg), events);
        if (hit.crit) events.push({ e: "crit", x: m.x, y: m.y - 44 });
      }
      if (targets.length) send(p, { t: "log", msg: `施放【${s.name}】命中 ${targets.length} 隻怪！` });
      queueEvents(p.map, events);
      sendYou(p);
      break;
    }
    case "pvp": {
      if (p.dead || p.inTower) break;
      if (M.safe) { send(p, { t: "log", msg: "🛡️ 新手村內禁止玩家打鬥！", color: "#ff8a65" }); break; }
      if (CLS[p.cls].noAttack) { send(p, { t: "log", msg: "☮️ 牧師無法攻擊。", color: "#ffca28" }); break; }
      if (p.atkCd > 0) break;
      p.atkCd = 0.5;
      const t = [...players.values()]
        .filter(q => q.id !== p.id && q.map === p.map && !q.dead && !q.inTower && (!p.partyId || q.partyId !== p.partyId) && dist(q, p) < pRange(p) + 40)
        .sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (!t) { send(p, { t: "log", msg: "附近沒有可攻擊的玩家。" }); break; }
      const dmg = mitigate(t, pAtk(p) * rand(0.9, 1.1) * distMul(p, t), CLS[p.cls].magic ? "magic" : "phys");
      t.hp -= dmg;
      queueEvents(p.map, [{ e: "dmg", x: t.x, y: t.y - 24, v: Math.round(dmg) }, { e: "line", x1: p.x, y1: p.y, x2: t.x, y2: t.y, c: "#ff5252" }]);
      send(t, { t: "log", msg: `⚔️ ${p.name} 正在攻擊你！`, color: "#ff5252" });
      if (t.hp <= 0) {
        const loot = Math.min(t.gold, ri(50, 200) + t.lv * 5);
        t.gold -= loot; p.gold += loot;
        send(p, { t: "log", msg: `⚔️ 你在PvP中擊敗了 ${t.name}！奪得 ${loot} 金幣。`, color: "#ff8a65" });
        defeat(t, `在【${M.name}】被 ${p.name} 擊敗，血量歸零，輸掉了遊戲。`);
        sendYou(p);
      }
      sendYou(t);
      break;
    }
    /* ---------- 商店 ---------- */
    case "buySkill": {
      const s = SKILLS[msg.id]; if (!s) break;
      if (s.cls !== p.cls) { send(p, { t: "log", msg: "❌ 職業不符，無法學習此技能！", color: "#ff8a65" }); break; }
      if (p.lv < s.lv) { send(p, { t: "log", msg: `❌ 需要 Lv.${s.lv}。`, color: "#ff8a65" }); break; }
      if (p.skills.includes(s.id) || p.gold < s.price) break;
      p.gold -= s.price; p.skills.push(s.id); p.skillLv[s.id] = 1;
      send(p, { t: "log", msg: `✨ 學會了新技能【${s.name}】！`, color: "#8bc34a" });
      sendYou(p);
      break;
    }
    case "buyEquip": {
      const e = EQUIPS.find(x => x.id === msg.id); if (!e || p.gold < e.price) break;
      p.gold -= e.price; p.inv.push({ ...e, enh: 0 });
      send(p, { t: "log", msg: `購買了 ${e.name}，已放入背包。` });
      sendYou(p);
      break;
    }
    case "buyPotion": {
      const pot = POTIONS.find(x => x.id === msg.id); if (!pot || p.gold < pot.price) break;
      p.gold -= pot.price;
      const ex = p.inv.find(i => i.id === pot.id && (i.heal || i.mana));
      if (ex) ex.count = (ex.count || 1) + 1; else p.inv.push({ ...pot, count: 1 });
      send(p, { t: "log", msg: `購買了 ${pot.name}。` });
      sendYou(p);
      break;
    }
    case "useItem": {
      const it = p.inv[msg.i]; if (!it) break;
      if (it.heal) { p.hp = Math.min(p.maxHp, p.hp + it.heal); send(p, { t: "log", msg: `使用${it.name}，回復${it.heal}HP。` }); }
      else if (it.mana) { p.mp = Math.min(p.maxMp, p.mp + it.mana); send(p, { t: "log", msg: `使用${it.name}，回復${it.mana}MP。` }); }
      else break;
      it.count = (it.count || 1) - 1;
      if (it.count <= 0) p.inv.splice(msg.i, 1);
      sendYou(p);
      break;
    }
    case "equipItem": {
      const it = p.inv[msg.i]; if (!it || !it.slot) break;
      if (it.cls !== "any" && it.cls !== p.cls) { send(p, { t: "log", msg: `❌ ${it.name} 是${CLS[it.cls].name}專用，你的職業無法裝備！`, color: "#ff8a65" }); break; }
      if (p.lv < it.lv) { send(p, { t: "log", msg: `❌ 需要等級 Lv.${it.lv} 才能裝備 ${it.name}。`, color: "#ff8a65" }); break; }
      const old = p.equip[it.slot];
      p.equip[it.slot] = it; p.inv.splice(msg.i, 1);
      if (old) p.inv.push(old);
      p.maxHp = pMaxHp(p); p.hp = Math.min(p.hp, p.maxHp);
      p.maxMp = pMaxMp(p); p.mp = Math.min(p.mp, p.maxMp);
      send(p, { t: "log", msg: `已裝備 ${it.name}。`, color: "#8bc34a" });
      sendYou(p);
      break;
    }
    /* ---------- 自由屬性點分配 ---------- */
    case "allocStat": {
      const k = msg.stat;
      if (!DATA.ALLOC_VALUE[k]) break;
      const n = clamp(Math.floor(+msg.n || 1), 1, p.statPoints || 0);
      if (!(p.statPoints > 0) || n < 1) { send(p, { t: "log", msg: "❌ 沒有可分配的屬性點了。升級才能獲得。", color: "#ff8a65" }); break; }
      p.alloc[k] = (p.alloc[k] || 0) + n;
      p.statPoints -= n;
      p.maxHp = pMaxHp(p);
      p.maxMp = pMaxMp(p);
      p.hp = Math.min(p.hp + (k === "hp" || k === "con" ? DATA.ALLOC_VALUE[k] * n : 0), p.maxHp);
      p.mp = Math.min(p.mp + (k === "mana" ? DATA.ALLOC_VALUE[k] * n * DATA.MP_PER_MANA : 0), p.maxMp);
      const info = DATA.STAT_INFO[k];
      send(p, { t: "log", msg: `${info.icon} ${info.name} +${DATA.ALLOC_VALUE[k] * n}（剩餘屬性點 ${p.statPoints}）`, color: "#8bc34a" });
      sendYou(p);
      break;
    }
    case "resetStats": {
      const spent = Object.values(p.alloc || {}).reduce((a, b) => a + b, 0);
      if (spent <= 0) { send(p, { t: "log", msg: "你還沒有分配任何屬性點。" }); break; }
      const cost = DATA.resetCost(spent);
      if (p.gold < cost) { send(p, { t: "log", msg: `❌ 洗點需要 ${cost} 金幣，你只有 ${p.gold}。`, color: "#ff8a65" }); break; }
      p.gold -= cost;
      p.statPoints = (p.statPoints || 0) + spent;
      p.alloc = { atk: 0, hp: 0, mana: 0, def: 0, mdef: 0, spd: 0, con: 0 };
      p.maxHp = pMaxHp(p);
      p.maxMp = pMaxMp(p);
      p.hp = Math.min(p.hp, p.maxHp);
      p.mp = Math.min(p.mp, p.maxMp);
      send(p, { t: "log", msg: `🔄 洗點成功！收回 ${spent} 點自由屬性點（花費 ${cost} 金幣）。`, color: "#ffd54f" });
      sendYou(p);
      break;
    }
    /* ---------- 副本 ---------- */
    case "dungeonList": {
      send(p, {
        t: "dungeonList",
        list: Object.values(DATA.DUNGEONS).map(d => ({
          key: d.key, no: d.no, tierName: d.tierName, name: d.name, minLv: d.minLv, fee: d.fee, desc: d.desc,
          waves: d.waves.length, gold: d.gold, exp: d.exp,
          bossName: d.waves[d.waves.length - 1].boss,
          bossLv: d.waves[d.waves.length - 1].lv[0],
          canEnter: p.lv >= d.minLv && p.gold >= d.fee,
        })),
        inDungeon: !!p.dungeon,
      });
      break;
    }
    case "dungeonEnter": enterDungeon(p, msg.key); break;
    case "dungeonLeave": leaveDungeon(p, "你離開了副本。"); break;
    /* ---------- 裝備強化（費用逐級遞增） ---------- */
    case "enhance": {
      // where: "weapon" | "armor" | "inv"，inv 時用 i 指定背包索引
      let it = null;
      if (msg.where === "weapon" || msg.where === "armor") it = p.equip[msg.where];
      else it = p.inv[msg.i];
      if (!it || !it.slot) { send(p, { t: "log", msg: "找不到可強化的裝備。" }); break; }
      it.enh = it.enh || 0;
      if (it.enh >= DATA.MAX_ENH) { send(p, { t: "log", msg: `❌ ${it.name} 已達最高強化 +${DATA.MAX_ENH}。`, color: "#ff8a65" }); break; }
      const cost = DATA.enhCost(it);
      if (p.gold < cost) { send(p, { t: "log", msg: `❌ 強化需要 ${cost} 金幣，你只有 ${p.gold}。`, color: "#ff8a65" }); break; }
      p.gold -= cost;
      it.enh++;
      p.maxHp = pMaxHp(p);
      p.hp = Math.min(p.hp, p.maxHp);
      send(p, { t: "log", msg: `⚒️ 強化成功！${it.name} +${it.enh}（花費 ${cost} 金幣，全屬性 +${Math.round((DATA.enhMul(it.enh) - 1) * 100)}%）`, color: "#ffd54f" });
      sendYou(p);
      break;
    }
    /* ---------- 技能升級（費用逐級遞增） ---------- */
    case "skillUp": {
      const sid = msg.id;
      if (!p.skills.includes(sid)) { send(p, { t: "log", msg: "你還沒學會這個技能。" }); break; }
      const s = SKILLS[sid];
      const cur = skillLv(p, sid);
      if (cur >= DATA.MAX_SKILL_LV) { send(p, { t: "log", msg: `❌【${s.name}】已達最高 Lv.${DATA.MAX_SKILL_LV}。`, color: "#ff8a65" }); break; }
      const cost = DATA.skillUpCost(s, cur);
      if (p.gold < cost) { send(p, { t: "log", msg: `❌ 升級需要 ${cost} 金幣，你只有 ${p.gold}。`, color: "#ff8a65" }); break; }
      p.gold -= cost;
      p.skillLv[sid] = cur + 1;
      const eff = s.heal ? `治療 ${Math.round(DATA.skillHealRate(s, cur + 1) * 100)}%` : `威力 ${Math.round(DATA.skillMul(s, cur + 1) * 100)}%`;
      send(p, { t: "log", msg: `📖【${s.name}】升到 Lv.${cur + 1}！（花費 ${cost} 金幣，${eff}）`, color: "#ffd54f" });
      sendYou(p);
      break;
    }
    /* ---------- 拍賣行 ---------- */
    case "auctionList": {
      send(p, { t: "auction", list: auctions.map(a => ({ id: a.id, item: a.item, price: a.price, sellerName: a.sellerName, mine: a.sellerId === p.id })) });
      break;
    }
    case "auctionSell": {
      const it = p.inv[msg.i]; const price = Math.floor(+msg.price);
      if (!it || !(price > 0)) break;
      if (it.count && it.count > 1) { it.count--; } else p.inv.splice(msg.i, 1);
      auctions.push({ id: auctionId++, item: { ...it, count: undefined }, price, sellerId: p.id, sellerName: p.name });
      send(p, { t: "log", msg: `已將 ${it.name} 上架拍賣行，定價 ${price}。` });
      sendYou(p);
      onMessage(p, { t: "auctionList" });
      break;
    }
    case "auctionBuy": {
      const i = auctions.findIndex(a => a.id === msg.id); if (i < 0) break;
      const a = auctions[i];
      if (a.sellerId === p.id || p.gold < a.price) break;
      p.gold -= a.price;
      const it = { ...a.item };
      if (it.heal || it.mana) { const ex = p.inv.find(x => x.id === it.id); if (ex) ex.count = (ex.count || 1) + 1; else { it.count = 1; p.inv.push(it); } }
      else p.inv.push(it);
      auctions.splice(i, 1);
      send(p, { t: "log", msg: `從拍賣行買下 ${a.item.name}（${a.price} 金幣）。` });
      const seller = a.sellerId ? players.get(a.sellerId) : null;
      if (seller) { seller.gold += a.price; send(seller, { t: "log", msg: `🏛️ 你的 ${a.item.name} 以 ${a.price} 金幣售出！`, color: "#8bc34a" }); sendYou(seller); }
      sendYou(p);
      onMessage(p, { t: "auctionList" });
      break;
    }
    case "auctionCancel": {
      const i = auctions.findIndex(a => a.id === msg.id && a.sellerId === p.id); if (i < 0) break;
      const a = auctions.splice(i, 1)[0];
      p.inv.push({ ...a.item });
      send(p, { t: "log", msg: `已下架 ${a.item.name}。` });
      sendYou(p);
      onMessage(p, { t: "auctionList" });
      break;
    }
    /* ---------- 組隊（雙方同意） ---------- */
    case "partyInvite": {
      const t = players.get(msg.id);
      if (!t || t.dead || t.map !== p.map || dist(t, p) > 600) { send(p, { t: "log", msg: "對方不在附近。" }); break; }
      if (t.partyId) { send(p, { t: "log", msg: `${t.name} 已有隊伍。` }); break; }
      if (pendingInvites.has(t.id)) { send(p, { t: "log", msg: "對方正忙碌中，稍後再試。" }); break; }
      pendingInvites.set(t.id, { type: "party", fromId: p.id });
      send(p, { t: "log", msg: `已向 ${t.name} 發出組隊邀請，等待對方回應…` });
      send(t, { t: "invite", kind: "party", fromId: p.id, fromName: p.name, text: `${p.name}（Lv.${p.lv} ${CLS[p.cls].name}）邀請你加入隊伍` });
      break;
    }
    case "factionInvite": {
      const f = p.factionId ? factions.get(p.factionId) : null;
      if (!f || !f.alive) { send(p, { t: "log", msg: "你沒有陣營。" }); break; }
      if (f.leaderId !== p.id) { send(p, { t: "log", msg: "只有陣營領袖可以邀請成員。" }); break; }
      const t = players.get(msg.id);
      if (!t || t.dead || t.factionId) { send(p, { t: "log", msg: "無法邀請該玩家。" }); break; }
      if (pendingInvites.has(t.id)) { send(p, { t: "log", msg: "對方正忙碌中，稍後再試。" }); break; }
      pendingInvites.set(t.id, { type: "faction", fromId: p.id, factionId: f.id });
      send(p, { t: "log", msg: `已邀請 ${t.name} 加入陣營，等待對方回應…` });
      send(t, { t: "invite", kind: "faction", fromId: p.id, fromName: p.name, text: `${p.name} 邀請你加入陣營「${f.name}」` });
      break;
    }
    case "inviteRespond": {
      const inv = pendingInvites.get(p.id); if (!inv) break;
      pendingInvites.delete(p.id);
      const from = players.get(inv.fromId);
      if (!msg.accept) {
        if (from) send(from, { t: "log", msg: `❌ ${p.name} 拒絕了你的${inv.type === "party" ? "組隊" : inv.type === "faction" ? "陣營" : "交易"}邀請。`, color: "#ff8a65" });
        send(p, { t: "log", msg: "你拒絕了邀請。" });
        break;
      }
      if (!from) { send(p, { t: "log", msg: "對方已離線。" }); break; }
      if (inv.type === "party") {
        let pt = from.partyId ? parties.get(from.partyId) : null;
        if (!pt) { pt = { id: nextId++, leaderId: from.id, members: [from.id] }; parties.set(pt.id, pt); from.partyId = pt.id; }
        pt.members.push(p.id); p.partyId = pt.id;
        send(from, { t: "log", msg: `✅ ${p.name} 同意加入你的隊伍！`, color: "#8bc34a" });
        send(p, { t: "log", msg: `✅ 你加入了 ${from.name} 的隊伍！組隊擊敗Boss時全體隊員一同獲勝。`, color: "#8bc34a" });
        for (const id of pt.members) { const m = players.get(id); if (m) sendYou(m); }
      } else if (inv.type === "faction") {
        const f = factions.get(inv.factionId);
        if (!f || !f.alive) { send(p, { t: "log", msg: "該陣營已不存在。" }); break; }
        f.members.push(p.id); p.factionId = f.id;
        send(from, { t: "log", msg: `✅ ${p.name} 同意加入陣營「${f.name}」！`, color: "#8bc34a" });
        send(p, { t: "log", msg: `✅ 你加入了陣營「${f.name}」！`, color: "#8bc34a" });
        for (const id of f.members) { const m = players.get(id); if (m) sendYou(m); }
      } else if (inv.type === "trade") {
        startTrade(from, p);
      }
      break;
    }
    case "partyLeave": {
      leaveParty(p, false);
      send(p, { t: "log", msg: "你離開了隊伍。" });
      sendYou(p);
      break;
    }
    /* ---------- 陣營 ---------- */
    case "factionCreate": {
      if (p.factionId) { send(p, { t: "log", msg: "你已經有陣營了。" }); break; }
      if (!M.allowFaction) { send(p, { t: "log", msg: "❌ 陣營只能建立在新手村外！", color: "#ff8a65" }); break; }
      const near = world[p.map].monsters.filter(m => m.alive && dist(m, p) < CONST.FACTION_CLEAR_R).length;
      if (near > 0) { send(p, { t: "log", msg: `❌ 必須先清空周圍的怪物（${CONST.FACTION_CLEAR_R}範圍內還有 ${near} 隻）！`, color: "#ff8a65" }); break; }
      const name = String(msg.name || `${p.name}的軍團`).slice(0, 16);
      const f = { id: nextId++, name, map: p.map, isNpc: false, alive: true, members: [p.id], leaderId: p.id, lastSiege: gameSec, hq: { x: p.x, y: p.y, hp: 5000, maxHp: 5000 } };
      factions.set(f.id, f); p.factionId = f.id;
      send(p, { t: "log", msg: `🚩 陣營「${name}」建立成功！每1遊戲小時會有怪物攻城，記得防守總部！`, color: "#ffd54f" });
      broadcast({ t: "chat", from: "系統", text: `🚩 ${p.name} 在【${M.name}】建立了陣營「${name}」！`, sys: true });
      sendYou(p);
      break;
    }
    /* ---------- 交易（雙方同意） ---------- */
    case "tradeRequest": {
      const t = players.get(msg.id);
      if (!t || t.dead || t.map !== p.map || dist(t, p) > 400) { send(p, { t: "log", msg: "對方不在附近（400範圍內）。" }); break; }
      if (pendingInvites.has(t.id) || p.tradeId || t.tradeId) { send(p, { t: "log", msg: "對方正忙碌中。" }); break; }
      pendingInvites.set(t.id, { type: "trade", fromId: p.id });
      send(p, { t: "log", msg: `已向 ${t.name} 發起交易請求…` });
      send(t, { t: "invite", kind: "trade", fromId: p.id, fromName: p.name, text: `${p.name} 想與你交易` });
      break;
    }
    case "tradeSet": {
      const tr = trades.get(p.tradeId); if (!tr) break;
      const side = tr.a.id === p.id ? tr.a : tr.b;
      side.gold = clamp(Math.floor(+msg.gold || 0), 0, p.gold);
      side.invIdx = (msg.item === null || msg.item === undefined || msg.item < 0) ? null : Math.floor(+msg.item);
      if (side.invIdx !== null && !p.inv[side.invIdx]) side.invIdx = null;
      tr.a.confirmed = false; tr.b.confirmed = false;
      syncTrade(tr);
      break;
    }
    case "tradeConfirm": {
      const tr = trades.get(p.tradeId); if (!tr) break;
      (tr.a.id === p.id ? tr.a : tr.b).confirmed = true;
      if (tr.a.confirmed && tr.b.confirmed) execTrade(tr); else syncTrade(tr);
      break;
    }
    case "tradeCancel": cancelTradeFor(p, "交易已取消。"); break;
    /* ---------- 試煉塔 ---------- */
    case "towerEnter": {
      if (p.dead || p.inTower) break;
      if (!M.tower || dist(p, M.tower) > 200) { send(p, { t: "log", msg: "🗼 試煉塔位於荒野右上方（金色高塔），走到塔前再進入。", color: "#ffd54f" }); break; }
      if (p.gold < CONST.TOWER_FEE) { send(p, { t: "log", msg: `❌ 進入試煉塔需支付 ${CONST.TOWER_FEE} 金幣。`, color: "#ff8a65" }); break; }
      p.gold -= CONST.TOWER_FEE;
      p.inTower = true;
      p.tower = { floor: 1, reward: 0, pHp: p.hp, mon: towerMonster(1) };
      send(p, { t: "log", msg: `🗼 支付 ${CONST.TOWER_FEE} 金幣，進入試煉塔！塔內怪物最高${CONST.TOWER_MAX_LV}級！` });
      sendTower(p);
      sendYou(p);
      break;
    }
    case "towerFight": {
      if (!p.inTower) break;
      const tw = p.tower, m = tw.mon;
      const pd = Math.max(1, pAtk(p) * rand(1.0, 1.4));
      m.hp -= pd;
      if (m.hp <= 0) {
        tw.reward += tw.floor * tw.floor * 5 + 50;
        gainExp(p, m.lv * 5);
        if (Math.random() < 0.15) send(p, { t: "log", msg: "🌟 神秘力量湧現……你在試煉塔的等級回饋到了現實！獲得「現實成就徽章」！", color: "#ffd54f" });
        tw.floor++;
        tw.pHp = Math.min(p.maxHp, tw.pHp + p.maxHp * 0.25);
        tw.mon = towerMonster(tw.floor);
        sendTower(p);
        break;
      }
      const md = mitigate(p, m.atk * rand(0.7, 1.1), "mixed");
      tw.pHp -= md;
      if (tw.pHp <= 0) {
        p.inTower = false; p.hp = 1;
        send(p, { t: "tower", end: true });
        send(p, { t: "log", msg: `💥 你在試煉塔第 ${tw.floor} 層倒下，被傳送出塔（獎勵沒收）。塔內失敗不算輸！`, color: "#ff8a65" });
        p.tower = null;
        sendYou(p);
        break;
      }
      sendTower(p, { pd: Math.round(pd), md: Math.round(md) });
      break;
    }
    case "towerLeave": {
      if (!p.inTower) break;
      const tw = p.tower;
      p.gold += tw.reward;
      p.hp = Math.max(1, Math.round(tw.pHp));
      p.inTower = false; p.tower = null;
      send(p, { t: "tower", end: true });
      send(p, { t: "log", msg: `🗼 你通過了 ${tw.floor - 1} 層試煉塔，獲得 ${tw.reward} 金幣！`, color: "#ffd54f" });
      if (tw.floor > 1 && Math.random() < 0.3) send(p, { t: "log", msg: "🌟 等級回饋到現實：你獲得了現實世界的「毅力+1」！", color: "#ffd54f" });
      sendYou(p);
      break;
    }
    case "leaderboard": sendLeaderboard(p); break;
    case "saveNow": {                       // 玩家手動存檔
      saveChar(p);
      send(p, { t: "log", msg: "💾 已存檔。", color: "#8bc34a" });
      break;
    }
    case "deleteChar": {                    // 刪除自己目前的角色存檔
      if (p.token && deleteChar(p.token)) {
        send(p, { t: "charGone", token: p.token });
        send(p, { t: "log", msg: "🗑️ 角色存檔已刪除。", color: "#ff8a65" });
        p.token = null;
      }
      break;
    }
    case "chat": {
      const text = String(msg.text || "").slice(0, 100).trim();
      if (text) broadcast({ t: "chat", from: p.name, text });
      break;
    }
  }
}
function towerMonster(floor) {
  const lv = Math.min(CONST.TOWER_MAX_LV, floor * 10);
  return { name: `第${floor}層守衛`, lv, maxHp: lv * 30 + 100, hp: lv * 30 + 100, atk: lv * 1.8 + 5 };
}
function sendTower(p, extra) {
  const tw = p.tower;
  send(p, { t: "tower", floor: tw.floor, reward: tw.reward, pHp: Math.max(0, Math.round(tw.pHp)), pMaxHp: p.maxHp, mon: { name: tw.mon.name, lv: tw.mon.lv, hp: Math.max(0, Math.round(tw.mon.hp)), maxHp: tw.mon.maxHp }, ...extra });
}
function destroyFaction(f, killer) {
  f.alive = false;
  for (const id of f.members) { const m = players.get(id); if (m) { m.factionId = null; send(m, { t: "log", msg: `💥 你的陣營「${f.name}」總部被摧毀，陣營解散！`, color: "#ff5252" }); sendYou(m); } }
  factions.delete(f.id);
  if (killer) {
    const reward = f.isNpc ? 20000 : 5000;
    killer.gold += reward;
    send(killer, { t: "log", msg: `🏆 你摧毀了「${f.name}」總部！奪得 ${reward} 金幣戰利品！`, color: "#ffd54f" });
    broadcast({ t: "chat", from: "系統", text: `🏆 ${killer.name} 摧毀了陣營「${f.name}」的總部！`, sys: true });
    sendYou(killer);
  }
}
/* ---------- 交易輔助 ---------- */
function startTrade(a, b) {
  const tr = { id: tradeId++, a: { id: a.id, gold: 0, invIdx: null, confirmed: false }, b: { id: b.id, gold: 0, invIdx: null, confirmed: false } };
  trades.set(tr.id, tr);
  a.tradeId = tr.id; b.tradeId = tr.id;
  send(a, { t: "log", msg: `✅ ${b.name} 同意交易！`, color: "#8bc34a" });
  syncTrade(tr);
}
function syncTrade(tr) {
  const a = players.get(tr.a.id), b = players.get(tr.b.id);
  if (!a || !b) return;
  const view = (me, other, meP, otherP) => ({
    t: "trade", partner: otherP.name,
    myGold: me.gold, myItem: me.invIdx !== null ? meP.inv[me.invIdx] : null, myConfirmed: me.confirmed,
    theirGold: other.gold, theirItem: other.invIdx !== null ? otherP.inv[other.invIdx] : null, theirConfirmed: other.confirmed,
  });
  send(a, view(tr.a, tr.b, a, b));
  send(b, view(tr.b, tr.a, b, a));
}
function execTrade(tr) {
  const a = players.get(tr.a.id), b = players.get(tr.b.id);
  if (!a || !b) return;
  if (tr.a.gold > a.gold || tr.b.gold > b.gold) return cancelTrade(tr, "金幣不足，交易取消。");
  const itA = tr.a.invIdx !== null ? a.inv[tr.a.invIdx] : null;
  const itB = tr.b.invIdx !== null ? b.inv[tr.b.invIdx] : null;
  if (tr.a.invIdx !== null && !itA) return cancelTrade(tr, "物品異常，交易取消。");
  if (tr.b.invIdx !== null && !itB) return cancelTrade(tr, "物品異常，交易取消。");
  a.gold += tr.b.gold - tr.a.gold;
  b.gold += tr.a.gold - tr.b.gold;
  if (itA) { removeInvItem(a, tr.a.invIdx); addInvItem(b, itA); }
  if (itB) { removeInvItem(b, tr.b.invIdx); addInvItem(a, itB); }
  trades.delete(tr.id);
  a.tradeId = null; b.tradeId = null;
  for (const p of [a, b]) { send(p, { t: "trade", done: true }); send(p, { t: "log", msg: "✅ 交易成功！", color: "#8bc34a" }); sendYou(p); }
}
function removeInvItem(p, idx) {
  const it = p.inv[idx];
  if (it.count && it.count > 1) it.count--; else p.inv.splice(idx, 1);
}
function addInvItem(p, it) {
  if (it.heal || it.mana) { const ex = p.inv.find(x => x.id === it.id); if (ex) { ex.count = (ex.count || 1) + 1; return; } p.inv.push({ ...it, count: 1 }); return; }
  p.inv.push({ ...it, count: undefined });
}
function cancelTrade(tr, msg) {
  const a = players.get(tr.a.id), b = players.get(tr.b.id);
  trades.delete(tr.id);
  for (const p of [a, b]) if (p) { p.tradeId = null; send(p, { t: "trade", done: true }); send(p, { t: "log", msg, color: "#ff8a65" }); }
}
function cancelTradeFor(p, msg) {
  if (!p.tradeId) return;
  const tr = trades.get(p.tradeId);
  if (tr) cancelTrade(tr, msg); else p.tradeId = null;
}

/* ============ 事件佇列（傷害數字等） ============ */
const eventQueues = {}; // mapKey -> []
function queueEvents(mapKey, evts) {
  (eventQueues[mapKey] = eventQueues[mapKey] || []).push(...evts);
}

/* ============ 遊戲主迴圈 ============ */
const TICK = 100; // ms
setInterval(() => {
  const dt = TICK / 1000;
  gameSec += dt * CONST.TIME_SCALE;
  if (gameSec >= 24 * 3600) { gameSec -= 24 * 3600; gameDay++; for (const f of factions.values()) f.lastSiege -= 24 * 3600; }

  updatePets(dt);

  /* 玩家回復/冷卻 */
  for (const p of players.values()) {
    if (p.dead) continue;
    p.atkCd = Math.max(0, p.atkCd - dt);
    for (const k in p.cds) p.cds[k] = Math.max(0, p.cds[k] - dt);
    if (!p.inTower) {
      // 體質加快回血，天賦「每秒回復 X% 最大血量」再額外加成
      const regen = (mapOf(p.map).safe ? 8 : 1.5) + stats(p).con * 0.15 + p.maxHp * tal(p, "regen") / 100;
      p.hp = Math.min(p.maxHp, p.hp + regen * dt);
      p.mp = Math.min(p.maxMp, p.mp + 3 * dt);
    }
  }

  /* 怪物 AI 與刷新 */
  for (const mapKey of Object.keys(world)) {
    const M = mapOf(mapKey);
    const mons = world[mapKey].monsters;
    const mapPlayers = [...players.values()].filter(p => p.map === mapKey && !p.dead && !p.inTower);
    for (let i = mons.length - 1; i >= 0; i--) {
      const m = mons[i];
      if (!m.alive) {
        if (m.siege) { mons.splice(i, 1); continue; } // 攻城怪不重生
        if (m.respawnAt > 0 && gameSec >= m.respawnAt) {
          m.alive = true; m.hp = m.maxHp; m.x = m.homeX; m.y = m.homeY; m.aggroId = null; m.respawnAt = 0;
          if (m.boss) broadcast({ t: "chat", from: "系統", text: `⚠️ ${m.name}（Lv.${m.lv}）在【${M.name}】重生了！`, sys: true });
        }
        continue;
      }
      if (m.siege) { // 攻城怪：進攻目標陣營總部
        const f = factions.get(m.targetFac);
        if (!f || !f.alive) { m.alive = false; continue; }
        const d = dist(m, f.hq);
        if (d > 60) { m.x += (f.hq.x - m.x) / d * m.spd * dt; m.y += (f.hq.y - m.y) / d * m.spd * dt; }
        else {
          m.atkCd -= dt;
          if (m.atkCd <= 0) {
            m.atkCd = 1.5; f.hq.hp -= m.atk;
            if (f.hq.hp <= 0) destroyFaction(f, null);
          }
        }
        continue;
      }
      /* 一般怪：仇恨/追擊/回家（玩家與小妖都可能成為目標） */
      let target = m.aggroId ? (players.get(m.aggroId) || pets.get(m.aggroId)) : null;
      const gone = target && (target.map !== mapKey || target.dead || target.inTower || target.hp <= 0 || dist(m, target) > 650);
      if (gone) { target = null; m.aggroId = null; }
      if (!target) {
        const cands = [...mapPlayers, ...[...pets.values()].filter(pe => pe.map === mapKey && pe.hp > 0)]
          .filter(e => dist(m, e) < 120)
          .sort((a, b) => dist(m, a) - dist(m, b));
        if (cands.length) { target = cands[0]; m.aggroId = target.id; }
      }
      /* 回血：Boss 戰鬥中緩慢回血，脫離戰鬥時快速回復；一般怪只在脫戰時回復 */
      if (m.hp < m.maxHp) {
        const rate = target
          ? m.regen
          : (m.boss ? m.regen : m.maxHp * 0.01) * DATA.OUT_OF_COMBAT_MULT;
        if (rate > 0) m.hp = Math.min(m.maxHp, m.hp + rate * dt);
      }
      if (target) {
        const d = dist(m, target);
        if (d > 50) { const sp = m.spd; m.x += (target.x - m.x) / d * sp * dt; m.y += (target.y - m.y) / d * sp * dt; }
        else {
          m.atkCd -= dt;
          if (m.atkCd <= 0) {
            m.atkCd = m.boss ? 1 : 1.6;
            const isPet = pets.has(target.id);
            let dmg;
            if (isPet) {   // 小妖用自己的防禦／魔抗減免
              const armor = m.dmgType === "magic" ? target.mdef : m.dmgType === "mixed" ? (target.def + target.mdef) / 2 : target.def;
              dmg = Math.max(1, m.atk * rand(0.8, 1.1) - armor);
            } else {
              dmg = mitigate(target, m.atk * rand(0.8, 1.1), m.dmgType);
            }
            target.hp -= dmg;
            queueEvents(mapKey, [{ e: "dmg", x: target.x, y: target.y - 24, v: Math.round(dmg) }]);
          }
        }
        if (dist(m, { x: m.homeX, y: m.homeY }) > 800) { m.aggroId = null; }
      } else {
        const dh = dist(m, { x: m.homeX, y: m.homeY });
        if (dh > 10) { m.x += (m.homeX - m.x) / dh * 30 * dt; m.y += (m.homeY - m.y) / dh * 30 * dt; }
      }
    }
  }

  /* 玩家死亡判定 */
  for (const p of players.values()) {
    if (p.dead || p.inTower) continue;
    if (p.hp <= 0) {
      const M = mapOf(p.map);
      if (M.safe) {
        p.hp = p.maxHp * 0.5; p.x = M.spawn.x; p.y = M.spawn.y;
        send(p, { t: "log", msg: "你在新手村暈倒了……村民把你救回廣場（新手村內死亡不算輸）。", color: "#ff8a65" });
        sendYou(p);
      } else if (p.dungeon) {
        // 副本內死亡：被傳送出副本，但不算輸掉遊戲（與試煉塔相同規則）
        p.hp = 1;
        leaveDungeon(p, `💥 你在副本【${M.name}】倒下，被傳送出副本（獎勵沒收）。副本內失敗不算輸！`);
      } else {
        defeat(p, `在【${M.name}】血量歸零，輸掉了遊戲。`);
      }
    }
  }

  /* 副本：波次推進、通關傳送、逾時失敗 */
  for (const inst of [...instances.values()]) {
    // 成員都不在了就銷毀實例
    inst.members = inst.members.filter(id => { const m = players.get(id); return m && m.dungeon === inst.key; });
    if (inst.members.length === 0) { instances.delete(inst.key); delete world[inst.key]; continue; }

    if (inst.cleared) {
      if (inst.ejectAt && gameSec >= inst.ejectAt) {
        for (const id of [...inst.members]) { const m = players.get(id); if (m) leaveDungeon(m, "🏰 副本已通關，你被傳送回原本的地圖。"); }
      }
      continue;
    }
    // 逾時失敗
    if (gameSec - inst.startedAt >= inst.d.timeLimit) {
      for (const id of [...inst.members]) { const m = players.get(id); if (m) leaveDungeon(m, `⏰ 副本【${inst.d.name}】時間到，挑戰失敗，被傳送出副本。`); }
      continue;
    }
    // 本波清空 → 下一波
    const alive = world[inst.key] ? world[inst.key].monsters.filter(m => m.alive).length : 0;
    if (alive === 0) nextWave(inst);
  }

  /* 陣營攻城 */
  for (const f of factions.values()) {
    if (!f.alive || f.isNpc) continue;
    if (gameSec - f.lastSiege >= CONST.SIEGE_INTERVAL) {
      f.lastSiege = gameSec;
      const n = ri(4, 7);
      const M = MAPS[f.map];
      for (let i = 0; i < n; i++) {
        const ang = rand(0, Math.PI * 2);
        const m = makeMonster(f.map, clamp(f.hq.x + Math.cos(ang) * 600, 40, M.w - 40), clamp(f.hq.y + Math.sin(ang) * 600, 40, M.h - 40), ri(Math.max(5, MAPS[f.map].lvMin + 10), Math.min(MAPS[f.map].lvMax, MAPS[f.map].lvMin + 40)));
        m.siege = true; m.targetFac = f.id;
        world[f.map].monsters.push(m);
      }
      for (const id of f.members) { const m2 = players.get(id); if (m2) send(m2, { t: "log", msg: `⚔️ 怪物攻城開始！${n} 隻怪物正在進攻「${f.name}」總部，快去防守！`, color: "#ff5252" }); }
      broadcast({ t: "chat", from: "系統", text: `⚔️ 怪物大軍正在圍攻陣營「${f.name}」的總部！`, sys: true });
    }
  }
}, TICK);

/* ============ 廣播快照 ============ */
setInterval(() => {
  const h = Math.floor(gameSec / 3600), mi = Math.floor(gameSec % 3600 / 60);
  const timeStr = `第${gameDay}天 ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  for (const mapKey of Object.keys(world)) {
    const mapPlayers = [...players.values()].filter(p => p.map === mapKey);
    if (!mapPlayers.length) { eventQueues[mapKey] = []; continue; }
    const snap = {
      t: "state", time: timeStr, online: players.size,
      players: mapPlayers.filter(p => !p.dead && !p.inTower).map(p => ({ id: p.id, name: p.name, cls: p.cls, lv: p.lv, x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp), maxHp: p.maxHp, party: p.partyId, fac: p.factionId })),
      monsters: world[mapKey].monsters.filter(m => m.alive).map(m => ({ i: m.id, x: Math.round(m.x), y: Math.round(m.y), lv: m.lv, hp: Math.round(m.hp), maxHp: m.maxHp, a: Math.round(m.atk), df: m.def, md: m.mdef, sp: m.spd, ty: m.dmgType[0], rg: Math.round(m.regen || 0), b: m.boss ? 1 : 0, s: m.siege ? 1 : 0, n: m.name })),
      hqs: [...factions.values()].filter(f => f.alive && f.map === mapKey).map(f => ({ id: f.id, name: f.name, x: f.hq.x, y: f.hq.y, hp: Math.round(f.hq.hp), maxHp: f.hq.maxHp, npc: f.isNpc ? 1 : 0 })),
      pets: [...pets.values()].filter(pe => pe.map === mapKey).map(pe => ({ i: pe.id, o: pe.ownerId, on: pe.ownerName, x: Math.round(pe.x), y: Math.round(pe.y), hp: Math.round(pe.hp), maxHp: pe.maxHp, c: pe.cls, lv: pe.lv, r: pe.rare ? 1 : 0 })),
      events: eventQueues[mapKey] || [],
    };
    eventQueues[mapKey] = [];
    const s = JSON.stringify(snap);
    for (const p of mapPlayers) if (p.ws.readyState === 1) p.ws.send(s);
  }
  // 輕量self狀態（血魔經驗金幣）
  for (const p of players.values()) {
    if (p.dead) continue;
    send(p, { t: "self", hp: Math.round(p.hp), maxHp: p.maxHp, mp: Math.round(p.mp), maxMp: p.maxMp, exp: p.exp, expNeed: expNeed(p), lv: p.lv, gold: p.gold, cds: p.cds });
  }
}, 100);

/* ============ WebSocket ============ */
const wss = new WebSocketServer({ server });
wss.on("connection", ws => {
  let p = null;
  ws.isAlive = true;
  // 每次連線抽一次稀有職業（1%）
  ws.rareUnlocked = Math.random() < DATA.RARE_CHANCE;
  ws.send(JSON.stringify({ t: "classRoll", rare: ws.rareUnlocked }));
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("error", () => { try { ws.terminate(); } catch {} });
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try {
      if (!p) {
        // 進遊戲前可以先查詢本機記錄的角色存檔
        if (msg.t === "loadChars") {
          const list = (Array.isArray(msg.tokens) ? msg.tokens : [])
            .slice(0, 20)
            .map(tk => chars[tk])
            .filter(Boolean)
            .map(charSummary)
            .sort((a, b) => b.savedAt - a.savedAt);
          ws.send(JSON.stringify({ t: "charList", list }));
          return;
        }
        if (msg.t === "deleteCharByToken") {
          const ok = deleteChar(msg.token);
          ws.send(JSON.stringify({ t: "charGone", token: msg.token, ok }));
          return;
        }
        if (msg.t === "join") p = addPlayer(ws, msg.name, msg.cls, msg.token);
        return;
      }
      onMessage(p, msg);
    } catch (e) { console.error("msg error:", e); }
  });
  ws.on("close", () => { if (p) removePlayer(p); });
});

/* 自動存檔：每 20 秒把所有線上玩家的進度寫入存檔 */
setInterval(() => {
  for (const p of players.values()) saveChar(p);
}, 20000);

/* 伺服器關閉前做最後一次存檔（避免遺失進度） */
let shuttingDown = false;
function gracefulExit() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of players.values()) { if (p.token && !p.dead) chars[p.token] = serializeChar(p); }
  try { fs.writeFileSync(CHARS_FILE, JSON.stringify(chars)); } catch {}
  try { fs.writeFileSync(RECORDS_FILE, JSON.stringify(hallOfFame, null, 1)); } catch {}
  console.log("已存檔，伺服器關閉。");
  process.exit(0);
}
process.on("SIGINT", gracefulExit);
process.on("SIGTERM", gracefulExit);

/* 心跳：每20秒探測一次，沒回應的殭屍連線直接踢除（避免在線人數虛高） */
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      console.log("踢除無回應的連線");
      try { ws.terminate(); } catch {}
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 20000);

genWorld();
server.listen(PORT, () => console.log(`星辰大陸 Online 伺服器啟動：http://localhost:${PORT}`));
