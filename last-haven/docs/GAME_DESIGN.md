# 末日庇護所 Last Haven — 遊戲設計文件 (GDD)

> 單機「避難所生存 ＋ 探索 ＋ 戰鬥 ＋ 建設」。本文件是需求分析的結果，
> 對應使用者規格第一～四十五節；每一節都標出在程式中由哪個系統負責。

## 0. 需求分析摘要（規格 → 系統 → 資料表）

| 規格章節 | 需求 | 負責系統 | 資料表 |
|---|---|---|---|
| 一 | 核心循環：準備→探索→搜資源→戰鬥→戰利品→返回→製作升級→抵禦→再探索 | Game (流程編排) | — |
| 二 | HP/MaxHP/Atk/Def/Hunger/Thirst/XP/Level；飢渴 0~100，到 100 死亡；狀態模組化 | PlayerSystem, SurvivalSystem, StatusEffectSystem | balance, status-effects |
| 三 | HUD：等級、HP、飢餓、口渴、攻防；進度條；>75 / <25% 警告 | UI (hud) | — |
| 四 | 多區域探索，各自怪物/資源/危險度/寶箱/稀有物/天氣；資料驅動物品 | ExplorationSystem | maps, items |
| 五 | 怪物欄位＋等級成長曲線（非固定倍率） | EnemySystem | monsters, balance.monsterGrowth |
| 六 | Damage = max(1, Atk − Def)；可擴充暴擊/命中/閃避/攻速/元素/穿甲/技能/異常 | CombatSystem (hit pipeline) | balance.combat |
| 七 | 五階寶箱、Loot Table（itemId/weight/min/max/minimumEnemyLevel） | LootSystem, ChestSystem | loot-tables, chests |
| 八 | 五個裝備槽，武器影響 Atk/攻速/暴擊，防具影響 Def/MaxHP/抗性，品質五階 | EquipmentSystem, ItemSystem | items, balance.quality |
| 九 | 背包欄位、堆疊、重量、品質；容量有限 → 出門帶什麼是策略 | InventorySystem | items, balance.inventory |
| 十 | 避難所等級/HP/Def/儲物/食水庫存；設施列表 | ShelterSystem, BuildingSystem | shelter-levels, buildings |
| 十一 | 升級成本與效果資料化 | ShelterSystem | shelter-levels |
| 十二 | 天災事件系統，效果以 modifier/effect 描述，不用巨大 if/else | DisasterSystem + EffectRegistry + ModifierStack | disasters |
| 十三 | 週期性襲擊、60 秒警告、攻擊牆/炮塔/建築/核心；核心 0 → 失敗；難度隨天數/等級/避難所等級 | RaidSystem | raids, balance.raid |
| 十四 | 資料驅動配方（recipeId/result/requiredItems/craftingTime/requiredStation/requiredLevel） | CraftingSystem | recipes |
| 十五 | 經驗與升級（不與 UI 綁死） | ProgressionSystem | balance.progression |
| 十六 | 統一事件系統（id/名稱/觸發條件/持續/效果/機率/冷卻） | EventSystem | events |
| 十七 | 新遊戲/存/讀/自動存檔；saveVersion 與 migration | SaveSystem | — |
| 十八～十九 | 主選單、HUD、各功能畫面、玩家面板 | UI | — |
| 二十 | Game Over 四種死因 + 三個按鈕 | Game + UI | — |
| 二十一～二十三 | 系統拆分、資料驅動、獨立平衡參數 | 全部 | balance |
| 二十四 | 第一版 18 項可玩目標 | — | 見 TODO.md Phase 6 |
| 二十七～二十九 | 工作台等級、圖紙物品、圖紙分類 | BuildingSystem(workbench), BlueprintSystem | buildings, blueprints |
| 三十～三十三 | blueprintLevel 與 requiredWorkbenchLevel 分離、圖紙 UI、學習、重複圖紙 → 研究點 | BlueprintSystem | blueprints, balance.research |
| 三十四～三十五 | 圖紙取得：怪物/採集/寶箱；區域圖紙池；稀有度獨立 | LootSystem (blueprint roll) | balance.blueprintDrop, maps.blueprintPool |
| 三十六 | 製作五重檢查並回報原因 | CraftingSystem.check() | — |
| 三十七～三十九 | 避難所/設施/工作台升級可要求圖紙 | ShelterSystem, BuildingSystem | shelter-levels, buildings |
| 四十～四十四 | 掉落平衡表、資料驅動、BlueprintSystem、工作台分類 UI、圖紙收藏 UI | BlueprintSystem, UI | — |
| 四十五 | 圖紙／工作台／探索／戰鬥／升級互相連結 | 整體設計 | — |

