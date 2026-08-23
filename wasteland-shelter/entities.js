/* 末日餘生：荒野避難所 — 遊戲實體
 * Player / Enemy / ResourceNode / Chest / DroppedItem
 * 邏輯讀取 data.js 的資料表，本檔案不寫死任何數值。
 */
window.WSH = window.WSH || {};

WSH.Entities = (function () {
  "use strict";
  const D = WSH.Data;

  // ---------------- 背包工具（field bag 與 shelter storage 共用格式：{itemId: qty}） ----------------
  function invAdd(inv, itemId, qty) {
    inv[itemId] = (inv[itemId] || 0) + qty;
    if (inv[itemId] <= 0) delete inv[itemId];
  }
  function invRemove(inv, itemId, qty) {
    if (!inv[itemId] || inv[itemId] < qty) return false;
    inv[itemId] -= qty;
    if (inv[itemId] <= 0) delete inv[itemId];
    return true;
  }
  function invHas(inv, itemId, qty) { return (inv[itemId] || 0) >= qty; }
  function invWeight(inv) {
    let w = 0;
    for (const id in inv) { const it = D.ITEM_DATA[id]; if (it) w += it.weight * inv[id]; }
    return w;
  }

  // ================= Player =================
  class Player {
    constructor(state) {
      state = state || {};
      this.x = state.x != null ? state.x : 5;
      this.y = state.y != null ? state.y : 15;
      this.facing = state.facing || "right"; // right/left/up/down
      this.level = state.level || 1;
      this.xp = state.xp || 0;
      this.statPoints = state.statPoints || 0;
      this.skillPoints = state.skillPoints || 0;
      this.equipment = state.equipment || { weapon: null, armor: null };
      this.hp = state.hp != null ? state.hp : 0; // 下方 recomputeStats() 後會補上正確的滿血值
      this.inventory = state.inventory || {}; // field bag
      this.storage = state.storage || {}; // shelter storage box
      this.shelterLevel = state.shelterLevel || 1;
      this.unlockedRecipes = state.unlockedRecipes || D.RECIPE_DATA.map((r) => r.id);
      this.farm = state.farm || [{ plantedAt: null, plant: null }];
      this.mode = state.mode || "world";
      this.attackCooldown = 0;
      this.hurtFlash = 0;
      this.burn = null; // {dps, timeLeft}
      this.slowTimer = 0; // 冰霜詞綴：短暫降低移動速度
      this.invuln = 0;
      this.stats = null;
      this.recomputeStats();
      if (state.hp == null) this.hp = this.stats.maxHp;
    }

    recomputeStats() {
      const g = D.STAT_GROWTH;
      const lvBonus = this.level - 1;
      const s = Object.assign({}, D.PLAYER_BASE);
      s.maxHp = Math.round(D.PLAYER_BASE.maxHp + g.maxHp * lvBonus);
      s.atk = +(D.PLAYER_BASE.atk + g.atk * lvBonus).toFixed(1);
      s.def = +(D.PLAYER_BASE.def + g.def * lvBonus).toFixed(1);
      s.carryCapacity = +(D.PLAYER_BASE.carryCapacity + g.carryCapacity * lvBonus).toFixed(1);
      const w = this.equipment.weapon ? D.ITEM_DATA[this.equipment.weapon] : null;
      s.weaponAtk = w ? w.atk : 2;
      s.weaponRange = w ? w.range : 0.8;
      s.weaponAtkSpeed = w ? w.atkSpeed : 1.0;
      s.weaponCrit = w ? (w.critChance || 0) : 0;
      s.weaponCritDmg = w ? (w.critDamage || 0) : 0;
      s.gatherEff = D.PLAYER_BASE.gatherEff * (w && w.gatherBonus ? w.gatherBonus : 1);
      const a = this.equipment.armor ? D.ITEM_DATA[this.equipment.armor] : null;
      if (a) { s.def = +(s.def + (a.def || 0)).toFixed(1); s.maxHp = Math.round(s.maxHp + (a.hp || 0)); }
      this.stats = s;
    }

    get totalWeight() { return invWeight(this.inventory); }
    get carryCapacity() { return this.stats.carryCapacity; }
    get isOverweight() { return this.totalWeight > this.carryCapacity; }

    xpNeeded() { return D.xpForLevel(this.level); }

    gainXp(amount) {
      if (this.level >= D.maxLevel()) return [];
      this.xp += amount;
      const levels = [];
      while (this.level < D.maxLevel() && this.xp >= this.xpNeeded()) {
        this.xp -= this.xpNeeded();
        this.level++;
        this.statPoints += 1;
        if (this.level % 4 === 0) this.skillPoints += 1;
        const prevMax = this.stats.maxHp;
        this.recomputeStats();
        this.hp += this.stats.maxHp - prevMax;
        levels.push(this.level);
      }
      this.recomputeStats();
      return levels;
    }

    takeDamage(rawDmg) {
      const dmg = Math.max(1, Math.round(rawDmg - this.stats.def * 0.5));
      this.hp = Math.max(0, this.hp - dmg);
      this.hurtFlash = 0.25;
      this.invuln = 0.35;
      return dmg;
    }

    heal(amount) { this.hp = Math.min(this.stats.maxHp, this.hp + amount); }
    get isDead() { return this.hp <= 0; }

    addToBag(itemId, qty) { invAdd(this.inventory, itemId, qty); }

    equipSlot(slot, itemId) {
      if (!invRemove(this.inventory, itemId, 1)) return false;
      const old = this.equipment[slot];
      if (old) invAdd(this.inventory, old, 1);
      this.equipment[slot] = itemId;
      this.recomputeStats();
      return true;
    }
    unequipSlot(slot) {
      if (!this.equipment[slot]) return false;
      invAdd(this.inventory, this.equipment[slot], 1);
      this.equipment[slot] = null;
      this.recomputeStats();
      return true;
    }
    equipWeapon(itemId) { return this.equipSlot("weapon", itemId); }
    equipArmor(itemId) { return this.equipSlot("armor", itemId); }

    move(dx, dy, dt) {
      const len = Math.hypot(dx, dy);
      if (len < 0.0001) return;
      const speed = this.stats.moveSpeed * (this.isOverweight ? 0.6 : 1) * (this.slowTimer > 0 ? 0.5 : 1);
      this.x += (dx / len) * speed * dt;
      this.y += (dy / len) * speed * dt;
      if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? "right" : "left";
      else if (Math.abs(dy) > 0.001) this.facing = dy > 0 ? "down" : "up";
    }

    tick(dt) {
      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      if (this.hurtFlash > 0) this.hurtFlash -= dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.slowTimer > 0) this.slowTimer -= dt;
      if (this.burn) {
        this.hp = Math.max(0, this.hp - this.burn.dps * dt);
        this.burn.timeLeft -= dt;
        if (this.burn.timeLeft <= 0) this.burn = null;
      }
    }

    serialize() {
      return {
        x: this.x, y: this.y, facing: this.facing, level: this.level, xp: this.xp,
        statPoints: this.statPoints, skillPoints: this.skillPoints, hp: this.hp,
        equipment: this.equipment, inventory: this.inventory, storage: this.storage,
        shelterLevel: this.shelterLevel, unlockedRecipes: this.unlockedRecipes, farm: this.farm, mode: this.mode,
      };
    }
  }

  // ================= Enemy =================
  let enemyUid = 1;
  class Enemy {
    constructor(typeId, level, x, y) {
      const def = D.ENEMY_DATA[typeId];
      this.uid = enemyUid++;
      this.typeId = typeId;
      this.typeDef = def; // ENEMY_DATA 定義（技能/AI/掉落表等靜態資料）
      this.tier = def.tier;
      this.name = def.name;
      this.icon = def.icon;
      this.level = level != null ? level : (def.level || def.levelRange[0]);
      this.affixes = (def.affixes || []).slice();
      // 精英怪額外隨機詞綴：詞綴越多，怪物越強、掉落越好
      if (def.tier === "elite") {
        const pool = Object.keys(D.AFFIX_DATA).filter((a) => !this.affixes.includes(a));
        const roll = Math.random();
        const extraCount = roll < 0.3 ? 0 : roll < 0.75 ? 1 : 2;
        for (let i = 0; i < extraCount && pool.length; i++) {
          const idx = Math.floor(Math.random() * pool.length);
          this.affixes.push(pool.splice(idx, 1)[0]);
        }
      }
      const affixMul = 1 + this.affixes.length * 0.12;
      const lvMul = (1 + (this.level - 1) * 0.16) * affixMul;
      this.maxHp = Math.round(def.baseHp * lvMul);
      this.hp = this.maxHp;
      this.atk = +(def.baseAtk * lvMul).toFixed(1);
      this.def = +(def.baseDef * (1 + (this.level - 1) * 0.08)).toFixed(1); // 數值：防禦力（戰鬥公式用），與 typeDef 分開存放
      this.speed = def.speed * (this.affixes.includes("haste") ? (D.AFFIX_DATA.haste.speedMul || 1) : 1);
      this.x = x; this.y = y; this.homeX = x; this.homeY = y;
      this.state = "idle"; // idle / alert / chase / attack / charging / dead
      this.atkTimer = 0;
      this.stateTimer = 0;
      this.deadTimer = 0;
      this.respawnTimer = 0;
      this.hurtFlash = 0;
      this.enraged = false;
      this.chargeDir = null;
      this.facing = "right";
      this.buried = def.ai === "burrow";
      this.lootGiven = false;
    }

    get isDead() { return this.state === "dead"; }

    get affixLootBonus() { return this.affixes.length * 0.25; } // 詞綴越多，額外寶箱機率越高

    takeDamage(dmg, isCrit) {
      this.hp = Math.max(0, this.hp - dmg);
      this.hurtFlash = 0.18;
      if (this.hp <= 0 && this.state !== "dead") {
        this.state = "dead";
        this.deadTimer = 1.1;
        this.respawnTimer = this.typeDef.respawnSec || (this.tier === "boss" ? 240 : this.tier === "elite" ? 90 : 35);
      } else if (this.state === "idle") {
        this.state = "alert"; this.stateTimer = 0.15;
      }
      return { dmg, isCrit };
    }

    // 死亡後經過 respawnSec 秒，原地滿血重生（等級在原本區間內重新隨機）
    respawn() {
      const def = this.typeDef;
      if (def.levelRange) this.level = D.rng.randInt(Math.random, def.levelRange[0], def.levelRange[1]);
      const affixMul = 1 + this.affixes.length * 0.12;
      const lvMul = (1 + (this.level - 1) * 0.16) * affixMul;
      this.maxHp = Math.round(def.baseHp * lvMul);
      this.hp = this.maxHp;
      this.atk = +(def.baseAtk * lvMul).toFixed(1);
      this.def = +(def.baseDef * (1 + (this.level - 1) * 0.08)).toFixed(1);
      this.x = this.homeX; this.y = this.homeY;
      this.state = "idle";
      this.atkTimer = 0; this.stateTimer = 0; this.deadTimer = 0; this.respawnTimer = 0;
      this.hurtFlash = 0; this.enraged = false; this.chargeDir = null;
      this.buried = def.ai === "burrow";
      this.lootGiven = false;
    }

    distTo(px, py) { return Math.hypot(this.x - px, this.y - py); }

    // 回傳 'attack' 表示這一幀對玩家造成一次攻擊判定
    updateAI(dt, player, allEnemies) {
      if (this.state === "dead") return null;
      if (this.atkTimer > 0) this.atkTimer -= dt;
      if (this.hurtFlash > 0) this.hurtFlash -= dt;
      const def = this.typeDef;
      const distToPlayer = this.distTo(player.x, player.y);

      // 潛伏中：玩家靠近才會現身開始行動
      if (this.buried) {
        if (distToPlayer <= (def.revealRange || 2.5)) { this.buried = false; this.state = "alert"; this.stateTimer = 0.15; }
        return null;
      }

      // 感知/呼叫同伴
      if (this.state === "idle") {
        if (distToPlayer <= def.aggroRange) { this.state = "chase"; }
        else if (def.ai === "pack") {
          for (const o of allEnemies) {
            if (o !== this && o.typeId === this.typeId && o.state !== "idle" && o.state !== "dead" && this.distTo(o.x, o.y) <= (def.packRange || 5)) {
              this.state = "chase"; break;
            }
          }
        }
        return null;
      }

      if (def.ai === "boss_bear") return this.updateBoss(dt, player, def);
      if (def.ai === "charge") return this.updateCharge(dt, player, def, distToPlayer);
      if (def.ai === "flyer") return this.updateFlyer(dt, player, def, distToPlayer);
      return this.updateGeneric(dt, player, def, distToPlayer);
    }

    faceTowards(px, py) {
      const dx = px - this.x, dy = py - this.y;
      if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? "right" : "left";
      else this.facing = dy > 0 ? "down" : "up";
    }

    stepToward(px, py, speed, dt) {
      const dx = px - this.x, dy = py - this.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.05) return;
      this.x += (dx / len) * speed * dt;
      this.y += (dy / len) * speed * dt;
      this.faceTowards(px, py);
    }

    updateGeneric(dt, player, def, dist) {
      // 變異鼠：受傷時會短暫逃竄
      if (def.ai === "skittish" && this.hurtFlash > 0 && dist < 2) {
        this.stepToward(2 * this.x - player.x, 2 * this.y - player.y, this.speed * 1.3, dt);
        return null;
      }
      if (dist <= def.atkRange) {
        this.faceTowards(player.x, player.y);
        if (this.atkTimer <= 0) { this.atkTimer = def.atkCooldown; return "attack"; }
        return null;
      }
      if (dist <= def.aggroRange * 1.6) {
        this.stepToward(player.x, player.y, this.speed, dt);
      } else {
        this.state = "idle";
      }
      return null;
    }

    updateCharge(dt, player, def, dist) {
      if (this.state === "charging") {
        this.stateTimer -= dt;
        this.x += this.chargeDir.x * def.chargeSpeed * dt;
        this.y += this.chargeDir.y * def.chargeSpeed * dt;
        if (this.stateTimer <= 0) this.state = "chase";
        if (this.distTo(player.x, player.y) <= def.atkRange && this.atkTimer <= 0) {
          this.atkTimer = def.atkCooldown; return "attack";
        }
        return null;
      }
      if (dist <= def.atkRange) {
        this.faceTowards(player.x, player.y);
        if (this.atkTimer <= 0) { this.atkTimer = def.atkCooldown; return "attack"; }
        return null;
      }
      if (dist <= def.aggroRange * 1.7) {
        if (dist > 2.2 && Math.random() < 0.02) {
          const dx = player.x - this.x, dy = player.y - this.y, len = Math.hypot(dx, dy) || 1;
          this.chargeDir = { x: dx / len, y: dy / len };
          this.state = "charging"; this.stateTimer = 0.7;
          this.faceTowards(player.x, player.y);
        } else {
          this.stepToward(player.x, player.y, this.speed, dt);
        }
      } else this.state = "idle";
      return null;
    }

    updateBoss(dt, player, def) {
      if (!this.enraged && this.hp <= this.maxHp * def.enrageHpPct) {
        this.enraged = true;
      }
      const atkCd = this.enraged ? def.atkCooldown * 0.6 : def.atkCooldown;
      const speed = this.enraged ? this.speed * 1.25 : this.speed;
      const dist = this.distTo(player.x, player.y);
      if (dist <= def.atkRange) {
        this.faceTowards(player.x, player.y);
        if (this.atkTimer <= 0) {
          this.atkTimer = atkCd;
          this.lastAttackWasSlam = this.enraged && Math.random() < 0.4;
          return this.lastAttackWasSlam ? "slam" : "attack";
        }
        return null;
      }
      this.stepToward(player.x, player.y, speed, dt);
      return null;
    }

    // 飛行類：在玩家周圍盤旋，時機到了俯衝攻擊後迅速拉開距離
    updateFlyer(dt, player, def, dist) {
      const hoverDist = 2.2;
      if (this.state === "diving") {
        this.stepToward(player.x, player.y, def.diveSpeed, dt);
        this.stateTimer -= dt;
        if (dist <= def.atkRange && this.atkTimer <= 0) {
          this.atkTimer = def.atkCooldown; this.state = "retreating"; this.stateTimer = 0.9;
          return "attack";
        }
        if (this.stateTimer <= 0) { this.state = "retreating"; this.stateTimer = 0.9; }
        return null;
      }
      if (this.state === "retreating") {
        this.stateTimer -= dt;
        this.stepToward(2 * this.x - player.x, 2 * this.y - player.y, this.speed, dt);
        if (this.stateTimer <= 0) this.state = "chase";
        return null;
      }
      if (dist > def.aggroRange * 1.6) { this.state = "idle"; return null; }
      if (dist > hoverDist * 1.4) {
        this.stepToward(player.x, player.y, this.speed, dt);
      } else if (dist < hoverDist * 0.7) {
        this.stepToward(2 * this.x - player.x, 2 * this.y - player.y, this.speed * 0.6, dt);
      } else if (this.atkTimer <= 0 && Math.random() < 0.02) {
        this.state = "diving"; this.stateTimer = 1.2;
      }
      return null;
    }
  }

  // ================= ResourceNode =================
  class ResourceNode {
    constructor(type, x, y) {
      const def = D.NODE_DATA[type];
      this.type = type; this.def = def; this.x = x; this.y = y;
      this.hp = def.hp; this.maxHp = def.hp;
      this.depleted = false; this.respawnTimer = 0; this.hitFlash = 0;
    }
    tick(dt) {
      if (this.hitFlash > 0) this.hitFlash -= dt;
      if (this.depleted) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) { this.depleted = false; this.hp = this.maxHp; }
      }
    }
    gather(dmg) {
      if (this.depleted) return null;
      this.hp -= dmg; this.hitFlash = 0.12;
      const drop = { item: this.def.item, qty: D.rng.pickQty(Math.random, this.def.qtyPerHit) };
      let bonus = null;
      if (this.def.bonusItem && Math.random() < this.def.bonusChance) bonus = { item: this.def.bonusItem, qty: 1 };
      if (this.hp <= 0) { this.depleted = true; this.respawnTimer = this.def.respawnSec; }
      return { drop, bonus, depleted: this.depleted };
    }
  }

  // ================= Chest =================
  class Chest {
    constructor(tier, x, y) {
      this.tier = tier; this.def = D.CHEST_DATA[tier]; this.x = x; this.y = y; this.opened = false;
    }
  }

  // ================= DroppedItem =================
  let dropUid = 1;
  class DroppedItem {
    constructor(itemId, qty, x, y) {
      this.uid = dropUid++; this.itemId = itemId; this.qty = qty; this.x = x; this.y = y;
      this.bornAt = performance.now();
    }
  }

  return { Player, Enemy, ResourceNode, Chest, DroppedItem, invAdd, invRemove, invHas, invWeight };
})();
