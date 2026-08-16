/* ============================================================
   星痕御獸錄 II —— 資料層
   ============================================================ */
"use strict";

/* ---------------- 屬性(可雙屬性) ---------------- */
const TYPE={normal:'常',fire:'火',water:'水',grass:'草',elec:'雷',rock:'岩',mystic:'幻'};
const TCOL={normal:'#b9b6a8',fire:'#ff6b3d',water:'#3da5ff',grass:'#4ecb71',
            elec:'#ffd63d',rock:'#c08a4e',mystic:'#c07dff'};
// 完美循環:每個屬性恰被兩種屬性剋制
const EFF={
  normal:{},
  fire  :{grass:2,mystic:2,water:.5,fire:.5,rock:.5},
  water :{fire:2,rock:2,water:.5,grass:.5},
  grass :{water:2,rock:2,fire:.5,grass:.5,elec:.5},
  elec  :{water:2,mystic:2,rock:.5,grass:.5,elec:.5},
  rock  :{fire:2,elec:2,water:.5,mystic:.5},
  mystic:{grass:2,elec:2,fire:.5,mystic:.5}
};
const eff1=(a,d)=>(EFF[a]&&EFF[a][d])||1;
const effAll=(a,ds)=>ds.reduce((m,d)=>m*eff1(a,d),1);

/* ---------------- 性格 ---------------- */
const NAT=[
 {n:'坦率'},
 {n:'固執',up:'atk',dn:'def'},
 {n:'勇敢',up:'atk',dn:'spd'},
 {n:'大膽',up:'def',dn:'atk'},
 {n:'悠閒',up:'def',dn:'spd'},
 {n:'膽小',up:'spd',dn:'atk'},
 {n:'輕率',up:'spd',dn:'def'}
];

/* ---------------- 特性 ----------------
   hook 一覽(全部選用):
   onEnter(ctx,m)                 上場時
   power(ctx,m,mv,p)->p           自身招式威力修正
   taken(ctx,m,mv,dmg,e)->dmg     自身受到的傷害修正
   absorb(ctx,m,mv)->{heal,stat}  完全免疫某屬性
   contact(ctx,att,def)           被接觸招擊中時(def 的特性)
   stMul(ctx,m,k,v)->v            能力值倍率
   noStatus(st)->bool             免疫異常
   stabMul                        本系加成覆寫
   endTurn(ctx,m)                 回合結束
   switchOut(ctx,m)               換下場
------------------------------------------------- */
const AB={
 blaze     :{n:'猛火',  d:'HP 低於 1/3 時火系招式威力 ×1.5',
   power:(c,m,mv,p)=>mv.t==='fire'&&m.hp<=maxHP(m)/3?p*1.5:p},
 torrent   :{n:'激流',  d:'HP 低於 1/3 時水系招式威力 ×1.5',
   power:(c,m,mv,p)=>mv.t==='water'&&m.hp<=maxHP(m)/3?p*1.5:p},
 overgrow  :{n:'茂盛',  d:'HP 低於 1/3 時草系招式威力 ×1.5',
   power:(c,m,mv,p)=>mv.t==='grass'&&m.hp<=maxHP(m)/3?p*1.5:p},
 surge     :{n:'電磁激流',d:'HP 低於 1/3 時雷系招式威力 ×1.5',
   power:(c,m,mv,p)=>mv.t==='elec'&&m.hp<=maxHP(m)/3?p*1.5:p},
 technician:{n:'技術高手',d:'威力 60 以下的招式威力 ×1.5',
   power:(c,m,mv,p)=>p<=60?p*1.5:p},
 adaptable :{n:'適應力',d:'本系招式加成由 1.5 倍提升為 2 倍',stabMul:2},
 hugepower :{n:'大力士',d:'攻擊力 ×1.5',
   stMul:(c,m,k,v)=>k==='atk'?v*1.5:v},
 thickfat  :{n:'厚脂肪',d:'受到火與水系傷害減半',
   taken:(c,m,mv,d)=>(mv.t==='fire'||mv.t==='water')?d*.5:d},
 solidrock :{n:'堅硬岩石',d:'受到效果絕佳的傷害降低 25%',
   taken:(c,m,mv,d,e)=>e>1?d*.75:d},
 fluffy    :{n:'厚重絨毛',d:'受到接觸類招式傷害減半',
   taken:(c,m,mv,d)=>mv.ct?d*.5:d},
 voltabsorb:{n:'蓄電',  d:'免疫雷系並回復 1/4 HP',
   absorb:(c,m,mv)=>mv.t==='elec'?{heal:.25}:null},
 waterabsorb:{n:'儲水', d:'免疫水系並回復 1/4 HP',
   absorb:(c,m,mv)=>mv.t==='water'?{heal:.25}:null},
 flashfire :{n:'引火',  d:'免疫火系並提升攻擊',
   absorb:(c,m,mv)=>mv.t==='fire'?{stat:'atk',st:1}:null},
 motordrive:{n:'電氣引擎',d:'免疫雷系並提升速度',
   absorb:(c,m,mv)=>mv.t==='elec'?{stat:'spd',st:1}:null},
 sapsipper :{n:'食草',  d:'免疫草系並提升攻擊',
   absorb:(c,m,mv)=>mv.t==='grass'?{stat:'atk',st:1}:null},
 intimidate:{n:'威嚇',  d:'上場時降低對手的攻擊',
   onEnter:(c,m)=>c.foesOf(m).forEach(f=>c.stage(f,'atk',-1,'威嚇'))},
 drought   :{n:'日照',  d:'上場時使天氣變為晴天',onEnter:(c,m)=>c.setWeather('sun',5,m)},
 drizzle   :{n:'降雨',  d:'上場時使天氣變為雨天',onEnter:(c,m)=>c.setWeather('rain',5,m)},
 sandstream:{n:'揚沙',  d:'上場時捲起沙暴',      onEnter:(c,m)=>c.setWeather('sand',5,m)},
 chlorophyll:{n:'葉綠素',d:'晴天時速度加倍',
   stMul:(c,m,k,v)=>k==='spd'&&c.weather.k==='sun'?v*2:v},
 swiftswim :{n:'悠遊自如',d:'雨天時速度加倍',
   stMul:(c,m,k,v)=>k==='spd'&&c.weather.k==='rain'?v*2:v},
 sandrush  :{n:'撥沙',  d:'沙暴時速度加倍',
   stMul:(c,m,k,v)=>k==='spd'&&c.weather.k==='sand'?v*2:v},
 raindish  :{n:'雨盤',  d:'雨天時每回合回復 1/16 HP',
   endTurn:(c,m)=>{if(c.weather.k==='rain')c.heal(m,Math.floor(maxHP(m)/16),'雨盤');}},
 speedboost:{n:'加速',  d:'每回合結束時速度提升',
   endTurn:(c,m)=>c.stage(m,'spd',1,'加速')},
 regenerator:{n:'再生力',d:'換下場時回復 1/3 HP',
   switchOut:(c,m)=>{m.hp=Math.min(maxHP(m),m.hp+Math.floor(maxHP(m)/3));}},
 static    :{n:'靜電',  d:'被接觸類招式擊中時 30% 使對手麻痺',
   contact:(c,a,d)=>{if(c.roll(.3))c.inflict(a,'para','靜電');}},
 flamebody :{n:'火焰之軀',d:'被接觸類招式擊中時 30% 使對手燒傷',
   contact:(c,a,d)=>{if(c.roll(.3))c.inflict(a,'burn','火焰之軀');}},
 poisonpoint:{n:'毒刺', d:'被接觸類招式擊中時 30% 使對手中毒',
   contact:(c,a,d)=>{if(c.roll(.3))c.inflict(a,'psn','毒刺');}},
 roughskin :{n:'粗糙皮膚',d:'被接觸類招式擊中時給予對手 1/8 傷害',
   contact:(c,a,d)=>c.dmgDirect(a,Math.max(1,Math.floor(maxHP(a)/8)),'粗糙皮膚')},
 insomnia  :{n:'不眠',  d:'不會陷入睡眠',noStatus:st=>st==='slp'},
 limber    :{n:'柔軟',  d:'不會陷入麻痺',noStatus:st=>st==='para'},
 waterveil :{n:'水幕',  d:'不會燒傷',    noStatus:st=>st==='burn'},
 immunity  :{n:'免疫',  d:'不會中毒',    noStatus:st=>st==='psn'},
 purebody  :{n:'純淨之軀',d:'不會陷入任何異常狀態',noStatus:()=>true},
 sturdy    :{n:'結實',  d:'滿血時不會被一擊打倒',
   taken:(c,m,mv,d)=>(m.hp===maxHP(m)&&d>=m.hp)?m.hp-1:d},
 guts      :{n:'毅力',  d:'處於異常狀態時攻擊 ×1.5(且不受燒傷減攻)',
   stMul:(c,m,k,v)=>k==='atk'&&m.st?v*1.5:v},
 marvelscale:{n:'神奇鱗片',d:'處於異常狀態時防禦 ×1.5',
   stMul:(c,m,k,v)=>k==='def'&&m.st?v*1.5:v}
};

