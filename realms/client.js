"use strict";

const CLASS_ICON = { warrior: "⚔️", mage: "🔮", archer: "🏹", priest: "✨", rogue: "🗡️" };
const PLAYER_RADIUS = 18;
const BROADCAST_MS = 100; // 必須跟伺服器 BROADCAST_MS 一致，用來算插值進度
const RESPAWN_SEC = 3; // 必須跟伺服器 RESPAWN_PLAYER_MS 一致

const el = (id) => document.getElementById(id);
const statusEl = el("status");
const statusText = el("statusText");

let ws = null;
let classDefs = {};
let itemDefs = {};
let myCharacters = [];
let selectedClass = null;

/* ---------------- 連線 ---------------- */
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.addEventListener("open", () => {
    statusEl.classList.add("connected");
    statusText.textContent = "已連線";
  });
  ws.addEventListener("close", () => {
    statusEl.classList.remove("connected");
    statusText.textContent = "已斷線，3 秒後重新連線…";
    setTimeout(connect, 3000);
  });
  ws.addEventListener("error", () => ws.close());
  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleMessage(msg);
  });
}

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function handleMessage(msg) {
  switch (msg.t) {
    case "hello":
      break;
    case "registerResult":
      showMsg("registerMsg", msg.ok ? "帳號建立成功，請切換到登入分頁。" : msg.error, msg.ok);
      if (msg.ok) el("registerForm").reset();
      break;
    case "loginResult":
      if (!msg.ok) return showMsg("loginMsg", msg.error, false);
      classDefs = msg.classDefs;
      myCharacters = msg.characters;
      showCharacterList();
      break;
    case "createCharacterResult":
      if (!msg.ok) return showMsg("createMsg", msg.error, false);
      myCharacters.push(msg.character);
      send({ t: "selectCharacter", characterId: msg.character.id });
      break;
    case "characterLoaded":
      if (!msg.ok) return alert(msg.error);
      World.setCharacter(msg.character);
      break;
    case "zoneEnter":
      World.enterZone(msg);
      break;
    case "zoneJoin":
      World.onPlayerJoin(msg.player);
      break;
    case "zoneLeave":
      World.onPlayerLeave(msg.characterId, msg.name);
      break;
    case "zoneState":
      World.onState(msg.players, msg.monsters, msg.events);
      break;
    case "error":
      console.error(msg.error);
      break;
  }
}

function showMsg(id, text, ok) {
  const n = el(id);
  n.textContent = text || "";
  n.className = "msg " + (ok ? "ok" : "error");
}

/* ---------------- 分頁切換：登入 / 註冊 ---------------- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isLogin = tab.dataset.tab === "login";
    el("loginForm").classList.toggle("hidden", !isLogin);
    el("registerForm").classList.toggle("hidden", isLogin);
  });
});

el("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  showMsg("loginMsg", "", true);
  send({ t: "login", username: el("loginUsername").value.trim(), password: el("loginPassword").value });
});

el("registerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  showMsg("registerMsg", "", true);
  send({ t: "register", username: el("registerUsername").value.trim(), password: el("registerPassword").value });
});

/* ---------------- 角色列表 ---------------- */
function switchPanel(id) {
  ["authCard", "charListCard", "createCard", "worldCard"].forEach((cid) => el(cid).classList.toggle("hidden", cid !== id));
  document.querySelector(".app").classList.toggle("wide", id === "worldCard");
}

function showCharacterList() {
  switchPanel("charListCard");
  const list = el("charList");
  list.innerHTML = "";
  if (myCharacters.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);font-size:13px;">這個帳號還沒有角色。</p>';
  }
  myCharacters.forEach((c) => {
    const div = document.createElement("div");
    div.className = "char-item";
    div.innerHTML = `
      <div>
        <div class="name">${CLASS_ICON[c.class] || ""} ${escapeHtml(c.name)}</div>
        <div class="meta">Lv.${c.level} ${escapeHtml(classDefs[c.class]?.name || c.class)}</div>
      </div>
      <div class="meta">${escapeHtml(c.mapId)}</div>
    `;
    div.addEventListener("click", () => send({ t: "selectCharacter", characterId: c.id }));
    list.appendChild(div);
  });
}

