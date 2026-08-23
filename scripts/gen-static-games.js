/* 產生 games-list.json：給 GitHub Pages 等純靜態環境使用的遊戲清單快照。
 * 邏輯與 platform-server.js 的 scanGames() 完全一致，只是資料來源改成
 * 「git 上已經 commit 的檔案」而不是即時掃描本機資料夾，避免把還沒 push
 * 的檔案也列進去導致連結 404。
 *
 * 用法：node scripts/gen-static-games.js
 * 時機：每次新增/調整 games-catalog.json 裡的遊戲、且要讓 GitHub Pages
 * 版本同步更新時，重新執行一次並把產生的 games-list.json 一併 commit。
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REF = process.argv[2] || "origin/master";

function gitShow(file) {
  return execSync(`git show ${REF}:${file}`, { cwd: ROOT, encoding: "utf8" });
}
function gitFileList() {
  const out = execSync(`git ls-tree -r ${REF} --name-only`, { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter((f) => /^[^/]+\.html$/i.test(f) && f.toLowerCase() !== "platform.html");
}

const PALETTE = ["#ff6b6b", "#6c5ce7", "#00b894", "#00cec9", "#e17055", "#fdcb6e", "#0984e3", "#a29bfe", "#fd79a8", "#e84393", "#55efc4", "#b388ff", "#5aa9ff", "#e8a33d", "#d14bff", "#3ddc97", "#37e6e6", "#ff9d2e", "#c85dff", "#ff5d3d"];
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const catalog = JSON.parse(gitShow("games-catalog.json"));
const files = gitFileList();

const games = files.map((f) => {
  const override = catalog.overrides && catalog.overrides[f];
  if (override) return Object.assign({ url: f }, override);

  const key = f.replace(/\.html$/i, "");
  let html = "";
  try { html = gitShow(f); } catch { html = ""; }
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

const result = [...games, ...(catalog.extra || [])];
fs.writeFileSync(path.join(ROOT, "games-list.json"), JSON.stringify(result, null, 2) + "\n");
console.log(`Wrote games-list.json with ${result.length} games (source: ${REF}).`);
