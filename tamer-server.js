/* ============================================================
   星痕御獸錄 II —— PvP 伺服器
   · HTTP 靜態:提供 /tamer 下的檔案
   · WebSocket:帳號、天梯配對、私人房、lockstep 指令轉發、排行榜
   · 對戰由兩端用相同種子 lockstep 模擬,伺服器只轉發指令並仲裁結果
   獨立 port,不影響本資料夾其他伺服器。
   ============================================================ */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const {WebSocketServer}=require('ws');

// 優先採用 preview 系統指派的 PORT（autoPort），否則回退到 TAMER_PORT 或 8791
const PORT=Number(process.env.PORT||process.env.TAMER_PORT||8791);
const ROOT=path.join(__dirname,'tamer');
const DB=path.join(__dirname,'tamer-accounts.json');
const TURN_TIMEOUT=45000;

/* ---------------- 帳號儲存 ---------------- */
let acc={};
try{acc=JSON.parse(fs.readFileSync(DB,'utf8'));}catch(e){acc={};}
let dirty=false;
const saveSoon=()=>{dirty=true;};
setInterval(()=>{
  if(!dirty)return;dirty=false;
  fs.writeFile(DB,JSON.stringify(acc),e=>{if(e)console.error('[db]',e.message);});
},2000);

const hash=(p,s)=>crypto.createHash('sha256').update(s+':'+p).digest('hex');
const newSalt=()=>crypto.randomBytes(8).toString('hex');

/* ---------------- 靜態檔 ---------------- */
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml'};
const srv=http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/'||p==='')p='/index.html';
  const f=path.join(ROOT,path.normalize(p).replace(/^([/\\])+/,''));
  if(!f.startsWith(ROOT)){res.writeHead(403).end('forbidden');return;}
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'}).end('404 '+p);return;}
    res.writeHead(200,{'content-type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream',
      'cache-control':'no-cache'});
    res.end(d);
  });
});

/* ---------------- 隊伍消毒(防止改數值作弊) ----------------
   伺服器不重算戰鬥,但會把雙方隊伍正規化後同時下發給兩端,
   因此任何超出規則的數值都會被削平,雙方看到的是同一份資料。
-------------------------------------------------------------- */
const RULES={maxLv:60,maxTeam:6,maxIV:31,maxEV1:60,maxEVT:120};
let LEGAL=null;   // 由客戶端第一次連線時上傳的規則表(species/move id 白名單)
function sanitizeTeam(team){
  if(!Array.isArray(team))return null;
  const out=[];
  for(const m of team.slice(0,RULES.maxTeam)){
    if(!m||typeof m!=='object')continue;
    if(LEGAL&&!LEGAL.sp[m.sp])continue;
    const lv=Math.max(1,Math.min(RULES.maxLv,Math.floor(+m.lv||1)));
    const iv={},ev={};let evt=0;
    for(const k of ['hp','atk','def','spd']){
      iv[k]=Math.max(0,Math.min(RULES.maxIV,Math.floor((m.iv&&+m.iv[k])||0)));
      let e=Math.max(0,Math.min(RULES.maxEV1,Math.floor((m.ev&&+m.ev[k])||0)));
      if(evt+e>RULES.maxEVT)e=Math.max(0,RULES.maxEVT-evt);
      evt+=e;ev[k]=e;
    }
    const mv=(Array.isArray(m.mv)?m.mv:[]).slice(0,4)
      .filter(v=>v&&(!LEGAL||LEGAL.mv[v.id]))
      .map(v=>({id:v.id,pp:Math.max(0,Math.min(LEGAL?LEGAL.mv[v.id]:99,Math.floor(+v.pp||0)))}));
    if(!mv.length)continue;
    const ab=(LEGAL&&LEGAL.sp[m.sp]&&LEGAL.sp[m.sp].ab.includes(m.ab))?m.ab
             :(LEGAL?LEGAL.sp[m.sp].ab[0]:m.ab);
    out.push({u:String(m.u||'').slice(0,40)||('x'+out.length),
      sp:m.sp,lv,xp:0,iv,ev,
      nat:Math.max(0,Math.min(6,Math.floor(+m.nat||0))),
      ab, item:(LEGAL&&m.item&&!LEGAL.it[m.item])?null:(m.item||null),
      st:null, mv, nick:(typeof m.nick==='string'?m.nick.slice(0,8):null),
      shiny:!!m.shiny, hp:0});
  }
  return out.length?out:null;
}

/* ---------------- 大廳 ---------------- */
const wss=new WebSocketServer({server:srv});
const clients=new Set();
let queue=[];                 // 等待天梯配對
const rooms=new Map();        // code -> client
let matchN=1;

