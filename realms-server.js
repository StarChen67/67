/* ============================================================
   碎界：失落王座 —— 遊戲伺服器（階段 0～1）
   · HTTP 靜態：提供 /realms 下的檔案（client + 內容定義檔）
   · WebSocket：帳號註冊／登入、角色建立／讀取
   · 伺服器是唯一權威來源：帳密驗證、角色資料一律由伺服器計算與保存，
     Client 只送「意圖」訊息，不會自己決定結果。
   獨立 port，不影響本資料夾其他伺服器。
   ============================================================ */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || process.env.REALMS_PORT || 8793);
const ROOT = path.join(__dirname, "realms");
const DATA_DIR = path.join(__dirname, "realms-data");
const DB_PATH = path.join(DATA_DIR, "realms.db");
const MAX_CHARACTERS_PER_ACCOUNT = 4;
const DEFAULT_MAP_ID = "morningwind_village";
const TICK_MS = 50; // 伺服器權威移動/戰鬥運算頻率（20Hz）
const BROADCAST_MS = 100; // 區域快照廣播頻率（10Hz）
const POS_SAVE_MS = 10000; // 定期把位置/血量寫回資料庫的頻率
const PLAYER_RADIUS = 18; // 碰撞邊界用的角色半徑，避免走出地圖外
const MONSTER_RADIUS = 16;
const RESPAWN_PLAYER_MS = 3000; // 玩家死亡後重生所需時間
const MONSTER_LEASH_RANGE = 400; // 怪物追擊超過這個距離就放棄、走回出生點
const INTERACT_RANGE = 90; // 與 NPC 互動（對話／購買）的最大距離
const STARTING_GOLD = 50;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- 靜態內容定義（資料驅動，未來新增職業/怪物/道具/地圖都走這個資料夾） ---------------- */
const CLASS_DEFS = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "classes.json"), "utf8"));
const MAP_DEFS = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "maps.json"), "utf8"));
const MONSTER_DEFS = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "monsters.json"), "utf8"));
const NPC_DEFS = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "npcs.json"), "utf8"));
const ITEM_DEFS = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "items.json"), "utf8"));

/* ---------------- 資料庫 ---------------- */
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    name TEXT NOT NULL,
    class TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    exp INTEGER NOT NULL DEFAULT 0,
    hp INTEGER NOT NULL,
    max_hp INTEGER NOT NULL,
    mp INTEGER NOT NULL,
    max_mp INTEGER NOT NULL,
    atk INTEGER NOT NULL,
    def INTEGER NOT NULL,
    matk INTEGER NOT NULL,
    mdef INTEGER NOT NULL,
    crit_rate INTEGER NOT NULL,
    move_speed INTEGER NOT NULL,
    gold INTEGER NOT NULL DEFAULT 0,
    skill_points INTEGER NOT NULL DEFAULT 0,
    map_id TEXT NOT NULL,
    pos_x REAL NOT NULL,
    pos_y REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_character_name ON characters(name);
  CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    item_def_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    acquired_at TEXT NOT NULL
  );
