/* 末日餘生：荒野避難所 — 避難所（儲物箱／工作台／小型農田） */
window.WSH = window.WSH || {};

WSH.Shelter = (function () {
  "use strict";
  const D = WSH.Data;
  const E = WSH.Entities;

  function depositAll(player) {
    let moved = 0;
    for (const id in player.inventory) {
      const qty = player.inventory[id];
      E.invAdd(player.storage, id, qty);
      moved += qty;
      delete player.inventory[id];
    }
    return moved;
  }

  function canCraft(player, recipe) {
    if (player.shelterLevel < (recipe.minShelterLvl || 1)) return false;
    return recipe.cost.every((c) => E.invHas(player.storage, c.item, c.qty));
  }

  function craft(player, recipeId) {
    const recipe = D.RECIPE_DATA.find((r) => r.id === recipeId);
    if (!recipe || !canCraft(player, recipe)) return false;
    recipe.cost.forEach((c) => E.invRemove(player.storage, c.item, c.qty));
    const itemDef = D.ITEM_DATA[recipe.result];
    if (itemDef.equip) {
      // 裝備類直接放入背包並可裝備，不走堆疊庫存（stack=1）
      player.addToBag(recipe.result, recipe.resultQty);
    } else {
      E.invAdd(player.storage, recipe.result, recipe.resultQty);
    }
    return true;
  }

  function plotState(plot) {
    if (!plot.plant) return { stage: "empty" };
    const def = D.PLANT_DATA[plot.plant];
    const elapsed = (Date.now() - plot.plantedAt) / 1000;
    const pct = Math.min(1, elapsed / def.growTimeSec);
    if (pct >= 1) return { stage: "ready", def, pct };
    const stageIdx = Math.min(def.stageIcons.length - 2, Math.floor(pct * (def.stageIcons.length - 1)));
    return { stage: "growing", def, pct, icon: def.stageIcons[stageIdx], remainSec: Math.max(0, def.growTimeSec - elapsed) };
  }

  function plant(player, plotIndex, seedItemId) {
    const plot = player.farm[plotIndex];
    if (!plot || plot.plant) return false;
    const seedDef = D.ITEM_DATA[seedItemId];
    if (!seedDef || seedDef.type !== "seed") return false;
    if (!E.invHas(player.storage, seedItemId, 1) && !E.invHas(player.inventory, seedItemId, 1)) return false;
    if (E.invHas(player.storage, seedItemId, 1)) E.invRemove(player.storage, seedItemId, 1);
    else E.invRemove(player.inventory, seedItemId, 1);
    plot.plant = seedDef.plant;
    plot.plantedAt = Date.now();
    return true;
  }

  function harvest(player, plotIndex) {
    const plot = player.farm[plotIndex];
    if (!plot || !plot.plant) return null;
    const st = plotState(plot);
    if (st.stage !== "ready") return null;
    const def = st.def;
    const qty = D.rng.pickQty(Math.random, def.resultQty);
    E.invAdd(player.storage, def.resultItem, qty);
    plot.plant = null; plot.plantedAt = null;
    return { item: def.resultItem, qty };
  }

  function ensureFarmPlots(player) {
    const desired = (D.BUILDING_DATA[player.shelterLevel] || D.BUILDING_DATA[1]).farmPlots;
    while (player.farm.length < desired) player.farm.push({ plantedAt: null, plant: null });
  }

  function nextLevelDef(player) { return D.BUILDING_DATA[player.shelterLevel + 1] || null; }

  function canUpgradeShelter(player) {
    const next = nextLevelDef(player);
    if (!next) return false;
    return next.cost.every((c) => E.invHas(player.storage, c.item, c.qty));
  }

  function upgradeShelter(player) {
    const next = nextLevelDef(player);
    if (!next || !canUpgradeShelter(player)) return null;
    next.cost.forEach((c) => E.invRemove(player.storage, c.item, c.qty));
    player.shelterLevel += 1;
    ensureFarmPlots(player);
    return next;
  }

  return { depositAll, canCraft, craft, plotState, plant, harvest, ensureFarmPlots, canUpgradeShelter, upgradeShelter, nextLevelDef };
})();
