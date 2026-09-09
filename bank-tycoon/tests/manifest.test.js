/* bank-tycoon.html 的 <script> 順序必須與 tests/manifest.js 一致。 */
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function (H) {
  const { test, suite, assert, MANIFEST, ROOT } = H;
  suite('manifest — 載入順序');

  const html = fs.readFileSync(path.join(ROOT, '..', 'bank-tycoon.html'), 'utf8');
  const found = [];
  const re = /<script src="bank-tycoon\/([^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html))) found.push(m[1]);
  const expected = MANIFEST.engine.concat(MANIFEST.ui);

  test('HTML 的 script 順序與 manifest 完全一致', () => {
    assert.deepStrictEqual(found, expected,
      `\n  HTML:     ${found.join(', ')}\n  manifest: ${expected.join(', ')}`);
  });

  test('manifest 列出的檔案都存在', () => {
    for (const f of expected) {
      assert.ok(fs.existsSync(path.join(ROOT, f)), `缺少檔案 ${f}`);
    }
  });

  test('每個 UI 檔都是 IIFE 且掛在 BT 命名空間下', () => {
    for (const f of MANIFEST.ui) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(/\(typeof window !== 'undefined' \? window : globalThis\)/.test(src), `${f} 不是標準 IIFE`);
      assert.ok(/'use strict'/.test(src), `${f} 缺少 'use strict'`);
    }
  });

  test('引擎層完全不碰 DOM（才能在 Node 裡跑測試）', () => {
    for (const f of MANIFEST.engine) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/\bdocument\.|window\.addEventListener|localStorage\.[a-z]/.test(src.replace(/typeof localStorage/g, '')),
        `${f} 直接使用了 DOM 或 localStorage`);
    }
  });
};