/* ---------------- 招式 ----------------
   p 威力 / pp / acc 命中(999=必中) / pri 先制 / ct 接觸 / tg 目標
   tg: foe(單體) allfoe(範圍) self ally
   fx: heal buff debuff inflict drain crit recoil weather seed cure protect
------------------------------------------------- */
const SK={
 /* 常 */
 tackle    :{n:'撞擊',    t:'normal',p:40 ,pp:35,acc:100,ct:1},
 quickatk  :{n:'電光石火',t:'normal',p:40 ,pp:30,acc:100,ct:1,pri:1},
 slam      :{n:'猛撞',    t:'normal',p:80 ,pp:15,acc:85 ,ct:1},
 crush     :{n:'蠻力猛擊',t:'normal',p:95 ,pp:10,acc:90 ,ct:1},
 doubleedge:{n:'捨身衝撞',t:'normal',p:120,pp:8 ,acc:95 ,ct:1,fx:{recoil:1/3}},
 starshot  :{n:'高速星星',t:'normal',p:60 ,pp:20,acc:999},
 sharpen   :{n:'磨爪',    t:'normal',p:0  ,pp:20,acc:100,tg:'self',fx:{buff:'atk',st:1}},
 harden    :{n:'硬化',    t:'normal',p:0  ,pp:20,acc:100,tg:'self',fx:{buff:'def',st:1}},
 agility   :{n:'疾風步',  t:'normal',p:0  ,pp:15,acc:100,tg:'self',fx:{buff:'spd',st:2}},
 bulkup    :{n:'健美',    t:'normal',p:0  ,pp:12,acc:100,tg:'self',fx:{buff:'atk',st:1,buff2:'def',st2:1}},
 leer      :{n:'瞪眼',    t:'normal',p:0  ,pp:20,acc:100,fx:{debuff:'def',st:-1,ch:1}},
 recover   :{n:'治癒波動',t:'normal',p:0  ,pp:10,acc:100,tg:'self',fx:{heal:.5}},
 lullaby   :{n:'催眠曲',  t:'normal',p:0  ,pp:10,acc:60 ,fx:{inflict:'slp',ch:1}},
 protect   :{n:'守住',    t:'normal',p:0  ,pp:10,acc:999,pri:4,tg:'self',fx:{protect:1}},

 /* 火 */
 ember     :{n:'火花',    t:'fire',p:45 ,pp:25,acc:100,fx:{inflict:'burn',ch:.1}},
 flamewheel:{n:'火焰輪',  t:'fire',p:60 ,pp:20,acc:100,ct:1,fx:{inflict:'burn',ch:.1}},
 fireclaw  :{n:'烈焰爪',  t:'fire',p:70 ,pp:20,acc:100,ct:1},
 flamethrow:{n:'火焰噴射',t:'fire',p:90 ,pp:12,acc:95 ,fx:{inflict:'burn',ch:.15}},
 heatwave  :{n:'熱風',    t:'fire',p:85 ,pp:10,acc:90 ,tg:'allfoe',fx:{inflict:'burn',ch:.1}},
 inferno   :{n:'大字爆炎',t:'fire',p:120,pp:5 ,acc:82 ,fx:{inflict:'burn',ch:.2}},
 sunnyday  :{n:'大晴天',  t:'fire',p:0  ,pp:8 ,acc:999,tg:'self',fx:{weather:'sun'}},

 /* 水 */
 watergun  :{n:'水槍',    t:'water',p:45 ,pp:25,acc:100},
 bubble    :{n:'泡沫',    t:'water',p:45 ,pp:20,acc:100,fx:{debuff:'spd',st:-1,ch:.5}},
 bubblebeam:{n:'泡泡光線',t:'water',p:65 ,pp:20,acc:100,fx:{debuff:'spd',st:-1,ch:.2}},
 aquapulse :{n:'水波',    t:'water',p:80 ,pp:15,acc:100},
 surf      :{n:'衝浪',    t:'water',p:90 ,pp:10,acc:100,tg:'allfoe'},
 hydro     :{n:'水炮',    t:'water',p:120,pp:5 ,acc:82},
 tidalheal :{n:'潮汐治癒',t:'water',p:0  ,pp:10,acc:100,tg:'self',fx:{heal:.5}},
 raindance :{n:'求雨',    t:'water',p:0  ,pp:8 ,acc:999,tg:'self',fx:{weather:'rain'}},

 /* 草 */
 vinewhip  :{n:'藤鞭',    t:'grass',p:45 ,pp:25,acc:100,ct:1},
 absorb    :{n:'吸取',    t:'grass',p:50 ,pp:15,acc:100,fx:{drain:.5}},
 razorleaf :{n:'飛葉快刀',t:'grass',p:70 ,pp:20,acc:95 ,fx:{crit:.18}},
 seedbomb  :{n:'種子炸彈',t:'grass',p:82 ,pp:15,acc:100},
 petalstorm:{n:'花瓣風暴',t:'grass',p:120,pp:5 ,acc:82 ,tg:'allfoe'},
 spore     :{n:'孢子',    t:'grass',p:0  ,pp:12,acc:88 ,fx:{inflict:'psn',ch:1}},
 leechseed :{n:'寄生種子',t:'grass',p:0  ,pp:10,acc:90 ,fx:{seed:1}},
 synthesis :{n:'光合作用',t:'grass',p:0  ,pp:10,acc:100,tg:'self',fx:{heal:.5,sunHeal:1}},
 aroma     :{n:'芳香治療',t:'grass',p:0  ,pp:10,acc:999,tg:'self',fx:{cureTeam:1}},

 /* 雷 */
 shock     :{n:'電擊',    t:'elec',p:45 ,pp:25,acc:100,fx:{inflict:'para',ch:.1}},
 quickspark:{n:'電光一閃',t:'elec',p:40 ,pp:25,acc:100,ct:1,pri:1},
 chargebeam:{n:'充電光束',t:'elec',p:55 ,pp:15,acc:95 ,fx:{buffSelf:'atk',st:1,ch:.7}},
 thunderbol:{n:'十萬伏特',t:'elec',p:90 ,pp:12,acc:95 ,fx:{inflict:'para',ch:.15}},
 discharge :{n:'放電',    t:'elec',p:80 ,pp:12,acc:100,tg:'allfoe',fx:{inflict:'para',ch:.2}},
 thunder   :{n:'打雷',    t:'elec',p:120,pp:5 ,acc:78 ,fx:{inflict:'para',ch:.3},rainHit:1},
 thunderwav:{n:'電磁波',  t:'elec',p:0  ,pp:15,acc:90 ,fx:{inflict:'para',ch:1}},

 /* 岩 */
 rockthrow :{n:'落石',    t:'rock',p:50 ,pp:25,acc:95},
 rocktomb  :{n:'岩石封鎖',t:'rock',p:55 ,pp:15,acc:95 ,fx:{debuff:'spd',st:-1,ch:1}},
 rockslide :{n:'岩崩',    t:'rock',p:75 ,pp:12,acc:90 ,tg:'allfoe'},
 rockcannon:{n:'岩石炮',  t:'rock',p:85 ,pp:12,acc:90},
 fissure   :{n:'地裂衝擊',t:'rock',p:120,pp:5 ,acc:78},
 ironwall  :{n:'鐵壁',    t:'rock',p:0  ,pp:12,acc:100,tg:'self',fx:{buff:'def',st:2}},
 sandstorm :{n:'沙暴風',  t:'rock',p:0  ,pp:8 ,acc:999,tg:'self',fx:{weather:'sand'}},

 /* 幻 */
 glimmer   :{n:'幻光',    t:'mystic',p:45 ,pp:25,acc:100},
 magicflash:{n:'魔法閃光',t:'mystic',p:80 ,pp:15,acc:999},
 psyshock  :{n:'精神衝擊',t:'mystic',p:85 ,pp:12,acc:95 ,fx:{debuff:'def',st:-1,ch:.3}},
 psychic   :{n:'精神強念',t:'mystic',p:90 ,pp:10,acc:100,fx:{debuff:'def',st:-1,ch:.1}},
 starburst :{n:'星爆',    t:'mystic',p:120,pp:5 ,acc:82 ,tg:'allfoe'},
 mystify   :{n:'幻惑',    t:'mystic',p:0  ,pp:15,acc:100,fx:{debuff:'atk',st:-1,ch:1}},
 hypnobeam :{n:'催眠光',  t:'mystic',p:0  ,pp:10,acc:65 ,fx:{inflict:'slp',ch:1}},
 calmmind  :{n:'冥想',    t:'mystic',p:0  ,pp:12,acc:100,tg:'self',fx:{buff:'atk',st:1,buff2:'def',st2:1}},
 moonheal  :{n:'月光治癒',t:'mystic',p:0  ,pp:10,acc:100,tg:'self',fx:{heal:.5}},
 dreameater:{n:'食夢',    t:'mystic',p:100,pp:8 ,acc:100,fx:{drain:.5,needSlp:1}}
};

