/* ============================================================
   save/save.js — 存檔：序列化、校驗、備份、損壞復原、migration
   格式：{ v, savedAt, checksum, data: JSON(state) }
   鍵：bt_save / bt_save_bak / bt_save_corrupt
   storage 可注入（測試用記憶體版）。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;

  const KEY = () => BT.CONFIG.saveKey;
  const KEY_BAK = () => BT.CONFIG.saveKey + '_bak';
  const KEY_CORRUPT = () => BT.CONFIG.saveKey + '_corrupt';

  /* MIGRATIONS[n] 把 schemaVersion n 升到 n+1。 */
  const MIGRATIONS = {
    0: function (d) { return d; },
  };

  const Save = {
    KEY, KEY_BAK, KEY_CORRUPT, MIGRATIONS,
    memoryStorage() {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        _map: m,
      };
    },
    checksum(json) { return U.hashStr(json).toString(16); },
    serialize(state, now) {
      const data = JSON.stringify(state);
      return JSON.stringify({ v: state.schemaVersion, savedAt: now, checksum: Save.checksum(data), data });
    },
    parse(str) {
      if (!str) return { error: 'empty' };
      let env;
      try { env = JSON.parse(str); } catch (e) { return { error: 'json:' + e.message }; }
      if (!env || typeof env !== 'object') return { error: 'envelope' };
      if (typeof env.data !== 'string') return { error: 'no-data' };
      if (env.checksum && Save.checksum(env.data) !== env.checksum) return { error: 'checksum' };
      let state;
      try { state = JSON.parse(env.data); } catch (e) { return { error: 'data:' + e.message }; }
      if (!state || !state.bank || !state.customers) return { error: 'shape' };
      return { state };
    },
    migrate(state) {
      let v = state.schemaVersion || 0;
      const target = BT.CONFIG.schemaVersion;
      const applied = [];
      while (v < target) {
        const fn = MIGRATIONS[v];
        if (!fn) break;
        state = fn(state) || state;
        applied.push(v);
        v += 1;
        state.schemaVersion = v;
      }
      U.defaults(state, BT.stateSkeleton());
      state.schemaVersion = target;
      Save.repair(state);
      return { state, applied };
    },
    /** 修補明顯壞掉的欄位（不丟存檔）。新增股票/設備時也靠這裡補齊。 */
    repair(state) {
      const R = BT.registries;
      const M = U.money;
      // 新版本新增的股票要有初始價
      for (const st of R.stocks.all()) {
        if (typeof state.stocks.prices[st.id] !== 'number' || !isFinite(state.stocks.prices[st.id])) state.stocks.prices[st.id] = st.base;
        if (typeof state.stocks.prevPrices[st.id] !== 'number') state.stocks.prevPrices[st.id] = state.stocks.prices[st.id];
        if (!Array.isArray(state.stocks.hist[st.id])) state.stocks.hist[st.id] = [state.stocks.prices[st.id]];
        if (typeof state.stocks.momentum[st.id] !== 'number') state.stocks.momentum[st.id] = 0;
      }
      // 移除已不存在的股票持股
      for (const id of Object.keys(state.stocks.holdings)) {
        if (!R.stocks.has(id) || !(state.stocks.holdings[id].qty > 0)) delete state.stocks.holdings[id];
      }
      // 保全設備
      for (const id of Object.keys(state.security.devices)) {
        const def = R.security.get(id);
        if (!def) { delete state.security.devices[id]; continue; }
        const d = state.security.devices[id];
        d.level = U.clamp(Math.floor(d.level || 0), 0, def.levels.length);
        d.cond = U.clamp(typeof d.cond === 'number' ? d.cond : 100, 0, 100);
        if (d.level <= 0) delete state.security.devices[id];
      }
      const g = state.security.guards;
      g.count = Math.max(0, Math.floor(g.count || 0));
      g.equip = U.clamp(Math.floor(g.equip || 1), 1, BT.CONFIG.security.guardMaxEquip);
      g.training = U.clamp(Math.floor(g.training || 1), 1, BT.CONFIG.security.guardMaxTraining);
      g.injured = U.clamp(Math.floor(g.injured || 0), 0, g.count);
      // 客戶
      state.customers.list = (state.customers.list || []).filter((c) => c && R.customerTypes.has(c.type) && isFinite(c.balance) && c.balance > 0);
      for (const c of state.customers.list) c.balance = M(c.balance);
      // 商品與義務
      state.products.holdings = (state.products.holdings || []).filter((h) => h && R.products.has(h.productId) && h.amount > 0);
      state.treasury.obligations = (state.treasury.obligations || []).filter((o) => o && o.amount > 0);
      state.treasury.loans = (state.treasury.loans || []).filter((l) => l && l.principal > 0);
      // 事件
      state.events.active = (state.events.active || []).filter((a) => a && R.events.has(a.id));
      if (state.insurance.plan && !R.insurance.has(state.insurance.plan)) state.insurance.plan = null;
      // 數值
      const b = state.bank;
      if (!isFinite(b.cash)) b.cash = 0;
      b.cash = M(b.cash);
      b.level = U.clamp(Math.floor(b.level || 1), 1, R.levels.size);
      b.credit = U.clamp(b.credit, BT.CONFIG.credit.min, BT.CONFIG.credit.max);
      b.panic = U.clamp(b.panic || 0, 0, BT.CONFIG.customers.panicMax);
      b.depositRate = U.clamp(b.depositRate, BT.CONFIG.deposits.minRate, BT.CONFIG.deposits.maxRate);
      state.economy.inflation = U.clamp(state.economy.inflation || 0, 0, BT.CONFIG.economy.inflationMax);
      state.economy.marketRate = U.clamp(state.economy.marketRate, BT.CONFIG.economy.rateMin, BT.CONFIG.economy.rateMax);
      if (!BT.CONFIG.economy.phases[state.economy.phase]) state.economy.phase = 'normal';
      state.printer.level = U.clamp(Math.floor(state.printer.level || 0), 0, R.printer.size);
      if (!state.reports.today || !state.reports.today.income) state.reports.today = BT.emptyDayBook();
      if (!state.reports.yesterday || !state.reports.yesterday.income) state.reports.yesterday = BT.emptyDayBook();
      return state;
    },
    save(state, storage, now) {
      try {
        const str = Save.serialize(state, now);
        const old = storage.getItem(KEY());
        if (old && old !== str) storage.setItem(KEY_BAK(), old);
        storage.setItem(KEY(), str);
        return true;
      } catch (e) {
        console.error('[save] 寫入失敗', e);
        return false;
      }
    },
    load(storage) {
      const main = storage.getItem(KEY());
      const bak = storage.getItem(KEY_BAK());
      const tryOne = (str, source) => {
        const p = Save.parse(str);
        if (p.error) return { error: p.error, source };
        const m = Save.migrate(p.state);
        return { state: m.state, source, migrated: m.applied, error: null };
      };
      if (main) {
        const r = tryOne(main, 'main');
        if (r.state) return r;
        try { storage.setItem(KEY_CORRUPT(), main); } catch (e) { /* ignore */ }
        if (bak) {
          const b = tryOne(bak, 'backup');
          if (b.state) { b.recoveredFrom = r.error; return b; }
          return { state: null, error: r.error + ' / backup:' + b.error, hadData: true };
        }
        return { state: null, error: r.error, hadData: true };
      }
      if (bak) {
        const b = tryOne(bak, 'backup');
        if (b.state) return b;
        return { state: null, error: 'backup:' + b.error, hadData: true };
      }
      return { state: null, error: null, hadData: false };
    },
    exists(storage) { return !!(storage.getItem(KEY()) || storage.getItem(KEY_BAK())); },
    clear(storage) { storage.removeItem(KEY()); storage.removeItem(KEY_BAK()); },
    exportString(state, now) {
      const s = Save.serialize(state, now);
      return typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64');
    },
    importString(str) {
      let json;
      if (!/^[A-Za-z0-9+/=\s]+$/.test(String(str || ''))) return { error: 'base64' };
      try {
        json = typeof atob === 'function' ? decodeURIComponent(escape(atob(String(str).trim()))) : Buffer.from(String(str).trim(), 'base64').toString('utf8');
      } catch (e) { return { error: 'base64' }; }
      const p = Save.parse(json);
      if (p.error) return p;
      return { state: Save.migrate(p.state).state };
    },
  };

  BT.Save = Save;
})(typeof window !== 'undefined' ? window : globalThis);
