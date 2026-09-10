"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8900;
const ROOT = __dirname;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

/* ---- 在線人數統計（心跳式，session 超過 TTL 未回報即視為離線） ---- */
const HEARTBEAT_TTL_MS = 20000;
const sessions = new Map(); // sessionId -> { game, ts }

function computeStats() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.ts > HEARTBEAT_TTL_MS) sessions.delete(id);
  }
  const byGame = {};
  for (const s of sessions.values()) byGame[s.game] = (byGame[s.game] || 0) + 1;
  return { total: sessions.size, byGame };
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e5) req.destroy();
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

/* ---- 遊戲清單自動上架 ----
   啟動時掃描根目錄所有 .html 檔案，不需要手動編輯 platform.html：
   - games-catalog.json 的 overrides 提供精選標題/說明/圖示/顏色（既有遊戲都在這裡維護）
   - 找不到 override 的新檔案，改抓 <title>、掃描 new WebSocket( 判斷單機/連線，
     並用檔名雜湊挑一個固定色票顏色，自動生成合理預設值
   - games-catalog.json 的 extra 放沒有根目錄檔案、只存在於子資料夾或遠端部署的項目（tamer、mmo） */
const CATALOG_FILE = path.join(ROOT, "games-catalog.json");
// platform.html 是大廳本身，index.html 只是導向大廳的首頁，兩個都不是遊戲
const EXCLUDE_FILES = new Set(["platform.html", "index.html"]);
const PALETTE = ["#ff6b6b","#6c5ce7","#00b894","#00cec9","#e17055","#fdcb6e","#0984e3","#a29bfe","#fd79a8","#e84393","#55efc4","#b388ff","#5aa9ff","#e8a33d","#d14bff","#3ddc97","#37e6e6","#ff9d2e","#c85dff","#ff5d3d"];

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function loadCatalog() {
  try {
    return JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
  } catch {
    return { overrides: {}, extra: [] };
  }
}

function scanGames() {
  const catalog = loadCatalog();
  let files = [];
  try {
    files = fs.readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".html") && !EXCLUDE_FILES.has(f) && fs.statSync(path.join(ROOT, f)).isFile());
  } catch {
    files = [];
  }

  const games = files.map((f) => {
    const override = catalog.overrides && catalog.overrides[f];
    if (override) return Object.assign({ url: f }, override);

    const key = f.replace(/\.html$/i, "");
    let html = "";
    try { html = fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { html = ""; }

    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].trim() : key;
    const isMulti = /new\s+WebSocket\s*\(/i.test(html);

    return {
      key,
      title: rawTitle.split(/[·|\-—]/)[0].trim() || key,
      sub: rawTitle,
      emoji: "🎮",
      accent: hashColor(key),
      desc: `${rawTitle}，點擊立即遊玩。`,
      tag: isMulti ? "multi" : "single",
      url: f,
    };
  });

  return [...games, ...(catalog.extra || [])];
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  if (url.startsWith("/api/")) {
    // 允許 GitHub Pages 等不同來源的靜態頁面跨網域打這幾支 API
    // （platform.html 部署在 GitHub Pages，但這支伺服器另外跑在 Render 上）
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  }

  if (url === "/api/games" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(scanGames()));
    return;
  }

  if (url === "/api/heartbeat" && req.method === "POST") {
    const body = await readJsonBody(req);
    const sessionId = String(body.sessionId || "").slice(0, 64);
    const game = String(body.game || "lobby").slice(0, 64);
    if (sessionId) sessions.set(sessionId, { game, ts: Date.now() });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(computeStats()));
    return;
  }

  if (url === "/api/leave" && req.method === "POST") {
    const body = await readJsonBody(req);
    sessions.delete(String(body.sessionId || ""));
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === "/api/stats" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(computeStats()));
    return;
  }

  let file = url;
  if (file === "/") file = "/platform.html";
  const fp = path.join(ROOT, path.normalize(decodeURIComponent(file)).replace(/^(\.\.[\/\\])+/, ""));
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(buf);
  });
});

server.listen(PORT, () => console.log(`platform server on http://localhost:${PORT}`));