/* ---------------- 種族 ----------------
   t 屬性陣列 / b 種族值 / rate 捕獲率 / xp 經驗基數
   ab 可能特性 / evo 進化 / art 外觀 / ls 學習表
------------------------------------------------- */
const SP={
/* === 御三家:火 === */
emberfox:{n:'焰狐',t:['fire'],b:{hp:44,atk:60,def:42,spd:66},rate:150,xp:64,ab:['blaze','flamebody'],
  evo:{to:'blazefox',lv:16},
  art:{body:'quad',c1:'#ff8a4d',c2:'#ffe0b0',ear:'tall',tail:'bushy',eye:'#3a1c0c'},
  ls:[[1,'tackle'],[1,'ember'],[6,'sharpen'],[10,'flamewheel'],[14,'quickatk'],[18,'fireclaw'],
      [23,'agility'],[28,'flamethrow'],[34,'slam'],[42,'inferno']]},
blazefox:{n:'烈焰狐',t:['fire'],b:{hp:60,atk:82,def:58,spd:88},rate:75,xp:142,ab:['blaze','flamebody'],
  evo:{to:'infernofox',lv:34},
  art:{body:'quad',c1:'#ff6a2c',c2:'#ffd08a',c3:'#ffe66b',ear:'tall',tail:'flame',eye:'#5c1a06',size:1.1},
  ls:[[1,'tackle'],[1,'ember'],[1,'sharpen'],[16,'flamewheel'],[20,'fireclaw'],[25,'agility'],
      [30,'flamethrow'],[36,'slam'],[44,'inferno']]},
infernofox:{n:'炎獄天狐',t:['fire','mystic'],b:{hp:80,atk:114,def:78,spd:114},rate:35,xp:242,
  ab:['blaze','drought'],
  art:{body:'quad',c1:'#ff4d18',c2:'#ffc46b',c3:'#fff0a0',ear:'tall',tail:'flame',horn:2,eye:'#ffe9a8',size:1.28},
  ls:[[1,'fireclaw'],[1,'agility'],[1,'glimmer'],[34,'flamethrow'],[38,'psyshock'],[43,'sunnyday'],
      [48,'heatwave'],[54,'inferno']]},

/* === 御三家:水 === */
bubbleturtle:{n:'沫龜',t:['water'],b:{hp:52,atk:50,def:66,spd:40},rate:150,xp:64,ab:['torrent','sturdy'],
  evo:{to:'tideturtle',lv:16},
  art:{body:'quad',c1:'#4fb3ff',c2:'#d3efff',ear:'none',tail:'thin',shell:'#2f6f9e',eye:'#0d2c4a'},
  ls:[[1,'tackle'],[1,'watergun'],[6,'harden'],[11,'bubble'],[15,'bubblebeam'],[19,'aquapulse'],
      [24,'tidalheal'],[30,'ironwall'],[36,'surf'],[44,'hydro']]},
tideturtle:{n:'潮汐龜',t:['water'],b:{hp:70,atk:70,def:92,spd:54},rate:75,xp:142,ab:['torrent','sturdy'],
  evo:{to:'abyssturtle',lv:34},
  art:{body:'quad',c1:'#3a9be0',c2:'#c2e9ff',ear:'fin',tail:'fin',shell:'#20567f',eye:'#08243d',size:1.1},
  ls:[[1,'tackle'],[1,'watergun'],[1,'harden'],[16,'bubblebeam'],[21,'aquapulse'],[27,'tidalheal'],
      [32,'ironwall'],[38,'surf'],[46,'hydro']]},
abyssturtle:{n:'深淵海龜',t:['water','rock'],b:{hp:94,atk:94,def:126,spd:66},rate:35,xp:242,
  ab:['torrent','solidrock'],
  art:{body:'quad',c1:'#2477bd',c2:'#a8dcff',c3:'#7de2ff',ear:'fin',tail:'fin',shell:'#123a5c',horn:2,eye:'#9fe8ff',size:1.3},
  ls:[[1,'aquapulse'],[1,'ironwall'],[1,'tidalheal'],[34,'rockcannon'],[40,'surf'],[45,'rockslide'],
      [50,'fissure'],[56,'hydro']]},

/* === 御三家:草 === */
sproutcat:{n:'芽貓',t:['grass'],b:{hp:48,atk:56,def:50,spd:60},rate:150,xp:64,ab:['overgrow','chlorophyll'],
  evo:{to:'vinecat',lv:16},
  art:{body:'quad',c1:'#6fd47f',c2:'#e6ffd9',ear:'leaf',tail:'leaf',eye:'#173d1c'},
  ls:[[1,'tackle'],[1,'vinewhip'],[6,'absorb'],[10,'leechseed'],[14,'razorleaf'],[19,'spore'],
      [24,'sharpen'],[29,'seedbomb'],[35,'synthesis'],[43,'petalstorm']]},
vinecat:{n:'藤蔓貓',t:['grass'],b:{hp:66,atk:78,def:70,spd:80},rate:75,xp:142,ab:['overgrow','chlorophyll'],
  evo:{to:'forestiger',lv:34},
  art:{body:'quad',c1:'#4cbb62',c2:'#dcffca',c3:'#ffe066',ear:'leaf',tail:'vine',eye:'#0f2f14',size:1.1},
  ls:[[1,'tackle'],[1,'vinewhip'],[1,'absorb'],[16,'razorleaf'],[21,'spore'],[26,'sharpen'],
      [31,'seedbomb'],[37,'synthesis'],[45,'petalstorm']]},
forestiger:{n:'森靈虎',t:['grass','normal'],b:{hp:88,atk:110,def:94,spd:100},rate:35,xp:242,
  ab:['overgrow','intimidate'],
  art:{body:'quad',c1:'#31a24d',c2:'#d0ffbb',c3:'#ffd166',ear:'leaf',tail:'vine',horn:2,stripe:1,eye:'#f3ffb0',size:1.3},
  ls:[[1,'razorleaf'],[1,'spore'],[1,'bulkup'],[34,'crush'],[39,'seedbomb'],[44,'synthesis'],
      [50,'doubleedge'],[56,'petalstorm']]},

/* === 雷鼠系 === */
zaprat:{n:'電鼠',t:['elec'],b:{hp:40,atk:54,def:38,spd:76},rate:190,xp:56,ab:['static','surge'],
  evo:{to:'thunderrat',lv:20},
  art:{body:'round',c1:'#ffe066',c2:'#fff8d0',ear:'tall',tail:'spark',eye:'#3a2c00'},
  ls:[[1,'tackle'],[1,'shock'],[7,'quickspark'],[12,'thunderwav'],[17,'chargebeam'],[22,'agility'],
      [28,'thunderbol'],[36,'thunder']]},
thunderrat:{n:'雷霆鼠',t:['elec'],b:{hp:58,atk:84,def:56,spd:106},rate:70,xp:150,ab:['static','surge'],
  art:{body:'round',c1:'#ffd42e',c2:'#fff4b0',c3:'#ff8a3d',ear:'tall',tail:'spark',eye:'#4a3200',size:1.15},
  ls:[[1,'quickspark'],[1,'shock'],[1,'thunderwav'],[24,'chargebeam'],[29,'agility'],[34,'thunderbol'],
      [40,'discharge'],[48,'thunder']]},

/* === 石甲蟲系 === */
rockbug:{n:'石甲蟲',t:['rock'],b:{hp:52,atk:52,def:78,spd:32},rate:180,xp:60,ab:['sturdy','roughskin'],
  evo:{to:'armorbug',lv:22},
  art:{body:'bug',c1:'#a8834f',c2:'#e0c79a',ear:'none',eye:'#2a1c0a'},
  ls:[[1,'tackle'],[1,'rockthrow'],[8,'harden'],[14,'rocktomb'],[20,'ironwall'],[26,'rockslide'],
      [32,'rockcannon'],[40,'fissure']]},
armorbug:{n:'岩鎧甲蟲',t:['rock'],b:{hp:74,atk:78,def:122,spd:44},rate:60,xp:160,ab:['sturdy','solidrock'],
  art:{body:'bug',c1:'#8a6a3c',c2:'#d4b57e',c3:'#6f7f8f',horn:2,eye:'#150e04',size:1.2},
  ls:[[1,'rockthrow'],[1,'harden'],[1,'rocktomb'],[24,'ironwall'],[30,'rockslide'],[36,'rockcannon'],
      [42,'crush'],[50,'fissure']]},

/* === 幻靈系 === */
wispling:{n:'幻靈',t:['mystic'],b:{hp:44,atk:58,def:44,spd:62},rate:170,xp:62,ab:['insomnia','purebody'],
  evo:{to:'dreamwisp',lv:24},
  art:{body:'blob',c1:'#b07dff',c2:'#efe0ff',eye:'#fff'},
  ls:[[1,'glimmer'],[1,'mystify'],[9,'hypnobeam'],[15,'starshot'],[21,'calmmind'],[26,'psyshock'],
      [32,'moonheal'],[38,'dreameater'],[45,'starburst']]},
dreamwisp:{n:'幻夢靈',t:['mystic'],b:{hp:64,atk:90,def:66,spd:90},rate:55,xp:158,ab:['insomnia','purebody'],
  art:{body:'blob',c1:'#8f4dff',c2:'#e2c8ff',c3:'#7de2ff',horn:1,eye:'#fff8d0',size:1.2},
  ls:[[1,'glimmer'],[1,'mystify'],[1,'hypnobeam'],[26,'calmmind'],[31,'psyshock'],[37,'moonheal'],
      [43,'dreameater'],[50,'starburst']]},

/* === 火蜥系 === */
cinderlizard:{n:'火蜥',t:['fire'],b:{hp:50,atk:66,def:48,spd:52},rate:160,xp:62,ab:['blaze','guts'],
  evo:{to:'magmalizard',lv:22},
  art:{body:'quad',c1:'#e05a2c',c2:'#ffc188',ear:'none',tail:'thin',eye:'#ffd166'},
  ls:[[1,'tackle'],[1,'ember'],[9,'sharpen'],[15,'flamewheel'],[20,'fireclaw'],[25,'harden'],
      [31,'flamethrow'],[40,'inferno']]},
magmalizard:{n:'熔岩蜥',t:['fire','rock'],b:{hp:72,atk:98,def:74,spd:66},rate:55,xp:164,ab:['blaze','flamebody'],
  art:{body:'quad',c1:'#c93c14',c2:'#ff9a4d',c3:'#ffe066',ear:'none',tail:'flame',horn:2,stripe:1,eye:'#fff0a0',size:1.22},
  ls:[[1,'fireclaw'],[1,'ember'],[1,'harden'],[24,'flamethrow'],[30,'rockslide'],[36,'rockcannon'],
      [42,'crush'],[49,'inferno']]},

/* === 水母系 === */
jellypup:{n:'水母仔',t:['water'],b:{hp:56,atk:46,def:52,spd:58},rate:180,xp:58,ab:['waterabsorb','raindish'],
  evo:{to:'abyssjelly',lv:20},
  art:{body:'blob',c1:'#5fd0e8',c2:'#d9fbff',tent:1,eye:'#0b3a45'},
  ls:[[1,'watergun'],[1,'bubble'],[8,'harden'],[14,'bubblebeam'],[20,'tidalheal'],[26,'psyshock'],
      [32,'raindance'],[38,'surf'],[45,'hydro']]},
abyssjelly:{n:'深海水母',t:['water','mystic'],b:{hp:82,atk:72,def:80,spd:84},rate:60,xp:158,
  ab:['waterabsorb','swiftswim'],
  art:{body:'blob',c1:'#2f9fc4',c2:'#bff4ff',c3:'#c07dff',tent:1,eye:'#e7fbff',size:1.2},
  ls:[[1,'aquapulse'],[1,'bubblebeam'],[1,'tidalheal'],[22,'psyshock'],[28,'raindance'],[34,'glimmer'],
      [40,'surf'],[47,'starburst'],[54,'hydro']]},

/* === 花鹿系 === */
budeer:{n:'花苞鹿',t:['grass'],b:{hp:56,atk:54,def:56,spd:56},rate:175,xp:60,ab:['overgrow','sapsipper'],
  evo:{to:'bloomdeer',lv:22},
  art:{body:'quad',c1:'#8fce6a',c2:'#f2ffe0',c3:'#ff8fb0',ear:'tall',tail:'thin',horn:2,eye:'#2b3a12'},
  ls:[[1,'tackle'],[1,'vinewhip'],[8,'absorb'],[14,'razorleaf'],[20,'recover'],[26,'leechseed'],
      [32,'seedbomb'],[40,'petalstorm']]},
bloomdeer:{n:'花冠鹿',t:['grass'],b:{hp:80,atk:78,def:84,spd:80},rate:58,xp:160,ab:['chlorophyll','sapsipper'],
  art:{body:'quad',c1:'#6cb84a',c2:'#eaffd4',c3:'#ff6fa0',ear:'leaf',tail:'leaf',horn:2,eye:'#1c2f0a',size:1.22},
  ls:[[1,'razorleaf'],[1,'absorb'],[1,'recover'],[24,'aroma'],[30,'seedbomb'],[36,'synthesis'],
      [42,'starshot'],[49,'petalstorm']]},

/* === 雷雀系 === */
sparkbird:{n:'雷雀',t:['elec'],b:{hp:44,atk:58,def:40,spd:80},rate:170,xp:60,ab:['static','speedboost'],
  evo:{to:'stormhawk',lv:24},
  art:{body:'bird',c1:'#ffd63d',c2:'#fff5c4',c3:'#5cc8ff',wing:1,eye:'#3a2c00'},
  ls:[[1,'tackle'],[1,'shock'],[8,'quickspark'],[14,'starshot'],[20,'agility'],[26,'chargebeam'],
      [32,'thunderbol'],[40,'thunder']]},
stormhawk:{n:'暴雷鷹',t:['elec','normal'],b:{hp:68,atk:98,def:64,spd:110},rate:50,xp:170,
  ab:['static','intimidate'],
  art:{body:'bird',c1:'#f2b21e',c2:'#fff0b0',c3:'#7de2ff',wing:1,horn:1,eye:'#fff',size:1.25},
  ls:[[1,'quickspark'],[1,'shock'],[1,'agility'],[26,'chargebeam'],[32,'thunderbol'],[38,'discharge'],
      [44,'doubleedge'],[52,'thunder']]},

/* === 砂岩系 === */
sandbeast:{n:'砂岩獸',t:['rock'],b:{hp:66,atk:70,def:70,spd:44},rate:160,xp:64,ab:['sandrush','sturdy'],
  evo:{to:'titanbeast',lv:30},
  art:{body:'quad',c1:'#c9a468',c2:'#f0dfb8',ear:'round',tail:'thin',stripe:1,eye:'#3a2a0e'},
  ls:[[1,'tackle'],[1,'rockthrow'],[10,'harden'],[16,'rocktomb'],[22,'sandstorm'],[28,'rockslide'],
      [34,'rockcannon'],[43,'fissure']]},
titanbeast:{n:'巨岩獸',t:['rock'],b:{hp:100,atk:106,def:110,spd:56},rate:35,xp:226,ab:['sandstream','solidrock'],
  art:{body:'quad',c1:'#9c7c46',c2:'#e2cd9c',c3:'#7e8c9c',ear:'round',tail:'thin',horn:2,stripe:1,eye:'#ffd166',size:1.35},
  ls:[[1,'rockcannon'],[1,'ironwall'],[1,'rocktomb'],[32,'sandstorm'],[38,'rockslide'],[44,'bulkup'],
      [50,'crush'],[56,'fissure']]},

/* === 星兔系 === */
starbunny:{n:'星光兔',t:['mystic'],b:{hp:48,atk:50,def:48,spd:70},rate:180,xp:58,ab:['purebody','speedboost'],
  evo:{to:'lunarabbit',lv:26},
  art:{body:'round',c1:'#dcd0ff',c2:'#fff',c3:'#ffd166',ear:'tall',tail:'puff',eye:'#4a3a72'},
  ls:[[1,'tackle'],[1,'glimmer'],[8,'agility'],[14,'starshot'],[20,'moonheal'],[26,'calmmind'],
      [32,'psyshock'],[38,'starburst']]},
lunarabbit:{n:'月華兔',t:['mystic'],b:{hp:72,atk:84,def:72,spd:102},rate:50,xp:170,ab:['purebody','adaptable'],
  art:{body:'round',c1:'#b9a8ff',c2:'#fffbe8',c3:'#ffe066',ear:'tall',tail:'puff',horn:1,eye:'#2e2050',size:1.2},
  ls:[[1,'glimmer'],[1,'agility'],[1,'moonheal'],[28,'calmmind'],[34,'psychic'],[40,'starshot'],
      [46,'hypnobeam'],[54,'starburst']]},

/* === 火馬系(新) === */
emberfoal:{n:'焰蹄駒',t:['fire'],b:{hp:54,atk:68,def:50,spd:78},rate:150,xp:66,ab:['flamebody','flashfire'],
  evo:{to:'blazesteed',lv:26},
  art:{body:'quad',c1:'#ff9b3d',c2:'#ffe7bd',c3:'#ff5d3d',ear:'tall',tail:'flame',eye:'#4a2000'},
  ls:[[1,'tackle'],[1,'ember'],[10,'quickatk'],[16,'flamewheel'],[22,'agility'],[28,'fireclaw'],
      [34,'flamethrow'],[42,'inferno']]},
blazesteed:{n:'烈焰戰馬',t:['fire'],b:{hp:76,atk:104,def:72,spd:112},rate:48,xp:176,ab:['flamebody','drought'],
  art:{body:'quad',c1:'#ff6f24',c2:'#ffd9a0',c3:'#fff0a0',ear:'tall',tail:'flame',horn:1,stripe:1,eye:'#fff',size:1.3},
  ls:[[1,'flamewheel'],[1,'quickatk'],[1,'agility'],[28,'fireclaw'],[34,'flamethrow'],[40,'sunnyday'],
      [46,'heatwave'],[54,'inferno']]},

/* === 鳳凰系(新,稀有) === */
flarechick:{n:'熾炎雛鳥',t:['fire'],b:{hp:50,atk:62,def:52,spd:64},rate:60,xp:80,ab:['blaze','flamebody'],
  evo:{to:'phoenixia',lv:36},
  art:{body:'bird',c1:'#ff7a3d',c2:'#ffe0a8',c3:'#ffd166',wing:1,eye:'#5a2000'},
  ls:[[1,'ember'],[1,'tackle'],[12,'flamewheel'],[18,'starshot'],[24,'recover'],[30,'flamethrow'],
      [36,'sunnyday'],[44,'heatwave'],[50,'inferno']]},
phoenixia:{n:'不死鳳凰',t:['fire','mystic'],b:{hp:92,atk:112,def:88,spd:104},rate:12,xp:270,ab:['drought','purebody'],
  art:{body:'bird',c1:'#ff5518',c2:'#ffd48a',c3:'#fff0a0',wing:1,horn:2,eye:'#fff',size:1.35},
  ls:[[1,'flamethrow'],[1,'recover'],[1,'calmmind'],[38,'psychic'],[44,'sunnyday'],[50,'heatwave'],
      [56,'starburst'],[60,'inferno']]},

/* === 洪流系(新) === */
dropsprite:{n:'水滴精',t:['water'],b:{hp:50,atk:48,def:54,spd:62},rate:170,xp:60,ab:['waterabsorb','swiftswim'],
  evo:{to:'floodbeast',lv:28},
  art:{body:'blob',c1:'#59c8ff',c2:'#e0f8ff',eye:'#0a3550'},
  ls:[[1,'watergun'],[1,'tackle'],[9,'bubble'],[15,'bubblebeam'],[21,'raindance'],[27,'aquapulse'],
      [33,'surf'],[42,'hydro']]},
floodbeast:{n:'洪流巨獸',t:['water'],b:{hp:104,atk:96,def:92,spd:62},rate:45,xp:184,ab:['drizzle','thickfat'],
  art:{body:'quad',c1:'#2b7fc4',c2:'#b5e8ff',c3:'#7de2ff',ear:'fin',tail:'fin',horn:2,eye:'#d8f6ff',size:1.38},
  ls:[[1,'aquapulse'],[1,'raindance'],[1,'harden'],[30,'surf'],[36,'ironwall'],[42,'crush'],
      [48,'rockslide'],[56,'hydro']]},

/* === 沼澤系(新,雙屬性) === */
mossfrog:{n:'苔蘚蛙',t:['water','grass'],b:{hp:58,atk:56,def:56,spd:50},rate:175,xp:64,ab:['waterabsorb','overgrow'],
  evo:{to:'swamplord',lv:28},
  art:{body:'round',c1:'#5fb98a',c2:'#dcf8e0',c3:'#4a8f5c',ear:'none',tail:'none',eye:'#123522'},
  ls:[[1,'tackle'],[1,'watergun'],[9,'absorb'],[15,'bubble'],[21,'leechseed'],[27,'razorleaf'],
      [33,'aquapulse'],[40,'seedbomb'],[48,'surf']]},
swamplord:{n:'沼澤霸王',t:['water','grass'],b:{hp:96,atk:98,def:96,spd:58},rate:42,xp:186,ab:['drizzle','marvelscale'],
  art:{body:'quad',c1:'#3f8f68',c2:'#c6ecc8',c3:'#7de2b0',ear:'fin',tail:'vine',horn:2,stripe:1,eye:'#eafff0',size:1.35},
  ls:[[1,'aquapulse'],[1,'razorleaf'],[1,'leechseed'],[30,'seedbomb'],[36,'surf'],[42,'synthesis'],
      [48,'crush'],[56,'petalstorm']]},

/* === 麥穗系(新) === */
seedmouse:{n:'種子鼠',t:['grass','normal'],b:{hp:46,atk:52,def:44,spd:68},rate:200,xp:52,ab:['technician','chlorophyll'],
  evo:{to:'wheatbeast',lv:24},
  art:{body:'round',c1:'#d8cf7a',c2:'#fff6d0',c3:'#8fce6a',ear:'round',tail:'thin',eye:'#3a3410'},
  ls:[[1,'tackle'],[1,'absorb'],[7,'quickatk'],[13,'vinewhip'],[19,'razorleaf'],[25,'seedbomb'],
      [31,'agility'],[39,'petalstorm']]},
wheatbeast:{n:'麥穗獸',t:['grass','normal'],b:{hp:74,atk:88,def:70,spd:96},rate:60,xp:162,ab:['technician','guts'],
  art:{body:'quad',c1:'#c4b455',c2:'#fdf3c0',c3:'#7dbd5c',ear:'leaf',tail:'leaf',stripe:1,eye:'#2e2a08',size:1.2},
  ls:[[1,'quickatk'],[1,'razorleaf'],[1,'agility'],[26,'seedbomb'],[32,'crush'],[38,'synthesis'],
      [44,'doubleedge'],[52,'petalstorm']]},

/* === 磁石系(新,雙屬性) === */
magball:{n:'磁石球',t:['elec','rock'],b:{hp:44,atk:56,def:72,spd:48},rate:170,xp:62,ab:['sturdy','static'],
  evo:{to:'trimagnet',lv:28},
  art:{body:'blob',c1:'#9fb4c8',c2:'#e4eef6',c3:'#ff5d6c',eye:'#0e1620'},
  ls:[[1,'tackle'],[1,'shock'],[9,'harden'],[15,'rockthrow'],[21,'thunderwav'],[27,'chargebeam'],
      [33,'rockcannon'],[41,'thunderbol']]},
trimagnet:{n:'三連磁石',t:['elec','rock'],b:{hp:66,atk:90,def:104,spd:66},rate:48,xp:174,ab:['sturdy','motordrive'],
  art:{body:'blob',c1:'#8298ad',c2:'#dbe8f2',c3:'#5cc8ff',horn:2,eye:'#0a1018',size:1.24},
  ls:[[1,'chargebeam'],[1,'rockthrow'],[1,'ironwall'],[30,'rockcannon'],[36,'thunderbol'],[42,'discharge'],
      [48,'rockslide'],[56,'thunder']]},

/* === 雷犬系(新) === */
sparkpup:{n:'雷光犬',t:['elec'],b:{hp:52,atk:64,def:48,spd:82},rate:165,xp:66,ab:['intimidate','static'],
  evo:{to:'boltHound',lv:30},
  art:{body:'quad',c1:'#ffd14d',c2:'#fff4c8',c3:'#3a3a4a',ear:'tall',tail:'spark',stripe:1,eye:'#2e2400'},
  ls:[[1,'tackle'],[1,'shock'],[10,'quickspark'],[16,'leer'],[22,'agility'],[28,'chargebeam'],
      [34,'thunderbol'],[43,'thunder']]},
boltHound:{n:'疾雷獵犬',t:['elec'],b:{hp:76,atk:106,def:70,spd:114},rate:42,xp:180,ab:['intimidate','motordrive'],
  art:{body:'quad',c1:'#f0b428',c2:'#fff0b8',c3:'#242430',ear:'tall',tail:'spark',horn:2,stripe:1,eye:'#fff',size:1.3},
  ls:[[1,'quickspark'],[1,'agility'],[1,'leer'],[32,'chargebeam'],[38,'thunderbol'],[44,'discharge'],
      [50,'crush'],[58,'thunder']]},

/* === 稜光蝶系(新,三階) === */
crystalarva:{n:'水晶蟲',t:['rock'],b:{hp:46,atk:40,def:60,spd:34},rate:200,xp:48,ab:['sturdy','purebody'],
  evo:{to:'prismcocoon',lv:12},
  art:{body:'bug',c1:'#9fd8e8',c2:'#e8fbff',eye:'#123844'},
  ls:[[1,'tackle'],[1,'harden'],[6,'rockthrow'],[10,'glimmer']]},
prismcocoon:{n:'結晶蛹',t:['rock'],b:{hp:60,atk:44,def:88,spd:36},rate:110,xp:80,ab:['sturdy','purebody'],
  evo:{to:'prismwing',lv:26},
  art:{body:'blob',c1:'#8fcfe0',c2:'#dff8ff',c3:'#c07dff',eye:'#0e2c36',size:1.08},
  ls:[[1,'harden'],[1,'rockthrow'],[1,'glimmer'],[16,'ironwall'],[20,'rocktomb'],[24,'magicflash']]},
prismwing:{n:'稜光蝶',t:['rock','mystic'],b:{hp:78,atk:96,def:92,spd:100},rate:45,xp:196,ab:['adaptable','purebody'],
  art:{body:'bird',c1:'#7de2ff',c2:'#eafcff',c3:'#c07dff',wing:1,horn:2,eye:'#fff',size:1.26},
  ls:[[1,'magicflash'],[1,'ironwall'],[1,'calmmind'],[28,'psyshock'],[34,'rockslide'],[40,'psychic'],
      [46,'rockcannon'],[54,'starburst']]},

/* === 幽影系(新) === */
shadecat:{n:'幽影貓',t:['mystic'],b:{hp:48,atk:66,def:46,spd:74},rate:165,xp:64,ab:['insomnia','intimidate'],
  evo:{to:'nightwraith',lv:28},
  art:{body:'quad',c1:'#4a3f6b',c2:'#8f7fc0',c3:'#c07dff',ear:'tall',tail:'thin',eye:'#ffd166'},
  ls:[[1,'tackle'],[1,'glimmer'],[10,'mystify'],[16,'hypnobeam'],[22,'quickatk'],[28,'psyshock'],
      [34,'dreameater'],[43,'psychic']]},
nightwraith:{n:'暗夜魅影',t:['mystic'],b:{hp:70,atk:108,def:68,spd:104},rate:40,xp:184,ab:['insomnia','adaptable'],
  art:{body:'blob',c1:'#33284f',c2:'#7a68a8',c3:'#ff5d6c',horn:2,eye:'#ffe066',size:1.26},
  ls:[[1,'psyshock'],[1,'hypnobeam'],[1,'calmmind'],[30,'dreameater'],[36,'psychic'],[42,'mystify'],
      [48,'magicflash'],[56,'starburst']]},

/* === 火山鼴系(新,雙屬性) === */
magmamole:{n:'熔岩鼴',t:['fire','rock'],b:{hp:58,atk:66,def:60,spd:46},rate:170,xp:66,ab:['flashfire','sandrush'],
  evo:{to:'volcanomole',lv:30},
  art:{body:'quad',c1:'#8f5a3c',c2:'#ffb07a',c3:'#ff6b3d',ear:'round',tail:'thin',stripe:1,eye:'#ffd166'},
  ls:[[1,'tackle'],[1,'ember'],[10,'rockthrow'],[16,'harden'],[22,'flamewheel'],[28,'rocktomb'],
      [34,'rockslide'],[42,'flamethrow']]},
volcanomole:{n:'火山鼴',t:['fire','rock'],b:{hp:88,atk:104,def:96,spd:60},rate:40,xp:188,ab:['flamebody','sandstream'],
  art:{body:'quad',c1:'#6b3a24',c2:'#ff8a4d',c3:'#ffe066',ear:'round',tail:'flame',horn:2,stripe:1,eye:'#fff0a0',size:1.34},
  ls:[[1,'flamewheel'],[1,'rockslide'],[1,'ironwall'],[32,'rockcannon'],[38,'flamethrow'],[44,'sandstorm'],
      [50,'crush'],[58,'inferno']]},

/* === 疾風系(新) === */
windsparrow:{n:'疾風雀',t:['normal'],b:{hp:46,atk:56,def:44,spd:78},rate:200,xp:54,ab:['speedboost','technician'],
  evo:{to:'galefalcon',lv:26},
  art:{body:'bird',c1:'#cfd8e4',c2:'#f4f9ff',c3:'#8fa3c7',wing:1,eye:'#2a3340'},
  ls:[[1,'tackle'],[1,'quickatk'],[8,'leer'],[14,'starshot'],[20,'agility'],[26,'slam'],
      [32,'crush'],[40,'doubleedge']]},
galefalcon:{n:'颶風隼',t:['normal'],b:{hp:72,atk:100,def:66,spd:114},rate:50,xp:172,ab:['speedboost','intimidate'],
  art:{body:'bird',c1:'#a8b8cc',c2:'#eef5ff',c3:'#5cc8ff',wing:1,horn:1,eye:'#fff',size:1.26},
  ls:[[1,'quickatk'],[1,'agility'],[1,'leer'],[28,'slam'],[34,'crush'],[40,'protect'],
      [46,'starshot'],[54,'doubleedge']]},

/* === 遺跡守衛系(新,雙屬性) === */
stonedoll:{n:'巨石人偶',t:['rock','mystic'],b:{hp:60,atk:58,def:84,spd:36},rate:150,xp:70,ab:['sturdy','purebody'],
  evo:{to:'ruinguard',lv:32},
  art:{body:'quad',c1:'#8f8f9c',c2:'#d0d0dc',c3:'#c07dff',ear:'none',tail:'none',horn:2,eye:'#7de2ff'},
  ls:[[1,'tackle'],[1,'rockthrow'],[10,'harden'],[16,'glimmer'],[22,'ironwall'],[28,'magicflash'],
      [34,'rockslide'],[42,'psyshock']]},
ruinguard:{n:'遺跡守衛',t:['rock','mystic'],b:{hp:92,atk:92,def:126,spd:52},rate:32,xp:210,ab:['solidrock','marvelscale'],
  art:{body:'quad',c1:'#6f6f80',c2:'#c4c4d4',c3:'#7de2ff',ear:'none',tail:'none',horn:2,stripe:1,eye:'#ffe066',size:1.4},
  ls:[[1,'magicflash'],[1,'ironwall'],[1,'rockslide'],[34,'psyshock'],[40,'calmmind'],[46,'rockcannon'],
      [52,'psychic'],[58,'fissure']]},

/* === 傳說 === */
astradragon:{n:'星辰龍',t:['mystic','elec'],b:{hp:106,atk:122,def:100,spd:118},rate:4,xp:330,
  ab:['adaptable','purebody'],
  art:{body:'serp',c1:'#6a5cff',c2:'#c8bcff',c3:'#ffe066',wing:1,horn:2,eye:'#fff'},
  ls:[[1,'glimmer'],[1,'psyshock'],[1,'agility'],[1,'calmmind'],[46,'thunderbol'],[52,'psychic'],
      [56,'discharge'],[60,'starburst']]},
volcanor:{n:'炎獄魔像',t:['rock','fire'],b:{hp:112,atk:120,def:114,spd:58},rate:6,xp:320,
  ab:['sandstream','flamebody'],
  art:{body:'quad',c1:'#7a4a2a',c2:'#ff7a3d',c3:'#ffd166',horn:2,stripe:1,ear:'none',tail:'flame',eye:'#ffe066',size:1.42},
  ls:[[1,'rockcannon'],[1,'fireclaw'],[1,'ironwall'],[1,'flamethrow'],[48,'rockslide'],[54,'sandstorm'],
      [58,'fissure'],[60,'inferno']]},
abyssking:{n:'深淵海皇',t:['water','mystic'],b:{hp:110,atk:116,def:110,spd:104},rate:4,xp:334,
  ab:['drizzle','swiftswim'],
  art:{body:'serp',c1:'#1f6fa8',c2:'#a8e4ff',c3:'#7de2ff',wing:1,horn:2,eye:'#fff'},
  ls:[[1,'aquapulse'],[1,'calmmind'],[1,'raindance'],[1,'psyshock'],[48,'surf'],[54,'psychic'],
      [58,'starburst'],[60,'hydro']]},
thunderlord:{n:'雷霆神獸',t:['elec','normal'],b:{hp:108,atk:124,def:98,spd:124},rate:4,xp:336,
  ab:['motordrive','speedboost'],
  art:{body:'quad',c1:'#ffcf28',c2:'#fff6c8',c3:'#5cc8ff',ear:'tall',tail:'spark',horn:2,stripe:1,eye:'#fff',size:1.42},
  ls:[[1,'thunderbol'],[1,'agility'],[1,'crush'],[1,'leer'],[48,'discharge'],[54,'doubleedge'],
      [58,'protect'],[60,'thunder']]}
};
const SPIDS=Object.keys(SP);
// 沿進化鏈往回找最原始的型態(配種後代恆為未進化型)
function baseOf(id){
  for(const k in SP){ if(SP[k].evo&&SP[k].evo.to===id)return baseOf(k); }
  return id;
}

