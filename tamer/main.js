/* ============================================================
   星痕御獸錄 II —— 遊戲流程 / 存檔 / 冒險
   ============================================================ */
"use strict";

const SAVEPRE='star_tamer2_slot', LASTSLOT='star_tamer2_last';
let SLOT=Number(localStorage.getItem(LASTSLOT)||0)||0;
const slotKey=i=>SAVEPRE+i;
let S=null, FEED=[];

function newSave(name){
  return {v:2,name:name||'訓練家',money:1500,badges:0,area:0,unlock:1,
    party:[],box:[],bag:{ball:8,potion:4},dex:{},
    questDone:[],achv:[],
    daycare:{a:null,b:null,steps:0},
    stat:{wins:0,steps:0,caught:0,evolve:0,super:0,defeat:0,flawless:0,
          pvp:0,pvpWin:0,mvUsed:{},species:{},bred:0},
    opt:{sfx:true,bgm:true,speed:1,theme:'dark'}};
}
function migrate(o){
  const d=newSave(o.name);
  const out=Object.assign(d,o);
  out.stat=Object.assign(d.stat,o.stat||{});
  out.opt=Object.assign(d.opt,o.opt||{});
  out.bag=o.bag||{};out.dex=o.dex||{};
  out.party=(o.party||[]).map(fixMon);out.box=(o.box||[]).map(fixMon);
  out.questDone=o.questDone||[];out.achv=o.achv||[];
  out.daycare=o.daycare||{a:null,b:null,steps:0};
  out.unlock=Math.max(1,Math.min(AREAS.length,o.unlock||1));
  out.area=Math.max(0,Math.min(out.unlock-1,o.area||0));
  return out;
}
function fixMon(m){
  if(m.egg){ if(!SP[m.sp])m.sp=SPIDS[0]; if(!(m.hatchLeft>0))m.hatchLeft=1; return m; }
  if(!SP[m.sp])m.sp=SPIDS[0];
  m.ev=m.ev||{hp:0,atk:0,def:0,spd:0};
  if(m.nat===undefined)m.nat=0;
  if(!m.ab||!SP[m.sp].ab.includes(m.ab))m.ab=SP[m.sp].ab[0];
  m.mv=(m.mv||[]).filter(v=>SK[v.id]);
  if(!m.mv.length)m.mv=[{id:'tackle',pp:35}];
  m.hp=clamp(m.hp||0,0,maxHP(m));
  if(m.item&&!ITEM[m.item])m.item=null;
  return m;
}

/* ---------------- 配種所 ---------------- */
function makeEgg(spid,a,b){
  const pIV=k=>chance(.5)?a.iv[k]:b.iv[k];
  return {u:'e'+(UIDN++)+'_'+Math.floor(Math.random()*1e9).toString(36),
    egg:1,sp:spid,hatchLeft:EGG_HATCH_STEPS,
    iv:{hp:pIV('hp'),atk:pIV('atk'),def:pIV('def'),spd:pIV('spd')},
    nat:pick([a.nat,b.nat]),
    shiny:a.shiny||b.shiny||chance(1/180)};
}
function daycarePut(which,m,fromParty,idx){
  if(fromParty){
    if(S.party.filter(x=>x.u!==m.u).length<1)return toast('至少保留一隻御獸在隊伍中');
    S.party.splice(idx,1);
  }else S.box.splice(idx,1);
  S.daycare[which]=m;S.daycare.steps=0;
  AU.sfx('click');renderAll();
}
function daycareTakeBack(which){
  const m=S.daycare[which];if(!m)return;
  S.daycare[which]=null;S.daycare.steps=0;
  if(S.party.length<6)S.party.push(m);else S.box.push(m);
  AU.sfx('click');toast(`${SP[m.sp].n} 回到了身邊`);renderAll();
}
function daycareTick(){
  const dc=S.daycare;
  if(!breedCompatible(dc.a,dc.b))return;
  dc.steps++;
  if(dc.steps>=EGG_LAY_STEPS){
    dc.steps=0;
    const spid=baseOf(pick([dc.a,dc.b]).sp);
    S.box.push(makeEgg(spid,dc.a,dc.b));
    feed('🥚 配種所裡多了一顆蛋,已送入倉庫。');
    toast('🥚 配種所生出了一顆蛋!',2400);AU.sfx('caught');
  }
}
function eggTick(){
  [S.party,S.box].forEach(arr=>{
    arr.forEach((m,i)=>{
      if(!m.egg)return;
      m.hatchLeft--;
      if(m.hatchLeft<=0){
        const baby=makeMon(m.sp,1,{iv:m.iv,nat:m.nat,shiny:m.shiny});
        arr[i]=baby;
        dexSee(baby.sp);dexCatch(baby.sp);
        S.stat.bred=(S.stat.bred||0)+1;
        feed(`🥚 蛋孵化了!誕生一隻 <b>${SP[baby.sp].n}</b>${baby.shiny?' ✨':''}!`);
        toast(`🥚 孵化!<b>${SP[baby.sp].n}</b>${baby.shiny?' ✨':''}`,2600);AU.sfx('evolve');
      }
    });
  });
}
let SKIP_AUTOSAVE=false;
function saveGame(){
  if(SKIP_AUTOSAVE)return;
  try{localStorage.setItem(slotKey(SLOT),JSON.stringify(S));}catch(e){}
}
function reloadWithout(fn){ SKIP_AUTOSAVE=true; fn(); location.reload(); }
function loadGame(){try{const r=localStorage.getItem(slotKey(SLOT));return r?JSON.parse(r):null;}catch(e){return null;}}

