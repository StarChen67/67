/* ============================================================================
   無限卡牌 — Infinite Cards  v1.0 線上伺服器
   ----------------------------------------------------------------------------
   Node.js + ws（不使用大型框架），JSON 檔案持久化。
   啟動：  node cards-server.js
   瀏覽：  http://localhost:3100
   ----------------------------------------------------------------------------
   提供：帳號系統 / 雲端存檔 / 真人 PvP / 全球排行榜 / 市場 / 玩家交易 /
         陣營 / 賽季
   ==========================================================================*/
'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

/* ==========================================================================
   1. CONFIG
   ========================================================================== */
const CONFIG = {
  version: '1.1.0',
  port: Number(process.env.PORT) || 3100,
  dataFile: path.join(__dirname, 'cards-data.json'),
  clientFile: path.join(__dirname, 'infinite-cards.html'),

  saveDebounceMs: 1500,
  heartbeatMs: 30000,

  account: {
    nameMin: 2, nameMax: 12,
    passMin: 4, passMax: 64,
    startGold: 1500, startRating: 1000, startBagSize: 30,
    // 單機進度的金幣由客戶端計算後同步上來。這裡限制成長速率，
    // 讓「改前端數字 → 買光市場」不會太容易。
    // 註：這不是防作弊，真正的防作弊要把單機迴圈整個搬上伺服器。
    goldPerMinute: 50000,
    goldBurst: 200000,          // 首次同步或久未上線時的寬容額度
  },

  pvp: {
    teamSize: 5,
    turnSeconds: 30,          // 超時自動出手，避免卡住對手
    maxRounds: 40,
    matchRatingWindow: 300,   // 起始配對積分範圍
    windowGrowPerSec: 60,     // 每秒放寬
    win:  { gold:300, rating:25, exp:150 },
    lose: { gold:50,  rating:-20, exp:60  },
    cost: 100,
    // 戰鬥數值（與前端 v0.3 相同）
    atkPerPoint: 0.01, defConstant: 500, elementMult: 1.2, critMult: 2.0,
  },

  market: {
    feeRate: 0.05,            // 手續費 5%
    maxListingsPerPlayer: 20,
    minPrice: 10, maxPrice: 100000000,
    listingTtlDays: 7,
  },

  trade: {
    maxCardsPerSide: 5,
    offerTtlHours: 24,
  },

  faction: {
    createLevel: 10,
    createCost: 3000,
    nameMax: 12, descMax: 100,
    levels: [
      { level:1, cap:20, fund:0      },
      { level:2, cap:30, fund:10000  },
      { level:3, cap:40, fund:30000  },
      { level:4, cap:50, fund:80000  },
    ],
  },

  /* ---------- v1.1：陣營基地 ---------- */
  base: {
    castleBase: 100000,          // 城堡 HP = castleBase + 陣營等級加成 + 防禦塔加成
    castlePerLevel: 50000,
    maxDefenders: 10,            // 最多 10 名成員佈防，每人 5 張 → 50 張守城卡
    tower: {
      maxLevel: 10,
      costBase: 5000,            // 升級費用 = costBase × 等級（扣陣營資金）
      hpPerLevel: 10000,         // 每級為城堡增加的 HP
      reducePerLevel: 0.04,      // 每級給守城卡牌的減傷
      maxReduce: 0.40,
    },
    repairCostPerHp: 0.05,       // 修復城堡：每點 HP 花 0.05 陣營資金
  },

  /* ---------- v1.1：陣營戰 ---------- */
  war: {
    maxPlayersPerSide: 10,       // 每邊最多 10 人 × 5 張卡 = 50 vs 50
    attacksPerPlayer: 3,         // 每人每場可攻擊次數
    durationHours: 24,
    declareCost: 5000,           // 宣戰費用（扣陣營資金）
    cooldownHours: 6,            // 同一陣營兩場戰爭之間的冷卻
    maxRounds: 30,
    castleDamageRatio: 0.5,      // 突破守軍後，攻方剩餘總數值 × 此比例打進城堡
    reward: {
      winFunds: 20000, winGoldPerPlayer: 3000, winContrib: 500,
      loseFunds: 5000, loseGoldPerPlayer: 800, loseContrib: 150,
    },
  },

  /* ---------- v1.1：陣營 Boss（多人 Boss） ---------- */
  factionBoss: {
    attacksPerDay: 3,
    list: [
      { key:'gate_keeper', name:'陣營守門者', icon:'🗿', hp:2000000,   atk:12000  },
      { key:'sky_titan',   name:'蒼穹泰坦',   icon:'⛰️', hp:20000000,  atk:60000  },
      { key:'abyss_lord',  name:'深淵領主',   icon:'🕳️', hp:200000000, atk:300000 },
    ],
    hpPerFactionLevel: 0.35,     // 每級陣營讓 Boss HP +35%
    maxRounds: 25,
    // 擊殺獎勵：依傷害佔比分配
    killPool: { gold: 300000, contrib: 5000, funds: 50000 },
    participateGold: 2000,
  },

  /* ---------- v1.1：陣營商店（用貢獻度購買） ---------- */
  shop: {
    items: [
      { key:'gold_s',   name:'金幣袋（小）',   icon:'💰', cost:500,   type:'gold',  amount:10000  },
      { key:'gold_l',   name:'金幣袋（大）',   icon:'💰', cost:2000,  type:'gold',  amount:50000  },
      { key:'pack_r',   name:'稀有卡包 ×3',    icon:'🎁', cost:800,   type:'pack',  min:'rare',      count:3 },
      { key:'pack_e',   name:'史詩卡包 ×3',    icon:'🎁', cost:2500,  type:'pack',  min:'epic',      count:3 },
      { key:'pack_l',   name:'傳說卡 ×1',      icon:'🎴', cost:6000,  type:'pack',  min:'legendary', count:1 },
      { key:'pack_m',   name:'神話卡 ×1',      icon:'🌟', cost:25000, type:'pack',  min:'mythic',    count:1 },
      { key:'bag',      name:'背包擴充 +5 格', icon:'🎒', cost:3000,  type:'bag',   amount:5, max:100 },
    ],
  },

  /* ---------- v1.1：陣營每日寶箱 ---------- */
  factionChest: {
    baseGold: 2000, goldPerLevel: 1500,
    baseContrib: 50, contribPerLevel: 30,
  },

  season: {
    days: 30,
    // 賽季結束：積分向 1000 收斂，保留 30% 的超額部分
    resetKeep: 0.30,
    rewards: [                // 依名次
      { rank:1,   gold:100000 }, { rank:2, gold:60000 }, { rank:3, gold:40000 },
      { rank:10,  gold:20000 }, { rank:50, gold:8000 }, { rank:100, gold:3000 },
    ],
  },

  leaderboard: { size: 100 },

  // 稀有度 / 屬性（僅伺服器驗證用，需與前端一致）
  rarities: {
    common:{order:1,range:[50,300]}, rare:{order:2,range:[301,700]},
    epic:{order:3,range:[701,1500]}, legendary:{order:4,range:[1501,3000]},
    mythic:{order:5,range:[3001,5000]}, super_mythic:{order:6,range:[5001,8000]},
  },
  counters: { fire:'wood', wood:'water', water:'fire' },
  skills: {
    crit:{chance:0.20}, shield:{reduce:0.50}, lifesteal:{ratio:0.20},
    revive:{ratio:0.30}, combo:{chance:0.30, maxChain:2}, timestop:{},
  },
};

/* ==========================================================================
   2. 工具
   ========================================================================== */
const now      = () => Date.now();
const uid      = (p='') => p + crypto.randomBytes(8).toString('hex');
const clamp    = (v,a,b) => Math.max(a, Math.min(b, v));
const rndOf    = a => a[Math.floor(Math.random()*a.length)];
const log      = (...a) => console.log(`[${new Date().toISOString().slice(11,19)}]`, ...a);

function hashPassword(pass, salt = crypto.randomBytes(16).toString('hex')){
  const h = crypto.scryptSync(pass, salt, 32).toString('hex');
  return { salt, hash: h };
}
function verifyPassword(pass, salt, hash){
  const h = crypto.scryptSync(pass, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h,'hex'), Buffer.from(hash,'hex'));
}

/* ==========================================================================
   3. 資料層（JSON 檔案持久化）
   ========================================================================== */
const DB = {
  accounts: {},      // id -> account
  byName:   {},      // lowercase name -> id
  listings: {},      // id -> market listing
  offers:   {},      // id -> trade offer
  factions: {},      // id -> faction
  wars:     {},      // id -> 陣營戰（v1.1）
  season:   null,    // { number, startAt, endAt }
  meta:     { version: CONFIG.version, createdAt: now() },
};

function loadDB(){
  try{
    if(!fs.existsSync(CONFIG.dataFile)) { log('無現有資料檔，建立新資料庫'); return; }
    const raw = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
    Object.assign(DB, raw);
    DB.byName = {};
    for(const id in DB.accounts) DB.byName[DB.accounts[id].name.toLowerCase()] = id;
    log(`資料載入：${Object.keys(DB.accounts).length} 個帳號、` +
        `${Object.keys(DB.listings).length} 筆上架、${Object.keys(DB.factions).length} 個陣營`);
  }catch(e){
    log('⚠️ 資料載入失敗，改用空資料庫：', e.message);
  }
}
let saveTimer = null, saving = false;
function saveDB(immediate){
  if(saveTimer) clearTimeout(saveTimer);
  const doSave = () => {
    if(saving) return;
    saving = true;
    const tmp = CONFIG.dataFile + '.tmp';
    try{
      const { byName, ...persist } = DB;         // byName 可重建，不寫入
      fs.writeFileSync(tmp, JSON.stringify(persist));
      fs.renameSync(tmp, CONFIG.dataFile);       // 原子寫入，避免半個檔案
    }catch(e){ log('⚠️ 存檔失敗：', e.message); }
    saving = false;
  };
  immediate ? doSave() : (saveTimer = setTimeout(doSave, CONFIG.saveDebounceMs));
}

/* ==========================================================================
   4. 賽季
   ========================================================================== */
function ensureSeason(){
  const t = now();
  if(!DB.season){
    DB.season = { number:1, startAt:t, endAt:t + CONFIG.season.days*86400000 };
    log('賽季 1 開始');
    return;
  }
  if(t >= DB.season.endAt) endSeason();
}
function endSeason(){
  const s = DB.season;
  const ranked = Object.values(DB.accounts)
    .filter(a => a.wins + a.losses > 0)
    .sort((a,b) => b.rating - a.rating);

  ranked.forEach((a, i) => {
    const rank = i + 1;
    const tier = CONFIG.season.rewards.find(r => rank <= r.rank);
    if(tier){
      a.gold += tier.gold;
      a.mail = a.mail || [];
      a.mail.push({ id:uid('m_'), at:now(),
        title:`賽季 ${s.number} 結算`,
        body:`你在賽季 ${s.number} 排名第 ${rank} 名，獲得 ${tier.gold} 金幣。` });
    }
    a.seasonHistory = a.seasonHistory || [];
    a.seasonHistory.push({ season:s.number, rank, rating:a.rating, wins:a.seasonWins||0 });
    // 積分收斂
    a.rating = Math.round(1000 + (a.rating - 1000) * CONFIG.season.resetKeep);
    a.seasonWins = 0;
    a.rev = (a.rev||0) + 1;
  });

  DB.season = { number: s.number + 1, startAt: now(), endAt: now() + CONFIG.season.days*86400000 };
  log(`賽季 ${s.number} 結束，${ranked.length} 名玩家已結算；賽季 ${DB.season.number} 開始`);
  saveDB(true);
  broadcastAll({ t:'season_end', season:s.number, next:DB.season });
}

