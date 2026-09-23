# 末日庇護所 Last Haven — 架構文件

## 1. 技術選型

| 項目 | 決定 | 理由 |
|---|---|---|
| 語言 | 原生 ES Modules (ES2022)，零建置 | 與 repo 其他正式專案（weiqi）一致；瀏覽器與 Node 直接載入同一批檔案 |
| 入口（開發） | `last-haven/dev.html` → `<script type="module" src="main.js">` | 改完重整即生效，需用 http 開 |
| 入口（玩家） | `last-haven.html`（repo 根目錄，平台自動上架）由 `scripts/build-last-haven.js` 把全部模組與 CSS 內嵌成單檔 | 平台 `/api/games` 掃描根目錄 `.html`；單檔才能在 `file://` 執行（瀏覽器在 file:// 下拒絕載入 ES 模組） |
| 測試 | `node --test last-haven/tests/` | 免安裝；`last-haven/package.json` 標 `"type":"module"` |
| 迴圈 | `setInterval` 100ms ticker → 固定步長 `Game.step(0.1s)` | 預覽窗格凍結 rAF；固定步長讓無頭測試決定性 |
| 存檔 | `localStorage`（Node 用記憶體 adapter）；3 槽 + 自動存檔槽；版本號 + migration 鏈；匯出/匯入 JSON | 單機需求 |
| 美術 | 程式繪圖 (Canvas) + emoji icon + CSS | 無美術資源不停工 |
| 音效 | WebAudio 合成 placeholder，可關閉 | 同上 |

## 2. 分層與依賴方向

```
 ui/        HUD、畫面、元件。只讀 state、呼叫 game.intent(...)、監聽 bus。唯一可碰 DOM 的層。
   │
 game/      Game（組合根）、tick、intents（玩家操作入口）、GameState 工廠、gameover 判定。
   │
 systems/   19 個系統。每個系統: constructor(ctx) / init() / update(dt) / 公開 API。不得 import ui/。
   │
 core/      EventBus、RNG(seeded)、Clock、ModifierStack、EffectRegistry、Registry(資料查詢+驗證)、utils、storage。
   │
 data/      純資料表（items、monsters、maps、…、balance）。任何層可讀，不含邏輯（僅允許少量產生器函式）。
```

**規則**：`systems/`、`core/`、`data/`、`game/` 不得出現 `document`/`window`/`localStorage`（`tests/purity.test.js` 自動檢查；`core/storage.js` 的偵測邏輯是唯一例外）。

## 3. 系統間溝通

1. **共享狀態樹 `ctx.state`**：唯一真相，可 JSON 序列化（存檔即 `JSON.stringify(state)`）。系統只寫自己負責的子樹。
2. **EventBus `ctx.bus`**：系統之間的通知（`combat:enemyKilled` → Loot/Progression/Stats 各自反應）。UI 也監聽。事件名稱集中於 `core/events-catalog.js`。
3. **ModifierStack `ctx.modifiers`**：數值修正的匿名管道。天災、狀態、建築、裝備 `add(source, key, {mult, add})`；Survival/Exploration/Combat 用 `get(key)` 取值，互不認識彼此。
4. **EffectRegistry `ctx.effects`**：資料表中的 `effects[]`（天災、事件、消耗品、建築）由 handler 註冊表執行：`modifier`、`damagePlayer`、`damageShelter`、`heal`、`hunger`、`thirst`、`status`、`grantItem`、`spawnRaid`、`flag`…。新增效果 = 註冊一個 handler。
5. **直接呼叫**：Game 編排流程時直接呼叫系統的公開 API（`systems.exploration.start(areaId)`）。系統彼此透過 `ctx.systems.x` 查詢（例如 Crafting 問 Blueprint `hasRecipe`），但**只准呼叫公開查詢／命令，不准改別人的子樹**。

## 4. 目錄與職責

