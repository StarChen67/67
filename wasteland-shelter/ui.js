/* 末日餘生：荒野避難所 — UI（DOM 面板：HUD／背包／角色／避難所／寶箱／提示） */
window.WSH = window.WSH || {};

WSH.UI = (function () {
  "use strict";
  const D = WSH.Data;
  const E = WSH.Entities;
  const S = WSH.Shelter;

  const $ = (id) => document.getElementById(id);

  function toast(msg, color) {
    const el = document.createElement("div");
    el.className = "toast";
    el.style.borderColor = color || "var(--line)";
    el.textContent = msg;
    $("toastRoot").appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 2200);
  }

  const RES_QUICK = ["wood", "stone", "fiber", "iron_ore"];
  function renderHUD(player) {
    $("lvlText").textContent = "Lv." + player.level;
    $("hpText").textContent = Math.ceil(player.hp) + "/" + player.stats.maxHp;
    $("hpFill").style.width = Math.max(0, (player.hp / player.stats.maxHp) * 100) + "%";
    $("xpText").textContent = player.xp + "/" + player.xpNeeded();
    $("xpFill").style.width = Math.max(0, (player.xp / player.xpNeeded()) * 100) + "%";
    const w = player.totalWeight.toFixed(1), cap = player.carryCapacity.toFixed(0);
    const weightEl = $("weightText");
    weightEl.textContent = w + " / " + cap;
    weightEl.style.color = player.isOverweight ? "var(--red)" : "var(--txt)";
    const q = $("quickRes");
    q.innerHTML = RES_QUICK.map((id) => {
      const it = D.ITEM_DATA[id];
      return `<span>${it.icon} ${player.inventory[id] || 0}</span>`;
    }).join("");
  }

  function rarityBorder(it) {
    if (!it.rarity) return "";
    const r = D.RARITY_DATA[it.rarity];
    return ` style="border-color:${r.color}"`;
  }
  function rarityTag(it) {
    if (!it.rarity) return "";
    const r = D.RARITY_DATA[it.rarity];
    return `<div class="qt" style="color:${r.color}">${r.name}</div>`;
  }

  function itemCard(itemId, qty, actionsHtml) {
    const it = D.ITEM_DATA[itemId];
    if (!it) return "";
    return `<div class="itemCard" data-item="${itemId}"${rarityBorder(it)}>
      <div class="ic">${it.icon}</div>
      <div class="nm">${it.name}</div>
      ${rarityTag(it)}
      <div class="qt">x${qty}</div>
      ${actionsHtml ? `<div class="acts">${actionsHtml}</div>` : ""}
    </div>`;
  }

  function equippedCard(slot, itemId) {
    const it = D.ITEM_DATA[itemId];
    return `<div class="itemCard"${rarityBorder(it)}>
      <div class="ic">${it.icon}</div>
      <div class="nm">${it.name}（裝備中）</div>
      ${rarityTag(it)}
      <div class="acts"><button class="b-ghost b-sm" data-act="unequip" data-slot="${slot}">卸下</button></div>
    </div>`;
  }

  function renderBag(player) {
    $("bagWeightLine").textContent = `負重 ${player.totalWeight.toFixed(1)} / ${player.carryCapacity.toFixed(0)}${player.isOverweight ? "（超重，移動速度下降）" : ""}`;
    const cards = [];
    if (player.equipment.weapon) cards.push(equippedCard("weapon", player.equipment.weapon));
    if (player.equipment.armor) cards.push(equippedCard("armor", player.equipment.armor));
    for (const id in player.inventory) {
      const it = D.ITEM_DATA[id];
      let acts = `<button class="b-ghost b-sm" data-act="drop" data-item="${id}">丟棄</button>`;
      if (it.equip === "weapon" || it.equip === "armor") acts += `<button class="b-blue b-sm" data-act="equip" data-slot="${it.equip}" data-item="${id}">裝備</button>`;
      else if (it.type === "consumable" || it.type === "food") acts += `<button class="b-green b-sm" data-act="use" data-item="${id}">使用</button>`;
      cards.push(itemCard(id, player.inventory[id], acts));
    }
    $("bagGrid").innerHTML = cards.join("") || `<div class="legend">背包是空的，去野外採集一些資源吧。</div>`;
  }

  function statRow(label, val) { return `<div class="statRow"><span>${label}</span><span>${val}</span></div>`; }
  function renderChar(player) {
    const s = player.stats;
    const wName = player.equipment.weapon ? D.ITEM_DATA[player.equipment.weapon].name : "（徒手）";
    const aName = player.equipment.armor ? D.ITEM_DATA[player.equipment.armor].name : "（無防具）";
    $("charStats").innerHTML = [
      statRow("等級", player.level),
      statRow("經驗值", `${player.xp} / ${player.xpNeeded()}`),
      statRow("裝備武器", wName),
      statRow("裝備防具", aName),
      statRow("最大生命", s.maxHp),
      statRow("攻擊力", (s.atk + s.weaponAtk).toFixed(1)),
      statRow("防禦力", s.def),
      statRow("移動速度", s.moveSpeed.toFixed(1) + (player.isOverweight ? "（超重中）" : "")),
      statRow("攻擊速度", (s.weaponAtkSpeed).toFixed(2) + " 次/秒"),
      statRow("暴擊率", ((s.critChance + s.weaponCrit) * 100).toFixed(0) + "%"),
      statRow("暴擊傷害", ((s.critDamage + s.weaponCritDmg) * 100).toFixed(0) + "%"),
      statRow("負重上限", s.carryCapacity.toFixed(0)),
      statRow("採集效率", s.gatherEff.toFixed(2) + "x"),
      statRow("幸運值", s.luck),
      statRow("可用屬性點／技能點", `${player.statPoints} / ${player.skillPoints}（未來版本開放分配）`),
    ].join("");
  }

  function switchBagTab(tab) {
    document.querySelectorAll("#bagModal .tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("bagTab").classList.toggle("hidden", tab !== "bag");
    $("charTab").classList.toggle("hidden", tab !== "char");
  }

  function openBag(player) { renderBag(player); renderChar(player); $("bagModal").classList.add("show"); }
  function closeBag() { $("bagModal").classList.remove("show"); }

  function renderShelterUpgrade(player) {
    const next = S.nextLevelDef(player);
    const box = $("shelterUpgradeBox");
    if (!next) {
      box.innerHTML = `<div class="legend">已達目前版本的最高避難所等級。</div>`;
      return;
    }
    const ok = S.canUpgradeShelter(player);
    const costTxt = next.cost.map((c) => {
      const have = player.storage[c.item] || 0;
      const it = D.ITEM_DATA[c.item];
      return `<span style="color:${have >= c.qty ? "var(--green)" : "var(--red)"}">${it.icon}${have}/${c.qty}</span>`;
    }).join(" ");
    box.innerHTML = `
      <div style="margin-bottom:6px">升級至 <b>Lv.${player.shelterLevel + 1} ${next.name}</b>，解鎖：${next.unlock.map((u) => u.name).join("、")}</div>
      <div class="costs" style="margin-bottom:8px">需要：${costTxt}</div>
      <button class="b-purple b-sm" id="btnUpgradeShelter" ${ok ? "" : "disabled"}>升級避難所</button>`;
  }

  function renderShelter(player) {
    const buildingDef = D.BUILDING_DATA[player.shelterLevel];
    $("shelterLvl").textContent = player.shelterLevel;
    $("shelterName").textContent = buildingDef.name;
    $("shelterUnlocks").textContent = "已解鎖：" + buildingDef.unlock.map((u) => u.name).join("、");
    renderShelterUpgrade(player);

    const storageCards = [];
    for (const id in player.storage) storageCards.push(itemCard(id, player.storage[id]));
    $("storageGrid").innerHTML = storageCards.join("") || `<div class="legend">儲物箱是空的，先去探索帶些資源回來吧。</div>`;

    const recipes = D.RECIPE_DATA;
    $("recipeList").innerHTML = recipes.map((r) => {
      const locked = player.shelterLevel < (r.minShelterLvl || 1);
      const ok = !locked && S.canCraft(player, r);
      const costTxt = r.cost.map((c) => `${D.ITEM_DATA[c.item].icon}${c.qty}`).join(" ");
      const resIt = D.ITEM_DATA[r.result];
      const btn = locked
        ? `<button class="b-ghost b-sm" disabled>需要避難所 Lv.${r.minShelterLvl}</button>`
        : `<button class="b-gold b-sm" data-recipe="${r.id}" ${ok ? "" : "disabled"}>製造</button>`;
      const nameColor = resIt.rarity ? D.RARITY_DATA[resIt.rarity].color : "var(--txt)";
      return `<div class="recipeRow">
        <div><b style="color:${nameColor}">${resIt.icon} ${r.name}</b><div class="costs">需要：${costTxt}</div></div>
        ${btn}
      </div>`;
    }).join("");

    const farmCards = player.farm.map((plot, i) => {
      const st = S.plotState(plot);
      if (st.stage === "empty") {
        const seedOptions = Object.keys(player.storage).filter((id) => D.ITEM_DATA[id].type === "seed");
        const opts = seedOptions.length
          ? `<select data-plotseed="${i}">${seedOptions.map((id) => `<option value="${id}">${D.ITEM_DATA[id].name} x${player.storage[id]}</option>`).join("")}</select>
             <button class="b-green b-sm" data-plant="${i}">種下</button>`
          : `<div class="legend">沒有種子</div>`;
        return `<div class="plot"><div class="ic">🟫</div><div class="nm">空地</div>${opts}</div>`;
      }
      if (st.stage === "growing") {
        return `<div class="plot"><div class="ic">${st.icon}</div><div class="nm">${st.def.name}生長中</div>
          <div class="prog"><div class="fill" style="width:${(st.pct * 100).toFixed(0)}%"></div></div>
          <div class="legend">剩餘 ${Math.ceil(st.remainSec)} 秒</div></div>`;
      }
      return `<div class="plot"><div class="ic">${st.def.stageIcons[st.def.stageIcons.length - 1]}</div><div class="nm">${st.def.name}已成熟！</div>
        <button class="b-gold b-sm" data-harvest="${i}">收成</button></div>`;
    });
    $("farmGrid").innerHTML = farmCards.join("");
  }

  function showInteractHint(text) {
    const el = $("interactHint");
    if (text) { el.textContent = text; el.style.display = "block"; }
    else el.style.display = "none";
  }

  function showBurnHint(show) { $("burnHint").style.display = show ? "block" : "none"; }

  function openChestModal(chestName, color, loot) {
    $("chestTitle").textContent = "🎁 " + chestName;
    $("chestTitle").style.color = color;
    const cards = loot.items.length
      ? loot.items.map((it) => itemCard(it.item, it.qty)).join("")
      : `<div class="legend">什麼都沒有找到⋯</div>`;
    $("chestLootGrid").innerHTML = cards;
    $("chestModal").classList.add("show");
  }
  function closeChestModal() { $("chestModal").classList.remove("show"); }

  function showDeath(show) { $("deathScreen").style.display = show ? "flex" : "none"; }

  function setScreen(mode) {
    $("worldScreen").classList.toggle("hidden", mode !== "world");
    $("shelterScreen").classList.toggle("hidden", mode !== "shelter");
  }

  function showMainMenu(hasSave) {
    $("mainMenu").classList.remove("hidden");
    $("gameRoot").classList.add("hidden");
    $("btnContinueGame").classList.toggle("hidden", !hasSave);
    $("btnResetSave").classList.toggle("hidden", !hasSave);
  }
  function showGame() { $("mainMenu").classList.add("hidden"); $("gameRoot").classList.remove("hidden"); }

  return {
    toast, renderHUD, renderBag, renderChar, renderShelter,
    openBag, closeBag, switchBagTab, showInteractHint, showBurnHint,
    openChestModal, closeChestModal, showDeath, setScreen, showMainMenu, showGame,
  };
})();
