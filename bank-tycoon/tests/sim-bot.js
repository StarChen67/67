/* ============================================================
   tests/sim-bot.js — 平衡用機器人（不是測試）
   用幾種「合理的玩家策略」玩 N 年，印出成長曲線與死因。
   用法：node bank-tycoon/tests/sim-bot.js [days=1800] [seed=7] [strategy]
   策略：balanced（債券為主＋少量股票）｜aggressive（重壓股票）
        ｜turtle（只買公債、保全升滿）｜greedy（高利率搶存款＋狂印鈔）
   全部跑一輪：node bank-tycoon/tests/sim-bot.js all [days]
   加上 BOOKS=1 環境變數會印出終身累計收支，用來找虧損來源
   ============================================================ */
'use strict';
const H = require('./harness.js');

const STRATEGIES = {
  /* 穩健：現金留 20% 存款、其餘以固定收益為主，股票不超過總資產 8%（約 0.7 倍股東權益） */
  balanced: { reserveFrac: 0.20, rateMult: 1.02, riskTarget: 30, stockCap: 0.08, stockRisk: 3, bonds: true, print: false, insure: true },
  /* 激進：現金只留 10%，股票到總資產 30%（約 3 倍股東權益），且買高風險股 */
  aggressive: { reserveFrac: 0.10, rateMult: 1.15, riskTarget: 55, stockCap: 0.30, stockRisk: 5, bonds: true, print: false, insure: false },
  /* 龜派：現金留 35%，完全不碰股票，保全優先 */
  turtle: { reserveFrac: 0.28, rateMult: 0.95, riskTarget: 12, stockCap: 0, stockRisk: 1, bonds: true, print: false, insure: true },
  /* 貪婪：高利率搶存款、股票中等、一有印鈔機就狂印 */
  greedy: { reserveFrac: 0.15, rateMult: 1.7, riskTarget: 45, stockCap: 0.40, stockRisk: 4, bonds: true, print: true, insure: true },
};