```
last-haven/
  main.js                  瀏覽器入口：建 Game、掛 UI、啟動 ticker
  core/
    events.js              EventBus
    events-catalog.js      事件名稱常數 + 說明
    rng.js                 mulberry32 seeded PRNG（所有隨機都走這裡）
    clock.js               世界時間：time/day/hour/isNight、每日/每小時事件
    modifiers.js           ModifierStack
    effects.js             EffectRegistry + 內建 handler
    registry.js            Data registry：以 id 取資料、驗證交叉引用
    storage.js             localStorage / Memory adapter
    utils.js               clamp、weightedPick、uid、deepClone、fmt
  data/
    balance.js             全部平衡參數（章節二十三 + 四十）
    items.js               物品（食物/水/材料/藥/武器/防具/彈藥/圖紙/特殊）
    status-effects.js      狀態效果（starving/dehydrated/poison/bleed/radiation/…）
    monsters.js            怪物 + 菁英/Boss 標記 + lootTableId
    loot-tables.js         Loot Table
    chests.js              寶箱五階
    maps.js                區域（怪物池、資源池、圖紙池、危險、旅途、環境 modifier）
    shelter-levels.js      避難所等級表
    buildings.js           設施（含工作台 Lv1–5）
    recipes.js             製作配方
    blueprints.js          圖紙
    disasters.js           天災
    events.js              世界事件
    raids.js               襲擊波次樣板
    index.js               匯出 DATA 物件（供 Registry）
  systems/
    player.js              PlayerSystem：衍生數值計算 (getStats)、受傷/治療、死亡
    survival.js            SurvivalSystem：飢渴上升、吃喝、閾值狀態、死亡判定
    status-effects.js      StatusEffectSystem：狀態套用/計時/tick 效果/modifier
    progression.js         ProgressionSystem：XP、升級曲線、升級獎勵
    combat.js              CombatSystem：戰鬥狀態機、命中管線、玩家/怪物攻擊、逃跑
    enemy.js               EnemySystem：依等級產生怪物實例（成長曲線）、AI 冷卻
    inventory.js           InventorySystem：背包/倉庫增減、重量、堆疊、轉移
    item.js                ItemSystem：物品定義查詞、實例建立(品質/數值)、使用消耗品
    equipment.js           EquipmentSystem：裝備/卸下、裝備加成彙總
    loot.js                LootSystem：Loot Table 擲骰、圖紙掉落判定
    chest.js               ChestSystem：寶箱產生與開啟
    shelter.js             ShelterSystem：等級/HP/Def/容量/升級/修理
    building.js            BuildingSystem：建造/升級/拆除、元件效果、每日產出、工作台等級
    crafting.js            CraftingSystem：五重檢查、製作佇列
    blueprint.js           BlueprintSystem：發現/學習/重複拆解/配方權限/收藏統計
    exploration.js         ExplorationSystem：旅途、樓層、POI 生成、採集、深入、返回
    disaster.js            DisasterSystem：排程、開始/結束、效果套用
    raid.js                RaidSystem：排程、警告、波次、結構受損、炮塔
    event.js               EventSystem：世界事件觸發/冷卻/選項
    save.js                SaveSystem：版本、migration、槽位、自動存檔、匯出匯入
    audio.js               AudioSystem：事件→音效對照（純資料），ui 注入 WebAudio 播放器
    index.js               建立全部系統並注入 ctx
  game/
    state.js               createNewState(seed, name)：完整初始狀態樹
    game.js                Game：組合根、tick、intent 分派、Game Over 判定
    intents.js             玩家操作清單（eat/drink/explore/attack/craft/…）與參數驗證
  ui/
    app.js                 UI 根：畫面切換、HUD、bus 訂閱、toast
    styles.css             樣式（深色、警告狀態、行動裝置）
    hud.js
    screens/*.js           main-menu, shelter, player, inventory, crafting, blueprints, map,
                           explore, combat, raid, settings, saves, gameover
    components/*.js        toast, modal, bars, item-card
    canvas/*.js            map-render, scene-render（程式繪圖）
  tests/
    *.test.js（見 TESTING.md）
  docs/
    GAME_DESIGN.md ARCHITECTURE.md DATA_MODEL.md TODO.md TESTING.md CHANGELOG.md
```

## 5. 遊戲迴圈

```
tick(dtReal):
  dt = min(dtReal, 0.1) × settings.speed
  clock.advance(dt)                       → 發 clock:hour / clock:day
  statusEffects.update(dt)
  survival.update(dt)                      → 飢渴上升（讀 modifiers）
  disaster.update(dt)
  event.update(dt)
  building.update(dt)                      → 產出 / 治療
  crafting.update(dt)                      → 製作佇列
  exploration.update(dt)                   → 旅途、採集計時、埋伏
  combat.update(dt)                        → 玩家/怪物冷卻與攻擊
  raid.update(dt)
  game.checkGameOver()
  save.update(dt)                          → 自動存檔計時
  bus.emit('tick')                         → UI 重繪 HUD（UI 自行節流）
```

## 6. 存檔

- `state.version` = `SAVE_VERSION`。`systems/save.js` 的 `MIGRATIONS[from]` 逐版升級。
- 存檔 = 整棵 state（含 rng seed/state、clock、玩家、背包、倉庫、避難所、建築、探索、戰鬥、襲擊、天災、事件、世界、統計、設定）。
- 讀檔流程：parse → validate → migrate → normalize（補齊缺欄位）→ 重建 modifiers（由狀態/建築/天災/裝備重新註冊，不存 modifiers 本身）。
- 槽位：`slot1..3` + `autosave`；每槽有 backup。匯出為 JSON 文字，匯入時走同一條驗證鏈。

