/* ============================================================
   銀行大亨 Bank Tycoon — core/util.js
   純函式工具：數學、亂數（可重現）、格式化、事件匯流排。
   這一層不依賴任何遊戲系統。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = (root.BT = root.BT || {});
  const U = (BT.util = {});

  /* ---------------- 數學 ---------------- */
  U.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.round = (v, digits = 0) => {
    const m = Math.pow(10, digits);
    return Math.round(v * m) / m;
  };
  U.sum = (arr, fn) => arr.reduce((a, x) => a + (fn ? fn(x) : x), 0);
  /** 金額一律整數元，避免浮點誤差累積成帳目對不上。 */
  U.money = (v) => {
    if (!isFinite(v)) return 0;
    return Math.round(v);
  };
  /** 依小數部分機率進位：3.4 → 60% 得 3、40% 得 4。 */
  U.probRound = (v, rng) => {
    const f = Math.floor(v);
    return f + ((rng ? rng() : Math.random()) < v - f ? 1 : 0);
  };
  /**
   * 分段線性內插。points = [[x, y], ...]（x 遞增）。
   * 超出範圍時取端點值。用於「現金 → 曝光度 / 所需防禦」這種手調曲線。
   */
  U.piecewise = function (points, x) {
    if (!points.length) return 0;
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (x <= points[i][0]) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        if (x1 === x0) return y1;
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return points[points.length - 1][1];
  };
  /** 對數座標上的分段內插：資金跨 6 個數量級時比線性自然得多。 */
  U.piecewiseLog = function (points, x) {
    const lx = Math.log10(Math.max(1, x));
    const lp = points.map(([px, py]) => [Math.log10(Math.max(1, px)), py]);
    return U.piecewise(lp, lx);
  };

  /* ---------------- 雜湊與亂數 ---------------- */
  U.hashStr = function (str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };
  /** mulberry32：小、快、可重現。`.state()` 讓亂數狀態能存檔。 */
  U.rngFrom = function (seed) {
    let a = (seed >>> 0) || 1;
    const fn = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.state = () => a >>> 0;
    fn.setState = (s) => { a = (s >>> 0) || 1; };
    return fn;
  };
  U.randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  U.randFloat = (rng, lo, hi) => lo + rng() * (hi - lo);
  /** 對數均勻：金額分布用（多數小額、少數大額），比線性均勻真實。 */
  U.randLog = function (rng, lo, hi) {
    if (lo <= 0) lo = 1;
    if (hi <= lo) return lo;
    return Math.exp(U.randFloat(rng, Math.log(lo), Math.log(hi)));
  };
  U.pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  U.chance = (rng, p) => rng() < p;
  U.shuffle = function (rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  /** 加權挑選：entries = [{w, ...}]，可自訂權重欄位或函式。 */
  U.weightedPick = function (rng, entries, weight) {
    const w = typeof weight === 'function' ? weight : (e) => e[weight || 'w'] || 0;
    let total = 0;
    for (const e of entries) total += Math.max(0, w(e));
    if (total <= 0) return null;
    let r = rng() * total;
    for (const e of entries) {
      r -= Math.max(0, w(e));
      if (r <= 0) return e;
    }
    return entries[entries.length - 1];
  };
  /** 標準常態（Box–Muller）。股價報酬用。 */
  U.gauss = function (rng) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  /** Poisson 抽樣。lambda 大時改用常態近似，避免迴圈爆掉。 */
  U.poisson = function (rng, lambda) {
    if (!(lambda > 0)) return 0;
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * U.gauss(rng)));
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= rng();
    } while (p > L && k < 1000);
    return k - 1;
  };

  /* ---------------- 物件 ---------------- */
  U.deepClone = function (obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(U.deepClone);
    const out = {};
    for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = U.deepClone(obj[k]);
    return out;
  };
  /** 只補上缺少的鍵，不覆寫既有值。存檔 migration 用。 */
  U.defaults = function (target, source) {
    if (!target || typeof target !== 'object') return U.deepClone(source);
    for (const k in source) {
      if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
      if (target[k] === undefined) target[k] = U.deepClone(source[k]);
      else if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k]) && target[k] && typeof target[k] === 'object') U.defaults(target[k], source[k]);
    }
    return target;
  };

  /* ---------------- 格式化（zh-Hant） ---------------- */
  U.pad2 = (n) => (n < 10 ? '0' + n : String(n));
  /** 千分位整數。 */
  U.comma = function (n) {
    const neg = n < 0;
    const s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + s;
  };
  /** 金額縮寫：12,345 / 3.4萬 / 5.20億 / 1.30兆。表格與狀態列用。 */
  U.fmtMoney = function (n) {
    if (!isFinite(n)) return '—';
    const neg = n < 0;
    const a = Math.abs(n);
    let s;
    if (a < 100000) s = U.comma(a);
    else if (a < 100000000) s = (a / 10000).toFixed(a < 10000000 ? 1 : 0) + '萬';
    else if (a < 1000000000000) s = (a / 100000000).toFixed(2) + '億';
    else s = (a / 1000000000000).toFixed(2) + '兆';
    return (neg ? '-' : '') + s;
  };
  U.fmtMoneyFull = (n) => U.comma(n) + ' 元';
  /** 0.0234 → 2.34%。 */
  U.fmtPct = (v, digits = 2) => (v * 100).toFixed(digits) + '%';
  U.fmtSigned = (v, digits = 2) => (v >= 0 ? '+' : '') + v.toFixed(digits);
  U.fmtPrice = (v) => v.toFixed(2);
  /** 第 N 天 → 第 Y 年 M 月 D 日（1 年 = 360 天 = 12 × 30，方便心算月付息）。 */
  U.fmtDay = function (day) {
    const y = Math.floor(day / 360) + 1;
    const rest = day % 360;
    const m = Math.floor(rest / 30) + 1;
    const d = (rest % 30) + 1;
    return `第 ${y} 年 ${m} 月 ${d} 日`;
  };
  U.fmtDayShort = function (day) {
    const y = Math.floor(day / 360) + 1;
    const rest = day % 360;
    return `Y${y}/${U.pad2(Math.floor(rest / 30) + 1)}/${U.pad2((rest % 30) + 1)}`;
  };

  /* ---------------- 事件匯流排 ---------------- */
  U.EventBus = function () {
    const map = new Map();
    return {
      on(evt, fn) {
        if (!map.has(evt)) map.set(evt, []);
        map.get(evt).push(fn);
        return () => this.off(evt, fn);
      },
      off(evt, fn) {
        const arr = map.get(evt);
        if (!arr) return;
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      },
      emit(evt, payload) {
        const arr = map.get(evt);
        if (arr) for (const fn of arr.slice()) { try { fn(payload); } catch (e) { console.error('[bus]', evt, e); } }
        const any = map.get('*');
        if (any) for (const fn of any.slice()) { try { fn(evt, payload); } catch (e) { console.error('[bus:*]', e); } }
      },
      clear() { map.clear(); },
      _map: map,
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
