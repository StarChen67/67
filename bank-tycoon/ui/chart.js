/* ============================================================
   ui/chart.js — 純 SVG 折線圖（不引入任何外部函式庫）
   用於資產曲線與股價走勢。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const UI = (BT.UI = BT.UI || {});
  const D = UI.dom;
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  /**
   * series: [{ name, color, values: number[], dashed? }]
   * opts: { width, height, fmt, minZero, labels: string[] }
   * 所有序列共用同一組 X（索引），Y 軸自動縮放。
   */
  UI.chart = function (series, opts = {}) {
    const W = opts.width || 640;
    const H = opts.height || 200;
    const padL = opts.padL != null ? opts.padL : 58;
    const padR = 8;
    const padT = 10;
    const padB = 20;
    const fmt = opts.fmt || U.fmtMoney;
    const live = series.filter((s) => s.values && s.values.length);

    // 固定高度、只在水平方向拉伸：不然容器一寬，圖就會被撐得很高
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', preserveAspectRatio: 'none', style: `height:${H}px` });
    if (!live.length) {
      svg.appendChild(svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'chartEmpty' })).textContent = '尚無資料';
      return svg;
    }

    let lo = Infinity;
    let hi = -Infinity;
    let n = 0;
    for (const s of live) {
      n = Math.max(n, s.values.length);
      for (const v of s.values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (opts.minZero && lo > 0) lo = 0;
    if (hi === lo) { hi = lo + Math.max(1, Math.abs(lo) * 0.1); }
    const span = hi - lo;
    lo -= span * 0.06;
    hi += span * 0.06;

    const x = (i, len) => padL + (len <= 1 ? 0 : (i / (len - 1)) * (W - padL - padR));
    const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

    /* 格線與 Y 軸標籤 */
    for (let g = 0; g <= 4; g++) {
      const v = lo + ((hi - lo) * g) / 4;
      const yy = y(v);
      svg.appendChild(svgEl('line', { x1: padL, y1: yy, x2: W - padR, y2: yy, class: 'grid' }));
      const t = svgEl('text', { x: padL - 6, y: yy + 3.5, 'text-anchor': 'end', class: 'axis' });
      t.textContent = fmt(v);
      svg.appendChild(t);
    }
    /* 0 線 */
    if (lo < 0 && hi > 0) {
      svg.appendChild(svgEl('line', { x1: padL, y1: y(0), x2: W - padR, y2: y(0), class: 'zero' }));
    }

    for (const s of live) {
      const len = s.values.length;
      let d = '';
      for (let i = 0; i < len; i++) d += (i ? ' L' : 'M') + x(i, len).toFixed(1) + ',' + y(s.values[i]).toFixed(1);
      if (s.fill) {
        const area = d + ` L${x(len - 1, len).toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)} L${x(0, len).toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)} Z`;
        svg.appendChild(svgEl('path', { d: area, fill: s.color, 'fill-opacity': 0.10, stroke: 'none' }));
      }
      svg.appendChild(svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 1.8, 'stroke-dasharray': s.dashed ? '4 3' : null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }

    /* X 軸兩端標籤 */
    if (opts.labels && opts.labels.length) {
      const first = svgEl('text', { x: padL, y: H - 5, class: 'axis' });
      first.textContent = opts.labels[0];
      svg.appendChild(first);
      const last = svgEl('text', { x: W - padR, y: H - 5, 'text-anchor': 'end', class: 'axis' });
      last.textContent = opts.labels[opts.labels.length - 1];
      svg.appendChild(last);
    }
    return svg;
  };

  /** 圖例。 */
  UI.legend = function (series) {
    const wrap = D.el('div.legend');
    for (const s of series) {
      wrap.appendChild(D.el('span.lg', null, [
        D.el('i', { style: { background: s.color } }),
        s.name,
      ]));
    }
    return wrap;
  };

  /** 小型走勢線（股票列表用）。 */
  UI.spark = function (values, color, w, h) {
    const W = w || 72;
    const H = h || 22;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark' });
    if (!values || values.length < 2) return svg;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi === lo) hi = lo + 1;
    let d = '';
    for (let i = 0; i < values.length; i++) {
      const px = (i / (values.length - 1)) * W;
      const py = H - 2 - ((values[i] - lo) / (hi - lo)) * (H - 4);
      d += (i ? ' L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1);
    }
    svg.appendChild(svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.4 }));
    return svg;
  };
})(typeof window !== 'undefined' ? window : globalThis);
