import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });

test('purity: systems/core/data/game 不碰 DOM / localStorage', () => {
  const bad = [];
  for (const dir of ['systems', 'core', 'data', 'game']) {
    for (const f of walk(join(root, dir))) {
      if (f.endsWith('storage.js')) continue; // 唯一例外：偵測 localStorage
      const src = readFileSync(f, 'utf8');
      for (const word of ['document.', 'window.', 'localStorage', 'requestAnimationFrame']) if (src.includes(word)) bad.push(`${f}: ${word}`);
      if (/import .* from ['"].*\/ui\//.test(src)) bad.push(`${f}: imports ui/`);
    }
  }
  assert.deepEqual(bad, []);
});

test('purity: systems 不快取 state（永遠透過 this.ctx.state）', () => {
  const bad = [];
  for (const f of walk(join(root, 'systems'))) {
    const src = readFileSync(f, 'utf8');
    if (/this\.state\s*=[^=]/.test(src)) bad.push(f);
    if (/this\._state\b/.test(src)) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test('purity: 遊戲內隨機都走 rng（禁止 Math.random）', () => {
  const bad = [];
  for (const dir of ['systems', 'game', 'data']) for (const f of walk(join(root, dir))) if (readFileSync(f, 'utf8').includes('Math.random')) bad.push(f);
  assert.deepEqual(bad, []);
});