el("showCreateBtn").addEventListener("click", () => {
  switchPanel("createCard");
  renderClassGrid();
});
el("cancelCreateBtn").addEventListener("click", () => showCharacterList());

function renderClassGrid() {
  const grid = el("classGrid");
  grid.innerHTML = "";
  selectedClass = null;
  Object.values(classDefs).forEach((cls) => {
    const div = document.createElement("div");
    div.className = "class-opt";
    div.innerHTML = `<div class="cname">${CLASS_ICON[cls.id] || ""} ${escapeHtml(cls.name)}</div><div class="cdesc">${escapeHtml(cls.desc)}</div>`;
    div.addEventListener("click", () => {
      selectedClass = cls.id;
      grid.querySelectorAll(".class-opt").forEach((n) => n.classList.remove("selected"));
      div.classList.add("selected");
    });
    grid.appendChild(div);
  });
}

el("submitCreateBtn").addEventListener("click", () => {
  const name = el("charName").value.trim();
  if (!name) return showMsg("createMsg", "請輸入角色名稱。", false);
  if (!selectedClass) return showMsg("createMsg", "請選擇一個職業。", false);
  showMsg("createMsg", "", true);
  send({ t: "createCharacter", name, class: selectedClass });
});

el("toggleSheetBtn").addEventListener("click", () => el("sheet").classList.toggle("hidden"));

