/* ============================================================
   星痕御獸錄 II —— UI 層(所有畫面 + 戰鬥介面)
   ============================================================ */
"use strict";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const rnd=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const chance=p=>Math.random()<p;
const pick=a=>a[Math.floor(Math.random()*a.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const tpChip=t=>`<span class="tp ${t}">${TYPE[t]}</span>`;
const tpChips=ts=>ts.map(tpChip).join('');
const hpColor=r=>r>.5?'#4ecb71':r>.2?'#ffb03a':'#ff5d6c';
const SPEEDS={1:'普通',0.55:'快',0.25:'極速'};

/* ---------------- toast / dialog ---------------- */
function toast(txt,ms,cls){
  const d=document.createElement('div');
  if(cls)d.className=cls;
  d.innerHTML=txt;$('#toast').appendChild(d);
  setTimeout(()=>{d.style.transition='.3s';d.style.opacity=0;setTimeout(()=>d.remove(),300);},ms||1900);
}
let DLGSTACK=[];
function dialog(html,opts){
  return new Promise(res=>{
    const ov=document.createElement('div');
    ov.className='ov';
    ov.innerHTML='<div class="dlg'+(opts&&opts.wide?' wide':'')+'">'+html+'</div>';
    document.body.appendChild(ov);
    const entry={ov,res};
    DLGSTACK.push(entry);
    entry.close=v=>{
      DLGSTACK=DLGSTACK.filter(x=>x!==entry);
      ov.remove();res(v);
    };
    if(opts&&opts.dismiss)ov.addEventListener('click',e=>{if(e.target===ov)entry.close(null);});
    (opts&&opts.after||function(){})(ov,entry.close);
  });
}
function closeDlg(v){const e=DLGSTACK[DLGSTACK.length-1];if(e)e.close(v);}
function confirmBox(title,body,okTxt,danger){
  return dialog(`<h2>${title}</h2><div class="muted">${body||''}</div>
    <div class="btns"><button class="btn ${danger?'dan':'pri'}" data-y>${okTxt||'確定'}</button>
    <button class="btn" data-n>取消</button></div>`,
    {after:(o,cl)=>{o.querySelector('[data-y]').onclick=()=>{AU.sfx('click');cl(1);};
                    o.querySelector('[data-n]').onclick=()=>{AU.sfx('click');cl(0);};}});
}
function promptBox(title,val,ph,maxlen){
  return dialog(`<h2>${title}</h2>
    <input class="txt" id="_pi" maxlength="${maxlen||10}" value="${esc(val||'')}" placeholder="${esc(ph||'')}">
    <div class="btns"><button class="btn pri" data-y>確定</button><button class="btn" data-n>取消</button></div>`,
    {after:(o,cl)=>{
      const i=o.querySelector('#_pi');setTimeout(()=>i.focus(),60);
      const ok=()=>cl(i.value);
      o.querySelector('[data-y]').onclick=ok;
      o.querySelector('[data-n]').onclick=()=>cl(null);
      i.onkeydown=e=>{if(e.key==='Enter')ok();};
    }});
}

/* ---------------- 頁首 / 分頁 ---------------- */
let TAB='explore';
const TABS=[['explore','🗺️','探索'],['team','🐾','隊伍'],['breed','🥚','配種'],['bag','🎒','背包'],
            ['shop','🏪','商店'],['dex','📖','圖鑑'],['pvp','⚔️','對戰'],['more','⚙️','更多']];
function buildShell(){
  $('#nav').innerHTML=TABS.map(t=>
    `<button data-t="${t[0]}" class="${t[0]===TAB?'on':''}">${t[1]}<span>${t[2]}</span></button>`).join('');
  $$('#nav button').forEach(b=>b.onclick=()=>{AU.sfx('tab');TAB=b.dataset.t;renderTab();});
}
function renderHeader(){
  $('#hName').textContent=S.name;
  $('#hGold').textContent=S.money.toLocaleString();
  $('#hBadges').innerHTML=AREAS.map((a,i)=>
    `<span class="bdg${i<S.badges?' on':''}" title="${a.n}"></span>`).join('');
}
function renderAll(){renderHeader();renderTab();saveGame();}
function renderTab(){
  $$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===TAB));
  const m=$('#main');m.scrollTop=0;
  ({explore:vExplore,team:vTeam,breed:vBreed,bag:vBag,shop:vShop,dex:vDex,pvp:vPvp,more:vMore})[TAB](m);
}

/* ============================================================
   探索
   ============================================================ */
function vExplore(m){
  const A=AREAS[S.area];
  const q=activeQuests();
  m.innerHTML=`
  <div class="card">
    <h3>🗺️ 區域 <span class="muted">徽章 ${S.badges}/${AREAS.length}</span></h3>
    <div class="areas">${AREAS.map((a,i)=>{
      const lock=i>=S.unlock;
      return `<div class="area ${i===S.area?'on':''} ${lock?'lock':''}" data-a="${i}">
        <div class="glow" style="background:${a.c}"></div>
        <b>${lock?'🔒 ???':esc(a.n)}</b>
        <div class="lv">${lock?'需先擊敗前一位頭目':'Lv.'+a.lv[0]+'–'+a.lv[1]}</div>
        ${i<S.badges?'<div class="lv" style="color:var(--gold)">🏅 已取得徽章</div>':''}
      </div>`;}).join('')}</div>
  </div>
  <div class="card">
    <h3>📍 ${esc(A.n)}</h3>
    <div class="muted" style="margin-bottom:8px">${esc(A.desc)}</div>
    <div class="row wrap">
      <button class="btn pri" id="bExp">🔍 探索</button>
      <button class="btn" id="bExp10">⏩ 連續 ×10</button>
      <button class="btn gold" id="bBoss">⚔️ 挑戰 ${esc(A.boss.n)}${A.boss.dbl?'(雙打)':''}</button>
      <button class="btn" id="bHeal">🏥 治療所</button>
    </div>
    <div class="muted" style="margin-top:8px">出沒:${A.mon.map(x=>SP[x].n+(isLegend(x)?'✨':'')).join('、')}</div>
    ${A.npc?`<div class="npcs">${A.npc.map(n=>
      `<div class="npc"><b>${esc(n.n)}</b>「${esc(n.t)}」</div>`).join('')}</div>`:''}
  </div>
  <div class="card">
    <h3>📋 任務 <span class="muted">${S.questDone.length}/${QUESTS.length} 完成</span></h3>
    ${q.length?q.map(x=>{
      const p=questProgress(x);
      return `<div class="quest">
        <div class="row"><b>${esc(x.n)}</b><span class="muted" style="margin-left:auto">${p}/${x.goal}</span></div>
        <div class="muted">${esc(x.d)} — 獎勵 💰${x.rw.money}${x.rw.items?' + '+Object.keys(x.rw.items).map(k=>ITEM[k].ic+ITEM[k].n).join(' '):''}</div>
        <div class="bar" style="margin-top:5px"><i style="width:${clamp(p/x.goal*100,0,100)}%;background:var(--acc)"></i></div>
      </div>`;}).join(''):'<div class="muted">全部任務都完成了!</div>'}
  </div>
  <div class="card"><h3>📜 紀錄</h3><div id="feed"></div></div>`;

  $$('.area').forEach(el=>el.onclick=()=>{
    const i=+el.dataset.a;
    if(i>=S.unlock){AU.sfx('error');toast('🔒 尚未解鎖');return;}
    AU.sfx('click');S.area=i;renderAll();
  });
  paintFeed();
  $('#bExp').onclick=()=>explore();
  $('#bExp10').onclick=async()=>{for(let i=0;i<10;i++){if(await explore())break;}};
  $('#bBoss').onclick=()=>bossFight();
  $('#bHeal').onclick=()=>{
    if(!S.party.length)return toast('隊伍是空的');
    healAll();AU.sfx('heal');toast('✨ 全隊已完全回復');feed('在<b>治療所</b>休息,全隊恢復。');renderAll();
  };
}
function paintFeed(){
  const f=$('#feed');
  if(f)f.innerHTML=FEED.map(x=>'<div>'+x+'</div>').join('')||'<div class="muted">還沒有紀錄</div>';
}

