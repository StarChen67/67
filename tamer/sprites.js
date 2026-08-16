/* ============================================================
   星痕御獸錄 II —— 程序化 sprite 繪製
   設計空間 100×100,地面 y=93,一律面向右(需要時水平翻轉)
   ============================================================ */
"use strict";

function shade(hex,f){
  const n=parseInt(hex.slice(1),16);
  let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  if(f>0){r+=(255-r)*f;g+=(255-g)*f;b+=(255-b)*f;}
  else{r*=1+f;g*=1+f;b*=1+f;}
  return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function ell(c,x,y,rx,ry,col){c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,6.2832);c.fill();}
function tri(c,p,col){c.fillStyle=col;c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(p[2],p[3]);c.lineTo(p[4],p[5]);c.closePath();c.fill();}
function rrect(c,x,y,w,h,r,col){c.fillStyle=col;c.beginPath();c.moveTo(x+r,y);
  c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.fill();}

function drawEye(c,x,y,r,col){
  ell(c,x,y,r,r*1.12,'#fff');
  ell(c,x+r*.15,y+r*.1,r*.62,r*.72,col||'#20140a');
  ell(c,x+r*.42,y-r*.38,r*.24,r*.24,'#fff');
}
function drawTail(c,a,x,y,d,t){
  const dk=shade(a.c1,-.18);
  switch(a.tail){
   case 'bushy': ell(c,x,y,13,11,dk);ell(c,x-4*d,y+2,8,7,a.c2);break;
   case 'flame':
     tri(c,[x+8*d,y+6,x-14*d,y-16+Math.sin(t/200)*2,x-2*d,y+8],a.c3||'#ffb03a');
     tri(c,[x+5*d,y+5,x-9*d,y-9,x-1*d,y+7],'#fff0a0');break;
   case 'leaf': ell(c,x-3*d,y-4,10,6,shade(a.c1,.1));ell(c,x-11*d,y-11,8,5,a.c2);break;
   case 'vine':
     c.strokeStyle=dk;c.lineWidth=4;c.beginPath();c.moveTo(x+6*d,y);
     c.quadraticCurveTo(x-14*d,y+6,x-16*d,y-14);c.stroke();
     ell(c,x-16*d,y-16,6,4,a.c2);break;
   case 'spark':
     c.fillStyle=a.c3||'#ffd166';c.beginPath();
     c.moveTo(x+6*d,y+4);c.lineTo(x-6*d,y-2);c.lineTo(x-2*d,y-6);
     c.lineTo(x-16*d,y-20);c.lineTo(x-6*d,y-12);c.lineTo(x-10*d,y-6);c.closePath();c.fill();break;
   case 'puff': ell(c,x,y,9,9,a.c2);break;
   case 'fin': tri(c,[x+6*d,y+4,x-14*d,y-10,x-12*d,y+8],a.c3||shade(a.c1,.2));break;
   case 'thin':
     c.strokeStyle=dk;c.lineWidth=5;c.lineCap='round';c.beginPath();
     c.moveTo(x+5*d,y);c.quadraticCurveTo(x-12*d,y+4,x-16*d,y-10);c.stroke();break;
  }
}
function drawEar(c,a,x,y,d){
  switch(a.ear){
   case 'tall': tri(c,[x,y,x-7*d,y-24,x+7*d,y-6],a.c1);tri(c,[x,y-2,x-4*d,y-18,x+4*d,y-6],a.c2);break;
   case 'round': ell(c,x,y-6,8,8,a.c1);ell(c,x,y-5,4.5,4.5,a.c2);break;
   case 'leaf': ell(c,x-3*d,y-10,9,5,shade(a.c1,.15));ell(c,x+4*d,y-13,7,4,a.c2);break;
   case 'fin': tri(c,[x,y,x-3*d,y-16,x+9*d,y-4],a.c3||shade(a.c1,.25));break;
  }
}
function drawHorn(c,a,x,y,d){
  const col=a.c3||'#ffe0a0';
  tri(c,[x-4*d,y,x-10*d,y-20,x+1*d,y-4],col);
  if(a.horn>1)tri(c,[x+9*d,y-2,x+7*d,y-20,x+15*d,y-4],col);
}
function drawWing(c,a,x,y,d,t){
  const col=a.c3||shade(a.c1,.3), f=Math.sin(t/220)*5;
  c.save();c.globalAlpha=.92;
  tri(c,[x,y,x-26*d,y-26+f,x-6*d,y+14],col);
  tri(c,[x,y,x-18*d,y-30+f,x-2*d,y+2],shade(col,.25));
  c.restore();
}

