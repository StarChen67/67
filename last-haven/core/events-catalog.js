/**
 * 事件名稱目錄。所有 bus.emit / bus.on 都應使用這裡的常數，方便搜尋與文件化。
 * payload 形狀寫在註解裡。
 */
export const EV = Object.freeze({
  TICK: 'tick',                          // { dt }
  CLOCK_HOUR: 'clock:hour',              // { day, hour }
  CLOCK_DAY: 'clock:day',                // { day }
  LOG: 'log',                            // { text, kind:'info'|'warn'|'good'|'bad'|'loot'|'combat'|'system', at }
  TOAST: 'toast',                        // { text, kind }

  PLAYER_DAMAGED: 'player:damaged',      // { amount, source, hp }
  PLAYER_HEALED: 'player:healed',        // { amount, hp }
  PLAYER_DIED: 'player:died',            // { reason, detail }
  PLAYER_LEVELUP: 'player:levelup',      // { level, gains }
  PLAYER_XP: 'player:xp',                // { amount, xp, next }
  PLAYER_STATS_CHANGED: 'player:stats',  // {} 裝備/等級/狀態變動 → 衍生數值需重算
  SURVIVAL_WARNING: 'survival:warning',  // { kind:'hunger'|'thirst'|'hp', value }
  STATUS_APPLIED: 'status:applied',      // { id, stacks, duration }
  STATUS_EXPIRED: 'status:expired',      // { id }

  INVENTORY_CHANGED: 'inventory:changed',// { container:'inventory'|'storage' }
  ITEM_USED: 'item:used',                // { itemId }
  EQUIPMENT_CHANGED: 'equipment:changed',// { slot, itemId|null }

  COMBAT_START: 'combat:start',          // { context:'explore'|'raid', enemies:[...] }
  COMBAT_HIT: 'combat:hit',              // { attacker:'player'|'enemy', targetUid, damage, crit, miss }
  COMBAT_ENEMY_KILLED: 'combat:enemyKilled', // { enemy, context }
  COMBAT_FLED: 'combat:fled',            // { success }
  COMBAT_END: 'combat:end',              // { result:'win'|'fled'|'dead'|'aborted', context }

  LOOT_DROPPED: 'loot:dropped',          // { items:[{itemId,qty}], source }
  CHEST_FOUND: 'chest:found',            // { tier }
  CHEST_OPENED: 'chest:opened',          // { tier, items }
  BLUEPRINT_FOUND: 'blueprint:found',    // { blueprintId, source }
  BLUEPRINT_LEARNED: 'blueprint:learned',// { blueprintId, recipeIds }
  BLUEPRINT_DISMANTLED: 'blueprint:dismantled', // { blueprintId, research }

  EXPLORE_START: 'explore:start',        // { areaId }
  EXPLORE_ARRIVED: 'explore:arrived',    // { areaId, depth }
  EXPLORE_POI: 'explore:poi',            // { poi, result }
  EXPLORE_DEEPER: 'explore:deeper',      // { depth }
  EXPLORE_RETURNING: 'explore:returning',// {}
  EXPLORE_HOME: 'explore:home',          // { gathered }
  EXPLORE_AMBUSH: 'explore:ambush',      // { enemies }

  SHELTER_UPGRADED: 'shelter:upgraded',  // { level }
  SHELTER_DAMAGED: 'shelter:damaged',    // { amount, hp, source }
  SHELTER_REPAIRED: 'shelter:repaired',  // { amount }
  SHELTER_DESTROYED: 'shelter:destroyed',// {}
  BUILDING_BUILT: 'building:built',      // { id }
  BUILDING_UPGRADED: 'building:upgraded',// { id, level }
  BUILDING_DAMAGED: 'building:damaged',  // { id, hp }
  BUILDING_PRODUCED: 'building:produced',// { id, itemId, qty }
  CRAFT_QUEUED: 'craft:queued',          // { recipeId }
  CRAFT_DONE: 'craft:done',              // { recipeId, item }

  DISASTER_WARNING: 'disaster:warning',  // { id, inSec }
  DISASTER_START: 'disaster:start',      // { id, duration }
  DISASTER_END: 'disaster:end',          // { id }
  RAID_SCHEDULED: 'raid:scheduled',      // { at }
  RAID_WARNING: 'raid:warning',          // { inSec, difficulty }
  RAID_START: 'raid:start',              // { waves }
  RAID_WAVE: 'raid:wave',                // { wave, count }
  RAID_STRUCTURE_HIT: 'raid:structureHit', // { target:'wall'|'building'|'core', id, damage }
  RAID_END: 'raid:end',                  // { result:'won'|'lost'|'survived' }
  EVENT_TRIGGERED: 'event:triggered',    // { id, choices }
  EVENT_RESOLVED: 'event:resolved',      // { id, choiceId }

  SAVE_DONE: 'save:done',                // { slot, auto }
  SAVE_LOADED: 'save:loaded',            // { slot }
  GAME_NEW: 'game:new',                  // {}
  GAME_OVER: 'game:over',                // { reason, detail }
  GAME_LOCATION: 'game:location',        // { location }
});
