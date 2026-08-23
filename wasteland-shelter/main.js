/* 末日餘生：荒野避難所 — 主程式（game loop、輸入、存讀檔、畫面切換） */
(function () {
  "use strict";
  const D = WSH.Data, E = WSH.Entities, M = WSH.Managers, W = WSH.World, S = WSH.Shelter, UI = WSH.UI;
  const $ = (id) => document.getElementById(id);

  let player = null;
  let world = null;
  let canvas, ctx;
  let lastTs = 0;
  let running = false;
  let shelterTickHandle = null;

  const keys = {};
  const KEY_DIR = { w: "up", ArrowUp: "up", s: "down", ArrowDown: "down", a: "left", ArrowLeft: "left", d: "right", ArrowRight: "right" };

  // ---------------- 初始化 / 存讀檔 ----------------
  function freshPlayer() { return new E.Player({}); }

  function newGame() {
    player = freshPlayer();
    world = W.buildWorldState("forest");
    player.mode = "shelter";
    startGame();
    UI.toast("這是你的避難所，準備好後就出發探索吧！", "var(--gold)");
  }

  function continueGame() {
    const saved = M.SaveManager.load();
    player = new E.Player(saved || {});
    world = W.buildWorldState("forest");
    startGame();
    UI.toast("讀取存檔成功", "var(--green)");
  }

  function startGame() {
    S.ensureFarmPlots(player);
    UI.showGame();
    UI.setScreen(player.mode);
    if (player.mode === "shelter") refreshShelterScreen();
    resizeCanvas();
    running = true;
    lastTs = performance.now();
    requestAnimationFrame(loop);
    startAutosave();
  }

  function doSave(silent) {
    M.SaveManager.save(player);
    if (!silent) UI.toast("💾 已儲存進度", "var(--blue)");
  }
  let autosaveHandle = null;
  function startAutosave() {
    if (autosaveHandle) clearInterval(autosaveHandle);
    autosaveHandle = setInterval(() => doSave(true), 20000);
    window.addEventListener("beforeunload", () => doSave(true));
  }

  // ---------------- Canvas ----------------
  function resizeCanvas() {
    const rect = $("worldWrap").getBoundingClientRect();
    canvas.width = Math.max(320, Math.round(rect.width));
    canvas.height = Math.round(canvas.width * (520 / 900));
  }

  // ---------------- 遊戲迴圈 ----------------
  function loop(ts) {
    if (!running) return;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = Math.min(dt, 0.05);

    if (player.mode === "world") {
      handleMovementInput(dt);
      player.tick(dt);
      W.update(dt, world, player);
      consumePendingEvents();
      updateInteractHint();
      UI.showBurnHint(!!player.burn);
      if (player.isDead) onPlayerDeath();
      W.render(ctx, canvas.width, canvas.height, world, player);
    }
    UI.renderHUD(player);
    requestAnimationFrame(loop);
  }

  function handleMovementInput(dt) {
    let dx = 0, dy = 0;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;
    if (dx || dy) player.move(dx, dy, dt);
    if (W.isInShelterZone(world, player)) enterShelterIfNear();
  }

  function enterShelterIfNear() {
    if (player.mode !== "world") return;
    player.mode = "shelter";
    UI.setScreen("shelter");
    refreshShelterScreen();
    doSave(true);
  }

  function consumePendingEvents() {
    while (world.pendingEvents.length) {
      const ev = world.pendingEvents.shift();
      if (ev.type === "enemyKilled") {
        UI.toast(`擊敗 ${ev.name}！+${ev.xp} 經驗`, ev.tier === "boss" ? "var(--gold)" : "var(--green)");
      } else if (ev.type === "levelUp") {
        UI.toast(`🎉 升級！目前等級 Lv.${player.level}`, "var(--gold)");
      } else if (ev.type === "pickup") {
        const it = D.ITEM_DATA[ev.item];
        UI.toast(`拾取 ${it.icon} ${it.name} x${ev.qty}`);
      } else if (ev.type === "chestSpawned") {
        UI.toast(`💰 出現了一個 ${D.CHEST_DATA[ev.tier].name}！`, D.CHEST_DATA[ev.tier].color);
      }
    }
  }

  function updateInteractHint() {
    const chest = W.findNearbyChest(world, player, 1.1);
    UI.showInteractHint(chest ? `按 E 開啟 ${chest.def.name}` : null);
  }

  function tryInteract() {
    if (player.mode !== "world") return;
    const chest = W.findNearbyChest(world, player, 1.1);
    if (chest) {
      const loot = W.openChest(world, chest, player);
      UI.openChestModal(chest.def.name, chest.def.color, loot);
    }
  }

  function tryAttack() {
    if (player.mode !== "world") return;
    const hits = M.CombatManager.playerAttack(player, world);
    if (!hits) return;
    for (const h of hits) {
      if (h.enemy) W.spawnFloatText(world, h.enemy.x, h.enemy.y - 0.4, (h.isCrit ? "暴擊! " : "") + "-" + h.dmg, h.isCrit ? "#ffd24a" : "#fff");
      if (h.gather) {
        const it = D.ITEM_DATA[h.gather.drop.item];
        player.addToBag(h.gather.drop.item, h.gather.drop.qty);
        W.spawnFloatText(world, h.node.x, h.node.y - 0.3, "+" + h.gather.drop.qty + it.icon, "#8bd977");
        if (h.gather.bonus) player.addToBag(h.gather.bonus.item, h.gather.bonus.qty);
      }
    }
  }

  function onPlayerDeath() {
    running = false;
    // 死亡懲罰：掉落部分背包物資在原地，裝備保留
    const dropKeys = Object.keys(player.inventory);
    for (const id of dropKeys) {
      const qty = player.inventory[id];
      const dropQty = Math.ceil(qty * 0.5);
      if (dropQty > 0) {
        world.dropped.push(new E.DroppedItem(id, dropQty, player.x + (Math.random() - 0.5), player.y + (Math.random() - 0.5)));
        E.invRemove(player.inventory, id, dropQty);
      }
    }
    UI.showDeath(true);
  }

  function respawn() {
    player.hp = Math.round(player.stats.maxHp * 0.6);
    player.burn = null;
    player.x = world.map.playerStart.x; player.y = world.map.playerStart.y;
    player.mode = "shelter";
    UI.showDeath(false);
    UI.setScreen("shelter");
    refreshShelterScreen();
    doSave(true);
    running = true;
    lastTs = performance.now();
    requestAnimationFrame(loop);
  }

  // ---------------- 避難所畫面 ----------------
  function refreshShelterScreen() {
    UI.renderShelter(player);
    if (shelterTickHandle) clearInterval(shelterTickHandle);
    shelterTickHandle = setInterval(() => { if (player.mode === "shelter") UI.renderShelter(player); }, 1000);
  }

  function goExplore() {
    player.mode = "world";
    player.x = world.map.shelterZone.x + world.map.shelterZone.w / 2 + 1.2;
    player.y = world.map.shelterZone.y;
    UI.setScreen("world");
    resizeCanvas();
    if (shelterTickHandle) { clearInterval(shelterTickHandle); shelterTickHandle = null; }
  }

  // ---------------- 事件綁定 ----------------
  function bindEvents() {
    $("btnNewGame").addEventListener("click", newGame);
    $("btnContinueGame").addEventListener("click", continueGame);
    $("btnResetSave").addEventListener("click", () => {
      if (confirm("確定要清除存檔嗎？此動作無法復原。")) { M.SaveManager.reset(); UI.showMainMenu(false); }
    });

    window.addEventListener("keydown", (e) => {
      if (KEY_DIR[e.key]) { keys[KEY_DIR[e.key]] = true; }
      if (e.key === " ") { e.preventDefault(); tryAttack(); }
      if (e.key === "e" || e.key === "E") tryInteract();
      if (e.key === "i" || e.key === "I") toggleBag();
      if (e.key === "Escape") UI.closeBag();
    });
    window.addEventListener("keyup", (e) => { if (KEY_DIR[e.key]) keys[KEY_DIR[e.key]] = false; });

    document.querySelectorAll(".dpad button[data-dir]").forEach((btn) => {
      const dir = btn.dataset.dir;
      const on = (e) => { e.preventDefault(); keys[dir] = true; };
      const off = (e) => { e.preventDefault(); keys[dir] = false; };
      btn.addEventListener("touchstart", on); btn.addEventListener("touchend", off); btn.addEventListener("touchcancel", off);
      btn.addEventListener("mousedown", on); btn.addEventListener("mouseup", off); btn.addEventListener("mouseleave", off);
    });
    $("btnTouchAttack").addEventListener("click", tryAttack);
    $("btnTouchInteract").addEventListener("click", tryInteract);

    $("btnOpenBag").addEventListener("click", toggleBag);
    $("btnOpenBag2").addEventListener("click", toggleBag);
    $("btnCloseBag").addEventListener("click", UI.closeBag);
    $("btnSaveNow").addEventListener("click", () => doSave(false));
    document.querySelectorAll("#bagModal .tabs button").forEach((b) => b.addEventListener("click", () => UI.switchBagTab(b.dataset.tab)));
    $("bagGrid").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const id = btn.dataset.item, act = btn.dataset.act, slot = btn.dataset.slot;
      if (act === "equip") { if (player.equipSlot(slot, id)) UI.toast("已裝備 " + D.ITEM_DATA[id].name); }
      else if (act === "unequip") { const old = player.equipment[slot]; if (player.unequipSlot(slot)) UI.toast("已卸下 " + D.ITEM_DATA[old].name); }
      else if (act === "use") {
        const it = D.ITEM_DATA[id];
        if (it.heal) { player.heal(it.heal); UI.toast(`使用 ${it.name}，回復 ${it.heal} 生命`); E.invRemove(player.inventory, id, 1); }
      } else if (act === "drop") { E.invRemove(player.inventory, id, 1); }
      UI.renderBag(player); UI.renderChar(player);
    });

    $("btnDepositAll").addEventListener("click", () => { const n = S.depositAll(player); UI.toast(`存入 ${n} 件物資`); refreshShelterScreen(); });
    $("shelterUpgradeBox").addEventListener("click", (e) => {
      if (!e.target.closest("#btnUpgradeShelter")) return;
      const unlocked = S.upgradeShelter(player);
      if (unlocked) { UI.toast(`🏠 避難所升級為 Lv.${player.shelterLevel} ${unlocked.name}！解鎖：${unlocked.unlock.map((u) => u.name).join("、")}`, "var(--gold)"); refreshShelterScreen(); }
    });
    $("btnGoExplore").addEventListener("click", goExplore);
    $("recipeList").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-recipe]");
      if (!btn) return;
      if (S.craft(player, btn.dataset.recipe)) { UI.toast("製造成功！"); refreshShelterScreen(); }
    });
    $("farmGrid").addEventListener("click", (e) => {
      const plantBtn = e.target.closest("button[data-plant]");
      const harvestBtn = e.target.closest("button[data-harvest]");
      if (plantBtn) {
        const idx = +plantBtn.dataset.plant;
        const sel = document.querySelector(`select[data-plotseed="${idx}"]`);
        if (sel && S.plant(player, idx, sel.value)) { UI.toast("已種下種子"); refreshShelterScreen(); }
      } else if (harvestBtn) {
        const idx = +harvestBtn.dataset.harvest;
        const res = S.harvest(player, idx);
        if (res) { UI.toast(`收成 ${D.ITEM_DATA[res.item].icon} x${res.qty}`, "var(--green)"); refreshShelterScreen(); }
      }
    });

    $("btnCloseChest").addEventListener("click", () => { UI.closeChestModal(); UI.renderHUD(player); });
    $("btnRespawn").addEventListener("click", respawn);
    window.addEventListener("resize", () => { if (canvas) resizeCanvas(); });
  }

  function toggleBag() {
    const modal = $("bagModal");
    if (modal.classList.contains("show")) UI.closeBag();
    else UI.openBag(player);
  }

  // ---------------- 啟動 ----------------
  document.addEventListener("DOMContentLoaded", () => {
    canvas = $("gameCanvas"); ctx = canvas.getContext("2d");
    bindEvents();
    UI.showMainMenu(M.SaveManager.hasSave());
  });
})();