`);

const stmt = {
  findAccountByUsername: db.prepare("SELECT * FROM accounts WHERE username = ?"),
  insertAccount: db.prepare("INSERT INTO accounts (username, password_hash, created_at) VALUES (?, ?, ?)"),
  touchLogin: db.prepare("UPDATE accounts SET last_login = ? WHERE id = ?"),
  listCharacters: db.prepare("SELECT * FROM characters WHERE account_id = ? ORDER BY id"),
  countCharacters: db.prepare("SELECT COUNT(*) AS n FROM characters WHERE account_id = ?"),
  findCharacterByName: db.prepare("SELECT id FROM characters WHERE name = ?"),
  getCharacter: db.prepare("SELECT * FROM characters WHERE id = ?"),
  updateVitals: db.prepare("UPDATE characters SET map_id = ?, pos_x = ?, pos_y = ?, hp = ?, mp = ?, updated_at = ? WHERE id = ?"),
  getGold: db.prepare("SELECT gold FROM characters WHERE id = ?"),
  spendGold: db.prepare("UPDATE characters SET gold = gold - ? WHERE id = ? AND gold >= ?"),
  insertInventoryItem: db.prepare("INSERT INTO inventory_items (character_id, item_def_id, quantity, acquired_at) VALUES (?, ?, 1, ?)"),
  insertCharacter: db.prepare(`
    INSERT INTO characters
      (account_id, name, class, level, exp, hp, max_hp, mp, max_mp, atk, def, matk, mdef, crit_rate, move_speed, gold, skill_points, map_id, pos_x, pos_y, created_at, updated_at)
    VALUES
      (@accountId, @name, @cls, 1, 0, @hp, @hp, @mp, @mp, @atk, @def, @matk, @mdef, @critRate, @moveSpeed, ${STARTING_GOLD}, 0, @mapId, @x, @y, @now, @now)
  `),
};

/* ---------------- 密碼雜湊（Node 內建 crypto.scrypt，不額外引套件） ---------------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

function characterToClient(row) {
  return {
    id: row.id,
    name: row.name,
    class: row.class,
    level: row.level,
    exp: row.exp,
    hp: row.hp,
    maxHp: row.max_hp,
    mp: row.mp,
    maxMp: row.max_mp,
    atk: row.atk,
    def: row.def,
    matk: row.matk,
    mdef: row.mdef,
    critRate: row.crit_rate,
    moveSpeed: row.move_speed,
    gold: row.gold,
    skillPoints: row.skill_points,
    mapId: row.map_id,
    x: row.pos_x,
    y: row.pos_y,
  };
}

/* ---------------- 靜態檔 ---------------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/" || p === "") p = "/index.html";
  const fp = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ""));
  if (!fp.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("404 " + p);
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(data);
  });
});

/* ---------------- WebSocket 訊息協定 ----------------
   Client -> Server: { t: "register"|"login"|"createCharacter"|"selectCharacter"|"ping", ... }
   Server -> Client: { t: "...Result"|"pong", ok, ... }
   每個連線在完成 login 前 ws.accountId 是 undefined，未登入不可呼叫角色相關訊息。
------------------------------------------------------------ */
const wss = new WebSocketServer({ server });

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function isValidUsername(s) {
  return typeof s === "string" && /^[A-Za-z0-9_]{3,20}$/.test(s);
}
function isValidPassword(s) {
  return typeof s === "string" && s.length >= 6 && s.length <= 72;
}
function isValidCharName(s) {
  return typeof s === "string" && [...s].length >= 2 && [...s].length <= 12;
}

function handleRegister(ws, msg) {
  const username = String(msg.username || "").trim();
  const password = String(msg.password || "");
  if (!isValidUsername(username)) {
    return send(ws, { t: "registerResult", ok: false, error: "帳號需為 3-20 碼英數字或底線。" });
  }
  if (!isValidPassword(password)) {
    return send(ws, { t: "registerResult", ok: false, error: "密碼需至少 6 碼。" });
  }
  if (stmt.findAccountByUsername.get(username)) {
    return send(ws, { t: "registerResult", ok: false, error: "這個帳號已經被註冊了。" });
  }
  stmt.insertAccount.run(username, hashPassword(password), new Date().toISOString());
  send(ws, { t: "registerResult", ok: true });
}

function handleLogin(ws, msg) {
  const username = String(msg.username || "").trim();
  const password = String(msg.password || "");
  const account = stmt.findAccountByUsername.get(username);
  if (!account || !verifyPassword(password, account.password_hash)) {
    return send(ws, { t: "loginResult", ok: false, error: "帳號或密碼錯誤。" });
  }
  stmt.touchLogin.run(new Date().toISOString(), account.id);
  ws.accountId = account.id;
  ws.characterId = null;
  const characters = stmt.listCharacters.all(account.id).map(characterToClient);
  send(ws, { t: "loginResult", ok: true, username, characters, classDefs: CLASS_DEFS, itemDefs: ITEM_DEFS });
}

function requireLogin(ws) {
  return typeof ws.accountId === "number";
}

function handleCreateCharacter(ws, msg) {
  if (!requireLogin(ws)) return send(ws, { t: "createCharacterResult", ok: false, error: "請先登入。" });

  const name = String(msg.name || "").trim();
  const cls = String(msg.class || "");
  if (!isValidCharName(name)) {
    return send(ws, { t: "createCharacterResult", ok: false, error: "角色名稱需為 2-12 個字元。" });
  }
  if (!CLASS_DEFS[cls]) {
    return send(ws, { t: "createCharacterResult", ok: false, error: "職業不存在。" });
  }
  const { n } = stmt.countCharacters.get(ws.accountId);
  if (n >= MAX_CHARACTERS_PER_ACCOUNT) {
    return send(ws, { t: "createCharacterResult", ok: false, error: `每個帳號最多 ${MAX_CHARACTERS_PER_ACCOUNT} 個角色。` });
  }
  if (stmt.findCharacterByName.get(name)) {
    return send(ws, { t: "createCharacterResult", ok: false, error: "這個角色名稱已經被使用了。" });
  }

  const base = CLASS_DEFS[cls].baseStats;
  const spawn = MAP_DEFS[DEFAULT_MAP_ID].spawn;
  const info = stmt.insertCharacter.run({
    accountId: ws.accountId,
    name,
    cls,
    hp: base.hp,
    mp: base.mp,
    atk: base.atk,
    def: base.def,
    matk: base.matk,
    mdef: base.mdef,
    critRate: base.critRate,
    moveSpeed: base.moveSpeed,
    mapId: DEFAULT_MAP_ID,
    x: spawn.x,
    y: spawn.y,
    now: new Date().toISOString(),
  });
  const row = stmt.getCharacter.get(info.lastInsertRowid);
  send(ws, { t: "createCharacterResult", ok: true, character: characterToClient(row) });
}

/* ---------------- 區域房間（Zone Room） ----------------
   每張地圖一個房間，房間內只存執行期狀態（位置、輸入、血量顯示）；
   角色的「真相」資料還是資料庫，房間只是暫存＋權威移動運算的地方。
   新增地圖＝在 content/maps.json 加一筆、房間會自動用同一套邏輯生成，
   不需要改這裡的程式碼。
------------------------------------------------------------ */
const zones = new Map(); // mapId -> Map(characterId -> playerState)
function getZone(mapId) {
  if (!zones.has(mapId)) zones.set(mapId, new Map());
  return zones.get(mapId);
}
function isCharacterOnline(characterId) {
  for (const zone of zones.values()) if (zone.has(characterId)) return true;
  return false;
}

function zonePlayerToClient(state) {
  return {
    id: state.characterId,
    name: state.name,
    class: state.class,
    level: state.level,
    hp: state.hp,
    maxHp: state.maxHp,
    mp: state.mp,
    maxMp: state.maxMp,
    dead: state.dead,
    x: Math.round(state.x),
    y: Math.round(state.y),
  };
}

function persistState(state) {
  stmt.updateVitals.run(state.mapId, state.x, state.y, state.hp, state.mp, new Date().toISOString(), state.characterId);
}

function leaveZone(ws) {
  const state = ws.playerState;
  if (!state) return;
  const zone = zones.get(state.mapId);
  if (zone) {
    zone.delete(state.characterId);
    if (zone.size === 0) zones.delete(state.mapId);
  }
  clearMonsterTarget(state.characterId);
  persistState(state);
  broadcastToZone(state.mapId, { t: "zoneLeave", characterId: state.characterId, name: state.name });
  ws.playerState = null;
  ws.characterId = null;
}

/* ---------------- 怪物（資料驅動：新增怪物只要改 content/monsters.json + maps.json 的 monsterSpawns） ---------------- */
const zoneMonsters = new Map(); // mapId -> Map(instanceId -> monsterState)
const eventQueues = new Map(); // mapId -> array，每次廣播後清空
let nextMonsterId = 1;

function queueEvent(mapId, ev) {
  if (!eventQueues.has(mapId)) eventQueues.set(mapId, []);
  eventQueues.get(mapId).push(ev);
}

function spawnMonsters() {
  for (const mapDef of Object.values(MAP_DEFS)) {
    if (!mapDef.monsterSpawns) continue;
    const monsters = new Map();
    zoneMonsters.set(mapDef.id, monsters);
    for (const spawn of mapDef.monsterSpawns) {
      const def = MONSTER_DEFS[spawn.defId];
      if (!def) continue;
      for (let i = 0; i < spawn.count; i++) {
        const id = `m${nextMonsterId++}`;
        const angle = (i / spawn.count) * Math.PI * 2;
        const jitterX = spawn.x + Math.cos(angle) * 35;
        const jitterY = spawn.y + Math.sin(angle) * 35;
        monsters.set(id, makeMonster(id, def, mapDef, jitterX, jitterY));
      }
    }
  }
}

function makeMonster(id, def, mapDef, spawnX, spawnY) {
  return {
    id,
    defId: def.id,
    name: def.name,
    emoji: def.emoji,
    level: def.level,
    atk: def.atk,
    def: def.def,
    moveSpeed: def.moveSpeed,
    aggroRange: def.aggroRange,
    attackRange: def.attackRange,
    attackCooldownMs: def.attackCooldownMs,
    respawnMs: def.respawnMs,
    mapId: mapDef.id,
    spawnX,
    spawnY,
    x: spawnX,
    y: spawnY,
    hp: def.hp,
    maxHp: def.hp,
    dead: false,
    respawnAt: 0,
    targetCharacterId: null,
    lastAttackAt: 0,
  };
}

/* ---------------- NPC 與商店（純資料驅動：npcs.json 對話樹 + items.json 定義） ---------------- */
const NPCS_BY_MAP = new Map(); // mapId -> array of npc defs
for (const npc of Object.values(NPC_DEFS)) {
  if (!NPCS_BY_MAP.has(npc.mapId)) NPCS_BY_MAP.set(npc.mapId, []);
  NPCS_BY_MAP.get(npc.mapId).push(npc);
}

function npcToClient(npc) {
  return { id: npc.id, name: npc.name, emoji: npc.emoji, x: npc.x, y: npc.y, dialogue: npc.dialogue, shopItemIds: npc.shopItemIds || null };
}

function handleBuyItem(ws, msg) {
  const state = ws.playerState;
  if (!state || state.dead) return;
  const npc = NPC_DEFS[msg.npcId];
  const item = ITEM_DEFS[msg.itemId];
  if (!npc || !item || npc.mapId !== state.mapId) {
    return send(ws, { t: "buyItemResult", ok: false, error: "找不到這個商品。" });
  }
  if (!npc.shopItemIds || !npc.shopItemIds.includes(item.id)) {
    return send(ws, { t: "buyItemResult", ok: false, error: "這間店沒有賣這個。" });
  }
  if (Math.hypot(npc.x - state.x, npc.y - state.y) > INTERACT_RANGE) {
    return send(ws, { t: "buyItemResult", ok: false, error: "離 NPC 太遠了。" });
  }

  const buy = db.transaction(() => {
    const row = stmt.getGold.get(state.characterId);
    if (!row || row.gold < item.price) return null;
    const info = stmt.spendGold.run(item.price, state.characterId, item.price);
    if (info.changes === 0) return null;
    stmt.insertInventoryItem.run(state.characterId, item.id, new Date().toISOString());
    return stmt.getGold.get(state.characterId).gold;
  });
  const goldAfter = buy();
  if (goldAfter === null) {
    return send(ws, { t: "buyItemResult", ok: false, error: "金幣不足。" });
  }
  send(ws, { t: "buyItemResult", ok: true, item, gold: goldAfter });
}

function monsterToClient(m) {
  return {
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    level: m.level,
    hp: m.hp,
    maxHp: m.maxHp,
    x: Math.round(m.x),
    y: Math.round(m.y),
  };
}

function clearMonsterTarget(characterId) {
  for (const monsters of zoneMonsters.values()) {
    for (const m of monsters.values()) {
      if (m.targetCharacterId === characterId) m.targetCharacterId = null;
    }
  }
}

function calcDamage(atk, def, critRate = 0) {
  let dmg = Math.max(1, atk - def * 0.5) * (0.85 + Math.random() * 0.3);
  const crit = Math.random() * 100 < critRate;
  if (crit) dmg *= 1.5;
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}

function findNearestMonster(mapId, x, y, range) {
  const monsters = zoneMonsters.get(mapId);
  if (!monsters) return null;
  let best = null, bestDist = Infinity;
  for (const m of monsters.values()) {
    if (m.dead) continue;
    const d = Math.hypot(m.x - x, m.y - y);
    if (d <= range + MONSTER_RADIUS && d < bestDist) { best = m; bestDist = d; }
  }
  return best;
}

function killPlayer(state) {
  state.dead = true;
  state.hp = 0;
  state.respawnAt = Date.now() + RESPAWN_PLAYER_MS;
  const mapDef = MAP_DEFS[state.mapId];
  state.x = mapDef.spawn.x;
  state.y = mapDef.spawn.y;
  clearMonsterTarget(state.characterId);
  queueEvent(state.mapId, { e: "playerDied", id: state.characterId, name: state.name });
}

function respawnPlayer(state) {
  state.dead = false;
  state.hp = state.maxHp;
  state.mp = state.maxMp;
  queueEvent(state.mapId, { e: "playerRespawn", id: state.characterId, name: state.name });
}

function killMonster(m) {
  m.dead = true;
  m.hp = 0;
  m.targetCharacterId = null;
  m.respawnAt = Date.now() + m.respawnMs;
  queueEvent(m.mapId, { e: "monsterDied", id: m.id, name: m.name, x: m.x, y: m.y });
}

function handleAttack(ws) {
  attackWith(ws, null);
}
function handleSkill(ws) {
  const state = ws.playerState;
  if (!state) return;
  const skill = CLASS_DEFS[state.class] && CLASS_DEFS[state.class].skill;
  if (!skill) return;
  attackWith(ws, skill);
}

function attackWith(ws, skill) {
  const state = ws.playerState;
  if (!state || state.dead) return;
  const classDef = CLASS_DEFS[state.class];
  const now = Date.now();

  if (skill) {
    if (now - state.lastSkillAt < skill.cooldownMs) return;
    if (state.mp < skill.mpCost) return;
  } else {
    if (now - state.lastAttackAt < classDef.attackCooldownMs) return;
  }

  const range = skill ? skill.range : classDef.attackRange;
  const target = findNearestMonster(state.mapId, state.x, state.y, range);
  if (skill) { state.lastSkillAt = now; state.mp -= skill.mpCost; }
  else { state.lastAttackAt = now; }
  if (!target) return;

  const rawAtk = classDef.damageStat === "matk" ? state.matk : state.atk;
  const multiplier = skill ? skill.multiplier : 1;
  const { dmg, crit } = calcDamage(rawAtk * multiplier, target.def, state.critRate);
  target.hp = Math.max(0, target.hp - dmg);
  queueEvent(state.mapId, { e: "hit", target: "monster", id: target.id, dmg, crit, x: target.x, y: target.y });
  if (target.hp === 0) killMonster(target);
}

function broadcastToZone(mapId, obj, exceptWs) {
  const zone = zones.get(mapId);
  if (!zone) return;
  const s = JSON.stringify(obj);
  for (const state of zone.values()) {
    if (state.ws === exceptWs) continue;
    if (state.ws.readyState === 1) state.ws.send(s);
  }
}

function handleSelectCharacter(ws, msg) {
  if (!requireLogin(ws)) return send(ws, { t: "characterLoaded", ok: false, error: "請先登入。" });
  const row = stmt.getCharacter.get(Number(msg.characterId));
  if (!row || row.account_id !== ws.accountId) {
    return send(ws, { t: "characterLoaded", ok: false, error: "找不到這個角色。" });
  }
  if (isCharacterOnline(row.id)) {
    return send(ws, { t: "characterLoaded", ok: false, error: "這個角色已經在線上了，無法重複登入。" });
  }
  if (ws.playerState) leaveZone(ws); // 同一條連線切換角色時，先讓舊角色離場

  const mapDef = MAP_DEFS[row.map_id] || MAP_DEFS[DEFAULT_MAP_ID];
  const state = {
    ws,
    characterId: row.id,
    name: row.name,
    class: row.class,
    level: row.level,
    hp: row.hp,
    maxHp: row.max_hp,
    mp: row.mp,
    maxMp: row.max_mp,
    atk: row.atk,
    def: row.def,
    matk: row.matk,
    mdef: row.mdef,
    critRate: row.crit_rate,
    moveSpeed: row.move_speed,
    mapId: mapDef.id,
    x: row.pos_x,
    y: row.pos_y,
    input: { up: false, down: false, left: false, right: false },
    dead: false,
    respawnAt: 0,
    lastAttackAt: 0,
    lastSkillAt: 0,
  };
  ws.characterId = row.id;
  ws.playerState = state;
  getZone(mapDef.id).set(row.id, state);

  send(ws, { t: "characterLoaded", ok: true, character: characterToClient(row) });
  send(ws, {
    t: "zoneEnter",
    mapId: mapDef.id,
    mapName: mapDef.name,
    width: mapDef.width,
    height: mapDef.height,
    decor: mapDef.decor || [],
    players: [...getZone(mapDef.id).values()].filter((s) => s !== state).map(zonePlayerToClient),
    monsters: [...(zoneMonsters.get(mapDef.id) || new Map()).values()].filter((m) => !m.dead).map(monsterToClient),
    npcs: (NPCS_BY_MAP.get(mapDef.id) || []).map(npcToClient),
  });
  broadcastToZone(mapDef.id, { t: "zoneJoin", player: zonePlayerToClient(state) }, ws);
}

function handleInput(ws, msg) {
  const state = ws.playerState;
  if (!state) return;
  state.input = {
    up: !!msg.up,
    down: !!msg.down,
    left: !!msg.left,
    right: !!msg.right,
  };
}

wss.on("connection", (ws) => {
  ws.accountId = null;
  ws.characterId = null;
  ws.playerState = null;
  send(ws, { t: "hello", ok: true, msg: "已連上碎界伺服器。" });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.t) {
      case "ping":
        return send(ws, { t: "pong", ts: Date.now() });
      case "register":
        return handleRegister(ws, msg);
      case "login":
        return handleLogin(ws, msg);
      case "createCharacter":
        return handleCreateCharacter(ws, msg);
      case "selectCharacter":
        return handleSelectCharacter(ws, msg);
      case "input":
        return handleInput(ws, msg);
      case "attack":
        return handleAttack(ws);
      case "skill":
        return handleSkill(ws);
      case "buyItem":
        return handleBuyItem(ws, msg);
      default:
        return send(ws, { t: "error", error: `未知訊息類型：${msg.t}` });
    }
  });

  ws.on("close", () => leaveZone(ws));
});

/* ---------------- 權威移動運算（伺服器算完才是數，Client 只送方向鍵狀態） ---------------- */
setInterval(() => {
  const dt = TICK_MS / 1000;
  const now = Date.now();

  for (const [mapId, zone] of zones) {
    const mapDef = MAP_DEFS[mapId];
    if (!mapDef) continue;
    for (const state of zone.values()) {
      if (state.dead) {
        if (now >= state.respawnAt) respawnPlayer(state);
        continue;
      }
      const { up, down, left, right } = state.input;
      let dx = (right ? 1 : 0) - (left ? 1 : 0);
      let dy = (down ? 1 : 0) - (up ? 1 : 0);
      if (dx === 0 && dy === 0) continue;
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      const dist = state.moveSpeed * dt;
      state.x = Math.min(mapDef.width - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, state.x + dx * dist));
      state.y = Math.min(mapDef.height - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, state.y + dy * dist));
    }
  }

  for (const [mapId, monsters] of zoneMonsters) {
    const zone = zones.get(mapId);
    for (const m of monsters.values()) {
      if (m.dead) {
        if (now >= m.respawnAt) {
          m.dead = false;
          m.hp = m.maxHp;
          m.x = m.spawnX;
          m.y = m.spawnY;
        }
        continue;
      }
      runMonsterAi(m, zone, dt, now);
    }
  }
}, TICK_MS);

function runMonsterAi(m, zone, dt, now) {
  let target = m.targetCharacterId && zone ? zone.get(m.targetCharacterId) : null;
  if (target && (target.dead || target.mapId !== m.mapId)) target = null;

  if (!target && zone) {
    let best = null, bestDist = Infinity;
    for (const p of zone.values()) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d <= m.aggroRange && d < bestDist) { best = p; bestDist = d; }
    }
    if (best) { target = best; m.targetCharacterId = best.characterId; }
  }
  if (!target) return;

  const distFromSpawn = Math.hypot(m.x - m.spawnX, m.y - m.spawnY);
  if (distFromSpawn > MONSTER_LEASH_RANGE) {
    m.targetCharacterId = null;
    return;
  }

  const dist = Math.hypot(target.x - m.x, target.y - m.y);
  if (dist > m.attackRange) {
    const dx = (target.x - m.x) / dist;
    const dy = (target.y - m.y) / dist;
    m.x += dx * m.moveSpeed * dt;
    m.y += dy * m.moveSpeed * dt;
  } else if (now - m.lastAttackAt >= m.attackCooldownMs) {
    m.lastAttackAt = now;
    const { dmg, crit } = calcDamage(m.atk, target.def);
    target.hp = Math.max(0, target.hp - dmg);
    queueEvent(m.mapId, { e: "hit", target: "player", id: target.characterId, dmg, crit, x: target.x, y: target.y });
    if (target.hp === 0) killPlayer(target);
  }
}

/* ---------------- 區域快照廣播 ---------------- */
setInterval(() => {
  for (const [mapId, zone] of zones) {
    if (zone.size === 0) continue;
    const monsters = zoneMonsters.get(mapId);
    broadcastToZone(mapId, {
      t: "zoneState",
      mapId,
      players: [...zone.values()].map(zonePlayerToClient),
      monsters: monsters ? [...monsters.values()].filter((m) => !m.dead).map(monsterToClient) : [],
      events: eventQueues.get(mapId) || [],
    });
    eventQueues.set(mapId, []);
  }
}, BROADCAST_MS);

/* ---------------- 定期把位置/血量寫回資料庫（避免只靠斷線才存檔，中途斷電也不會全丟） ---------------- */
setInterval(() => {
  for (const zone of zones.values()) for (const state of zone.values()) persistState(state);
}, POS_SAVE_MS);

spawnMonsters();
server.listen(PORT, () => console.log(`碎界：失落王座 伺服器啟動於 http://localhost:${PORT}`));