/* ============================================================
   隊伍
   ============================================================ */
let SELMON=null;
function eggRow(m,onClick){
  const d=document.createElement('div');
  d.className='mon'+(SELMON===m.u?' sel':'');
  const av=document.createElement('div');av.className='avatar';
  av.style.display='grid';av.style.placeItems='center';av.style.fontSize='26px';av.textContent='🥚';
  d.appendChild(av);
  const mid=document.createElement('div');mid.className='mid';
  mid.innerHTML=`<div class="row"><span class="nm">🥚 神秘的蛋</span>
      <span class="muted" style="margin-left:auto">還需 ${m.hatchLeft} 次探索</span></div>
    <div class="muted" style="margin-top:4px">帶著它去探索吧,孵化前無法得知是誰。</div>`;
  d.appendChild(mid);
  d.onclick=onClick||(()=>{AU.sfx('click');SELMON=SELMON===m.u?null:m.u;renderTab();});
  return d;
}
function eggDetail(m,i,inBox){
  const d=document.createElement('div');
  d.className='card sub';
  d.innerHTML=`<div class="muted">🥚 一顆溫熱的蛋,似乎快要孵化了。還需要 <b>${m.hatchLeft}</b> 次探索。</div>
   <div class="row wrap" style="margin-top:10px"><button class="btn sm dan" data-act="rel">🗑️ 丟棄</button></div>`;
  d.querySelector('[data-act]').onclick=async e=>{
    e.stopPropagation();AU.sfx('click');
    if(!await confirmBox('丟棄這顆蛋?','此操作無法復原。','丟棄',1))return;
    (inBox?S.box:S.party).splice(i,1);SELMON=null;renderAll();
  };
  return d;
}
function monRow(m,onClick){
  if(m.egg)return eggRow(m,onClick);
  const sp=SP[m.sp], r=m.hp/maxHP(m);
  const d=document.createElement('div');
  d.className='mon'+(alive(m)?'':' fnt')+(SELMON===m.u?' sel':'');
  const av=document.createElement('div');av.className='avatar';
  av.appendChild(monCanvas(m.sp,56,{shiny:m.shiny}));
  d.appendChild(av);
  const mid=document.createElement('div');mid.className='mid';
  mid.innerHTML=`<div class="row"><span class="nm">${esc(m.nick||sp.n)}${m.shiny?' ✨':''}</span>
      ${tpChips(sp.t)}
      ${m.st?`<span class="stx ${m.st}">${STN[m.st]}</span>`:''}
      ${m.item?`<span class="hold" title="${esc(ITEM[m.item].n)}">${ITEM[m.item].ic}</span>`:''}
      <span class="muted" style="margin-left:auto">Lv.${m.lv}</span></div>
    <div class="bar" style="margin-top:5px"><i style="width:${r*100}%;background:${hpColor(r)}"></i></div>
    <div class="row" style="justify-content:space-between;margin-top:2px">
      <span class="muted">${m.hp}/${maxHP(m)} · ${AB[m.ab]?AB[m.ab].n:'—'}</span>
      <span class="muted">${m.lv>=60?'MAX':'EXP '+m.xp+'/'+xpNext(m)}</span></div>`;
  d.appendChild(mid);
  d.onclick=onClick||(()=>{AU.sfx('click');SELMON=SELMON===m.u?null:m.u;renderTab();});
  return d;
}
function vTeam(m){
  m.innerHTML=`
   <div class="card"><h3>🐾 出戰隊伍 <span class="muted">${S.party.length}/6</span></h3>
     <div class="grid" id="pty"></div>
     <div class="muted" style="margin-top:8px">點擊御獸展開詳情。第一隻為先發。</div></div>
   <div class="card"><h3>📦 倉庫 <span class="muted">${S.box.length}</span>
     <button class="btn sm" id="sortBox" style="margin-left:auto">依等級排序</button></h3>
     <div class="grid" id="box"></div></div>`;
  const p=$('#pty');
  if(!S.party.length)p.innerHTML='<div class="muted">尚無御獸</div>';
  S.party.forEach((mo,i)=>{p.appendChild(monRow(mo));
    if(SELMON===mo.u)p.appendChild(mo.egg?eggDetail(mo,i,false):detailPanel(mo,i,false));});
  const b=$('#box');
  if(!S.box.length)b.innerHTML='<div class="muted">空空如也</div>';
  S.box.forEach((mo,i)=>{b.appendChild(monRow(mo));
    if(SELMON===mo.u)b.appendChild(mo.egg?eggDetail(mo,i,true):detailPanel(mo,i,true));});
  $('#sortBox').onclick=()=>{S.box.sort((x,y)=>y.lv-x.lv);AU.sfx('click');renderAll();};
}
function detailPanel(m,i,inBox){
  const sp=SP[m.sp], d=document.createElement('div');
  d.className='card sub';
  const nat=NAT[m.nat||0];
  const bars=[['hp','體力',maxHP(m),300],['atk','攻擊',baseStat(m,'atk'),240],
              ['def','防禦',baseStat(m,'def'),240],['spd','速度',baseStat(m,'spd'),240]];
  d.innerHTML=`
   ${bars.map(b=>`<div class="sbar"><span class="muted">${b[1]}</span>
      <span class="b"><i style="width:${clamp(b[2]/b[3]*100,4,100)}%"></i></span>
      <span>${b[2]}</span>
      <span class="muted ev">${b[0]==='hp'?'':''}努${(m.ev&&m.ev[b[0]])||0}·個${m.iv[b[0]]}</span></div>`).join('')}
   <div class="muted" style="margin-top:6px">
     性格 <b>${nat.n}</b>${nat.up?`(${STATKEY[nat.up]}↑ ${STATKEY[nat.dn]}↓)`:'(無修正)'} ·
     特性 <b>${AB[m.ab]?AB[m.ab].n:'—'}</b> ·
     努力值 ${evTotal(m)}/${EV_TOTAL_MAX}</div>
   <div class="muted">${AB[m.ab]?esc(AB[m.ab].d):''}</div>
   <div class="muted" style="margin-top:4px">
     ${sp.evo?`Lv.${sp.evo.lv} 進化為 ${SP[sp.evo.to].n}`:'已是最終型態'} ·
     攜帶 ${m.item?ITEM[m.item].ic+ITEM[m.item].n:'無'}</div>
   <div class="grid two" style="margin-top:8px">
     ${m.mv.map((v,mi)=>{const s=SK[v.id];return `<div class="mv static">
        <div class="t">${tpChip(s.t)} ${s.n}${s.tg==='allfoe'?' <span class="muted">範圍</span>':''}</div>
        <div class="p"><span>威力 ${s.p||'—'}</span><span>PP ${v.pp}/${s.pp}</span>
        <button class="lnk" data-fg="${mi}">遺忘</button></div></div>`;}).join('')}
   </div>
   <div class="row wrap" style="margin-top:10px">
     <button class="btn sm" data-act="nick">✏️ 改名</button>
     <button class="btn sm" data-act="hold">💼 攜帶道具</button>
     ${inBox?'<button class="btn sm pri" data-act="in">⬆️ 加入隊伍</button>'
            :'<button class="btn sm" data-act="out">⬇️ 移到倉庫</button>'}
     ${!inBox&&i>0?'<button class="btn sm" data-act="up">🔼 提前</button>':''}
     <button class="btn sm dan" data-act="rel">🕊️ 放生</button>
   </div>`;

  d.querySelectorAll('[data-fg]').forEach(b=>b.onclick=async e=>{
    e.stopPropagation();
    if(m.mv.length<=1)return toast('至少要保留一個招式');
    const mi=+b.dataset.fg;
    if(await confirmBox('遺忘招式',`確定讓 ${m.nick||sp.n} 忘記 <b>${SK[m.mv[mi].id].n}</b>?`,'遺忘',1)){
      m.mv.splice(mi,1);toast('已遺忘');renderAll();
    }
  });
  d.querySelectorAll('[data-act]').forEach(b=>b.onclick=async e=>{
    e.stopPropagation();AU.sfx('click');
    const a=b.dataset.act;
    if(a==='nick'){
      const v=await promptBox(`為 ${m.nick||sp.n} 命名`,m.nick||'','留白則使用種族名',8);
      if(v!==null){m.nick=v.trim()||null;toast('已更名');}
    }
    else if(a==='hold')await holdDialog(m);
    else if(a==='in'){
      if(S.party.length>=6)return toast('隊伍已滿(6)');
      S.box.splice(i,1);S.party.push(m);
    }
    else if(a==='out'){
      if(S.party.filter(x=>x.u!==m.u).length<1)return toast('至少保留一隻御獸');
      S.party.splice(i,1);S.box.push(m);
    }
    else if(a==='up'){S.party.splice(i,1);S.party.splice(i-1,0,m);}
    else if(a==='rel'){
      if(!await confirmBox(`放生 ${m.nick||sp.n}?`,'此操作無法復原。','放生',1))return;
      if(!inBox){if(S.party.length<=1)return toast('至少保留一隻御獸');S.party.splice(i,1);}
      else S.box.splice(i,1);
      SELMON=null;toast('🕊️ 已回歸野外');
    }
    renderAll();
  });
  return d;
}
async function holdDialog(m){
  const owned=Object.keys(S.bag).filter(k=>S.bag[k]>0&&ITEM[k].k==='hold');
  const html=`<h2>💼 攜帶道具</h2>
    <div class="muted">目前:${m.item?ITEM[m.item].ic+ITEM[m.item].n:'無'}</div>
    <div class="grid" style="margin-top:10px;max-height:44vh;overflow:auto">
      ${m.item?`<button class="mv" data-h="">↩ 取下(放回背包)</button>`:''}
      ${owned.length?owned.map(k=>`<button class="mv" data-h="${k}">
        <div class="t">${ITEM[k].ic} ${ITEM[k].n} <span class="muted" style="margin-left:auto">×${S.bag[k]}</span></div>
        <div class="p">${esc(ITEM[k].d)}</div></button>`).join('')
       :'<div class="muted">背包裡沒有攜帶類道具,可到商店「攜帶」分頁購買。</div>'}
    </div>
    <div class="btns"><button class="btn" data-n>關閉</button></div>`;
  await dialog(html,{after:(o,cl)=>{
    o.querySelectorAll('[data-h]').forEach(b=>b.onclick=()=>{
      const k=b.dataset.h;
      if(m.item){S.bag[m.item]=(S.bag[m.item]||0)+1;}
      if(k){S.bag[k]--;m.item=k;toast(`裝備了 ${ITEM[k].n}`);}
      else{m.item=null;toast('已取下');}
      AU.sfx('click');cl(1);
    });
    o.querySelector('[data-n]').onclick=()=>cl(0);
  }});
  renderAll();
}

