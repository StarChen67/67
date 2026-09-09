/* ============================================================
   systems/events.js — 隨機事件
   兩種效果：
     mods  持續期間的修正值，各系統用 events.mod('key') 查詢
     once  觸發當下的一次性效果

   要加新事件只要往 data/events.js 加一筆；
   要加新的效果鍵，在 _applyOnce 加一個 case，或在需要的系統呼叫 mod('新鍵')。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.events;

  class Events {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.events; }

    active() { return this.st.active; }
    activeDefs() {
      return this.st.active.map((a) => ({ entry: a, def: BT.registries.events.get(a.id) })).filter((x) => x.def);
    }
    log() { return this.st.log; }

    /**
     * 目前所有進行中事件對某個鍵的合計修正值。
     * 乘數型（Mult 結尾）相乘，加數型相加。
     */
    mod(key, base) {
      const isMult = /Mult$/.test(key);
      let v = base != null ? base : (isMult ? 1 : 0);
      for (const a of this.st.active) {
        const def = BT.registries.events.get(a.id);
        if (!def || !def.mods || def.mods[key] == null) continue;
        if (isMult) v *= def.mods[key];
        else v += def.mods[key];
      }
      return v;
    }
    /** 某產業目前的漂移加成（股票系統用）。 */
    driftFor(sector) {
      let v = 0;
      for (const a of this.st.active) {
        const def = BT.registries.events.get(a.id);
        if (!def || !def.mods || !def.mods.driftAdd) continue;
        const d = def.mods.driftAdd;
        if (d[sector] != null) v += d[sector];
        if (d.all != null) v += d.all;
      }
      return U.clamp(v, -BT.CONFIG.stocks.driftModClamp, BT.CONFIG.stocks.driftModClamp);
    }

    /** 這個事件現在可以抽到嗎。 */
    eligible(def, day) {
      const g = this.game;
      if (def.minLevel && g.state.bank.level < def.minLevel) return false;
      const last = this.st.lastFired[def.id];
      const cd = def.cooldown != null ? def.cooldown : C().defaultCooldown;
      if (last != null && day - last < cd) return false;
      if (this.st.active.some((a) => a.id === def.id)) return false;
      return true;
    }

    addLog(day, text, kind, icon) {
      this.st.log.unshift({ day, text, kind: kind || 'neutral', icon: icon || '•' });
      if (this.st.log.length > C().logMax) this.st.log.pop();
    }

    /** 直接觸發指定事件（測試與 debug 用）。 */
    fire(id, rng, day) {
      const def = BT.registries.events.get(id);
      if (!def) return null;
      return this._fire(def, rng, day);
    }

    _fire(def, rng, day) {
      this.st.lastFired[def.id] = day;
      this.game.state.stats.eventsSeen += 1;
      const detail = def.once ? this._applyOnce(def, rng, day) : [];
      if (def.days && def.mods) {
        this.st.active.push({ id: def.id, startDay: day, endDay: day + def.days });
      }
      const text = def.text + (detail.length ? '（' + detail.join('、') + '）' : '');
      this.addLog(day, `${def.name}：${text}`, def.kind, def.icon);
      const payload = { def, day, detail, text };
      this.game.bus.emit('event:fire', payload);
      return payload;
    }

    _applyOnce(def, rng, day) {
      const g = this.game;
      const o = def.once;
      const out = [];
      if (o.setPhase) { g.economy.setPhase(o.setPhase, def.id); }
      if (o.marketRate) {
        g.economy.addMarketRate(o.marketRate);
        out.push(`市場利率 ${U.fmtSigned(o.marketRate * 100, 2)}%`);
      }
      if (o.inflation) { g.economy.addInflation(o.inflation); out.push(`通膨 +${o.inflation}`); }
      if (o.panic) { g.customers.addPanic(o.panic, def.id); out.push(`客戶恐慌 ${U.fmtSigned(o.panic, 0)}`); }
      if (o.credit) { g.credit.add(o.credit, def.id); out.push(`信用 ${U.fmtSigned(o.credit, 0)}`); }
      if (o.stockShock) {
        g.stocks.shock(o.stockShock);
        const parts = Object.entries(o.stockShock).map(([k, v]) => {
          const nm = k === 'all' ? '全市場' : (BT.SECTORS[k] ? BT.SECTORS[k].name : k);
          return `${nm} ${U.fmtSigned(v * 100, 0)}%`;
        });
        out.push(parts.join('、'));
      }
      if (o.cash) {
        if (o.cash > 0) g.treasury.receive(o.cash, 'other');
        else g.treasury.charge(-o.cash, 'other', { kind: 'other', day, label: def.name });
        out.push(`現金 ${U.fmtSigned(o.cash, 0)}`);
      }
      if (o.cashFrac) {
        const amt = U.money(Math.abs(g.treasury.cash * o.cashFrac));
        if (amt > 0) {
          if (o.cashFrac > 0) g.treasury.receive(amt, 'other');
          else g.treasury.charge(amt, 'other', { kind: 'other', day, label: def.name });
          out.push(`現金 ${o.cashFrac > 0 ? '+' : '-'}${U.fmtMoney(amt)}`);
        }
      }
      if (o.bigDeposit) {
        const r = g.customers.bigDeposit(rng, day, o.bigDeposit);
        if (r) out.push(`${r.customer.name} 存入 ${U.fmtMoney(r.amount)}`);
      }
      if (o.bigWithdraw) {
        const r = g.customers.bigWithdraw(rng, day, o.bigWithdraw);
        if (r.asked > 0) {
          out.push(`提領 ${U.fmtMoney(r.asked)}`);
          if (r.unpaid > 0) out.push(`其中 ${U.fmtMoney(r.unpaid)} 付不出來`);
        }
      }
      if (o.deviceDamage) {
        const spec = o.deviceDamage;
        let ids = Object.keys(g.state.security.devices);
        if (spec.ids) ids = ids.filter((id) => spec.ids.indexOf(id) >= 0);
        ids = U.shuffle(rng, ids);
        const n = Array.isArray(spec.count) ? U.randInt(rng, spec.count[0], spec.count[1]) : (spec.count || 1);
        const names = [];
        for (let i = 0; i < Math.min(n, ids.length); i++) {
          const f = U.randFloat(rng, spec.range[0], spec.range[1]);
          g.security.damage(ids[i], f);
          names.push(`${g.security.def(ids[i]).name} -${Math.round(f * 100)}%`);
        }
        if (names.length) out.push(names.join('、'));
        else out.push('沒有設備受損');
      }
      if (o.audit) {
        // 監管稽核：準備率高就加分，低就扣分並罰款
        const t = g.totals();
        const ratio = t.deposits > 0 ? t.cash / t.deposits : 1;
        if (ratio >= 0.15) { g.credit.add(35, 'audit'); out.push('查核通過，信用 +35'); }
        else if (ratio >= 0.08) { g.credit.add(5, 'audit'); out.push('查核通過，信用 +5'); }
        else {
          const fine = U.money(Math.max(20000, t.deposits * 0.002));
          g.treasury.charge(fine, 'other', { kind: 'other', day, label: '監理罰款' });
          g.credit.add(-40, 'audit');
          out.push(`準備率不足，罰款 ${U.fmtMoney(fine)}、信用 -40`);
        }
      }
      if (o.forceRobbery) {
        // 交給 simulation 在保全流程裡執行，事件本身只登記
        g.state.flags.pendingRobbery = o.forceRobbery.tier || null;
        out.push('強盜已經上門');
      }
      return out;
    }

    /** 每日：先讓到期事件結束，再抽新事件。 */
    tick(rng, day) {
      const before = this.st.active.length;
      this.st.active = this.st.active.filter((a) => day < a.endDay);
      if (this.st.active.length !== before) this.game.bus.emit('event:expire', {});

      if (rng() >= C().dailyChance) return null;
      const pool = BT.registries.events.filter((d) => this.eligible(d, day));
      if (!pool.length) return null;
      const def = U.weightedPick(rng, pool, 'w');
      if (!def) return null;
      return this._fire(def, rng, day);
    }
  }

  BT.Events = Events;
})(typeof window !== 'undefined' ? window : globalThis);
