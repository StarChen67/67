/* ============================================================
   systems/robbery.js — 搶劫風險與搶劫事件

   風險 = 曝光度（現金越多越顯眼）× (1 − 保全減免)
   保全減免用「目前防禦 / 這個現金量該有的防禦」算，
   所以銀行變大時，同一套設備的減免會自動退化 ——
   不能用最便宜的門鎖保護幾億元。

   一次搶劫的流程：
     智慧保全攔截 → 抽強盜 → 比防禦 → 成功率 → 金庫被撬開多少
     → 可拿到的現金 → 警方速度與保全減免打折 → 損失、恐慌、信用、設備損壞 → 保險理賠
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.robbery;

  class Robbery {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.robbery; }

    /* ---------------- 風險 ---------------- */
    /** 現金引來的注意力（0–100）。 */
    exposure(cash) {
      const c = cash != null ? cash : this.game.treasury.cash;
      return U.clamp(U.piecewise(C().exposure, c), 0, 100);
    }
    /** 這個現金量「應該要有」的防禦力。 */
    requiredDefense(cash) {
      const c = cash != null ? cash : this.game.treasury.cash;
      return Math.max(1, U.piecewiseLog(C().requiredDefense, c));
    }
    coverage() { return this.game.security.defense() / this.requiredDefense(); }
    /** 保全帶來的風險減免（0–0.95）。 */
    mitigation() {
      const cfg = C();
      return cfg.mitigationMax * (1 - Math.exp(-cfg.mitigationK * this.coverage()));
    }
    /** 目前搶劫風險值 0–100。 */
    risk() {
      const raw = this.exposure() * (1 - this.mitigation()) + this.game.events.mod('riskAdd', 0);
      return U.clamp(raw, 0, 100);
    }
    riskLabel(v) {
      const r = v != null ? v : this.risk();
      for (const l of C().riskLabels) if (r <= l.max) return l;
      return C().riskLabels[C().riskLabels.length - 1];
    }
    dailyChance() { return C().dailyChanceAtMaxRisk * this.risk() / 100; }

    /** 金庫保護不到、真正會被搬走的那部分現金。玩家最該盯著的數字。 */
    exposedCash() {
      return Math.max(0, this.game.treasury.cash - this.game.security.protectCap());
    }
    /**
     * 依「強盜出現機率 × 得手機率」加權的單次期望損失。
     * UI 的風險面板用這個數字告訴玩家：真的被盯上時，平均會失血多少。
     */
    expectedLoss() {
      const tier = this.cashTier();
      const list = BT.registries.robbers.all();
      let total = 0;
      for (const d of list) total += d.weights[tier] || 0;
      if (!total) return 0;
      const abort = this.game.security.abortChance();
      let sum = 0;
      for (const d of list) {
        const w = d.weights[tier] || 0;
        if (!w) continue;
        const p = this.preview(d.id);
        sum += (w / total) * p.pSuccess * p.expectedLoss;
      }
      return U.money(sum * (1 - abort));
    }
    /** 每年的期望搶劫損失（頻率 × 單次期望損失）。 */
    annualExpectedLoss() { return U.money(this.dailyChance() * 365 * this.expectedLoss()); }

    /** 現在被最強可能出現的強盜打中的話，大概會損失多少（UI 的「最大可能損失」）。 */
    worstCase() {
      const tier = this.cashTier();
      const cands = BT.registries.robbers.filter((d) => (d.weights[tier] || 0) > 0);
      let worst = 0;
      let who = null;
      for (const d of cands) {
        const p = this.preview(d.id);
        if (p.expectedLoss > worst) { worst = p.expectedLoss; who = d; }
      }
      return { loss: worst, def: who };
    }

    /** 現在的現金落在第幾個級距（強盜強度與出現權重用）。 */
    cashTier(cash) {
      const c = cash != null ? cash : this.game.treasury.cash;
      const tiers = BT.CASH_TIERS;
      for (let i = 0; i < tiers.length; i++) if (c < tiers[i]) return i;
      return tiers.length - 1;
    }

    /* ---------------- 強盜生成 ---------------- */
    pickRobber(rng, forceTier) {
      if (forceTier) {
        const d = BT.registries.robbers.get(forceTier);
        if (d) return d;
      }
      const tier = this.cashTier();
      const list = BT.registries.robbers.all();
      return U.weightedPick(rng, list, (r) => r.weights[tier] || 0) || list[0];
    }
    /** 現金規模對強盜強度的加成。 */
    attackScale(cash) {
      const cfg = C();
      const c = cash != null ? cash : this.game.treasury.cash;
      const decades = Math.log10(Math.max(1, c) / cfg.attackScaleBase);
      return U.clamp(1 + cfg.attackScalePerDecade * decades, 1, cfg.attackScaleMax);
    }
    makeRobber(rng, def) {
      const attack = U.randFloat(rng, def.attack[0], def.attack[1]) * this.attackScale();
      return { def, id: def.id, name: def.name, icon: def.icon, members: def.members, attack };
    }

    /** UI 預覽：現在被某等級的強盜盯上，大概會怎樣。 */
    preview(tierId) {
      const def = BT.registries.robbers.get(tierId) || this.pickRobber(Math.random);
      const sec = this.game.security;
      const attack = ((def.attack[0] + def.attack[1]) / 2) * this.attackScale();
      const eff = attack * sec.attackMult();
      const defense = sec.defense();
      const p = U.clamp(eff / (eff + defense), C().successMin, C().successMax);
      const cash = this.game.treasury.cash;
      const strength = sec.vaultStrength();
      const opened = strength > 0 ? U.clamp(eff / strength - 1, 0, 1) : 1;
      const breach = opened > 0;
      const unprotected = Math.max(0, cash - sec.protectCap());
      const accessible = unprotected + (cash - unprotected) * opened;
      const avgFrac = (def.lootFrac[0] + def.lootFrac[1]) / 2;
      const netCap = Math.max(0, this.game.totals().net) * C().maxLootFracOfNet;
      const loot = Math.min(
        Math.min(accessible * avgFrac, def.maxLoot)
          * (1 - C().policeLossMult * sec.policeSpeed())
          * (1 - C().lootMitigation * this.mitigation()),
        netCap > 0 ? netCap : Infinity
      );
      return { def, attack, eff, defense, pSuccess: p, breach, opened, accessible: U.money(accessible), expectedLoss: U.money(loot) };
    }

    /* ---------------- 搶劫結算 ---------------- */
    /**
     * 執行一次搶劫。回傳完整報告給 UI 彈窗顯示。
     * opts.tier 可指定強盜等級（事件用）。
     */
    attempt(rng, day, opts = {}) {
      const g = this.game;
      const cfg = C();
      const sec = g.security;
      const def = this.pickRobber(rng, opts.tier);
      const robber = this.makeRobber(rng, def);

      this.st.lastAttemptDay = day;
      g.state.stats.robberies += 1;

      const report = {
        day, robber: { id: robber.id, name: robber.name, icon: robber.icon, members: robber.members, attack: Math.round(robber.attack) },
        defense: Math.round(sec.defense()),
        vaultLevel: sec.levelOf('vault'),
        superVaultLevel: sec.levelOf('super_vault'),
        protectCap: sec.protectCap(),
        vaultStrength: Math.round(sec.vaultStrength()),
        cashBefore: g.treasury.cash,
        aborted: false, success: false, breached: false,
        loot: 0, payout: 0, damaged: [], injured: 0,
        creditDelta: 0, panicDelta: 0,
      };

      // 智慧保全在事情發生前就攔下來
      const abort = sec.abortChance();
      if (abort > 0 && rng() < abort) {
        report.aborted = true;
        g.state.stats.defended += 1;
        g.credit.add(cfg.smartAbortCredit || BT.CONFIG.credit.shock.robDefend, 'robDefend');
        g.upgrades.addXp(BT.CONFIG.upgrades.xpPerDefend);
        this._record(report);
        g.bus.emit('robbery:done', { report });
        return report;
      }

      const effAttack = robber.attack * sec.attackMult();
      report.effAttack = Math.round(effAttack);
      const defense = sec.defense();
      const pSuccess = U.clamp(effAttack / (effAttack + defense), cfg.successMin, cfg.successMax);
      report.pSuccess = pSuccess;
      const success = rng() < pSuccess;
      report.success = success;

      if (!success) {
        // 防守成功
        g.state.stats.defended += 1;
        g.credit.add(BT.CONFIG.credit.shock.robDefend, 'robDefend');
        report.creditDelta = BT.CONFIG.credit.shock.robDefend;
        g.upgrades.addXp(BT.CONFIG.upgrades.xpPerDefend);
        if (rng() < BT.CONFIG.security.damageOnDefendChance) {
          const id = this._pickDevice(rng);
          if (id) {
            const f = U.randFloat(rng, BT.CONFIG.security.damageOnDefend[0], BT.CONFIG.security.damageOnDefend[1]);
            sec.damage(id, f);
            report.damaged.push({ id, name: sec.def(id).name, lost: Math.round(f * 100) });
          }
        }
        if (sec.guards.count > 0 && rng() < cfg.guardInjureChanceDefend) {
          sec.injure(1);
          report.injured = 1;
        }
        this._record(report);
        g.bus.emit('robbery:done', { report });
        return report;
      }

      // 搶劫成功：先看金庫擋不擋得住。
      // 突破不是全有全無 —— 攻擊力剛好超過門檻只能撬開一小部分，
      // 要到門檻的兩倍才拿得到整個金庫。所以升級金庫永遠有效。
      const roll = U.randFloat(rng, cfg.breachRoll[0], cfg.breachRoll[1]);
      const strength = sec.vaultStrength();
      const ratio = strength > 0 ? (effAttack * roll) / strength : Infinity;
      const opened = U.clamp(ratio - 1, 0, 1);        // 0 = 金庫全守住，1 = 整個被搬空
      report.breached = opened > 0;
      report.breachRatio = U.round(ratio, 2);
      report.vaultOpened = U.round(opened, 2);
      const cash = g.treasury.cash;
      const unprotected = Math.max(0, cash - sec.protectCap());
      const protectedCash = cash - unprotected;
      const accessible = unprotected + protectedCash * opened;
      report.accessible = U.money(accessible);

      const frac = U.randFloat(rng, def.lootFrac[0], def.lootFrac[1]);
      let loot = Math.min(accessible * frac, def.maxLoot);
      loot *= 1 - cfg.policeLossMult * sec.policeSpeed();
      loot *= 1 - cfg.lootMitigation * this.mitigation();   // 保全充足時搬得走的也比較少
      // 一次搶劫最多帶走淨資產的四成：現場能搬的量有實體上限，
      // 也讓玩家在被重創之後還有翻身的機會。
      const netCap = Math.max(0, g.totals().net) * cfg.maxLootFracOfNet;
      loot = U.money(Math.min(loot, cash, netCap > 0 ? netCap : cash));
      report.loot = loot;

      if (loot > 0) {
        g.state.bank.cash = U.money(g.state.bank.cash - loot);
        g.reports.expense('robbery', loot);
        g.state.stats.stolen = U.money(g.state.stats.stolen + loot);
        if (loot > g.state.stats.robLossMax) g.state.stats.robLossMax = loot;
      }

      // 恐慌與信用（防彈玻璃會減輕）
      const panicMult = sec.panicMult();
      const lootRatio = cash > 0 ? loot / cash : 0;
      const panicAdd = (BT.CONFIG.customers.robPanicBase + BT.CONFIG.customers.robPanicLootMult * lootRatio) * panicMult;
      const creditAdd = (BT.CONFIG.credit.shock.robSuccess + BT.CONFIG.credit.shock.robSuccessLoot * lootRatio) * panicMult;
      g.customers.addPanic(panicAdd, 'robbery');
      g.credit.add(creditAdd, 'robbery');
      report.panicDelta = U.round(panicAdd, 1);
      report.creditDelta = Math.round(creditAdd);

      // 設備損壞
      const n = 1 + (rng() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const id = this._pickDevice(rng);
        if (!id) break;
        const f = U.randFloat(rng, BT.CONFIG.security.damageOnLoss[0], BT.CONFIG.security.damageOnLoss[1]);
        sec.damage(id, f);
        report.damaged.push({ id, name: sec.def(id).name, lost: Math.round(f * 100) });
      }
      if (sec.guards.count > 0 && rng() < cfg.guardInjureChanceLoss) {
        const inj = 1 + (rng() < 0.3 ? 1 : 0);
        sec.injure(inj);
        report.injured = inj;
      }

      // 保險理賠
      const payout = g.insurance.claim(loot, day);
      report.payout = payout;

      this._record(report);
      g.bus.emit('robbery:done', { report });
      return report;
    }

    _pickDevice(rng) {
      const ids = Object.keys(this.game.state.security.devices).filter((id) => this.game.security.condOf(id) > 0);
      if (!ids.length) return null;
      return U.pick(rng, ids);
    }

    _record(report) {
      this.st.history.push({
        day: report.day, tier: report.robber.id, name: report.robber.name,
        success: report.success, aborted: report.aborted, loot: report.loot, payout: report.payout,
      });
      if (this.st.history.length > 60) this.st.history.shift();
    }

    /** 每日判定要不要發生搶劫。 */
    tick(rng, day) {
      this.st.risk = U.round(this.risk(), 1);
      if (day < BT.CONFIG.start.graceDays) return null;
      if (day - this.st.lastAttemptDay < C().cooldownDays) return null;
      if (rng() >= this.dailyChance()) return null;
      return this.attempt(rng, day);
    }
  }

  BT.Robbery = Robbery;
})(typeof window !== 'undefined' ? window : globalThis);