function feed(t){FEED.unshift(t);FEED=FEED.slice(0,50);paintFeed();}
function healAll(){S.party.forEach(m=>{m.hp=maxHP(m);m.st=null;m.mv.forEach(v=>v.pp=SK[v.id].pp);});}
function dexSee(id){if(!S.dex[id])S.dex[id]={s:0,c:0};S.dex[id].s=1;}
function dexCatch(id){dexSee(id);S.dex[id].c=1;}

/* ---------------- 任務 / 成就 ---------------- */
function questProgress(q){
  const st=S.stat;
  switch(q.k){
   case 'defeat': return st.defeat;
   case 'species':return Object.keys(st.species||{}).length;
   case 'super':  return st.super;
   case 'level':  return Math.max(0,...allMons(S).map(m=>m.lv));
   case 'evolve': return st.evolve;
   case 'badge':  return S.badges;
   case 'dex':    return dexCount(S).c;
   case 'wins':   return st.wins;
   case 'legend': return allMons(S).filter(m=>isLegend(m.sp)).length;
   case 'pvpwin': return st.pvpWin;
  }
  return 0;
}
const activeQuests=()=>QUESTS.filter(q=>!S.questDone.includes(q.id));
function checkQuests(){
  activeQuests().forEach(q=>{
    if(questProgress(q)>=q.goal){
      S.questDone.push(q.id);
      S.money+=q.rw.money;
      if(q.rw.items)Object.keys(q.rw.items).forEach(k=>S.bag[k]=(S.bag[k]||0)+q.rw.items[k]);
      AU.sfx('quest');
      toast(`📋 任務完成:<b>${q.n}</b> +💰${q.rw.money}`,3000);
      feed(`完成任務 <b>${q.n}</b>,獲得 💰${q.rw.money}${q.rw.items?' 與道具':''}。`);
    }
  });
}
function checkAchv(){
  ACHV.forEach(a=>{
    if(S.achv.includes(a.id))return;
    let ok=false;try{ok=a.f(S);}catch(e){}
    if(ok){
      S.achv.push(a.id);
      AU.sfx('achv');
      toast(`🏆 成就解鎖:<b>${a.n}</b>`,3200,'achv');
      feed(`🏆 解鎖成就 <b>${a.n}</b> — ${a.d}`);
    }
  });
}

/* ============================================================
   一般戰鬥(野生 / 訓練家)
   ============================================================ */