const send=(ws,t,d)=>{ if(ws.readyState===1)ws.send(JSON.stringify({t,d})); };
const rec=n=>acc[n.toLowerCase()];

function expected(a,b){return 1/(1+Math.pow(10,(b-a)/400));}
function applyElo(wn,ln){
  const w=rec(wn), l=rec(ln); if(!w||!l)return;
  const K=32, ew=expected(w.rating,l.rating);
  w.rating=Math.round(w.rating+K*(1-ew));
  l.rating=Math.max(100,Math.round(l.rating+K*(0-(1-ew))));
  w.wins=(w.wins||0)+1; l.losses=(l.losses||0)+1;
  saveSoon();
}
function board(){
  return Object.values(acc)
    .map(a=>({name:a.name,rating:a.rating,wins:a.wins||0,losses:a.losses||0}))
    .sort((x,y)=>y.rating-x.rating).slice(0,20);
}

/* ---------------- 對戰 ---------------- */
function startMatch(a,b,size){
  const seed=crypto.randomBytes(4).readUInt32BE(0);
  const m={id:matchN++,seed,size,p:[a,b],acts:[null,null],turn:0,result:[null,null],timer:null,done:false};
  a.match=m;b.match=m;a.side=0;b.side=1;
  a.inQueue=b.inQueue=false;
  const info=(self,foe,side)=>({seed,size,side,
    you:{name:self.name,rating:rec(self.name).rating},
    foe:{name:foe.name,rating:rec(foe.name).rating,team:foe.team}});
  send(a.ws,'match',info(a,b,0));
  send(b.ws,'match',info(b,a,1));
  console.log(`[match#${m.id}] ${a.name} vs ${b.name} (size ${size}, seed ${seed})`);
  armTimer(m);
}
function armTimer(m){
  clearTimeout(m.timer);
  m.timer=setTimeout(()=>{
    if(m.done)return;
    // 逾時者以「第一招」代打,避免整場卡住
    for(let i=0;i<2;i++)if(!m.acts[i]){
      m.acts[i]=[{t:'move',mv:0,tg:[1-i,0]}];
      send(m.p[i].ws,'note',{msg:'思考逾時,已自動出招'});
    }
    resolveTurn(m);
  },TURN_TIMEOUT);
}
function resolveTurn(m){
  if(m.done||!m.acts[0]||!m.acts[1])return;
  clearTimeout(m.timer);
  const payload={turn:m.turn,acts:[m.acts[0],m.acts[1]]};
  m.acts=[null,null];m.turn++;
  m.p.forEach(c=>send(c.ws,'turn',payload));
  armTimer(m);
}
function endMatch(m,winnerSide,reason){
  if(m.done)return;
  m.done=true;clearTimeout(m.timer);
  const names=m.p.map(c=>c.name);
  if(winnerSide===0||winnerSide===1)applyElo(names[winnerSide],names[1-winnerSide]);
  m.p.forEach((c,i)=>{
    const r=rec(c.name);
    send(c.ws,'matchEnd',{win:winnerSide===i,draw:winnerSide===null,
      rating:r?r.rating:1000,reason:reason||''});
    c.match=null;c.side=null;
  });
  console.log(`[match#${m.id}] end — ${winnerSide===null?'draw':names[winnerSide]+' wins'} (${reason||'agreed'})`);
}

/* ---------------- WS ---------------- */
wss.on('connection',ws=>{
  const c={ws,name:null,team:null,match:null,side:null,inQueue:false,room:null};
  clients.add(c);

  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw);}catch(e){return;}
    const d=m.d||{};
    try{ handle(c,m.t,d); }catch(e){ send(ws,'err',{msg:e.message}); }
  });
  ws.on('close',()=>{
    clients.delete(c);
    queue=queue.filter(x=>x!==c);
    if(c.room)rooms.delete(c.room);
    if(c.match&&!c.match.done)endMatch(c.match,1-c.side,'對手斷線');
  });
  send(ws,'hello',{online:clients.size});
});

