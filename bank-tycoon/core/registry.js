/* ============================================================
   core/registry.js — 泛用定義表
   所有 data-driven 內容（等級、股票、保全設備、強盜、事件…）都掛在 Registry 上，
   新增內容只要往 data/*.js 加一筆，不需要動核心程式。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = (root.BT = root.BT || {});

  class Registry {
    constructor(name) {
      this.name = name;
      this.map = new Map();
      this.list = [];
    }
    add(def) {
      if (!def || !def.id) throw new Error(`[${this.name}] 定義缺少 id: ` + JSON.stringify(def));
      if (this.map.has(def.id)) throw new Error(`[${this.name}] 重複 id: ${def.id}`);
      this.map.set(def.id, def);
      this.list.push(def);
      return def;
    }
    addAll(defs) { for (const d of defs) this.add(d); return this; }
    get(id) { return this.map.get(id) || null; }
    has(id) { return this.map.has(id); }
    require(id) {
      const d = this.map.get(id);
      if (!d) throw new Error(`[${this.name}] 找不到 id: ${id}`);
      return d;
    }
    filter(fn) { return this.list.filter(fn); }
    all() { return this.list.slice(); }
    get size() { return this.list.length; }
  }

  BT.Registry = Registry;
  BT.registries = {
    levels: new Registry('levels'),          // 銀行等級
    customerTypes: new Registry('customerTypes'),
    stocks: new Registry('stocks'),
    products: new Registry('products'),      // 理財商品
    security: new Registry('security'),      // 保全設備
    robbers: new Registry('robbers'),        // 強盜等級
    insurance: new Registry('insurance'),
    printer: new Registry('printer'),        // 印鈔機等級
    events: new Registry('events'),
    ratings: new Registry('ratings'),        // 信用評級
  };
  BT.define = function (registryName, defs) {
    const r = BT.registries[registryName];
    if (!r) throw new Error('未知的 registry: ' + registryName);
    r.addAll(Array.isArray(defs) ? defs : [defs]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
