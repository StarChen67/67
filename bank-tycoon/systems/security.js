/* ============================================================
   systems/security.js — 保全設備與保全人員
   把 data/security.js 的設備彙總成六個對搶劫有意義的數字：
     defense        總防禦力（對抗強盜攻擊）
     attackMult     降低強盜攻擊力（監視器、門禁、智慧系統相乘）
     policeSpeed    警方到達速度（減少被搬走的金額）
     panicMult      搶劫後恐慌與信用衝擊的折扣（防彈玻璃）
     abortChance    搶劫發生前就被擋下的機率（智慧保全）
     protectCap     金庫保護的現金上限
     vaultStrength  突破金庫所需的攻擊力

   維護費每日照付，付不出會變成待付義務 —— 所以不能無腦升滿。
   設備會因為搶劫或故障掉耐久，耐久直接打折它的防禦與保護額。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;
  const U = BT.util;
  const C = () => BT.CONFIG.security;

  class Security {
    constructor(game) { this.game = game; }
    get st() { return this.game.state.security; }
    get guards() { return this.st.guards; }

    /* ---------------- 查詢 ---------------- */
    def(id) { return BT.registries.security.get(id); }
    levelOf(id) { const d = this.st.devices[id]; return d ? d.level : 0; }
    condOf(id) { const d = this.st.devices[id]; return d ? d.cond : 100; }
    /** 某設備目前等級的數值。 */
    stats(id) {
      const def = this.def(id);
      const lv = this.levelOf(id);
      if (!def || lv <= 0) return null;
      return def.levels[lv - 1];
    }
    nextStats(id) {
      const def = this.def(id);
      const lv = this.levelOf(id);
      if (!def || lv >= def.levels.length) return null;
      return def.levels[lv];
    }
    /** 全部設備（含還沒蓋的），UI 依 order 排序顯示。 */
    devices() {
      return BT.registries.security.all().slice().sort((a, b) => a.order - b.order);
    }

    /** 某設備的下一級解鎖了嗎。 */
    canBuild(id) {
      const def = this.def(id);
      if (!def) return { ok: false, why: '找不到設備' };
      const lv = this.levelOf(id);
      if (lv >= def.levels.length) return { ok: false, why: '已達最高等級' };
      if (def.feature && !this.game.upgrades.unlocked(def.feature)) {
        return { ok: false, why: `需要 Lv.${this.game.upgrades.featureLevel(def.feature)} 銀行` };
      }
      const target = lv + 1;
      const lf = def.levelFeature && def.levelFeature[target];
      if (lf && !this.game.upgrades.unlocked(lf)) {
        return { ok: false, why: `需要 Lv.${this.game.upgrades.featureLevel(lf)} 銀行` };
      }
      const cost = this.buildCost(id);
      if (this.game.treasury.cash < cost) return { ok: false, why: '現金不足' };
      return { ok: true, cost };
    }
    buildCost(id) {
      const def = this.def(id);
      const lv = this.levelOf(id);
      if (!def || lv >= def.levels.length) return null;
      return U.money(def.levels[lv].cost * this.game.economy.costMult());
    }

    build(id) {
      const chk = this.canBuild(id);
      if (!chk.ok) return chk;
      if (!this.game.treasury.spend(chk.cost, 'upgrade')) return { ok: false, why: '現金不足' };
      const d = this.st.devices[id] || (this.st.devices[id] = { level: 0, cond: 100 });
      d.level += 1;
      d.cond = 100;            // 升級順便整修
      this.game.bus.emit('security:build', { id, level: d.level, cost: chk.cost });
      return { ok: true, id, level: d.level, cost: chk.cost };
    }

    /* ---------------- 維修 ---------------- */
    repairCost(id) {
      const s = this.stats(id);
      if (!s) return 0;
      const lost = (100 - this.condOf(id)) / 100;
      if (lost <= 0) return 0;
      return U.money(s.cost * lost * C().repairCostFrac * this.game.economy.costMult());
    }
    repair(id) {
      const cost = this.repairCost(id);
      if (!cost) return { ok: false, why: '不需要維修' };
      if (!this.game.treasury.spend(cost, 'repair')) return { ok: false, why: '現金不足' };
      this.st.devices[id].cond = 100;
      this.game.bus.emit('security:repair', { id, cost });
      return { ok: true, cost };
    }
    repairAllCost() {
      return U.sum(Object.keys(this.st.devices), (id) => this.repairCost(id));
    }
    repairAll() {
      let spent = 0;
      let n = 0;
      for (const id of Object.keys(this.st.devices)) {
        const r = this.repair(id);
        if (r.ok) { spent += r.cost; n += 1; }
      }
      return { ok: n > 0, spent, count: n };
    }
    /** 事件與搶劫用：讓設備掉耐久。 */
    damage(id, frac) {
      const d = this.st.devices[id];
      if (!d) return 0;
      const before = d.cond;
      d.cond = U.clamp(d.cond - frac * 100, C().condMin, 100);
      return before - d.cond;
    }
    damagedList() {
      return Object.keys(this.st.devices).filter((id) => this.condOf(id) < 100);
    }

    /* ---------------- 保全人員 ---------------- */
    maxGuards() { return this.game.upgrades.level().maxGuards; }
    guardsUnlocked() { return this.game.upgrades.unlocked('guards'); }
    guardDefense() {
      const cfg = C();
      const g = this.guards;
      if (g.count <= 0) return 0;
      const per = cfg.guardBaseDefense + cfg.guardEquipDefense * g.equip + cfg.guardTrainDefense * g.training;
      const active = Math.max(0, g.count - g.injured);
      return per * active;
    }
    guardWage() {
      const cfg = C();
      const g = this.guards;
      const per = cfg.guardBaseWage + cfg.guardEquipWage * g.equip + cfg.guardTrainWage * g.training;
      return U.money(per * g.count * this.game.economy.costMult());
    }
    hireCost(n) { return U.money(C().guardHireCost * (n || 1) * this.game.economy.costMult()); }
    hire(n) {
      n = Math.max(1, Math.floor(n || 1));
      if (!this.guardsUnlocked()) return { ok: false, why: `需要 Lv.${this.game.upgrades.featureLevel('guards')} 銀行` };
      const room = this.maxGuards() - this.guards.count;
      if (room <= 0) return { ok: false, why: '人數已達上限' };
      n = Math.min(n, room);
      const cost = this.hireCost(n);
      if (!this.game.treasury.spend(cost, 'upgrade')) return { ok: false, why: '現金不足' };
      this.guards.count += n;
      this.game.bus.emit('security:hire', { n, cost });
      return { ok: true, n, cost };
    }
    fire(n) {
      n = Math.max(1, Math.floor(n || 1));
      n = Math.min(n, this.guards.count);
      if (n <= 0) return { ok: false, why: '沒有保全可以解僱' };
      this.guards.count -= n;
      this.guards.injured = Math.min(this.guards.injured, this.guards.count);
      return { ok: true, n };
    }
    equipCost() {
      const g = this.guards;
      if (g.equip >= C().guardMaxEquip) return null;
      return U.money(C().guardEquipCost * g.equip * Math.max(1, g.count) * this.game.economy.costMult());
    }
    upgradeEquip() {
      const cost = this.equipCost();
      if (cost == null) return { ok: false, why: '裝備已達最高等級' };
      if (this.guards.count <= 0) return { ok: false, why: '還沒有保全人員' };
      if (!this.game.treasury.spend(cost, 'upgrade')) return { ok: false, why: '現金不足' };
      this.guards.equip += 1;
      return { ok: true, level: this.guards.equip, cost };
    }
    trainCost() {
      const g = this.guards;
      if (g.training >= C().guardMaxTraining) return null;
      return U.money(C().guardTrainCost * g.training * Math.max(1, g.count) * this.game.economy.costMult());
    }
    upgradeTraining() {
      const cost = this.trainCost();
      if (cost == null) return { ok: false, why: '訓練已達最高等級' };
      if (this.guards.count <= 0) return { ok: false, why: '還沒有保全人員' };
      if (!this.game.treasury.spend(cost, 'upgrade')) return { ok: false, why: '現金不足' };
      this.guards.training += 1;
      return { ok: true, level: this.guards.training, cost };
    }
    injure(n) {
      this.guards.injured = U.clamp(this.guards.injured + n, 0, this.guards.count);
    }

    /* ---------------- 彙總數值 ---------------- */
    /** 所有設備 + 保全人員的總防禦力（耐久會打折）。 */
    defense() {
      let d = 0;
      for (const id of Object.keys(this.st.devices)) {
        const s = this.stats(id);
        if (!s) continue;
        d += (s.defense || 0) * (this.condOf(id) / 100);
      }
      return d + this.guardDefense();
    }
    attackMult() {
      let m = 1;
      for (const id of Object.keys(this.st.devices)) {
        const s = this.stats(id);
        if (!s || s.attackMult == null) continue;
        // 耐久越低，效果越接近沒有
        const cond = this.condOf(id) / 100;
        m *= 1 - (1 - s.attackMult) * cond;
      }
      return m;
    }
    policeSpeed() {
      let v = 0;
      for (const id of Object.keys(this.st.devices)) {
        const s = this.stats(id);
        if (!s || s.policeSpeed == null) continue;
        v = Math.max(v, s.policeSpeed * (this.condOf(id) / 100));
      }
      return v;
    }
    panicMult() {
      let v = 1;
      for (const id of Object.keys(this.st.devices)) {
        const s = this.stats(id);
        if (!s || s.panicMult == null) continue;
        const cond = this.condOf(id) / 100;
        v = Math.min(v, 1 - (1 - s.panicMult) * cond);
      }
      return v;
    }
    abortChance() {
      let v = 0;
      for (const id of Object.keys(this.st.devices)) {
        const s = this.stats(id);
        if (!s || s.abortChance == null) continue;
        v = Math.max(v, s.abortChance * (this.condOf(id) / 100));
      }
      return v;
    }
    protectCap() {
      let v = 0;
      for (const id of Object.keys(this.st.devices)) {
        const s = this.stats(id);
        if (!s || s.protectCap == null) continue;
        v += s.protectCap * (this.condOf(id) / 100);
      }
      return U.money(v);
    }
    vaultStrength() {
      let v = 0;
      for (const id of Object.keys(this.st.devices)) {
        const s = this.stats(id);
        if (!s || s.breachStrength == null) continue;
        v = Math.max(v, s.breachStrength * (this.condOf(id) / 100));
      }
      return v;
    }
    /** 每日維護費（設備 + 薪資）。 */
    maintCost() {
      let m = 0;
      for (const id of Object.keys(this.st.devices)) {
        const s = this.stats(id);
        if (!s) continue;
        m += s.maint || 0;
      }
      return U.money(m * this.game.economy.costMult() * this.game.events.mod('maintMult'));
    }
    dailyCost() { return U.money(this.maintCost() + this.guardWage()); }

    /** 保全整體評分（0–100），UI 的「保全等級」。 */
    grade() {
      const need = this.game.robbery.requiredDefense();
      if (need <= 0) return 100;
      return U.clamp(Math.round((this.defense() / need) * 100), 0, 999);
    }

    tick(day) {
      const g = this.game;
      // 維護費與薪資
      const maint = this.maintCost();
      const wage = this.guardWage();
      if (maint > 0) g.treasury.charge(maint, 'maint', { kind: 'other', day, label: '保全維護費' });
      if (wage > 0) g.treasury.charge(wage, 'wage', { kind: 'other', day, label: '保全薪資' });
      g.state.stats.securityPaid = U.money(g.state.stats.securityPaid + maint + wage);

      // 受傷的保全慢慢歸隊
      if (this.guards.injured > 0) {
        this.guards.healAcc = (this.guards.healAcc || 0) + 1;
        if (this.guards.healAcc >= C().guardHealDays) {
          this.guards.healAcc = 0;
          this.guards.injured = Math.max(0, this.guards.injured - 1);
        }
      }
      return { maint, wage };
    }
  }

  BT.Security = Security;
})(typeof window !== 'undefined' ? window : globalThis);