/* ============================================================
   配種所
   ============================================================ */
function daycareSlotCard(which){
  const m=S.daycare[which];
  const d=document.createElement('div');
  d.dataset.slot=which;
  if(!m){
    d.className='mon';d.style.justifyContent='center';d.style.opacity='.6';
    d.innerHTML='<div class="mid" style="text-align:center"><div class="nm">➕ 空位</div>'+
      '<div class="muted">點擊選擇一隻御獸</div></div>';
    d.onclick=()=>pickDaycareMon(which);
  }else{
    d.appendChild(monRow(m,()=>{}));
    d.onclick=async()=>{
      if(!await confirmBox(`帶回 ${m.nick||SP[m.sp].n}?`,'配種進度將會重置。','帶回',0))return;
      daycareTakeBack(which);
    };
  }
  return d;
}
async function pickDaycareMon(which){
  const other=S.daycare[which==='a'?'b':'a'];
  const cands=[];
  S.party.forEach((mo,i)=>{if(!mo.egg&&(!other||other.u!==mo.u))cands.push({mo,i,fromParty:true});});
  S.box.forEach((mo,i)=>{if(!mo.egg&&(!other||other.u!==mo.u))cands.push({mo,i,fromParty:false});});
  if(!cands.length)return toast('沒有可配種的御獸');
  const chosen=await dialog(`<h2>🥚 選擇御獸</h2>
    <div class="muted">傳說御獸與蛋無法配種。</div>
    <div class="grid" style="margin-top:10px;max-height:50vh;overflow:auto" id="dl"></div>
    <div class="btns"><button class="btn" data-n>取消</button></div>`,
    {after:(o,cl)=>{
      const dl=o.querySelector('#dl');
      cands.forEach(c=>{
        const r=monRow(c.mo,()=>cl(c));r.classList.remove('sel');dl.appendChild(r);
      });
      o.querySelector('[data-n]').onclick=()=>cl(null);
    }});
  if(!chosen)return;
  daycarePut(which,chosen.mo,chosen.fromParty,chosen.i);
}
function vBreed(m){
  const dc=S.daycare, ok=breedCompatible(dc.a,dc.b);
  const eggs=S.box.filter(x=>x.egg);
  m.innerHTML=`
   <div class="card"><h3>🥚 配種所</h3>
     <div class="muted" style="margin-bottom:8px">把兩隻御獸放在一起,牠們相處久了可能會生下蛋。
     須是同種,或至少共享一種屬性;傳說御獸無法配種。</div>
     <div class="grid two" id="dcSlots"></div>
     ${dc.a&&dc.b?(ok
        ?`<div class="muted" style="margin-top:10px">💞 相處融洽 · 進度 ${dc.steps}/${EGG_LAY_STEPS}</div>
           <div class="bar" style="margin-top:5px"><i style="width:${clamp(dc.steps/EGG_LAY_STEPS*100,0,100)}%;background:var(--acc)"></i></div>`
        :`<div class="muted bad" style="margin-top:10px">💔 屬性不合,無法配種</div>`)
      :''}
   </div>
   <div class="card"><h3>🥚 蛋 <span class="muted">${eggs.length}</span></h3>
     <div class="muted">帶著蛋去探索(🔍 探索 / ⏩ 連續 ×10)就能推進孵化進度。</div>
     <div class="grid" id="eggList" style="margin-top:8px"></div>
   </div>`;
  const slots=$('#dcSlots');
  slots.appendChild(daycareSlotCard('a'));
  slots.appendChild(daycareSlotCard('b'));
  const el=$('#eggList');
  if(!eggs.length)el.innerHTML='<div class="muted">倉庫裡沒有蛋</div>';
  eggs.forEach(e=>el.appendChild(monRow(e)));
}

/* ============================================================
   背包
   ============================================================ */
