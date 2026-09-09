/* ============================================================
   tests/harness.js — 測試載入器
   在 Node 裡建一個乾淨的 window 沙盒，依 manifest 順序載入引擎模組。
   每次 loadBT() 都是全新的 BT（registries 也重建），測試之間不互相污染。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const MANIFEST = require('./manifest.js');

function loadBT() {
  const win = { console };
  for (const f of MANIFEST.engine) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const fn = vm.compileFunction(code, ['window'], { filename: path.join(ROOT, f) });
    fn(win);
  }
  return win.BT;
}

/** 建立一個新遊戲（記憶體存檔 + 固定 seed）。 */
function newGame(opts = {}) {
  const BT = opts.BT || loadBT();
  const storage = opts.storage || BT.Save.memoryStorage();
  let t = opts.now != null ? opts.now : 1700000000000;
  const clock = () => t;
  clock.set = (v) => { t = v; };
  const game = new BT.Game({ storage, clock });
  game.newGame(opts.name || '測試銀行', opts.seed != null ? opts.seed : 12345);
  return { BT, game, storage, clock };
}

/** 給錢、升等級、蓋保全，跳過前期養成。 */
function enrich(game, opts = {}) {
  if (opts.cash != null) game.state.bank.cash = opts.cash;
  if (opts.level != null) game.state.bank.level = opts.level;
  if (opts.credit != null) game.state.bank.credit = opts.credit;
  if (opts.customers) {
    for (let i = 0; i < opts.customers; i++) game.customers.spawn(game.rng, game.state.day, opts.customerOpts || {});
  }
  if (opts.devices) {
    for (const [id, lv] of Object.entries(opts.devices)) game.state.security.devices[id] = { level: lv, cond: 100 };
  }
  return game;
}

/** 測試用：關掉隨機搶劫，隔離其他系統的驗證。 */
function disableRobbery(game) {
  game.robbery.tick = () => null;
  game.robbery.attempt = () => null;   // 事件強制觸發的搶劫也要擋掉
  return game;
}

/** 跑 n 天。 */
function run(game, n) {
  const out = [];
  for (let i = 0; i < n && !game.state.gameOver; i++) out.push(game.sim.advanceDay());
  return out;
}

/* ---------- 迷你測試框架 ---------- */
const results = { passed: 0, failed: 0, failures: [] };
async function test(name, fn) {
  try {
    await fn();
    results.passed += 1;
    console.log('  ✓ ' + name);
  } catch (e) {
    results.failed += 1;
    results.failures.push({ name, error: e });
    console.log('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n      ') : e));
  }
}
function suite(name) { console.log('\n' + name); }
function report() {
  console.log(`\n${results.passed} passed, ${results.failed} failed`);
  if (results.failed) { for (const f of results.failures) console.log(' - ' + f.name); process.exitCode = 1; }
}

module.exports = { loadBT, newGame, enrich, run, disableRobbery, test, suite, report, assert, results, ROOT, MANIFEST };
