# 末日庇護所 — 核心資料模型 (v2，已納入設計審查)

所有欄位皆可 JSON 序列化；**狀態樹不存衍生值**（maxHp、容量、位置、裝備數值都由系統即時計算）。
所有 `*At` / `*Until` 欄位單位皆為 `clock.time` 的遊戲秒。`?` 表示可省略。

## 0. 規格欄位名對照

| 規格用詞 | 程式欄位 |
|---|---|
| blueprintId / displayName / blueprintType / blueprintLevel | BlueprintDef.id / name / type / level |
| stackable | 圖紙 ItemDef.stackMax（>1 即可堆疊） |
| discovered / learned | state.blueprints.discovered / learned（玩家狀態，非資料表） |
| minQuantity / maxQuantity / minimumEnemyLevel | LootEntry 同名欄位（完全照規格） |
| 寶箱品質 普通/精良/稀有/史詩/傳說 | ChestTier = Quality = common/fine/rare/epic/legendary（與裝備、圖紙同一枚舉） |

## 1. GameState（存檔即此物件）

```ts
GameState {
  version: number                 // SAVE_VERSION
  seq: number                     // uid 計數器（決定性 uid = prefix + seq++）
  meta: { name, seed, createdAt, updatedAt, playTime, difficulty }
  rng: { world, combat, loot, explore, craft }   // 各分流的 PRNG 狀態 (uint32)
  clock: { time, lastHour, lastDay }             // day/hour/isNight 為 getter
  player: {                                      // owner: PlayerSystem（hp/xp/level/coins）、SurvivalSystem（hunger/thirst）
    name, level, xp, hp, hunger, thirst, coins,
    bonus: { maxHp, attack, defense }            // 永久增量（天賦預留），基礎值在 balance.player.base
    statusEffects: StatusInstance[]              // owner: StatusEffectSystem
    equipment: { weapon: ItemInstance|null, head, body, legs, accessory }   // owner: EquipmentSystem
  }
  inventory: { items: ItemInstance[] }           // owner: InventorySystem（背包）
  shelter: {                                      // owner: ShelterSystem（level/hp）、BuildingSystem（buildings）
    level, hp,
    buildings: { [buildingId]: BuildingInstance },
    storage: { items: ItemInstance[] }           // owner: InventorySystem（倉庫）
  }
  crafting: { queue: CraftJob[] }                // owner: CraftingSystem
  blueprints: { learned: string[], discovered: string[], researchPoints }  // owner: BlueprintSystem
  exploration: null | ExplorationState           // owner: ExplorationSystem
  combat: null | CombatState                     // owner: CombatSystem（唯一寫入者）
  raid: { nextAt, count, active: null | RaidState }          // owner: RaidSystem
  disasters: { active: DisasterInstance[], cooldownUntil: {[id]: number}, nextRollAt }   // owner: DisasterSystem
  events: { active: {id,left}[], pending: PendingEvent|null, cooldownUntil: {[id]: number}, log: LogEntry[] }  // owner: EventSystem
  flags: { [key]: boolean|number|string }        // owner: EventSystem
  world: { areas: { [areaId]: { discovered, visits, maxDepth, kills } } }   // owner: ExplorationSystem
  stats: { kills, eliteKills, bossKills, chestsOpened, itemsGathered, blueprintsLearned, raidsSurvived, disastersSurvived, crafted, deaths }
  settings: { autoAttack: boolean }              // 影響玩法的設定；裝置偏好 (audio/speed/autosaveSec) 另存 storage key `prefs`
  gameOver: null | { reason: 'starved'|'dehydrated'|'killed'|'shelterDestroyed', detail: { source }, at }
}
```

### 衍生值（selectors / 系統 API，永不寫入 state）
- `getLocation(state)` → `'shelter' | 'travel' | 'area' | 'raid'`：exploration.phase travelOut/travelBack → travel；explore → area；combat?.origin === 'raid' → raid；否則 shelter。
- `isOutdoor(state)` = exploration !== null；`isHome(state)` = !isOutdoor。
- `player.getStats()` = balance.player.base + perLevel×(level−1) + player.bonus + equipment.getBonus() → 再經 modifiers。
- 背包容量 = modifiers.resolve('carryCapacity', balance.inventory.baseCarry)；已裝備物品不計重量。
- 倉庫容量 = modifiers.resolve('storageCapacity', shelterLevel.storageCapacity + Σ building.effects.storage)。單位與背包相同（重量）。
- 食物庫存 / 飲水庫存 = 倉庫中 type food / water 的數量加總（`shelter.getStock()`）。
- 建築 maxHp = def.levels[level-1].hp；避難所 maxHp/defense 來自 shelterLevel + 建築加成。

