/* 把 last-haven/ 的 ES 模組打包成單一檔案 last-haven.html。
 *
 * 為什麼需要：瀏覽器在 file:// 底下會擋掉 ES 模組（origin 為 null，CORS 直接拒絕），
 * 所以「直接用瀏覽器開啟 last-haven.html」會整頁空白。其他遊戲都是單檔 HTML，
 * 雙擊就能玩，這支腳本讓末日庇護所也一樣。
 *
 * 來源：last-haven/dev.html（開發用入口，走真正的 ES 模組，需要用 http 開）
 * 產出：last-haven.html（自帶所有 JS 與 CSS，file:// / http / GitHub Pages 都能跑）
 *
 * 用法：node scripts/build-last-haven.js
 * 時機：改過 last-haven/ 底下任何 .js 或 .css 之後。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "last-haven");
const TEMPLATE = path.join(SRC, "dev.html");
const OUT = path.join(ROOT, "last-haven.html");

const read = (p) => fs.readFileSync(p, "utf8");
const posix = (p) => p.split(path.sep).join("/");

/** 把 import 的相對路徑解析成「相對於 last-haven/」的模組 id */
function resolveId(fromId, spec) {
  if (!spec.startsWith(".")) throw new Error(`只支援相對路徑 import，收到：${spec}（來自 ${fromId}）`);
  return posix(path.normalize(path.join(path.dirname(fromId), spec)));
}

/** 取出模組對外公開的名字 */
function collectExports(src, id) {
  const names = new Set();
  const add = (n) => { if (n) names.add(n.trim()); };
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)) add(m[1]);
  for (const m of src.matchAll(/^export\s+class\s+([A-Za-z0-9_$]+)/gm)) add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}\s*;?\s*$/gm)) {
    for (const part of m[1].split(",")) {
      const [local, alias] = part.split(/\s+as\s+/).map((s) => s.trim());
      if (!local) continue;
      if (alias && alias !== local) throw new Error(`${id}：尚未支援 export 改名（${part.trim()}）`);
      add(local);
    }
  }
  if (/^export\s+default/m.test(src)) throw new Error(`${id}：尚未支援 export default`);
  return [...names];
}

/** 把一個模組轉成可以放進 __def() 的函式本體 */
function transform(src, id, onImport) {
  let out = src;

  // import { a, b } from './x.js';  →  const { a, b } = __req('x.js');
  out = out.replace(/^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm, (_, names, spec) => {
    const dep = resolveId(id, spec);
    onImport(dep);
    if (/\s+as\s+/.test(names)) throw new Error(`${id}：尚未支援 import 改名（${names.trim()}）`);
    return `const {${names}} = __req(${JSON.stringify(dep)});`;
  });

  // import * as NS from './x.js';  →  const NS = __req('x.js');
  out = out.replace(/^import\s*\*\s*as\s+([A-Za-z0-9_$]+)\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm, (_, ns, spec) => {
    const dep = resolveId(id, spec);
    onImport(dep);
    return `const ${ns} = __req(${JSON.stringify(dep)});`;
  });

  if (/^import\s/m.test(out)) throw new Error(`${id}：有無法處理的 import（可能是 default import 或副作用 import）`);

  // 拿掉宣告前的 export，並移除 export { ... };
  out = out.replace(/^export\s+(?=(?:async\s+)?function|class|const|let|var)/gm, "");
  out = out.replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, "");

  return out;
}

function bundle(entry) {
  const modules = new Map();   // id -> 轉換後的程式碼
  const visiting = new Set();

  function load(id, stack) {
    if (modules.has(id)) return;
    if (visiting.has(id)) throw new Error(`偵測到循環 import：${[...stack, id].join(" → ")}`);
    visiting.add(id);

    const file = path.join(SRC, id);
    if (!fs.existsSync(file)) throw new Error(`找不到模組 ${id}（由 ${stack[stack.length - 1] || "entry"} 引入）`);
    const src = read(file);
    const names = collectExports(src, id);
    const deps = [];
    const body = transform(src, id, (dep) => deps.push(dep));

    for (const dep of deps) load(dep, [...stack, id]);
    visiting.delete(id);

    const tail = names.length ? `\n  Object.assign(exports, { ${names.join(", ")} });\n` : "\n";
    modules.set(id, `__def(${JSON.stringify(id)}, function (exports, __req) {\n${body}${tail}});`);
  }

  load(entry, []);
  return { modules, count: modules.size };
}

function main() {
  const template = read(TEMPLATE);
  const { modules, count } = bundle("main.js");

  const runtime = `(function () {
"use strict";
// 極簡模組載入器：把原本的 ES 模組包成函式，避開 file:// 不能載入模組的限制。
var __registry = Object.create(null);
function __def(id, fn) { __registry[id] = { fn: fn, exports: null }; }
function __req(id) {
  var m = __registry[id];
  if (!m) throw new Error("missing module: " + id);
  if (!m.exports) { m.exports = {}; m.fn(m.exports, __req); }
  return m.exports;
}

${[...modules.values()].join("\n\n")}

__req("main.js");
})();`;

  // 內嵌 CSS
  let html = template.replace(/[ \t]*<link[^>]*href="([^"]+\.css)"[^>]*>\s*\n?/g, (_, href) => {
    const css = read(path.join(SRC, href.replace(/^last-haven\//, "")));
    return `<style>\n${css}</style>\n`;
  });

  // 內嵌 JS
  html = html.replace(/[ \t]*<script[^>]*type="module"[^>]*><\/script>\s*\n?/g, `<script>\n${runtime}\n</script>\n`);

  // 拿掉樣板裡只寫給開發者看的註解（標記 BUILD-STRIP）
  html = html.replace(/<!--[\s\S]*?BUILD-STRIP[\s\S]*?-->\s*\n?/g, "");

  const banner = `<!-- 這個檔案是自動產生的，請不要直接修改。\n     原始碼在 last-haven/（開發時開 last-haven/dev.html，需要用 http 伺服器）。\n     改完原始碼後執行：node scripts/build-last-haven.js -->\n`;
  html = html.replace(/^<!DOCTYPE html>\s*\n/i, `<!DOCTYPE html>\n${banner}`);

  // 保險：確認沒有殘留的模組語法或外部相依
  const scriptBody = html.slice(html.indexOf("<script>"));
  for (const bad of [/\n\s*import\s+[{*]/, /\n\s*export\s+(const|function|class|\{)/]) {
    if (bad.test(scriptBody)) throw new Error(`產出的檔案還留著模組語法：${bad}`);
  }
  if (/(src|href)="last-haven\//.test(html)) throw new Error("產出的檔案還引用了外部 last-haven/ 檔案");

  fs.writeFileSync(OUT, html);
  const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
  console.log(`Wrote ${posix(path.relative(ROOT, OUT))} — ${count} modules inlined, ${kb} KB, no external files.`);
}

main();