/* ==========================================================================
   5. 帳號
   ========================================================================== */
function newAccount(name, pass){
  const { salt, hash } = hashPassword(pass);
  const id = uid('u_');
  return {
    id, name, salt, hash,
    token: uid('t_'),
    createdAt: now(), lastSeen: now(),
    rev: 1,                                   // 伺服器端狀態版本，用來擋過期的 sync

    // 伺服器權威欄位
    gold: CONFIG.account.startGold,
    rating: CONFIG.account.startRating,
    wins: 0, losses: 0, streak: 0, bestStreak: 0, seasonWins: 0,
    factionId: null, factionContrib: 0,
    bossBest: 0,

    // 由客戶端同步的單機進度
    profile: {
      level:1, exp:0, statPoints:0,
      stats:{atk:0,hp:0,def:0,mdef:0,spd:0,con:0,luck:0},
      bagSize: CONFIG.account.startBagSize,
      drawCount:0, dexCount:0, achCount:0, trialFloor:0, title:null,
    },
    cards: [],            // 完整卡牌陣列（雲端存檔）
    team: [],
    blob: null,           // 其餘單機資料（圖鑑/成就/任務…）原樣保存
    mail: [], seasonHistory: [],
  };
}
// 對外公開的玩家資訊（不含密碼）
function publicAccount(a){
  return {
    id:a.id, name:a.name, rating:a.rating, wins:a.wins, losses:a.losses,
    streak:a.streak, bestStreak:a.bestStreak, gold:a.gold,
    level:a.profile.level, title:a.profile.title,
    dexCount:a.profile.dexCount, trialFloor:a.profile.trialFloor,
    cardCount:a.cards.length, bossBest:a.bossBest,
    factionId:a.factionId,
    factionName: a.factionId && DB.factions[a.factionId] ? DB.factions[a.factionId].name : null,
    online: !!onlineByAccount.get(a.id),
  };
}
// 回傳給本人的完整狀態
function selfState(a){
  return {
    id:a.id, name:a.name, token:a.token, rev:a.rev,
    gold:a.gold, rating:a.rating, wins:a.wins, losses:a.losses,
    streak:a.streak, bestStreak:a.bestStreak, seasonWins:a.seasonWins,
    factionId:a.factionId, factionContrib:a.factionContrib,
    profile:a.profile, cards:a.cards, team:a.team, blob:a.blob,
    mail:a.mail, seasonHistory:a.seasonHistory,
    season:DB.season,
  };
}

/* ==========================================================================
   6. 連線管理
   ========================================================================== */
const clients        = new Set();          // 所有 ws
const onlineByAccount = new Map();          // accountId -> ws

function send(ws, msg){
  if(ws && ws.readyState === 1){
    try{ ws.send(JSON.stringify(msg)); }catch(e){}
  }
}
function fail(ws, id, message){ send(ws, { t:'error', id, message }); }
function ok(ws, id, data){ send(ws, { t:'ok', id, ...data }); }
function broadcastAll(msg){ for(const ws of clients) send(ws, msg); }
function pushSelf(a){
  const ws = onlineByAccount.get(a.id);
  if(ws) send(ws, { t:'self', self:selfState(a) });
}
const accOf = ws => ws.accountId ? DB.accounts[ws.accountId] : null;

/* ==========================================================================
   7. 排行榜
   ========================================================================== */
const BOARDS = {
  rating:   { name:'排位榜',     key:a=>a.rating,             fmt:a=>a.rating },
  wealth:   { name:'財富榜',     key:a=>a.gold,               fmt:a=>a.gold },
  boss:     { name:'Boss 傷害榜', key:a=>a.bossBest,           fmt:a=>a.bossBest },
  dex:      { name:'收藏榜',     key:a=>a.profile.dexCount,   fmt:a=>a.profile.dexCount },
  streak:   { name:'連勝榜',     key:a=>a.bestStreak,         fmt:a=>a.bestStreak },
  trial:    { name:'試煉榜',     key:a=>a.profile.trialFloor, fmt:a=>a.profile.trialFloor },
};
function getLeaderboard(kind){
  const b = BOARDS[kind]; if(!b) return null;
  const rows = Object.values(DB.accounts)
    .map(a => ({ a, v: b.key(a) || 0 }))
    .filter(x => x.v > 0)
    .sort((x,y) => y.v - x.v)
    .slice(0, CONFIG.leaderboard.size)
    .map((x,i) => ({
      rank:i+1, id:x.a.id, name:x.a.name, value:x.v,
      level:x.a.profile.level, title:x.a.profile.title,
      faction: x.a.factionId && DB.factions[x.a.factionId] ? DB.factions[x.a.factionId].name : null,
      online: !!onlineByAccount.get(x.a.id),
    }));
  return { kind, name:b.name, rows };
}
function factionBoard(){
  return Object.values(DB.factions)
    .map(f => ({
      id:f.id, name:f.name, icon:f.icon, level:f.level, funds:f.funds,
      members:f.members.length, cap:factionCap(f),
      power: f.members.reduce((s,id)=> s + (DB.accounts[id]?.rating || 0), 0),
    }))
    .sort((a,b) => b.power - a.power)
    .slice(0, CONFIG.leaderboard.size)
    .map((f,i) => ({ rank:i+1, ...f }));
}

/* ==========================================================================
   8. PvP：配對 + 伺服器權威戰鬥
   ========================================================================== */
const queue   = [];                 // [{accountId, joinedAt, ws}]
const matches = new Map();          // matchId -> match