const BODY={
 quad(c,a,t){
  const dk=shade(a.c1,-.2);
  drawTail(c,a,20,58,-1,t);
  rrect(c,32,64,11,22,5,dk); rrect(c,58,64,11,22,5,dk);
  ell(c,50,58,29,21,a.c1);
  if(a.stripe){c.save();c.globalAlpha=.35;c.fillStyle=shade(a.c1,-.35);
    [40,50,60].forEach(x=>c.fillRect(x,40,4,20));c.restore();}
  ell(c,50,66,20,11,a.c2);
  if(a.shell){ell(c,48,50,25,17,a.shell);ell(c,48,50,18,12,shade(a.shell,.22));}
  rrect(c,44,66,11,20,5,shade(a.c1,-.08)); rrect(c,66,66,10,19,5,shade(a.c1,-.08));
  if(a.ear&&a.ear!=='none'){drawEar(c,a,64,26,1);drawEar(c,a,76,26,1);}
  ell(c,72,34,19,17,a.c1);
  if(a.horn)drawHorn(c,a,72,20,1);
  ell(c,85,40,9,7,a.c2);
  ell(c,89,38,2.4,2,shade(a.c1,-.45));
  drawEye(c,78,31,4.4,a.eye);
  drawEye(c,66,32,3.6,a.eye);
 },
 round(c,a,t){
  drawTail(c,a,24,62,-1,t);
  if(a.ear&&a.ear!=='none'){drawEar(c,a,40,32,-1);drawEar(c,a,60,32,1);}
  ell(c,50,62,27,26,a.c1);
  ell(c,50,70,18,16,a.c2);
  if(a.horn)drawHorn(c,a,50,34,1);
  rrect(c,36,82,12,8,4,shade(a.c1,-.2)); rrect(c,53,82,12,8,4,shade(a.c1,-.2));
  ell(c,26,60,8,7,a.c1); ell(c,74,60,8,7,a.c1);
  drawEye(c,42,56,5,a.eye); drawEye(c,60,56,5,a.eye);
  c.fillStyle=shade(a.c1,-.45);c.beginPath();c.arc(51,68,5,.15*Math.PI,.85*Math.PI);c.fill();
  if(a.c3){ell(c,34,66,5,3.4,a.c3);ell(c,68,66,5,3.4,a.c3);}
 },
 blob(c,a,t){
  const f=Math.sin(t/300)*2;
  c.save();c.globalAlpha=.92; ell(c,50,52+f,25,27,a.c1); c.restore();
  ell(c,50,58+f,17,17,a.c2);
  if(a.horn)drawHorn(c,a,50,26+f,1);
  if(a.tent){
    c.strokeStyle=a.c3||shade(a.c1,.2);c.lineWidth=3.5;c.lineCap='round';
    for(let i=0;i<5;i++){const x=32+i*9;
      c.beginPath();c.moveTo(x,72+f);
      c.quadraticCurveTo(x+Math.sin(t/240+i)*7,82+f,x+Math.sin(t/200+i)*5,92+f);c.stroke();}
  }else{
    c.save();c.globalAlpha=.55;
    for(let i=0;i<4;i++)ell(c,36+i*9,80+f+Math.sin(t/260+i)*3,5,6,a.c1);
    c.restore();
  }
  drawEye(c,42,48+f,5,a.eye); drawEye(c,59,48+f,5,a.eye);
  if(a.c3)ell(c,50,20+f,4,4,a.c3);
 },
 bird(c,a,t){
  const dk=shade(a.c1,-.2);
  tri(c,[36,58,10,44,14,68],dk); tri(c,[36,60,12,58,16,74],shade(a.c1,.1));
  ell(c,48,58,21,23,a.c1);
  ell(c,50,66,14,15,a.c2);
  if(a.wing)drawWing(c,a,46,52,1,t);
  c.strokeStyle='#e0a83a';c.lineWidth=3;c.lineCap='round';
  c.beginPath();c.moveTo(44,79);c.lineTo(43,90);c.moveTo(56,79);c.lineTo(58,90);c.stroke();
  c.beginPath();c.moveTo(38,90);c.lineTo(48,90);c.moveTo(53,90);c.lineTo(63,90);c.stroke();
  ell(c,64,32,16,15,a.c1);
  if(a.horn)tri(c,[58,20,64,4,70,20],a.c3||'#ffe066');
  tri(c,[76,30,92,36,76,41],'#f0a83a');
  drawEye(c,70,29,4.6,a.eye);
  if(a.c3)ell(c,56,26,5,4,a.c3);
 },
 bug(c,a,t){
  const dk=shade(a.c1,-.22);
  c.strokeStyle=dk;c.lineWidth=3.5;c.lineCap='round';
  for(let i=0;i<3;i++){const x=34+i*15;
    c.beginPath();c.moveTo(x,70);c.lineTo(x-6,88);c.stroke();
    c.beginPath();c.moveTo(x+8,70);c.lineTo(x+14,88);c.stroke();}
  ell(c,40,60,17,16,dk);
  ell(c,56,58,21,19,a.c1);
  ell(c,56,58,15,13,a.c2);
  if(a.c3)ell(c,56,52,16,9,a.c3);
  ell(c,78,50,14,13,a.c1);
  if(a.horn)tri(c,[74,40,80,22,86,40],a.c3||'#e8d8a0');
  c.strokeStyle=dk;c.lineWidth=2.5;
  c.beginPath();c.moveTo(74,42);c.quadraticCurveTo(66,26,58,26);c.stroke();
  c.beginPath();c.moveTo(84,42);c.quadraticCurveTo(84,24,94,22);c.stroke();
  drawEye(c,83,48,4.2,a.eye); drawEye(c,73,49,3.4,a.eye);
 },
 serp(c,a,t){
  const f=Math.sin(t/280)*3;
  c.strokeStyle=a.c1;c.lineWidth=17;c.lineCap='round';c.lineJoin='round';
  c.beginPath();c.moveTo(20,86);
  c.bezierCurveTo(14,60,44,72+f,44,50);
  c.bezierCurveTo(44,32,62,30+f,68,36);
  c.stroke();
  c.strokeStyle=a.c2;c.lineWidth=7;
  c.beginPath();c.moveTo(22,84);
  c.bezierCurveTo(18,62,46,70+f,46,50);
  c.stroke();
  if(a.wing){drawWing(c,a,48,44+f,1,t);drawWing(c,a,54,42+f,-1,t);}
  ell(c,72,32+f,17,15,a.c1);
  if(a.horn)drawHorn(c,a,72,18+f,1);
  ell(c,86,37+f,8,6,a.c2);
  drawEye(c,79,29+f,4.4,a.eye);
  drawEye(c,67,30+f,3.6,a.eye);
  if(a.c3){ell(c,60,24+f,3.6,3.6,a.c3);ell(c,30,66,3,3,a.c3);}
 }
};