## 2. 物品

```ts
ItemDef {
  id, name, icon, type: 'food'|'water'|'material'|'medicine'|'weapon'|'armor'|'ammo'|'blueprint'|'quest'|'special'
  subtype?: string                   // 'chest' | 'component' | 'seed' | ...
  desc, weight, stackMax, quality: Quality, value
  effects?: InstantEffect[]          // 消耗品
  equip?: { slot: 'weapon'|'head'|'body'|'legs'|'accessory',
            stats: { attack?, attackSpeed?, critChance?, critDamage?, defense?, maxHp?, moveSpeed?, carry?, accuracy?, dodge?, armorPen? },
            resist?: { [element]: number } }
  blueprintId?                       // type==='blueprint'
  chestTier?: Quality                // subtype==='chest'：寶箱是物品（可帶回家再開），weight 2
  rare?: boolean                     // 區域稀有物（UI 標記）
  tags?: string[]
}
Quality = 'common'|'fine'|'rare'|'epic'|'legendary'
ItemInstance { uid, itemId, qty, quality? }      // 裝備數值 = ItemSystem.getStats(inst) = def.equip.stats × balance.quality.mult[quality]
```

## 3. 怪物

```ts
MonsterDef {
  id, name, icon, tier: 'normal'|'elite'|'boss', tags: string[]
  minLevel: number                   // 生成等級 = max(區域等級, minLevel)
  base: { hp, attack, defense, attackSpeed, moveSpeed, xp, accuracy?, dodge? }   // Lv.1 基準值
  growth?: Partial<GrowthTable>      // 覆寫 balance.monsterGrowth
  lootTableId
  chestDrop?: { chance, tierWeights: { [Quality]: weight } }   // 省略 → 用 balance.loot.defaultChestDrop[tier]
  blueprintChanceMult?, blueprintLevelBonus?, blueprintTypeOverride?: { [BlueprintType]: weight }
  onHitStatus?: { id, chance, duration }
  coins?: [min, max]
}
EnemyInstance { uid, defId, name, icon, level, tier, hp, maxHp, attack, defense, attackSpeed, moveSpeed, xp, accuracy, dodge, cooldown, statusEffects: StatusInstance[] }
// 生成時快照全部數值（含 enemyHp/enemyAttack modifier），之後不再讀 modifier。
```

## 4. Loot / 寶箱 / 圖紙

```ts
LootTable { id, rolls: [min, max], entries: LootEntry[] }
LootEntry { itemId? | chest?: Quality | blueprint?: true | coins?: [min,max] | nothing?: true,
            weight, minQuantity?, maxQuantity?, minimumEnemyLevel? }
ChestDef { tier: Quality, name, icon, color, lootTableId, rolls: [min,max], coins: [min,max],
           blueprintChance, blueprintLevelWeights: {1..5}, rarityWeights?: {[Quality]: weight} }
BlueprintDef {
  id, name, description, type: BlueprintType, level: 1..5, rarity: Quality,
  requiredWorkbenchLevel,            // 顯示用；data-integrity 驗證 = max(recipe.requiredStation.level) of workbench recipes
  unlockedRecipeIds: string[], dropLocations: string[] /* 空 = 通用池 */, minimumAreaLevel?, researchValue?
}
BlueprintType = 'weapon'|'armor'|'tool'|'medicine'|'building'|'defense'|'shelter'|'utility'|'special'
```