function cardValid(c){
  if(!c || typeof c !== 'object') return false;
  const R = CONFIG.rarities[c.rarity]; if(!R) return false;
  const base = Number(c.baseValue) || Number(c.maxValue) || 0;
  if(base < R.range[0] || base > R.range[1] * 1.05) return false;    // 允許些微誤差
  const plus = clamp(Number(c.plus)||0, 0, 20);
  const expect = base + Math.max(1, Math.round(base*0.08)) * plus;
  if(Math.abs((Number(c.maxValue)||0) - expect) > Math.max(2, expect*0.02)) return false;
  return true;
}
function validateTeamServer(a){
  const cards = a.team.map(id => a.cards.find(c => c.id === id)).filter(Boolean);
  if(cards.length !== CONFIG.pvp.teamSize) return { err:`隊伍必須是 ${CONFIG.pvp.teamSize} 張卡牌` };
  const myth = cards.filter(c => CONFIG.rarities[c.rarity].order >= 5).length;
  if(myth > 1) return { err:'隊伍最多只能帶 1 張神話／超神話卡' };
  for(const c of cards) if(!cardValid(c)) return { err:`卡牌資料異常：${c.name}` };
  return { cards };
}
function toUnit(c, side, idx){
  return {
    id:c.id, name:c.name, rarity:c.rarity, element:c.element, skill:c.skill||null,
    plus:c.plus||0, side, idx,
    maxHp:c.maxValue, hp:c.maxValue, alive:true,
    used:{ shield:false, revive:false, timestop:false },
  };
}
function joinQueue(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  if(queue.some(q => q.accountId === a.id)) return fail(ws, id, '已在配對佇列中');
  if(ws.matchId) return fail(ws, id, '你已在對戰中');
  const v = validateTeamServer(a);
  if(v.err) return fail(ws, id, v.err);
  if(a.gold < CONFIG.pvp.cost) return fail(ws, id, `金幣不足（需要 ${CONFIG.pvp.cost}）`);

  queue.push({ accountId:a.id, joinedAt:now(), ws });
  send(ws, { t:'queue', id, state:'waiting', size:queue.length });
  tryMatch();
}
function leaveQueue(ws, id){
  const i = queue.findIndex(q => q.ws === ws);
  if(i >= 0) queue.splice(i,1);
  send(ws, { t:'queue', id, state:'left' });
}
function tryMatch(){
  queue.sort((x,y) => (DB.accounts[x.accountId]?.rating||0) - (DB.accounts[y.accountId]?.rating||0));
  for(let i=0;i<queue.length-1;i++){
    const A = queue[i], B = queue[i+1];
    const ra = DB.accounts[A.accountId]?.rating || 0;
    const rb = DB.accounts[B.accountId]?.rating || 0;
    const waited = (now() - Math.min(A.joinedAt, B.joinedAt)) / 1000;
    const window = CONFIG.pvp.matchRatingWindow + waited * CONFIG.pvp.windowGrowPerSec;
    if(Math.abs(ra - rb) <= window){
      queue.splice(i, 2);
      startMatch(A, B);
      return tryMatch();
    }
  }
}
function startMatch(qa, qb){
  const A = DB.accounts[qa.accountId], B = DB.accounts[qb.accountId];
  if(!A || !B) return;
  const va = validateTeamServer(A), vb = validateTeamServer(B);
  if(va.err || vb.err){
    if(va.err) fail(qa.ws, null, va.err);
    if(vb.err) fail(qb.ws, null, vb.err);
    return;
  }
  A.gold -= CONFIG.pvp.cost; B.gold -= CONFIG.pvp.cost;
  A.rev++; B.rev++;

  const id = uid('m_');
  const m = {
    id,
    p: [
      { acc:A, ws:qa.ws, units: va.cards.map((c,i)=>toUnit(c,'A',i)), stats:A.profile.stats },
      { acc:B, ws:qb.ws, units: vb.cards.map((c,i)=>toUnit(c,'B',i)), stats:B.profile.stats },
    ],
    turn: (A.profile.stats.spd >= B.profile.stats.spd) ? 0 : 1,
    round: 1, over:false, log:[], skip:[false,false], timer:null, startedAt:now(),
  };
  matches.set(id, m);
  qa.ws.matchId = id; qb.ws.matchId = id;

  pushLog(m, `對戰開始　速度 ${A.profile.stats.spd} vs ${B.profile.stats.spd} → ${m.p[m.turn].acc.name} 先攻`);
  armTurnTimer(m);                                   // 先設好倒數，讓 match_start 就帶著 deadline
  m.p.forEach((side, i) => send(side.ws, {
    t:'match_start', matchId:id, you:i,
    players: m.p.map(x => ({ name:x.acc.name, rating:x.acc.rating, title:x.acc.profile.title })),
    state: matchState(m),
  }));
  log(`PvP 開始：${A.name}(${A.rating}) vs ${B.name}(${B.rating})`);
}
function matchState(m){
  return {
    round:m.round, turn:m.turn, over:m.over,
    units: m.p.map(s => s.units.map(u => ({
      name:u.name, rarity:u.rarity, element:u.element, skill:u.skill, plus:u.plus,
      hp:Math.max(0,u.hp), maxHp:u.maxHp, alive:u.alive,
      used:u.used,
    }))),
    deadline: m.deadline || 0,
  };
}
function pushLog(m, html){
  m.log.push(html);
  if(m.log.length > 300) m.log.shift();
}
function armTurnTimer(m){
  if(m.timer) clearTimeout(m.timer);
  m.deadline = now() + CONFIG.pvp.turnSeconds*1000;
  m.timer = setTimeout(() => autoPlay(m), CONFIG.pvp.turnSeconds*1000);
}
function autoPlay(m){
  if(m.over) return;
  const me = m.p[m.turn], foe = m.p[1-m.turn];
  const mine = me.units.map((u,i)=>u.alive?i:-1).filter(i=>i>=0);
  const foes = foe.units.map((u,i)=>u.alive?i:-1).filter(i=>i>=0);
  if(!mine.length || !foes.length) return checkEnd(m);
  pushLog(m, `<span class="dim">⏱️ ${me.acc.name} 超時，系統自動出手</span>`);
  doPvpAttack(m, m.turn, rndOf(mine), rndOf(foes));
}
// 傷害公式：與前端 v0.3 完全一致
function pvpDamage(atk, def, atkStats, defStats){
  const C = CONFIG.pvp;
  const base = atk.hp;
  const atkMult = 1 + (atkStats.atk||0) * C.atkPerPoint;
  const elemMult = CONFIG.counters[atk.element] === def.element ? C.elementMult : 1.0;
  const isCrit = atk.skill === 'crit' && Math.random() < CONFIG.skills.crit.chance;
  const critMult = isCrit ? C.critMult : 1.0;
  const d = defStats.def || 0;
  const defMult = 1 - d/(d + C.defConstant);
  let dmg = base * atkMult * elemMult * critMult * defMult;
  let shielded = false;
  if(def.skill === 'shield' && !def.used.shield){
    def.used.shield = true; shielded = true; dmg *= CONFIG.skills.shield.reduce;
  }
  return { dmg: Math.max(1, Math.round(dmg)), isCrit, elemMult, shielded };
}
function resolveDeath(m, u){
  if(u.skill === 'revive' && !u.used.revive){
    u.used.revive = true;
    u.hp = Math.round(u.maxHp * CONFIG.skills.revive.ratio);
    pushLog(m, `<span class="heal">✨ ${esc(u.name)} 觸發「復活」，以 ${u.hp} 數值重生</span>`);
    return;
  }
  u.hp = 0; u.alive = false;
  pushLog(m, `<span class="ko">☠ ${esc(u.name)} 倒下</span>`);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function doPvpAttack(m, side, from, to){
  const me = m.p[side], foe = m.p[1-side];
  const atk = me.units[from], def = foe.units[to];
  if(!atk || !atk.alive || !def || !def.alive) return;

  const r = pvpDamage(atk, def, me.stats, foe.stats);
  def.hp -= r.dmg;
  const tags = [
    r.isCrit ? '<span class="crit">💥爆擊</span>' : '',
    r.elemMult > 1 ? '<span class="eff">🌀剋制</span>' : '',
    r.shielded ? '<span class="eff">🛡️盾牌</span>' : '',
  ].filter(Boolean).join(' ');
  pushLog(m, `<b>${esc(atk.name)}</b> → <b>${esc(def.name)}</b>　${r.dmg} 傷害 ${tags}`);

  if(atk.skill === 'lifesteal'){
    const heal = Math.min(Math.round(atk.maxHp * CONFIG.skills.lifesteal.ratio), atk.maxHp - atk.hp);
    if(heal > 0){ atk.hp += heal; pushLog(m, `<span class="heal">🩸 ${esc(atk.name)} 吸血回復 ${heal}</span>`); }
  }
  if(def.hp <= 0) resolveDeath(m, def);

  if(atk.skill === 'timestop' && !atk.used.timestop){
    atk.used.timestop = true; m.skip[1-side] = true;
    pushLog(m, `<span class="eff">⏳ ${esc(atk.name)} 發動「時間停止」，對手跳過下一次行動</span>`);
  }
  // 連擊
  let chain = 0;
  while(atk.alive && atk.skill === 'combo' && chain < CONFIG.skills.combo.maxChain - 1 &&
        Math.random() < CONFIG.skills.combo.chance){
    const alive = foe.units.filter(u => u.alive);
    if(!alive.length) break;
    chain++;
    pushLog(m, `<span class="eff">⚡ ${esc(atk.name)} 觸發「連擊」</span>`);
    const t = rndOf(alive);
    const r2 = pvpDamage(atk, t, me.stats, foe.stats);
    t.hp -= r2.dmg;
    pushLog(m, `<b>${esc(atk.name)}</b> → <b>${esc(t.name)}</b>　${r2.dmg} 傷害 ${r2.isCrit?'<span class="crit">💥爆擊</span>':''}`);
    if(t.hp <= 0) resolveDeath(m, t);
  }

  if(checkEnd(m)) return;
  nextTurn(m);
}
function nextTurn(m){
  const other = 1 - m.turn;
  if(m.skip[other]){
    m.skip[other] = false;
    pushLog(m, `<span class="eff">⏳ ${esc(m.p[other].acc.name)} 被時間停止，跳過這次行動</span>`);
    // 回合仍留在原本的玩家
  }else{
    m.turn = other;
  }
  if(m.turn === 0) m.round++;
  if(m.round > CONFIG.pvp.maxRounds){
    const hp = m.p.map(s => s.units.reduce((t,u)=>t+Math.max(0,u.hp),0) /
                            s.units.reduce((t,u)=>t+u.maxHp,0));
    return endMatch(m, hp[0] >= hp[1] ? 0 : 1, 'timeout');
  }
  armTurnTimer(m);
  broadcastMatch(m);
}
function checkEnd(m){
  const alive = m.p.map(s => s.units.some(u => u.alive));
  if(alive[0] && alive[1]) return false;
  endMatch(m, alive[0] ? 0 : 1, 'ko');
  return true;
}
function broadcastMatch(m, extra){
  m.p.forEach(s => send(s.ws, { t:'match_state', state:matchState(m), log:m.log.slice(-12), ...extra }));
}
function endMatch(m, winner, reason){
  if(m.over) return;
  m.over = true;
  if(m.timer) clearTimeout(m.timer);
  matches.delete(m.id);

  const C = CONFIG.pvp;
  m.p.forEach((s, i) => {
    const a = s.acc, win = i === winner;
    const res = win ? C.win : C.lose;
    a.gold += res.gold;
    a.rating = Math.max(0, a.rating + res.rating);
    if(win){ a.wins++; a.seasonWins = (a.seasonWins||0)+1; a.streak++; a.bestStreak = Math.max(a.bestStreak, a.streak); }
    else   { a.losses++; a.streak = 0; }
    a.rev++;
    if(s.ws) s.ws.matchId = null;
    send(s.ws, {
      t:'match_end', win, reason,
      reward:{ gold:res.gold, rating:res.rating, exp:res.exp },
      rating:a.rating, opponent:m.p[1-i].acc.name,
      log:m.log.slice(-40),
    });
    pushSelf(a);
  });
  log(`PvP 結束：${m.p[winner].acc.name} 勝（${reason}）`);
  saveDB();
}
function forfeitMatch(ws){
  const m = matches.get(ws.matchId); if(!m) return;
  const side = m.p.findIndex(s => s.ws === ws);
  if(side < 0) return;
  pushLog(m, `<span class="ko">🏳️ ${esc(m.p[side].acc.name)} 認輸</span>`);
  endMatch(m, 1-side, 'forfeit');
}

/* ==========================================================================
   9. 市場
   ========================================================================== */
function marketList(ws, id, { cardId, price }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  price = Math.round(Number(price)||0);
  if(price < CONFIG.market.minPrice || price > CONFIG.market.maxPrice)
    return fail(ws, id, `價格需介於 ${CONFIG.market.minPrice} ~ ${CONFIG.market.maxPrice}`);
  const mine = Object.values(DB.listings).filter(l => l.sellerId === a.id).length;
  if(mine >= CONFIG.market.maxListingsPerPlayer)
    return fail(ws, id, `最多同時上架 ${CONFIG.market.maxListingsPerPlayer} 件`);

  const idx = a.cards.findIndex(c => c.id === cardId);
  if(idx < 0) return fail(ws, id, '找不到這張卡牌');
  const card = a.cards[idx];
  if(card.locked) return fail(ws, id, '已鎖定的卡牌無法上架');
  if(a.team.includes(cardId)) return fail(ws, id, '出戰隊伍中的卡牌無法上架');

  a.cards.splice(idx, 1);
  const listing = {
    id: uid('l_'), sellerId:a.id, sellerName:a.name, card,
    price, listedAt: now(), expireAt: now() + CONFIG.market.listingTtlDays*86400000,
  };
  DB.listings[listing.id] = listing;
  a.rev++;
  ok(ws, id, { listing }); pushSelf(a); saveDB();
  broadcastAll({ t:'market_dirty' });
}
function marketCancel(ws, id, { listingId }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const l = DB.listings[listingId];
  if(!l) return fail(ws, id, '找不到這筆上架');
  if(l.sellerId !== a.id) return fail(ws, id, '這不是你的上架');
  delete DB.listings[listingId];
  a.cards.push(l.card); a.rev++;
  ok(ws, id, {}); pushSelf(a); saveDB();
  broadcastAll({ t:'market_dirty' });
}
function marketBuy(ws, id, { listingId }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const l = DB.listings[listingId];
  if(!l) return fail(ws, id, '這件商品已被買走或下架');
  if(l.sellerId === a.id) return fail(ws, id, '不能購買自己的商品');
  if(a.gold < l.price) return fail(ws, id, '金幣不足');
  if(a.cards.length >= a.profile.bagSize) return fail(ws, id, '背包已滿');

  const seller = DB.accounts[l.sellerId];
  const fee = Math.round(l.price * CONFIG.market.feeRate);
  const net = l.price - fee;

  delete DB.listings[listingId];              // 先移除，避免同時被兩人買走
  a.gold -= l.price;
  a.cards.push(l.card);
  a.rev++;
  if(seller){
    seller.gold += net; seller.rev++;
    seller.mail = seller.mail || [];
    seller.mail.push({ id:uid('m_'), at:now(), title:'商品已售出',
      body:`「${l.card.name}」以 ${l.price} 金幣售出，扣除 ${(CONFIG.market.feeRate*100)}% 手續費 ${fee}，實收 ${net}。` });
    pushSelf(seller);
  }
  ok(ws, id, { card:l.card, price:l.price });
  pushSelf(a); saveDB();
  broadcastAll({ t:'market_dirty' });
}
function marketQuery(ws, id, q = {}){
  const t = now();
  let rows = Object.values(DB.listings).filter(l => l.expireAt > t);
  if(q.name)     rows = rows.filter(l => l.card.name.includes(q.name));
  if(q.rarity)   rows = rows.filter(l => l.card.rarity === q.rarity);
  if(q.element)  rows = rows.filter(l => l.card.element === q.element);
  if(q.minValue) rows = rows.filter(l => l.card.maxValue >= Number(q.minValue));
  if(q.maxPrice) rows = rows.filter(l => l.price <= Number(q.maxPrice));
  const sorters = {
    price_asc:  (a,b) => a.price - b.price,
    price_desc: (a,b) => b.price - a.price,
    value_desc: (a,b) => b.card.maxValue - a.card.maxValue,
    newest:     (a,b) => b.listedAt - a.listedAt,
  };
  rows.sort(sorters[q.sort] || sorters.price_asc);
  ok(ws, id, { listings: rows.slice(0, 100), total: rows.length, feeRate: CONFIG.market.feeRate });
}

/* ==========================================================================
   10. 玩家交易
   ========================================================================== */
function tradeOffer(ws, id, { toName, offerCards = [], offerGold = 0, requestCards = [], requestGold = 0 }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const toId = DB.byName[String(toName||'').toLowerCase()];
  if(!toId) return fail(ws, id, '找不到這位玩家');
  if(toId === a.id) return fail(ws, id, '不能和自己交易');
  const b = DB.accounts[toId];

  offerGold = Math.max(0, Math.round(Number(offerGold)||0));
  requestGold = Math.max(0, Math.round(Number(requestGold)||0));
  if(offerCards.length > CONFIG.trade.maxCardsPerSide || requestCards.length > CONFIG.trade.maxCardsPerSide)
    return fail(ws, id, `每邊最多 ${CONFIG.trade.maxCardsPerSide} 張卡牌`);
  if(offerGold > a.gold) return fail(ws, id, '你的金幣不足');
  for(const cid of offerCards){
    const c = a.cards.find(x => x.id === cid);
    if(!c) return fail(ws, id, '你沒有其中一張要給出的卡牌');
    if(c.locked) return fail(ws, id, `「${c.name}」已鎖定，無法交易`);
    if(a.team.includes(cid)) return fail(ws, id, `「${c.name}」在出戰隊伍中`);
  }
  for(const cid of requestCards){
    if(!b.cards.find(x => x.id === cid)) return fail(ws, id, '對方沒有其中一張你要求的卡牌');
  }

  const offer = {
    id: uid('o_'), fromId:a.id, fromName:a.name, toId, toName:b.name,
    offerCards, offerGold, requestCards, requestGold,
    createdAt: now(), expireAt: now() + CONFIG.trade.offerTtlHours*3600000,
    status:'pending',
  };
  DB.offers[offer.id] = offer;
  ok(ws, id, { offer });
  const bws = onlineByAccount.get(toId);
  if(bws) send(bws, { t:'trade_incoming', offer: decorateOffer(offer) });
  saveDB();
}
function decorateOffer(o){
  const from = DB.accounts[o.fromId], to = DB.accounts[o.toId];
  const pick = (acc, ids) => ids.map(id => acc?.cards.find(c => c.id === id)).filter(Boolean);
  return { ...o, offerCardData: pick(from, o.offerCards), requestCardData: pick(to, o.requestCards) };
}
function tradeList(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const t = now();
  const rows = Object.values(DB.offers)
    .filter(o => o.status === 'pending' && o.expireAt > t && (o.fromId === a.id || o.toId === a.id))
    .map(decorateOffer);
  ok(ws, id, { offers: rows });
}
function tradeRespond(ws, id, { offerId, accept }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const o = DB.offers[offerId];
  if(!o || o.status !== 'pending') return fail(ws, id, '這筆交易已失效');
  if(o.toId !== a.id) return fail(ws, id, '只有收件人可以回應');
  if(now() > o.expireAt){ o.status = 'expired'; return fail(ws, id, '這筆交易已過期'); }

  if(!accept){
    o.status = 'rejected';
    ok(ws, id, { status:'rejected' });
    const fws = onlineByAccount.get(o.fromId);
    if(fws) send(fws, { t:'trade_result', offerId, status:'rejected' });
    return saveDB();
  }

  const from = DB.accounts[o.fromId], to = a;
  if(!from) return fail(ws, id, '對方帳號不存在');
  // 成交前重新驗證雙方仍持有所有物件
  if(from.gold < o.offerGold) return fail(ws, id, '對方金幣不足，交易失敗');
  if(to.gold   < o.requestGold) return fail(ws, id, '你的金幣不足');
  const fromCards = o.offerCards.map(cid => from.cards.find(c => c.id === cid));
  const toCards   = o.requestCards.map(cid => to.cards.find(c => c.id === cid));
  if(fromCards.some(c => !c)) return fail(ws, id, '對方已不再持有部分卡牌，交易失敗');
  if(toCards.some(c => !c))   return fail(ws, id, '你已不再持有部分卡牌，交易失敗');
  if(fromCards.some(c => c.locked) || toCards.some(c => c.locked)) return fail(ws, id, '有卡牌已被鎖定');
  if(to.cards.length - toCards.length + fromCards.length > to.profile.bagSize)
    return fail(ws, id, '你的背包空間不足');
  if(from.cards.length - fromCards.length + toCards.length > from.profile.bagSize)
    return fail(ws, id, '對方背包空間不足');

  // 原子交換
  from.cards = from.cards.filter(c => !o.offerCards.includes(c.id));
  to.cards   = to.cards.filter(c => !o.requestCards.includes(c.id));
  from.team  = from.team.filter(cid => !o.offerCards.includes(cid));
  to.team    = to.team.filter(cid => !o.requestCards.includes(cid));
  from.cards.push(...toCards);
  to.cards.push(...fromCards);
  from.gold += o.requestGold - o.offerGold;
  to.gold   += o.offerGold - o.requestGold;
  from.rev++; to.rev++;
  o.status = 'accepted'; o.acceptedAt = now();

  ok(ws, id, { status:'accepted' });
  pushSelf(to); pushSelf(from);
  const fws = onlineByAccount.get(o.fromId);
  if(fws) send(fws, { t:'trade_result', offerId, status:'accepted' });
  saveDB();
}
function tradeCancel(ws, id, { offerId }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const o = DB.offers[offerId];
  if(!o || o.status !== 'pending') return fail(ws, id, '這筆交易已失效');
  if(o.fromId !== a.id) return fail(ws, id, '只有發起人可以取消');
  o.status = 'cancelled';
  ok(ws, id, {});
  saveDB();
}

/* ==========================================================================
   11. 陣營
   ========================================================================== */
const factionCap = f => (CONFIG.faction.levels.find(l => l.level === f.level) || CONFIG.faction.levels[0]).cap;

function factionCreate(ws, id, { name, icon, desc, joinType }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  if(a.factionId) return fail(ws, id, '你已經有陣營了');
  if(a.profile.level < CONFIG.faction.createLevel)
    return fail(ws, id, `需要 Lv.${CONFIG.faction.createLevel} 才能建立陣營`);
  if(a.gold < CONFIG.faction.createCost) return fail(ws, id, `需要 ${CONFIG.faction.createCost} 金幣`);
  name = String(name||'').trim().slice(0, CONFIG.faction.nameMax);
  if(!name) return fail(ws, id, '請輸入陣營名稱');
  if(Object.values(DB.factions).some(f => f.name === name)) return fail(ws, id, '這個陣營名稱已被使用');

  a.gold -= CONFIG.faction.createCost;
  const f = {
    id: uid('f_'), name, icon: String(icon||'🛡️').slice(0,4),
    desc: String(desc||'').slice(0, CONFIG.faction.descMax),
    joinType: joinType === 'approval' ? 'approval' : 'open',
    leaderId: a.id, members:[a.id], level:1, funds:0,
    createdAt: now(), applications: [],
  };
  DB.factions[f.id] = f;
  a.factionId = f.id; a.factionContrib = 0; a.rev++;
  ok(ws, id, { faction: publicFaction(f) });
  pushSelf(a); saveDB();
}
function publicFaction(f){
  return {
    id:f.id, name:f.name, icon:f.icon, desc:f.desc, joinType:f.joinType,
    level:f.level, funds:f.funds, cap:factionCap(f),
    leaderId:f.leaderId, leaderName: DB.accounts[f.leaderId]?.name || '—',
    createdAt:f.createdAt,
    members: f.members.map(id => {
      const m = DB.accounts[id]; if(!m) return null;
      return { id:m.id, name:m.name, level:m.profile.level, rating:m.rating,
               contrib:m.factionContrib||0, online:!!onlineByAccount.get(id),
               isLeader:id===f.leaderId };
    }).filter(Boolean).sort((x,y)=> y.contrib - x.contrib),
    applications: f.applications || [],
    nextLevel: CONFIG.faction.levels.find(l => l.level === f.level + 1) || null,
    // v1.1 摘要
    base: publicBase(f),
    warId: f.warId || null,
    warCooldown: f.warCooldown || 0,
    warHistory: (f.warHistory || []).slice(-10),
    bossCleared: f.bossCleared || 0,
  };
}
function factionList(ws, id){
  const rows = Object.values(DB.factions).map(f => ({
    id:f.id, name:f.name, icon:f.icon, desc:f.desc, joinType:f.joinType,
    level:f.level, funds:f.funds, members:f.members.length, cap:factionCap(f),
    leaderName: DB.accounts[f.leaderId]?.name || '—',
    power: f.members.reduce((s,mid)=> s + (DB.accounts[mid]?.rating||0), 0),
  })).sort((a,b)=> b.power - a.power);
  ok(ws, id, { factions: rows, board: factionBoard() });
}
function factionInfo(ws, id, { factionId }){
  const f = DB.factions[factionId || accOf(ws)?.factionId];
  if(!f) return fail(ws, id, '找不到陣營');
  ok(ws, id, { faction: publicFaction(f) });
}
function factionJoin(ws, id, { factionId }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  if(a.factionId) return fail(ws, id, '你已經有陣營了');
  const f = DB.factions[factionId]; if(!f) return fail(ws, id, '找不到陣營');
  if(f.members.length >= factionCap(f)) return fail(ws, id, '陣營人數已滿');
  if(f.joinType === 'approval'){
    f.applications = f.applications || [];
    if(f.applications.some(x => x.id === a.id)) return fail(ws, id, '你已提出申請，請等待審核');
    f.applications.push({ id:a.id, name:a.name, level:a.profile.level, rating:a.rating, at:now() });
    ok(ws, id, { pending:true }); return saveDB();
  }
  f.members.push(a.id);
  a.factionId = f.id; a.factionContrib = 0; a.rev++;
  ok(ws, id, { faction: publicFaction(f) });
  pushSelf(a); saveDB();
}
function factionApprove(ws, id, { applicantId, accept }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  if(f.leaderId !== a.id) return fail(ws, id, '只有會長可以審核');
  f.applications = (f.applications||[]).filter(x => {
    if(x.id !== applicantId) return true;
    if(accept && f.members.length < factionCap(f)){
      const m = DB.accounts[x.id];
      if(m && !m.factionId){ f.members.push(m.id); m.factionId = f.id; m.factionContrib = 0; m.rev++; pushSelf(m); }
    }
    return false;
  });
  ok(ws, id, { faction: publicFaction(f) }); saveDB();
}
function factionLeave(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  f.members = f.members.filter(m => m !== a.id);
  if(f.leaderId === a.id){
    if(f.members.length){
      // 會長離開 → 貢獻最高者接任
      f.leaderId = f.members.slice().sort((x,y)=>
        (DB.accounts[y]?.factionContrib||0) - (DB.accounts[x]?.factionContrib||0))[0];
    }else{
      delete DB.factions[f.id];               // 沒人了就解散
    }
  }
  a.factionId = null; a.factionContrib = 0; a.rev++;
  ok(ws, id, {}); pushSelf(a); saveDB();
}
function factionDonate(ws, id, { amount }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  amount = Math.round(Number(amount)||0);
  if(amount <= 0) return fail(ws, id, '金額需大於 0');
  if(a.gold < amount) return fail(ws, id, '金幣不足');
  a.gold -= amount; a.factionContrib = (a.factionContrib||0) + amount; a.rev++;
  f.funds += amount;
  // 資金足夠就自動升級
  let up = null;
  for(;;){
    const nx = CONFIG.faction.levels.find(l => l.level === f.level + 1);
    if(nx && f.funds >= nx.fund){ f.level = nx.level; up = nx; } else break;
  }
  ok(ws, id, { faction: publicFaction(f), levelUp: up });
  pushSelf(a); saveDB();
}

/* ==========================================================================
   11b. v1.1：卡牌產生器（伺服器端）
   陣營商店與 Boss 獎勵需要由伺服器發卡，因此這裡保留一份與前端一致的產生器。
   ========================================================================== */
const NAME_PREFIX = {
  common:['破舊的','生鏽的','流浪的','無名的','見習'],
  rare:['精良的','銳利的','堅毅的','疾風','鐵血','磐石'],
  epic:['烈焰','寒霜','雷鳴','暗影','聖光','風暴','幽冥'],
  legendary:['龍魂','神威','天啟','滅世','永夜','曦光','裁決'],
  mythic:['創世','終焉','虛空','萬象','無限'],
  super_mythic:['超越','神格','太初'],
};
const NAME_CORE = ['劍士','法師','弓手','騎士','刺客','守衛','術士','戰將','祭司','龍裔'];
const ELEMENT_KEYS = ['fire','water','wood','thunder','dark','light'];
const SKILL_POOL = {
  common:[null,null,null,'crit'],
  rare:[null,'crit','crit','shield'],
  epic:['crit','shield','lifesteal','combo'],
  legendary:['crit','shield','lifesteal','combo','revive'],
  mythic:['shield','lifesteal','combo','revive','timestop','timestop'],
  super_mythic:['revive','timestop','timestop','lifesteal','combo'],
};
const RARITY_ORDER = ['common','rare','epic','legendary','mythic'];
function makeCard(rarity){
  const R = CONFIG.rarities[rarity];
  const value = Math.floor(Math.random()*(R.range[1]-R.range[0]+1)) + R.range[0];
  return {
    id: uid('c_'), name: rndOf(NAME_PREFIX[rarity]) + rndOf(NAME_CORE), rarity,
    value, maxValue: value, baseValue: value,
    element: rndOf(ELEMENT_KEYS), skill: rndOf(SKILL_POOL[rarity]),
    plus: 0, locked: false, obtainedAt: now(),
  };
}
function grantPack(a, min, count){
  const minOrder = CONFIG.rarities[min].order;
  const pool = RARITY_ORDER.filter(r => CONFIG.rarities[r].order >= minOrder);
  const out = [];
  for(let i=0;i<count;i++){
    const c = makeCard(rndOf(pool));
    if(a.cards.length < a.profile.bagSize){ a.cards.push(c); out.push(c); }
    else { a.gold += 500; out.push({ ...c, overflow:true }); }   // 背包滿 → 折算金幣
  }
  return out;
}

/* ==========================================================================
   11c. v1.1：通用自動戰鬥（陣營戰 / 陣營 Boss 共用）
   沿用 PvP 的傷害公式，但雙方由伺服器自動操作。
   ========================================================================== */
function killUnit(u, L){
  if(u.skill === 'revive' && !u.used.revive){
    u.used.revive = true;
    u.hp = Math.round(u.maxHp * CONFIG.skills.revive.ratio);
    L.push(`<span class="heal">✨ ${esc(u.name)} 觸發「復活」</span>`);
    return false;
  }
  u.hp = 0; u.alive = false;
  L.push(`<span class="ko">☠ ${esc(u.name)} 倒下</span>`);
  return true;
}
function strike(atk, def, aStats, dStats, L, extraReduce){
  const r = pvpDamage(atk, def, aStats, dStats);
  let dmg = r.dmg;
  if(extraReduce) dmg = Math.max(1, Math.round(dmg * (1 - extraReduce)));
  def.hp -= dmg;
  L.push(`<b>${esc(atk.name)}</b> → <b>${esc(def.name)}</b>　${dmg} 傷害` +
         (r.isCrit ? ' <span class="crit">💥</span>' : '') +
         (r.elemMult > 1 ? ' <span class="eff">🌀</span>' : '') +
         (extraReduce ? ` <span class="eff">🛡️塔 -${Math.round(extraReduce*100)}%</span>` : ''));
  if(atk.skill === 'lifesteal'){
    const h = Math.min(Math.round(atk.maxHp * CONFIG.skills.lifesteal.ratio), atk.maxHp - atk.hp);
    if(h > 0) atk.hp += h;
  }
  if(def.hp <= 0) killUnit(def, L);
  return dmg;
}
// A 方（攻）vs B 方（守）自動打到一方全滅或回合上限
function autoBattle(A, B, aStats, bStats, opts = {}){
  const L = [], maxR = opts.maxRounds || 30;
  const bReduce = opts.defReduce || 0;
  let dealtToB = 0;
  for(let round = 1; round <= maxR; round++){
    if(!A.some(u=>u.alive) || !B.some(u=>u.alive)) break;
    L.push(`<span class="dim">— 第 ${round} 回合 —</span>`);
    const order = [...A, ...B].filter(u => u.alive);
    for(const u of order){
      if(!u.alive) continue;
      const isA = A.includes(u);
      const foes = (isA ? B : A).filter(x => x.alive);
      if(!foes.length) break;
      const target = foes.reduce((m,x)=> x.hp < m.hp ? x : m, foes[0]);   // 集火最弱
      const d = strike(u, target, isA ? aStats : bStats, isA ? bStats : aStats, L,
                       isA ? bReduce : 0);
      if(isA) dealtToB += d;
      // 連擊
      if(u.skill === 'combo' && Math.random() < CONFIG.skills.combo.chance){
        const al = (isA ? B : A).filter(x => x.alive);
        if(al.length){
          const d2 = strike(u, rndOf(al), isA ? aStats : bStats, isA ? bStats : aStats, L,
                            isA ? bReduce : 0);
          if(isA) dealtToB += d2;
        }
      }
    }
  }
  return { log:L, aAlive:A.filter(u=>u.alive), bAlive:B.filter(u=>u.alive), dealtToB };
}

/* ==========================================================================
   11d. v1.1：陣營基地
   ========================================================================== */
const towerReduce = f => Math.min(CONFIG.base.tower.maxReduce,
  (f.base.towerLv||0) * CONFIG.base.tower.reducePerLevel);
const castleMax = f => CONFIG.base.castleBase
  + (f.level - 1) * CONFIG.base.castlePerLevel
  + (f.base.towerLv||0) * CONFIG.base.tower.hpPerLevel;

function ensureBase(f){
  if(!f.base) f.base = { castleHp:null, towerLv:0, defenders:[], lastMax:0 };
  if(!Array.isArray(f.base.defenders)) f.base.defenders = [];
  const max = castleMax(f);
  // 注意：castleHp 為 0 代表「城堡已被打爆」，不是「尚未初始化」。
  // 用 != null 判斷，否則敗方每次查詢都會被自動補滿。
  if(f.base.castleHp == null){ f.base.castleHp = max; }
  else if(f.base.lastMax && max > f.base.lastMax){
    // 陣營升級／建塔讓上限變高時，新增的那段 HP 是「蓋好就是滿的」，
    // 否則升級完會立刻顯示成重傷狀態
    f.base.castleHp += (max - f.base.lastMax);
  }
  f.base.castleHp = Math.min(f.base.castleHp, max);
  f.base.lastMax = max;
  return f.base;
}
function publicBase(f){
  ensureBase(f);
  // 戰爭進行中時，戰損記在 war 物件裡（戰後才寫回基地），
  // 這裡直接顯示戰場上的即時城堡 HP，避免查基地看到未受損的舊值
  const w = f.warId ? DB.wars[f.warId] : null;
  const liveHp = (w && !w.over && w.dId === f.id) ? w.castleHp : f.base.castleHp;
  return {
    castleHp:liveHp, castleMax:castleMax(f), underAttack: !!(w && !w.over && w.dId === f.id),
    towerLv:f.base.towerLv||0, towerMax:CONFIG.base.tower.maxLevel,
    towerReduce:towerReduce(f),
    towerCost:(f.base.towerLv||0) >= CONFIG.base.tower.maxLevel ? null
      : CONFIG.base.tower.costBase * ((f.base.towerLv||0) + 1),
    repairCost: Math.round((castleMax(f) - liveHp) * CONFIG.base.repairCostPerHp),
    maxDefenders: CONFIG.base.maxDefenders,
    defenders: f.base.defenders.map(d => ({
      ownerId:d.ownerId, ownerName:d.ownerName, at:d.at,
      cards: d.units.map(u => ({ name:u.name, rarity:u.rarity, element:u.element,
                                 skill:u.skill, plus:u.plus, maxValue:u.maxValue })),
      power: d.units.reduce((s,u)=>s+u.maxValue, 0),
    })),
    totalDefPower: f.base.defenders.reduce((s,d)=> s + d.units.reduce((t,u)=>t+u.maxValue,0), 0),
  };
}
function baseInfo(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  ok(ws, id, { base: publicBase(f), funds: f.funds, level: f.level });
}
function baseDefend(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  if(f.warId) return fail(ws, id, '陣營戰進行中，無法變更佈防');
  const v = validateTeamServer(a);
  if(v.err) return fail(ws, id, v.err);
  ensureBase(f);
  const exist = f.base.defenders.findIndex(d => d.ownerId === a.id);
  if(exist < 0 && f.base.defenders.length >= CONFIG.base.maxDefenders)
    return fail(ws, id, `守城位已滿（${CONFIG.base.maxDefenders} 人）`);
  const entry = { ownerId:a.id, ownerName:a.name, at:now(),
                  units: v.cards.map(c => ({ ...c })) };
  if(exist >= 0) f.base.defenders[exist] = entry; else f.base.defenders.push(entry);
  ok(ws, id, { base: publicBase(f) }); saveDB();
}
function baseClear(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  if(f.warId) return fail(ws, id, '陣營戰進行中，無法撤除佈防');
  ensureBase(f);
  f.base.defenders = f.base.defenders.filter(d => d.ownerId !== a.id);
  ok(ws, id, { base: publicBase(f) }); saveDB();
}
function towerUpgrade(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  if(f.leaderId !== a.id) return fail(ws, id, '只有會長可以升級防禦塔');
  ensureBase(f);
  const lv = f.base.towerLv || 0;
  if(lv >= CONFIG.base.tower.maxLevel) return fail(ws, id, '防禦塔已滿級');
  const cost = CONFIG.base.tower.costBase * (lv + 1);
  if(f.funds < cost) return fail(ws, id, `陣營資金不足（需要 ${cost}）`);
  f.funds -= cost; f.base.towerLv = lv + 1;
  ensureBase(f);                       // 由 ensureBase 依上限差額補上新增的 HP
  ok(ws, id, { base: publicBase(f), funds:f.funds }); saveDB();
}
function castleRepair(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  ensureBase(f);
  const miss = castleMax(f) - f.base.castleHp;
  if(miss <= 0) return fail(ws, id, '城堡未受損');
  const cost = Math.round(miss * CONFIG.base.repairCostPerHp);
  if(f.funds < cost) return fail(ws, id, `陣營資金不足（需要 ${cost}）`);
  f.funds -= cost; f.base.castleHp = castleMax(f);
  ok(ws, id, { base: publicBase(f), funds:f.funds }); saveDB();
}

/* ==========================================================================
   11e. v1.1：陣營戰
   ========================================================================== */
function warOf(f){ return f && f.warId ? DB.wars[f.warId] : null; }
function publicWar(w, viewerFactionId){
  if(!w) return null;
  return {
    id:w.id, aId:w.aId, aName:w.aName, dId:w.dId, dName:w.dName,
    startAt:w.startAt, endAt:w.endAt, over:w.over, winner:w.winner,
    castleHp:w.castleHp, castleMax:w.castleMax, towerReduce:w.towerReduce,
    role: viewerFactionId === w.aId ? 'attacker' : 'defender',
    defUnits: w.defUnits.map(u => ({ owner:u.owner, name:u.name, rarity:u.rarity,
      element:u.element, skill:u.skill, hp:Math.max(0,u.hp), maxHp:u.maxHp, alive:u.alive })),
    defAlive: w.defUnits.filter(u=>u.alive).length,
    defTotal: w.defUnits.length,
    attacks: w.attacks.slice(-30),
    attacksPerPlayer: CONFIG.war.attacksPerPlayer,
    participants: Object.keys(w.attacksBy).length,
    maxPlayers: CONFIG.war.maxPlayersPerSide,
  };
}
function warDeclare(ws, id, { targetId }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  if(f.leaderId !== a.id) return fail(ws, id, '只有會長可以宣戰');
  if(f.warId) return fail(ws, id, '你的陣營已在戰爭中');
  const t = DB.factions[targetId];
  if(!t) return fail(ws, id, '找不到目標陣營');
  if(t.id === f.id) return fail(ws, id, '不能向自己宣戰');
  if(t.warId) return fail(ws, id, '對方陣營已在戰爭中');
  if(f.warCooldown && now() < f.warCooldown)
    return fail(ws, id, `冷卻中，還要 ${Math.ceil((f.warCooldown-now())/3600000)} 小時`);
  if(f.funds < CONFIG.war.declareCost) return fail(ws, id, `陣營資金不足（需要 ${CONFIG.war.declareCost}）`);
  ensureBase(t);
  if(!t.base.defenders.length) return fail(ws, id, '對方尚未佈防，無法宣戰');

  f.funds -= CONFIG.war.declareCost;
  const defUnits = [];
  t.base.defenders.forEach(d => d.units.forEach(c => {
    defUnits.push({ owner:d.ownerName, id:c.id, name:c.name, rarity:c.rarity, element:c.element,
      skill:c.skill||null, maxHp:c.maxValue, hp:c.maxValue, alive:true,
      used:{shield:false,revive:false,timestop:false} });
  }));
  const w = {
    id: uid('w_'), aId:f.id, aName:f.name, dId:t.id, dName:t.name,
    startAt: now(), endAt: now() + CONFIG.war.durationHours*3600000,
    castleHp: t.base.castleHp, castleMax: castleMax(t), towerReduce: towerReduce(t),
    defStats: { atk:0, def:0 },
    defUnits, attacks:[], attacksBy:{}, over:false, winner:null,
  };
  DB.wars[w.id] = w;
  f.warId = w.id; t.warId = w.id;
  ok(ws, id, { war: publicWar(w, f.id) });
  log(`⚔️ 陣營戰：${f.name} → ${t.name}`);
  notifyFaction(t, { t:'war_declared', war: publicWar(w, t.id) });
  saveDB();
}
function notifyFaction(f, msg){
  f.members.forEach(mid => { const ws = onlineByAccount.get(mid); if(ws) send(ws, msg); });
}
function warInfo(ws, id, d){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId];
  const w = d && d.warId ? DB.wars[d.warId] : warOf(f);
  if(!w) return ok(ws, id, { war:null,
    targets: Object.values(DB.factions).filter(x => x.id !== (f&&f.id) && !x.warId)
      .map(x => { ensureBase(x); return { id:x.id, name:x.name, icon:x.icon, level:x.level,
        members:x.members.length, defenders:x.base.defenders.length,
        castleMax:castleMax(x), power:x.members.reduce((s,m)=>s+(DB.accounts[m]?.rating||0),0) }; }),
    declareCost: CONFIG.war.declareCost });
  ok(ws, id, { war: publicWar(w, f ? f.id : null),
               myAttacks: w.attacksBy[a.id] || 0 });
}
function warAttack(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  const w = warOf(f); if(!w || w.over) return fail(ws, id, '目前沒有進行中的陣營戰');
  if(w.aId !== f.id) return fail(ws, id, '你的陣營是防守方，無法主動攻擊');
  if(now() > w.endAt){ endWar(w, 'timeout'); return fail(ws, id, '陣營戰已結束'); }
  const used = w.attacksBy[a.id] || 0;
  if(used >= CONFIG.war.attacksPerPlayer)
    return fail(ws, id, `你的攻擊次數已用完（${CONFIG.war.attacksPerPlayer} 次）`);
  if(!used && Object.keys(w.attacksBy).length >= CONFIG.war.maxPlayersPerSide)
    return fail(ws, id, `參戰人數已滿（${CONFIG.war.maxPlayersPerSide} 人）`);
  const v = validateTeamServer(a);
  if(v.err) return fail(ws, id, v.err);

  w.attacksBy[a.id] = used + 1;
  const atkUnits = v.cards.map((c,i)=>toUnit(c,'A',i));
  const wave = w.defUnits.filter(u => u.alive).slice(0, 5);      // 一次面對 5 名守軍
  let dmgUnits = 0, dmgCastle = 0, L = [];

  if(wave.length){
    const res = autoBattle(atkUnits, wave, a.profile.stats, w.defStats,
                           { defReduce: w.towerReduce, maxRounds: CONFIG.war.maxRounds });
    L = res.log; dmgUnits = res.dealtToB;
    // 全滅這一波且已無守軍 → 用剩餘戰力砸城堡
    if(!w.defUnits.some(u => u.alive)){
      const left = res.aAlive.reduce((s,u)=>s+u.hp, 0);
      dmgCastle = Math.round(left * CONFIG.war.castleDamageRatio);
      w.castleHp = Math.max(0, w.castleHp - dmgCastle);
      L.push(`<span class="crit">🏰 守軍全滅！城堡受到 ${dmgCastle} 傷害</span>`);
    }
  }else{
    const power = atkUnits.reduce((s,u)=>s+u.hp, 0);
    const mult = 1 + (a.profile.stats.atk||0) * CONFIG.pvp.atkPerPoint;
    dmgCastle = Math.round(power * mult * CONFIG.war.castleDamageRatio * (1 - w.towerReduce));
    w.castleHp = Math.max(0, w.castleHp - dmgCastle);
    L.push(`<span class="crit">🏰 無守軍阻擋，城堡直接受到 ${dmgCastle} 傷害</span>`);
  }

  w.attacks.push({ playerId:a.id, playerName:a.name, at:now(), dmgUnits, dmgCastle,
                   killed: wave.filter(u=>!u.alive).length });
  a.factionContrib = (a.factionContrib||0) + Math.round((dmgUnits + dmgCastle) / 1000);
  a.rev++;

  const finished = w.castleHp <= 0;
  if(finished) endWar(w, 'castle');
  ok(ws, id, { war: publicWar(w, f.id), log:L.slice(-60), dmgUnits, dmgCastle,
               myAttacks: w.attacksBy[a.id], finished });
  notifyFaction(DB.factions[w.dId] || {members:[]}, { t:'war_update' });
  notifyFaction(f, { t:'war_update' });
  pushSelf(a);
  saveDB();
}
function endWar(w, reason){
  if(w.over) return;
  w.over = true;
  w.winner = (reason === 'castle') ? w.aId : w.dId;
  const A = DB.factions[w.aId], D = DB.factions[w.dId];
  const R = CONFIG.war.reward;
  [[A, w.winner === w.aId], [D, w.winner === w.dId]].forEach(([f, win]) => {
    if(!f) return;
    f.funds += win ? R.winFunds : R.loseFunds;
    f.warId = null;
    f.warCooldown = now() + CONFIG.war.cooldownHours*3600000;
    f.warHistory = f.warHistory || [];
    f.warHistory.push({ at:now(), enemy: f.id === w.aId ? w.dName : w.aName,
                        role: f.id === w.aId ? '進攻' : '防守', win, reason });
    // 只發給實際參戰的人（防守方全員）
    const payees = f.id === w.aId ? Object.keys(w.attacksBy) : f.members;
    payees.forEach(pid => {
      const p = DB.accounts[pid]; if(!p) return;
      p.gold += win ? R.winGoldPerPlayer : R.loseGoldPerPlayer;
      p.factionContrib = (p.factionContrib||0) + (win ? R.winContrib : R.loseContrib);
      p.rev++;
      p.mail = p.mail || [];
      p.mail.push({ id:uid('m_'), at:now(), title:`陣營戰${win?'勝利':'結束'}`,
        body:`${w.aName} vs ${w.dName}：${win?'我方獲勝':'我方落敗'}，獲得 ${win?R.winGoldPerPlayer:R.loseGoldPerPlayer} 金幣。` });
      pushSelf(p);
    });
    notifyFaction(f, { t:'war_end', win, war: publicWar(w, f.id) });
  });
  // 防守方城堡沿用戰後狀態
  if(D){ ensureBase(D); D.base.castleHp = Math.max(0, w.castleHp); }
  log(`⚔️ 陣營戰結束：${w.aName} vs ${w.dName} → ${w.winner === w.aId ? w.aName : w.dName} 勝（${reason}）`);
  saveDB();
}

