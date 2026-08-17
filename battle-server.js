/* ============================================================
   星辰擂台 —— 對戰遊戲伺服器
   · HTTP 靜態:提供 battle-arena.html
   · WebSocket:帳號、金幣（每分鐘領取）、經驗值升級、
     PvE(電腦)與 PvP(配對)自動模擬對戰、前100名排行榜
   ============================================================ */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || process.env.BATTLE_PORT || 8792);
const ROOT = __dirname;
const DB = path.join(__dirname, 'battle-accounts.json');
const BATTLE_COST = 100;
const WIN_GOLD_REWARD = 250;
const WIN_XP_REWARD = 50;
const START_GOLD = 250;
const GOLD_PER_MIN = 50;
const MAX_PENDING_MIN = 1440; // 離線最多累積 24 小時份的金幣

/* ---------------- 帳號儲存 ---------------- */
let acc = {};
try { acc = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) { acc = {}; }
let dirty = false;
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  fs.writeFile(DB, JSON.stringify(acc), e => { if (e) console.error('[db]', e.message); });
}, 2000);
const saveSoon = () => { dirty = true; };

const hash = (p, s) => crypto.createHash('sha256').update(s + ':' + p).digest('hex');
const newSalt = () => crypto.randomBytes(8).toString('hex');

/* ---------------- 靜態檔 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
};
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/battle-arena.html';
  const f = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + p); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(d);
  });
});

/* ---------------- 等級 / 經驗 / 屬性 ---------------- */
function xpNeed(level) { return level * 100; }
function statsFor(level) {
  return {
    hp: 100 + (level - 1) * 20,
    atk: 10 + (level - 1) * 2,
    def: 5 + (level - 1) * 1,
    spd: 10 + (level - 1) * 1,
  };
}
function grantXp(a, xp) {
  a.xp += xp;
  let leveledUp = false;
  while (a.xp >= xpNeed(a.level)) {
    a.xp -= xpNeed(a.level);
    a.level += 1;
    leveledUp = true;
  }
  return leveledUp;
}

/* ---------------- 金幣（每分鐘可領 50） ---------------- */
function pendingGold(a) {
  const mins = Math.min(MAX_PENDING_MIN, Math.floor((Date.now() - a.lastClaim) / 60000));
  return Math.max(0, mins) * GOLD_PER_MIN;
}
function claimGold(a) {
  const mins = Math.min(MAX_PENDING_MIN, Math.floor((Date.now() - a.lastClaim) / 60000));
  if (mins <= 0) return 0;
  const g = mins * GOLD_PER_MIN;
  a.gold += g;
  a.lastClaim += mins * 60000;
  saveSoon();
  return g;
}

/* ---------------- 戰鬥模擬（伺服器仲裁，防作弊） ---------------- */
const AI_NAMES = ['地精戰士', '暗影刺客', '岩石守衛', '烈焰法師', '冰霜獵人', '荒野狼人', '毒沼巨蟒', '雷光鬥士', '幽冥騎士', '沙丘蠍王'];
function makeAiFighter(playerLevel) {
  const level = Math.max(1, playerLevel + (Math.floor(Math.random() * 3) - 1));
  const base = statsFor(level);
  const mult = 0.9 + Math.random() * 0.25;
  return {
    name: AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)],
    level,
    hp: Math.round(base.hp * mult), maxHp: Math.round(base.hp * mult),
    atk: Math.round(base.atk * mult), def: Math.round(base.def * mult), spd: Math.round(base.spd * mult),
  };
}
function makeFighter(name, level) {
  const s = statsFor(level);
  return { name, level, hp: s.hp, maxHp: s.hp, atk: s.atk, def: s.def, spd: s.spd };
}
function simulate(f1, f2) {
  const a = Object.assign({}, f1), b = Object.assign({}, f2);
  const log = [];
  let turn = 0;
  const rng = () => Math.random();
  const hit = (att, def) => {
    const crit = rng() < 0.1;
    let dmg = Math.max(1, att.atk - def.def * 0.5) * (0.85 + rng() * 0.3);
    if (crit) dmg *= 1.5;
    dmg = Math.round(dmg);
    def.hp = Math.max(0, def.hp - dmg);
    log.push({ attacker: att.name, defender: def.name, dmg, crit, hpLeft: def.hp, hpMax: def.maxHp });
  };
  while (a.hp > 0 && b.hp > 0 && turn < 40) {
    turn++;
    const aFirst = a.spd === b.spd ? rng() < 0.5 : a.spd > b.spd;
    const order = aFirst ? [a, b] : [b, a];
    hit(order[0], order[1]);
    if (order[1].hp <= 0) break;
    hit(order[1], order[0]);
  }
  let winner;
  if (a.hp <= 0 && b.hp <= 0) winner = null;
  else if (a.hp <= 0) winner = 1;
  else if (b.hp <= 0) winner = 0;
  else winner = (a.hp / a.maxHp >= b.hp / b.maxHp) ? 0 : 1;
  return { log, winner };
}

