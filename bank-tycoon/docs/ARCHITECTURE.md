# 銀行大亨 Bank Tycoon — 架構說明（ARCHITECTURE）

> 對應程式：`bank-tycoon/`（載入頁 `bank-tycoon.html`）。純 JS、零建置、單機、localStorage 存檔。
> 相關文件：`docs/GAME_DESIGN.md`（系統與公式）、`docs/BALANCING.md`、`docs/SAVE_FORMAT.md`、`docs/TODO.md`。

---

## 1. 總覽

- 每個檔案都是一個 IIFE：`(function (root) { 'use strict'; const BT = root.BT ... })(typeof window !== 'undefined' ? window : globalThis);`
- 所有東西掛在單一命名空間 `window.BT` 底下（`BT.util`、`BT.CONFIG`、`BT.registries`、`BT.Game`、`BT.UI`）。
- **載入順序的唯一真相**：`tests/manifest.js` 匯出 `{ engine: [...], ui: [...] }`；`bank-tycoon.html` 的 `<script>` 順序必須一致，`tests/manifest.test.js` 會驗證。
- **時間模型**：離散「天」。`Simulation.advanceDay()` 是唯一會推進世界的入口；UI 用 `setInterval` 依速度（1×/2×/4×/8×）呼叫，也可手動「下一天」。關閉頁面時遊戲暫停（沒有離線結算）。
- **引擎 / UI 分離**：`engine` 層完全不碰 DOM，可在 Node 裡用 `tests/harness.js` 載入跑幾千天（`tests/sim-bot.js`）。

### 1.1 分層（只能往下依賴）

| 層 | 檔案 | 職責 |
|---|---|---|
| core | `core/util.js`、`core/registry.js` | 數學、seeded PRNG、格式化、EventBus、Registry |
| config | `config/config.js` | 所有平衡數值 `BT.CONFIG`；程式碼不出現魔法數字 |
| data | `data/*.js` | 內容：等級、客戶類型、股票、理財商品、保全設備、強盜、保險、印鈔機、事件、信用評級、名字 |
| systems | `systems/*.js` | 規則；每個系統 `class X { constructor(game) }`，用 `get st()` 指向 `game.state` 子樹 |
| save | `save/state.js`、`save/save.js` | `stateSkeleton()`、序列化、校驗、備份、migration、`repair()` |
| facade | `game.js` | `BT.Game`：接線、生命週期、跨系統流程（只轉呼叫，不放規則） |
| ui | `ui/*.js`、`main.js` | 只讀 `game.*`、監聽 `game.bus`；zh-Hant |

### 1.2 規則
1. 規則只住在 `systems/`；數值進 `CONFIG`；內容進 `data/`。
2. 系統之間不 import；需要通知別人用 `game.bus.emit`；可透過 `game.<system>` 呼叫公開方法。
3. `state` 是純資料（可 JSON 化）；系統物件不持有需要存檔的狀態。
4. 所有金額為整數元（`Math.round`），避免浮點累積誤差污染帳目。

---

## 2. 系統列表（`systems/`）

| 系統 | 檔案 | 職責 |
|---|---|---|
| Economy 總體經濟 | `economy.js` | 景氣階段（normal/boom/recession/crisis）狀態機、市場基準利率隨機漫步、通膨衰減、對外提供 `costMult()`、`demandedRate()` |
| Treasury 金庫帳務 | `treasury.js` | 現金唯一出入口 `receive()/charge()`；付不出的支出進「待付義務」佇列（有期限）；每日 FIFO 結清；緊急貸款；流動性指標 |
| Customers 客戶 | `customers.js` | NPC 客戶生成（依等級的類型權重）、每日存款/提款/離開、吸引力公式、恐慌值、銀行擠兌 |
| Deposits 存款利息 | `deposits.js` | 存款利率設定、每日應付利息累計、每 30 天付息（付不出→義務→逾期→信用/恐慌） |
| Stocks 股票 | `stocks.js` | 價格引擎（漂移、波動、動能、崩盤、事件/景氣修正）、買賣、持股、平均成本、損益、歷史價 |
| Products 理財商品 | `products.js` | 固定期限商品（公債/企業債/…）申購、到期、提前贖回 |
| Credit 信用 | `credit.js` | 信用分數 0–1000 → 評級 AAA…D；每日向「基本面目標」靠攏 + 事件衝擊 |
| Upgrades 升級 | `upgrades.js` | 銀行等級、經驗值、升級條件與解鎖查詢 `unlocked(feature)` |
| Printer 印鈔機 | `printer.js` | 解鎖/升級/印鈔（冷卻）、通膨增加 |
| Security 保全 | `security.js` | 設備等級、保全人員（人數/裝備/訓練）、防禦值、金庫保護額/強度、維護費、耐久與維修 |
| Robbery 搶劫 | `robbery.js` | 搶劫風險值、每日觸發、強盜生成、成功率、損失、設備損壞、保險理賠、統計 |
| Insurance 保險 | `insurance.js` | 方案、風險加權保費、理賠 |
| Events 事件 | `events.js` | 隨機事件抽選、持續效果修正值（`mod(key)`）、一次性效果、事件日誌 |
| Reports 報表 | `reports.js` | 每日收入/支出分類累計、資產負債、淨資產、歷史曲線、最高紀錄 |
| Bankruptcy 破產 | `bankruptcy.js` | 失敗條件判定、警告、結算統計 |
| Simulation 模擬 | `simulation.js` | `advanceDay()` 固定順序呼叫上述系統 |