## 7. 擴充指引

- 新物品／怪物／配方／圖紙／天災 → 只加資料。`tests/data-integrity.test.js` 會驗證所有交叉引用。
- 新狀態異常 → `data/status-effects.js` 加一筆（tick 效果與 modifier 用資料表達）。
- 新效果型別 → `core/effects.js` 註冊 handler。
- 新系統 → `systems/` 加檔並在 `systems/index.js` 註冊，遵守 `constructor(ctx)/init()/update(dt)`。
- 新存檔欄位 → `game/state.js` 加預設 + `SAVE_VERSION+1` + migration。

## 8. 設計審查後的決議（2026-09-06）

1. **位置是衍生值**：不存 `player.location`。`game/selectors.js` 的 `getLocation / isOutdoor / isHome / inCombat` 是唯一真相。
2. **CombatState 單一擁有者**：只有 CombatSystem 寫 `state.combat`；Raid/Exploration/Event 呼叫 `combat.start(enemies, {origin})` 並監聽 `combat:end`。
3. **Game Over 單一擁有者**：系統只發 `player:died` / `shelter:destroyed`，Game 在 `checkGameOver()` 依優先序 killed > dehydrated > starved > shelterDestroyed 寫入 `state.gameOver`；`step()` 開頭 `if (gameOver) return`；自動存檔在 gameOver 後停止（手動存檔仍可）。
4. **固定步長**：`Game.tick(dtReal)` 累積後以 `STEP = balance.time.step (0.1s)` 重複呼叫 `Game.step(STEP)`；`step` 是無頭測試的公開入口，所有系統可假設 dt ≤ STEP。
5. **ModifierStack 為 provider 制**：系統在 init 註冊一次 provider 讀當下 state；讀檔不需重建；`resolve(key, base) = clamp((base+Σadd)×Πmult, bounds)`。
6. **Effect 分兩類**：Instant（value）與 Continuous（perSec / modifier）；擁有者自行每步 `tickContinuous`。`status.left = null` 表示由擁有者管理（starving/dehydrated）。
7. **系統不得快取 state**：永遠 `this.ctx.state`；purity 測試 grep `this\.state\s*=`。系統有 `onStateLoaded()` 鉤子。
8. **決定性**：uid = prefix + `state.seq++`；`now()` 由 Game 注入；RNG 分五條流 world/combat/loot/explore/craft。
9. **Intent 契約**：`game.intent(name, params)` 回傳 `{ ok, reason?, result? }`，被拒絕不丟例外；每個 intent 宣告 `allowedWhen(state)`。
10. **寶箱是物品**（`chest_<tier>`，weight 2），用 `openChest(uid)` 開啟；背包放不下的戰利品進 `exploration.lootPile` / `combat.loot` 暫存區，用 `takeLoot(uid)` 撿取。
11. **容量單位統一為重量**；已裝備物品不計重；容量為軟上限（超過時不能再放入，不會銷毀）。
12. **製作**：材料排入佇列時扣除、取消退回、完成時擲品質；只在 isHome 時進行；成品進倉庫（滿則背包）。
13. **讀檔管線**：parse → 形狀檢查 → migrate（連續鏈）→ normalize（幂等、深度補預設）→ validate（未知 id 丟棄並記錄，不丟錯）→ 靜默重建衍生值。

### 狀態子樹擁有者

| 子樹 | 擁有者（唯一寫入者） | 主要讀者 |
|---|---|---|
| player.hp/xp/level/coins/bonus | PlayerSystem / ProgressionSystem | 全部 |
| player.hunger/thirst | SurvivalSystem | UI、Event |
| player.statusEffects、enemy.statusEffects | StatusEffectSystem | Player.getStats、Combat |
| player.equipment | EquipmentSystem | Player.getStats、Inventory |
| inventory.items、shelter.storage.items | InventorySystem | Crafting、Shelter、Building、UI |
| shelter.level/hp | ShelterSystem | Raid、Building、UI |
| shelter.buildings | BuildingSystem | Crafting、Raid、Shelter、UI |
| crafting.queue | CraftingSystem | UI |
| blueprints.* | BlueprintSystem | Crafting、Shelter、Building、UI |
| exploration、world.areas | ExplorationSystem | Combat、UI |
| combat | CombatSystem | Raid、Exploration、UI |
| raid | RaidSystem | UI |
| disasters | DisasterSystem | UI |
| events、flags | EventSystem | UI、Recipe conditions |
| stats | 各系統經 `stats.inc(key)` | UI |
| gameOver、meta、clock、rng、seq | Game / Clock / SaveSystem | 全部 |