### 圖紙擲骰演算法（唯一管線，`LootSystem.rollBlueprint(source, ctx)`）
1. 觸發機率 = 來源基礎值（enemy/resource 用 `balance.blueprintDrop.*`；chest 用 `ChestDef.blueprintChance`）× eliteMult/bossMult × (1 + areaLevelModifier × area.danger) × modifiers('blueprintChance')。
2. 類型 = weightedPick(monster.blueprintTypeOverride ?? area.blueprintPool ?? balance.blueprintDrop.typeWeights)。
3. 等級權重優先序：ChestDef.blueprintLevelWeights → AreaDef.blueprintLevelWeights → balance.levelWeights；Boss 加 blueprintLevelBonus。
4. 稀有度權重 = ChestDef.rarityWeights ?? balance.rarityWeights。
5. 候選 = 同 type、同 level、(dropLocations 空或含 areaId)、minimumAreaLevel ≤ area.danger；以稀有度權重挑一張。無候選 → 等級 ±1 放寬 → 忽略 type → 仍無則不掉。
6. `LootEntry.blueprint:true` 表示「保證擲一次圖紙」（Boss 表、特殊地點用），同樣走步驟 2～5。
7. 掉落的圖紙是物品（type blueprint）進入 loot 暫存區；同時發 `blueprint:found`。

## 5. 地圖

```ts
AreaDef {
  id, name, icon, desc, danger: 1..10, levelRange: [min,max], travelTime: sec, maxDepth
  unlock: { day?, playerLevel?, shelterLevel? }
  resources: { itemId, weight, minQuantity, maxQuantity, gatherTime, minDepth?, rare? }[]
  monsters: { monsterId, weight, levelOffset? }[]
  eliteChance, bossId?, bossDepth?
  chestChance, chestTierWeights: { [Quality]: weight }
  blueprintPool: { [BlueprintType]: weight }, blueprintLevelWeights?: {1..5}
  environment: ContinuousEffect[]    // 在區域內持續生效
  poiWeights: { resource, monster, chest, site }
  sites?: { id, name, icon, searchTime, lootTableId, weight }[]
}
ExplorationState {
  areaId, depth, phase: 'travelOut'|'explore'|'travelBack', travelTotal, travelLeft,
  pois: POI[], activeAction: null | { type:'gather'|'search', poiId, total, left },
  lootPile: ItemInstance[],          // 地上的戰利品（背包放不下時），離開此層即消失
  gathered: { [itemId]: qty }, startedAt
}
POI { id, kind: 'resource'|'monster'|'chest'|'site'|'path', name, icon, done, data }
```

## 6. 戰鬥

```ts
CombatState {
  origin: 'exploration'|'raid'|'event', enemies: EnemyInstance[], targetUid,
  playerCooldown, fleeAttempts, loot: ItemInstance[], coins, xp, log: string[], returnTo?: { poiId }
}
// CombatSystem 是唯一寫入者。Raid/Exploration/Event 呼叫 combat.start(enemies,{origin}) 並監聽 combat:end。
```

## 7. 避難所與建築

```ts
ShelterLevelDef { level, name, maxHp, defense, storageCapacity, cost: Cost[], requiredBlueprintId?, unlocks: string[] }
Cost { itemId, qty }
BuildingDef {
  id, name, icon, category: 'storage'|'production'|'crafting'|'defense'|'utility'|'medical'
  desc, requiresShelterLevel, maxLevel,
  levels: { cost: Cost[], requiredBlueprintId?, hp, effects: BuildingEffects, name? }[]   // levels[0] = 建造需求
}
BuildingEffects {
  storage?, waterPerDay?, foodPerDay?, healPerSec?, wallHp?, turretDps?, power?,
  craftStation?: { station: 'workbench'|'medical'|'kitchen', level }, raidWarningSec?, defense?, shelterMaxHp?
}
BuildingInstance { id, level, hp, acc?: number }   // hp 0 = 停用（效果不算、可修理、不會被刪除）
// 產出：acc += dt/dayLength × perDay，滿 1 放入倉庫；倉庫滿則丟棄（每日記錄一次）。healPerSec 只在 isHome 時作用。
CraftJob { uid, recipeId, left, total }   // 材料在排入時扣除、取消退回；完成時擲品質，成品進倉庫（滿則背包）。只在 isHome 時進行。
```

## 8. 配方

