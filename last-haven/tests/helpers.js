import { Game } from '../game/game.js';
import { Storage, MemoryStorage } from '../core/storage.js';

/** 建立無頭遊戲（記憶體存檔、固定時間、固定 seed） */
export function makeGame({ seed = 42, name = '測試', storage, now, quiet = true } = {}) {
  let t = 1_700_000_000_000;
  const g = new Game({ storage: storage || new Storage(new MemoryStorage()), now: now || (() => (t += 1000)) });
  g.newGame({ name, seed });
  if (quiet) makeQuiet(g);
  return g;
}
/** 關閉隨機排程（天災擲骰、襲擊、隨機/條件事件），讓單元測試不受干擾 */
export function makeQuiet(g) {
  g.state.disasters.nextRollAt = 1e12;
  g.state.raid.nextAt = 1e12;
  for (const e of g.registry.list('events')) g.state.events.cooldownUntil[e.id] = 1e12;
}
export const find = (g, container, itemId) => g.systems.inventory.items(container).find((i) => i.itemId === itemId);
export const give = (g, container, itemId, qty = 1, opts = {}) => g.systems.inventory.add(container, itemId, qty, { force: true, ...opts });
