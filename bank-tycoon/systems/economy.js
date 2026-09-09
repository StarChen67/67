/* ============================================================
   systems/economy.js — 總體經濟
   景氣階段狀態機、市場基準利率隨機漫步、通膨。
   對外提供：phase()、costMult()、demandedRate()。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.economy;

  class Economy {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.economy; }

    /** 目前景氣階段的定義（driftAdd / volMult / arrivalMult / withdrawMult）。 */
    phase() { return C().phases[this.st.phase] || C().phases.normal; }
    phaseName() { return this.phase().name; }

    /** 通膨造成的成本倍率：升級、保全、營運費都乘這個。 */
    costMult() { return 1 + this.st.inflation / 100; }

    /** 客戶心裡期望的存款利率。低於這個就會開始流失。 */
    demandedRate() {
      return this.st.marketRate * (1 + this.st.inflation / C().inflationRateDiv);
    }

    setPhase(id, reason) {
      if (!C().phases[id] || this.st.phase === id) return false;
      const from = this.st.phase;
      this.st.phase = id;
      this.st.phaseDay = 0;
      this.game.bus.emit('economy:phase', { from, to: id, reason });
      return true;
    }

    addInflation(v) {
      this.st.inflation = U.clamp(this.st.inflation + v, 0, C().inflationMax);
    }

    addMarketRate(v) {
      this.st.marketRate = U.clamp(this.st.marketRate + v, C().rateMin, C().rateMax);
    }

    /** 每日推進。simulation 呼叫。 */
    tick(rng) {
      const cfg = C();
      const st = this.st;
      st.phaseDay += 1;

      // 景氣階段轉移
      const to = this.phase().to || {};
      for (const [target, p] of Object.entries(to)) {
        if (rng() < p) { this.setPhase(target, 'random'); break; }
      }

      // 市場利率：均值回歸 + 雜訊
      const r = st.marketRate;
      st.marketRate = U.clamp(
        r + cfg.rateMeanRevert * (cfg.baseRate - r) + U.gauss(rng) * cfg.rateNoise,
        cfg.rateMin, cfg.rateMax
      );

      // 通膨自然衰退
      if (st.inflation > 0) {
        st.inflation = Math.max(0, st.inflation * (1 - cfg.inflationDecay));
        if (st.inflation < 0.01) st.inflation = 0;
      }
    }
  }

  BT.Economy = Economy;
})(typeof window !== 'undefined' ? window : globalThis);