/* ---------------- Elo（僅 PvP 影響排名） ---------------- */
function expected(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }
function applyElo(winName, loseName) {
  // 落敗方沒有懲罰：只有獲勝方會提升積分，敗方積分不變
  const w = rec(winName), l = rec(loseName);
  if (!w || !l) return;
  const K = 32, ew = expected(w.rating, l.rating);
  w.rating = Math.round(w.rating + K * (1 - ew));
  w.wins = (w.wins || 0) + 1;
  l.losses = (l.losses || 0) + 1;
  saveSoon();
}
function board() {
  return Object.values(acc)
    .map(a => ({ name: a.name, level: a.level, rating: a.rating, wins: a.wins || 0, losses: a.losses || 0 }))
    .sort((x, y) => (y.rating - x.rating) || (y.level - x.level) || (y.wins - x.wins))
    .slice(0, 100);
}

/* ---------------- WS ---------------- */
const wss = new WebSocketServer({ server: srv });
const clients = new Set();
let queue = [];
const send = (ws, t, d) => { if (ws.readyState === 1) ws.send(JSON.stringify({ t, d })); };
const rec = n => acc[String(n || '').toLowerCase()];

function meState(a) {
  return {
    name: a.name, gold: a.gold, level: a.level, xp: a.xp, xpNeed: xpNeed(a.level),
    rating: a.rating, wins: a.wins || 0, losses: a.losses || 0,
    lastClaim: a.lastClaim, pending: pendingGold(a),
  };
}

function tryStartMatch() {
  while (queue.length >= 2) {
    const a = queue[0], b = queue[1];
    if (a.ws.readyState !== 1) { queue.shift(); continue; }
    if (b.ws.readyState !== 1) { queue.splice(1, 1); continue; }
    const ra = rec(a.name), rb = rec(b.name);
    if (!ra || ra.gold < BATTLE_COST) { queue.shift(); a.inQueue = false; send(a.ws, 'err', { msg: '金幣不足，已退出配對' }); continue; }
    if (!rb || rb.gold < BATTLE_COST) { queue.splice(1, 1); b.inQueue = false; send(b.ws, 'err', { msg: '金幣不足，已退出配對' }); continue; }
    queue.splice(0, 2);
    a.inQueue = false; b.inQueue = false;
    ra.gold -= BATTLE_COST; rb.gold -= BATTLE_COST;
    const fa = makeFighter(ra.name, ra.level), fb = makeFighter(rb.name, rb.level);
    const { log, winner } = simulate(fa, fb);
    // 落敗方沒有懲罰(只損失已付的對戰費用);獲勝方額外獲得金幣與經驗值
    let xpGainA = 0, xpGainB = 0, goldGainA = 0, goldGainB = 0;
    if (winner === 0) {
      xpGainA = WIN_XP_REWARD; goldGainA = WIN_GOLD_REWARD; ra.gold += WIN_GOLD_REWARD;
      applyElo(ra.name, rb.name);
    } else if (winner === 1) {
      xpGainB = WIN_XP_REWARD; goldGainB = WIN_GOLD_REWARD; rb.gold += WIN_GOLD_REWARD;
      applyElo(rb.name, ra.name);
    }
    const lvA = grantXp(ra, xpGainA), lvB = grantXp(rb, xpGainB);
    saveSoon();
    send(a.ws, 'battleResult', {
      mode: 'pvp', log, win: winner === 0, draw: winner === null,
      opponent: { name: rb.name, level: rb.level }, xpGain: xpGainA, goldGain: goldGainA, leveledUp: lvA, me: meState(ra),
    });
    send(b.ws, 'battleResult', {
      mode: 'pvp', log, win: winner === 1, draw: winner === null,
      opponent: { name: ra.name, level: ra.level }, xpGain: xpGainB, goldGain: goldGainB, leveledUp: lvB, me: meState(rb),
    });
  }
}