function vBag(m){
  const groups=[['球類',k=>ITEM[k].k==='ball'],['回復',k=>['heal','cure','revive','ether'].includes(ITEM[k].k)],
    ['養成',k=>['candy','ev','abcap','mint','ivup'].includes(ITEM[k].k)],
    ['攜帶',k=>ITEM[k].k==='hold'],['學習器',k=>ITEM[k].k==='tm']];
  const ks=Object.keys(S.bag).filter(k=>S.bag[k]>0&&ITEM[k]);
  m.innerHTML=`<div class="card"><h3>🎒 背包 <span class="muted">${ks.length} 種</span></h3><div id="bl"></div></div>`;
  const bl=$('#bl');
  if(!ks.length){bl.innerHTML='<div class="muted">空的</div>';return;}
  bl.innerHTML=groups.map(g=>{
    const list=ks.filter(g[1]);
    if(!list.length)return '';
    return `<div class="bgroup"><div class="ghead">${g[0]}</div>${list.map(k=>{
      const it=ITEM[k];
      const usable=['heal','cure','revive','ether','candy','ev','tm','abcap','mint','ivup'].includes(it.k);
      return `<div class="itemrow"><div class="ic">${it.ic}</div>
        <div style="flex:1"><div>${it.n} <span class="muted">×${S.bag[k]}</span></div>
        <div class="muted">${esc(it.d)}</div></div>
        ${usable?`<button class="btn sm" data-u="${k}">使用</button>`:''}</div>`;}).join('')}</div>`;
  }).join('');
  bl.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>pickTargetAndUse(b.dataset.u));
}
async function pickTargetAndUse(key){
  const it=ITEM[key], list=S.party.concat(S.box).filter(m=>!m.egg);
  if(!list.length)return toast('沒有可使用道具的御獸(蛋無法使用道具)');
  const target=await dialog(`<h2>${it.ic} ${it.n}</h2><div class="muted">${esc(it.d)}</div>
    <div class="grid" style="margin-top:10px;max-height:46vh;overflow:auto" id="tl"></div>
    <div class="btns"><button class="btn" data-n>取消</button></div>`,
    {after:(o,cl)=>{
      const tl=o.querySelector('#tl');
      list.forEach(mo=>{
        const r=monRow(mo,()=>cl(mo));
        r.classList.remove('sel');
        tl.appendChild(r);
      });
      o.querySelector('[data-n]').onclick=()=>cl(null);
    }});
  if(!target)return;
  /* 需要額外選擇的道具 */
  let opt;
  if(it.k==='mint'){
    opt=await dialog(`<h2>🌱 選擇性格</h2>
      <div class="muted">目前:<b>${NAT[target.nat||0].n}</b></div>
      <div class="grid" style="margin-top:10px">${NAT.map((n,i)=>
        `<button class="mv" data-n2="${i}"><div class="t">${n.n}</div>
         <div class="p">${n.up?`${STATKEY[n.up]} +10% / ${STATKEY[n.dn]} −10%`:'無能力修正'}</div></button>`).join('')}</div>
      <div class="btns"><button class="btn" data-x>取消</button></div>`,
      {after:(o,cl)=>{
        o.querySelectorAll('[data-n2]').forEach(b=>b.onclick=()=>cl(+b.dataset.n2));
        o.querySelector('[data-x]').onclick=()=>cl(null);
      }});
    if(opt===null)return;
  }else if(it.k==='ivup'){
    opt=await dialog(`<h2>💎 選擇要提升的能力</h2>
      <div class="grid" style="margin-top:10px">${[['hp','體力'],['atk','攻擊'],['def','防禦'],['spd','速度']].map(k=>
        `<button class="mv" data-k2="${k[0]}"><div class="t">${k[1]}</div>
         <div class="p">目前個體值 ${target.iv[k[0]]} → 31</div></button>`).join('')}</div>
      <div class="btns"><button class="btn" data-x>取消</button></div>`,
      {after:(o,cl)=>{
        o.querySelectorAll('[data-k2]').forEach(b=>b.onclick=()=>cl(b.dataset.k2));
        o.querySelector('[data-x]').onclick=()=>cl(null);
      }});
    if(!opt)return;
  }
  const r=useItemOn(key,target,null,opt);
  if(r.ok){S.bag[key]--;AU.sfx(it.k==='candy'?'levelup':it.k==='ev'||it.k==='ivup'?'buff':'heal');}
  else AU.sfx('error');
  toast(r.msg);
  checkQuests();checkAchv();renderAll();
}

/* ============================================================
   商店
   ============================================================ */
let SHOPTAB=0;
function vShop(m){
  m.innerHTML=`<div class="card"><h3>🏪 商店 <span class="muted">💰 ${S.money.toLocaleString()}</span></h3>
    <div class="subtabs">${SHOP_TABS.map((t,i)=>
      `<button class="${i===SHOPTAB?'on':''}" data-st="${i}">${t.n}</button>`).join('')}</div>
    <div id="sl" style="margin-top:8px"></div></div>`;
  $$('[data-st]').forEach(b=>b.onclick=()=>{AU.sfx('tab');SHOPTAB=+b.dataset.st;renderTab();});
  const items=SHOP_TABS[SHOPTAB].items;
  $('#sl').innerHTML=items.map(k=>{const it=ITEM[k];
    return `<div class="itemrow"><div class="ic">${it.ic}</div>
      <div style="flex:1"><div>${it.n} <span class="muted">持有 ${S.bag[k]||0}</span></div>
      <div class="muted">${esc(it.d)}</div></div>
      <div style="text-align:right"><div class="muted">💰${it.price.toLocaleString()}</div>
      <div class="row" style="margin-top:3px;justify-content:flex-end">
        <button class="btn sm" data-b="${k}" data-q="1">×1</button>
        <button class="btn sm" data-b="${k}" data-q="5">×5</button></div></div></div>`;}).join('');
  $('#sl').querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.b,q=+b.dataset.q,cost=ITEM[k].price*q;
    if(S.money<cost){AU.sfx('error');return toast('💰 金幣不足');}
    S.money-=cost;S.bag[k]=(S.bag[k]||0)+q;
    AU.sfx('money');toast(`購買 ${ITEM[k].n} ×${q}`);
    checkAchv();renderAll();
  });
}

/* ============================================================
   圖鑑
   ============================================================ */
function vDex(m){
  const c=dexCount(S);
  m.innerHTML=`<div class="card"><h3>📖 圖鑑
     <span class="muted">捕獲 ${c.c} · 目擊 ${c.s} · 全 ${SPIDS.length}</span></h3>
     <div class="bar" style="margin:4px 0 10px"><i style="width:${c.c/SPIDS.length*100}%;background:var(--acc)"></i></div>
     <div class="dexg" id="dg"></div></div>`;
  const dg=$('#dg');
  SPIDS.forEach(id=>{
    const st=S.dex[id]||{s:0,c:0};
    const el=document.createElement('div');
    el.className='dexc'+(st.s?'':' unk')+(isLegend(id)?' lg':'');
    if(st.s){
      el.appendChild(monCanvas(id,70,{}));
      el.insertAdjacentHTML('beforeend',
        `<div class="n">${st.c?'':'· '}${SP[id].n}</div><div>${tpChips(SP[id].t)}</div>`);
      el.onclick=()=>{AU.sfx('click');showDex(id);};
    }else el.innerHTML='<div class="q">❓</div><div class="n">???</div>';
    dg.appendChild(el);
  });
}
function showDex(id){
  const sp=SP[id];
  dialog(`<h2>${sp.n} ${tpChips(sp.t)}</h2>
    <div id="dxc" class="dxc"></div>
    <div class="muted">種族值 體 ${sp.b.hp} / 攻 ${sp.b.atk} / 防 ${sp.b.def} / 速 ${sp.b.spd}
      <b>(合計 ${sp.b.hp+sp.b.atk+sp.b.def+sp.b.spd})</b></div>
    <div class="muted" style="margin-top:4px">捕獲率 ${sp.rate} · 經驗基數 ${sp.xp} ·
      ${sp.evo?`Lv.${sp.evo.lv} 進化為 ${SP[sp.evo.to].n}`:'最終型態'}</div>
    <div class="muted" style="margin-top:6px">可能特性:${sp.ab.map(a=>`<b>${AB[a].n}</b>`).join('、')}</div>
    <div class="muted" style="margin-top:6px;text-align:left">
      弱點:${weakList(sp.t).map(t=>tpChip(t)).join('')||'無'}<br>
      抵抗:${resistList(sp.t).map(t=>tpChip(t)).join('')||'無'}</div>
    <div class="muted lsx">習得:${sp.ls.map(x=>`Lv${x[0]} ${SK[x[1]].n}`).join('、')}</div>
    <div class="btns"><button class="btn pri" data-n>關閉</button></div>`,
    {after:(o,cl)=>{
      o.querySelector('#dxc').appendChild(monCanvas(id,120,{}));
      o.querySelector('[data-n]').onclick=()=>cl(1);
    },dismiss:1});
}
const weakList=ts=>Object.keys(TYPE).filter(t=>effAll(t,ts)>1);
const resistList=ts=>Object.keys(TYPE).filter(t=>effAll(t,ts)<1);