async function runBattle(cfg){
  const size=cfg.size||1;
  const foeSide={kind:'ai',name:cfg.foeName||'野生御獸',team:cfg.foeTeam};
  const mySide={kind:'player',name:S.name,team:S.party.filter(m=>!m.egg)};
  const seed=(Math.random()*0xffffffff)>>>0;
  let earned=0;
  const PART={};                                   // 參戰過的御獸(可分經驗)
  S.party.filter(m=>alive(m)&&!m.egg).slice(0,size).forEach(m=>PART[m.u]=1);

  openBattleScreen(size,cfg.boss?'boss':(cfg.wild?'wild':''));
  AU.music(cfg.boss?'boss':'battle');

  BT=new Battle({seed,size,wild:cfg.wild||null,viewSide:0,
    sides:[mySide,foeSide],
    hooks:makeHooks({
      chooseAction:(slot,m)=>{
        PART[m.u]=1;
        cmdRoot(slot,m);$('#bLog').innerHTML='要怎麼做?';return waitAct();
      },
      onFoeFaint:async foe=>{
        S.stat.defeat++;
        const base=xpReward(foe,!cfg.wild);
        const say=(t,ms)=>BT.hooks.say(t,ms);
        const onEvo=async()=>{S.stat.evolve++;AU.sfx('evolve');paintAll();};
        const learners=S.party.filter(m=>alive(m)&&PART[m.u]);
        for(const m of (learners.length?learners:S.party.filter(alive).slice(0,1))){
          const onField=BT.sides[BT.viewSide].active.some(a=>a&&a.u===m.u);
          await grantXP(m,onField?base:Math.max(1,Math.floor(base*0.5)),say,onEvo);
          paintAll();
        }
        if(cfg.wild){
          let g=rnd(30,70)+foe.lv*6;
          const amulet=BT.sides[BT.viewSide].active.some(a=>
            a&&a.item&&ITEM[a.item].hold&&ITEM[a.item].hold.money);
          if(amulet)g*=2;
          earned+=g;S.money+=g;
          await say(`獲得了 💰${g} 金幣。`,650);
        }
      },
      onEvent:(t,d)=>{
        if(t==='see')dexSee(d);
        else if(t==='move'){S.stat.mvUsed=S.stat.mvUsed||{};S.stat.mvUsed[d]=1;}
        else if(t==='super')S.stat.super++;
        else if(t==='catch'){
          dexCatch(d.sp);S.stat.caught++;
          S.stat.species=S.stat.species||{};S.stat.species[d.sp]=1;
          if(S.party.length<6)S.party.push(d);else S.box.push(d);
          feed(`捕獲了 <b>${SP[d.sp].n}</b> Lv.${d.lv}${S.party.length<=6?'':'(送入倉庫)'}`);
          AU.sfx('caught');
        }
      }
    })});

  const over=await BT.run();
  let win=false;
  if(over==='win'){
    S.stat.wins++;win=true;AU.sfx('win');AU.music('win');
    if(!BT.wild)await BT.hooks.say(`🏆 擊敗了 ${cfg.foeName}!`,1100);
  }else if(over==='caught'){win=true;}
  else if(over==='lose'){
    AU.sfx('lose');
    await BT.hooks.say('眼前一片白茫茫…',1000);
    const lost=Math.floor(S.money*0.15);S.money-=lost;healAll();
    await BT.hooks.say(`你回到了治療所,支付了 💰${lost} 治療費。`,1400);
    feed(`在 ${AREAS[S.area].n} 戰敗,失去 💰${lost}。`);
  }
  closeBattleScreen();
  checkQuests();checkAchv();saveGame();renderHeader();
  return {win,earned,noFaint:S.party.every(alive)};
}

/* ============================================================
   探索
   ============================================================ */