## 1. 一句話

你是末日後的倖存者，靠一座避難所活下去：出門探索危險區域找食物、水、材料與**圖紙**，
打怪開寶箱，回家學圖紙、升工作台、造裝備與設施、升級避難所，抵禦天災與週期性的怪物襲擊，
再走向更危險的區域。

## 2. 遊戲模式與時間

- **即時制**。世界時間以秒計（`clock.time`），1 遊戲日 = `balance.time.dayLength` 秒（預設 480 秒 = 8 分鐘真實時間）。
- 飢餓／口渴隨時間**上升**（0 正常 → 100 死亡）。基礎速度使玩家約 12 分鐘不吃會餓死、約 9 分鐘不喝會渴死，因此一趟探索必須帶食物與水。
- 所有主迴圈用 `setInterval` 驅動（預覽窗格不支援 rAF），`dt` 夾在 0.1 秒內；背景分頁被節流時遊戲自然放慢。
- 晝夜（`clock.hour`）在第一版只是資料（`isNight`），第二階段再賦予效果。

## 3. 場景（玩家所在位置）

```
shelter ──出發──▶ travelOut ──▶ explore(區域第 d 層) ──▶ travelBack ──▶ shelter
                                     │  ▲
                                     ▼  │
                                   combat（遭遇/主動攻擊）
shelter ─ raid warning(60s) ─▶ raid combat（在避難所） ─▶ shelter
```

- **避難所**：安全（除天災/襲擊）。可吃喝、整理背包／倉庫、製作、建造、升級、學圖紙、存檔。
- **探索**：選擇區域 → 旅途（秒數 = 區域 `travelTime` ÷ 探索速度修正）→ 進入第 1 層。
  每層隨機產生 3～5 個「地點 (POI)」：`resource` 採集點、`monster` 怪物、`chest` 寶箱、`site` 特殊地點、`path` 深入下一層。
  採集需要時間並可能被埋伏；深入一層怪物等級上升；可隨時「返回」（需要走回程）。
- **戰鬥**：即時。玩家武器有攻速冷卻（可手動按攻擊，或開自動攻擊）；怪物依各自攻速攻擊；
  可用道具、可嘗試逃跑（成功率取決於移動速度差）。
- **襲擊**：在避難所發生。60 秒警告後多波怪物到達：前排怪物與玩家戰鬥，其餘怪物攻擊防禦牆→設施→核心；
  炮塔對隊列自動輸出。核心 HP 歸零 = 遊戲失敗。玩家不在家時，設施自行抵抗。

## 4. 玩家數值

| 數值 | 說明 | 來源 |
|---|---|---|
| maxHp | 基礎 100 + 升級 + 防具 + 建築(醫療) | Progression、Equipment |
| attack | 基礎 10 + 升級 + 武器 | 同上 |
| defense | 基礎 2 + 升級 + 防具 | 同上 |
| attackSpeed | 武器決定（次/秒），基礎 1.0 | Equipment |
| critChance / critDamage | 基礎 5% / 150% | Equipment、天賦(未來) |
| moveSpeed | 影響旅途時間與逃跑 | Equipment、狀態 |
| hunger / thirst | 0~100 (clamp)，速度受天災/狀態 modifier | Survival |
| resist | 抗性表（poison/bleed/radiation/cold/heat…），第一版預留 | Equipment |

