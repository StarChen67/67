/**
 * 狀態效果（規格二：狀態系統模組化）。
 * tick 只放 ContinuousEffect（perSec）；modifiers 為 { key: {mult?, add?} }；perStack 為 true 時依層數倍乘。
 * defaultDuration: null = 由擁有者管理（Survival 的 starving/dehydrated）。
 */
export const STATUS_EFFECTS = [
  { id: 'starving', name: '飢餓虛弱', icon: '🍽️', kind: 'debuff', maxStacks: 1, defaultDuration: null, desc: '飢餓超過 75：攻擊與防禦 -20%',
    modifiers: { playerAttack: { mult: 0.8 }, playerDefense: { mult: 0.8 } } },
  { id: 'dehydrated', name: '脫水', icon: '💧', kind: 'debuff', maxStacks: 1, defaultDuration: null, desc: '口渴超過 75：探索速度與攻速下降',
    modifiers: { exploreSpeed: { mult: 0.8 }, attackSpeed: { mult: 0.85 } } },
  { id: 'poison', name: '中毒', icon: '☠️', kind: 'debuff', maxStacks: 3, defaultDuration: 20, perStack: true, desc: '每秒受到毒素傷害（可疊 3 層）',
    tick: [{ type: 'damage', perSec: 1 }] },
  { id: 'bleeding', name: '流血', icon: '🩸', kind: 'debuff', maxStacks: 3, defaultDuration: 15, perStack: true, desc: '每秒流失生命（繃帶可止血）',
    tick: [{ type: 'damage', perSec: 1.5 }] },
  { id: 'infection', name: '感染', icon: '🦠', kind: 'debuff', maxStacks: 1, defaultDuration: 120, desc: '持續扣血、回復減半、最大生命 -10%（抗生素可治）',
    tick: [{ type: 'damage', perSec: 0.3 }], modifiers: { healRate: { mult: 0.5 }, playerMaxHp: { mult: 0.9 } } },
  { id: 'radiation', name: '輻射', icon: '☢️', kind: 'debuff', maxStacks: 5, defaultDuration: 90, perStack: true, desc: '每層每秒扣血並降低最大生命（抗輻射藥可治）',
    tick: [{ type: 'damage', perSec: 0.4 }], modifiers: { playerMaxHp: { add: -5 } } },
  { id: 'sick', name: '腹瀉', icon: '🤢', kind: 'debuff', maxStacks: 1, defaultDuration: 60, desc: '飢餓與口渴上升更快',
    tick: [{ type: 'thirst', perSec: 0.15 }, { type: 'hunger', perSec: 0.1 }] },
  { id: 'cold', name: '失溫', icon: '🥶', kind: 'debuff', maxStacks: 1, defaultDuration: 30, desc: '飢餓上升加快、攻速下降',
    modifiers: { hungerRate: { mult: 1.3 }, attackSpeed: { mult: 0.9 } } },
  { id: 'heat', name: '中暑', icon: '🥵', kind: 'debuff', maxStacks: 1, defaultDuration: 30, desc: '口渴上升加快',
    modifiers: { thirstRate: { mult: 1.4 } } },
  { id: 'fatigue', name: '疲勞', icon: '😩', kind: 'debuff', maxStacks: 1, defaultDuration: 60, desc: '攻擊與探索速度下降',
    modifiers: { playerAttack: { mult: 0.9 }, exploreSpeed: { mult: 0.85 } } },
  { id: 'energized', name: '精力充沛', icon: '⚡', kind: 'buff', maxStacks: 1, defaultDuration: 120, desc: '探索速度 +20%、攻速 +10%',
    modifiers: { exploreSpeed: { mult: 1.2 }, attackSpeed: { mult: 1.1 } } },
  { id: 'well_fed', name: '飽足', icon: '😋', kind: 'buff', maxStacks: 1, defaultDuration: 180, desc: '飢餓上升 -30%、回復 +50%',
    modifiers: { hungerRate: { mult: 0.7 }, healRate: { mult: 1.5 } } },
  { id: 'stimmed', name: '興奮', icon: '💉', kind: 'buff', maxStacks: 1, defaultDuration: 60, desc: '攻擊 +20%、暴擊 +10%，結束後疲勞',
    modifiers: { playerAttack: { mult: 1.2 }, critChance: { add: 0.1 } }, onExpire: [{ type: 'status', id: 'fatigue', duration: 60 }] },
  { id: 'regen', name: '再生', icon: '💚', kind: 'buff', maxStacks: 1, defaultDuration: 30, desc: '每秒回復 1 生命',
    tick: [{ type: 'heal', perSec: 1 }] },
  { id: 'stunned', name: '暈眩', icon: '💫', kind: 'debuff', maxStacks: 1, defaultDuration: 2, desc: '無法攻擊',
    modifiers: { attackSpeed: { mult: 0.01 } } },
];
