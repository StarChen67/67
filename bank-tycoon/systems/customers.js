/* ============================================================
   systems/customers.js — NPC 客戶
   每天做四件事：來新客戶、既有客戶存錢、既有客戶提款、有些客戶離開。
   決定他們行為的是「吸引力」：利率 vs 市場、信用評級、搶劫風險、恐慌值。

   恐慌值是連結各系統的關鍵變數：
     搶劫成功 / 付不出錢 / 金融危機 → 恐慌上升 → 提款變多 → 現金更緊 → 擠兌。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.customers;

  class Customers {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.customers; }
    get bank() { return this.game.state.bank; }
    get list() { return this.st.list; }

    count() { return this.st.list.length; }
    totalDeposits() { return U.money(U.sum(this.st.list, (c) => c.balance)); }
    byType() {
      const m = {};
      for (const c of this.st.list) m[c.type] = (m[c.type] || 0) + 1;
      return m;
    }
    depositsByType() {
      const m = {};
      for (const c of this.st.list) m[c.type] = (m[c.type] || 0) + c.balance;
      return m;
    }
    top(n) { return this.st.list.slice().sort((a, b) => b.balance - a.balance).slice(0, n || 10); }

    /* ---------------- 吸引力 ---------------- */
    /** 利率因子：我的利率 / 客戶期望利率。1.0 表示剛好符合期望。 */
    rateFactor() {
      const cfg = C();
      const demanded = this.game.economy.demandedRate();
      const ratio = demanded > 0 ? this.bank.depositRate / demanded : 2;
      return U.clamp(cfg.rateFactorBase + cfg.rateFactorSpan * ratio, cfg.rateFactorMin, cfg.rateFactorMax);
    }
    safetyFactor() { return U.clamp(1 - this.game.robbery.risk() / 200, 0.4, 1); }
    panicFactor() { return U.clamp(1 - 0.9 * this.bank.panic / 100, 0.1, 1); }

    /** 綜合吸引力，UI 會拆開顯示每一項。 */
    attract() {
      const g = this.game;
      const rate = this.rateFactor();
      const credit = g.credit.attractFactor();
      const safety = this.safetyFactor();
      const panic = this.panicFactor();
      const phase = g.economy.phase().arrivalMult;
      const ev = g.events.mod('arrivalMult');
      const total = rate * credit * safety * panic * phase * ev;
      return { rate, credit, safety, panic, phase, event: ev, total };
    }

    /* ---------------- 資本上限 ----------------
       銀行能吸收的存款受自身資本限制。淨資產越大，能承接的存款越多。
       這讓「先把淨資產做大」成為所有成長的前置條件，也避免
       200 萬資本的銀行去承接 7000 萬存款、一次股災就資不抵債。 */
    /** 這一級允許的槓桿倍數（levels.js 可覆寫預設值）。 */
    maxLeverage() {
      const lv = this.game.upgrades.level();
      return lv.maxLeverage != null ? lv.maxLeverage : C().maxLeverage;
    }
    depositCapacity() {
      const net = this.game.totals().net;
      return Math.max(0, net * this.maxLeverage());
    }
    /** 已經用掉多少資本額度（UI 進度條）。 */
    capacityUsed() {
      const cap = this.depositCapacity();
      return cap > 0 ? this.totalDeposits() / cap : 1;
    }
    capacityFill() { return U.clamp(1 - this.capacityUsed(), 0, 1); }
    /** 單筆存款上限。 */
    sizeCap() {
      const net = this.game.totals().net;
      return Math.max(C().depositCapMin, net * C().depositCapFrac);
    }

    /** 每日預期新客戶數（客戶數或資本額度接近上限時自動趨緩）。 */
    arrivalRate() {
      const lv = this.game.upgrades.level();
      const fill = Math.min(U.clamp(1 - this.count() / lv.maxCustomers, 0, 1), this.capacityFill());
      return Math.max(0, lv.arrivals * this.attract().total * fill);
    }

    /* ---------------- 客戶生成 ---------------- */
    _pickType(rng) {
      const lv = this.game.upgrades.level();
      const credit = this.bank.credit;
      const entries = [];
      for (const [id, w] of Object.entries(lv.mix)) {
        const def = BT.registries.customerTypes.get(id);
        if (!def || w <= 0) continue;
        if (credit < def.minCredit) continue;   // 信用不夠，這類客戶不上門
        entries.push({ id, w });
      }
      if (!entries.length) return null;
      const pick = U.weightedPick(rng, entries);
      return pick ? BT.registries.customerTypes.get(pick.id) : null;
    }

    _name(rng, type) {
      const N = BT.NAMES;
      if (type.id === 'small_biz') return U.pick(rng, N.bizPrefix) + U.pick(rng, N.bizSuffix);
      if (type.id === 'corp') return U.pick(rng, N.corpPrefix) + U.pick(rng, N.corpSuffix);
      if (type.id === 'inst') return U.pick(rng, N.instName);
      return U.pick(rng, N.surname) + U.pick(rng, N.given);
    }

    /** 產生一位新客戶並存入初始金額（受單筆上限限制）。 */
    spawn(rng, day, opts = {}) {
      const type = opts.type ? BT.registries.customerTypes.get(opts.type) : this._pickType(rng);
      if (!type) return null;
      let amount = opts.amount != null ? opts.amount : U.randLog(rng, type.initial[0], type.initial[1]);
      if (opts.cap !== false) amount = Math.min(amount, this.sizeCap());
      amount = U.money(amount);
      if (amount <= 0) return null;
      const c = {
        id: this.st.nextId++,
        name: opts.name || this._name(rng, type),
        type: type.id,
        balance: amount,
        joinedDay: day,
        deposited: amount,
        withdrawn: 0,
      };
      this.st.list.push(c);
      this.game.treasury.receive(amount, null);   // 存款不是收入，只是資產與負債同時增加
      this.st.joinedToday += 1;
      this.game.state.stats.customersTotal += 1;
      this.game.bus.emit('customer:join', { customer: c, amount });
      return c;
    }

    /** 既有客戶存錢。 */
    deposit(c, amount) {
      amount = U.money(amount);
      if (!(amount > 0)) return 0;
      c.balance = U.money(c.balance + amount);
      c.deposited = U.money((c.deposited || 0) + amount);
      this.game.treasury.receive(amount, null);
      return amount;
    }

    /**
     * 客戶提款。銀行現金不足時，未付部分變成待付義務（客戶會等，但只等幾天）。
     * 回傳 { asked, paid, unpaid }
     */
    withdraw(c, amount, day) {
      amount = U.money(Math.min(amount, c.balance));
      if (!(amount > 0)) return { asked: 0, paid: 0, unpaid: 0 };
      c.balance = U.money(c.balance - amount);
      c.withdrawn = U.money((c.withdrawn || 0) + amount);
      const r = this.game.treasury.charge(amount, null, {
        kind: 'withdraw', day, customerId: c.id, label: `${c.name} 提款`,
      });
      if (r.unpaid > 0) this.game.bus.emit('customer:unpaid', { customer: c, amount: r.unpaid });
      return { asked: amount, paid: r.paid, unpaid: r.unpaid };
    }

    /** 客戶離開：全額提走並移出名單。 */
    leave(c, day, reason) {
      const r = this.withdraw(c, c.balance, day);
      this.st.list = this.st.list.filter((x) => x.id !== c.id);
      this.st.leftToday += 1;
      this.game.bus.emit('customer:leave', { customer: c, reason, amount: r.asked });
      return r;
    }

    /* ---------------- 恐慌 ---------------- */
    addPanic(v, reason) {
      if (!v) return;
      const before = this.bank.panic;
      this.bank.panic = U.clamp(this.bank.panic + v, 0, C().panicMax);
      if (v > 0 && before < C().bankRunStart && this.bank.panic >= C().bankRunStart) {
        this.bank.bankRun = true;
        this.bank.bankRunDays = 0;
        this.game.bus.emit('bankrun:start', { reason });
      }
    }
    /** 花錢安撫客戶（記者會、加碼保證、公開帳目）。 */
    calmCost() {
      return Math.max(C().calm.minCost, U.money(this.totalDeposits() * C().calm.costFrac));
    }
    canCalm(day) {
      if (day - this.bank.calmCooldown < C().calm.cooldownDays) {
        return { ok: false, why: `還要 ${C().calm.cooldownDays - (day - this.bank.calmCooldown)} 天才能再辦一次` };
      }
      if (this.bank.panic <= 0) return { ok: false, why: '客戶目前沒有恐慌' };
      if (this.game.treasury.cash < this.calmCost()) return { ok: false, why: '現金不足' };
      return { ok: true };
    }
    calm(day) {
      const chk = this.canCalm(day);
      if (!chk.ok) return chk;
      const cost = this.calmCost();
      if (!this.game.treasury.spend(cost, 'opex')) return { ok: false, why: '現金不足' };
      this.addPanic(-C().calm.panicDrop, 'calm');
      this.bank.calmCooldown = day;
      this.game.credit.add(5, 'calm');
      this.game.bus.emit('bank:calm', { cost });
      return { ok: true, cost };
    }

    /* ---------------- 每日推進 ---------------- */
    tick(rng, day) {
      const cfg = C();
      const g = this.game;
      const st = this.st;
      st.joinedToday = 0;
      st.leftToday = 0;

      // 恐慌自然衰退（信用好的銀行安撫得比較快）
      const decay = g.credit.score >= 700 ? cfg.panicDecayGoodCredit : cfg.panicDecay;
      this.bank.panic = U.clamp(this.bank.panic - decay, 0, cfg.panicMax);

      // 擠兌狀態
      if (this.bank.bankRun) {
        this.bank.bankRunDays += 1;
        if (this.bank.panic < cfg.bankRunEnd) {
          this.bank.bankRun = false;
          g.bus.emit('bankrun:end', { days: this.bank.bankRunDays });
        }
      }

      // 新客戶
      const lambda = this.arrivalRate();
      const n = U.poisson(rng, lambda);
      for (let i = 0; i < n; i++) this.spawn(rng, day);

      // 既有客戶行為
      const rateF = this.rateFactor();
      const demanded = g.economy.demandedRate();
      const myRate = this.bank.depositRate;
      const phase = g.economy.phase();
      const evWithdraw = g.events.mod('withdrawMult');
      const panicRatio = this.bank.panic / 100;
      const run = this.bank.bankRun;

      const depositMult = Math.sqrt(rateF) * phase.arrivalMult * (1 - panicRatio) * g.events.mod('arrivalMult');
      const roomLeft = Math.max(0, this.depositCapacity() - this.totalDeposits());
      const sizeCap = this.sizeCap();
      const withdrawMult = (1 + this.bank.panic / 25) * phase.withdrawMult * evWithdraw * (myRate < demanded * 0.5 ? 1.5 : 1);
      const leaveMult = (1 + this.bank.panic / 20) * (myRate < demanded * 0.4 ? 3 : 1);

      let totalWithdraw = 0;
      let unpaidTotal = 0;
      let depositTotal = 0;
      const leaving = [];

      for (const c of st.list) {
        const type = BT.registries.customerTypes.get(c.type);
        if (!type) continue;

        // 離開判定：信用掉到這類客戶的底線以下會大幅加速
        const creditBad = g.credit.score < type.minCredit;
        const pLeave = cfg.leaveBase * leaveMult * (creditBad ? 5 : 1);
        if (rng() < pLeave) { leaving.push(c); continue; }

        if (run) {
          // 擠兌：所有人都在排隊
          if (rng() < cfg.bankRunWithdrawP) {
            const frac = U.randFloat(rng, cfg.bankRunFrac[0], cfg.bankRunFrac[1]);
            const r = this.withdraw(c, c.balance * frac, day);
            totalWithdraw += r.asked;
            unpaidTotal += r.unpaid;
          }
          continue;
        }

        if (depositTotal < roomLeft && rng() < type.pDeposit * depositMult) {
          const want = Math.min(U.randLog(rng, type.deposit[0], type.deposit[1]), sizeCap, roomLeft - depositTotal);
          depositTotal += this.deposit(c, want);
        }
        if (rng() < type.pWithdraw * withdrawMult) {
          const frac = U.randFloat(rng, type.withdrawFrac[0], type.withdrawFrac[1]);
          const r = this.withdraw(c, c.balance * frac, day);
          totalWithdraw += r.asked;
          unpaidTotal += r.unpaid;
        }
      }

      for (const c of leaving) {
        const r = this.leave(c, day, 'attrition');
        totalWithdraw += r.asked;
        unpaidTotal += r.unpaid;
      }

      // 餘額歸零的客戶自動結清帳戶
      st.list = st.list.filter((c) => c.balance > 0);

      return { joined: st.joinedToday, left: st.leftToday, deposited: depositTotal, withdrawn: totalWithdraw, unpaid: unpaidTotal };
    }

    /* ---------------- 事件用 ---------------- */
    /** 大額存款：金額按總存款比例，開局時用最低值保底。 */
    bigDeposit(rng, day, spec) {
      const base = Math.max(spec.min || 0, this.totalDeposits() * U.randFloat(rng, spec.frac[0], spec.frac[1]));
      const amount = U.money(base);
      const existing = this.st.list.length && rng() < 0.4 ? U.pick(rng, this.st.list) : null;
      if (existing) { this.deposit(existing, amount); return { customer: existing, amount, isNew: false }; }
      const c = this.spawn(rng, day, { amount });
      return c ? { customer: c, amount, isNew: true } : null;
    }
    /** 大額提款：從最大的幾位客戶身上抽。 */
    bigWithdraw(rng, day, spec) {
      const target = U.money(Math.max(spec.min || 0, this.totalDeposits() * U.randFloat(rng, spec.frac[0], spec.frac[1])));
      let left = target;
      let paid = 0;
      let unpaid = 0;
      const pool = this.top(8);
      for (const c of pool) {
        if (left <= 0) break;
        const take = Math.min(left, c.balance);
        const r = this.withdraw(c, take, day);
        left -= r.asked;
        paid += r.paid;
        unpaid += r.unpaid;
      }
      this.st.list = this.st.list.filter((c) => c.balance > 0);
      return { asked: target - left, paid, unpaid };
    }
  }

  BT.Customers = Customers;
})(typeof window !== 'undefined' ? window : globalThis);