/* ==========================================================================
   11f. v1.1：陣營 Boss（多人 Boss）
   ========================================================================== */
function ensureFactionBoss(f){
  if(!f.boss || f.boss.hp <= 0){
    const idx = Math.min(CONFIG.factionBoss.list.length - 1, (f.bossCleared || 0));
    const def = CONFIG.factionBoss.list[idx];
    const scale = 1 + (f.level - 1) * CONFIG.factionBoss.hpPerFactionLevel;
    f.boss = { key:def.key, name:def.name, icon:def.icon,
      maxHp: Math.round(def.hp * scale), hp: Math.round(def.hp * scale),
      atk: def.atk, spawnAt: now(), contrib:{}, attacksBy:{}, day: todayKey() };
  }
  if(f.boss.day !== todayKey()){ f.boss.day = todayKey(); f.boss.attacksBy = {}; }  // 每日重置次數
  return f.boss;
}
const todayKey = () => new Date().toISOString().slice(0,10);
function publicFactionBoss(f, a){
  const b = ensureFactionBoss(f);
  const rank = Object.entries(b.contrib)
    .map(([pid,dmg]) => ({ name: DB.accounts[pid]?.name || '？', dmg }))
    .sort((x,y)=> y.dmg - x.dmg).slice(0, 20);
  return { name:b.name, icon:b.icon, hp:b.hp, maxHp:b.maxHp, atk:b.atk,
           cleared: f.bossCleared || 0,
           myDamage: b.contrib[a.id] || 0,
           myAttacks: b.attacksBy[a.id] || 0,
           attacksPerDay: CONFIG.factionBoss.attacksPerDay,
           totalDamage: Object.values(b.contrib).reduce((s,x)=>s+x, 0),
           rank };
}
function fbossInfo(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  ok(ws, id, { boss: publicFactionBoss(f, a) });
}
function fbossAttack(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  const b = ensureFactionBoss(f);
  const used = b.attacksBy[a.id] || 0;
  if(used >= CONFIG.factionBoss.attacksPerDay)
    return fail(ws, id, `今日攻擊次數已用完（${CONFIG.factionBoss.attacksPerDay} 次）`);
  const v = validateTeamServer(a);
  if(v.err) return fail(ws, id, v.err);

  b.attacksBy[a.id] = used + 1;
  const units = v.cards.map((c,i)=>toUnit(c,'A',i));
  const atkMult = 1 + (a.profile.stats.atk||0) * CONFIG.pvp.atkPerPoint;
  const defRed = 1 - (a.profile.stats.def||0) / ((a.profile.stats.def||0) + CONFIG.pvp.defConstant);
  const L = [];
  let dealt = 0;
  for(let r = 1; r <= CONFIG.factionBoss.maxRounds; r++){
    const alive = units.filter(u => u.alive);
    if(!alive.length || b.hp <= 0) break;
    // 我方全員攻擊 Boss
    for(const u of alive){
      const crit = u.skill === 'crit' && Math.random() < CONFIG.skills.crit.chance;
      const d = Math.max(1, Math.round(u.hp * atkMult * (crit ? CONFIG.pvp.critMult : 1)));
      b.hp = Math.max(0, b.hp - d); dealt += d;
      L.push(`<b>${esc(u.name)}</b> → 👹　${d} 傷害${crit?' <span class="crit">💥</span>':''}`);
      if(u.skill === 'lifesteal'){
        const h = Math.min(Math.round(u.maxHp*CONFIG.skills.lifesteal.ratio), u.maxHp-u.hp);
        if(h>0) u.hp += h;
      }
      if(b.hp <= 0) break;
    }
    if(b.hp <= 0) break;
    // Boss 反擊：隨機一名
    const t = rndOf(units.filter(u=>u.alive));
    if(!t) break;
    let dmg = Math.round(b.atk * defRed);
    if(t.skill === 'shield' && !t.used.shield){ t.used.shield = true; dmg = Math.round(dmg*0.5); }
    t.hp -= Math.max(1, dmg);
    L.push(`👹 → <b>${esc(t.name)}</b>　${Math.max(1,dmg)} 傷害`);
    if(t.hp <= 0) killUnit(t, L);
  }
  b.contrib[a.id] = (b.contrib[a.id] || 0) + dealt;
  a.gold += CONFIG.factionBoss.participateGold;
  a.factionContrib = (a.factionContrib||0) + Math.round(dealt / 5000);
  a.rev++;

  let killed = false, myReward = null;
  if(b.hp <= 0){
    killed = true;
    myReward = distributeFactionBossRewards(f, b);
  }
  ok(ws, id, { boss: publicFactionBoss(f, a), log:L.slice(-60), dealt, killed, reward:myReward });
  notifyFaction(f, { t:'fboss_update' });
  pushSelf(a); saveDB();
}
function distributeFactionBossRewards(f, b){
  const P0 = CONFIG.factionBoss.killPool;
  const total = Object.values(b.contrib).reduce((s,x)=>s+x, 0) || 1;
  f.funds += P0.funds;
  f.bossCleared = (f.bossCleared || 0) + 1;
  let mine = null;
  Object.entries(b.contrib).forEach(([pid, dmg]) => {
    const p = DB.accounts[pid]; if(!p) return;
    const share = dmg / total;
    const gold = Math.round(P0.gold * share), contrib = Math.round(P0.contrib * share);
    p.gold += gold; p.factionContrib = (p.factionContrib||0) + contrib; p.rev++;
    p.mail = p.mail || [];
    p.mail.push({ id:uid('m_'), at:now(), title:`${b.name} 討伐成功`,
      body:`你造成 ${dmg} 傷害（佔 ${(share*100).toFixed(1)}%），獲得 ${gold} 金幣、${contrib} 貢獻。` });
    pushSelf(p);
    mine = { gold, contrib, share };
  });
  log(`👹 ${f.name} 討伐 ${b.name} 成功（第 ${f.bossCleared} 次）`);
  f.boss = null;                                   // 下次呼叫時生出更強的 Boss
  return mine;
}

