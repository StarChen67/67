# CHANGELOG

## Phase 1 (2026-09-05) — 需求分析、架構、資料模型、計畫
- 新增 docs/：GAME_DESIGN.md、ARCHITECTURE.md、DATA_MODEL.md、TODO.md、TESTING.md

## Phase 2 (2026-09-06) — 核心骨架 + 生存 + 存檔 + 主選單/HUD
**已完成功能**
- core/：EventBus、seeded RNG（五條分流）、Clock、ModifierStack（provider 制）、EffectRegistry、Registry（交叉引用驗證）、Storage adapter、utils
- data/：balance、items（106 項）、status-effects（15 種）、shelter-levels（6 級）
- systems/：Player、Survival、StatusEffect、Progression、Item、Inventory、Equipment、Save（版本/migration/normalize/validate/備份/匯出匯入/自動存檔）、Audio
- game/：state 工廠、Game 組合根（固定 0.1s 步長、intent 契約、Game Over 單一判定）、intents、selectors
- ui/：主選單、HUD（值/上限＋警告樣式）、避難所總覽、玩家面板、背包/倉庫、存檔、設定、Game Over、toast/modal、WebAudio 佔位音效
- 入口 last-haven.html（平台自動上架）
**測試**：`npm run test:last-haven` 42/42 通過（purity、data-integrity、survival、inventory、equipment、progression、save、simulation）
**瀏覽器實測**：新遊戲 → HUD → 快速補給 → 口渴>75 警告樣式 + 脫水狀態 → 口渴 100 Game Over 顯示「你死於脫水。」→ 重新開始 → 存檔 → 重新載入頁面 → 繼續遊戲恢復 → 從倉庫裝備砍刀攻擊力更新
**發現並修復的 bug**
1. 武器攻速被加到基礎攻速（1+1=2）→ 改為武器攻速取代基礎值
2. `Inventory.takeByUid` 整堆取出時先把 qty 歸零再回傳同一物件 → 轉移/存入全部的物品憑空消失（修正為直接 splice）
3. 時鐘 0.1s 累加浮點漂移 → 1440s 後天數算錯（advance 改為四捨五入到 1e-4）
4. 長 heredoc 在此環境會解析失敗 → 大檔改用 Write
**仍存在的問題**：資料驗證有 14 條「避難所解鎖的建築不存在」為 Phase 4 待填資料（測試以 PENDING 白名單標示）
**下一階段**：Phase 3 探索/戰鬥/怪物/掉落/寶箱

## Phase 3 (2026-09-06) — 探索 + 戰鬥 + 怪物 + 掉落 + 寶箱
**已完成功能**
- data/：monsters（19 普通、4 菁英、6 Boss，base 為 minLevel 數值＋等級差成長曲線）、loot-tables（30 張，欄位照規格 minQuantity/maxQuantity/minimumEnemyLevel）、chests（5 階）、maps（11 區含荒野，資源/怪物/寶箱/圖紙池/環境效果/特殊地點）
- systems/：Enemy（成長曲線、深度遞增、菁英升格、Boss）、Combat（命中管線 hitCheck→armor(armorPen)→crit、冷卻、自動攻擊、逃跑、彈藥消耗、狀態附加、戰利品暫存）、Loot（Loot Table 擲骰、等級提升寶箱品質、Boss 保底、統一圖紙擲骰管線）、Chest（寶箱為可攜帶物品）、Exploration（區域解鎖、旅途、樓層 POI、採集/搜索、埋伏、深入、返回、環境 modifier）
- ui/：地圖（程式繪製世界地圖 + 區域卡片）、探索畫面（旅途進度、POI 清單、地上戰利品）、戰鬥畫面（程式繪製場景、敵人 HP/冷卻條、目標切換、攻擊/逃跑/快速用藥）
**測試**：68/68（新增 enemy、combat、loot、chest、exploration；enemy 含平衡帶檢查：擊殺 1.3～10 下、每下 ≤15% HP、每秒 ≤13% HP）
**瀏覽器實測**：出發森林→旅途 18 秒→抵達→採集（途中埋伏，勝）→戰鬥（老鼠+烏鴉）→撿寶箱→背包開箱→返回→存入倉庫
**發現並修復的 bug**
1. Loot Table 的 `coins` 條目被驗證器判為無 payload
2. 怪物數值從 Lv.1 指數成長導致高等級爆炸（Lv.20 巨型突變獸 3027 HP）→ base 改為 minLevel 時的值、只對等級差成長、曲線放緩
3. 森林第 1 層可生成 Lv.4～5 怪與雙怪組 → 等級隨深度遞增、區域怪物 `minDepth`、雙怪機率隨深度上升、玩家基礎攻擊 8→10、老鼠/烏鴉攻速下修（不補血連戰 12 seeds：6 死 → 0 死）
4. UI `data-areaId` 等 camelCase 屬性經 HTML 小寫化後 dataset 取不到 → 改為 kebab-case（影響所有 intent 參數）
**仍存在的問題**：圖紙資料尚未填入，圖紙掉落管線回傳 null（Phase 4）
**下一階段**：Phase 4 避難所升級/建築/工作台/製作/圖紙

