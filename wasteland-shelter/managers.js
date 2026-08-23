/* 末日餘生：荒野避難所 — 系統管理器
 * CombatManager / LootManager / SaveManager
 * （背包相關的純函式在 entities.js 的 invAdd/invRemove/invHas/invWeight）
 */
window.WSH = window.WSH || {};

WSH.Managers = (function () {
  "use strict";
  const D = WSH.Data;
  const E = WSH.Entities;

  // ================= Combat =================
  const CombatManager = {
    // 玩家攻擊：以面向方向做一個扇形/距離判定，回傳本次攻擊命中的結果陣列
    playerAttack(player, state) {
      if (player.attackCooldown > 0) return null;
      const s = player.stats;
      player.attackCooldown = 1 / s.weaponAtkSpeed;
      const range = s.weaponRange + 0.5;
      const hits = [];
      for (const en of state.enemies) {
        if (en.isDead) continue;
        const dx = en.x - player.x, dy = en.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist > range) continue;
        if (!this.inFacingArc(player.facing, dx, dy)) continue;
        const isCrit = Math.random() < (s.critChance + s.weaponCrit);
        let dmg = Math.max(1, Math.round((s.atk + s.weaponAtk) - en.def));
        if (isCrit) dmg = Math.round(dmg * (s.critDamage + s.weaponCritDmg));
        if (en.affixes && en.affixes.includes("armor")) dmg = Math.max(1, Math.round(dmg * (1 - D.AFFIX_DATA.armor.dmgReduction)));
        en.takeDamage(dmg, isCrit);
        // 小小的擊退
        const len = dist || 1;
        en.x += (dx / len) * 0.35; en.y += (dy / len) * 0.35;
        hits.push({ enemy: en, dmg, isCrit });
      }
      // 採集：也用同一個攻擊動作打資源點
      for (const node of state.resourceNodes) {
        if (node.depleted) continue;
        const dx = node.x - player.x, dy = node.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist > range) continue;
        if (!this.inFacingArc(player.facing, dx, dy)) continue;
        const gatherDmg = Math.round(node.def.gatherDmg * s.gatherEff);
        const res = node.gather(gatherDmg);
        if (res) hits.push({ node, gather: res });
      }
      return hits;
    },

    inFacingArc(facing, dx, dy) {
      // 面向與目標方向夾角在 ~100 度內都算打到（比純直線寬鬆一點，手感更好）
      const angMap = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
      const targetAng = Math.atan2(dy, dx);
      let diff = Math.abs(targetAng - angMap[facing]);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      return diff <= (Math.PI * 0.62);
    },

    enemyAttack(enemy, player, kind) {
      const def = enemy.typeDef;
      let atk = enemy.atk;
      let radius = def.atkRange + 0.15;
      if (kind === "slam") { atk = Math.round(atk * 1.6); radius = def.atkRange + 1.1; }
      const dist = enemy.distTo(player.x, player.y);
      if (dist > radius) return null;
      if (player.invuln > 0 && kind !== "slam") return null;
      const dmg = player.takeDamage(atk);
      if (enemy.affixes) {
        if (enemy.affixes.includes("poison")) player.burn = { dps: Math.max(1, Math.round(atk * 0.25)), timeLeft: 5 };
        else if (enemy.affixes.includes("flame")) player.burn = { dps: Math.max(1, Math.round(atk * 0.15)), timeLeft: 3 };
        if (enemy.affixes.includes("frost")) player.slowTimer = 2;
        if (enemy.affixes.includes("vampiric")) enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.round(dmg * D.AFFIX_DATA.vampiric.lifestealPct));
      }
      return { dmg, kind: kind || "attack" };
    },
  };

  // ================= Loot =================
  const LootManager = {
    // table: [{item, chance, qty}] 或 [{chest:tier, chance}]（同一掉落表可有多個 chest 項目，各自獨立判定）；luck 微幅提升掉落機率
    roll(table, luck) {
      const mul = 1 + Math.max(0, (luck || 1) - 1) * 0.15;
      const items = [];
      const chestTiers = [];
      for (const entry of table) {
        if (Math.random() < Math.min(1, entry.chance * mul)) {
          if (entry.chest) { chestTiers.push(entry.chest); continue; }
          items.push({ item: entry.item, qty: D.rng.pickQty(Math.random, entry.qty) });
        }
      }
      return { items, chestTiers };
    },
    rollChest(tier, luck) {
      const def = D.CHEST_DATA[tier];
      return this.roll(def.table, luck);
    },
  };

  // ================= Save =================
  const SAVE_KEY = "wasteland_shelter_save_v1";
  const SaveManager = {
    save(player) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), player: player.serialize() }));
        return true;
      } catch (e) { console.warn("save failed", e); return false; }
    },
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data.player || null;
      } catch (e) { console.warn("load failed", e); return null; }
    },
    reset() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },
    hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  };

  return { CombatManager, LootManager, SaveManager, SAVE_KEY };
})();
