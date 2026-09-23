# 末日庇護所 Last Haven

單機「避難所生存 ＋ 探索 ＋ 戰鬥 ＋ 建設」遊戲。原生 ES Modules，零建置；瀏覽器與 Node 共用同一批程式。

## 執行

```bash
npm run build:last-haven  # 把 last-haven/ 打包成單檔 ../last-haven.html
npm run platform          # 靜態伺服器（port 8900）
npm run test:last-haven   # node --test（119 測試）
```

**兩個入口，用途不同：**

| 檔案 | 用途 | 怎麼開 |
|---|---|---|
| `../last-haven.html` | 玩家版。自動產生的單檔（JS 與 CSS 全部內嵌） | 直接雙擊開啟也可以（`file://`），http、GitHub Pages 也都行 |
| `dev.html` | 開發版。直接載入 ES 模組，改完重整就生效 | 必須用 http：`http://localhost:8900/last-haven/dev.html` |

為什麼要打包：瀏覽器在 `file://` 底下會擋掉 ES 模組（origin 是 null，CORS 直接拒絕），
所以雙擊模組版的 HTML 只會看到全黑的畫面。打包版沒有任何外部檔案，因此不受限制。

**改完 `last-haven/` 底下的程式後，記得執行 `npm run build:last-haven`**，否則玩家版還是舊的。
測試讀的是 `last-haven/` 的原始碼，不受打包影響。

除錯：瀏覽器主控台 `LH.game`（state / intent / systems）、`LH.app`。

## 目錄

| 目錄 | 內容 |
|---|---|
| `docs/` | SPEC（原始需求）、GAME_DESIGN、ARCHITECTURE、DATA_MODEL、TODO、TESTING、CHANGELOG |
| `core/` | EventBus、RNG、Clock、ModifierStack、EffectRegistry、Registry、Storage、utils |
| `data/` | 全部資料表：balance、items、status-effects、monsters、loot-tables、chests、maps、shelter-levels、buildings、recipes、blueprints、disasters、events、raids |
| `systems/` | 19 個系統（Player/Survival/StatusEffect/Progression/Item/Inventory/Equipment/Enemy/Combat/Loot/Chest/Exploration/Shelter/Building/Blueprint/Crafting/Disaster/Raid/Event/Save/Audio） |
| `game/` | Game 組合根、state 工廠、intents、selectors |
| `ui/` | App、HUD、畫面（避難所/玩家/背包/製作/圖紙/地圖/探索/戰鬥/設定/存檔/GameOver）、橫幅、元件、音效 |
| `tests/` | node:test 測試 |

## 如何擴充

- **加物品／怪物／配方／圖紙／天災／事件／區域**：只改 `data/*.js`。`npm run test:last-haven` 的 data-integrity 會驗證所有交叉引用、成本可取得性與圖紙掉落覆蓋。
- **加狀態異常**：`data/status-effects.js` 一筆（tick 效果 + modifiers）。
- **加效果型別**：`core/effects.js` 註冊 handler。
- **加系統**：`systems/` 新檔 + `systems/index.js` 註冊；遵守 `init / onNewGame / onStateLoaded / update(dt)`，永遠透過 `this.ctx.state` 讀狀態。
- **改存檔結構**：`game/state.js` 加預設值 + `SAVE_VERSION+1` + `systems/save.js` MIGRATIONS。

詳見 `docs/ARCHITECTURE.md` §7–8 與 `docs/DATA_MODEL.md`。