/* ---------------- 道具 ---------------- */
const ITEM={
 ball      :{n:'精靈球',  ic:'🔴',price:200 ,d:'基本捕獸球',           k:'ball',m:1},
 greatball :{n:'高級球',  ic:'🔵',price:600 ,d:'捕獲率 ×1.5',          k:'ball',m:1.5},
 ultraball :{n:'超級球',  ic:'🟡',price:1300,d:'捕獲率 ×2.2',          k:'ball',m:2.2},
 duskball  :{n:'暗夜球',  ic:'⚫',price:1600,d:'對手等級高於你時 ×3',  k:'ball',m:2.2,dusk:1},
 masterball:{n:'大師球',  ic:'🟣',price:0   ,d:'必定捕獲,無法購買',   k:'ball',m:255},
 potion    :{n:'傷藥',    ic:'🧪',price:300 ,d:'回復 60 HP',           k:'heal',v:60},
 spotion   :{n:'好傷藥',  ic:'💉',price:800 ,d:'回復 180 HP',          k:'heal',v:180},
 hpotion   :{n:'全滿藥',  ic:'🍶',price:1800,d:'回復全部 HP',          k:'heal',v:9999},
 antidote  :{n:'萬能藥',  ic:'🍬',price:400 ,d:'解除所有異常狀態',     k:'cure'},
 revive    :{n:'復活草',  ic:'🌿',price:2000,d:'讓瀕死御獸以半血復活', k:'revive'},
 maxrevive :{n:'活力花',  ic:'🌺',price:4500,d:'瀕死御獸以滿血復活',   k:'revive',full:1},
 ether     :{n:'秘藥',    ic:'🫙',price:900 ,d:'全技能回復 10 PP',     k:'ether'},
 candy     :{n:'神奇糖果',ic:'🍭',price:5000,d:'等級 +1',              k:'candy'},
 /* 能力訓練(努力值) */
 ev_hp     :{n:'體力增強劑',ic:'🥛',price:1200,d:'體力努力值 +10(單項上限 60)',k:'ev',s:'hp'},
 ev_atk    :{n:'蛋白粉',   ic:'🥩',price:1200,d:'攻擊努力值 +10',k:'ev',s:'atk'},
 ev_def    :{n:'鐵沙',     ic:'⚙️',price:1200,d:'防禦努力值 +10',k:'ev',s:'def'},
 ev_spd    :{n:'速度羽毛', ic:'🪶',price:1200,d:'速度努力值 +10',k:'ev',s:'spd'},
 /* 特殊 */
 abcapsule :{n:'特性膠囊',ic:'💊',price:6000,d:'切換為另一個可能特性',k:'abcap'},
 natmint   :{n:'性格薄荷',ic:'🌱',price:4000,d:'重新指定性格',        k:'mint'},
 ivstone   :{n:'完美結晶',ic:'💎',price:12000,d:'將一項個體值提升到 31',k:'ivup'},
 /* 攜帶道具(裝備) */
 h_band    :{n:'力量頭帶',ic:'🎗️',price:3500,d:'攜帶:攻擊 ×1.15',   k:'hold',hold:{atk:1.15}},
 h_shield  :{n:'守護石板',ic:'🛡️',price:3500,d:'攜帶:防禦 ×1.15',   k:'hold',hold:{def:1.15}},
 h_shoes   :{n:'疾行靴',  ic:'👟',price:3500,d:'攜帶:速度 ×1.15',   k:'hold',hold:{spd:1.15}},
 h_berry   :{n:'回復果實',ic:'🍒',price:2500,d:'攜帶:HP 低於 1/4 時回復 1/3(每戰一次)',k:'hold',hold:{berry:1}},
 h_focus   :{n:'集中護額',ic:'🔶',price:4000,d:'攜帶:滿血時不會被一擊打倒',k:'hold',hold:{focus:1}},
 h_amulet  :{n:'幸運金幣',ic:'🪙',price:5000,d:'攜帶:戰鬥獲得金幣 ×2',k:'hold',hold:{money:2}},
 h_charm   :{n:'經驗護符',ic:'📗',price:6000,d:'攜帶:獲得經驗 ×1.5', k:'hold',hold:{exp:1.5}}
};
/* 招式學習器:可教的招式清單 */
const TMS=['crush','doubleedge','protect','bulkup','leer','starshot','agility','recover',
 'flamethrow','heatwave','sunnyday','surf','raindance','bubblebeam','seedbomb','synthesis',
 'leechseed','thunderbol','discharge','thunderwav','rockslide','ironwall','sandstorm',
 'psychic','magicflash','calmmind','moonheal'];
