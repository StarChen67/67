# 測試策略

## 自動化（`npm run test:last-haven` → `node --test last-haven/tests/`）

| 檔案 | 覆蓋 |
|---|---|
| purity.test.js | systems/core/data/game 不得含 document/window/localStorage（storage.js 例外） |
| data-integrity.test.js | 所有 id 交叉引用存在；數值範圍；每個 recipe 有 defaultUnlocked 或至少一張圖紙；每張圖紙的 recipe 存在；區域圖紙池型別有對應圖紙 |
| survival.test.js | 飢渴 clamp 0~100、速率受 modifier、吃喝、100 → gameOver 原因 |
| progression.test.js | XP 曲線單調、升級加成 |
| combat.test.js | 公式 max(1, atk−def)、暴擊、冷卻、怪物攻擊、死亡、逃跑 |
| enemy.test.js | 成長曲線單調、菁英倍率 |
| loot.test.js | seeded 擲骰可重現、minEnemyLevel 過濾、寶箱階級、圖紙機率 |
| inventory.test.js | 堆疊、重量上限、轉移到倉庫、倉庫容量 |
| equipment.test.js | 裝備/卸下影響衍生數值、品質倍率 |
| exploration.test.js | 旅途→POI 生成→採集→深入→返回；埋伏；區域解鎖 |
| shelter.test.js | 升級成本/效果/圖紙需求、修理 |
| building.test.js | 建造/升級/工作台等級/元件效果/每日產出 |
| crafting.test.js | 五重檢查原因碼、佇列、品質 |
| blueprint.test.js | 發現/學習/重複拆解研究點/收藏統計 |
| disaster.test.js | 排程、modifier 套用與解除、onStart 傷害 |
| raid.test.js | 警告→波次→牆/建築/核心受損→勝利/失敗 |
| event.test.js | 觸發/冷卻/選項效果 |
| save.test.js | roundtrip、migration、normalize、匯出匯入、損毀存檔 |
| simulation.test.js | 無頭跑完整核心循環 N 分鐘不拋錯、不出現 NaN |

## 瀏覽器（Browser pane + javascript_tool；rAF 在預覽窗格不會觸發，遊戲迴圈用 setInterval）
- 用 `window.LH.game` 直接呼叫 intent 驗證 DOM 更新。
- 每階段的操作腳本記錄於 CHANGELOG.md。
