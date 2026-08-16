/* ============================================================
   星痕御獸錄 II —— PvP 客戶端
   協定與 tamer-server.js 對應;對戰採 lockstep(雙方以同種子模擬)
   ============================================================ */
"use strict";

const NET={
  ws:null, connected:false, account:null, online:0,
  handlers:{},           // t -> [fn]
  pendTurn:null,         // {turn, resolve}
  match:null,
  url(){
    if(location.protocol==='http:'||location.protocol==='https:')
      return (location.protocol==='https:'?'wss://':'ws://')+location.host;
    return 'ws://localhost:8791';   // 直接開檔案時預設連本機伺服器
  },
  on(t,fn){(this.handlers[t]=this.handlers[t]||[]).push(fn);return this;},
  emit(t,d){(this.handlers[t]||[]).forEach(f=>{try{f(d);}catch(e){console.error(e);}});},

  connect(){
    return new Promise((res,rej)=>{
      if(this.connected)return res(true);
      let ws;
      try{ws=new WebSocket(this.url());}catch(e){return rej(new Error('無法建立連線'));}
      this.ws=ws;
      const to=setTimeout(()=>{try{ws.close();}catch(e){} rej(new Error('連線逾時'));},6000);
      ws.onopen=()=>{
        clearTimeout(to);this.connected=true;
        this.send('rules',legalTables());
        this.emit('open');res(true);
      };
      ws.onclose=()=>{
        this.connected=false;this.account=null;
        if(this.pendTurn){this.pendTurn.resolve(null);this.pendTurn=null;}
        this.emit('close');
      };
      ws.onerror=()=>{clearTimeout(to);if(!this.connected)rej(new Error('無法連上伺服器'));};
      ws.onmessage=e=>{
        let m;try{m=JSON.parse(e.data);}catch(_){return;}
        const d=m.d||{};
        if(m.t==='me')this.account=d;
        if(m.t==='hello'||m.t==='pong'||m.t==='board')this.online=d.online||this.online;
        if(m.t==='match')this.match=d;
        if(m.t==='turn'&&this.pendTurn){
          const p=this.pendTurn;this.pendTurn=null;
          p.resolve(d);
        }
        this.emit(m.t,d);
      };
    });
  },
  send(t,d){ if(this.ws&&this.ws.readyState===1)this.ws.send(JSON.stringify({t,d:d||{}})); },
  close(){ try{this.ws&&this.ws.close();}catch(e){} },

  /* 一次性等待某個訊息(或 err) */
  once(t,ms){
    return new Promise((res,rej)=>{
      let done=false;
      const ok=d=>{if(done)return;done=true;cleanup();res(d);};
      const bad=d=>{if(done)return;done=true;cleanup();rej(new Error(d&&d.msg||'失敗'));};
      const timer=setTimeout(()=>{if(!done){done=true;cleanup();rej(new Error('等待逾時'));}},ms||10000);
      const cleanup=()=>{
        clearTimeout(timer);
        this.handlers[t]=(this.handlers[t]||[]).filter(f=>f!==ok);
        this.handlers.err=(this.handlers.err||[]).filter(f=>f!==bad);
      };
      this.on(t,ok);this.on('err',bad);
    });
  },

  /* lockstep:送出本回合指令,等對手的指令回傳 */
  exchange(turn,acts){
    this.send('act',{turn,acts});
    return new Promise(res=>{ this.pendTurn={turn,resolve:res}; });
  }
};

/* 上傳規則白名單,讓伺服器能消毒隊伍(防改數值) */
function legalTables(){
  const sp={},mv={},it={};
  SPIDS.forEach(id=>{sp[id]={ab:SP[id].ab};});
  Object.keys(SK).forEach(id=>{mv[id]=SK[id].pp;});
  Object.keys(ITEM).forEach(id=>{if(ITEM[id].k==='hold')it[id]=1;});
  return {sp,mv,it};
}

/* 把本地御獸序列化成可上傳的形式(去掉暱稱以外的多餘欄位) */
function packTeam(list){
  return list.map(m=>({u:m.u,sp:m.sp,lv:m.lv,iv:m.iv,ev:m.ev||{hp:0,atk:0,def:0,spd:0},
    nat:m.nat||0,ab:m.ab,item:m.item||null,
    mv:m.mv.map(v=>({id:v.id,pp:SK[v.id].pp})),   // PvP 一律滿 PP
    nick:m.nick,shiny:!!m.shiny}));
}
/* 收到對手隊伍後補上 hp/狀態,並確保物件形狀與本地一致 */
function hydrateTeam(list){
  return list.map(m=>{
    const o=Object.assign({xp:0,st:null,nick:null},m);
    o.ev=o.ev||{hp:0,atk:0,def:0,spd:0};
    o.mv=o.mv.map(v=>({id:v.id,pp:SK[v.id].pp}));
    o.hp=maxHP(o);
    return o;
  });
}
/* PvP 用:把自己的隊伍複製一份並回滿(不影響冒險存檔) */
function pvpCopy(list){
  return hydrateTeam(packTeam(list));
}
