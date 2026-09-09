/* ============================================================
   data/stocks.js — 虛構股票
   欄位：
     sector    產業（事件用這個 key 影響一整個產業）
     tier      解鎖層級：t1 / t2 / fund / intl / global
     base      上市初始價
     drift     年化對數報酬（未扣崩盤）
     vol       每日標準差
     rating    公司評級（顯示用）
     risk      1–5 風險星等
     crashP    每日暴跌機率
     crashRange 暴跌時額外損失的對數報酬
     phaseDrift 選用：特定景氣階段的額外年化漂移（讓避險標的有意義）

   平衡原則：風險越高，「扣掉崩盤損耗後」的期望報酬也越高。
     實際年化 = drift − crashP × 平均崩幅 × 365
     risk1 ≈ 7%   risk2 ≈ 10%   risk3 ≈ 14%   risk4 ≈ 19%   risk5 ≈ 25%
   波動則從年化 13%（risk1）到 46%（risk5），所以高風險股長期贏面較大，
   但任何一年都可能腰斬 —— 部位大小才是玩家真正要做的決定。
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  const SECTORS = {
    tech: { id: 'tech', name: '科技', icon: '💻', color: '#5aa9ff' },
    energy: { id: 'energy', name: '能源', icon: '⚡', color: '#ffc84a' },
    food: { id: 'food', name: '食品', icon: '🍜', color: '#7ce0b0' },
    health: { id: 'health', name: '醫療', icon: '💊', color: '#ff8fb1' },
    build: { id: 'build', name: '建設', icon: '🏗️', color: '#d4a373' },
    finance: { id: 'finance', name: '金融', icon: '🏦', color: '#c9a6ff' },
    index: { id: 'index', name: '指數', icon: '🌐', color: '#8be9d6' },
  };
  BT.SECTORS = SECTORS;

  BT.define('stocks', [
    /* ---------- tier 1（Lv.1 起） ---------- */
    { id: 'nova',    code: 'NOVA', name: '新星科技',   sector: 'tech',    tier: 't1', base: 42,  drift: 0.30, vol: 0.017, rating: 'BB',  risk: 4, crashP: 0.0012, crashRange: [0.12, 0.38], desc: '做手機晶片的新創，故事很好聽。' },
    { id: 'terra',   code: 'TERA', name: '大地能源',   sector: 'energy',  tier: 't1', base: 88,  drift: 0.19, vol: 0.012, rating: 'A',   risk: 3, crashP: 0.0007, crashRange: [0.10, 0.28], desc: '老牌發電與油氣公司，配息穩定。' },
    { id: 'harvest', code: 'HRVT', name: '豐年食品',   sector: 'food',    tier: 't1', base: 31,  drift: 0.08, vol: 0.007, rating: 'AAA', risk: 1, crashP: 0.0002, crashRange: [0.05, 0.15], desc: '不管景氣好壞，大家都要吃飯。' },
    { id: 'medix',   code: 'MDX',  name: '醫昇生技',   sector: 'health',  tier: 't1', base: 65,  drift: 0.19, vol: 0.012, rating: 'BBB', risk: 3, crashP: 0.0007, crashRange: [0.10, 0.28], desc: '新藥過了二期，三期還沒。' },
    { id: 'stone',   code: 'STON', name: '磐石建設',   sector: 'build',   tier: 't1', base: 54,  drift: 0.12, vol: 0.009, rating: 'A',   risk: 2, crashP: 0.0004, crashRange: [0.08, 0.22], desc: '手上有一堆重劃區的土地。' },
    { id: 'unity',   code: 'UNTY', name: '聯合金控',   sector: 'finance', tier: 't1', base: 25,  drift: 0.12, vol: 0.009, rating: 'AA',  risk: 2, crashP: 0.0004, crashRange: [0.08, 0.22], desc: '你的同業，也是你的鏡子。' },

    /* ---------- tier 2（Lv.3 解鎖） ---------- */
    { id: 'quantum', code: 'QNTM', name: '量子運算',   sector: 'tech',    tier: 't2', base: 210, drift: 0.49, vol: 0.024, rating: 'B',   risk: 5, crashP: 0.0020, crashRange: [0.15, 0.50], desc: '沒有人看得懂財報，但股價很會漲。' },
    { id: 'solaris', code: 'SOLR', name: '曜日太陽能', sector: 'energy',  tier: 't2', base: 130, drift: 0.30, vol: 0.017, rating: 'BB',  risk: 4, crashP: 0.0012, crashRange: [0.12, 0.38], desc: '補助政策一改，股價就翻臉。' },
    { id: 'oceanic', code: 'OCEA', name: '遠洋水產',   sector: 'food',    tier: 't2', base: 47,  drift: 0.12, vol: 0.009, rating: 'A',   risk: 2, crashP: 0.0004, crashRange: [0.08, 0.22], desc: '船隊很大，海很大，風險也不小。' },
    { id: 'genecore',code: 'GENE', name: '基因核心',   sector: 'health',  tier: 't2', base: 305, drift: 0.49, vol: 0.024, rating: 'CCC', risk: 5, crashP: 0.0020, crashRange: [0.15, 0.50], desc: '成功會改寫醫學史，失敗會歸零。' },
    { id: 'skyline', code: 'SKYL', name: '天際開發',   sector: 'build',   tier: 't2', base: 168, drift: 0.19, vol: 0.012, rating: 'BBB', risk: 3, crashP: 0.0007, crashRange: [0.10, 0.28], desc: '正在蓋全國最高的大樓。' },
    { id: 'summit',  code: 'SMMT', name: '峰頂資產',   sector: 'finance', tier: 't2', base: 96,  drift: 0.19, vol: 0.012, rating: 'BBB', risk: 3, crashP: 0.0007, crashRange: [0.10, 0.28], desc: '槓桿開很大的資產管理公司。' },

    /* ---------- 基金 / ETF（Lv.6 解鎖） ---------- */
    { id: 'bluechip',code: 'BLUE', name: '藍籌五十基金', sector: 'index', tier: 'fund', base: 520,  drift: 0.09, vol: 0.006, rating: 'AAA', risk: 1, crashP: 0.0002, crashRange: [0.05, 0.15], desc: '一次買下市值最大的五十家公司。' },
    { id: 'growthf', code: 'GROW', name: '成長動能基金', sector: 'index', tier: 'fund', base: 380,  drift: 0.19, vol: 0.011, rating: 'BBB', risk: 3, crashP: 0.0007, crashRange: [0.10, 0.28], desc: '追高殺低的專業版本。' },
    { id: 'hedge',   code: 'HEDG', name: '對沖策略基金', sector: 'index', tier: 'fund', base: 1250, drift: 0.14, vol: 0.007, rating: 'AA',  risk: 2, crashP: 0.0003, crashRange: [0.06, 0.18], phaseDrift: { crisis: 0.25 }, desc: '收 2% 管理費與 20% 績效費，還是有人搶著買。' },

    /* ---------- 國際（Lv.7 解鎖） ---------- */
    { id: 'meridian',code: 'MERI', name: '子午線集團', sector: 'finance', tier: 'intl', base: 2400, drift: 0.19, vol: 0.012, rating: 'A',   risk: 3, crashP: 0.0007, crashRange: [0.10, 0.28], desc: '跨七十國的金融巨獸。' },
    { id: 'orbital', code: 'ORBT', name: '軌道工業',   sector: 'tech',    tier: 'intl', base: 3100, drift: 0.30, vol: 0.017, rating: 'BB',  risk: 4, crashP: 0.0012, crashRange: [0.12, 0.38], desc: '在近地軌道蓋工廠。' },
    { id: 'petrogl', code: 'PTGL', name: '環球石油',   sector: 'energy',  tier: 'intl', base: 1780, drift: 0.12, vol: 0.009, rating: 'AA',  risk: 2, crashP: 0.0004, crashRange: [0.08, 0.22], desc: '產油國的合資公司。' },
    { id: 'panacea', code: 'PANA', name: '萬靈製藥',   sector: 'health',  tier: 'intl', base: 2650, drift: 0.30, vol: 0.017, rating: 'BBB', risk: 4, crashP: 0.0012, crashRange: [0.12, 0.38], desc: '專利懸崖就在明年。' },

    /* ---------- 全球金融市場（Lv.8 解鎖） ---------- */
    { id: 'worldx', code: 'WRLD', name: '全球市場指數', sector: 'index', tier: 'global', base: 12000, drift: 0.10, vol: 0.005, rating: 'AAA', risk: 1, crashP: 0.0002, crashRange: [0.05, 0.15], desc: '整個世界的平均值。' },
    { id: 'volatx', code: 'VOLX', name: '波動率指數',   sector: 'index', tier: 'global', base: 8500,  drift: -0.20, vol: 0.040, rating: 'CCC', risk: 5, crashP: 0.0008, crashRange: [0.15, 0.40], phaseDrift: { crisis: 3.2, recession: 0.9 }, desc: '平靜時慢慢流血，別人恐慌時它上天。危機來臨前買進的人才笑得出來。' },
    { id: 'goldx',  code: 'GOLD', name: '黃金現貨',     sector: 'index', tier: 'global', base: 9400,  drift: 0.07, vol: 0.007, rating: 'AAA', risk: 1, crashP: 0.0002, crashRange: [0.05, 0.15], phaseDrift: { crisis: 0.45, recession: 0.18 }, desc: '危機時大家還是往這裡跑。' },
  ]);

  /* tier → 需要的功能旗標。upgrades.unlocked() 查詢。 */
  BT.STOCK_TIER_FEATURE = { t1: 'stocks_t1', t2: 'stocks_t2', fund: 'stocks_fund', intl: 'stocks_intl', global: 'stocks_global' };
})(typeof window !== 'undefined' ? window : globalThis);
