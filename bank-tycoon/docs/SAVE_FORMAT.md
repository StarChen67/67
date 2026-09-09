# 銀行大亨 — 存檔格式（SAVE_FORMAT）

## 儲存鍵（localStorage）

| 鍵 | 內容 |
|---|---|
| `bt_save` | 主存檔 |
| `bt_save_bak` | 上一版；每次寫入前先把舊的主存檔搬過來 |
| `bt_save_corrupt` | 最近一次讀取失敗的原始字串，供除錯與手動救援 |

## 封裝格式

```json
{ "v": 1, "savedAt": 1788918461048, "checksum": "3f2a91c", "data": "<JSON.stringify(state)>" }
```

`checksum` 是 `data` 字串的 FNV-1a 32 bit 雜湊（十六進位）。校驗不符直接判定損壞，
改讀 `bt_save_bak`；兩份都壞才回報失敗。

## 讀檔流程（`Save.load`）

```
主存檔存在？
├─ 解析成功 → migrate() → repair() → 回傳 { state, source:'main' }
└─ 失敗 → 把原始字串寫進 bt_save_corrupt
          └─ 備份存在且可讀 → 回傳 { state, source:'backup', recoveredFrom: 錯誤 }
          └─ 否則 → { state:null, error, hadData:true }
```

## Migration

`MIGRATIONS[n]` 把 schemaVersion `n` 升到 `n+1`，逐版套用。之後一定會跑：

1. `U.defaults(state, stateSkeleton())` — 補上新版本新增的鍵，不覆寫既有值。
2. `Save.repair(state)` — 修掉明顯壞掉的資料。

**新增 schema 版本的步驟**
1. `CONFIG.schemaVersion += 1`
2. 在 `save/save.js` 的 `MIGRATIONS` 加一個函式
3. 更新本文件

多數情況其實不需要新版本：新增股票、保全設備、事件、等級都由 `defaults` + `repair` 自動吸收。

## `repair()` 會做的事

- 新增的股票補上初始價、歷史價與動能；移除已不存在的股票持股
- 移除已不存在的保全設備；等級與耐久夾回合法範圍
- 移除類型不存在或餘額 ≤ 0 的客戶
- 移除商品定義不存在的持倉、金額 ≤ 0 的待付義務與貸款
- 移除定義不存在的進行中事件與保險方案
- 現金、等級、信用、恐慌、利率、通膨、市場利率全部夾回合法範圍
- 缺少的每日帳本補成空帳本

## state 結構

見 `save/state.js` 的 `stateSkeleton()`。重點欄位：

| 路徑 | 說明 |
|---|---|
| `seed` / `rngState` | 亂數種子與目前狀態。存檔後讀回會接續同一條序列，結果可重現 |
| `day` | 經營天數，所有時間邏輯都用這個 |
| `bank` | 名稱、等級、經驗、信用、現金、存款利率、恐慌、擠兌狀態、淨資產為負的連續天數 |
| `customers.list[]` | `{ id, name, type, balance, joinedDay, deposited, withdrawn }` |
| `treasury.obligations[]` | 付不出來的款項 `{ kind, key, amount, label, customerId, createdDay, dueDay }` |
| `treasury.loans[]` | 緊急貸款 `{ principal, dailyRate, startDay }` |
| `stocks` | `prices` / `prevPrices` / `hist`（每支最多 180 天）/ `momentum` / `holdings` / `realized` / `fees` |
| `products.holdings[]` | `{ productId, amount, startDay, matureDay }` |
| `security.devices` | `{ 設備id: { level, cond } }`；`guards` 是人數／裝備／訓練／受傷 |
| `reports.history[]` | 每日快照 `{ d, assets, net, cash, dep, stock, prod, profit }`，最多 3600 天 |
| `reports.profitWindow[]` | 最近 30 天的日淨利，信用系統用 |
| `stats` | 破產結算畫面的所有數字 |

派生值（**不存檔**，每次由 `game.totals()` 重算）：總資產、總負債、淨資產、準備率。
這樣就不會出現「存檔裡的合計和明細對不起來」的問題。

## 匯出／匯入

`exportSave()` 把整個封裝做 base64；`importSave()` 反向解開後一樣走 `parse → migrate → repair`。
設定頁可以複製字串備份，或貼上別台裝置的存檔。