/* ============================================================
   更多(成就 / 統計 / 設定 / 存檔)
   ============================================================ */
function vMore(m){
  const c=dexCount(S), got=S.achv||[];
  m.innerHTML=`
  <div class="card"><h3>🏆 成就 <span class="muted">${got.length}/${ACHV.length}</span></h3>
    <div class="achg">${ACHV.map(a=>{
      const on=got.includes(a.id);
      return `<div class="ach ${on?'on':''}"><b>${on?'🏆':'🔒'} ${a.n}</b><span>${esc(a.d)}</span></div>`;
    }).join('')}</div></div>
  <div class="card"><h3>📊 統計</h3>
    <div class="stats">
      <div><span>總勝場</span><b>${S.stat.wins}</b></div>
      <div><span>探索次數</span><b>${S.stat.steps}</b></div>
      <div><span>捕獲次數</span><b>${S.stat.caught}</b></div>
      <div><span>進化次數</span><b>${S.stat.evolve}</b></div>
      <div><span>圖鑑捕獲</span><b>${c.c}/${SPIDS.length}</b></div>
      <div><span>效果絕佳</span><b>${S.stat.super}</b></div>
      <div><span>使用招式種類</span><b>${Object.keys(S.stat.mvUsed||{}).length}</b></div>
      <div><span>線上對戰</span><b>${S.stat.pvpWin}勝 / ${S.stat.pvp}場</b></div>
    </div></div>
  <div class="card"><h3>⚙️ 設定</h3>
    <div class="setrow"><span>音效</span>
      <button class="btn sm ${S.opt.sfx?'pri':''}" data-o="sfx">${S.opt.sfx?'開':'關'}</button></div>
    <div class="setrow"><span>背景音樂</span>
      <button class="btn sm ${S.opt.bgm?'pri':''}" data-o="bgm">${S.opt.bgm?'開':'關'}</button></div>
    <div class="setrow"><span>戰鬥速度</span>
      <button class="btn sm" data-o="spd">${SPEEDS[S.opt.speed]||'普通'}</button></div>
    <div class="setrow"><span>色彩主題</span>
      <button class="btn sm" data-o="theme">${S.opt.theme==='light'?'淺色':'深色'}</button></div>
  </div>
  <div class="card"><h3>💾 存檔</h3>
    <div class="muted" style="margin-bottom:8px">目前欄位:<b>${SLOT+1}</b> · 自動儲存</div>
    <div class="row wrap">
      <button class="btn" id="bSlots">📂 切換 / 管理欄位</button>
      <button class="btn" id="bExport">📤 匯出</button>
      <button class="btn" id="bImport">📥 匯入</button>
      <button class="btn dan" id="bReset">🗑️ 刪除本欄位</button>
    </div></div>`;

  $$('[data-o]').forEach(b=>b.onclick=()=>{
    const o=b.dataset.o;
    if(o==='sfx'){S.opt.sfx=!S.opt.sfx;AU.setSfx(S.opt.sfx);}
    else if(o==='bgm'){S.opt.bgm=!S.opt.bgm;AU.setMusic(S.opt.bgm);}
    else if(o==='spd'){const ks=Object.keys(SPEEDS).map(Number);
      S.opt.speed=ks[(ks.indexOf(S.opt.speed)+1)%ks.length];}
    else if(o==='theme'){S.opt.theme=S.opt.theme==='light'?'dark':'light';applyTheme();}
    AU.sfx('click');renderAll();
  });
  $('#bSlots').onclick=slotDialog;
  $('#bExport').onclick=async()=>{
    const code=btoa(unescape(encodeURIComponent(JSON.stringify(S))));
    await dialog(`<h2>📤 匯出存檔</h2><div class="muted">複製下面這串文字保存。</div>
      <textarea class="txt ta" id="ex" readonly>${code}</textarea>
      <div class="btns"><button class="btn pri" data-c>複製</button><button class="btn" data-n>關閉</button></div>`,
      {after:(o,cl)=>{
        const ta=o.querySelector('#ex');
        o.querySelector('[data-c]').onclick=()=>{ta.select();
          try{document.execCommand('copy');toast('已複製');}catch(e){toast('請手動複製');}};
        o.querySelector('[data-n]').onclick=()=>cl(1);
      },wide:1});
  };
  $('#bImport').onclick=async()=>{
    const v=await dialog(`<h2>📥 匯入存檔</h2><div class="muted">貼上匯出的文字。會覆蓋目前欄位。</div>
      <textarea class="txt ta" id="im" placeholder="貼在這裡"></textarea>
      <div class="btns"><button class="btn pri" data-y>匯入</button><button class="btn" data-n>取消</button></div>`,
      {after:(o,cl)=>{o.querySelector('[data-y]').onclick=()=>cl(o.querySelector('#im').value.trim());
                      o.querySelector('[data-n]').onclick=()=>cl(null);},wide:1});
    if(!v)return;
    try{
      const obj=JSON.parse(decodeURIComponent(escape(atob(v))));
      if(!obj.party||!Array.isArray(obj.party))throw new Error('格式錯誤');
      S=migrate(obj);saveGame();AU.sfx('quest');toast('✅ 匯入成功');renderAll();
    }catch(e){AU.sfx('error');toast('❌ 匯入失敗:'+e.message);}
  };
  $('#bReset').onclick=async()=>{
    if(!await confirmBox('刪除本欄位存檔?','此操作無法復原,將回到開場。','刪除',1))return;
    reloadWithout(()=>localStorage.removeItem(slotKey(SLOT)));
  };
}
async function slotDialog(){
  const metas=[0,1,2].map(i=>{
    try{const r=localStorage.getItem(slotKey(i));if(!r)return null;
      const o=JSON.parse(r);
      return {name:o.name,badges:o.badges,dex:dexCount(o).c,lv:Math.max(0,...(o.party||[]).map(m=>m.lv))};
    }catch(e){return null;}
  });
  await dialog(`<h2>📂 存檔欄位</h2>
    <div class="grid" style="margin-top:8px">${metas.map((mt,i)=>
      `<button class="mv ${i===SLOT?'cur':''}" data-s="${i}">
        <div class="t">欄位 ${i+1} ${i===SLOT?'<span class="muted">(使用中)</span>':''}</div>
        <div class="p">${mt?`${esc(mt.name)} · 徽章 ${mt.badges} · 圖鑑 ${mt.dex} · 最高 Lv.${mt.lv}`:'空欄位'}</div>
      </button>`).join('')}</div>
    <div class="btns"><button class="btn" data-n>關閉</button></div>`,
    {after:(o,cl)=>{
      o.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{
        const i=+b.dataset.s;cl(null);
        if(i===SLOT)return;
        saveGame();                       // 存回「目前」欄位,之後才切換
        SKIP_AUTOSAVE=true;                // 避免 beforeunload 把舊資料寫進新欄位
        SLOT=i;localStorage.setItem(LASTSLOT,i);location.reload();
      });
      o.querySelector('[data-n]').onclick=()=>cl(null);
    }});
}
function applyTheme(){
  document.documentElement.setAttribute('data-theme',S.opt.theme||'dark');
}

