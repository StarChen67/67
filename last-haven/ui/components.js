/** UI 小工具：跳脫、進度條、物品卡、格式化。純字串產生，無狀態。 */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function bar(kind, value, max, { label = '', warn = false, showNum = true } = {}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="bar ${kind}${warn ? ' warn' : ''}"><div class="fill" style="width:${pct.toFixed(1)}%"></div><div class="lbl"><span>${esc(label)}</span>${showNum ? `<span>${Math.round(value)} / ${Math.round(max)}</span>` : ''}</div></div>`;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`;
}
export function fmtClock(hour) { return `${String(hour).padStart(2, '0')}:00`; }
export function pct(v) { return `${Math.round(v * 100)}%`; }
export function fmtDate(ts) { if (!ts) return '—'; const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

/** camelCase → kebab-case（HTML 屬性不分大小寫；dataset 會把 data-area-id 還原成 areaId） */
export const kebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
export const dataAttrs = (params = {}) => Object.entries(params).map(([k, v]) => `data-${kebab(k)}="${esc(v)}"`).join(' ');

/** data-action 按鈕 */
export function btn(label, action, params = {}, cls = '') {
  const attrs = dataAttrs(params);
  return `<button class="${cls}" data-action="${esc(action)}" ${attrs}>${label}</button>`;
}
export function intentBtn(label, intent, params = {}, cls = 'b-sm', disabled = false) {
  const attrs = dataAttrs(params);
  return `<button class="${cls}" data-action="intent" data-intent="${esc(intent)}" ${attrs} ${disabled ? 'disabled' : ''}>${label}</button>`;
}

/** 物品卡。actions: [{label, intent, params, cls}] */
export function itemCard(app, inst, { actions = [], showQty = true, container = null, extra = '' } = {}) {
  const d = app.game.systems.item.describe(inst);
  const q = d.quality || 'common';
  const qLabel = app.game.systems.item.qualityLabel(q);
  const w = (d.weight || 0) * inst.qty;
  return `<div class="item q-${q}" data-uid="${esc(inst.uid)}">
    <div class="hd"><span class="ic">${d.icon}</span><div><div class="nm q-${q}">${esc(d.name)}${showQty && inst.qty > 1 ? ` <span class="dim">×${inst.qty}</span>` : ''}</div><div class="meta">${qLabel} · ${w.toFixed(1)}kg</div></div></div>
    ${d.lines.length ? `<div class="lines">${d.lines.map(esc).join('<br>')}</div>` : `<div class="lines dim">${esc(d.desc || '')}</div>`}
    ${extra}
    <div class="acts">${actions.map((a) => intentBtn(a.label, a.intent, { uid: inst.uid, ...(container ? { container } : {}), ...(a.params || {}) }, a.cls || 'b-xs', a.disabled)).join('')}</div>
  </div>`;
}

export const REASON_TEXT = {
  notFound: '找不到物品', unknownItem: '未知物品', notUsable: '這個物品不能使用', notEquipment: '不是裝備', empty: '空的',
  overweight: '負重不足，放不下', notHome: '必須在避難所', notExploring: '目前不在探索中', inCombat: '戰鬥中不能這樣做', notInCombat: '不在戰鬥中',
  dead: '你已經死了', gameOver: '遊戲已結束', badSlot: '無效的存檔槽', noGame: '沒有進行中的遊戲', writeFailed: '寫入失敗', verifyFailed: '存檔驗證失敗',
  parse: '存檔格式錯誤', shape: '存檔內容不完整', version: '存檔版本不支援', migration: '存檔升級失敗', notImplemented: '此功能尚未開放',
  noPile: '這裡沒有戰利品', unknownIntent: '未知操作', error: '發生錯誤', failed: '操作失敗', locked: '尚未解鎖', cooldown: '冷卻中',
  blueprint: '尚未學會圖紙', station: '工作台等級不足', materials: '材料不足', condition: '條件不足', level: '等級不足', maxLevel: '已達最高等級',
  noTarget: '沒有目標', alreadyLearned: '已學過這張圖紙', notBlueprint: '不是圖紙', notDiscovered: '尚未發現此圖紙', research: '研究點不足',
  busy: '正在進行其他動作', raid: '怪物襲擊中，不能離開避難所', cannotFleeRaid: '保衛避難所時不能逃跑', fullHp: '已經是滿血', maxDepth: '已是最深層', alreadyReturning: '已在返回途中', done: '已完成', noAction: '沒有進行中的動作', expired: '事件已結束', noEvent: '沒有待處理的事件', badChoice: '無效的選項', noAmmo: '沒有彈藥', fleeFailed: '逃跑失敗！', notChest: '不是寶箱', unknownSetting: '未知設定',
};
export const reasonText = (r) => REASON_TEXT[r] || r || '操作失敗';
