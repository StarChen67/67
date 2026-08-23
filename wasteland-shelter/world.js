/* 末日餘生：荒野避難所 — 野外探索世界
 * 地圖狀態建立、AI/採集點 tick、碰撞、camera 與 canvas 渲染。
 */
window.WSH = window.WSH || {};

WSH.World = (function () {
  "use strict";
  const D = WSH.Data;
  const E = WSH.Entities;
  const M = WSH.Managers;

  function buildWorldState(mapId) {
    const map = D.MAP_DATA[mapId];
    const resourceNodes = map.resourceNodes.map((n) => new E.ResourceNode(n.type, n.x, n.y));
    const enemies = map.enemySpawns.map((s) => {
      const def = D.ENEMY_DATA[s.type];
      const lv = def.levelRange ? D.rng.randInt(Math.random, def.levelRange[0], def.levelRange[1]) : def.level;
      return new E.Enemy(s.type, lv, s.x, s.y);
    });
    enemies.push(new E.Enemy(map.bossSpawn.type, null, map.bossSpawn.x, map.bossSpawn.y));
    const chests = map.chestSpawns.map((c) => new E.Chest(c.tier, c.x, c.y));
    return {
      map, resourceNodes, enemies, chests, dropped: [],
      floatTexts: [], particles: [], camera: { x: map.playerStart.x, y: map.playerStart.y },
      pendingEvents: [], // {type, ...} 給 main.js / ui.js 消費
    };
  }

  function spawnFloatText(state, x, y, text, color) {
    state.floatTexts.push({ x, y, text, color, life: 0.9, vy: -1.1 });
  }

  function dropLoot(state, x, y, lootResult, luck) {
    for (const it of lootResult.items) {
      const jx = x + (Math.random() - 0.5) * 0.8, jy = y + (Math.random() - 0.5) * 0.8;
      state.dropped.push(new E.DroppedItem(it.item, it.qty, jx, jy));
    }
    (lootResult.chestTiers || []).forEach((tier, i) => {
      state.chests.push(new E.Chest(tier, x + 0.4 + i * 0.5, y + 0.4));
      state.pendingEvents.push({ type: "chestSpawned", tier });
    });
  }

  function update(dt, state, player) {
    for (const node of state.resourceNodes) node.tick(dt);

    for (let i = state.floatTexts.length - 1; i >= 0; i--) {
      const f = state.floatTexts[i];
      f.life -= dt; f.y += f.vy * dt;
      if (f.life <= 0) state.floatTexts.splice(i, 1);
    }

    for (const en of state.enemies) {
      if (en.isDead) continue;
      const result = en.updateAI(dt, player, state.enemies);
      if (result === "attack" || result === "slam") {
        const hit = M.CombatManager.enemyAttack(en, player, result);
        if (hit) spawnFloatText(state, player.x, player.y - 0.3, "-" + hit.dmg, result === "slam" ? "#ff5d73" : "#ffb3bd");
      }
    }
    // 死亡流程：屍體動畫播完 → 結算經驗與掉落（僅一次）→ 倒數重生計時 → 原地重生
    for (const en of state.enemies) {
      if (!en.isDead) continue;
      if (en.deadTimer > 0) {
        en.deadTimer -= dt;
      } else if (!en.lootGiven) {
        en.lootGiven = true;
        const xpGain = Math.round(en.typeDef.xpBase * (1 + (en.level - 1) * 0.12));
        state.pendingEvents.push({ type: "enemyKilled", name: en.name, tier: en.tier, xp: xpGain });
        const levels = player.gainXp(xpGain);
        if (levels.length) state.pendingEvents.push({ type: "levelUp", levels });
        const loot = M.LootManager.roll(en.typeDef.loot, player.stats.luck);
        dropLoot(state, en.x, en.y, loot, player.stats.luck);
      } else {
        en.respawnTimer -= dt;
        if (en.respawnTimer <= 0) en.respawn();
      }
    }

    // 拾取掉落物（走過去自動拾取）
    for (let i = state.dropped.length - 1; i >= 0; i--) {
      const d = state.dropped[i];
      if (Math.hypot(d.x - player.x, d.y - player.y) < 0.55) {
        player.addToBag(d.itemId, d.qty);
        state.pendingEvents.push({ type: "pickup", item: d.itemId, qty: d.qty });
        state.dropped.splice(i, 1);
      }
    }

    // 邊界限制
    const map = state.map;
    player.x = Math.max(0.5, Math.min(map.width - 0.5, player.x));
    player.y = Math.max(0.5, Math.min(map.height - 0.5, player.y));

    // camera 跟隨玩家並限制在地圖範圍
    state.camera.x = player.x; state.camera.y = player.y;
  }

  function findNearbyChest(state, player, radius) {
    let best = null, bestDist = radius;
    for (const c of state.chests) {
      if (c.opened) continue;
      const dist = Math.hypot(c.x - player.x, c.y - player.y);
      if (dist < bestDist) { best = c; bestDist = dist; }
    }
    return best;
  }

  function openChest(state, chest, player) {
    if (chest.opened) return null;
    chest.opened = true;
    const loot = M.LootManager.rollChest(chest.tier, player.stats.luck);
    for (const it of loot.items) player.addToBag(it.item, it.qty);
    return loot;
  }

  function isInShelterZone(state, player) {
    const z = state.map.shelterZone;
    return player.x >= z.x - z.w / 2 && player.x <= z.x + z.w / 2 && player.y >= z.y - z.h / 2 && player.y <= z.y + z.h / 2;
  }

  // ---------------- 渲染 ----------------
  const TILE = D.TILE;
  function tileHash(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  function render(ctx, cw, ch, state, player) {
    ctx.save();
    ctx.fillStyle = "#0d1712";
    ctx.fillRect(0, 0, cw, ch);

    const camX = state.camera.x, camY = state.camera.y;
    const originPxX = cw / 2 - camX * TILE;
    const originPxY = ch / 2 - camY * TILE;

    // 地面 tile（視野裁切）
    const startCol = Math.floor((camX - cw / 2 / TILE));
    const endCol = Math.ceil((camX + cw / 2 / TILE));
    const startRow = Math.floor((camY - ch / 2 / TILE));
    const endRow = Math.ceil((camY + ch / 2 / TILE));
    for (let ty = startRow; ty <= endRow; ty++) {
      for (let tx = startCol; tx <= endCol; tx++) {
        const px = originPxX + tx * TILE, py = originPxY + ty * TILE;
        let base = "#1c3324";
        if (tx < 0 || ty < 0 || tx >= state.map.width || ty >= state.map.height) base = "#0a120d";
        else {
          const h = tileHash(tx, ty);
          base = h < 0.08 ? "#223a28" : h < 0.16 ? "#17281c" : "#1c3324";
        }
        ctx.fillStyle = base;
        ctx.fillRect(px, py, TILE, TILE);
      }
    }

    // 避難所入口區域
    const z = state.map.shelterZone;
    ctx.fillStyle = "rgba(255,200,74,0.14)";
    ctx.strokeStyle = "rgba(255,200,74,0.55)";
    ctx.lineWidth = 2;
    const zx = originPxX + (z.x - z.w / 2) * TILE, zy = originPxY + (z.y - z.h / 2) * TILE;
    ctx.fillRect(zx, zy, z.w * TILE, z.h * TILE);
    ctx.strokeRect(zx, zy, z.w * TILE, z.h * TILE);
    ctx.fillStyle = "#ffd24a"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("🏠 避難所入口", zx + (z.w * TILE) / 2, zy - 8);

    // Boss 警戒區
    const ba = state.map.bossArea;
    ctx.beginPath();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(200,40,60,0.5)";
    ctx.arc(originPxX + ba.x * TILE, originPxY + ba.y * TILE, ba.radius * TILE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    function toPx(x, y) { return [originPxX + x * TILE, originPxY + y * TILE]; }

    // 收集所有可視物件依 y 排序繪製（簡易深度感）
    const drawables = [];
    for (const n of state.resourceNodes) if (!n.depleted) drawables.push({ kind: "node", obj: n, y: n.y });
    for (const c of state.chests) if (!c.opened) drawables.push({ kind: "chest", obj: c, y: c.y });
    for (const d of state.dropped) drawables.push({ kind: "drop", obj: d, y: d.y });
    for (const en of state.enemies) drawables.push({ kind: "enemy", obj: en, y: en.y });
    drawables.push({ kind: "player", obj: player, y: player.y });
    drawables.sort((a, b) => a.y - b.y);

    for (const d of drawables) {
      const [px, py] = toPx(d.obj.x, d.obj.y);
      if (px < -60 || px > cw + 60 || py < -60 || py > ch + 60) continue;
      if (d.kind === "node") drawNode(ctx, d.obj, px, py);
      else if (d.kind === "chest") drawChest(ctx, d.obj, px, py);
      else if (d.kind === "drop") drawDrop(ctx, d.obj, px, py);
      else if (d.kind === "enemy") drawEnemy(ctx, d.obj, px, py, player);
      else if (d.kind === "player") drawPlayer(ctx, player, px, py);
    }

    // 飄浮傷害文字
    ctx.textAlign = "center";
    for (const f of state.floatTexts) {
      const [px, py] = toPx(f.x, f.y);
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.9));
      ctx.fillStyle = f.color;
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(f.text, px, py);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawNode(ctx, node, px, py) {
    ctx.font = "26px sans-serif"; ctx.textAlign = "center";
    if (node.hitFlash > 0) { ctx.save(); ctx.filter = "brightness(1.8)"; }
    ctx.fillText(node.def.icon, px, py + 8);
    if (node.hitFlash > 0) ctx.restore();
    if (node.hp < node.maxHp) {
      ctx.fillStyle = "#000"; ctx.fillRect(px - 16, py + 12, 32, 4);
      ctx.fillStyle = "#8bd977"; ctx.fillRect(px - 16, py + 12, 32 * Math.max(0, node.hp / node.maxHp), 4);
    }
  }

  function drawChest(ctx, chest, px, py) {
    const glow = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    ctx.save();
    ctx.shadowColor = chest.def.color; ctx.shadowBlur = 8 + glow * 6;
    ctx.font = "28px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(chest.def.icon, px, py + 8);
    ctx.restore();
    ctx.fillStyle = chest.def.color; ctx.font = "10px sans-serif";
    ctx.fillText(chest.def.name, px, py - 20);
  }

  function drawDrop(ctx, drop, px, py) {
    const bob = Math.sin(performance.now() / 250 + drop.uid) * 3;
    const it = D.ITEM_DATA[drop.itemId];
    ctx.font = "18px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(it ? it.icon : "❓", px, py + bob);
    if (drop.qty > 1) { ctx.fillStyle = "#fff"; ctx.font = "10px sans-serif"; ctx.fillText("x" + drop.qty, px + 10, py + 10 + bob); }
  }

  function nameplateColor(playerLv, enemy) { return D.levelDiffColor(playerLv, enemy.level); }

  function drawEnemy(ctx, en, px, py, player) {
    if (en.isDead) {
      ctx.globalAlpha = Math.max(0, en.deadTimer / 1.1);
      ctx.font = "26px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(en.icon, px, py + 8);
      ctx.globalAlpha = 1;
      return;
    }
    if (en.buried) {
      ctx.font = "20px sans-serif"; ctx.textAlign = "center";
      ctx.globalAlpha = 0.7;
      ctx.fillText("🕳️", px, py + 8);
      ctx.globalAlpha = 1;
      return;
    }
    const size = en.tier === "boss" ? 40 : en.tier === "elite" ? 30 : 24;
    const isFlying = en.typeDef.ai === "flyer";
    const flyLift = isFlying ? 10 : 0;
    if (isFlying) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath(); ctx.ellipse(px, py + 6, size * 0.35, size * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (en.hurtFlash > 0) { ctx.save(); ctx.filter = "brightness(2) saturate(0)"; }
    ctx.font = size + "px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(en.icon, px, py + size / 3 - flyLift);
    if (en.hurtFlash > 0) ctx.restore();
    if (en.state === "charging") { ctx.strokeStyle = "#ff9d2e"; ctx.beginPath(); ctx.arc(px, py, size / 2 + 4, 0, Math.PI * 2); ctx.stroke(); }
    if (en.enraged) { ctx.strokeStyle = "#ff2d4a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, size / 2 + 6, 0, Math.PI * 2); ctx.stroke(); }

    const color = nameplateColor(player.level, en);
    const tag = en.tier === "boss" ? "【Boss】" : en.tier === "elite" ? "【精英】" : "";
    const affixTag = en.affixes && en.affixes.length ? en.affixes.map((a) => "【" + affixName(a) + "】").join("") : "";
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(`Lv.${en.level} ${tag}${affixTag}${en.name}`, px, py - size / 2 - 12);
    const barW = Math.max(30, size);
    ctx.fillStyle = "#000"; ctx.fillRect(px - barW / 2, py - size / 2 - 6, barW, 4);
    ctx.fillStyle = en.tier === "boss" ? "#ff5d73" : "#7be07b";
    ctx.fillRect(px - barW / 2, py - size / 2 - 6, barW * Math.max(0, en.hp / en.maxHp), 4);
  }

  function affixName(a) { return D.AFFIX_DATA[a] ? D.AFFIX_DATA[a].name : a; }

  function drawPlayer(ctx, player, px, py) {
    if (player.invuln > 0 && Math.floor(performance.now() / 80) % 2 === 0) return;
    ctx.font = "28px sans-serif"; ctx.textAlign = "center";
    const bodyIcon = player.hurtFlash > 0 ? "😖" : "🧑‍🌾";
    ctx.fillText(bodyIcon, px, py + 9);
    const arrow = { right: "➡️", left: "⬅️", up: "⬆️", down: "⬇️" }[player.facing];
    ctx.font = "12px sans-serif";
    ctx.fillText(arrow, px + 16, py - 12);
    const barW = 34;
    ctx.fillStyle = "#000"; ctx.fillRect(px - barW / 2, py - 26, barW, 5);
    ctx.fillStyle = "#3ddc97"; ctx.fillRect(px - barW / 2, py - 26, barW * Math.max(0, player.hp / player.stats.maxHp), 5);
  }

  return { buildWorldState, update, render, findNearbyChest, openChest, isInShelterZone, spawnFloatText };
})();
