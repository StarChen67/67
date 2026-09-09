/* ============================================================
   ui/dom.js — DOM 小工具
   UI 層只讀 game.* 與監聽 game.bus，不直接改 state。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const UI = (BT.UI = BT.UI || {});

  const D = (UI.dom = {});

  D.$ = (sel, parent) => (parent || document).querySelector(sel);
  D.$$ = (sel, parent) => Array.from((parent || document).querySelectorAll(sel));

  /**
   * el('div.card', { onclick }, [children]) — 最常用的建構函式。
   * spec 支援 'button.btn.mini'，也支援用空白分隔的額外 class（'div.card wide'），
   * 因為呼叫端常常是 'btn.' + opts.cls 這種字串拼接，cls 裡有空白時不該整個解析失敗。
   */
  D.el = function (spec, attrs, children) {
    const parts = String(spec).trim().split(/\s+/);
    const head = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(parts[0]);
    const tag = (head && head[1]) || 'div';
    const node = document.createElement(tag);
    const addSel = (s) => {
      for (const part of String(s).match(/[.#]?[\w-]+/g) || []) {
        if (part[0] === '#') node.id = part.slice(1);
        else node.classList.add(part[0] === '.' ? part.slice(1) : part);
      }
    };
    if (head && head[2]) addSel(head[2]);
    else if (!head) addSel(parts[0].replace(/^[a-z0-9]+/i, ''));   // 標籤解析失敗時至少把 class 掛上
    for (let i = 1; i < parts.length; i++) addSel(parts[i]);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children != null) D.append(node, children);
    return node;
  };
  D.append = function (node, children) {
    const list = Array.isArray(children) ? children : [children];
    for (const c of list) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  };
  D.clear = function (node) { while (node.firstChild) node.removeChild(node.firstChild); return node; };
  D.setText = function (node, text) { if (node && node.textContent !== String(text)) node.textContent = text; };

  /** 鍵值列。 */
  D.kv = function (pairs, cls) {
    const wrap = D.el('div.kv' + (cls ? '.' + cls : ''));
    for (const [k, v, opt] of pairs) {
      if (v === undefined) continue;
      wrap.appendChild(D.el('span.k', { text: k }));
      wrap.appendChild(D.el('span.v' + (opt && opt.cls ? '.' + opt.cls : ''), typeof v === 'string' || typeof v === 'number' ? { text: v } : {}, typeof v === 'object' ? v : null));
    }
    return wrap;
  };

  D.btn = function (label, onclick, opts = {}) {
    const b = D.el('button.btn' + (opts.cls ? '.' + opts.cls : ''), { onclick, type: 'button' }, label);
    if (opts.disabled) { b.disabled = true; b.classList.add('off'); }
    if (opts.title) b.title = opts.title;
    return b;
  };

  /** 進度條。value 0–1。 */
  D.bar = function (value, cls, label) {
    const outer = D.el('div.bar' + (cls ? '.' + cls : ''));
    outer.appendChild(D.el('i', { style: { width: (U.clamp(value, 0, 1) * 100).toFixed(1) + '%' } }));
    if (label) outer.appendChild(D.el('span.barLabel', { text: label }));
    return outer;
  };

  /** 金額上色：正綠負紅。 */
  D.money = function (v, opts = {}) {
    const cls = v > 0 ? 'green' : (v < 0 ? 'red' : 'dim');
    const txt = (opts.sign && v > 0 ? '+' : '') + U.fmtMoney(v);
    return D.el('span' + (opts.plain ? '' : '.' + cls), { text: txt, title: U.fmtMoneyFull(v) });
  };

  /* ---------------- Toast ---------------- */
  let toastBox = null;
  UI.toast = function (text, kind, ms) {
    if (!toastBox) {
      toastBox = D.el('div#toastBox');
      document.body.appendChild(toastBox);
    }
    const t = D.el('div.toast' + (kind ? '.' + kind : ''), { text });
    toastBox.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms || 3200);
    while (toastBox.children.length > 5) toastBox.firstChild.remove();
  };

  /* ---------------- 數字輸入（金額 / 數量） ---------------- */
  /**
   * 一組「輸入框 + 快捷比例按鈕」。onSubmit(value) 回傳 true 代表成功（會清空）。
   */
  D.amountRow = function (opts) {
    const input = D.el('input.amt', { type: 'text', inputmode: 'numeric', placeholder: opts.placeholder || '金額' });
    const readVal = () => {
      const n = Number(String(input.value).replace(/[^0-9.]/g, ''));
      return isFinite(n) ? Math.floor(n) : 0;
    };
    const row = D.el('div.amtRow', null, [input]);
    for (const q of opts.quick || []) {
      row.appendChild(D.btn(q.label, () => {
        input.value = String(Math.max(0, Math.floor(q.value())));
        input.focus();
      }, { cls: 'mini' }));
    }
    row.appendChild(D.btn(opts.action || '確定', () => {
      const v = readVal();
      if (!(v > 0)) { UI.toast('請輸入金額', 'bad'); return; }
      if (opts.onSubmit(v) !== false) input.value = '';
    }, { cls: 'go' }));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = readVal(); if (v > 0 && opts.onSubmit(v) !== false) input.value = ''; } });
    row.input = input;
    return row;
  };
})(typeof window !== 'undefined' ? window : globalThis);
