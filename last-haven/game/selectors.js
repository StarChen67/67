/**
 * 純函式選擇器：從 state 推導「衍生事實」，永不寫入 state。
 * 位置只有一個真相來源：exploration / combat 子樹。
 */
export function getLocation(state) {
  if (!state) return 'shelter';
  if (state.combat && state.combat.origin === 'raid') return 'raid';
  const ex = state.exploration;
  if (ex) return ex.phase === 'explore' ? 'area' : 'travel';
  return 'shelter';
}
export const isOutdoor = (state) => !!(state && state.exploration);
export const isHome = (state) => !isOutdoor(state);
export const inCombat = (state) => !!(state && state.combat);
export const isGameOver = (state) => !!(state && state.gameOver);

export const LOCATION_LABEL = Object.freeze({ shelter: '避難所', travel: '旅途中', area: '探索中', raid: '防守中' });

/** 倉庫中某類型物品的總數量（食物庫存／飲水庫存） */
export function stockOf(state, registry, type) {
  let n = 0;
  for (const it of state.shelter.storage.items) {
    const def = registry.item(it.itemId);
    if (def && def.type === type) n += it.qty;
  }
  return n;
}

/** 事件觸發條件用的 selector 取值 */
export function selectValue(state, ctx, selector) {
  switch (selector) {
    case 'player.level': return state.player.level;
    case 'player.hp': return state.player.hp;
    case 'player.hunger': return state.player.hunger;
    case 'player.thirst': return state.player.thirst;
    case 'clock.day': return ctx.clock.day;
    case 'clock.hour': return ctx.clock.hour;
    case 'shelter.level': return state.shelter.level;
    case 'shelter.hp': return state.shelter.hp;
    case 'stock.food': return stockOf(state, ctx.registry, 'food');
    case 'stock.water': return stockOf(state, ctx.registry, 'water');
    case 'stats.kills': return state.stats.kills;
    case 'blueprints.learned': return state.blueprints.learned.length;
    case 'raid.count': return state.raid.count;
    default:
      if (selector.startsWith('flag.')) return state.flags[selector.slice(5)];
      return undefined;
  }
}

export function evalPredicates(state, ctx, predicates) {
  for (const p of predicates || []) {
    const v = selectValue(state, ctx, p.selector);
    if (v === undefined) return false;
    switch (p.op) {
      case '>=': if (!(v >= p.value)) return false; break;
      case '<=': if (!(v <= p.value)) return false; break;
      case '>': if (!(v > p.value)) return false; break;
      case '<': if (!(v < p.value)) return false; break;
      case '==': if (v != p.value) return false; break; // eslint-disable-line eqeqeq
      case '!=': if (v == p.value) return false; break; // eslint-disable-line eqeqeq
      default: return false;
    }
  }
  return true;
}