async function explore(){
  if(!S.party.some(alive)){AU.sfx('error');toast('❗ 全隊無法戰鬥,先去治療所');return true;}
  S.stat.steps++;
  daycareTick();eggTick();
  checkAchv();
  const A=AREAS[S.area], r=Math.random();
  if(r<0.60){
    const spid=weightedWild(A), lv=rnd(A.lv[0],A.lv[1]);
    const wild=makeMon(spid,lv);
    feed(`草叢晃動…野生的 <b>${SP[spid].n}</b> Lv.${lv} 出現了!`);
    await runBattle({wild,foeTeam:[wild],foeName:'野生御獸',size:1});
    renderAll();return true;
  }
  if(r<0.82){
    const ev=await randomEvent(A);
    renderAll();return ev;
  }
  const pool=['ball','ball','potion','greatball','antidote','ether','spotion'];
  const it=S.area>=3?pick(pool.concat(['ultraball','revive','spotion','duskball'])):pick(pool);
  S.bag[it]=(S.bag[it]||0)+1;
  feed(`撿到了 ${ITEM[it].ic} <b>${ITEM[it].n}</b>!`);
  AU.sfx('money');toast(`${ITEM[it].ic} 獲得 ${ITEM[it].n}`);
  checkQuests();checkAchv();saveGame();renderHeader();
  return false;
}
function weightedWild(A){
  const pool=[];
  A.mon.forEach(id=>{
    const w=isLegend(id)?1:SP[id].rate<70?4:10;
    for(let i=0;i<w;i++)pool.push(id);
  });
  return pick(pool);
}