/* o = {t, flip, shiny, faint, scale, status} */
function drawMon(cv,spid,o){
  o=o||{};
  const c=cv.getContext('2d'), W=cv.width, H=cv.height, sp=SP[spid];
  c.clearRect(0,0,W,H);
  if(!sp)return;
  const a=sp.art, t=o.t||0, s=W/100;
  c.save();
  if(o.flip){c.translate(W,0);c.scale(-1,1);}
  c.scale(s,s);
  c.save();c.globalAlpha=.3;ell(c,50,93,28,6,'#000');c.restore();
  const sz=(a.size||1)*(o.scale||1), bob=Math.sin(t/420)*1.6;
  c.translate(50,96);c.scale(sz,sz);c.translate(-50,-96+bob);
  if(o.shiny){c.save();c.shadowColor='#ffe066';c.shadowBlur=15;}
  (BODY[a.body]||BODY.quad)(c,a,t);
  if(o.shiny)c.restore();
  /* 異常狀態粒子 */
  if(o.status){
    const col={burn:'#ff7a45',para:'#ffd63d',psn:'#c07dff',slp:'#8fa3c7'}[o.status];
    c.save();c.globalAlpha=.85;
    for(let i=0;i<3;i++){
      const ph=t/300+i*2.1;
      ell(c,50+Math.cos(ph)*26,40+Math.sin(ph*1.3)*20,2.6,2.6,col);
    }
    c.restore();
  }
  c.restore();
  if(o.faint){
    c.globalCompositeOperation='saturation';c.fillStyle='#808080';c.fillRect(0,0,W,H);
    c.globalCompositeOperation='source-over';
  }
}
function monCanvas(spid,size,opt){
  const cv=document.createElement('canvas');
  const dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=size*dpr;cv.height=size*dpr;
  cv.style.width=size+'px';cv.style.height=size+'px';
  drawMon(cv,spid,Object.assign({t:0},opt||{}));
  return cv;
}
