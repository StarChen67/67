/* ============================================================
   systems/stocks.js — 股票市場
   價格引擎：漂移 + 波動 + 動能 + 崩盤，再乘上景氣與事件修正。
   高報酬股票必然搭配高波動與高崩盤機率，所以「全押最會漲的那支」
   在夠長的時間裡一定會遇到腰斬，這是設計上的風險成本。

   買賣都收手續費，防止零成本反覆進出套利。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.stocks;

  class Stocks {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.stocks; }

    /* ---------------- 查詢 ---------------- */
    def(id) { return BT.registries.stocks.get(id); }
    price(id) { return this.st.prices[id] || 0; }
    prevPrice(id) { return this.st.prevPrices[id] || this.price(id); }
    changePct(id) {
      const p = this.prevPrice(id);
      return p > 0 ? (this.price(id) - p) / p : 0;
    }
    hist(id) { return this.st.hist[id] || []; }
    holding(id) { return this.st.holdings[id] || null; }
    qty(id) { const h = this.holding(id); return h ? h.qty : 0; }
    avgCost(id) { const h = this.holding(id); return h ? h.avgCost : 0; }
    value(id) { return this.qty(id) * this.price(id); }
    /** 未實現損益。 */
    unrealized(id) {
      const h = this.holding(id);
      if (!h) return 0;
      return (this.price(id) - h.avgCost) * h.qty;
    }
    totalValue() {
      let v = 0;
      for (const id in this.st.holdings) v += this.value(id);
      return U.money(v);
    }
    totalCost() {
      let v = 0;
      for (const id in this.st.holdings) v += this.st.holdings[id].qty * this.st.holdings[id].avgCost;
      return U.money(v);
    }
    totalUnrealized() { return U.money(this.totalValue() - this.totalCost()); }
    /** 已實現 + 未實現，破產結算時顯示。 */
    lifetimePnl() { return U.money(this.st.realized + this.totalUnrealized()); }

    /** 目前等級解鎖的股票清單。 */
    available() {
      const g = this.game;
      return BT.registries.stocks.filter((s) => g.upgrades.unlocked(BT.STOCK_TIER_FEATURE[s.tier]));
    }
    isAvailable(id) {
      const d = this.def(id);
      return !!d && this.game.upgrades.unlocked(BT.STOCK_TIER_FEATURE[d.tier]);
    }

    /* ---------------- 交易 ---------------- */
    fee(amount) { return U.money(amount * C().fee); }

    /** 用現有現金最多能買幾股（已扣手續費）。 */
    maxBuy(id) {
      const p = this.price(id);
      if (!(p > 0)) return 0;
      return Math.floor(this.game.treasury.cash / (p * (1 + C().fee)));
    }

    buy(id, qty) {
      const d = this.def(id);
      if (!d) return { ok: false, why: '找不到這支股票' };
      if (!this.isAvailable(id)) return { ok: false, why: '銀行等級不足，尚未開放這支標的' };
      qty = Math.floor(qty);
      if (!(qty > 0)) return { ok: false, why: '數量無效' };
      const p = this.price(id);
      const gross = U.money(p * qty);
      const fee = this.fee(gross);
      const total = gross + fee;
      if (this.game.treasury.cash < total) return { ok: false, why: '現金不足' };
      this.game.treasury.spend(gross, null);        // 本金只是資產轉換，不計入支出
      this.game.treasury.spend(fee, 'fee');
      const h = this.st.holdings[id] || (this.st.holdings[id] = { qty: 0, avgCost: 0 });
      const newQty = h.qty + qty;
      h.avgCost = (h.avgCost * h.qty + gross) / newQty;   // 手續費不進成本，單獨記為費用
      h.qty = newQty;
      this.st.fees = U.money(this.st.fees + fee);
      this.game.state.stats.trades += 1;
      this.game.bus.emit('stocks:buy', { id, qty, price: p, total });
      return { ok: true, qty, price: p, gross, fee, total };
    }

    sell(id, qty) {
      const h = this.holding(id);
      if (!h) return { ok: false, why: '沒有持股' };
      qty = Math.floor(Math.min(qty, h.qty));
      if (!(qty > 0)) return { ok: false, why: '數量無效' };
      const p = this.price(id);
      const gross = U.money(p * qty);
      const fee = this.fee(gross);
      const net = gross - fee;
      const cost = U.money(h.avgCost * qty);
      const pnl = U.money(gross - cost);

      this.game.treasury.receive(gross, null);
      this.game.treasury.spend(fee, 'fee');
      h.qty -= qty;
      if (h.qty <= 0) delete this.st.holdings[id];
      this.st.realized = U.money(this.st.realized + pnl);
      this.st.fees = U.money(this.st.fees + fee);
      this.game.state.stats.trades += 1;
      // 損益進報表：賺的算收入，賠的算支出，這樣每日淨利才對得起來
      if (pnl >= 0) this.game.reports.income('stock', pnl);
      else this.game.reports.expense('invest', -pnl);
      this.game.bus.emit('stocks:sell', { id, qty, price: p, net, pnl });
      return { ok: true, qty, price: p, gross, fee, net, pnl };
    }

    /**
     * 緊急賣股：按持股市值「等比例」賣出，湊到指定金額。客戶擠兌時的救命稻草。
     * 刻意不從獲利最高的開始賣 —— 那會系統性地把賺錢的部位賣掉、只留下賠錢的。
     */
    liquidate(target) {
      const need = U.money(target);
      if (!(need > 0)) return 0;
      const total = this.totalValue();
      if (total <= 0) return 0;
      const ratio = Math.min(1, need / (total * (1 - C().fee)));
      let raised = 0;
      for (const id of Object.keys(this.st.holdings)) {
        const q = ratio >= 1 ? this.qty(id) : Math.ceil(this.qty(id) * ratio);
        if (q <= 0) continue;
        const r = this.sell(id, q);
        if (r.ok) raised += r.net;
      }
      // 比例法可能因為無條件進位而略少，補一輪
      if (raised < need) {
        for (const id of Object.keys(this.st.holdings)) {
          if (raised >= need) break;
          const p = this.price(id);
          if (!(p > 0)) continue;
          const q = Math.min(this.qty(id), Math.ceil((need - raised) / (p * (1 - C().fee))));
          const r = this.sell(id, q);
          if (r.ok) raised += r.net;
        }
      }
      return U.money(raised);
    }

    /* ---------------- 價格引擎 ---------------- */
    /** 事件造成的立即衝擊：spec = { all: -0.2 } 或 { tech: 0.14 } 或 { nova: 0.3 }。 */
    shock(spec) {
      const out = [];
      for (const [key, pct] of Object.entries(spec || {})) {
        for (const s of BT.registries.stocks.all()) {
          if (key !== 'all' && key !== s.sector && key !== s.id) continue;
          const before = this.st.prices[s.id];
          this.st.prices[s.id] = Math.max(C().minPrice, U.round(before * (1 + pct), 2));
          out.push({ id: s.id, from: before, to: this.st.prices[s.id] });
        }
      }
      return out;
    }

    tick(rng) {
      const cfg = C();
      const g = this.game;
      const phase = g.economy.phase();
      const inflation = g.state.economy.inflation;
      const volMultEvent = g.events.mod('volMult');
      const crisis = g.state.economy.phase === 'crisis';

      for (const s of BT.registries.stocks.all()) {
        const id = s.id;
        const prev = this.st.prices[id];
        this.st.prevPrices[id] = prev;

        const driftEvent = g.events.driftFor(s.sector);
        // phaseDrift 讓避險標的（波動率指數、黃金）在危機時真的會漲
        const phaseBonus = s.phaseDrift && s.phaseDrift[g.state.economy.phase] != null ? s.phaseDrift[g.state.economy.phase] : 0;
        const drift = (s.drift + phase.driftAdd + driftEvent + phaseBonus) / 365;
        const vol = s.vol * phase.volMult * volMultEvent * (1 + inflation / 100);
        let ret = drift + vol * U.gauss(rng) + cfg.momentumGain * (this.st.momentum[id] || 0);

        // 暴跌
        if (rng() < s.crashP * (crisis ? cfg.crisisCrashMult : 1)) {
          const drop = U.randFloat(rng, s.crashRange[0], s.crashRange[1]);
          ret -= drop;
          g.bus.emit('stocks:crash', { id, name: s.name, drop });
        }

        const price = Math.max(cfg.minPrice, U.round(prev * Math.exp(ret), 2));
        this.st.prices[id] = price;

        const m = cfg.momentumKeep * (this.st.momentum[id] || 0) + (1 - cfg.momentumKeep) * ret;
        this.st.momentum[id] = U.clamp(m, -cfg.momentumClamp, cfg.momentumClamp);

        const h = this.st.hist[id] || (this.st.hist[id] = []);
        h.push(price);
        if (h.length > cfg.histDays) h.shift();
      }
    }
  }

  BT.Stocks = Stocks;
})(typeof window !== 'undefined' ? window : globalThis);
