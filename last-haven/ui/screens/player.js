import { esc, intentBtn, pct } from '../components.js';

const SLOT_LABEL = { weapon: '主武器', head: '頭部防具', body: '身體防具', legs: '腿部防具', accessory: '特殊裝備' };

export function render(app) {
  const g = app.game, st = g.state, p = st.player;
  const s = g.systems.player.getStats();
  const prog = g.systems.progression.progress();
  const inv = g.systems.inventory;
  const rows = [
    ['姓名', esc(p.name)], ['等級', `Lv.${p.level}`], ['經驗值', `${prog.xp} / ${prog.next}`],
    ['HP', `${Math.round(p.hp)} / ${s.maxHp}`], ['攻擊力', s.attack], ['防禦力', s.defense],
    ['飢餓', `${Math.round(p.hunger)} / 100`], ['口渴', `${Math.round(p.thirst)} / 100`],
    ['暴擊率', pct(s.critChance)], ['暴擊傷害', pct(s.critDamage)], ['攻擊速度', `${s.attackSpeed.toFixed(2)} 次/秒`], ['移動速度', pct(s.moveSpeed)],
    ['命中 / 閃避', `${pct(s.accuracy)} / ${pct(s.dodge)}`], ['負重', `${inv.weight('inventory').toFixed(1)} / ${s.carry}`],
    ['抗性', Object.entries(s.resist || {}).map(([k, v]) => `${g.registry.status(k)?.name || k} ${pct(v)}`).join('、') || '—'],
    ['金錢 / 研究點', `💰 ${p.coins} / 🔬 ${st.blueprints.researchPoints}`],
  ];
  const mods = ['hungerRate', 'thirstRate', 'playerAttack', 'playerDefense', 'exploreSpeed'].map((k) => ({ k, e: g.modifiers.explain(k) })).filter((x) => x.e.length);
  return `
    <div class="grid2">
      <div class="card"><h2>玩家面板</h2><table class="statTable">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
        ${mods.length ? `<div class="small dim" style="margin-top:8px">目前修正：${mods.map((m) => `${m.k} ${m.e.map((e) => `${e.label}${e.mult !== 1 ? ' ×' + e.mult.toFixed(2) : ''}${e.add ? ' +' + e.add : ''}`).join('、')}`).join('；')}</div>` : ''}
      </div>
      <div class="card"><h2>裝備</h2>
        ${g.systems.equipment.all().map(({ slot, inst }) => {
          if (!inst) return `<div class="slot"><span class="ic">▫️</span><div><div class="nm dim">${SLOT_LABEL[slot]}</div><div class="meta">（空）</div></div></div>`;
          const d = g.systems.item.describe(inst);
          return `<div class="slot"><span class="ic">${d.icon}</span><div><div class="nm q-${d.quality}">${esc(d.name)} <span class="tiny dim">${SLOT_LABEL[slot]}</span></div><div class="meta">${d.lines.map(esc).join(' · ')}</div></div><span class="sp">${intentBtn('卸下', 'unequip', { slot }, 'b-xs')}</span></div>`;
        }).join('')}
        <div class="small dim" style="margin-top:6px">在背包／倉庫中選擇裝備即可穿上。</div>
      </div>
    </div>
    <div class="card"><h2>統計</h2><div class="row small">
      <span class="tag">擊殺 ${st.stats.kills}</span><span class="tag">菁英 ${st.stats.eliteKills}</span><span class="tag">Boss ${st.stats.bossKills}</span>
      <span class="tag">開箱 ${st.stats.chestsOpened}</span><span class="tag">採集 ${st.stats.itemsGathered}</span><span class="tag">學習圖紙 ${st.stats.blueprintsLearned}</span>
      <span class="tag">撐過襲擊 ${st.stats.raidsSurvived}</span><span class="tag">撐過天災 ${st.stats.disastersSurvived}</span><span class="tag">製作 ${st.stats.crafted}</span>
    </div></div>`;
}
export function onAction() { return false; }