TMS.forEach(id=>{
  const s=SK[id];
  ITEM['tm_'+id]={n:'學習器·'+s.n,ic:'💿',price:Math.max(1200,(s.p||40)*40),
    d:`教會 ${TYPE[s.t]}系 ${s.n}(威力 ${s.p||'—'})`,k:'tm',mv:id};
});
/* 商店分頁 */
const SHOP_TABS=[
 {n:'球類',items:['ball','greatball','ultraball','duskball']},
 {n:'回復',items:['potion','spotion','hpotion','antidote','revive','maxrevive','ether']},
 {n:'養成',items:['candy','ev_hp','ev_atk','ev_def','ev_spd','abcapsule','natmint','ivstone']},
 {n:'攜帶',items:['h_band','h_shield','h_shoes','h_berry','h_focus','h_amulet','h_charm']},
 {n:'學習器',items:TMS.map(i=>'tm_'+i)}
];

/* ---------------- 區域 ----------------
   dbl: 頭目為雙打戰
------------------------------------------------- */
const AREAS=[
 {n:'新綠草原',c:'#4ecb71',lv:[3,6],
  desc:'風吹過的第一片草原。新手御獸師的起點。',
  mon:['emberfox','bubbleturtle','sproutcat','zaprat','starbunny','budeer','seedmouse','windsparrow'],
  npc:[{n:'農夫 老陳',t:'草叢裡的御獸怕火,但也怕被踩到。'},
       {n:'小女孩 妮妮',t:'我的夢想是收集全部的御獸圖鑑!'}],
  boss:{n:'新手訓練家 小雨',money:900,team:[['zaprat',8],['budeer',9]]}},
 {n:'微光森林',c:'#8fce6a',lv:[9,14],
  desc:'光線從樹冠篩落,幻系御獸喜歡在此嬉戲。',
  mon:['sproutcat','budeer','wispling','zaprat','sparkbird','starbunny','seedmouse','crystalarva','shadecat'],
  npc:[{n:'採藥人 阿蘭',t:'寄生種子在長期戰中很好用,別小看它。'},
       {n:'迷路的旅人',t:'森林深處…有東西在看著我們。'}],
  boss:{n:'森林守衛 阿藤',money:1600,team:[['vinecat',16],['bloomdeer',15],['wispling',15]]}},
 {n:'熔岩洞窟',c:'#ff6b3d',lv:[16,22],
  desc:'岩壁滾燙,空氣扭曲。火與岩的領域。',
  mon:['cinderlizard','rockbug','sandbeast','emberfox','blazefox','armorbug','magmamole','emberfoal'],
  npc:[{n:'礦工 石頭',t:'沙暴會讓岩系御獸的防禦變得更硬。'},
       {n:'考古學家 白博士',t:'我在找一種會噴火的巨大人偶…'}],
  boss:{n:'岩火鬥士 赤炎',money:2600,dbl:1,team:[['magmalizard',23],['armorbug',22],['blazefox',24],['magmamole',23]]}},
 {n:'深海遺跡',c:'#3da5ff',lv:[24,30],
  desc:'沉沒的古代建築,水流中傳來低沉的歌聲。',
  mon:['jellypup','abyssjelly','bubbleturtle','tideturtle','wispling','dreamwisp','dropsprite','mossfrog','prismcocoon'],
  npc:[{n:'潛水員 阿海',t:'雨天下水系招式威力會提升 50%。'},
       {n:'遺跡看守',t:'海皇沉睡在更深的地方。'}],
  boss:{n:'潮汐術士 海琳',money:3800,team:[['abyssjelly',30],['tideturtle',31],['dreamwisp',30],['mossfrog',29]]}},
 {n:'雷鳴高原',c:'#ffd63d',lv:[32,38],
  desc:'烏雲永不散去,雷聲是這裡的心跳。',
  mon:['sparkbird','stormhawk','thunderrat','sandbeast','titanbeast','lunarabbit','sparkpup','magball','galefalcon'],
  npc:[{n:'避雷針商人',t:'雨天打雷必定命中,記住這點。'},
       {n:'風之少年 颯',t:'速度就是一切!'}],
  boss:{n:'雷神使 疾風',money:5200,dbl:1,team:[['stormhawk',38],['thunderrat',37],['boltHound',38],['galefalcon',37]]}},
 {n:'星辰之巔',c:'#c07dff',lv:[40,48],
  desc:'離天空最近的地方。傳說在此交會。',
  mon:['infernofox','abyssturtle','forestiger','titanbeast','lunarabbit','stormhawk','prismwing',
       'nightwraith','blazesteed','astradragon'],
  npc:[{n:'星占師 露娜',t:'冥想能同時提升攻擊與防禦,對持久戰很關鍵。'},
       {n:'前冠軍 老將',t:'能站在這裡的人,都已經很強了。'}],
  boss:{n:'冠軍 星野',money:9000,dbl:1,
    team:[['infernofox',46],['abyssturtle',46],['forestiger',46],['stormhawk',45],['astradragon',48]]}},
 /* --- 冠軍後 --- */
 {n:'遺跡迴廊',c:'#9fb4c8',lv:[46,52],post:1,
  desc:'冠軍之後開放。石像沿著長廊排列,眼睛會轉動。',
  mon:['stonedoll','ruinguard','prismwing','armorbug','nightwraith','trimagnet','crystalarva','prismcocoon'],
  npc:[{n:'守門石像',t:'…通過者,須證明自己的意志。'}],
  boss:{n:'迴廊主宰 石心',money:11000,dbl:1,
    team:[['ruinguard',52],['ruinguard',51],['trimagnet',51],['prismwing',52]]}},
 {n:'熾炎火山',c:'#ff4d18',lv:[50,56],post:1,
  desc:'火山口冒出的不是煙,是被燒紅的羽毛。',
  mon:['volcanomole','magmalizard','blazesteed','flarechick','phoenixia','infernofox','volcanor'],
  npc:[{n:'火山學者',t:'鳳凰每五十年才在這裡現身一次…現在正是時候。'}],
  boss:{n:'烈焰祭司 燼',money:13000,
    team:[['phoenixia',56],['volcanomole',55],['blazesteed',55],['volcanor',56]]}},
 {n:'雷雲層',c:'#7de2ff',lv:[52,58],post:1,
  desc:'踩在雲上的高度。每一步都伴隨靜電。',
  mon:['thunderlord','boltHound','stormhawk','galefalcon','trimagnet','thunderrat','astradragon'],
  npc:[{n:'雲上隱者',t:'神獸不會屈服於力量,只會回應意志。'}],
  boss:{n:'雷雲之主 霆',money:15000,dbl:1,
    team:[['thunderlord',58],['boltHound',57],['stormhawk',57],['trimagnet',56]]}},
 {n:'星痕深淵',c:'#6a5cff',lv:[56,60],post:1,
  desc:'世界的裂縫。所有傳說的終點與起點。',
  mon:['astradragon','abyssking','thunderlord','volcanor','phoenixia','ruinguard','nightwraith','prismwing'],
  npc:[{n:'裂縫的聲音',t:'你終於來了。讓我看看你和夥伴走了多遠。'}],
  boss:{n:'星痕之影',money:25000,dbl:1,
    team:[['astradragon',60],['abyssking',60],['thunderlord',60],['volcanor',60],['phoenixia',60]]}}
];