```ts
RecipeDef {
  id, resultItemId, resultQty, requiredItems: Cost[], craftingTime: sec,
  requiredStation: { station, level } | null,     // 製作五重檢查的權威欄位
  requiredLevel: number, conditions?: RecipeCondition[],
  category: 'weapon'|'armor'|'tool'|'medicine'|'food'|'ammo'|'material'|'shelter'|'defense'|'special'
  defaultUnlocked: boolean
}
RecipeCondition = { type:'building', id, level? } | { type:'flag', key } | { type:'power', value } | { type:'shelterLevel', value }
// CraftingSystem.check(recipeId) → { ok, reasons: [{ code:'blueprint'|'station'|'materials'|'condition'|'level', ... }] }
// UI 分頁對照：weapon/ammo→武器、armor→防具、tool/material/food→工具、medicine→醫療、shelter→避難所、defense→防禦、special→特殊
```

## 9. 狀態效果 / 天災 / 事件 / 襲擊

```ts
StatusEffectDef { id, name, icon, kind:'debuff'|'buff', maxStacks, defaultDuration, perStack?: boolean,
                  tick?: ContinuousEffect[], modifiers?: { [key]: {mult?, add?} }, onExpire?: InstantEffect[] }
StatusInstance { id, left: number|null /* null = 擁有者管理（starving/dehydrated 由 Survival 加/移） */, stacks }
// 重複套用：stacks = min(stacks+1, maxStacks)，left = max(left, duration)。modifiers/tick 只在 perStack 時乘 stacks。
// StatusEffectSystem 對任何 entity（玩家或敵人）皆可 tick(entity, dt)。

DisasterDef { id, name, icon, desc, weight, minDay, duration:[min,max], cooldown, warningSec,
              effects: ContinuousEffect[], onStart?: InstantEffect[], onEnd?: InstantEffect[] }
DisasterInstance { id, phase:'warning'|'active', left, total }

EventDef { id, name, icon, desc, trigger: { type:'random'|'condition', weight?, minDay?, location?: Location[], conditions?: Predicate[] },
           probability, cooldown, duration?, effects?: InstantEffect[], continuous?: ContinuousEffect[],
           choices?: { id, label, effects: InstantEffect[], cost?: Cost[] }[], defaultChoiceId?, expiresIn? }
Predicate { selector: 'player.level'|'clock.day'|'shelter.level'|'stock.food'|'stock.water'|..., op: '>='|'<='|'=='|'>'|'<', value }
PendingEvent { id, expiresAt, defaultChoiceId }

RaidTemplateDef { id, minDifficulty, waves: { monsters: { monsterId, count, levelOffset? }[], delay }[] }
RaidState { templateId, difficulty, level, wave, waves, queue: EnemyInstance[], phase:'warning'|'active',
            warningLeft, waveDelayLeft, playerEngaged, damageDealt: { wall, buildings, core }, startedAt }
```

## 10. Effect（通用效果語法）

```ts
InstantEffect =
 | { type:'heal', value } | { type:'damagePlayer', value, ignoreDefense? } | { type:'damage', value }  /* damage: 作用於 ctx.subject */
 | { type:'hunger', value } | { type:'thirst', value }          // 負值 = 降低
 | { type:'status', id, duration?, stacks? } | { type:'cureStatus', id }
 | { type:'damageShelter', value } | { type:'damageBuilding', buildingId?, value }
 | { type:'grantItem', itemId, qty } | { type:'removeItem', itemId, qty }
 | { type:'grantXp', value } | { type:'grantCoins', value } | { type:'grantResearch', value }
 | { type:'spawnRaid', difficultyMult? } | { type:'spawnCombat', monsterId, level?, count? }
 | { type:'damageEnemy', value } | { type:'enemyStatus', id, duration }   // 技能預留
 | { type:'flag', key, value } | { type:'log', text }
ContinuousEffect =
 | { type:'modifier', key: ModifierKey, mult?, add? }
 | { type:'damagePlayer'|'damageShelter'|'damage', perSec, outdoorOnly? }
 | { type:'hunger'|'thirst', perSec }
 | { type:'status', id, perSec /* 每秒套用機率 */, duration?, outdoorOnly? }
// disaster.effects / area.environment / status.tick 只能放 ContinuousEffect；其他位置只能放 InstantEffect（data-integrity 檢查）。
```

### Modifier 表

`resolve(key, base) = clamp((base + Σadd) × Πmult, bounds[key])`；mult 相乘、add 相加。提供者（provider）在 init 註冊一次，每次查詢讀取當下 state，讀檔不需重建。