/* ==========================================================================
   11g. v1.1：陣營商店 / 每日寶箱
   ========================================================================== */
function shopList(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  if(!a.factionId) return fail(ws, id, '你沒有陣營');
  ok(ws, id, { items: CONFIG.shop.items, contrib: a.factionContrib || 0 });
}
function shopBuy(ws, id, { key }){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  const it = CONFIG.shop.items.find(x => x.key === key);
  if(!it) return fail(ws, id, '找不到這個商品');
  if((a.factionContrib||0) < it.cost) return fail(ws, id, `貢獻度不足（需要 ${it.cost}）`);

  let detail = '';
  if(it.type === 'gold'){
    a.gold += it.amount; detail = `金幣 +${it.amount}`;
  }else if(it.type === 'pack'){
    if(a.cards.length >= a.profile.bagSize) return fail(ws, id, '背包已滿');
    const got = grantPack(a, it.min, it.count);
    detail = got.map(c => c.name + (c.overflow ? '（背包滿，折 500 金）' : '')).join('、');
  }else if(it.type === 'bag'){
    if(a.profile.bagSize >= it.max) return fail(ws, id, '背包已達最大容量');
    a.profile.bagSize = Math.min(it.max, a.profile.bagSize + it.amount);
    detail = `背包容量 → ${a.profile.bagSize}`;
  }
  a.factionContrib -= it.cost;
  a.rev++;
  ok(ws, id, { item:it, detail, contrib:a.factionContrib });
  pushSelf(a); saveDB();
}
function factionChest(ws, id){
  const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
  const f = DB.factions[a.factionId]; if(!f) return fail(ws, id, '你沒有陣營');
  f.chest = f.chest || {};
  if(f.chest[a.id] === todayKey()) return fail(ws, id, '今日寶箱已領取');
  const C = CONFIG.factionChest;
  const gold = C.baseGold + (f.level - 1) * C.goldPerLevel;
  const contrib = C.baseContrib + (f.level - 1) * C.contribPerLevel;
  f.chest[a.id] = todayKey();
  a.gold += gold; a.factionContrib = (a.factionContrib||0) + contrib; a.rev++;
  ok(ws, id, { gold, contrib, contribTotal:a.factionContrib });
  pushSelf(a); saveDB();
}

