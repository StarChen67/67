# 銀行大亨 Bank Tycoon

從 20 萬本金的小銀行開始，經營到世界級金融集團的單機管理遊戲。
純 JavaScript、零建置、存檔在瀏覽器 localStorage。

開啟 `bank-tycoon.html` 即可遊玩。

---

## 遊戲怎麼運作

銀行的獲利公式只有一條：

```
ROE = (1 + 槓桿) × 資產收益率 − 槓桿 × 存款利率 − 固定成本 / 淨資產
```

你用 2% 的存款利率借進客戶的錢，拿去買 8% 的公債或報酬更高的股票，賺中間的利差。
槓桿把利差放大，也把虧損放大。三件事必須同時顧：

- **收益**：現金放著只有準備金利息，不投資會慢慢虧。
- **風險**：股票會崩、債券會違約、危機時客戶會同時提款，逼你在低點賣股。
- **安全**：現金越多越引來強盜。金庫的「保護額」決定他們搬得走多少，
  「突破門檻」決定金庫守不守得住 —— 兩者都要跟著銀行一起長大。

失敗只有兩種：**到期付不出錢**，或**淨資產連續 10 天為負**。
單純欠客戶存款不會倒，那是銀行的正常狀態。

## 檔案結構

```
bank-tycoon.html      載入頁（樣式 + script 順序）
bank-tycoon/
  core/               util（數學/亂數/格式化/EventBus）、registry
  config/config.js    所有平衡數值
  data/               等級、客戶、股票、商品、保全、強盜、保險、印鈔機、評級、事件
  systems/            16 個系統（規則都在這裡）
  save/               state 結構、序列化與 migration
  game.js             Game 門面（接線、生命週期、彙總數字）
  ui/                 DOM 工具、SVG 圖表、狀態列、4 組面板、彈窗、主控制器
  main.js             開機流程
  tests/              測試框架、55 項測試、平衡機器人
  docs/               本文件與其他 5 份設計文件
```

## 指令

```bash
npm run test:bank-tycoon          # 55 項測試
npm run sim:bank-tycoon -- all 2160   # 四種策略 × 三個種子跑 6 年，看成長曲線與死因
node bank-tycoon/tests/run.js systems # 只跑某一組測試
```

## 要加東西的話

| 想加什麼 | 改哪裡 |
|---|---|
| 新的銀行等級 | `data/levels.js` 加一筆，`features` 放解鎖旗標字串 |
| 新股票 / 理財商品 | `data/stocks.js`、`data/products.js` 加一筆 |
| 新保全設備 | `data/security.js` 加一筆，`levels[]` 用既有欄位就會自動生效 |
| 新強盜等級 | `data/robbers.js` 加一筆（`weights` 長度要等於 `BT.CASH_TIERS`） |
| 新隨機事件 | `data/events.js` 加一筆；要用新效果就在 `systems/events.js` 的 `_applyOnce` 加一個 case |
| 調整手感 | 只改 `config/config.js`，程式碼裡不該出現魔法數字 |
| 新系統 | `systems/` 加一個 class，在 `game.js` 的 `_wire()` 接線，在 `simulation.js` 的每日流程插入 |

加完之後跑一次測試：`tests/manifest.test.js` 會檢查 HTML 的 script 順序、
`tests/core.test.js` 會檢查資料表完整性與帳目守恆。

## 其他文件

- [ARCHITECTURE.md](ARCHITECTURE.md) — 分層、系統列表、每日流程、state 結構
- [GAME_DESIGN.md](GAME_DESIGN.md) — 所有公式與數值表（表格由資料檔產生）
- [BALANCING.md](BALANCING.md) — 各等級 ROE 體檢、策略實測、調整過程中修掉的失衡
- [SAVE_FORMAT.md](SAVE_FORMAT.md) — 存檔格式、migration、repair
- [TODO.md](TODO.md) — 開發階段與後續擴充
