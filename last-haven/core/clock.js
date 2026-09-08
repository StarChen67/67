import { EV } from './events-catalog.js';

/**
 * 世界時間。狀態存在 state.clock = { time, lastHour, lastDay }（last* 只為邊緣觸發事件用）。
 * time 以秒累計，day 從 1 起算，hour 0~23，皆為 getter。
 */
export class Clock {
  constructor(ctx) { this.ctx = ctx; }
  get dayLength() { return this.ctx.registry.balance.time.dayLength; }
  get time() { return this.ctx.state.clock.time; }
  get day() { return Math.floor(this.time / this.dayLength) + 1; }
  /** 一天內的進度 0~1 */
  get dayProgress() { return (this.time % this.dayLength) / this.dayLength; }
  get hour() { return Math.floor(this.dayProgress * 24); }
  get isNight() { const h = this.hour; return h >= 20 || h < 6; }
  /** 天數（可為小數），供排程用 */
  get days() { return this.time / this.dayLength; }
  dayToTime(day) { return (day - 1) * this.dayLength; }
  hoursToSec(h) { return (h / 24) * this.dayLength; }

  advance(dt) {
    const c = this.ctx.state.clock;
    c.time = Math.round((c.time + dt) * 10000) / 10000; // 避免 0.1 累加的浮點漂移
    const day = this.day, hour = this.hour;
    if (hour !== c.lastHour) {
      c.lastHour = hour;
      this.ctx.bus.emit(EV.CLOCK_HOUR, { day, hour });
    }
    if (day !== c.lastDay) {
      c.lastDay = day;
      this.ctx.bus.emit(EV.CLOCK_DAY, { day });
    }
  }
}