/* ============================================================
   PvP
   ============================================================ */
let PVPSIZE=1;
function vPvp(m){
  const a=NET.account;
  m.innerHTML=`
  <div class="card"><h3>⚔️ 線上對戰
    <span class="muted">${NET.connected?'🟢 已連線 · '+NET.online+' 人在線':'🔴 未連線'}</span></h3>
    ${a?`<div class="muted">帳號 <b>${esc(a.name)}</b> · 積分 <b>${a.rating}</b> · ${a.wins}勝 ${a.losses}敗</div>`
       :`<div class="muted">需要先啟動 PvP 伺服器,再註冊或登入。</div>`}
    <div class="row wrap" style="margin-top:10px">
      ${!NET.connected?'<button class="btn pri" id="bConn">🔌 連線</button>':''}
      ${NET.connected&&!a?'<button class="btn pri" id="bReg">📝 註冊</button><button class="btn" id="bLog">🔑 登入</button>':''}
      ${a?`<button class="btn pri" id="bQueue">🎯 天梯配對(${PVPSIZE===2?'雙打':'單打'})</button>
           <button class="btn" id="bSize">切換為${PVPSIZE===2?'單打':'雙打'}</button>
           <button class="btn" id="bRoom">🚪 私人房</button>`:''}
      <button class="btn" id="bBoard">🏅 排行榜</button>
    </div>
    ${a?`<div class="muted" style="margin-top:10px">
      對戰隊伍 = 目前出戰隊伍(自動回滿 HP 與 PP,不影響冒險存檔)。<br>
      目前隊伍:${S.party.filter(x=>!x.egg).length?S.party.filter(x=>!x.egg).map(x=>`${SP[x.sp].n} Lv.${x.lv}`).join('、'):'<b style="color:var(--bad)">空</b>'}</div>`:''}
  </div>
  <div class="card"><h3>📖 規則</h3>
    <div class="muted">
      · 雙方以相同隨機種子在兩端同步模擬,伺服器只負責轉發指令與仲裁勝負。<br>
      · 上傳的隊伍會被伺服器正規化(等級 ≤60、個體值 ≤31、努力值單項 ≤60 總計 ≤120),改數值無效。<br>
      · 每回合思考上限 45 秒,逾時會自動出第一招。<br>
      · 御獸倒下後的替補,會在下一回合開始時選擇。<br>
      · 斷線視為落敗。積分採 Elo(K=32)。
    </div></div>
  <div class="card"><h3>🏅 排行榜</h3><div id="bd" class="muted">按上方「排行榜」載入</div></div>`;

  const g=id=>$('#'+id);
  if(g('bConn'))g('bConn').onclick=async()=>{
    toast('連線中…');
    try{await NET.connect();toast('🟢 已連線');}
    catch(e){AU.sfx('error');toast('❌ '+e.message+'(請先執行 tamer-server.js)',3200);}
    renderTab();
  };
  if(g('bReg'))g('bReg').onclick=()=>authDialog('register');
  if(g('bLog'))g('bLog').onclick=()=>authDialog('login');
  if(g('bSize'))g('bSize').onclick=()=>{PVPSIZE=PVPSIZE===2?1:2;AU.sfx('click');renderTab();};
  if(g('bQueue'))g('bQueue').onclick=()=>startQueue(false);
  if(g('bRoom'))g('bRoom').onclick=()=>startQueue(true);
  g('bBoard').onclick=async()=>{
    if(!NET.connected){try{await NET.connect();}catch(e){return toast('❌ '+e.message);}}
    NET.send('board');
    try{
      const d=await NET.once('board',6000);
      $('#bd').innerHTML=d.list.length?`<table class="bt2"><tr><th>#</th><th>名稱</th><th>積分</th><th>戰績</th></tr>
        ${d.list.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td><b>${x.rating}</b></td>
        <td>${x.wins}勝 ${x.losses}敗</td></tr>`).join('')}</table>`
        :'<div class="muted">還沒有人上榜</div>';
    }catch(e){$('#bd').textContent='載入失敗:'+e.message;}
  };
}
async function authDialog(kind){
  const v=await dialog(`<h2>${kind==='register'?'📝 註冊':'🔑 登入'}</h2>
    <input class="txt" id="an" placeholder="名稱(2–10 字)" maxlength="10">
    <input class="txt" id="ap" type="password" placeholder="密碼(至少 4 字)" style="margin-top:8px">
    <div class="btns"><button class="btn pri" data-y>送出</button><button class="btn" data-n>取消</button></div>`,
    {after:(o,cl)=>{
      setTimeout(()=>o.querySelector('#an').focus(),60);
      const go=()=>cl({name:o.querySelector('#an').value.trim(),pass:o.querySelector('#ap').value});
      o.querySelector('[data-y]').onclick=go;
      o.querySelector('[data-n]').onclick=()=>cl(null);
      o.querySelector('#ap').onkeydown=e=>{if(e.key==='Enter')go();};
    }});
  if(!v||!v.name)return;
  NET.send(kind,v);
  try{await NET.once('me',8000);AU.sfx('quest');toast('✅ 歡迎,'+NET.account.name);}
  catch(e){AU.sfx('error');toast('❌ '+e.message);}
  renderTab();
}
async function startQueue(isRoom){
  if(!S.party.filter(m=>!m.egg).length)return toast('隊伍是空的(蛋無法上場)');
  let code=null;
  if(isRoom){
    code=await promptBox('🚪 私人房','','輸入相同代碼即可配對',8);
    if(!code)return;
  }
  const team=packTeam(S.party.filter(m=>!m.egg));
  NET.send(isRoom?'room':'queue',{team,size:PVPSIZE,code:code?code.toUpperCase():undefined});
  const cancel=await dialog(`<h2>${isRoom?'🚪 等待對手':'🎯 配對中…'}</h2>
    <div class="muted">${isRoom?'代碼 <b>'+esc((code||'').toUpperCase())+'</b>,請對手輸入相同代碼。':'正在尋找對手('+(PVPSIZE===2?'雙打':'單打')+')…'}</div>
    <div class="spin"></div>
    <div class="btns"><button class="btn dan" data-n>取消</button></div>`,
    {after:(o,cl)=>{
      o.querySelector('[data-n]').onclick=()=>{NET.send('cancel');cl('cancel');};
      const onMatch=d=>{NET.handlers.match=(NET.handlers.match||[]).filter(f=>f!==onMatch);cl(d);};
      NET.on('match',onMatch);
    }});
  if(!cancel||cancel==='cancel')return;
  await runPvpBattle(cancel);
  renderAll();
}

/* ============================================================
   戰鬥介面
   ============================================================ */
let BT=null;             // 當前 Battle
let ACT=()=>{};
const waitAct=()=>new Promise(r=>{ACT=v=>{ACT=()=>{};r(v);};});
const SPOS=[
  [{right:'6%',top:'4%'},{right:'32%',top:'19%'}],     // 對手側
  [{left:'6%',bottom:'5%'},{left:'32%',bottom:'20%'}]  // 我方側
];
function btShell(size){
  const slot=(vis,i)=>`<div class="slot ${vis}" id="sl-${vis}-${i}">
      ${vis==='foe'?'<div class="info" id="if-foe-'+i+'"></div><div class="art" id="ar-foe-'+i+'"></div>'
                   :'<div class="art" id="ar-mine-'+i+'"></div><div class="info" id="if-mine-'+i+'"></div>'}
    </div>`;
  let h='<div class="field" id="field"><div class="wbadge" id="wb"></div>';
  for(let i=0;i<size;i++)h+=slot('foe',i);
  for(let i=0;i<size;i++)h+=slot('mine',i);
  h+='</div><div class="logbox" id="bLog"></div><div class="cmds" id="bCmd"></div>';
  return h;
}
function slotEl(sideIdx,slot){
  const vis=sideIdx===BT.viewSide?'mine':'foe';
  return {wrap:$(`#sl-${vis}-${slot}`),art:$(`#ar-${vis}-${slot}`),info:$(`#if-${vis}-${slot}`)};
}
function positionSlots(size){
  for(let i=0;i<size;i++){
    Object.assign($(`#sl-foe-${i}`).style,SPOS[0][i]);
    Object.assign($(`#sl-mine-${i}`).style,SPOS[1][i]);
  }
}
function infoHTML(m,isFoe,sideIdx){
  if(!m)return '<div class="empty">—</div>';
  const r=m.hp/maxHP(m), vo=BT.v[m.u]||{};
  const st=['atk','def','spd'].filter(k=>vo[k]).map(k=>
    `<span class="stg ${vo[k]>0?'up':'dn'}">${STATKEY[k]}${vo[k]>0?'+':''}${vo[k]}</span>`).join('');
  const side=BT.sides[sideIdx];
  const balls=`<div class="ball-row">${side.team.map(t=>
    `<span class="pb ${alive(t)?'alive':'dead'}"></span>`).join('')}</div>`;
  return `<div class="l1">${esc(m.nick||SP[m.sp].n)}${m.shiny?' ✨':''} ${tpChips(SP[m.sp].t)}
     ${m.st?`<span class="stx ${m.st}">${STN[m.st]}</span>`:''}
     ${vo.seed?'<span class="stx psn">寄生</span>':''}
     <span class="lv">Lv.${m.lv}</span></div>
   <div class="bar" style="margin-top:4px"><i style="width:${r*100}%;background:${hpColor(r)}"></i></div>
   ${st?`<div class="stgs">${st}</div>`:''}
   ${isFoe?balls:`<div class="hpn">${m.hp}/${maxHP(m)}</div>
     ${m.lv<60?`<div class="bar exp"><i style="width:${clamp(m.xp/xpNext(m)*100,0,100)}%"></i></div>`:''}
     ${balls}`}`;
}
function paintSlot(sideIdx,slot){
  const m=BT.sides[sideIdx].active[slot], el=slotEl(sideIdx,slot);
  if(!el.wrap)return;
  el.info.innerHTML=infoHTML(m,sideIdx!==BT.viewSide,sideIdx);
  const key=m?m.sp+m.u:'';
  if(el.art.dataset.k!==key){
    el.art.dataset.k=key;el.art.innerHTML='';
    el.art.style.transform='';el.art.style.opacity='';
    el.art.classList.remove('fade');
    if(m){
      const sz=sideIdx===BT.viewSide?(BT.size>1?122:150):(BT.size>1?106:128);
      const cv=monCanvas(m.sp,sz,{flip:sideIdx===BT.viewSide,shiny:m.shiny});
      cv.className='enter';el.art.appendChild(cv);
    }
  }
}
function paintAll(){
  if(!BT)return;
  for(let s=0;s<2;s++)for(let i=0;i<BT.size;i++)paintSlot(s,i);
  const wb=$('#wb');
  if(wb){
    if(BT.weather.k){wb.className='wbadge on w-'+BT.weather.k;
      wb.textContent=({sun:'☀️ 晴天',rain:'🌧️ 雨天',sand:'🌪️ 沙暴'})[BT.weather.k]+' ('+BT.weather.n+')';}
    else{wb.className='wbadge';wb.textContent='';}
  }
}
let BTANIM=0;
function btAnimLoop(){
  if(!BT){BTANIM=0;return;}
  const t=performance.now();
  for(let s=0;s<2;s++)for(let i=0;i<BT.size;i++){
    const m=BT.sides[s].active[i];if(!m)continue;
    const el=slotEl(s,i);if(!el.art)continue;
    const cv=el.art.querySelector('canvas');if(!cv)continue;
    drawMon(cv,m.sp,{t,flip:s===BT.viewSide,shiny:m.shiny,faint:!alive(m),status:m.st});
  }
  BTANIM=requestAnimationFrame(btAnimLoop);
}
const bms=ms=>Math.max(60,Math.round((ms===undefined?800:ms)*(S.opt.speed||1)));