function play(days, seed, name, opts = {}) {
  const S = STRATEGIES[name];
  const { game, BT } = H.newGame({ seed, name: '機器人銀行' });
  const U = BT.util;
  const log = [];
  let robCount = 0;
  let lastBuildDay = -99;
  let robLoss = 0;
  game.bus.on('robbery:done', ({ report }) => { robCount += 1; robLoss += report.loot; });
  const acc = {}; const accI = {};
  const book = () => { const bk = game.state.reports.yesterday; for (const [k, v] of Object.entries(bk.expense)) if (v) acc[k] = (acc[k] || 0) + v; for (const [k, v] of Object.entries(bk.income)) if (v) accI[k] = (accI[k] || 0) + v; };

  for (let d = 1; d <= days && !game.state.gameOver; d++) {
    game.sim.advanceDay(); book();
    if (game.state.gameOver) break;
    let t = game.totals();

    /* --- 利率：貼著客戶期望走 --- */
    game.deposits.setRate(game.economy.demandedRate() * S.rateMult);

    /* --- 保全：每 15 天最多添購一項，單筆不超過淨資產的 12%。
           保全支出是直接從股東權益扣的，天天買會把銀行買垮。 --- */
    const exposed = game.robbery.exposedCash();
    const secBudget = t.net * 0.12;
    const canSpend = d - lastBuildDay >= 15;
    if (canSpend && exposed > t.net * 0.3 && game.security.canBuild('vault').ok
        && game.security.buildCost('vault') < secBudget) {
      game.security.build('vault'); lastBuildDay = d;
    } else if (canSpend && exposed > t.net * 0.3 && game.security.canBuild('super_vault').ok
        && game.security.buildCost('super_vault') < secBudget) {
      game.security.build('super_vault'); lastBuildDay = d;
    } else if (canSpend && game.robbery.risk() > S.riskTarget) {
      // 保全支出上限用「淨資產」衡量：這筆錢是從股東權益扣的，
      // 用現金衡量會買下比整間銀行還貴的金庫。
      const budget = Math.min(t.cash * 0.4, secBudget);
      const opts2 = game.security.devices()
        .map((def) => ({ def, cost: game.security.buildCost(def.id), chk: game.security.canBuild(def.id) }))
        .filter((o) => o.chk.ok && o.cost <= budget)
        .sort((a, b) => a.cost - b.cost);
      const vault = opts2.filter((o) => o.def.id === 'vault' || o.def.id === 'super_vault').pop();
      const pick = vault || opts2[opts2.length - 1];
      if (pick) { game.security.build(pick.def.id); lastBuildDay = d; }
      else if (game.security.guardsUnlocked() && game.security.guards.count < game.security.maxGuards()
               && t.cash > game.security.hireCost(2) * 30) { game.security.hire(2); lastBuildDay = d; }
    }
    if (game.security.damagedList().length && t.cash > game.security.repairAllCost() * 5) game.security.repairAll();

    /* --- 保險：買得起最好的方案 --- */
    if (S.insure) {
      for (const p of game.insurance.plans().slice().reverse()) {
        if (!game.insurance.available(p.id)) continue;
        if (game.state.insurance.plan === p.id) break;
        if (game.insurance.premiumOf(p.id) < t.cash * 0.002 && game.insurance.canSubscribe(p.id, d).ok) {
          game.insurance.subscribe(p.id, d);
        }
        break;
      }
    }

    /* --- 印鈔 --- */
    if (S.print && game.printer.unlocked()) {
      if (!game.printer.owned()) game.printer.upgrade();
      else {
        game.printer.print(d);
        if (game.printer.canBuy().ok && t.cash > game.printer.upgradeCost() * 4) game.printer.upgrade();
      }
    }

    /* --- 升級銀行 --- */
    if (game.upgrades.canUpgrade().ok) game.upgrades.upgrade();

    /* --- 資產配置 ---
       用「緩衝帶」而不是每天精準對齊目標：
       現金低於下限才變現、高於上限才投入。
       每天都把多餘現金鎖進債券的話，存款一波動就得提前贖回，
       罰則會反覆吃掉利息 —— 這是實測時最大的虧損來源。 */
    t = game.totals();
    const reserve = U.money(t.deposits * S.reserveFrac + game.dailyExpense().total * 60);
    const lower = reserve;
    const upper = U.money(reserve * 1.6 + 20000);

    if (t.cash < lower) {
      const need = lower - t.cash;
      // 先賣股票；還不夠就借短期資金；提前贖回債券是最後手段
      let raised = game.stocks.liquidate(need);
      if (raised < need && t.cash + raised < reserve * 0.6) {
        const room = Math.min(game.treasury.loanRoom(), need - raised);
        if (room >= 10000) { const r = game.treasury.borrow(room); if (r.ok) raised += room; }
      }
      if (raised < need && game.totals().cash < reserve * 0.4) {
        for (const h of game.products.holdings().slice()) {
          if (game.totals().cash >= reserve * 0.7) break;
          game.products.redeemEarly(h.id, d);
        }
      }
    } else if (t.stockValue > t.assets * S.stockCap * 1.25) {
      // 再平衡：股票漲過上限就減碼，把獲利落袋。
      // 不減碼的話，股價一漲部位就自己變重，下一次崩盤全部吐回去。
      game.stocks.liquidate(t.stockValue - t.assets * S.stockCap);
    } else if (t.cash > upper) {
      // 有貸款先還掉，利息比投資報酬還貴
      for (const loan of game.state.treasury.loans.slice()) {
        if (game.totals().cash <= upper) break;
        game.treasury.repay(loan.id, Math.min(loan.principal, game.totals().cash - upper));
      }
      let invest = game.totals().cash - upper;
      const stockRoom = Math.max(0, t.assets * S.stockCap - t.stockValue);
      const toStock = Math.min(invest * 0.5, stockRoom);
      if (toStock > 1000) {
        const pool = game.stocks.available().filter((s) => s.risk <= S.stockRisk);
        if (pool.length) {
          const pick = pool[(d + seed) % pool.length];
          const qty = Math.floor(toStock / game.stocks.price(pick.id));
          if (qty > 0) { game.stocks.buy(pick.id, qty); invest -= qty * game.stocks.price(pick.id); }
        }
      }
      if (S.bonds && invest > 1000) {
        // 只挑「到期日之前不太可能需要動用」的金額，挑買得起的最高殖利率商品
        const prods = game.products.available().filter((p) => p.min <= invest).sort((a, b) => b.yield - a.yield);
        if (prods.length) game.products.buy(prods[0].id, Math.floor(invest), d);
      }
    }

    /* --- 恐慌太高就開記者會 --- */
    if (game.state.bank.panic > 40 && game.customers.canCalm(d).ok) game.customers.calm(d);

    if (d % (opts.every || 180) === 0 || d === days) {
      const tt = game.totals();
      log.push({
        d, lv: game.state.bank.level, cash: tt.cash, assets: tt.assets, net: tt.net,
        dep: tt.deposits, cust: game.customers.count(), credit: Math.round(game.credit.score),
        rating: game.credit.rating().name, risk: Math.round(game.robbery.risk()),
        def: Math.round(game.security.defense()), infl: U.round(game.state.economy.inflation, 1),
        rate: U.fmtPct(game.state.bank.depositRate, 2), lev: (tt.deposits / Math.max(1, tt.net)).toFixed(1),
      });
    }
  }
  book();
  return { game, log, robCount, robLoss, acc, accI, over: game.state.gameOver, final: game.totals() };
}