/* ==========================================================================
   12. 訊息路由
   ========================================================================== */
const HANDLERS = {
  register(ws, id, d){
    const name = String(d.name||'').trim();
    const pass = String(d.pass||'');
    const A = CONFIG.account;
    if(name.length < A.nameMin || name.length > A.nameMax)
      return fail(ws, id, `名稱長度需為 ${A.nameMin}~${A.nameMax} 字`);
    if(pass.length < A.passMin || pass.length > A.passMax)
      return fail(ws, id, `密碼長度需為 ${A.passMin}~${A.passMax} 字`);
    if(DB.byName[name.toLowerCase()]) return fail(ws, id, '這個名稱已被註冊');

    const a = newAccount(name, pass);
    DB.accounts[a.id] = a; DB.byName[name.toLowerCase()] = a.id;
    bindSession(ws, a);
    ok(ws, id, { self: selfState(a) });
    log(`註冊：${name}`);
    saveDB();
  },
  login(ws, id, d){
    const name = String(d.name||'').trim();
    const aid = DB.byName[name.toLowerCase()];
    const a = aid && DB.accounts[aid];
    if(!a) return fail(ws, id, '帳號或密碼錯誤');
    let okPass = false;
    try{ okPass = verifyPassword(String(d.pass||''), a.salt, a.hash); }catch(e){ okPass = false; }
    if(!okPass) return fail(ws, id, '帳號或密碼錯誤');
    bindSession(ws, a);
    ok(ws, id, { self: selfState(a) });
    log(`登入：${a.name}`);
  },
  resume(ws, id, d){                          // 用 token 免密碼重連
    const a = Object.values(DB.accounts).find(x => x.token === d.token);
    if(!a) return fail(ws, id, '連線階段已失效，請重新登入');
    bindSession(ws, a);
    ok(ws, id, { self: selfState(a) });
  },
  logout(ws, id){
    if(ws.accountId) onlineByAccount.delete(ws.accountId);
    ws.accountId = null;
    ok(ws, id, {});
  },

  // 雲端存檔：客戶端把單機進度同步上來
  sync(ws, id, d){
    const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
    if(typeof d.rev === 'number' && d.rev !== a.rev)
      return fail(ws, id, 'STALE_REV');       // 伺服器有更新的狀態，客戶端需先套用
    const p = d.profile || {};
    a.profile = {
      level: clamp(Number(p.level)||1, 1, 9999),
      exp: Math.max(0, Number(p.exp)||0),
      statPoints: Math.max(0, Number(p.statPoints)||0),
      stats: p.stats && typeof p.stats === 'object' ? p.stats : a.profile.stats,
      bagSize: clamp(Number(p.bagSize)||30, 30, 100),
      drawCount: Math.max(0, Number(p.drawCount)||0),
      dexCount: Math.max(0, Number(p.dexCount)||0),
      achCount: Math.max(0, Number(p.achCount)||0),
      trialFloor: clamp(Number(p.trialFloor)||0, 0, 100),
      title: p.title ? String(p.title).slice(0,16) : null,
    };
    if(Array.isArray(d.cards)) a.cards = d.cards.slice(0, 200);
    if(Array.isArray(d.team))  a.team  = d.team.slice(0, 5);
    if(d.blob !== undefined)   a.blob  = d.blob;
    if(typeof d.bossBest === 'number') a.bossBest = Math.max(a.bossBest, d.bossBest);

    // 金幣：接受客戶端數值，但限制單位時間的成長上限
    let capped = false;
    if(typeof d.gold === 'number' && isFinite(d.gold)){
      const want = Math.max(0, Math.floor(d.gold));
      if(want <= a.gold){
        a.gold = want;                                  // 減少（花費）一律接受
      }else{
        const A = CONFIG.account;
        const mins = Math.max(0, (now() - (a.goldSyncAt || a.createdAt)) / 60000);
        const allow = Math.floor(A.goldBurst + mins * A.goldPerMinute);
        const gain = want - a.gold;
        if(gain <= allow) a.gold = want;
        else { a.gold += allow; capped = true;
               log(`⚠️ ${a.name} 金幣成長超過上限：要求 +${gain}，只給 +${allow}`); }
      }
      a.goldSyncAt = now();
    }
    a.lastSeen = now();
    ok(ws, id, { rev:a.rev, gold:a.gold, goldCapped:capped, rating:a.rating,
                 wins:a.wins, losses:a.losses, streak:a.streak, bestStreak:a.bestStreak });
    saveDB();
  },

  who(ws, id, d){
    const aid = DB.byName[String(d.name||'').toLowerCase()];
    const a = aid && DB.accounts[aid];
    if(!a) return fail(ws, id, '找不到這位玩家');
    ok(ws, id, { player: publicAccount(a) });
  },
  leaderboard(ws, id, d){
    const b = getLeaderboard(d.kind || 'rating');
    if(!b) return fail(ws, id, '未知的排行榜');
    const a = accOf(ws);
    let mine = null;
    if(a){
      const all = Object.values(DB.accounts).map(x=>({id:x.id, v:BOARDS[d.kind||'rating'].key(x)||0}))
        .sort((x,y)=>y.v-x.v);
      const i = all.findIndex(x => x.id === a.id);
      if(i >= 0) mine = { rank:i+1, value:all[i].v, total:all.length };
    }
    ok(ws, id, { ...b, mine, season:DB.season, boards:Object.entries(BOARDS).map(([k,v])=>({kind:k,name:v.name})) });
  },
  faction_board(ws, id){ ok(ws, id, { board: factionBoard() }); },
  online(ws, id){
    ok(ws, id, { count: onlineByAccount.size,
      players: [...onlineByAccount.keys()].map(x => DB.accounts[x]).filter(Boolean).slice(0,50).map(publicAccount) });
  },

  queue_join(ws, id){ joinQueue(ws, id); },
  queue_leave(ws, id){ leaveQueue(ws, id); },
  pvp_attack(ws, id, d){
    const m = matches.get(ws.matchId); if(!m) return fail(ws, id, '你不在對戰中');
    const side = m.p.findIndex(s => s.ws === ws);
    if(side < 0) return fail(ws, id, '你不在這場對戰中');
    if(m.turn !== side) return fail(ws, id, '還沒輪到你');
    const from = Number(d.from), to = Number(d.to);
    const atk = m.p[side].units[from], def = m.p[1-side].units[to];
    if(!atk || !atk.alive) return fail(ws, id, '這張卡已陣亡');
    if(!def || !def.alive) return fail(ws, id, '目標已陣亡');
    if(m.timer) clearTimeout(m.timer);
    doPvpAttack(m, side, from, to);
  },
  pvp_forfeit(ws){ forfeitMatch(ws); },

  market_query(ws, id, d){ marketQuery(ws, id, d); },
  market_list(ws, id, d){ marketList(ws, id, d); },
  market_cancel(ws, id, d){ marketCancel(ws, id, d); },
  market_buy(ws, id, d){ marketBuy(ws, id, d); },
  market_mine(ws, id){
    const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
    ok(ws, id, { listings: Object.values(DB.listings).filter(l => l.sellerId === a.id) });
  },

  trade_offer(ws, id, d){ tradeOffer(ws, id, d); },
  trade_list(ws, id){ tradeList(ws, id); },
  trade_respond(ws, id, d){ tradeRespond(ws, id, d); },
  trade_cancel(ws, id, d){ tradeCancel(ws, id, d); },

  faction_create(ws, id, d){ factionCreate(ws, id, d); },
  faction_list(ws, id){ factionList(ws, id); },
  faction_info(ws, id, d){ factionInfo(ws, id, d); },
  faction_join(ws, id, d){ factionJoin(ws, id, d); },
  faction_approve(ws, id, d){ factionApprove(ws, id, d); },
  faction_leave(ws, id){ factionLeave(ws, id); },
  faction_donate(ws, id, d){ factionDonate(ws, id, d); },

  /* v1.1 */
  base_info(ws, id){ baseInfo(ws, id); },
  base_defend(ws, id){ baseDefend(ws, id); },
  base_clear(ws, id){ baseClear(ws, id); },
  tower_upgrade(ws, id){ towerUpgrade(ws, id); },
  castle_repair(ws, id){ castleRepair(ws, id); },
  war_declare(ws, id, d){ warDeclare(ws, id, d); },
  war_info(ws, id, d){ warInfo(ws, id, d); },
  war_attack(ws, id){ warAttack(ws, id); },
  fboss_info(ws, id){ fbossInfo(ws, id); },
  fboss_attack(ws, id){ fbossAttack(ws, id); },
  shop_list(ws, id){ shopList(ws, id); },
  shop_buy(ws, id, d){ shopBuy(ws, id, d); },
  faction_chest(ws, id){ factionChest(ws, id); },

  mail_read(ws, id){
    const a = accOf(ws); if(!a) return fail(ws, id, '請先登入');
    ok(ws, id, { mail:a.mail || [] });
    a.mail = [];
    saveDB();
  },
  season(ws, id){ ensureSeason(); ok(ws, id, { season:DB.season }); },
  ping(ws, id){ ok(ws, id, { time:now() }); },
};