## Phase 4 (2026-09-06) — 避難所升級 + 建築 + 工作台 + 製作 + 圖紙
**已完成功能**
- data/：buildings（11 種設施：工作台 Lv1–5、倉庫、蓄水桶、食物儲藏室、防禦牆、炮塔、醫療站、農場、淨水器、發電機、雷達；高階升級需圖紙）、recipes（61 條，requiredStation {station, level}）、blueprints（69 張，9 類 × Lv1–5 × 5 稀有度，dropLocations 區域限定）；圖紙物品由 blueprints 自動產生
- systems/：Shelter（升級成本/效果/圖紙需求/修理/摧毀）、Building（建造/升級/損毀停用/修理/產出/治療/製作站等級/modifier）、Blueprint（發現/學習/重複拆解研究點/兌換/配方使用權/收藏統計/圖紙資訊）、Crafting（五重檢查原因碼、佇列、取消退回、品質擲骰：工作台等級 + 圖紙稀有度）
- ui/：避難所（升級卡、設施建造/升級/修理、原因與「缺少：X圖紙」）、製作（8 分頁、每項顯示站台等級與目前等級、圖紙狀態、材料 擁有/需要、時間、缺少 X x N）、圖紙收藏（分類統計、？？？、詳情卡：種類/等級/品質/需要工作台（目前）/可製作/材料/狀態、研究點兌換）
- Registry 驗證擴充：圖紙需解鎖配方或閘門建築/避難所；requiredWorkbenchLevel 與配方一致；成本物品皆可取得；每張圖紙都有掉落地點
**測試**：86/86（新增 shelter、building、crafting、blueprint、data 可取得性與圖紙覆蓋）
**瀏覽器實測**：建工作台→製作分頁原因顯示→製作繃帶→學鐵劍圖紙→重複拆解研究點 10→圖紙卡顯示「需要工作台 Lv.2（目前工作台 Lv.1）」→升工作台→鑄出精良鐵劍→升級避難所 Lv.2
**發現並修復的 bug**
1. 建築類圖紙只有 Lv3 一張，森林靠放寬規則掉出 Lv3 圖紙 → 補 Lv1–2 建築圖紙並掛到蓄水桶/溫室/倉庫/冷藏室升級
2. 魚、髒水沒有取得來源（新測試抓到）→ 加入森林/荒野資源
3. 產出累加浮點誤差（測試調整）
4. 製作原因「缺少：圖紙」未顯示圖紙名稱
**仍存在的問題**：無
**下一階段**：Phase 5 天災 / 襲擊 / 事件

## Phase 5 (2026-09-08) — 天災 + 襲擊 + 事件
**已完成功能**
- data/：disasters（9 種：暴雨/熱浪/寒流/地震/酸雨/雷暴/沙塵暴/洪水/輻射風暴，全部以 effects 資料描述）、raids（7 級波次樣板）、events（11 個：商人/求助者/空投/夜襲/稀有怪物×2/Boss 傳聞/食物短缺/飲水短缺/避難所損壞）
- systems/：Disaster（每 6 小時擲骰、預警→生效→結束、modifier provider、onStart 效果如地震損壞）、Raid（排程、60 秒警告＋雷達加時、波次、前排交戰、其餘攻擊牆→設施→核心、炮塔輸出、玩家不在家時設施獨自抵抗、勝利獎勵、下一次排程遞減）、Event（隨機/條件觸發、冷卻、選項成本、到期預設、持續事件）
- core/effects：damageBuilding 隨機設施、grantRandomBlueprint
- ui/：襲擊/天災/事件橫幅、事件對話框（成本不足選項灰掉、到期倒數）
- balance：event.chancePerHour、raid.levelPlayerFactor/levelDayFactor/frontLineDifficulty
**測試**：100/100（新增 disaster、raid、event；helpers.makeGame 預設 quiet 關閉隨機排程）
**瀏覽器實測**：熱浪預警橫幅→生效（口渴 ×1.6 顯示於玩家面板修正）→商人事件對話框→購買補給→建牆→襲擊警告→探索被擋→60 秒後自動切到戰鬥畫面（無逃跑鍵）→擊退兩波 7 隻→獎勵與下一次排程
**發現並修復的 bug**
1. 襲擊怪物等級 = 難度×3 → 第 2 天就 Lv.4 雙怪前排，新手必死 → 改以玩家等級為基準、低難度前排 1 隻（10 seeds 不補血 9 勝）
2. 稀有怪物事件在 Lv.1 就丟出菁英頭狼 → 加最低等級與天數門檻
3. Registry 驗證事件選項 `cost:{coins}` 當成陣列而當掉
4. modal 內 inline `stopPropagation` 吃掉委派點擊 → 事件/確認對話框按鈕無效 → 改 `data-action="noop"`
5. 單元測試被隨機天災/襲擊干擾（熱浪渴死玩家）→ 測試 helper 預設關閉排程
**下一階段**：Phase 6 整合驗收（規格二十四 18 項）、上架、bug hunt