/* ---------------- 隨機事件 ---------------- */
const EVENTS=[
 {id:'merchant',w:10,n:'旅行商人',t:'「稀有貨,今天特價!」'},
 {id:'spring',  w:10,n:'溫泉',    t:'蒸氣繚繞,全隊都想泡一下。'},
 {id:'oldman',  w:7 ,n:'神秘老人',t:'「孩子,我教你一招吧。」'},
 {id:'fossil',  w:7 ,n:'化石',    t:'岩層裡嵌著閃亮的東西。'},
 {id:'nest',    w:8 ,n:'稀有巢穴',t:'一個佈滿光點的巢穴,裡面的氣息不尋常。'},
 {id:'bandit',  w:6 ,n:'搶匪',    t:'「把金幣交出來!」'},
 {id:'trainer', w:14,n:'路人訓練家',t:'「對上眼了就是要打!」'},
 {id:'shrine',  w:6 ,n:'古老神壇',t:'神壇散發著溫暖的光。'},
 {id:'chest',   w:9 ,n:'補給箱',  t:'前人留下的補給箱。'}
];

/* ---------------- 任務 ---------------- */
const QUESTS=[
 {id:'q1',n:'初次狩獵',    d:'打倒 5 隻野生御獸',      goal:5 ,k:'defeat',rw:{money:600,items:{ball:5}}},
 {id:'q2',n:'收藏的開始',  d:'捕獲 3 種不同的御獸',    goal:3 ,k:'species',rw:{money:1200,items:{greatball:3}}},
 {id:'q3',n:'屬性學者',    d:'造成 10 次「效果絕佳」',  goal:10,k:'super',rw:{money:1500,items:{tm_rockslide:1}}},
 {id:'q4',n:'成長的證明',  d:'讓一隻御獸達到 Lv.25',   goal:25,k:'level',rw:{money:2000,items:{candy:1}}},
 {id:'q5',n:'進化論',      d:'完成 3 次進化',          goal:3 ,k:'evolve',rw:{money:2500,items:{ev_atk:2}}},
 {id:'q6',n:'徽章收集者',  d:'取得 3 枚徽章',          goal:3 ,k:'badge',rw:{money:3000,items:{ultraball:5}}},
 {id:'q7',n:'圖鑑半程',    d:'圖鑑捕獲數達到 20',      goal:20,k:'dex',rw:{money:5000,items:{ivstone:1}}},
 {id:'q8',n:'百戰之路',    d:'累積 100 場勝利',        goal:100,k:'wins',rw:{money:8000,items:{maxrevive:3}}},
 {id:'q9',n:'傳說的追尋者',d:'捕獲 1 隻傳說御獸',      goal:1 ,k:'legend',rw:{money:12000,items:{masterball:1}}},
 {id:'q10',n:'天梯挑戰者', d:'在線上對戰中獲得 3 勝',   goal:3 ,k:'pvpwin',rw:{money:10000,items:{abcapsule:1}}}
];