/* ---------------- 隨機事件 ---------------- */
async function randomEvent(A){
  const total=EVENTS.reduce((s,e)=>s+e.w,0);
  let r=Math.random()*total, ev=EVENTS[0];
  for(const e of EVENTS){if((r-=e.w)<0){ev=e;break;}}
  const tier=S.area+1;
  switch(ev.id){
   case 'merchant':{
     const stock=[['ultraball',900],['spotion',520],['revive',1400],['ev_atk',800],['h_berry',1700]];
     const pickIt=pick(stock);
     const ok=await dialog(`<h2>🧳 ${ev.n}</h2><div class="muted">${ev.t}</div>
       <div class="muted" style="margin-top:8px">${ITEM[pickIt[0]].ic} <b>${ITEM[pickIt[0]].n}</b>
       特價 💰${pickIt[1]}(原價 ${ITEM[pickIt[0]].price})</div>
       <div class="btns"><button class="btn pri" data-y>購買</button><button class="btn" data-n>不用了</button></div>`,
       {after:(o,cl)=>{o.querySelector('[data-y]').onclick=()=>cl(1);o.querySelector('[data-n]').onclick=()=>cl(0);}});
     if(ok){
       if(S.money<pickIt[1]){AU.sfx('error');toast('💰 金幣不足');}
       else{S.money-=pickIt[1];S.bag[pickIt[0]]=(S.bag[pickIt[0]]||0)+1;
         AU.sfx('money');feed(`從旅行商人買下了 <b>${ITEM[pickIt[0]].n}</b>。`);}
     }
     return false;
   }
   case 'spring':
     healAll();AU.sfx('heal');
     await dialog(`<h2>♨️ ${ev.n}</h2><div class="muted">${ev.t}<br>全隊 HP、PP 與狀態完全回復!</div>
       <div class="btns"><button class="btn pri" data-n>舒服</button></div>`,
       {after:(o,cl)=>o.querySelector('[data-n]').onclick=()=>cl(1)});
     feed('泡了<b>溫泉</b>,全隊完全回復。');return false;
   case 'oldman':{
     const cands=S.party.filter(alive);
     if(!cands.length)return false;
     const m=pick(cands);
     const teachable=TMS.filter(id=>canLearnTM(m,id)&&!m.mv.some(v=>v.id===id));
     if(!teachable.length){feed('神秘老人搖搖頭走開了。');return false;}
     const id=pick(teachable);
     const ok=await dialog(`<h2>🧙 ${ev.n}</h2><div class="muted">${ev.t}</div>
       <div class="muted" style="margin-top:8px">要教 <b>${m.nick||SP[m.sp].n}</b> 學會
       ${tpChip(SK[id].t)} <b>${SK[id].n}</b>(威力 ${SK[id].p||'—'})嗎?</div>
       <div class="btns"><button class="btn pri" data-y>學習</button><button class="btn" data-n>算了</button></div>`,
       {after:(o,cl)=>{o.querySelector('[data-y]').onclick=()=>cl(1);o.querySelector('[data-n]').onclick=()=>cl(0);}});
     if(ok){
       const r=teachMove(m,id);
       AU.sfx('levelup');
       toast(r&&r.forget?`忘記 ${SK[r.forget].n},學會 ${SK[id].n}!`:`學會了 ${SK[id].n}!`,2600);
       feed(`<b>${m.nick||SP[m.sp].n}</b> 從神秘老人學會了 <b>${SK[id].n}</b>。`);
     }
     return false;
   }
   case 'fossil':{
     const g=rnd(200,400)*tier;S.money+=g;AU.sfx('money');
     await dialog(`<h2>🦴 ${ev.n}</h2><div class="muted">${ev.t}<br>賣掉後獲得 💰${g}!</div>
       <div class="btns"><button class="btn pri" data-n>收下</button></div>`,
       {after:(o,cl)=>o.querySelector('[data-n]').onclick=()=>cl(1)});
     feed(`挖到化石,賣得 💰${g}。`);return false;
   }
   case 'nest':{
     const A2=AREAS[S.area];
     const spid=pick(A2.mon), lv=clamp(rnd(A2.lv[0],A2.lv[1])+2,1,60);
     const shiny=chance(0.12);
     const wild=makeMon(spid,lv,{shiny});
     wild.iv={hp:rnd(20,31),atk:rnd(20,31),def:rnd(20,31),spd:rnd(20,31)};
     await dialog(`<h2>🪺 ${ev.n}</h2><div class="muted">${ev.t}<br>
       裡面的 <b>${SP[spid].n}</b> 個體值明顯偏高${shiny?',而且散發著金色光芒!':'。'}</div>
       <div class="btns"><button class="btn pri" data-n>靠近查看</button></div>`,
       {after:(o,cl)=>o.querySelector('[data-n]').onclick=()=>cl(1)});
     feed(`發現<b>稀有巢穴</b>:${SP[spid].n} Lv.${lv}${shiny?' ✨':''}`);
     await runBattle({wild,foeTeam:[wild],foeName:'巢穴御獸',size:1});
     return true;
   }
   case 'bandit':{
     const lost=Math.min(S.money,rnd(150,350)*tier);
     const fight=await dialog(`<h2>🦹 ${ev.n}</h2><div class="muted">${ev.t}</div>
       <div class="muted" style="margin-top:8px">交出 💰${lost},或是應戰?</div>
       <div class="btns"><button class="btn pri" data-y>應戰</button>
       <button class="btn" data-n>交出金幣</button></div>`,
       {after:(o,cl)=>{o.querySelector('[data-y]').onclick=()=>cl(1);o.querySelector('[data-n]').onclick=()=>cl(0);}});
     if(!fight){S.money-=lost;AU.sfx('error');feed(`被搶匪奪走 💰${lost}。`);return false;}
     const lv=clamp(Math.round((A.lv[0]+A.lv[1])/2)+2,3,60);
     const team=[makeMon(pick(A.mon),lv),makeMon(pick(A.mon),lv)];
     const r=await runBattle({foeTeam:team,foeName:'搶匪',size:1});
     if(r.win){const g=lost*2;S.money+=g;feed(`擊退搶匪,奪回 💰${g}!`);}
     return true;
   }
   case 'trainer':{
     const lv=clamp(rnd(A.lv[0],A.lv[1])+1,2,60);
     const n=S.area>=4?3:2;
     const team=[];for(let i=0;i<n;i++)team.push(makeMon(pick(A.mon),lv));
     const names=['阿宏','小美','阿凱','娜娜','小豪','雅婷','阿德','琳琳'];
     const nm=`${pick(['短褲小子','捕蟲少年','美少女','釣魚人','登山客','研究員'])} ${pick(names)}`;
     const money=rnd(300,600)*tier;
     const go=await dialog(`<h2>👤 ${nm}</h2><div class="muted">${ev.t}</div>
       <div class="muted" style="margin-top:6px">隊伍:${team.map(x=>SP[x.sp].n+' Lv.'+x.lv).join('、')}
       <br>獲勝獎勵 💰${money}</div>
       <div class="btns"><button class="btn pri" data-y>應戰</button><button class="btn" data-n>迴避</button></div>`,
       {after:(o,cl)=>{o.querySelector('[data-y]').onclick=()=>cl(1);o.querySelector('[data-n]').onclick=()=>cl(0);}});
     if(!go)return false;
     const r=await runBattle({foeTeam:team,foeName:nm,size:S.area>=4&&team.length>=3?2:1});
     if(r.win){S.money+=money;AU.sfx('money');feed(`擊敗 <b>${nm}</b>,獲得 💰${money}。`);}
     return true;
   }
   case 'shrine':{
     const m=pick(S.party);
     const k=pick(['hp','atk','def','spd']);
     if(m.iv[k]>=31){
       const g=rnd(300,600)*tier;S.money+=g;
       await dialog(`<h2>⛩️ ${ev.n}</h2><div class="muted">${ev.t}<br>神壇賜予了 💰${g}。</div>
         <div class="btns"><button class="btn pri" data-n>感謝</button></div>`,
         {after:(o,cl)=>o.querySelector('[data-n]').onclick=()=>cl(1)});
       feed(`古老神壇賜予 💰${g}。`);
     }else{
       const add=Math.min(31-m.iv[k],rnd(4,9));
       m.iv[k]+=add;AU.sfx('buff');
       await dialog(`<h2>⛩️ ${ev.n}</h2><div class="muted">${ev.t}<br>
         <b>${m.nick||SP[m.sp].n}</b> 的${k==='hp'?'體力':STATKEY[k]}個體值提升了 ${add}!</div>
         <div class="btns"><button class="btn pri" data-n>感謝</button></div>`,
         {after:(o,cl)=>o.querySelector('[data-n]').onclick=()=>cl(1)});
       feed(`神壇提升了 <b>${m.nick||SP[m.sp].n}</b> 的個體值 +${add}。`);
     }
     return false;
   }
   case 'chest':{
     const n=rnd(2,3), got={};
     const pool=['ball','greatball','potion','spotion','antidote','ether','revive','ultraball'];
     for(let i=0;i<n;i++){const k=pick(pool);got[k]=(got[k]||0)+1;S.bag[k]=(S.bag[k]||0)+1;}
     AU.sfx('money');
     await dialog(`<h2>📦 ${ev.n}</h2><div class="muted">${ev.t}<br>
       ${Object.keys(got).map(k=>`${ITEM[k].ic} ${ITEM[k].n} ×${got[k]}`).join('<br>')}</div>
       <div class="btns"><button class="btn pri" data-n>收下</button></div>`,
       {after:(o,cl)=>o.querySelector('[data-n]').onclick=()=>cl(1)});
     feed(`打開補給箱,獲得 ${Object.keys(got).map(k=>ITEM[k].n).join('、')}。`);
     return false;
   }
  }
  return false;
}

