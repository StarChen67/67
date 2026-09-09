/* ============================================================
   tests/run.js — 執行全部測試：node bank-tycoon/tests/run.js [filter]
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./harness.js');
const filter = process.argv[2] || '';
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js') && f.includes(filter)).sort();
(async () => {
  const t0 = Date.now();
  for (const f of files) {
    const mod = require(path.join(__dirname, f));
    if (typeof mod === 'function') await mod(H);
  }
  console.log(`\n(${files.length} files, ${Date.now() - t0} ms)`);
  H.report();
})();
