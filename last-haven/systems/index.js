import { PlayerSystem } from './player.js';
import { SurvivalSystem } from './survival.js';
import { StatusEffectSystem } from './status-effects.js';
import { ProgressionSystem } from './progression.js';
import { ItemSystem } from './item.js';
import { InventorySystem } from './inventory.js';
import { EquipmentSystem } from './equipment.js';
import { SaveSystem } from './save.js';
import { AudioSystem } from './audio.js';
import { EnemySystem } from './enemy.js';
import { CombatSystem } from './combat.js';
import { LootSystem } from './loot.js';
import { ChestSystem } from './chest.js';
import { ExplorationSystem } from './exploration.js';
import { ShelterSystem } from './shelter.js';
import { BuildingSystem } from './building.js';
import { BlueprintSystem } from './blueprint.js';
import { CraftingSystem } from './crafting.js';
import { DisasterSystem } from './disaster.js';
import { RaidSystem } from './raid.js';
import { EventSystem } from './event.js';

/**
 * 建立全部系統並掛到 ctx.systems。UPDATE_ORDER 決定每步的更新順序（見 ARCHITECTURE §5）。
 * 尚未實作的系統（後續階段）在此註冊即可。
 */
export function createSystems(ctx, { storage } = {}) {
  const s = {};
  s.player = new PlayerSystem(ctx);
  s.survival = new SurvivalSystem(ctx);
  s.statusEffects = new StatusEffectSystem(ctx);
  s.progression = new ProgressionSystem(ctx);
  s.item = new ItemSystem(ctx);
  s.inventory = new InventorySystem(ctx);
  s.equipment = new EquipmentSystem(ctx);
  s.enemy = new EnemySystem(ctx);
  s.combat = new CombatSystem(ctx);
  s.loot = new LootSystem(ctx);
  s.chest = new ChestSystem(ctx);
  s.exploration = new ExplorationSystem(ctx);
  s.shelter = new ShelterSystem(ctx);
  s.building = new BuildingSystem(ctx);
  s.blueprint = new BlueprintSystem(ctx);
  s.crafting = new CraftingSystem(ctx);
  s.disaster = new DisasterSystem(ctx);
  s.raid = new RaidSystem(ctx);
  s.event = new EventSystem(ctx);
  s.save = new SaveSystem(ctx, storage);
  s.audio = new AudioSystem(ctx);
  ctx.systems = s;
  return s;
}

export const UPDATE_ORDER = [
  'statusEffects', 'survival', 'player',
  'disaster', 'event', 'building', 'crafting',
  'exploration', 'combat', 'raid',
  'save',
];
