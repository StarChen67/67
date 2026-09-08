/** WebAudio 程序合成 placeholder 音效。沒有素材時用波形代替。 */
const SOUNDS = {
  hit: { f: 220, t: 'square', d: 0.08, g: 0.15 },
  crit: { f: 330, t: 'square', d: 0.14, g: 0.2, slide: 660 },
  hurt: { f: 120, t: 'sawtooth', d: 0.15, g: 0.18, slide: 60 },
  kill: { f: 440, t: 'triangle', d: 0.25, g: 0.2, slide: 110 },
  levelup: { f: 523, t: 'sine', d: 0.5, g: 0.2, slide: 1046 },
  chest: { f: 660, t: 'triangle', d: 0.3, g: 0.18, slide: 990 },
  blueprint: { f: 784, t: 'sine', d: 0.35, g: 0.18, slide: 1175 },
  learn: { f: 880, t: 'sine', d: 0.4, g: 0.18, slide: 1320 },
  craft: { f: 392, t: 'triangle', d: 0.2, g: 0.15, slide: 587 },
  upgrade: { f: 330, t: 'triangle', d: 0.5, g: 0.2, slide: 660 },
  build: { f: 260, t: 'square', d: 0.2, g: 0.12, slide: 390 },
  alarm: { f: 700, t: 'square', d: 0.6, g: 0.15, slide: 500 },
  disaster: { f: 90, t: 'sawtooth', d: 0.8, g: 0.2, slide: 40 },
  gameover: { f: 220, t: 'sawtooth', d: 1.2, g: 0.2, slide: 55 },
  use: { f: 500, t: 'sine', d: 0.1, g: 0.1, slide: 700 },
  warn: { f: 600, t: 'square', d: 0.12, g: 0.1 },
};

export class AudioPlayer {
  constructor(isEnabled = () => true) {
    this.isEnabled = isEnabled;
    this.ctx = null;
  }
  ensure() {
    if (this.ctx) return this.ctx;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
    return this.ctx;
  }
  play(name) {
    if (!this.isEnabled()) return;
    const s = SOUNDS[name];
    const ac = this.ensure();
    if (!s || !ac) return;
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = s.t; o.frequency.setValueAtTime(s.f, ac.currentTime);
    if (s.slide) o.frequency.exponentialRampToValueAtTime(s.slide, ac.currentTime + s.d);
    g.gain.setValueAtTime(s.g, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + s.d);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + s.d + 0.02);
  }
}
