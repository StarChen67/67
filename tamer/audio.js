/* ============================================================
   星痕御獸錄 II —— 音效 / BGM(純 WebAudio 合成,無外部音檔)
   ============================================================ */
"use strict";

const AU={
  ctx:null, master:null, musicGain:null, sfxGain:null,
  on:true, musicOn:true, timer:null, scene:null,

  init(){
    if(this.ctx)return;
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return;
    this.ctx=new C();
    this.master=this.ctx.createGain(); this.master.gain.value=.9;
    this.master.connect(this.ctx.destination);
    this.sfxGain=this.ctx.createGain(); this.sfxGain.gain.value=.45; this.sfxGain.connect(this.master);
    this.musicGain=this.ctx.createGain(); this.musicGain.gain.value=.16; this.musicGain.connect(this.master);
  },
  resume(){ this.init(); if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume(); },

  /* --- 單音 --- */
  tone(f,dur,type,gain,dest,slideTo){
    if(!this.on||!this.ctx)return;
    const t=this.ctx.currentTime;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type||'square'; o.frequency.setValueAtTime(f,t);
    if(slideTo)o.frequency.exponentialRampToValueAtTime(Math.max(20,slideTo),t+dur);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(gain===undefined?.5:gain,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    o.connect(g); g.connect(dest||this.sfxGain);
    o.start(t); o.stop(t+dur+0.02);
  },
  noise(dur,gain,filterHz){
    if(!this.on||!this.ctx)return;
    const t=this.ctx.currentTime, n=Math.floor(this.ctx.sampleRate*dur);
    const buf=this.ctx.createBuffer(1,n,this.ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);
    const s=this.ctx.createBufferSource(); s.buffer=buf;
    const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=filterHz||1400;
    const g=this.ctx.createGain(); g.gain.value=gain===undefined?.4:gain;
    s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t);
  },

  /* --- 音效庫 --- */
  sfx(k){
    this.resume(); if(!this.ctx||!this.on)return;
    switch(k){
     case 'click':  this.tone(660,.05,'square',.25);break;
     case 'tab':    this.tone(520,.05,'triangle',.3);this.tone(780,.06,'triangle',.2);break;
     case 'hit':    this.noise(.13,.42,2000);this.tone(180,.1,'square',.25,null,90);break;
     case 'hitsuper':this.noise(.2,.55,3400);this.tone(240,.16,'sawtooth',.32,null,80);break;
     case 'hitweak':this.noise(.09,.2,700);break;
     case 'crit':   this.noise(.22,.6,5200);this.tone(880,.14,'square',.3,null,220);break;
     case 'faint':  this.tone(400,.5,'triangle',.35,null,60);break;
     case 'heal':   [523,659,784].forEach((f,i)=>setTimeout(()=>this.tone(f,.16,'sine',.35),i*70));break;
     case 'buff':   this.tone(392,.18,'sine',.3,null,784);break;
     case 'debuff': this.tone(392,.22,'sine',.3,null,180);break;
     case 'status': this.tone(300,.2,'sawtooth',.22,null,420);break;
     case 'ball':   this.tone(880,.1,'sine',.3,null,300);break;
     case 'shake':  this.tone(300,.07,'square',.28);break;
     case 'caught': [659,784,988,1319].forEach((f,i)=>setTimeout(()=>this.tone(f,.2,'square',.34),i*110));break;
     case 'escape': this.tone(400,.18,'square',.3,null,180);break;
     case 'levelup':[523,659,784,1047].forEach((f,i)=>setTimeout(()=>this.tone(f,.16,'square',.32),i*80));break;
     case 'evolve': [392,523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>this.tone(f,.24,'triangle',.34),i*120));break;
     case 'win':    [523,659,784,1047,784,1047].forEach((f,i)=>setTimeout(()=>this.tone(f,.2,'square',.32),i*130));break;
     case 'lose':   [440,392,330,262].forEach((f,i)=>setTimeout(()=>this.tone(f,.35,'triangle',.3),i*190));break;
     case 'money':  [1047,1319].forEach((f,i)=>setTimeout(()=>this.tone(f,.1,'square',.3),i*60));break;
     case 'quest':  [784,988,1319].forEach((f,i)=>setTimeout(()=>this.tone(f,.18,'sine',.34),i*100));break;
     case 'achv':   [659,880,1109,1319,1760].forEach((f,i)=>setTimeout(()=>this.tone(f,.22,'triangle',.32),i*95));break;
     case 'error':  this.tone(200,.16,'sawtooth',.25);break;
     case 'weather':this.noise(.6,.22,600);break;
    }
  },

  /* --- BGM:簡易琶音 + 低音 --- */
  BG:{
    field :{bpm:104,root:220,prog:[[0,4,7,11],[-3,2,5,9],[-5,0,4,7],[2,5,9,12]],wave:'triangle'},
    battle:{bpm:150,root:196,prog:[[0,3,7],[0,3,7],[-2,1,5],[3,7,10]],wave:'square'},
    boss  :{bpm:164,root:174,prog:[[0,3,6],[-1,2,5],[-3,0,3],[1,4,8]],wave:'sawtooth'},
    pvp   :{bpm:158,root:233,prog:[[0,4,7],[5,9,12],[-2,2,5],[3,7,10]],wave:'square'},
    win   :{bpm:120,root:262,prog:[[0,4,7,12],[2,5,9,14],[4,7,11,16],[5,9,12,17]],wave:'triangle'}
  },
  music(scene){
    this.resume();
    if(this.scene===scene)return;
    this.scene=scene;
    clearInterval(this.timer); this.timer=null;
    if(!scene||!this.musicOn||!this.ctx)return;
    const B=this.BG[scene]||this.BG.field;
    const step=60000/B.bpm/2;
    let i=0;
    const play=()=>{
      if(!this.musicOn||!this.ctx)return;
      const bar=Math.floor(i/8)%B.prog.length, ch=B.prog[bar];
      const n=ch[i%ch.length];
      const f=B.root*Math.pow(2,n/12);
      this.tone(f,step/1000*1.3,B.wave,.32,this.musicGain);
      if(i%8===0)this.tone(B.root/2*Math.pow(2,ch[0]/12),step/1000*3,'sine',.5,this.musicGain);
      if(i%4===2)this.noise(.05,.1,3000);
      i++;
    };
    play(); this.timer=setInterval(play,step);
  },
  stopMusic(){clearInterval(this.timer);this.timer=null;this.scene=null;},
  setSfx(v){this.on=v;},
  setMusic(v){
    this.musicOn=v;
    if(!v){clearInterval(this.timer);this.timer=null;}
    else{const s=this.scene;this.scene=null;this.music(s||'field');}
  }
};
