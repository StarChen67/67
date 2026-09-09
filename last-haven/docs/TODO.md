# 末日庇護所 — 開發計畫與 TODO

每一階段結束必須：執行遊戲 → 測試主要功能 → 找 bug → 修 bug → 確認不破壞既有功能 → 記錄於 CHANGELOG.md。

## Phase 1 — 需求分析 / 架構 / 資料模型 / 計畫
- [x] GAME_DESIGN.md、ARCHITECTURE.md、DATA_MODEL.md、TODO.md、TESTING.md
- [x] 對規格逐節做覆蓋審查（外部審查 workflow），修正文件缺漏（60 條 → 架構決議寫入 ARCHITECTURE §8、DATA_MODEL v2）

## Phase 2 — 核心骨架 + 生存 + 存檔 + 主選單/HUD
目標：可在避難所活動、飢渴上升、吃喝、飢渴 100 死亡、存讀檔。
- [x] core/: events, rng, clock, modifiers, effects, registry, storage, utils
- [x] data/: balance, items(第一批), status-effects
- [x] systems/: player, survival, status-effects, progression, inventory, item, equipment, save
- [x] game/: state, game, intents（eat/drink/save/load/new）
- [x] ui/: app, hud, main-menu, shelter(基本), inventory, player, saves, gameover, toast
- [x] tests: survival、inventory、save-roundtrip、purity、data-integrity
- [x] 瀏覽器實測：新遊戲→吃喝→加速到餓死→Game Over 顯示死因→讀檔恢復

## Phase 3 — 探索 + 戰鬥 + 怪物 + 掉落 + 寶箱 + 裝備
- [x] data/: monsters, maps(11 區), loot-tables, chests
- [x] systems/: enemy, combat, loot, chest, exploration
- [x] ui/: map(canvas), explore, combat(scene canvas)
- [x] tests: growth curve、hit pipeline、loot roll、exploration flow、flee
- [x] 實測：出發→採集→遇怪→打死→掉落/寶箱→開箱→背包滿→返回→存倉庫

## Phase 4 — 避難所升級 + 建築 + 工作台 + 製作 + 圖紙
- [x] data/: shelter-levels, buildings(含 workbench Lv1–5), recipes, blueprints
- [x] systems/: shelter, building, crafting, blueprint
- [x] ui/: shelter(升級/建造/修理), crafting(分類 + 原因顯示), blueprints(收藏)
- [x] tests: 五重檢查原因碼、圖紙學習/重複拆解、升級需圖紙、工作台等級限制
- [x] 實測：拿到圖紙→學習→工作台不足提示→升工作台→製作→裝備

## Phase 5 — 天災 + 襲擊 + 事件
- [x] data/: disasters(9), raids, events(11)
- [x] systems/: disaster, raid, event
- [x] ui/: raid 畫面、天災橫幅、事件對話框
- [x] tests: modifier 套用/解除、襲擊流程(牆→建築→核心)、核心 0 → gameover、事件冷卻
- [x] 實測：警告 60 秒→襲擊→炮塔輸出→勝利獎勵；地震損壞→修理

## Phase 6 — 第一版整合驗收（規格二十四）✅
18 項全部通過（見 tests/acceptance.test.js 逐條測試 + docs/CHANGELOG.md 瀏覽器實測步驟）：
玩家可在避難所活動／五項數值／飢渴隨時間增加／飢渴 100 Game Over／吃喝／外出探索／地圖生成資源／
地圖生成怪物／玩家攻擊怪物／怪物攻擊玩家／掉落資源或寶箱／開寶箱／資源帶回避難所／升級避難所／
隨機天災／怪物襲擊／存讀檔／重開後恢復
- [x] 平衡初調（森林不補血連戰 12 seeds 0 死；第 2 天 Lv.2 防守 10 次 9 勝；4–5 天 bot 模擬存活）
- [x] 上架 games-catalog.json + npm run test:last-haven
- [x] Bug hunt（人工兩輪 20 個邊界案例，修復 5 個 bug，全部加回歸測試）

## Phase 7 — 第二階段（第一版穩定後）
Boss(巢穴)、技能樹(researchPoints 已預留)、武器改造/防具強化、陷阱、炮塔進階、農場/淨水/發電效果、
更多區域(city/military/lab/nest 已有資料)、稀有資源、隨機事件擴充、晝夜效果、天氣、任務、成就、天賦、難度模式、更多怪物。