function handle(c,t,d){
  switch(t){
   case 'rules':{                       // 客戶端上傳白名單(僅第一次生效)
     if(!LEGAL&&d&&d.sp&&d.mv)LEGAL={sp:d.sp,mv:d.mv,it:d.it||{}};
     send(c.ws,'ok',{t:'rules'});break;
   }
   case 'register':{
     const n=String(d.name||'').trim();
     if(!/^[\w一-龥]{2,10}$/.test(n))return send(c.ws,'err',{msg:'名稱需 2–10 字(中英數)'});
     if(String(d.pass||'').length<4)return send(c.ws,'err',{msg:'密碼至少 4 字'});
     if(rec(n))return send(c.ws,'err',{msg:'這個名稱已被使用'});
     const salt=newSalt();
     acc[n.toLowerCase()]={name:n,salt,pw:hash(d.pass,salt),rating:1000,wins:0,losses:0,
       created:new Date().toISOString()};
     saveSoon();
     c.name=n;
     send(c.ws,'me',{name:n,rating:1000,wins:0,losses:0});break;
   }
   case 'login':{
     const r=rec(String(d.name||''));
     if(!r||r.pw!==hash(d.pass||'',r.salt))return send(c.ws,'err',{msg:'名稱或密碼錯誤'});
     for(const o of clients)if(o!==c&&o.name===r.name){o.ws.close();}
     c.name=r.name;
     send(c.ws,'me',{name:r.name,rating:r.rating,wins:r.wins||0,losses:r.losses||0});break;
   }
   case 'board': send(c.ws,'board',{list:board(),online:clients.size});break;

   case 'queue':{
     if(!c.name)return send(c.ws,'err',{msg:'請先登入'});
     if(c.match)return send(c.ws,'err',{msg:'你正在對戰中'});
     const team=sanitizeTeam(d.team);
     if(!team)return send(c.ws,'err',{msg:'隊伍不合法(至少 1 隻、需有招式)'});
     c.team=team;c.size=d.size===2?2:1;
     queue=queue.filter(x=>x!==c);
     const i=queue.findIndex(x=>x.size===c.size&&x.ws.readyState===1&&x.name!==c.name);
     if(i>=0){const o=queue.splice(i,1)[0];startMatch(o,c,c.size);}
     else{queue.push(c);c.inQueue=true;send(c.ws,'queued',{n:queue.length,size:c.size});}
     break;
   }
   case 'cancel':
     queue=queue.filter(x=>x!==c);c.inQueue=false;
     if(c.room){rooms.delete(c.room);c.room=null;}
     send(c.ws,'cancelled',{});break;

   case 'room':{                         // 私人房:同一組代碼的兩人配對
     if(!c.name)return send(c.ws,'err',{msg:'請先登入'});
     const code=String(d.code||'').trim().toUpperCase().slice(0,8);
     if(!code)return send(c.ws,'err',{msg:'請輸入房間代碼'});
     const team=sanitizeTeam(d.team);
     if(!team)return send(c.ws,'err',{msg:'隊伍不合法'});
     c.team=team;c.size=d.size===2?2:1;
     const host=rooms.get(code);
     if(host&&host!==c&&host.ws.readyState===1){
       rooms.delete(code);host.room=null;
       startMatch(host,c,Math.max(host.size,c.size));
     }else{
       rooms.set(code,c);c.room=code;
       send(c.ws,'roomWait',{code});
     }
     break;
   }
   case 'act':{
     const m=c.match;if(!m||m.done)return;
     if(d.turn!==m.turn)return send(c.ws,'note',{msg:'回合不同步,已忽略'});
     m.acts[c.side]=Array.isArray(d.acts)?d.acts:[];
     if(m.acts[0]&&m.acts[1])resolveTurn(m);
     break;
   }
   case 'result':{
     const m=c.match;if(!m||m.done)return;
     m.result[c.side]=!!d.win;
     const [r0,r1]=m.result;
     if(r0!==null&&r1!==null){
       if(r0&&!r1)endMatch(m,0);
       else if(r1&&!r0)endMatch(m,1);
       else endMatch(m,null,'雙方結果不一致或平手');
     }else{
       // 只有一邊回報:給對方 8 秒回報,否則採信先回報者
       setTimeout(()=>{
         if(m.done)return;
         const s=m.result;
         if(s[0]!==null&&s[1]===null)endMatch(m,s[0]?0:1,'對手未回報');
         else if(s[1]!==null&&s[0]===null)endMatch(m,s[1]?1:0,'對手未回報');
       },8000);
     }
     break;
   }
   case 'forfeit':{
     const m=c.match;if(m&&!m.done)endMatch(m,1-c.side,'對手投降');break;
   }
   case 'ping': send(c.ws,'pong',{online:clients.size});break;
  }
}

srv.listen(PORT,()=>{
  console.log(`★ 星痕御獸錄 II`);
  console.log(`  遊戲:      http://localhost:${PORT}/`);
  console.log(`  PvP WS:    ws://localhost:${PORT}`);
  console.log(`  帳號檔:    ${DB}`);
});
