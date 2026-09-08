/**
 * GameState 工廠：完整初始狀態樹（見 docs/DATA_MODEL.md §1）。
 * 也是 SaveSystem.normalize() 深度補預設值的來源。
 */
export const SAVE_VERSION = 1;

export function createNewState({ seed = 1, name = '倖存者', now = 0, registry } = {}) {
  const lv1 = registry ? registry.shelterLevel(1) : null;
  return {
    version: SAVE_VERSION,
    seq: 1,
    meta: { name, seed, createdAt: now, updatedAt: now, playTime: 0, difficulty: 'normal' },
    rng: null,
    clock: { time: 0, lastHour: 0, lastDay: 1 },
    player: {
      name, level: 1, xp: 0, hp: 100, hunger: 0, thirst: 0, coins: 0,
      bonus: { maxHp: 0, attack: 0, defense: 0 },
      statusEffects: [],
      equipment: { weapon: null, head: null, body: null, legs: null, accessory: null },
    },
    inventory: { items: [] },
    shelter: { level: 1, hp: lv1 ? lv1.maxHp : 1000, buildings: {}, storage: { items: [] } },
    crafting: { queue: [] },
    blueprints: { learned: [], discovered: [], researchPoints: 0 },
    exploration: null,
    combat: null,
    raid: { nextAt: 0, count: 0, active: null },
    disasters: { active: [], cooldownUntil: {}, nextRollAt: 0 },
    events: { active: [], pending: null, cooldownUntil: {}, log: [] },
    flags: {},
    world: { areas: {} },
    stats: { kills: 0, eliteKills: 0, bossKills: 0, chestsOpened: 0, itemsGathered: 0, blueprintsLearned: 0, raidsSurvived: 0, disastersSurvived: 0, crafted: 0, deaths: 0, explorations: 0 },
    settings: { autoAttack: true },
    gameOver: null,
  };
}

/** 深度補預設：target 缺的欄位由 defaults 補上；陣列與 null 值視為「有值」不覆蓋。幂等。 */
export function deepDefault(target, defaults) {
  if (target == null || typeof target !== 'object' || Array.isArray(target)) return target === undefined ? clone(defaults) : target;
  for (const k of Object.keys(defaults)) {
    const d = defaults[k];
    if (target[k] === undefined) target[k] = clone(d);
    else if (isPlain(d) && isPlain(target[k])) deepDefault(target[k], d);
  }
  return target;
}
const isPlain = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