function bindSession(ws, a){
  const prev = onlineByAccount.get(a.id);
  if(prev && prev !== ws){                   // 同帳號重複登入 → 踢掉舊連線
    send(prev, { t:'kicked', reason:'帳號在其他地方登入' });
    prev.accountId = null;
    try{ prev.close(); }catch(e){}
  }
  ws.accountId = a.id;
  onlineByAccount.set(a.id, ws);
  a.lastSeen = now();
  ensureSeason();
}

/* ==========================================================================
   13. HTTP + WebSocket
   ========================================================================== */
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' };

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if(url === '/health'){
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(JSON.stringify({
      ok:true, version:CONFIG.version,
      accounts:Object.keys(DB.accounts).length, online:onlineByAccount.size,
      matches:matches.size, queue:queue.length,
      listings:Object.keys(DB.listings).length, factions:Object.keys(DB.factions).length,
      season:DB.season,
    }));
  }
  const file = (url === '/' || url === '/index.html')
    ? CONFIG.clientFile
    : path.join(__dirname, path.normalize(url).replace(/^([/\\])+/, ''));
  // 防止路徑穿越
  if(!file.startsWith(__dirname)){ res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if(err){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  clients.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
  ensureSeason();
  send(ws, { t:'hello', version:CONFIG.version, season:DB.season,
             online:onlineByAccount.size, config:{
               pvp:{ cost:CONFIG.pvp.cost, turnSeconds:CONFIG.pvp.turnSeconds,
                     win:CONFIG.pvp.win, lose:CONFIG.pvp.lose },
               market:{ feeRate:CONFIG.market.feeRate, maxListings:CONFIG.market.maxListingsPerPlayer },
               faction:{ createLevel:CONFIG.faction.createLevel, createCost:CONFIG.faction.createCost,
                         levels:CONFIG.faction.levels },
             }});

  ws.on('message', buf => {
    let msg;
    try{ msg = JSON.parse(buf.toString()); }catch(e){ return fail(ws, null, '訊息格式錯誤'); }
    const h = HANDLERS[msg.t];
    if(!h) return fail(ws, msg.id, '未知的指令：' + msg.t);
    try{ h(ws, msg.id, msg); }
    catch(e){
      log('⚠️ 處理', msg.t, '時發生錯誤：', e.message);
      fail(ws, msg.id, '伺服器錯誤：' + e.message);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    const i = queue.findIndex(q => q.ws === ws);
    if(i >= 0) queue.splice(i, 1);
    if(ws.matchId) forfeitMatch(ws);          // 斷線視同認輸，不讓對手空等
    if(ws.accountId && onlineByAccount.get(ws.accountId) === ws) onlineByAccount.delete(ws.accountId);
  });
  ws.on('error', () => {});
});

// 心跳：清掉死連線
setInterval(() => {
  for(const ws of clients){
    if(!ws.isAlive){ try{ ws.terminate(); }catch(e){} clients.delete(ws); continue; }
    ws.isAlive = false;
    try{ ws.ping(); }catch(e){}
  }
}, CONFIG.heartbeatMs);

// 定期清理過期上架與交易、檢查賽季
setInterval(() => {
  const t = now();
  let changed = false;
  for(const id in DB.listings){
    const l = DB.listings[id];
    if(l.expireAt <= t){
      const seller = DB.accounts[l.sellerId];
      if(seller){ seller.cards.push(l.card); seller.rev++;
        seller.mail = seller.mail || [];
        seller.mail.push({ id:uid('m_'), at:t, title:'上架已到期',
          body:`「${l.card.name}」未售出，已退回背包。` });
        pushSelf(seller); }
      delete DB.listings[id]; changed = true;
    }
  }
  for(const id in DB.offers){
    const o = DB.offers[id];
    if(o.status === 'pending' && o.expireAt <= t){ o.status = 'expired'; changed = true; }
  }
  // 陣營戰倒數結束 → 防守方獲勝
  for(const id in DB.wars){
    const w = DB.wars[id];
    if(!w.over && t >= w.endAt){ endWar(w, 'timeout'); changed = true; }
  }
  ensureSeason();
  if(changed) saveDB();
}, 60000);

// 配對佇列定期重試（等待越久範圍越寬）
setInterval(() => { if(queue.length >= 2) tryMatch(); }, 2000);

loadDB();
ensureSeason();
server.listen(CONFIG.port, () => {
  log(`無限卡牌 v${CONFIG.version} 線上伺服器啟動：http://localhost:${CONFIG.port}`);
  log(`賽季 ${DB.season.number}，結束於 ${new Date(DB.season.endAt).toLocaleString('zh-TW')}`);
});

process.on('SIGINT',  () => { log('收到 SIGINT，存檔後結束'); saveDB(true); process.exit(0); });
process.on('SIGTERM', () => { saveDB(true); process.exit(0); });