/* ---------------- 頭目 ---------------- */
async function bossFight(){
  const A=AREAS[S.area], B=A.boss;
  if(!S.party.some(alive)){AU.sfx('error');return toast('❗ 全隊無法戰鬥');}
  const first=S.badges===S.area;
  const go=await dialog(`<h2>⚔️ ${esc(B.n)}</h2>
    <div class="muted">隊伍:${B.team.map(t=>SP[t[0]].n+' Lv.'+t[1]).join('、')}</div>
    <div class="muted" style="margin-top:6px">${B.dbl?'<b>雙打戰</b> — 雙方同時派出兩隻。<br>':''}
      獲勝獎勵 💰${B.money}${first?' + 徽章':''}</div>
    <div class="btns"><button class="btn pri" data-y>開戰</button><button class="btn" data-n>再準備一下</button></div>`,
    {after:(o,cl)=>{o.querySelector('[data-y]').onclick=()=>cl(1);o.querySelector('[data-n]').onclick=()=>cl(0);}});
  if(!go)return;
  if(B.dbl&&S.party.filter(alive).length<2)
    return toast('雙打戰需要至少 2 隻可出戰的御獸');
  const team=B.team.map(t=>makeMon(t[0],t[1]));
  const r=await runBattle({foeTeam:team,foeName:B.n,boss:1,size:B.dbl?2:1});
  if(r.win){
    S.money+=B.money;
    if(r.noFaint)S.stat.flawless++;
    if(first){
      S.badges++;
      if(S.unlock<AREAS.length)S.unlock++;
      feed(`擊敗 <b>${B.n}</b>!獲得徽章與 💰${B.money}。`);
      if(S.badges===6){
        S.bag.masterball=(S.bag.masterball||0)+1;
        await dialog(`<h2>👑 你成為了冠軍!</h2>
          <div class="muted">六枚徽章齊聚,星痕的光照亮了你。<br>獲得傳說道具 🟣 <b>大師球</b>!</div>
          <div class="muted" style="margin-top:8px">四個新區域已開放:<b>遺跡迴廊、熾炎火山、雷雲層、星痕深淵</b>。
            傳說御獸在那裡等著你。</div>
          <div class="btns"><button class="btn pri" data-n>繼續旅程</button></div>`,
          {after:(o,cl)=>o.querySelector('[data-n]').onclick=()=>cl(1)});
      }else if(S.badges>=AREAS.length){
        await dialog(`<h2>🌌 你走到了世界的盡頭</h2>
          <div class="muted">星痕之影退去,裂縫緩緩閉合。<br>你與夥伴的旅程,已經是傳說的一部分。</div>
          <div class="btns"><button class="btn pri" data-n>完結</button></div>`,
          {after:(o,cl)=>o.querySelector('[data-n]').onclick=()=>cl(1)});
      }else{
        await dialog(`<h2>🏅 獲得徽章!</h2>
          <div class="muted">新區域「${AREAS[S.unlock-1].n}」已解鎖!</div>
          <div class="btns"><button class="btn pri" data-n>好</button></div>`,
          {after:(o,cl)=>o.querySelector('[data-n]').onclick=()=>cl(1)});
      }
    }else feed(`再次擊敗 <b>${B.n}</b>,獲得 💰${B.money}。`);
    checkQuests();checkAchv();
  }
  renderAll();
}