/* ---------------- 成就 ---------------- */
const ACHV=[
 {id:'a1', n:'踏上旅程',   d:'選擇初始夥伴',           f:S=>S.party.length>0},
 {id:'a2', n:'第一次捕獲', d:'捕獲一隻御獸',           f:S=>S.stat.caught>=1},
 {id:'a3', n:'滿編隊伍',   d:'隊伍達到 6 隻',          f:S=>S.party.length>=6},
 {id:'a4', n:'首枚徽章',   d:'擊敗第一位頭目',         f:S=>S.badges>=1},
 {id:'a5', n:'半程徽章',   d:'取得 3 枚徽章',          f:S=>S.badges>=3},
 {id:'a6', n:'聯盟冠軍',   d:'擊敗冠軍 星野',          f:S=>S.badges>=6},
 {id:'a7', n:'深淵盡頭',   d:'擊敗星痕之影',           f:S=>S.badges>=10},
 {id:'a8', n:'進化大師',   d:'完成 10 次進化',         f:S=>S.stat.evolve>=10},
 {id:'a9', n:'圖鑑學者',   d:'圖鑑捕獲 25 種',         f:S=>dexCount(S).c>=25},
 {id:'a10',n:'圖鑑完成',   d:'捕獲全部御獸',           f:S=>dexCount(S).c>=SPIDS.length},
 {id:'a11',n:'閃光獵人',   d:'獲得一隻閃光御獸',       f:S=>allMons(S).some(m=>m.shiny)},
 {id:'a12',n:'滿級夥伴',   d:'讓一隻御獸達到 Lv.60',   f:S=>allMons(S).some(m=>m.lv>=60)},
 {id:'a13',n:'完美個體',   d:'擁有一隻四項個體值全 31',f:S=>allMons(S).some(m=>['hp','atk','def','spd'].every(k=>m.iv[k]===31))},
 {id:'a14',n:'百戰百勝',   d:'累積 100 場勝利',        f:S=>S.stat.wins>=100},
 {id:'a15',n:'富翁',       d:'持有 100,000 金幣',      f:S=>S.money>=100000},
 {id:'a16',n:'傳說收藏家', d:'捕獲 3 隻傳說御獸',      f:S=>allMons(S).filter(m=>SP[m.sp].rate<=6).length>=3},
 {id:'a17',n:'訓練狂',     d:'讓一隻御獸努力值全滿',   f:S=>allMons(S).some(m=>evTotal(m)>=EV_TOTAL_MAX)},
 {id:'a18',n:'天梯新手',   d:'完成第一場線上對戰',     f:S=>S.stat.pvp>=1},
 {id:'a19',n:'天梯強者',   d:'線上對戰 10 勝',         f:S=>S.stat.pvpWin>=10},
 {id:'a20',n:'不敗頭目',   d:'零失敗擊敗任一頭目',     f:S=>S.stat.flawless>=1},
 {id:'a21',n:'博物學家',   d:'圖鑑目擊全部御獸',       f:S=>dexCount(S).s>=SPIDS.length},
 {id:'a22',n:'旅行者',     d:'探索 500 次',            f:S=>S.stat.steps>=500},
 {id:'a23',n:'解放全境',   d:'解鎖全部 10 個區域',     f:S=>S.unlock>=AREAS.length},
 {id:'a24',n:'技能大師',   d:'使用過 40 種不同招式',   f:S=>Object.keys(S.stat.mvUsed||{}).length>=40},
 {id:'a25',n:'孵蛋人',     d:'在配種所孵化第一顆蛋',   f:S=>(S.stat.bred||0)>=1},
 {id:'a26',n:'育種大師',   d:'在配種所孵化 10 顆蛋',   f:S=>(S.stat.bred||0)>=10}
];

/* ---------------- 配種所 ---------------- */
const EGG_LAY_STEPS=25, EGG_HATCH_STEPS=12;
function breedCompatible(a,b){
  if(!a||!b||a.egg||b.egg)return false;
  if(isLegend(a.sp)||isLegend(b.sp))return false;
  if(a.sp===b.sp)return true;
  return SP[a.sp].t.some(t=>SP[b.sp].t.includes(t));
}

const EV_TOTAL_MAX=120, EV_ONE_MAX=60;
const evTotal=m=>['hp','atk','def','spd'].reduce((s,k)=>s+((m.ev&&m.ev[k])||0),0);
const allMons=s=>(s.party||[]).concat(s.box||[]);
function dexCount(s){let c=0,se=0;SPIDS.forEach(i=>{const d=s.dex&&s.dex[i];if(d){if(d.s)se++;if(d.c)c++;}});return{c,s:se};}
const isLegend=id=>SP[id].rate<=6;