/* --- 指令選單 --- */
function cmdRoot(slot,m){
  const wild=!!BT.wild, multi=BT.size>1;
  $('#bCmd').innerHTML=`
   ${multi?`<div class="who">指令 → <b>${esc(m.nick||SP[m.sp].n)}</b>(位置 ${slot+1})</div>`:''}
   <div class="cmd4">
    <button class="btn pri" data-c="fight">⚔️ 戰鬥</button>
    <button class="btn" data-c="bag" ${BT.pvp?'disabled':''}>🎒 道具</button>
    <button class="btn" data-c="sw">🔄 換獸</button>
    ${wild?'<button class="btn gold" data-c="ball">🔴 捕捉</button>'
          :`<button class="btn ${BT.pvp?'dan':''}" data-c="${BT.pvp?'ff':'x'}" ${BT.pvp?'':'disabled'}>${BT.pvp?'🏳️ 投降':'🚫 無法逃跑'}</button>`}
    ${wild?'<button class="btn" data-c="run" style="grid-column:span 2">🚪 逃跑</button>':''}
   </div>`;
  $('#bCmd').querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{AU.sfx('click');onCmd(b.dataset.c,slot,m);});
}
function onCmd(c,slot,m){
  if(c==='fight')cmdMoves(slot,m);
  else if(c==='sw'){
    const bench=BT.benchOf(BT.sides[BT.viewSide],[]);
    if(!bench.length){AU.sfx('error');return toast('沒有其他可出戰的御獸');}
    cmdSwitch(slot,m,bench,false);
  }
  else if(c==='bag')cmdBag(slot,m);
  else if(c==='ball')cmdBalls(slot,m);
  else if(c==='run')ACT({t:'run'});
  else if(c==='ff')pvpForfeit();
}
function cmdMoves(slot,m){
  const usable=m.mv.filter(v=>v.pp>0);
  if(!usable.length){
    $('#bCmd').innerHTML=`<div class="muted mb8">所有招式的 PP 都用完了!</div>
      <button class="btn dan w100" data-str>💥 掙扎(會受到反作用傷害)</button>
      <button class="btn w100 mt8" data-back>↩ 返回</button>`;
    $('#bCmd').querySelector('[data-str]').onclick=()=>ACT({t:'struggle'});
    $('#bCmd').querySelector('[data-back]').onclick=()=>cmdRoot(slot,m);
    return;
  }
  const foes=BT.sides[1-BT.viewSide].active.filter(alive);
  $('#bCmd').innerHTML=`<div class="cmd4">${m.mv.map((v,i)=>{
    const s=SK[v.id];
    let tag='';
    if(s.p&&foes.length){
      const es=foes.map(f=>effAll(s.t,SP[f.sp].t));
      const mx=Math.max(...es);
      tag=mx>1?'<span class="ok">效果絕佳</span>':mx<1?'<span class="bad">效果不好</span>':'';
      if(mx===0)tag='<span class="bad">無效</span>';
    }
    return `<button class="mv ${v.pp<=0?'no':''}" data-m="${i}" ${v.pp<=0?'disabled':''}>
      <div class="t">${tpChip(s.t)} ${s.n}${s.tg==='allfoe'?' <span class="muted">範圍</span>':''}
        ${s.pri?'<span class="muted">先制+'+s.pri+'</span>':''}</div>
      <div class="p"><span>威力 ${s.p||'—'}</span><span>命中 ${s.acc>=999?'必中':s.acc}</span>
        <span>PP ${v.pp}/${s.pp}</span>${tag}</div></button>`;}).join('')}
    </div><button class="btn w100 mt8" data-back>↩ 返回</button>`;
  $('#bCmd').querySelectorAll('[data-m]').forEach(b=>b.onclick=async()=>{
    AU.sfx('click');
    const i=+b.dataset.m, s=SK[m.mv[i].id];
    if(BT.size>1&&s.tg!=='self'&&s.tg!=='allfoe'&&foes.length>1){
      cmdTarget(slot,m,i,foes);
    }else{
      const tg=s.tg==='self'?BT.slotOf(m):(foes.length?BT.slotOf(foes[0]):null);
      ACT({t:'move',mv:i,tg});
    }
  });
  $('#bCmd').querySelector('[data-back]').onclick=()=>cmdRoot(slot,m);
}
function cmdTarget(slot,m,mvIdx,foes){
  $('#bCmd').innerHTML=`<div class="muted mb8">選擇 <b>${SK[m.mv[mvIdx].id].n}</b> 的目標</div>
    <div class="cmd4">${foes.map((f,i)=>{
      const p=BT.slotOf(f), e=effAll(SK[m.mv[mvIdx].id].t,SP[f.sp].t);
      return `<button class="mv" data-t="${p[0]},${p[1]}">
        <div class="t">${esc(f.nick||SP[f.sp].n)} ${tpChips(SP[f.sp].t)}</div>
        <div class="p"><span>Lv.${f.lv} · ${f.hp}/${maxHP(f)}</span>
        <span class="${e>1?'ok':e<1?'bad':''}">×${e}</span></div></button>`;}).join('')}
    </div><button class="btn w100 mt8" data-back>↩ 返回</button>`;
  $('#bCmd').querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{
    AU.sfx('click');
    const [a,c]=b.dataset.t.split(',').map(Number);
    ACT({t:'move',mv:mvIdx,tg:[a,c]});
  });
  $('#bCmd').querySelector('[data-back]').onclick=()=>cmdMoves(slot,m);
}
function benchButtons(bench,onPick,backFn){
  $('#bCmd').innerHTML=`<div class="grid scroll38">${bench.map(o=>{
    const x=o.x, r=x.hp/maxHP(x);
    return `<button class="mv" data-s="${o.idx}">
      <div class="t">${esc(x.nick||SP[x.sp].n)} ${tpChips(SP[x.sp].t)}
        <span class="muted" style="margin-left:auto">Lv.${x.lv}</span></div>
      <div class="bar" style="margin:4px 0"><i style="width:${r*100}%;background:${hpColor(r)}"></i></div>
      <div class="p"><span>${x.hp}/${maxHP(x)}</span>${x.st?`<span>${STN[x.st]}</span>`:''}
        <span>${AB[x.ab]?AB[x.ab].n:''}</span></div></button>`;}).join('')}
    </div>${backFn?'<button class="btn w100 mt8" data-back>↩ 返回</button>':''}`;
  $('#bCmd').querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{AU.sfx('click');onPick(+b.dataset.s);});
  const bk=$('#bCmd').querySelector('[data-back]');if(bk)bk.onclick=backFn;
}
function cmdSwitch(slot,m,bench){
  benchButtons(bench,i=>ACT({t:'switch',i}),()=>cmdRoot(slot,m));
}
function cmdBag(slot,m){
  const ks=Object.keys(S.bag).filter(k=>S.bag[k]>0&&['heal','cure','revive','ether'].includes(ITEM[k].k));
  $('#bCmd').innerHTML=`<div class="grid scroll38">${ks.length?ks.map(k=>
    `<button class="mv" data-i="${k}"><div class="t">${ITEM[k].ic} ${ITEM[k].n}
      <span class="muted" style="margin-left:auto">×${S.bag[k]}</span></div>
      <div class="p">${esc(ITEM[k].d)}</div></button>`).join('')
    :'<div class="muted">沒有可用道具</div>'}
    </div><button class="btn w100 mt8" data-back>↩ 返回</button>`;
  $('#bCmd').querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{AU.sfx('click');ACT({t:'item',key:b.dataset.i});});
  $('#bCmd').querySelector('[data-back]').onclick=()=>cmdRoot(slot,m);
}
function cmdBalls(slot,m){
  const ks=Object.keys(S.bag).filter(k=>S.bag[k]>0&&ITEM[k].k==='ball');
  $('#bCmd').innerHTML=`<div class="grid scroll38">${ks.length?ks.map(k=>
    `<button class="mv" data-b="${k}"><div class="t">${ITEM[k].ic} ${ITEM[k].n}
      <span class="muted" style="margin-left:auto">×${S.bag[k]}</span></div>
      <div class="p">${esc(ITEM[k].d)}</div></button>`).join('')
    :'<div class="muted">沒有球了!</div>'}
    </div><button class="btn w100 mt8" data-back>↩ 返回</button>`;
  $('#bCmd').querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>{AU.sfx('click');ACT({t:'ball',key:b.dataset.b});});
  $('#bCmd').querySelector('[data-back]').onclick=()=>cmdRoot(slot,m);
}
async function pvpForfeit(){
  if(!await confirmBox('投降?','將直接判定落敗並扣除積分。','投降',1))return cmdRoot(0,BT.sides[BT.viewSide].active[0]);
  NET.send('forfeit');
  BT.over='lose';ACT({t:'move',mv:0,tg:[1-BT.viewSide,0]});
}

