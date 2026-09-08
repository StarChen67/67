/**
 * 通用工具（純函式，無副作用、無 DOM）。
 */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const round1 = (v) => Math.round(v * 10) / 10;
export const round2 = (v) => Math.round(v * 100) / 100;

export function deepClone(o) {
  return o == null ? o : JSON.parse(JSON.stringify(o));
}

/** 依權重挑選一個元素；entries 可為物件陣列（預設讀 .weight）或 {id:weight} 物件 */
export function weightedPick(rng, entries, weightOf = (e) => e.weight) {
  if (!Array.isArray(entries)) {
    const arr = Object.entries(entries).map(([k, w]) => ({ key: k, weight: w }));
    const picked = weightedPick(rng, arr);
    return picked ? picked.key : null;
  }
  let total = 0;
  for (const e of entries) total += Math.max(0, weightOf(e) || 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const e of entries) {
    r -= Math.max(0, weightOf(e) || 0);
    if (r < 0) return e;
  }
  return entries[entries.length - 1];
}

/** 由 rng 產生在此存檔內唯一的 id（前綴 + 36 進位亂數 + 遞增計數） */
let _uidCounter = 0;
export function makeUid(rng, prefix = 'i') {
  _uidCounter = (_uidCounter + 1) % 1e9;
  const r = rng ? rng.int(0, 0x7fffffff) : Math.floor(Math.random() * 0x7fffffff);
  return `${prefix}_${r.toString(36)}${_uidCounter.toString(36)}`;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`;
}

export function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'k';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function sum(arr, f = (x) => x) {
  let t = 0;
  for (const x of arr) t += f(x);
  return t;
}

export function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 遞迴檢查物件內有沒有 NaN / Infinity（測試用） */
export function findNonFinite(obj, path = '') {
  const bad = [];
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) bad.push(path || '(root)');
    return bad;
  }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) bad.push(...findNonFinite(obj[k], path ? `${path}.${k}` : k));
  }
  return bad;
}