**警告閾值**：hunger > 75、thirst > 75 給 `starving` / `dehydrated` 狀態（減攻防），HP < 25% HUD 閃紅。

**死亡條件**（任一）：hp ≤ 0（怪物殺死／天災）、hunger ≥ 100、thirst ≥ 100、避難所核心 hp ≤ 0。

## 5. 區域（11 區，資料一次做齊）

| 區域 | 危險 | 怪物等級 | 特色資源 | 圖紙池 |
|---|---|---|---|---|
| 近郊森林 forest | 1 | 1–4 | 木材、漿果、雨水、草藥、魚 | 工具/功能/建築 Lv1 |
| 廢棄住宅區 suburbs | 2 | 3–7 | 布料、罐頭、瓶裝水、零件 | 生活/防具 Lv1–2 |
| 超市 supermarket | 3 | 5–9 | 食物、水、藥品 | 醫療/生活 Lv1–2 |
| 加油站 gasstation | 3 | 6–10 | 燃料、金屬、零件 | 工具/建築/武器 Lv2 |
| 荒野 wasteland | 4 | 7–11 | 石頭、怪物皮、化學藥劑（環境：口渴 ×1.35） | 工具/防具/武器 Lv2 |
| 工廠 factory | 5 | 9–14 | 金屬、零件、電子零件 | 工具/機械/工作台 Lv2–3 |
| 醫院 hospital | 5 | 10–15 | 藥品、繃帶、抗生素 | 醫療 Lv2–3 |
| 廢棄城市 city | 6 | 12–18 | 混凝土、金屬、電子 | 建築/防禦 Lv3 |
| 軍事基地 military | 8 | 16–24 | 彈藥、槍械零件、高級金屬 | 武器/防具 Lv3–4 |
| 地下研究所 lab | 9 | 20–28 | 電子、高級零件、特殊材料 | 高科技/特殊 Lv4–5 |
| 怪物巢穴 nest | 10 | 24–32 | 怪物素材、稀有材料 | 特殊 Lv4–5、Boss |

區域有 `environment` 效果（森林潮濕、荒野酷熱、輻射區持續扣血等），由 modifier / effect 表達。

## 6. 怪物與成長曲線

怪物 `base` 是**在自己的 `minLevel` 時**的數值（設計時直接寫出場等級的合理值），只對「等級差」成長：

```
stat(L) = base × growthMult^(L − minLevel) + growthAdd × (L − minLevel)
```

`balance.monsterGrowth` 預設 `{ hp:{mult:1.06, add:8}, attack:{mult:1.04, add:1.2}, defense:{mult:1.02, add:0.5}, xp:{mult:1.06, add:2} }`，個別怪物可覆寫。
菁英 ×1.6 HP／×1.3 Atk／×2 XP＋1 次額外掉落；Boss ×3 HP／×1.25 Atk／×5 XP＋2 次掉落。
平衡帶（由 `tests/enemy.test.js` 驗證）：同級玩家需 1.3～10 下擊殺，怪物每下 ≤ 15% 玩家生命、每秒 ≤ 13%。
生成等級隨深度遞增，且不低於 `minLevel`；區域可用 `minDepth` 限制高階怪出現層數。

## 7. 戰鬥公式（管線）

```
hitCheck   : rng < accuracy − dodge
baseDamage : attack × weaponMult
armor      : max(1, dmg − defense × (1 − armorPen))
crit       : if rng < critChance → × critDamage
elemental  : + elementDamage × (1 − resist[element])
statusOnHit: 中毒/流血 機率
```

第一版只啟用 base/armor/crit，其餘管線階段已存在但參數為 0，資料表加值即可啟用。

## 8. 掉落與寶箱

