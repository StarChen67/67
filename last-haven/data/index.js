import { BALANCE } from './balance.js';
import { ITEMS } from './items.js';
import { STATUS_EFFECTS } from './status-effects.js';
import { MONSTERS } from './monsters.js';
import { LOOT_TABLES } from './loot-tables.js';
import { CHESTS } from './chests.js';
import { AREAS } from './maps.js';
import { SHELTER_LEVELS } from './shelter-levels.js';
import { BUILDINGS } from './buildings.js';
import { RECIPES } from './recipes.js';
import { BLUEPRINTS } from './blueprints.js';
import { DISASTERS } from './disasters.js';
import { EVENTS } from './events.js';
import { RAIDS } from './raids.js';

/** 每張圖紙自動對應一個 type:'blueprint' 的物品（同 id），確保一致。 */
export function blueprintItems(blueprints, balance) {
  return blueprints.map((bp) => ({
    id: bp.id, name: `${bp.name}圖紙`, icon: '📜', type: 'blueprint', desc: bp.description,
    weight: balance.inventory.blueprintWeight, stackMax: 10, quality: bp.rarity,
    value: (bp.researchValue ?? balance.research.byRarity[bp.rarity]) * 2, blueprintId: bp.id,
  }));
}
/** 每階寶箱自動對應一個可攜帶的物品 chest_<tier>。 */
export function chestItems(chests, balance) {
  return chests.map((c) => ({
    id: `chest_${c.tier}`, name: c.name, icon: c.icon || '📦', type: 'special', subtype: 'chest', chestTier: c.tier,
    desc: `${c.name}，帶回避難所或就地打開。`, weight: balance.inventory.chestWeight, stackMax: 5, quality: c.tier, value: 10,
  }));
}

export function buildData() {
  return {
    balance: BALANCE,
    items: [...ITEMS, ...blueprintItems(BLUEPRINTS, BALANCE), ...chestItems(CHESTS, BALANCE)],
    statusEffects: STATUS_EFFECTS,
    monsters: MONSTERS,
    lootTables: LOOT_TABLES,
    chests: CHESTS,
    areas: AREAS,
    shelterLevels: SHELTER_LEVELS,
    buildings: BUILDINGS,
    recipes: RECIPES,
    blueprints: BLUEPRINTS,
    disasters: DISASTERS,
    events: EVENTS,
    raids: RAIDS,
  };
}

export const DATA = buildData();