function renderSheet(c) {
  const clsName = classDefs[c.class]?.name || c.class;
  const rows = [
    ["名稱", `${CLASS_ICON[c.class] || ""} ${c.name}`],
    ["職業", clsName],
    ["等級", `Lv.${c.level}（EXP ${c.exp}）`],
    ["HP", `${c.hp} / ${c.maxHp}`],
    ["MP", `${c.mp} / ${c.maxMp}`],
    ["攻擊 / 防禦", `${c.atk} / ${c.def}`],
    ["魔攻 / 魔防", `${c.matk} / ${c.mdef}`],
    ["暴擊率", `${c.critRate}%`],
    ["移動速度", c.moveSpeed],
    ["金幣", c.gold],
    ["技能點", c.skillPoints],
    ["所在地圖", c.mapId],
  ];
  el("sheet").innerHTML = rows
    .map(([k, v]) => `<div class="row"><span class="k">${k}</span><span>${escapeHtml(String(v))}</span></div>`)
    .join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ================================================================
   World —— 階段 2：多人同步骨架
   Client 只送方向鍵狀態，實際座標由伺服器權威運算後用 zoneState 廣播回來。
   自己的角色用「本地預測＋伺服器柔性修正」讓操作有即時感，
   其他玩家用「快照間插值」讓移動看起來平滑而不是每 100ms 跳一次。
   ================================================================ */
const World = (() => {
  const canvas = el("worldCanvas");
  const ctx = canvas.getContext("2d");
  const MONSTER_RADIUS = 16;

  let me = null; // 完整角色資料（HP/MP/職業…）
  let myPos = { x: 0, y: 0 };
  let lastServerSelf = null; // {x,y} 伺服器回報的自己座標，用來柔性修正
  let map = null; // {mapId, mapName, width, height, decor}
  const remotes = new Map(); // characterId -> {name, class, level, hp, maxHp, prevX, prevY, targetX, targetY, snapAt}
  const monsters = new Map(); // id -> {name, emoji, level, hp, maxHp, prevX, prevY, targetX, targetY, snapAt}
  const floaters = []; // 浮動傷害數字 {x, y, text, color, bornAt}
  const input = { up: false, down: false, left: false, right: false };
  let lastInputSent = "";
  let lastFrameAt = 0;
  let running = false;

  function setCharacter(c) {
    me = { ...c, dead: false };
    myPos = { x: c.x, y: c.y };
    el("hudName").textContent = `${CLASS_ICON[c.class] || ""} ${c.name}　Lv.${c.level}`;
    updateHudBars();
    updateDeathOverlay();
    renderSheet(c);
  }

  function updateHudBars() {
    if (!me) return;
    el("hpFill").style.width = `${Math.max(0, (me.hp / me.maxHp) * 100)}%`;
    el("mpFill").style.width = `${Math.max(0, (me.mp / me.maxMp) * 100)}%`;
  }

  function enterZone(msg) {
    map = { mapId: msg.mapId, mapName: msg.mapName, width: msg.width, height: msg.height, decor: msg.decor || [] };
    remotes.clear();
    monsters.clear();
    const now = performance.now();
    msg.players.forEach((p) => {
      remotes.set(p.id, { ...p, prevX: p.x, prevY: p.y, targetX: p.x, targetY: p.y, snapAt: now });
    });
    (msg.monsters || []).forEach((m) => {
      monsters.set(m.id, { ...m, prevX: m.x, prevY: m.y, targetX: m.x, targetY: m.y, snapAt: now });
    });
    log(`歡迎來到${map.mapName}。`, "join");
    switchPanel("worldCard");
    if (!running) {
      running = true;
      lastFrameAt = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function onPlayerJoin(p) {
    const now = performance.now();
    remotes.set(p.id, { ...p, prevX: p.x, prevY: p.y, targetX: p.x, targetY: p.y, snapAt: now });
    log(`${p.name} 進入了${map ? map.mapName : "地圖"}。`, "join");
  }

  function onPlayerLeave(characterId, name) {
    remotes.delete(characterId);
    log(`${name} 離開了${map ? map.mapName : "地圖"}。`, "leave");
  }

  function onState(players, monsterList, events) {
    const now = performance.now();
    players.forEach((p) => {
      if (me && p.id === me.id) {
        const wasDead = me.dead;
        me.hp = p.hp;
        me.maxHp = p.maxHp;
        me.mp = p.mp;
        me.maxMp = p.maxMp;
        me.dead = p.dead;
        lastServerSelf = { x: p.x, y: p.y };
        if (!wasDead && p.dead) myPos = { x: p.x, y: p.y }; // 死亡瞬間直接貼齊重生點，不要用滑的
        updateHudBars();
        updateDeathOverlay();
        return;
      }
      const r = remotes.get(p.id);
      if (r) {
        r.prevX = interpX(r, now);
        r.prevY = interpY(r, now);
        r.targetX = p.x;
        r.targetY = p.y;
        r.snapAt = now;
        r.hp = p.hp;
        r.maxHp = p.maxHp;
        r.name = p.name;
        r.class = p.class;
        r.level = p.level;
        r.dead = p.dead;
      } else {
        remotes.set(p.id, { ...p, prevX: p.x, prevY: p.y, targetX: p.x, targetY: p.y, snapAt: now });
      }
    });

    if (monsterList) {
      const seen = new Set();
      monsterList.forEach((m) => {
        seen.add(m.id);
        const mo = monsters.get(m.id);
        if (mo) {
          mo.prevX = interpX(mo, now);
          mo.prevY = interpY(mo, now);
          mo.targetX = m.x;
          mo.targetY = m.y;
          mo.snapAt = now;
          mo.hp = m.hp;
          mo.maxHp = m.maxHp;
        } else {
          monsters.set(m.id, { ...m, prevX: m.x, prevY: m.y, targetX: m.x, targetY: m.y, snapAt: now });
        }
      });
      for (const id of [...monsters.keys()]) if (!seen.has(id)) monsters.delete(id);
    }

    (events || []).forEach(handleEvent);
  }

  function handleEvent(ev) {
    if (ev.e === "hit") {
      const pos = ev.target === "monster" ? monsters.get(ev.id) : ev.id === (me && me.id) ? { x: myPos.x, y: myPos.y } : remotes.get(ev.id);
      const x = pos ? (pos.targetX ?? pos.x) : ev.x;
      const y = pos ? (pos.targetY ?? pos.y) : ev.y;
      floaters.push({ x, y, text: String(ev.dmg), color: ev.crit ? "#ffd54f" : ev.target === "player" ? "#ff6b6b" : "#fff", bornAt: performance.now() });
    } else if (ev.e === "monsterDied") {
      log(`擊敗了 ${ev.name}！`, "join");
    } else if (ev.e === "playerDied") {
      log(`${ev.name} 被擊倒了，${RESPAWN_SEC} 秒後重生。`, "leave");
    } else if (ev.e === "playerRespawn") {
      log(`${ev.name} 重生了。`, "join");
    }
  }

  function updateDeathOverlay() {
    el("deathOverlay").classList.toggle("hidden", !me.dead);
  }

  function interpX(r, now) {
    const t = Math.min(1, (now - r.snapAt) / BROADCAST_MS);
    return r.prevX + (r.targetX - r.prevX) * t;
  }
  function interpY(r, now) {
    const t = Math.min(1, (now - r.snapAt) / BROADCAST_MS);
    return r.prevY + (r.targetY - r.prevY) * t;
  }

  function log(text, cls) {
    const panel = el("logPanel");
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = text;
    panel.appendChild(line);
    while (panel.children.length > 40) panel.removeChild(panel.firstChild);
    panel.scrollTop = panel.scrollHeight;
  }

  /* ---- 輸入：方向鍵 / WASD ---- */
  const KEY_UP = new Set(["ArrowUp", "KeyW"]);
  const KEY_DOWN = new Set(["ArrowDown", "KeyS"]);
  const KEY_LEFT = new Set(["ArrowLeft", "KeyA"]);
  const KEY_RIGHT = new Set(["ArrowRight", "KeyD"]);

  function isTypingInForm() {
    const t = document.activeElement && document.activeElement.tagName;
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
  }

  function applyKey(code, pressed) {
    if (isTypingInForm()) return false;
    let changed = false;
    if (KEY_UP.has(code)) { if (input.up !== pressed) { input.up = pressed; changed = true; } }
    else if (KEY_DOWN.has(code)) { if (input.down !== pressed) { input.down = pressed; changed = true; } }
    else if (KEY_LEFT.has(code)) { if (input.left !== pressed) { input.left = pressed; changed = true; } }
    else if (KEY_RIGHT.has(code)) { if (input.right !== pressed) { input.right = pressed; changed = true; } }
    return changed;
  }

  window.addEventListener("keydown", (e) => {
    if (!map || isTypingInForm()) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) send({ t: "attack" });
      return;
    }
    if (e.code === "KeyQ") {
      e.preventDefault();
      if (!e.repeat) send({ t: "skill" });
      return;
    }
    if (applyKey(e.code, true)) {
      e.preventDefault();
      sendInputIfChanged();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (!map) return;
    if (applyKey(e.code, false)) {
      e.preventDefault();
      sendInputIfChanged();
    }
  });
  window.addEventListener("blur", () => {
    input.up = input.down = input.left = input.right = false;
    sendInputIfChanged();
  });

  function sendInputIfChanged() {
    const key = `${input.up}${input.down}${input.left}${input.right}`;
    if (key === lastInputSent) return;
    lastInputSent = key;
    send({ t: "input", ...input });
  }

  /* ---- 渲染迴圈：本地預測自己的移動，其他人用插值 ---- */
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - lastFrameAt) / 1000);
    lastFrameAt = now;

    if (me && map && !me.dead) {
      let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        const dist = me.moveSpeed * dt;
        myPos.x = clamp(myPos.x + dx * dist, PLAYER_RADIUS, map.width - PLAYER_RADIUS);
        myPos.y = clamp(myPos.y + dy * dist, PLAYER_RADIUS, map.height - PLAYER_RADIUS);
      }
      // 柔性修正：慢慢把本地座標拉回伺服器權威座標，避免跟真實狀態脫節
      if (lastServerSelf) {
        myPos.x += (lastServerSelf.x - myPos.x) * 0.12;
        myPos.y += (lastServerSelf.y - myPos.y) * 0.12;
      }
    }

    draw(now);
    requestAnimationFrame(loop);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  const DECOR_GLYPH = { house: "🏠", tree: "🌲", well: "💧" };

  function draw(now) {
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = "#26331f";
    ctx.fillRect(0, 0, w, h);
    if (!map) return;

    const camX = clamp(myPos.x - w / 2, 0, Math.max(0, map.width - w));
    const camY = clamp(myPos.y - h / 2, 0, Math.max(0, map.height - h));

    // 地面網格
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    const grid = 80;
    for (let x = -((camX) % grid); x < w; x += grid) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = -((camY) % grid); y < h; y += grid) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // 場景裝飾
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    map.decor.forEach((d) => {
      const sx = d.x - camX, sy = d.y - camY;
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) return;
      ctx.fillText(DECOR_GLYPH[d.type] || "❔", sx, sy);
    });

    // 怪物（插值）
    monsters.forEach((m) => {
      drawMonster(m.emoji, m.name, m.level, interpX(m, now) - camX, interpY(m, now) - camY, m.hp, m.maxHp);
    });

    // 其他玩家（插值）
    remotes.forEach((r) => {
      if (r.dead) return; // 死亡中的玩家先不畫，避免看起來還在場上
      drawEntity(r.name, r.class, r.level, interpX(r, now) - camX, interpY(r, now) - camY, r.hp, r.maxHp, false);
    });

    // 自己
    if (me && !me.dead) drawEntity(me.name, me.class, me.level, myPos.x - camX, myPos.y - camY, me.hp, me.maxHp, true);

    // 浮動傷害數字
    ctx.font = "bold 15px sans-serif";
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      const age = now - f.bornAt;
      if (age > 800) { floaters.splice(i, 1); continue; }
      const t = age / 800;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x - camX, f.y - camY - 20 - t * 24);
      ctx.globalAlpha = 1;
    }
  }

  function drawMonster(emoji, name, level, sx, sy, hp, maxHp) {
    ctx.beginPath();
    ctx.arc(sx, sy, MONSTER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#7a3030";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#c96a6a";
    ctx.stroke();

    ctx.font = "15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(emoji || "", sx, sy + 5);

    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#f0c8c8";
    ctx.fillText(`${name} Lv.${level}`, sx, sy - MONSTER_RADIUS - 12);

    const barW = 30;
    ctx.fillStyle = "#000";
    ctx.fillRect(sx - barW / 2, sy - MONSTER_RADIUS - 8, barW, 4);
    ctx.fillStyle = "#c0473a";
    ctx.fillRect(sx - barW / 2, sy - MONSTER_RADIUS - 8, barW * Math.max(0, hp / maxHp), 4);
  }

  function drawEntity(name, cls, level, sx, sy, hp, maxHp, isSelf) {
    ctx.beginPath();
    ctx.arc(sx, sy, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isSelf ? "#e08a3e" : "#5aa9ff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = isSelf ? "#f0c88a" : "#bcd8ff";
    ctx.stroke();

    ctx.font = "16px sans-serif";
    ctx.fillText(CLASS_ICON[cls] || "", sx, sy + 5);

    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#ecdfc9";
    ctx.fillText(`${name} Lv.${level}`, sx, sy - PLAYER_RADIUS - 14);

    const barW = 34;
    ctx.fillStyle = "#000";
    ctx.fillRect(sx - barW / 2, sy - PLAYER_RADIUS - 10, barW, 4);
    ctx.fillStyle = "#c0473a";
    ctx.fillRect(sx - barW / 2, sy - PLAYER_RADIUS - 10, barW * Math.max(0, hp / maxHp), 4);
  }

  return { setCharacter, enterZone, onPlayerJoin, onPlayerLeave, onState };
})();

connect();