/* ============================================================
   PvP 對戰(lockstep)
   ============================================================ */
async function runPvpBattle(info){
  const size=info.size||1;
  const myTeam=pvpCopy(S.party).slice(0,6);
  const foeTeam=hydrateTeam(info.foe.team);
  const mySide={kind:'player',name:info.you.name,team:myTeam};
  const foeSide={kind:'net',name:info.foe.name,team:foeTeam};
  // side 0 / 1 由伺服器指定,兩端建構完全相同的 sides 陣列
  const sides=info.side===0?[mySide,foeSide]:[foeSide,mySide];

  openBattleScreen(size,'pvp');
  AU.music('pvp');
  let ended=null;
  const onEnd=d=>{ended=d;};
  NET.on('matchEnd',onEnd);
  NET.on('note',d=>toast(d.msg||'',2200));

  BT=new Battle({seed:info.seed,size,wild:null,pvp:true,viewSide:info.side,
    sides,
    remote:async(turn,myActs)=>{
      $('#bLog').innerHTML='⏳ 等待對手…';
      const d=await NET.exchange(turn-1,myActs);
      if(!d)return null;
      return d.acts[1-info.side];
    },
    hooks:makeHooks({
      onEvent:(t,d)=>{if(t==='see')dexSee(d);
        else if(t==='move'){S.stat.mvUsed=S.stat.mvUsed||{};S.stat.mvUsed[d]=1;}
        else if(t==='super')S.stat.super++;}
    })});
  await BT.hooks.say(`對手:<b>${esc(info.foe.name)}</b>(積分 ${info.foe.rating})`,1200);

  const over=await BT.run();
  const win=over==='win';
  if(over==='netlost'){
    await BT.hooks.say('❌ 與對手失去連線。',1300);
  }else{
    NET.send('result',{win});
    await BT.hooks.say(win?'🏆 你贏了!等待結算…':'💀 你輸了…等待結算…',900);
    for(let i=0;i<40&&!ended;i++)await sleep(150);
  }
  S.stat.pvp++;
  if(win)S.stat.pvpWin++;
  NET.handlers.matchEnd=(NET.handlers.matchEnd||[]).filter(f=>f!==onEnd);
  closeBattleScreen();
  AU.sfx(win?'win':'lose');
  await dialog(`<h2>${win?'🏆 勝利':'💀 落敗'}</h2>
    <div class="muted">對手 ${esc(info.foe.name)}<br>
      ${ended?`新積分 <b>${ended.rating}</b>${ended.reason?'('+esc(ended.reason)+')':''}`:'(未收到結算)'}</div>
    <div class="btns"><button class="btn pri" data-n>關閉</button></div>`,
    {after:(o,cl)=>o.querySelector('[data-n]').onclick=()=>cl(1)});
  checkQuests();checkAchv();saveGame();
}