function money(n) {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a < 100000) return sign + Math.round(a).toLocaleString('en-US');
  if (a < 100000000) return sign + (a / 10000).toFixed(1) + '萬';
  if (a < 1e12) return sign + (a / 1e8).toFixed(2) + '億';
  return sign + (a / 1e12).toFixed(2) + '兆';
}

function runOne(name, days, seed, opts) {
  const r = play(days, seed, name, opts);
  const pad = (s, n) => String(s).padStart(n);
  console.log(`\n=== ${name}  seed=${seed}  ${days} 天 ===`);
  console.log('  天數 等級        現金       總資產       淨資產        存款   客戶  信用 評級 風險  防禦 槓桿  通膨   利率');
  for (const l of r.log) {
    console.log(`  ${pad(l.d, 4)} Lv.${l.lv} ${pad(money(l.cash), 11)} ${pad(money(l.assets), 12)} ${pad(money(l.net), 12)} ${pad(money(l.dep), 11)} ${pad(l.cust, 6)} ${pad(l.credit, 5)} ${pad(l.rating, 4)} ${pad(l.risk, 4)} ${pad(l.def, 6)} ${pad(l.lev, 5)} ${pad(l.infl, 5)} ${pad(l.rate, 6)}`);
  }
  const s = r.game.state.stats;
  console.log(`  搶劫 ${r.robCount} 次｜被搶走 ${money(r.robLoss)}｜防守成功 ${s.defended}｜理賠 ${money(s.insurancePayout)}｜印鈔 ${money(s.printedTotal)}`);
  if (process.env.BOOKS) { console.log('  支出', JSON.stringify(r.acc)); console.log('  收入', JSON.stringify(r.accI)); console.log('  股票已實現', r.game.state.stocks.realized, '未實現', r.game.stocks.totalUnrealized(), '商品已實現', r.game.state.products.realized); }
  console.log(`  結局：${r.over ? '❌ ' + r.over.text : '✅ 存活'}   最終淨資產 ${money(r.final.net)}   最高資產 ${money(s.maxAssets)}`);
  return r;
}

const arg = process.argv[2] || '1800';
if (arg === 'all') {
  const days = +(process.argv[3] || 1800);
  const seeds = [7, 23, 91];
  const table = [];
  for (const name of Object.keys(STRATEGIES)) {
    for (const seed of seeds) {
      const r = runOne(name, days, seed, { every: 600 });
      table.push({ name, seed, net: r.final.net, lv: r.game.state.bank.level, days: r.game.state.day, dead: !!r.over, reason: r.over ? r.over.reason : '' });
    }
  }
  console.log('\n=== 總表 ===');
  for (const row of table) {
    console.log(`  ${row.name.padEnd(11)} seed=${String(row.seed).padStart(3)}  Lv.${row.lv}  第 ${String(row.days).padStart(4)} 天  淨資產 ${money(row.net).padStart(11)}  ${row.dead ? '❌ ' + row.reason : '✅ 存活'}`);
  }
} else {
  runOne(process.argv[4] || 'balanced', +arg || 1800, +(process.argv[3] || 7));
}
