# 銀行大亨 — 開發階段與 TODO

## 開發階段

| 階段 | 內容 | 狀態 |
|---|---|---|
| P0 設計 | ARCHITECTURE / GAME_DESIGN / TODO | ✅ |
| P1 引擎骨架 | util、registry、config、10 個資料檔、state、save、game、economy、treasury、reports、credit、customers、deposits、simulation | ✅ 7 項測試 |
| P2 投資與成長 | stocks、products、upgrades、printer | ✅ |
| P3 風險 | security、robbery、insurance、events、bankruptcy | ✅ |
| P4 測試 | core / systems / save / manifest 四組，共 55 項 | ✅ |
| P5 平衡 | sim-bot 四種策略 × 三個種子 × 6 年；靜態 ROE 體檢；刷錢檢查 | ✅ 見 BALANCING.md |
| P6 UI | 13 個分頁、SVG 圖表、彈窗、鍵盤快捷、瀏覽器實測 | ✅ |
| P7 上架 | games-catalog、package.json script、文件 | ✅ |

## 已完成的功能

- 存款：利率調整、吸引力拆解、每日利息累計、每 30 天付息、付不出變待付義務
- 客戶：5 種類型、資本槓桿上限、單筆存款上限、恐慌值、擠兌、花錢安撫
- 投資：22 支股票（價格引擎含動能與崩盤、避險標的的景氣加成）、7 種固定收益商品
- 銀行等級：8 級資料驅動，含槓桿上限、客戶上限、營運費、貸款額度、信用上限、功能解鎖
- 印鈔機：8 級，通膨與「印鈔量/總資產」成正比
- 信用：8 級評級，由資本適足、流動性、獲利、保全、等級、逾期六項決定
- 保全：8 種設備共 44 級、保全人員（人數/裝備/訓練/受傷）、耐久與維修
- 搶劫：風險值、5 級強盜、漸進式金庫突破、警方速度、保全減免、單次損失上限
- 保險：3 種方案，風險加權保費
- 事件：24 種，含持續修正值與一次性效果
- 破產：兩種失敗條件、完整結算統計
- 存檔：校驗、備份復原、migration、repair、匯出匯入
- UI：13 個分頁、資產與股價曲線、金庫保護視覺化、警告橫幅、事件與搶劫彈窗

## 後續擴充（結構已預留）

- **對客戶放貸**：`treasury.loans` 的反向；可以做成另一種資產類別，
  報酬介於公債與股票之間，但有倒帳風險與催收機制
- **分行**：`state.branches`，每間分行有自己的客戶池與保全，
  `levels.js` 加一個 `maxBranches` 欄位即可
- **員工系統**：行員影響客戶服務品質與營運費
- **行銷活動**：花錢短期提升 `arrivalMult`
- **通膨影響名目存款金額**：讓後期的數字自然膨脹
- **股票下市與股利**：`data/stocks.js` 加 `delistProb` 與 `dividend`
- **成就系統與本機排行榜**
- **離線結算**：目前關掉分頁遊戲就暫停；要做的話在 `game.tick` 加上時間差補算，
  但要先決定離線時要不要發生搶劫
