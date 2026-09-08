import { isHome, inCombat } from './selectors.js';

/**
 * 玩家操作清單。每個 intent：{ allowedWhen(state, ctx, params) → true | reasonCode, run(ctx, params) → {ok,...} }
 * run 回傳系統 API 的結果；Game.intent 會包成 { ok, reason?, result? }。
 */
const alive = (st) => (st.player.hp > 0 ? true : 'dead');
const home = (st) => (alive(st) !== true ? 'dead' : isHome(st) && !inCombat(st) ? true : 'notHome');
const noCombat = (st) => (alive(st) !== true ? 'dead' : inCombat(st) ? 'inCombat' : true);
const fighting = (st) => (alive(st) !== true ? 'dead' : inCombat(st) ? true : 'notInCombat');
const exploring = (st) => (alive(st) !== true ? 'dead' : st.exploration && st.exploration.phase === 'explore' && !inCombat(st) ? true : 'notExploring');
const S = (ctx) => ctx.systems;

export const INTENTS = {
  // ---------- 物品 / 背包 / 裝備 ----------
  useItem: { allowedWhen: alive, run: (ctx, { uid, container = 'inventory' }) => S(ctx).item.use(uid, container) },
  dropItem: {
    allowedWhen: alive,
    run: (ctx, { uid, container = 'inventory', qty = Infinity }) => {
      const n = S(ctx).inventory.removeByUid(container, uid, qty);
      return n > 0 ? { ok: true, result: { removed: n } } : { ok: false, reason: 'notFound' };
    },
  },
  transfer: { allowedWhen: home, run: (ctx, { uid, from = 'inventory', qty = Infinity, to }) => S(ctx).inventory.transfer(from, uid, qty, to) },
  depositAll: { allowedWhen: home, run: (ctx) => ({ ok: true, result: S(ctx).inventory.depositAll() }) },
  equip: { allowedWhen: noCombat, run: (ctx, { uid }) => S(ctx).equipment.equip(uid) },
  unequip: { allowedWhen: noCombat, run: (ctx, { slot, to }) => S(ctx).equipment.unequip(slot, to) },
  takeLoot: { allowedWhen: alive, run: (ctx, { uid, qty = Infinity }) => S(ctx).inventory.takeLoot(uid, qty) },
  takeAllLoot: { allowedWhen: alive, run: (ctx) => ({ ok: true, result: S(ctx).inventory.takeAllLoot() }) },
  dropLoot: { allowedWhen: alive, run: (ctx, { uid }) => ({ ok: S(ctx).inventory.dropLoot(uid) }) },

  // ---------- 存檔 / 設定 ----------
  save: { allowAfterGameOver: true, run: (ctx, { slot = 'slot1' } = {}) => S(ctx).save.save(slot) },
  setSetting: {
    allowAfterGameOver: true,
    run: (ctx, { key, value }) => {
      if (!(key in ctx.state.settings)) return { ok: false, reason: 'unknownSetting' };
      ctx.state.settings[key] = value;
      return { ok: true, result: { key, value } };
    },
  },

  // ---------- 探索 / 戰鬥（Phase 3） ----------
  explore: { allowedWhen: home, run: (ctx, { areaId }) => S(ctx).exploration?.start(areaId) ?? { ok: false, reason: 'notImplemented' } },
  interact: { allowedWhen: exploring, run: (ctx, { poiId }) => S(ctx).exploration?.interact(poiId) ?? { ok: false, reason: 'notImplemented' } },
  cancelAction: { allowedWhen: exploring, run: (ctx) => S(ctx).exploration?.cancelAction() ?? { ok: false, reason: 'notImplemented' } },
  goDeeper: { allowedWhen: exploring, run: (ctx) => S(ctx).exploration?.goDeeper() ?? { ok: false, reason: 'notImplemented' } },
  returnHome: { allowedWhen: (st) => (alive(st) !== true ? 'dead' : st.exploration && !inCombat(st) ? true : 'notExploring'), run: (ctx) => S(ctx).exploration?.returnHome() ?? { ok: false, reason: 'notImplemented' } },
  attack: { allowedWhen: fighting, run: (ctx) => S(ctx).combat?.playerAttack() ?? { ok: false, reason: 'notImplemented' } },
  setTarget: { allowedWhen: fighting, run: (ctx, { uid }) => S(ctx).combat?.setTarget(uid) ?? { ok: false, reason: 'notImplemented' } },
  flee: { allowedWhen: fighting, run: (ctx) => S(ctx).combat?.flee() ?? { ok: false, reason: 'notImplemented' } },
  useSkill: { allowedWhen: fighting, run: (ctx, { skillId }) => S(ctx).combat?.useSkill(skillId) ?? { ok: false, reason: 'notImplemented' } },
  openChest: { allowedWhen: alive, run: (ctx, { uid, container }) => S(ctx).chest?.open(uid, container) ?? { ok: false, reason: 'notImplemented' } },

  // ---------- 避難所 / 建築 / 製作 / 圖紙（Phase 4） ----------
  upgradeShelter: { allowedWhen: home, run: (ctx) => S(ctx).shelter?.upgrade() ?? { ok: false, reason: 'notImplemented' } },
  repairShelter: { allowedWhen: (st) => (alive(st) !== true ? 'dead' : isHome(st) ? true : 'notHome'), run: (ctx, { amount }) => S(ctx).shelter?.repair(amount) ?? { ok: false, reason: 'notImplemented' } },
  build: { allowedWhen: home, run: (ctx, { buildingId }) => S(ctx).building?.build(buildingId) ?? { ok: false, reason: 'notImplemented' } },
  upgradeBuilding: { allowedWhen: home, run: (ctx, { buildingId }) => S(ctx).building?.upgrade(buildingId) ?? { ok: false, reason: 'notImplemented' } },
  repairBuilding: { allowedWhen: (st) => (alive(st) !== true ? 'dead' : isHome(st) ? true : 'notHome'), run: (ctx, { buildingId }) => S(ctx).building?.repair(buildingId) ?? { ok: false, reason: 'notImplemented' } },
  craft: { allowedWhen: home, run: (ctx, { recipeId, qty = 1 }) => S(ctx).crafting?.craft(recipeId, qty) ?? { ok: false, reason: 'notImplemented' } },
  cancelCraft: { allowedWhen: alive, run: (ctx, { uid }) => S(ctx).crafting?.cancel(uid) ?? { ok: false, reason: 'notImplemented' } },
  learnBlueprint: { allowedWhen: alive, run: (ctx, { uid, container }) => S(ctx).blueprint?.learnFromItem(uid, container) ?? { ok: false, reason: 'notImplemented' } },
  dismantleBlueprint: { allowedWhen: alive, run: (ctx, { uid, container }) => S(ctx).blueprint?.dismantle(uid, container) ?? { ok: false, reason: 'notImplemented' } },
  redeemBlueprint: { allowedWhen: home, run: (ctx, { blueprintId }) => S(ctx).blueprint?.redeem(blueprintId) ?? { ok: false, reason: 'notImplemented' } },

  // ---------- 事件（Phase 5） ----------
  resolveEvent: { allowedWhen: alive, run: (ctx, { choiceId }) => S(ctx).event?.resolve(choiceId) ?? { ok: false, reason: 'notImplemented' } },
};