- 每隻怪物 `lootTableId` + `chestDrop:{ chance, tierWeights }`。
- Loot Table 條目 `{ itemId | chest | blueprint, weight, min, max, minEnemyLevel }`。
- 寶箱五階：common/fine/rare/epic/legendary（與裝備、圖紙同一枚舉），各自 lootTable、rolls、金錢、圖紙機率與圖紙等級權重。寶箱是**可攜帶物品**（`chest_<tier>`），可就地開或帶回家開。
- 怪物等級越高，寶箱品質權重越往上移（`balance.loot.tierShiftPerLevel`）；Boss 必掉且最低稀有。
- 圖紙掉落：`balance.blueprintDrop` 控制 enemy/resource/chest 基礎機率、菁英/Boss 倍率、區域等級修正、稀有度與等級權重；區域 `blueprintPool` 決定類型分佈（醫院偏醫療、軍基偏武器…）。

## 9. 裝備與品質

五槽：weapon / head / body / legs / accessory。品質 common/fine/rare/epic/legendary → 數值倍率 1.0/1.15/1.35/1.6/2.0（`balance.quality`）。製作品質由工作台等級與圖紙稀有度決定機率。

## 10. 背包與倉庫

重量制：背包 `maxWeight`（基礎 40 + 配件），倉庫容量由避難所等級與倉庫建築決定。物品有 `weight`、`stackMax`。
外出前的策略：食物、水、藥、彈藥 vs. 留給戰利品的空間。

## 11. 避難所與設施

避難所 Lv1–6：HP/Def/倉庫容量/解鎖設施；Lv3→4 起需要圖紙。設施（第一版全部有資料，部分需圖紙）：
倉庫、蓄水桶、食物儲藏室、工作台(Lv1–5)、醫療站、防禦牆、炮塔、發電機、農場、淨水器、雷達。
設施元件（effects）決定功能：`storage`、`waterPerDay`、`foodPerDay`、`healPerSec`、`wallHp`、`turretDps`、`power`、`craftStation`、`raidWarningSec`。

## 12. 天災（9 種）

暴雨(探索速度↓)、熱浪(口渴↑)、寒流(飢餓↑)、地震(避難所與設施受損)、酸雨(戶外扣血)、雷暴(設施受損)、沙塵暴(探索/採集↓、口渴↑)、洪水(倉庫容量↓)、輻射風暴(戶外扣血＋輻射狀態)。
每個天災 = `effects[]`（ContinuousEffect）＋ `onStart/onEnd`（InstantEffect），交給 EffectRegistry 與 modifier provider 執行；沒有 if/else 分支。預警 `warningSec` → 生效 → 結束（進冷卻）。

## 13. 襲擊

`raid.nextAt` 由 `balance.raid.firstDay / intervalDays / intervalMinDays` 決定；難度 = base + perDay×天數 + perPlayerLevel×等級 + perShelterLevel×避難所等級，只用來挑 `raids.js` 樣板（波數與組成）。
怪物等級 = 0.8×玩家等級 + 0.25×天數 + 波次序號（`balance.raid.levelPlayerFactor/levelDayFactor`），避免首次襲擊出現遠高於玩家的怪；難度 < 2.4 時前排只有 1 隻。玩家不在家時設施獨自抵抗（結構受傷 ×1.3）。

## 14. 製作與圖紙

- 配方五重檢查：圖紙已學 → 工作台等級 → 材料 → 其他設施 → 玩家等級。任何不足都回傳原因碼供 UI 顯示「需要工作台 Lv.3」「缺少金屬 x2」。
- 圖紙物品 → 學習（消耗，永久解鎖 recipe）→ 重複圖紙可拆解為研究點（5/10/25/60/150）。
- 研究點第一版用途：兌換指定圖紙（研究站/選單），第二版擴充科技樹。

## 15. 第一版可玩目標（規格二十四）與驗收方式

見 `TODO.md` Phase 6 驗收清單，每一項對應一個自動化測試或瀏覽器操作步驟。