/* ============================================================
   開場
   ============================================================ */
const STARTERS=['emberfox','bubbleturtle','sproutcat'];
async function intro(){
  const nm=await dialog(`<h2>★ 星痕御獸錄 II</h2>
    <div class="muted">在星痕大陸上,御獸師與夥伴一同踏上旅程。<br>先告訴我你的名字吧。</div>
    <div style="margin-top:12px"><input class="txt" id="nm" maxlength="10" placeholder="輸入名字"></div>
    <div class="btns"><button class="btn pri" data-y>開始旅程</button></div>`,
    {after:(o,cl)=>{
      const i=o.querySelector('#nm');setTimeout(()=>i.focus(),60);
      const go=()=>cl(i.value.trim()||'訓練家');
      o.querySelector('[data-y]').onclick=go;
      i.onkeydown=e=>{if(e.key==='Enter')go();};
    }});
  S=newSave(nm);applyTheme();
  const pickId=await dialog(`<h2>選擇你的初始夥伴</h2>
    <div class="muted">牠將陪你走完整段旅程。</div>
    <div class="starter" id="stw"></div>
    <div class="muted" style="margin-top:10px">火 → 草 → 水 → 火 · 屬性相剋是勝負關鍵</div>`,
    {after:(o,cl)=>{
      const w=o.querySelector('#stw');
      STARTERS.forEach(id=>{
        const c=document.createElement('div');c.className='stc';
        c.appendChild(monCanvas(id,84,{}));
        c.insertAdjacentHTML('beforeend',
          `<div class="sn">${SP[id].n}</div>${tpChips(SP[id].t)}
           <div class="muted sd">特性 ${SP[id].ab.map(a=>AB[a].n).join('/')}</div>`);
        c.onclick=()=>{AU.sfx('click');cl(id);};
        w.appendChild(c);
      });
    }});
  const st=makeMon(pickId,5);
  S.party.push(st);dexCatch(pickId);
  S.stat.species[pickId]=1;
  feed(`與 <b>${SP[pickId].n}</b>(特性【${AB[st.ab].n}】· ${NAT[st.nat].n}性格)一起踏上旅程!`);
  checkAchv();saveGame();renderAll();
  AU.music('field');
  toast('🎮 探索遇敵 → 打到殘血 → 丟球捕捉',3600);
}

/* ---- boot ---- */
(function boot(){
  buildShell();
  const l=loadGame();
  if(l&&l.party&&l.party.length){
    S=migrate(l);
    applyTheme();
    AU.setSfx(S.opt.sfx);AU.setMusic(S.opt.bgm);
    FEED=['讀取存檔完成,歡迎回來!'];
    renderAll();
    checkAchv();
    document.addEventListener('pointerdown',()=>AU.music('field'),{once:true});
  }else{
    S=newSave('訓練家');applyTheme();renderHeader();
    document.addEventListener('pointerdown',()=>AU.resume(),{once:true});
    intro();
  }
  window.addEventListener('beforeunload',saveGame);
  setInterval(saveGame,20000);
})();

window.RESET=()=>reloadWithout(()=>localStorage.removeItem(slotKey(SLOT)));