wss.on('connection', ws => {
  const c = { ws, name: null, inQueue: false };
  clients.add(c);

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const d = m.d || {};
    try { handle(c, m.t, d); } catch (e) { send(ws, 'err', { msg: e.message }); }
  });
  ws.on('close', () => {
    clients.delete(c);
    queue = queue.filter(x => x !== c);
  });
  send(ws, 'hello', { online: clients.size });
});

function handle(c, t, d) {
  switch (t) {
    case 'register': {
      const n = String(d.name || '').trim();
      if (!/^[\w一-龥]{2,10}$/.test(n)) return send(c.ws, 'err', { msg: '名稱需 2–10 字(中英數)' });
      if (String(d.pass || '').length < 4) return send(c.ws, 'err', { msg: '密碼至少 4 字' });
      if (rec(n)) return send(c.ws, 'err', { msg: '這個名稱已被使用' });
      const salt = newSalt();
      acc[n.toLowerCase()] = {
        name: n, salt, pw: hash(d.pass, salt),
        gold: START_GOLD, lastClaim: Date.now(),
        level: 1, xp: 0, rating: 1000, wins: 0, losses: 0,
        created: new Date().toISOString(),
      };
      saveSoon();
      c.name = n;
      send(c.ws, 'me', meState(rec(n)));
      break;
    }
    case 'login': {
      const r = rec(d.name);
      if (!r || r.pw !== hash(d.pass || '', r.salt)) return send(c.ws, 'err', { msg: '名稱或密碼錯誤' });
      for (const o of clients) if (o !== c && o.name === r.name) { o.ws.close(); }
      c.name = r.name;
      send(c.ws, 'me', meState(r));
      break;
    }
    case 'claim': {
      if (!c.name) return send(c.ws, 'err', { msg: '請先登入' });
      const r = rec(c.name);
      const gained = claimGold(r);
      send(c.ws, 'claimed', { gained, me: meState(r) });
      break;
    }
    case 'battleAI': {
      if (!c.name) return send(c.ws, 'err', { msg: '請先登入' });
      if (c.inQueue) return send(c.ws, 'err', { msg: '配對中，無法對戰電腦' });
      const r = rec(c.name);
      if (r.gold < BATTLE_COST) return send(c.ws, 'err', { msg: '金幣不足，需要 ' + BATTLE_COST + ' 金幣' });
      r.gold -= BATTLE_COST;
      const me = makeFighter(r.name, r.level);
      const ai = makeAiFighter(r.level);
      const { log, winner } = simulate(me, ai);
      // 落敗沒有懲罰(只損失已付的對戰費用);獲勝額外獲得金幣與經驗值
      let xpGain = 0, goldGain = 0;
      if (winner === 0) { xpGain = WIN_XP_REWARD; goldGain = WIN_GOLD_REWARD; r.gold += WIN_GOLD_REWARD; }
      const leveledUp = grantXp(r, xpGain);
      saveSoon();
      send(c.ws, 'battleResult', {
        mode: 'ai', log, win: winner === 0, draw: winner === null,
        opponent: { name: ai.name, level: ai.level }, xpGain, goldGain, leveledUp, me: meState(r),
      });
      break;
    }
    case 'queue': {
      if (!c.name) return send(c.ws, 'err', { msg: '請先登入' });
      if (c.inQueue) return;
      const r = rec(c.name);
      if (r.gold < BATTLE_COST) return send(c.ws, 'err', { msg: '金幣不足，需要 ' + BATTLE_COST + ' 金幣' });
      queue = queue.filter(x => x !== c && x.name !== c.name);
      queue.push(c); c.inQueue = true;
      send(c.ws, 'queued', { n: queue.length });
      tryStartMatch();
      break;
    }
    case 'cancel': {
      queue = queue.filter(x => x !== c);
      c.inQueue = false;
      send(c.ws, 'cancelled', {});
      break;
    }
    case 'board': send(c.ws, 'board', { list: board(), online: clients.size }); break;
    case 'me': {
      if (!c.name) return send(c.ws, 'err', { msg: '請先登入' });
      send(c.ws, 'me', meState(rec(c.name)));
      break;
    }
    case 'ping': send(c.ws, 'pong', { online: clients.size }); break;
  }
}

srv.listen(PORT, () => {
  console.log('★ 星辰擂台');
  console.log(`  遊戲:   http://localhost:${PORT}/`);
  console.log(`  帳號檔: ${DB}`);
});