| key | 消費者 | 基準值 | 提供者 |
|---|---|---|---|
| hungerRate / thirstRate | Survival | balance.survival.*PerSec | 天災、狀態、區域環境 |
| exploreSpeed / gatherSpeed | Exploration | 1 | 天災、狀態、裝備(moveSpeed→exploreSpeed) |
| carryCapacity | Inventory | balance.inventory.baseCarry | 裝備(carry)、狀態 |
| storageCapacity | Inventory | shelterLevel + Σbuilding.storage | 天災(洪水) |
| playerAttack / playerDefense / playerMaxHp / attackSpeed / critChance / accuracy / dodge | Player.getStats | 基礎+等級+裝備 | 狀態、建築(醫療) |
| enemyAttack / enemyHp | Enemy 生成時快照 | 怪物成長值 | 天災、事件、難度 |
| lootChance / blueprintChance / xpGain | Loot / Progression | 1 | 狀態、建築(雷達)、事件 |
| shelterDefense / raidDamage / healRate / craftSpeed / ambushChance | Shelter / Raid / Building / Crafting / Exploration | 1 | 天災、建築、狀態 |
| outdoorDamage | （已改為 damagePlayer perSec outdoorOnly，保留 key 供未來） | | |

## 11. Balance（`data/balance.js` 節錄）

```
time: { dayLength: 480, step: 0.1 }
player: { base: { maxHp: 100, attack: 8, defense: 2, attackSpeed: 1, critChance: 0.05, critDamage: 1.5, moveSpeed: 1, accuracy: 0.95, dodge: 0.03 } }
survival: { hungerPerSec: 0.14, thirstPerSec: 0.19, warnThreshold: 75, hpWarnPct: 0.25 }
progression: { xpBase: 30, xpGrowth: 1.35, perLevel: { maxHp: 10, attack: 2, defense: 1 } }
monsterGrowth: { hp:{mult:1.10, add:3}, attack:{mult:1.07, add:0.6}, defense:{mult:1.06, add:0.3}, xp:{mult:1.09, add:2} }
monsterTier: { elite: { hp: 1.6, attack: 1.3, xp: 2, lootRolls: 1 }, boss: { hp: 4, attack: 1.8, xp: 6, lootRolls: 2 } }
combat: { minDamage: 1, fleeBase: 0.5, fleeSpeedFactor: 0.3, fleeFailPenalty: 1 }
loot: { dropChanceMult: 1, chestChanceMult: 1, tierShiftPerLevel: 0.02, defaultChestDrop: { normal:{chance:0.12,...}, elite:{...}, boss:{ chance:1, minTier:'rare' } } }
blueprintDrop: { enemy: 0.04, resource: 0.03, chest: 0.25, eliteMult: 2.5, bossMult: 6, areaLevelModifier: 0.03, rarityWeights, levelWeights, typeWeights }
research: { byRarity: { common:5, fine:10, rare:25, epic:60, legendary:150 }, redeemMult: 3 }
quality: { mult: { common:1, fine:1.15, rare:1.35, epic:1.6, legendary:2.0 } }
craftQuality: { byWorkbenchLevel: { 1:{common:90,fine:10}, ... 5:{...} }, blueprintRarityShift: { common:0, fine:0, rare:1, epic:1, legendary:2 } }
inventory: { baseCarry: 40, chestWeight: 2 }
shelter: { upgradeCostMult: 1, repairCost: { itemId:'wood', perHp: 0.1 } }
disaster: { rollEveryHours: 6, chancePerRoll: 0.35, maxActive: 1 }
raid: { firstDay: 2, intervalDays: 2, intervalMinDays: 0.75, warningSec: 60, difficulty: { base: 1, perDay: 0.1, perPlayerLevel: 0.05, perShelterLevel: 0.15 }, levelPlayerFactor: 0.8, levelDayFactor: 0.25, frontLine: 2, frontLineDifficulty: 2.4, structureAttackMult: 0.5, awayStructureMult: 1.3 }
exploration: { poiPerDepth: [3,5], ambushBase: 0.08, resourceQtyMult: 1, depthLevelStep: 1 }
modifierBounds: { hungerRate: [0, 10], exploreSpeed: [0.2, 5], ... }
```