### 2.1 每日流程（`Simulation.advanceDay()`）
1. `day += 1`；報表開新一天
2. Economy：景氣/利率/通膨
3. Events：到期、抽新事件、套用一次性效果
4. Stocks / Products：價格更新、到期兌付
5. Customers：新客戶、存款、提款、離開、恐慌衰減、擠兌
6. Deposits：利息累計、付息日
7. 固定支出：營運費、保全維護、薪資、保費、貸款利息
8. Treasury：結清待付義務、逾期處理
9. Robbery：風險值、觸發、結算（含保險）
10. Credit：分數更新
11. Upgrades：經驗值
12. Reports：收盤數字、歷史、最高紀錄
13. Bankruptcy：判定
14. 自動存檔（每 N 天）→ `bus.emit('day:end')`

---

## 3. 資料結構（`state`，見 `save/state.js`）

```js
{
  schemaVersion: 1, version, seed, rngState,          // 亂數可重現
  day: 0, speed: 1, paused: false, gameOver: null,     // gameOver = {reason, summary}
  bank: { name, level, xp, credit: 600, cash: 200000, depositRate: 0.02, foundedDay: 0, panic: 0, bankRun: false },
  customers: { list: [ { id, name, type, balance, joinedDay, mood } ], nextId, log: [] },
  deposits: { payable: 0, nextPayDay: 30, lastPaid: 0, ratePaid: 0 },
  treasury: { obligations: [ { id, kind, amount, label, createdDay, dueDay, customerId } ], loans: [ { id, principal, dailyRate, startDay } ], nextId },
  stocks: { prices: { id: price }, prev: {id}, hist: { id: [..] }, momentum: {id}, holdings: { id: { qty, avgCost } }, realized: 0, mods: [ { key, sector, value, endDay } ] },
  products: { holdings: [ { id, productId, amount, startDay, matureDay } ] },
  economy: { phase: 'normal', phaseDay: 0, marketRate: 0.025, inflation: 0, sentiment: 0 },
  printer: { level: 0, lastPrintDay: -99, printedTotal: 0 },
  security: { devices: { door_lock: { level: 1, cond: 100 }, ... }, guards: { count: 0, equip: 1, training: 1, injured: 0 } },
  insurance: { plan: null, since: 0, paidTotal: 0, payoutTotal: 0 },
  robbery: { risk: 0, lastAttemptDay: -99, history: [ {...} ] },
  events: { active: [ { id, startDay, endDay, mods } ], log: [ { day, text, kind } ], lastFired: { id: day } },
  reports: { today: { income: {...}, expense: {...} }, yesterday: {...}, history: [ { d, a, n, c, dep, s, l } ], rolling: [ netWorth by day ] },
  stats: { maxAssets, maxCustomers, maxLevel, robberies, defended, stolen, insurancePaid, printed, tradesCount, ... },
  pendingModals: [ { type, payload } ],
  settings: { autosave: true, pauseOnEvent: true, compact: false }
}
```

派生值（不存檔，由 `game.totals()` 每次計算）：
- `stockValue = Σ qty × price`、`productValue = Σ 本金 + 已應計`
- `assets = cash + stockValue + productValue`
- `liabilities = deposits + payable + obligations + loans`
- `netWorth = assets − liabilities`

---

## 4. 可擴充點

- 新等級：`data/levels.js` 加一筆；解鎖用 `features: ['...']` 字串，`upgrades.unlocked('x')` 查。
- 新股票 / 商品：`data/stocks.js`、`data/products.js` 加一筆（`tier` 決定解鎖等級）。
- 新保全設備：`data/security.js` 加一筆，定義 `levels[]` 的 `defense/maint/cost` 與特殊欄位（`attackMult/policeSpeed/protectCap/breachStrength/abortChance/panicMult`），系統會自動彙總。
- 新強盜：`data/robbers.js` 加 tier（含各現金區間權重）。
- 新事件：`data/events.js` 加一筆，用既有效果鍵；需要新效果鍵時在對應系統加一個 `events.mod('key')` 讀取點。
- 預留：`state.treasury.loans`（未來對客戶放貸）、`state.branches`（分行）、`features` 陣列（任何新功能旗標）。
