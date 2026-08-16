/* ============================================================
   星痕御獸錄 II —— 戰鬥引擎
   · slot 制:單打 size=1,雙打 size=2
   · 所有隨機數走 this.rng(種子化)→ 兩端可 lockstep 模擬(PvP)
   · UI 透過 hooks 提供動畫/輸入,引擎本身不碰 DOM
   ============================================================ */
"use strict";

/* ---------------- 種子化 RNG(mulberry32) ---------------- */
function mkRNG(seed){
  let a=(seed>>>0)||1;
  return function(){
    a+=0x6D2B79F5;let t=a;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
const STN={burn:'燒傷',para:'麻痺',psn:'中毒',slp:'睡眠'};
const STATKEY={atk:'攻擊',def:'防禦',spd:'速度'};
const WNAME={sun:'晴天',rain:'雨天',sand:'沙暴'};

/* ---------------- 純能力值(性格 / 個體值 / 努力值 / 攜帶道具) ---------------- */
function baseStat(m,k){
  const sp=SP[m.sp], ev=Math.floor(((m.ev&&m.ev[k])||0)/4);
  if(k==='hp')return Math.floor((2*sp.b.hp+m.iv.hp+ev)*m.lv/100)+m.lv+10;
  let v=Math.floor((2*sp.b[k]+m.iv[k]+ev)*m.lv/100)+5;
  const nat=NAT[m.nat||0];
  if(nat.up===k)v=Math.floor(v*1.1);
  if(nat.dn===k)v=Math.floor(v*0.9);
  const h=m.item&&ITEM[m.item]&&ITEM[m.item].hold;
  if(h&&h[k])v=Math.floor(v*h[k]);
  return v;
}
const maxHP=m=>baseStat(m,'hp');
const monName=m=>m.nick||SP[m.sp].n;
const alive=m=>!!m&&m.hp>0;
const xpNext=m=>Math.floor(Math.pow(m.lv+1,3)*0.72);
const abOf=m=>AB[m.ab]||{};
const typesOf=m=>SP[m.sp].t;

/* ---------------- 建立御獸 ---------------- */
let UIDN=1;
function makeMon(spid,lv,opt){
  opt=opt||{};
  const sp=SP[spid], R=opt.rng||Math.random;
  const ri=()=>Math.floor(R()*32);
  const m={u:'m'+(UIDN++)+'_'+Math.floor(R()*1e9).toString(36),
    sp:spid,lv:lv,xp:0,
    iv:opt.iv||{hp:ri(),atk:ri(),def:ri(),spd:ri()},
    ev:{hp:0,atk:0,def:0,spd:0},
    nat:opt.nat!==undefined?opt.nat:Math.floor(R()*NAT.length),
    ab:opt.ab||sp.ab[Math.floor(R()*sp.ab.length)],
    item:opt.item||null, st:null, mv:[], hp:0, nick:null,
    shiny:opt.shiny!==undefined?opt.shiny:R()<1/220};
  const learn=[...new Set(sp.ls.filter(x=>x[0]<=lv).map(x=>x[1]))].slice(-4);
  m.mv=(learn.length?learn:['tackle']).map(id=>({id,pp:SK[id].pp}));
  m.hp=maxHP(m);
  return m;
}
function teachMove(m,id){
  if(m.mv.some(v=>v.id===id))return null;
  if(m.mv.length<4){m.mv.push({id,pp:SK[id].pp});return{learn:id};}
  const drop=m.mv.shift();m.mv.push({id,pp:SK[id].pp});
  return{learn:id,forget:drop.id};
}
function evolveMon(m){
  const ev=SP[m.sp].evo;if(!ev)return null;
  const old=m.sp, r=m.hp/maxHP(m);
  m.sp=ev.to;
  // 進化後若原特性不在新種族可能特性中,取新種族第一個
  if(!SP[m.sp].ab.includes(m.ab))m.ab=SP[m.sp].ab[0];
  m.hp=Math.max(1,Math.round(maxHP(m)*r));
  return old;
}
function canLearnTM(m,mvId){
  const t=SK[mvId].t;
  return t==='normal'||typesOf(m).includes(t);
}

/* ============================================================
   Battle
   cfg = {seed, size, wild, sides:[{kind,name,team}], viewSide, hooks, remote}
   hooks = {say, hpAnim, fx, refresh, enterAnim, chooseAction, chooseSwitch, onEvent}
   ============================================================ */
function Battle(cfg){
  this.seed=cfg.seed>>>0;
  this.rng=mkRNG(this.seed);
  this.size=cfg.size||1;
  this.wild=cfg.wild||null;
  this.pvp=!!cfg.pvp;   // PvP:替補上場改由「指令流」交換,兩端才不會 desync
  this.hooks=cfg.hooks;
  this.remote=cfg.remote||null;      // async fn(turn, myActions) -> foeActions
  this.viewSide=cfg.viewSide||0;
  this.sides=cfg.sides.map((s,i)=>({
    idx:i,kind:s.kind,name:s.name,team:s.team,
    active:new Array(this.size).fill(null),
    sent:0
  }));
  this.v={};                          // 每隻的臨場狀態
  this.weather={k:null,n:0};
  this.turn=0;
  this.over=null;                     // 'win'|'lose'|'caught'|'run'|'draw'
  this.pend=[];                       // 待輸出的旁白/特效
  this.log=[];
}

/* ---- 臨場狀態 ---- */
Battle.prototype.vol=function(m){
  if(!this.v[m.u])this.v[m.u]={atk:0,def:0,spd:0,slp:0,seed:null,protect:0,berry:0,firstTurn:1};
  return this.v[m.u];
};
Battle.prototype.roll=function(p){return this.rng()<p;};
Battle.prototype.rint=function(a,b){return a+Math.floor(this.rng()*(b-a+1));};

/* ---- 查詢 ---- */
Battle.prototype.sideOf=function(m){
  return this.sides.find(s=>s.active.some(x=>x&&x.u===m.u));
};
Battle.prototype.foesOf=function(m){
  const s=this.sideOf(m);if(!s)return [];
  return this.sides[1-s.idx].active.filter(alive);
};
Battle.prototype.alliesOf=function(m){
  const s=this.sideOf(m);if(!s)return [];
  return s.active.filter(x=>alive(x)&&x.u!==m.u);
};
Battle.prototype.slotOf=function(m){
  const s=this.sideOf(m);if(!s)return null;
  return [s.idx,s.active.findIndex(x=>x&&x.u===m.u)];
};

/* ---- 對外訊息(先入 pend,再由 flush 播出) ---- */
Battle.prototype.msg=function(t,ms){this.pend.push({k:'say',t:t,ms:ms});};
Battle.prototype.efx=function(m,cls){const p=this.slotOf(m);if(p)this.pend.push({k:'fx',p:p,cls:cls});};
Battle.prototype.flush=async function(){
  const q=this.pend;this.pend=[];
  for(const e of q){
    if(e.k==='say'){this.log.push(e.t);await this.hooks.say(e.t,e.ms);}
    else if(e.k==='fx')this.hooks.fx(e.p,e.cls);
    else if(e.k==='hp')await this.hooks.hpAnim(e.p,e.m);
  }
};
Battle.prototype.hpShow=async function(m){
  const p=this.slotOf(m);
  if(p)await this.hooks.hpAnim(p,m);
};

/* ---- 能力值(含狀態 / 特性 / 階級) ---- */
Battle.prototype.stat=function(m,k){
  let v=baseStat(m,k);
  const ab=abOf(m);
  if(m.st==='burn'&&k==='atk'&&m.ab!=='guts')v=Math.floor(v*.55);
  if(m.st==='para'&&k==='spd')v=Math.floor(v*.55);
  if(ab.stMul)v=ab.stMul(this,m,k,v);
  const s=this.vol(m)[k]||0;
  v*= s>=0?(2+s)/2:2/(2-s);
  return Math.max(1,Math.floor(v));
};
Battle.prototype.stage=function(m,k,d,src){
  if(!alive(m))return false;
  const vo=this.vol(m), o=vo[k];
  vo[k]=Math.max(-6,Math.min(6,o+d));
  if(vo[k]===o){this.msg(`${monName(m)} 的${STATKEY[k]}無法再${d>0?'提升':'下降'}了…`,620);return false;}
  this.msg(`${src?'【'+src+'】':''}${monName(m)} 的${STATKEY[k]}${d>0?'提升':'下降'}了!`,640);
  return true;
};
Battle.prototype.setWeather=function(k,n,src){
  if(this.weather.k===k){this.msg('但是天氣沒有變化…',560);return false;}
  this.weather={k:k,n:n};
  this.msg(`${src?'【'+monName(src)+'】':''}天氣變成了 <b>${WNAME[k]}</b>!`,760);
  this.hooks.refresh&&this.hooks.refresh();
  return true;
};
Battle.prototype.inflict=function(m,st,src){
  if(!alive(m))return false;
  if(m.st){return false;}
  const ab=abOf(m);
  if(ab.noStatus&&ab.noStatus(st)){this.msg(`${monName(m)} 的【${ab.n}】阻止了${STN[st]}!`,700);return false;}
  m.st=st;
  if(st==='slp')this.vol(m).slp=this.rint(1,3);
  this.msg(`${src?'【'+src+'】':''}${monName(m)} 陷入了<b>${STN[st]}</b>!`,760);
  return true;
};
Battle.prototype.heal=function(m,amt,src){
  if(!alive(m))return 0;
  const b=m.hp;m.hp=Math.min(maxHP(m),m.hp+Math.max(1,Math.floor(amt)));
  if(m.hp>b)this.msg(`${src?'【'+src+'】':''}${monName(m)} 回復了 ${m.hp-b} HP。`,660);
  return m.hp-b;
};
Battle.prototype.dmgDirect=function(m,amt,src){
  if(!alive(m))return;
  m.hp=Math.max(0,m.hp-Math.max(1,Math.floor(amt)));
  this.efx(m,'flash');
  this.msg(`${src?'【'+src+'】':''}${monName(m)} 受到了 ${Math.floor(amt)} 點傷害!`,660);
};

/* ---- 上場 ---- */
Battle.prototype.send=async function(sideIdx,slot,mon,quiet){
  const s=this.sides[sideIdx];
  s.active[slot]=mon;
  const vo=this.vol(mon);vo.atk=vo.def=vo.spd=0;vo.protect=0;vo.firstTurn=1;
  this.hooks.enterAnim&&this.hooks.enterAnim([sideIdx,slot],mon);
  if(!quiet){
    if(sideIdx===this.viewSide)this.msg(`上吧!${monName(mon)}!`,700);
    else this.msg(`${s.name} 派出了 ${monName(mon)}!`,760);
  }
  this.hooks.onEvent&&this.hooks.onEvent('see',mon.sp);
  await this.flush();
  const ab=abOf(mon);
  if(ab.onEnter){ab.onEnter(this,mon);await this.flush();}
};
Battle.prototype.openers=function(side){
  // 選出前 size 隻可戰鬥的
  const out=[];
  for(const m of side.team){if(out.length>=this.size)break;if(alive(m))out.push(m);}
  return out;
};

/* ============================================================
   主流程
   ============================================================ */
Battle.prototype.run=async function(){
  for(const s of this.sides){
    const op=this.openers(s);
    for(let i=0;i<op.length;i++)await this.send(s.idx,i,op[i],true);
  }
  this.hooks.refresh&&this.hooks.refresh();
  if(this.wild){
    const w=this.sides[1].active.filter(alive).map(m=>`<b>${monName(m)}</b> Lv.${m.lv}`).join(' 與 ');
    this.msg(`野生的 ${w} 出現了!`,900);
  }else{
    this.msg(`<b>${this.sides[1-this.viewSide].name}</b> 向你發起了挑戰!`,900);
  }
  const mine=this.sides[this.viewSide].active.filter(alive).map(monName).join('、');
  this.msg(`去吧!${mine}!`,760);
  await this.flush();

  while(!this.over){
    this.turn++;
    const acts=await this.collect();
    if(this.over)break;
    await this.execute(acts);
    if(this.over)break;
    await this.endOfTurn();
    if(this.over)break;
    await this.replaceFainted();
    if(this.over)break;
    if(this.turn>300){this.over='draw';break;}
  }
  return this.over;
};

/* ---- 收集雙方指令 ---- */
Battle.prototype.benchOf=function(side,exclude){
  const used=side.active.filter(x=>alive(x)).map(x=>x.u).concat(exclude||[]);
  return side.team.map((x,idx)=>({x,idx})).filter(o=>alive(o.x)&&!used.includes(o.x.u));
};
Battle.prototype.collect=async function(){
  const local=[], remoteSide=this.sides[1-this.viewSide];
  const my=this.sides[this.viewSide];
  const picked=[];
  for(let i=0;i<this.size;i++){
    const m=my.active[i];
    if(!alive(m)){
      // PvP:空位的「指令」就是派誰上場,會經由網路交換
      if(this.pvp){
        my.active[i]=null;
        const bench=this.benchOf(my,picked);
        if(bench.length){
          const c=my.kind==='player'
            ? await this.hooks.chooseSwitch(i,bench.map(o=>o.idx))
            : bench[0].idx;
          picked.push(my.team[c].u);
          local.push({t:'sendin',i:c});
          continue;
        }
      }
      local.push(null);continue;
    }
    if(my.kind==='player'){
      const a=await this.hooks.chooseAction(i,m);
      if(a&&a.t==='__flee'){this.over='run';return null;}
      local.push(a);
    }else local.push(this.aiAction(my,i));
  }
  let foe;
  if(remoteSide.kind==='net'){
    foe=await this.remote(this.turn,local);
    if(!foe){this.over='netlost';return null;}
  }else{
    foe=[];const fpicked=[];
    for(let i=0;i<this.size;i++){
      const m=remoteSide.active[i];
      if(!alive(m)&&this.pvp){
        remoteSide.active[i]=null;
        const bench=this.benchOf(remoteSide,fpicked);
        if(bench.length){fpicked.push(bench[0].x.u);foe.push({t:'sendin',i:bench[0].idx});continue;}
        foe.push(null);continue;
      }
      foe.push(alive(m)?this.aiAction(remoteSide,i):null);
    }
  }
  // 統一成 [side0Acts, side1Acts]
  const out=[[],[]];
  out[this.viewSide]=local; out[1-this.viewSide]=foe;
  return out;
};

/* ---- AI ---- */
Battle.prototype.aiAction=function(side,slot){
  const m=side.active[slot];
  const foes=this.sides[1-side.idx].active.filter(alive);
  if(!foes.length)return null;
  const usable=m.mv.map((v,i)=>({v,i})).filter(x=>x.v.pp>0);
  if(!usable.length)return{t:'struggle',tg:this.slotOf(foes[0])};
  let best=null,bs=-1;
  for(const x of usable){
    const s=SK[x.v.id];
    for(const f of (s.tg==='self'?[m]:foes)){
      let sc;
      if(s.p>0){
        const e=effAll(s.t,typesOf(f));
        const stab=typesOf(m).includes(s.t)?1.5:1;
        sc=s.p*e*stab*(s.acc>=999?1:s.acc/100);
        if(s.tg==='allfoe'&&foes.length>1)sc*=1.5;
        if(e===0)sc=0;
        if(s.fx&&s.fx.needSlp&&f.st!=='slp')sc=1;
        const ab=abOf(f);
        if(ab.absorb&&ab.absorb(this,f,s))sc=1;
      }else{
        const fx=s.fx||{};sc=26;
        if(fx.heal)sc=m.hp/maxHP(m)<.45?170:4;
        if(fx.cureTeam)sc=m.st?90:4;
        if(fx.inflict)sc=f.st?3:78;
        if(fx.seed)sc=this.vol(f).seed?3:72;
        if(fx.weather)sc=this.weather.k===fx.weather?3:55;
        if(fx.protect)sc=this.vol(m).firstTurn?40:16;
        if(fx.buff)sc=this.vol(m)[fx.buff]>=3?5:48;
        if(fx.debuff)sc=this.vol(f)[fx.debuff]<=-3?5:44;
      }
      sc*=0.85+this.rng()*0.3;
      if(sc>bs){bs=sc;best={t:'move',mv:x.i,tg:s.tg==='self'?this.slotOf(m):this.slotOf(f)};}
    }
  }
  // 殘血且有替補時,偶爾換獸
  if(m.hp/maxHP(m)<0.22&&this.rng()<0.22){
    const bench=side.team.map((x,i)=>({x,i}))
      .filter(o=>alive(o.x)&&!side.active.some(a=>a&&a.u===o.x.u));
    if(bench.length)return{t:'switch',i:bench[Math.floor(this.rng()*bench.length)].i};
  }
  return best||{t:'struggle',tg:this.slotOf(foes[0])};
};

/* ---- 行動排序與執行 ---- */
Battle.prototype.execute=async function(acts){
  /* 先處理替補上場(PvP) */
  for(let si=0;si<2;si++)for(let sl=0;sl<this.size;sl++){
    const a=acts[si][sl];
    if(a&&a.t==='sendin'){
      const s=this.sides[si], nm=s.team[a.i];
      if(alive(nm)&&!s.active.some(x=>x&&x.u===nm.u))await this.send(si,sl,nm);
      await this.flush();
    }
  }
  if(this.checkEnd())return;

  const order=[];
  for(let si=0;si<2;si++)for(let sl=0;sl<this.size;sl++){
    const a=acts[si][sl];if(!a||a.t==='sendin')continue;
    const m=this.sides[si].active[sl];if(!alive(m))continue;
    let pri=6;
    if(a.t==='move')pri=SK[m.mv[a.mv].id].pri||0;
    else if(a.t==='struggle')pri=0;
    else if(a.t==='run')pri=0;
    order.push({si,sl,m,a,pri,spd:this.stat(m,'spd'),tb:this.rng()});
  }
  order.sort((x,y)=>y.pri-x.pri||y.spd-x.spd||y.tb-x.tb);

  for(const o of order){
    if(this.over)return;
    const cur=this.sides[o.si].active[o.sl];
    if(!alive(cur)||cur.u!==o.m.u)continue;   // 已倒下或已被換下
    await this.doAction(o.si,o.sl,cur,o.a);
    await this.flush();
    if(this.checkEnd())return;
  }
};

Battle.prototype.doAction=async function(si,sl,m,a){
  switch(a.t){
   case 'move':     await this.doMove(m,a);break;
   case 'struggle': await this.doStruggle(m,a);break;
   case 'switch':   await this.doSwitch(si,sl,a.i);break;
   case 'item':     await this.doItem(si,m,a);break;
   case 'ball':     await this.doBall(a);break;
   case 'run':      await this.doRun(m);break;
  }
};

Battle.prototype.doSwitch=async function(si,sl,teamIdx){
  const s=this.sides[si], out=s.active[sl], nm=s.team[teamIdx];
  if(!alive(nm))return;
  if(out){
    const ab=abOf(out);
    if(ab.switchOut){ab.switchOut(this,out);this.msg(`【${ab.n}】${monName(out)} 回復了一些體力。`,660);}
    this.msg(`回來吧,${monName(out)}!`,620);
    this.vol(out).seed=null;
  }
  await this.flush();
  await this.send(si,sl,nm);
};

Battle.prototype.doItem=async function(si,m,a){
  const r=useItemOn(a.key,m,this);
  if(r.ok){
    if(this.hooks.onEvent)this.hooks.onEvent('useItem',a.key);
    await this.hpShow(m);
  }
  this.msg(r.msg,820);
};

Battle.prototype.doRun=async function(m){
  const foes=this.foesOf(m);
  const fs=foes.length?Math.max(...foes.map(f=>this.stat(f,'spd'))):1;
  const odds=Math.max(.2,Math.min(.95,this.stat(m,'spd')/Math.max(1,fs)*0.6+0.28));
  if(this.roll(odds)){this.msg('成功逃走了!',880);this.over='run';}
  else this.msg('沒能逃掉!',800);
};

Battle.prototype.doStruggle=async function(m,a){
  this.msg(`${monName(m)} 拼命地掙扎!`,700);
  await this.flush();
  const tg=this.resolveTarget(m,a,{tg:'foe'});
  if(!tg.length)return;
  const f=tg[0];
  const A=this.stat(m,'atk'), D=this.stat(f,'def');
  const dmg=Math.max(1,Math.floor(((2*m.lv/5+2)*50*A/Math.max(1,D))/50+2));
  this.efx(f,'shake');
  f.hp=Math.max(0,f.hp-dmg);
  await this.flush();await this.hpShow(f);
  const rec=Math.max(1,Math.floor(dmg/4));
  m.hp=Math.max(0,m.hp-rec);
  this.efx(m,'flash');
  this.msg(`${monName(m)} 受到了反作用傷害!`,700);
  await this.flush();await this.hpShow(m);
  await this.checkFaints();
};

/* ---- 目標解析 ---- */
Battle.prototype.resolveTarget=function(m,a,s){
  if(s.tg==='self')return [m];
  const foes=this.foesOf(m);
  if(s.tg==='allfoe')return foes;
  if(a.tg){
    const t=this.sides[a.tg[0]].active[a.tg[1]];
    if(alive(t)&&t.u!==m.u)return [t];
  }
  return foes.length?[foes[0]]:[];
};

/* ---- 使用招式 ---- */
Battle.prototype.doMove=async function(m,a){
  const slot=m.mv[a.mv], s=SK[slot.id];
  const vo=this.vol(m);

  /* 行動阻礙 */
  if(m.st==='slp'){
    vo.slp--;
    if(vo.slp<=0){m.st=null;this.msg(`${monName(m)} 醒過來了!`,720);await this.flush();await this.hpShow(m);}
    else{this.msg(`${monName(m)} 睡得正香…`,760);return;}
  }
  if(m.st==='para'&&this.roll(.25)){this.msg(`${monName(m)} 因麻痺而無法動彈!`,780);return;}

  slot.pp--;
  if(this.hooks.onEvent)this.hooks.onEvent('move',slot.id);
  this.msg(`${monName(m)} 使用了 <b>${s.n}</b>!`,620);
  await this.flush();

  /* 天氣類 / 自身類 */
  if(s.fx&&s.fx.weather){this.setWeather(s.fx.weather,5,m);await this.flush();return;}
  if(s.fx&&s.fx.protect){vo.protect=1;this.msg(`${monName(m)} 擺出了防禦姿態!`,700);await this.flush();return;}
  if(s.fx&&s.fx.cureTeam){
    const side=this.sideOf(m);let n=0;
    side.team.forEach(x=>{if(x.st){x.st=null;n++;}});
    this.msg(n?`舒緩的香氣治好了 ${n} 隻御獸的異常狀態!`:'但是沒有效果…',800);
    await this.flush();this.hooks.refresh&&this.hooks.refresh();return;
  }

  let targets=this.resolveTarget(m,a,s);
  if(!targets.length){this.msg('但是沒有目標…',700);await this.flush();return;}
  const spread=(s.tg==='allfoe'&&targets.length>1)?0.75:1;

  for(const f of targets){
    if(!alive(m))break;
    if(!alive(f))continue;

    /* 守住 */
    if(this.vol(f).protect&&s.tg!=='self'){
      this.msg(`${monName(f)} 守住了攻擊!`,720);await this.flush();continue;
    }
    /* 命中判定 */
    let acc=s.acc;
    if(s.rainHit&&this.weather.k==='rain')acc=999;
    if(acc<999&&!this.roll(acc/100)){
      this.msg(`可惜沒有命中…`,720);await this.flush();continue;
    }

    if(s.p>0)await this.hitDamage(m,f,s,spread);
    else await this.hitStatus(m,f,s);
    await this.flush();
    if(this.checkEnd())return;
  }
  await this.checkFaints();
};

Battle.prototype.hitDamage=async function(m,f,s,spread){
  const fab=abOf(f), mab=abOf(m);

  /* 屬性免疫特性 */
  if(fab.absorb){
    const r=fab.absorb(this,f,s);
    if(r){
      this.msg(`【${fab.n}】${monName(f)} 完全不受影響!`,760);
      if(r.heal)this.heal(f,maxHP(f)*r.heal,fab.n);
      if(r.stat)this.stage(f,r.stat,r.st,fab.n);
      await this.flush();await this.hpShow(f);
      return;
    }
  }
  if(s.fx&&s.fx.needSlp&&f.st!=='slp'){this.msg('但是沒有效果…',720);return;}

  const e=effAll(s.t,typesOf(f));
  if(e===0){this.msg(`對 ${monName(f)} 沒有效果…`,760);return;}

  /* 威力 */
  let p=s.p;
  if(mab.power)p=mab.power(this,m,s,p);
  if(this.weather.k==='sun'){if(s.t==='fire')p*=1.5;if(s.t==='water')p*=.5;}
  if(this.weather.k==='rain'){if(s.t==='water')p*=1.5;if(s.t==='fire')p*=.5;}

  const critCh=(s.fx&&s.fx.crit)||.0625;
  const crit=this.roll(critCh);
  const stab=typesOf(m).includes(s.t)?(mab.stabMul||1.5):1;
  const A=this.stat(m,'atk')*(crit?1.5:1);
  let D=this.stat(f,'def');
  if(crit)D=Math.min(D,baseStat(f,'def'));                 // 要害無視防禦強化
  if(this.weather.k==='sand'&&typesOf(f).includes('rock'))D=Math.floor(D*1.5);

  let dmg=(((2*m.lv/5+2)*p*A/Math.max(1,D))/50+2)*stab*e*spread*(0.85+this.rng()*0.15);
  if(fab.taken)dmg=fab.taken(this,f,s,dmg,e);
  const hold=f.item&&ITEM[f.item]&&ITEM[f.item].hold;
  if(hold&&hold.focus&&f.hp===maxHP(f)&&dmg>=f.hp)dmg=f.hp-1;
  dmg=Math.max(1,Math.floor(dmg));

  this.efx(f,'shake');this.efx(f,'flash');
  f.hp=Math.max(0,f.hp-dmg);
  await this.flush();await this.hpShow(f);

  if(crit)this.msg('要害命中!',600);
  if(e>1.9)this.msg('效果絕佳!',600);
  else if(e>1)this.msg('效果不錯!',560);
  else if(e<.6)this.msg('效果不太好…',600);
  if(e>1&&this.hooks.onEvent)this.hooks.onEvent('super');
  await this.flush();

  /* 吸血 / 反作用 */
  if(s.fx&&s.fx.drain){this.heal(m,dmg*s.fx.drain,'吸取');await this.flush();await this.hpShow(m);}
  if(s.fx&&s.fx.recoil){
    const rc=Math.max(1,Math.floor(dmg*s.fx.recoil));
    m.hp=Math.max(0,m.hp-rc);this.efx(m,'flash');
    this.msg(`${monName(m)} 受到了反作用傷害!`,700);
    await this.flush();await this.hpShow(m);
  }
  /* 接觸類:對手特性反擊 */
  if(s.ct&&alive(f)&&fab.contact){fab.contact(this,m,f);await this.flush();await this.hpShow(m);}
  /* 附加效果 */
  if(alive(f)&&s.fx){
    if(s.fx.inflict&&this.roll(s.fx.ch||1))this.inflict(f,s.fx.inflict,s.n);
    if(s.fx.debuff&&this.roll(s.fx.ch||1))this.stage(f,s.fx.debuff,s.fx.st);
    if(s.fx.buffSelf&&this.roll(s.fx.ch||1))this.stage(m,s.fx.buffSelf,s.fx.st);
    await this.flush();
  }
  this.hooks.refresh&&this.hooks.refresh();
};

Battle.prototype.hitStatus=async function(m,f,s){
  const fx=s.fx||{};
  if(fx.heal){
    let r=fx.heal;
    if(fx.sunHeal&&this.weather.k==='sun')r=2/3;
    if(fx.sunHeal&&(this.weather.k==='rain'||this.weather.k==='sand'))r=1/4;
    if(m.hp>=maxHP(m))this.msg('但是沒有效果…',700);
    else{this.heal(m,maxHP(m)*r);await this.flush();await this.hpShow(m);}
  }
  if(fx.buff){this.stage(m,fx.buff,fx.st);if(fx.buff2)this.stage(m,fx.buff2,fx.st2);}
  if(fx.debuff)this.stage(f,fx.debuff,fx.st);
  if(fx.inflict){
    if(f.st)this.msg(`${monName(f)} 已經處於異常狀態了。`,700);
    else this.inflict(f,fx.inflict,s.n);
    await this.flush();await this.hpShow(f);
  }
  if(fx.seed){
    if(this.vol(f).seed)this.msg('但是已經被寄生了…',700);
    else{this.vol(f).seed=m.u;this.msg(`${monName(f)} 被種下了寄生種子!`,760);}
  }
  this.hooks.refresh&&this.hooks.refresh();
};

/* ---- 回合結束 ---- */
Battle.prototype.endOfTurn=async function(){
  const all=[];
  for(const s of this.sides)s.active.forEach(m=>{if(alive(m))all.push(m);});
  all.sort((a,b)=>this.stat(b,'spd')-this.stat(a,'spd'));

  /* 天氣傷害 */
  if(this.weather.k==='sand'){
    for(const m of all){
      if(!alive(m))continue;
      if(typesOf(m).includes('rock'))continue;
      if(m.ab==='sandrush'||m.ab==='sandveil')continue;
      m.hp=Math.max(0,m.hp-Math.max(1,Math.floor(maxHP(m)/16)));
      this.efx(m,'flash');
      this.msg(`${monName(m)} 受到沙暴的侵襲!`,620);
      await this.flush();await this.hpShow(m);
    }
  }
  /* 異常狀態 / 寄生 / 特性 / 果實 */
  for(const m of all){
    if(!alive(m))continue;
    if(m.st==='burn'||m.st==='psn'){
      const d=Math.max(1,Math.floor(maxHP(m)/(m.st==='burn'?14:12)));
      m.hp=Math.max(0,m.hp-d);this.efx(m,'flash');
      this.msg(`${monName(m)} 受到${STN[m.st]}的傷害!`,620);
      await this.flush();await this.hpShow(m);
    }
    const vo=this.vol(m);
    if(alive(m)&&vo.seed){
      const d=Math.max(1,Math.floor(maxHP(m)/8));
      m.hp=Math.max(0,m.hp-d);this.efx(m,'flash');
      this.msg(`${monName(m)} 的體力被寄生種子吸走了!`,660);
      await this.flush();await this.hpShow(m);
      const src=all.find(x=>x.u===vo.seed);
      if(src&&alive(src)){this.heal(src,d,'寄生種子');await this.flush();await this.hpShow(src);}
    }
    const ab=abOf(m);
    if(alive(m)&&ab.endTurn){ab.endTurn(this,m);await this.flush();await this.hpShow(m);}
    /* 攜帶果實 */
    const hold=m.item&&ITEM[m.item]&&ITEM[m.item].hold;
    if(alive(m)&&hold&&hold.berry&&!vo.berry&&m.hp<=maxHP(m)/4){
      vo.berry=1;
      this.heal(m,maxHP(m)/3,ITEM[m.item].n);
      await this.flush();await this.hpShow(m);
    }
    vo.protect=0;vo.firstTurn=0;
  }
  /* 天氣計時 */
  if(this.weather.k){
    if(--this.weather.n<=0){
      this.msg(`${WNAME[this.weather.k]}停止了。`,700);
      this.weather={k:null,n:0};
      this.hooks.refresh&&this.hooks.refresh();
      await this.flush();
    }
  }
  await this.checkFaints();
};

/* ---- 倒下處理 ---- */
Battle.prototype.checkFaints=async function(){
  for(const s of this.sides)for(let i=0;i<this.size;i++){
    const m=s.active[i];
    if(m&&!alive(m)&&!this.vol(m).dead){
      this.vol(m).dead=1;
      this.efx(m,'fade');
      this.msg(`${monName(m)} 倒下了!`,780);
      await this.flush();
      if(s.idx!==this.viewSide){
        if(this.hooks.onEvent)this.hooks.onEvent('defeat',m);
        if(this.hooks.onFoeFaint)await this.hooks.onFoeFaint(m);
      }
    }
  }
  this.checkEnd();
};
Battle.prototype.checkEnd=function(){
  if(this.over)return true;
  const a=this.sides[this.viewSide].team.some(alive);
  const b=this.sides[1-this.viewSide].team.some(alive);
  if(!a&&!b)this.over='draw';
  else if(!b)this.over='win';
  else if(!a)this.over='lose';
  return !!this.over;
};
Battle.prototype.replaceFainted=async function(){
  if(this.pvp){ // PvP:留空,下一回合由 collect 交換「派誰上場」
    for(const s of this.sides)for(let i=0;i<this.size;i++)
      if(s.active[i]&&!alive(s.active[i]))s.active[i]=null;
    this.hooks.refresh&&this.hooks.refresh();
    this.checkEnd();return;
  }
  for(const s of this.sides){
    for(let i=0;i<this.size;i++){
      if(alive(s.active[i]))continue;
      const used=s.active.filter(x=>x&&alive(x)).map(x=>x.u);
      const bench=s.team.map((x,idx)=>({x,idx})).filter(o=>alive(o.x)&&!used.includes(o.x.u));
      if(!bench.length){s.active[i]=null;continue;}
      let choice;
      if(s.kind==='player'){
        this.msg('要派出哪一隻御獸?',300);await this.flush();
        choice=await this.hooks.chooseSwitch(i,bench.map(o=>o.idx));
      }else if(s.kind==='net'){
        // 對手的替補由網路端在下一回合的指令中處理:此處採「隊伍順序」規則
        choice=bench[0].idx;
      }else{
        // AI 選屬性上有利的
        const foes=this.sides[1-s.idx].active.filter(alive);
        let bi=bench[0].idx,bs=-1;
        bench.forEach(o=>{
          let sc=0;
          foes.forEach(f=>{
            typesOf(o.x).forEach(t=>{sc+=effAll(t,typesOf(f));});
            typesOf(f).forEach(t=>{sc-=effAll(t,typesOf(o.x));});
          });
          sc+=o.x.hp/maxHP(o.x);
          if(sc>bs){bs=sc;bi=o.idx;}
        });
        choice=bi;
      }
      await this.send(s.idx,i,s.team[choice]);
    }
  }
  this.checkEnd();
};

/* ---- 捕捉 ---- */
Battle.prototype.doBall=async function(a){
  const key=a.key, it=ITEM[key];
  const targets=this.sides[1-this.viewSide].active.filter(alive);
  if(targets.length!==1){
    this.msg('場上有多隻御獸,無法瞄準!',800);return;
  }
  const f=targets[0], sp=SP[f.sp];
  this.msg(`丟出了 ${it.ic} ${it.n}!`,700);
  await this.flush();
  this.efx(f,'ballin');
  await this.flush();

  let mult=it.m;
  if(it.dusk){
    const myLv=Math.max(...this.sides[this.viewSide].active.filter(alive).map(m=>m.lv));
    if(f.lv>myLv)mult=3;
  }
  let x=((3*maxHP(f)-2*f.hp)*sp.rate*mult)/(3*maxHP(f));
  if(f.st==='slp')x*=2.5;else if(f.st)x*=1.6;
  x*=1+Math.max(0,(30-f.lv))/100;

  let shakes=0;
  if(x>=255)shakes=4;
  else{
    const b=65536/Math.pow(255/x,0.1875);
    for(let i=0;i<4;i++){if(this.rint(0,65535)<b)shakes++;else break;}
  }
  for(let i=0;i<Math.min(shakes,3);i++){
    this.efx(f,'shake');
    this.msg(`…搖晃了 ${i+1} 下`,540);
    await this.flush();
  }
  if(shakes>=4){
    this.msg(`🎉 成功捕獲了 <b>${sp.n}</b>!`,1200);
    await this.flush();
    this.caught=f;this.over='caught';
    if(this.hooks.onEvent)this.hooks.onEvent('catch',f);
  }else{
    this.efx(f,'ballout');
    this.msg(`可惡…${sp.n} 掙脫了球!`,780);
    await this.flush();
  }
};

/* ============================================================
   道具使用(戰鬥內外共用)
   ============================================================ */
function useItemOn(key,m,ctx,opt){
  const it=ITEM[key];if(!it)return{ok:0,msg:'無法使用'};
  switch(it.k){
   case 'heal':
     if(!alive(m))return{ok:0,msg:'瀕死狀態無法使用傷藥'};
     if(m.hp>=maxHP(m))return{ok:0,msg:'HP 已滿'};
     {const b=m.hp;m.hp=Math.min(maxHP(m),m.hp+it.v);
      return{ok:1,msg:`${monName(m)} 回復了 ${m.hp-b} HP`};}
   case 'cure':
     if(!m.st)return{ok:0,msg:'沒有異常狀態'};
     m.st=null;return{ok:1,msg:monName(m)+' 恢復正常'};
   case 'revive':
     if(alive(m))return{ok:0,msg:'不需要復活'};
     m.hp=it.full?maxHP(m):Math.ceil(maxHP(m)/2);m.st=null;
     return{ok:1,msg:'✨ '+monName(m)+' 復活了!'};
   case 'ether':
     {let any=0;m.mv.forEach(v=>{if(v.pp<SK[v.id].pp){v.pp=Math.min(SK[v.id].pp,v.pp+10);any=1;}});
      return any?{ok:1,msg:monName(m)+' 的 PP 回復了'}:{ok:0,msg:'PP 已滿'};}
   case 'candy':
     if(ctx)return{ok:0,msg:'戰鬥中無法使用'};
     if(m.lv>=60)return{ok:0,msg:'已達等級上限 60'};
     {const pm=maxHP(m);m.lv++;m.xp=0;m.hp=Math.min(maxHP(m),m.hp+(maxHP(m)-pm));
      let msg=monName(m)+' 升到 Lv.'+m.lv;
      SP[m.sp].ls.filter(x=>x[0]===m.lv).forEach(x=>teachMove(m,x[1]));
      const ev=SP[m.sp].evo;
      if(ev&&m.lv>=ev.lv){evolveMon(m);msg+=' 並進化成 '+SP[m.sp].n+'!';}
      return{ok:1,msg};}
   case 'ev':{
     if(ctx)return{ok:0,msg:'戰鬥中無法使用'};
     m.ev=m.ev||{hp:0,atk:0,def:0,spd:0};
     const label=it.s==='hp'?'體力':STATKEY[it.s];
     if(m.ev[it.s]>=EV_ONE_MAX)return{ok:0,msg:`${label}努力值已達單項上限 ${EV_ONE_MAX}`};
     if(evTotal(m)>=EV_TOTAL_MAX)return{ok:0,msg:'努力值總量已達上限 '+EV_TOTAL_MAX};
     const add=Math.min(10,EV_ONE_MAX-m.ev[it.s],EV_TOTAL_MAX-evTotal(m));
     m.ev[it.s]+=add;
     return{ok:1,msg:`${monName(m)} 的${label}努力值 +${add}(${m.ev[it.s]}/${EV_ONE_MAX})`};}
   case 'tm':
     if(ctx)return{ok:0,msg:'戰鬥中無法使用'};
     if(!canLearnTM(m,it.mv))return{ok:0,msg:`${monName(m)} 學不會 ${SK[it.mv].n}(屬性不符)`};
     {const r=teachMove(m,it.mv);
      if(!r)return{ok:0,msg:'已經學會這個招式了'};
      return{ok:1,msg:r.forget?`${monName(m)} 忘記 ${SK[r.forget].n},學會了 ${SK[it.mv].n}!`
                              :`${monName(m)} 學會了 ${SK[it.mv].n}!`};}
   case 'abcap':
     if(ctx)return{ok:0,msg:'戰鬥中無法使用'};
     {const list=SP[m.sp].ab;
      if(list.length<2)return{ok:0,msg:'這隻御獸只有一種特性'};
      m.ab=list[(list.indexOf(m.ab)+1)%list.length];
      return{ok:1,msg:`${monName(m)} 的特性變成了【${AB[m.ab].n}】`};}
   case 'mint':{
     if(ctx)return{ok:0,msg:'戰鬥中無法使用'};
     if(opt===undefined||opt===null)return{ok:0,msg:'需要指定性格'};
     m.nat=opt;
     return{ok:1,msg:`${monName(m)} 的性格變成了【${NAT[opt].n}】`};}
   case 'ivup':{
     if(ctx)return{ok:0,msg:'戰鬥中無法使用'};
     if(!opt)return{ok:0,msg:'需要指定要提升的能力'};
     if(m.iv[opt]>=31)return{ok:0,msg:'這項個體值已經是 31 了'};
     m.iv[opt]=31;
     return{ok:1,msg:`${monName(m)} 的${opt==='hp'?'體力':STATKEY[opt]}個體值提升到 31!`};}
   case 'hold':
     return{ok:0,msg:'請在隊伍畫面的「攜帶道具」裝備'};
  }
  return{ok:0,msg:'無法使用'};
}

/* ============================================================
   經驗 / 升級 / 進化(戰鬥後由 UI 呼叫,可 await 動畫)
   ============================================================ */
async function grantXP(m,amount,say,onEvolve){
  const hold=m.item&&ITEM[m.item]&&ITEM[m.item].hold;
  if(hold&&hold.exp)amount=Math.floor(amount*hold.exp);
  m.xp+=amount;
  await say(`${monName(m)} 獲得了 ${amount} 點經驗值。`,700);
  while(m.xp>=xpNext(m)&&m.lv<60){
    const pm=maxHP(m);
    m.xp-=xpNext(m);m.lv++;
    m.hp=Math.min(maxHP(m),m.hp+(maxHP(m)-pm));
    await say(`🎊 ${monName(m)} 升到了 <b>Lv.${m.lv}</b>!`,880);
    for(const id of SP[m.sp].ls.filter(x=>x[0]===m.lv).map(x=>x[1])){
      const r=teachMove(m,id);if(!r)continue;
      await say(r.forget?`${monName(m)} 忘記了 ${SK[r.forget].n},學會了 <b>${SK[id].n}</b>!`
                       :`${monName(m)} 學會了 <b>${SK[id].n}</b>!`,900);
    }
    const ev=SP[m.sp].evo;
    if(ev&&m.lv>=ev.lv){
      const oldN=SP[m.sp].n;
      await say(`咦…?${oldN} 的樣子有點奇怪…`,880);
      evolveMon(m);
      if(onEvolve)await onEvolve(m,oldN);
      await say(`✨ 恭喜!${oldN} 進化成了 <b>${SP[m.sp].n}</b>!`,1400);
    }
  }
  if(m.lv>=60)m.xp=0;
}
function xpReward(foe,isTrainer){
  return Math.max(1,Math.floor(SP[foe.sp].xp*foe.lv/6*(isTrainer?1.4:1)));
}