/* --- 引擎 hooks --- */
function makeHooks(extra){
  return Object.assign({
    say:async(t,ms)=>{$('#bLog').innerHTML=t;await sleep(bms(ms));},
    hpAnim:async(p,m)=>{paintSlot(p[0],p[1]);await sleep(bms(430));},
    fx:(p,cls)=>{
      const el=slotEl(p[0],p[1]);if(!el.art)return;
      if(cls==='ballin'){el.art.style.transition='.35s';el.art.style.transform='scale(.25)';
        el.art.style.opacity='.35';AU.sfx('ball');return;}
      if(cls==='ballout'){el.art.style.transform='';el.art.style.opacity='';AU.sfx('escape');return;}
      if(cls==='shake')AU.sfx('shake');
      if(cls==='fade')AU.sfx('faint');
      el.art.classList.remove(cls);void el.art.offsetWidth;el.art.classList.add(cls);
      if(cls!=='fade')setTimeout(()=>el.art.classList.remove(cls),700);
    },
    refresh:paintAll,
    enterAnim:(p)=>{paintSlot(p[0],p[1]);},
    chooseAction:async(slot,m)=>{cmdRoot(slot,m);$('#bLog').innerHTML='要怎麼做?';return await waitAct();},
    chooseSwitch:async(slot,idxs)=>{
      const side=BT.sides[BT.viewSide];
      $('#bLog').innerHTML='要派出哪一隻御獸?';
      return await new Promise(res=>{
        benchButtons(idxs.map(i=>({x:side.team[i],idx:i})),i=>res(i),null);
      });
    },
    onEvent:(t,d)=>{
      if(t==='see')dexSee(d);
      else if(t==='move'){S.stat.mvUsed=S.stat.mvUsed||{};S.stat.mvUsed[d]=1;}
      else if(t==='super')S.stat.super++;
    }
  },extra||{});
}
function openBattleScreen(size,cls){
  const el=$('#bt');
  el.className=cls||'';
  el.innerHTML=btShell(size);
  positionSlots(size);
  el.classList.remove('hide');
  cancelAnimationFrame(BTANIM);BTANIM=requestAnimationFrame(btAnimLoop);
}
function closeBattleScreen(){
  cancelAnimationFrame(BTANIM);BTANIM=0;
  $('#bt').classList.add('hide');$('#bt').innerHTML='';
  BT=null;
  AU.music('field');
}
