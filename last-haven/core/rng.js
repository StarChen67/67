/**
 * mulberry32 seeded PRNG。所有遊戲內隨機都必須走這裡，讓測試可重現、存檔可續用同一序列。
 * 狀態只有一個 32-bit 整數，直接存進 state.rng.<stream>。
 */
export class RNG {
  constructor(seed = 1) {
    this.s = (Number(seed) >>> 0) || 1;
  }
  /** [0, 1) */
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** 整數，含兩端 */
  int(min, max) {
    min = Math.ceil(min); max = Math.floor(max);
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }
  /** 浮點 [min, max) */
  range(min, max) { return min + this.next() * (max - min); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  getState() { return this.s; }
  setState(s) { this.s = (Number(s) >>> 0) || 1; }
}

export const RNG_STREAMS = Object.freeze(['world', 'combat', 'loot', 'explore', 'craft']);

/**
 * 多條獨立分流：UI 操作時機（例如按攻擊的快慢）不會擾動掉落擲骰。
 * 狀態以 { world, combat, loot, explore, craft } 存在 state.rng；每次存檔前 sync()。
 */
export class RNGSet {
  constructor(seed = 1) {
    for (const name of RNG_STREAMS) this[name] = new RNG(0);
    this.reseed(seed);
  }
  reseed(seed) {
    let s = (Number(seed) >>> 0) || 1;
    for (const name of RNG_STREAMS) {
      s = (Math.imul(s ^ 0x9e3779b9, 0x85ebca6b) + 0x1234567) >>> 0;
      this[name].setState(s || 1);
    }
  }
  getState() {
    const o = {};
    for (const name of RNG_STREAMS) o[name] = this[name].getState();
    return o;
  }
  setState(o) {
    if (!o) return;
    for (const name of RNG_STREAMS) if (o[name] != null) this[name].setState(o[name]);
  }
}

/** 由字串產生 seed（FNV-1a） */
export function seedFromString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
