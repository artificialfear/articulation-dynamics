"use strict";
/* =====================================================================
   mic.js — "Check my playing" (Articulation mode)
   Records one take after a count-off, measures how long each note sounds
   (sound vs. space), and compares it with the Note Shapes guide.
   Note length only — attack weight is not judged.
   ===================================================================== */
const MIC_TOL = 0.15;               // ±15 percentage points counts as "in shape"
const Mic = {
  stream:null, proc:null, src:null, frames:[], result:null, busy:false,
  supported(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext||window.webkitAudioContext)); },
  toggle(){ $("micUI").classList.contains("hidden")? Mic.open() : Mic.close(); },
  open(){
    $("micUI").classList.remove("hidden");
    Mic.showIntro();
  },
  close(){
    Mic.stop(); Mic.busy=false;
    $("micUI").classList.add("hidden");
  },
  showIntro(msg){
    $("micTitle").textContent="🎤 Check my playing";
    $("micBody").innerHTML=`${msg? `<p class="warn">${msg}</p>`:""}
      <p class="hint" style="margin:0 0 10px">Play the measure on your instrument after the count-off. The app measures how long each note sounds (sound vs. space) and compares it to the Note Shapes guide.
      Sit close to the mic in a quiet spot. The pink cursor shows where you are.</p>
      <button id="micStart" class="btn primary">🎤 Start (count-off, then play)</button>`;
    $("micStart").onclick=()=>Mic.start();
  },
  async start(){
    if(Mic.busy) return;
    stopPlayback();
    audio();
    try{
      Mic.stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    }catch(e){
      Mic.showIntro("The microphone isn't available. Allow mic access for this site (the 🎤 icon in the address bar) and try again.");
      return;
    }
    Mic.busy=true; Mic.result=null; draw();
    $("micUI").classList.remove("hidden");
    const spb=60/S.tempo, ac=AC;
    Mic.src=ac.createMediaStreamSource(Mic.stream);
    Mic.proc=ac.createScriptProcessor(1024,1,1);
    const mute=ac.createGain(); mute.gain.value=0;
    Mic.frames=[]; const hop=256, sr=ac.sampleRate, lag=1024/sr;
    Mic.proc.onaudioprocess=e=>{
      const d=e.inputBuffer.getChannelData(0), t=e.playbackTime-lag;
      for(let k=0;k+hop<=d.length;k+=hop){ let s=0; for(let j=k;j<k+hop;j++) s+=d[j]*d[j]; Mic.frames.push({t:t+k/sr, r:Math.sqrt(s/hop)}); }
    };
    Mic.src.connect(Mic.proc); Mic.proc.connect(mute); mute.connect(ac.destination);
    // count-off clicks only; nothing else plays while recording
    const t0=ac.currentTime+0.6, T=t0+4*spb, end=T+4*spb+0.7;
    for(let b=0;b<4;b++) click(t0+b*spb,b===0);
    $("micTitle").textContent="🎤 Listening…";
    $("micBody").innerHTML=`<div class="countdown" id="micCount">Get ready…</div><button id="micCancel" class="btn">Cancel</button>`;
    $("micCancel").onclick=()=>{ Mic.stop(); Mic.busy=false; Mic.showIntro(); };
    for(let b=0;b<4;b++) at(t0+b*spb,()=>{ const c=$("micCount"); if(c) c.textContent=["1","2","3","4"][b]+(b===3?" — play!":""); });
    at(T,()=>{ const c=$("micCount"); if(c) c.textContent="Play now ♪"; });
    if(R) startCursor(R,T,spb,4);
    at(end,()=>{
      const frames=Mic.frames.slice(); Mic.stop(); Mic.busy=false;
      Mic.result=analyzeTake(frames,S.art.notes,T,spb,t0);
      Mic.result.sig=JSON.stringify(S.art.notes);
      Mic.showResult(); draw();
    });
  },
  stop(){
    removeCursor();
    timers.forEach(clearTimeout); timers=[];
    try{ Mic.proc && (Mic.proc.onaudioprocess=null, Mic.proc.disconnect()); }catch(e){}
    try{ Mic.src && Mic.src.disconnect(); }catch(e){}
    if(Mic.stream) Mic.stream.getTracks().forEach(t=>t.stop());
    Mic.stream=null; Mic.proc=null; Mic.src=null;
  },
  showResult(){
    const r=Mic.result; if(!r) return;
    $("micTitle").textContent = r.heard? `🎤 ${r.good} of ${r.items.length} notes in shape` : "🎤 We didn't hear you";
    if(!r.heard){ Mic.showIntro("No playing was picked up. Play louder or closer to the mic, then try again."); $("micTitle").textContent="🎤 We didn't hear you"; return; }
    const verdictTxt={ok:"✓ In shape",long:"↑ Too long",short:"↓ Too short",miss:"✗ Not heard"};
    $("micBody").innerHTML=`<div class="mic-res">${r.items.map(it=>`<div class="r ${it.verdict==="ok"?"ok":"no"}"><b>Note ${it.n} · ${it.name}</b>Goal ${Math.round(it.target*100)}% sound<br>You: ${it.verdict==="miss"?"—":Math.round(it.measured*100)+"%"}<br><b>${verdictTxt[it.verdict]}</b></div>`).join("")}</div>
      <p class="hint" style="margin:10px 0">The blue bar under each green shape is how long your note actually sounded.</p>
      <button id="micAgain" class="btn primary">🎤 Try again</button> <button id="micDone" class="btn">Done</button>`;
    $("micAgain").onclick=()=>Mic.start(); $("micDone").onclick=()=>{ Mic.result=null; Mic.close(); draw(); };
  },
  /* draw the measured lengths under the green shape bars */
  onDraw(render){
    const r=Mic.result; if(!r || S.mode!=="art" || r.sig!==JSON.stringify(S.art.notes) || !render.bars) return;
    r.items.forEach(it=>{
      if(it.verdict==="miss") return;
      const b=render.bars[it.idx]; if(!b) return;
      svgEl("rect",{x:b.x,y:b.y+b.h+2,width:Math.max(2,b.w*Math.min(1,it.measured*it.span)),height:6,fill:"#2563eb",rx:2},render.svg);
    });
  },
};

/* ---------- analysis (pure — tested in tests/smoke.py) ----------
   frames: [{t (AudioContext seconds), r (RMS)}]; measure starts at T; count-off began at t0. */
function analyzeTake(frames,notes,T,spb,t0){
  const plan=playPlan(notes,"art");
  const sm=frames.map((f,k)=>{ const a=frames[Math.max(0,k-1)].r, c=frames[Math.min(frames.length-1,k+1)].r; return {t:f.t,r:(a+f.r+c)/3}; });
  // noise floor: count-off bar, away from the clicks
  const clickTimes=[0,1,2,3].map(b=>t0+b*spb);
  const quiet=sm.filter(f=>f.t>t0-0.25 && f.t<T-0.08 && clickTimes.every(c=>Math.abs(f.t-c)>0.09)).map(f=>f.r).sort((a,b)=>a-b);
  const noise = quiet.length? quiet[Math.floor(quiet.length*0.6)] : 0.002;
  const take=sm.filter(f=>f.t>=T-0.3*spb && f.t<=T+4*spb+0.6);
  const sorted=take.map(f=>f.r).sort((a,b)=>a-b), peak=sorted.length? sorted[Math.floor(sorted.length*0.97)] : 0;
  const floorThr=Math.max(noise*4, 0.004);
  if(peak<floorThr*1.5) return {heard:false,items:[],good:0};
  // line up the take with the music using the first note's attack (players and mics lag a little)
  const first=plan[0]; let shift=0.05;
  if(first){
    const exp=T+first.start*spb;
    const on=take.find(f=>f.t>exp-0.25 && f.r>Math.max(floorThr,peak*0.25));
    if(on) shift=Math.max(-0.25,Math.min(0.35,on.t-exp));
  }
  const items=plan.map((ev,k)=>{
    const nextStart = k<plan.length-1? plan[k+1].start : 4;
    const s=T+ev.start*spb+shift, e=T+nextStart*spb+shift;
    const win=sm.filter(f=>f.t>=s-0.08 && f.t<=e-0.02);
    const span=ev.end-ev.start, notated=span*spb;
    const target=Math.min(1,ev.sound/span);
    const n=notes[ev.idxs[0]];
    const name = ev.legatoOut? "Slurred" : (ART_BY[notes[ev.idxs[ev.idxs.length-1]].art]||{name:"No marking"}).name + (ev.idxs.length>1?" (tied)":"");
    const base={n:ev.idxs[0]+1, idx:ev.idxs[0], name, target, span: 1};
    const localPeak=win.reduce((m,f)=>Math.max(m,f.r),0);
    if(localPeak<floorThr) return Object.assign(base,{measured:0,verdict:"miss"});
    const onThr=Math.max(floorThr,localPeak*0.25);
    // attack = first rising edge near the expected start; if the previous note's sound runs
    // straight into this one (tenuto/slur), there is no edge, so use the expected start
    let oi=-1;
    for(let j=0;j<win.length && win[j].t<=s+0.2;j++){ if(win[j].r>=onThr && (j===0? false : win[j-1].r<onThr)){ oi=j; break; } }
    if(oi<0){ oi=win.findIndex(f=>f.t>=s); if(win[0].r<onThr && oi>=0 && win.slice(oi).every(f=>f.r<onThr)) oi=-1; }
    if(oi<0) oi=win.findIndex(f=>f.r>=onThr);
    const onset=win[oi].t;
    // body level: median of the first half of the sound. Release = the level falls below 60% of it
    // (30% for weight+decay notes, which are supposed to fade) and stays there for 40 ms.
    // Catching the drop early keeps the room's echo from counting as note.
    const body=win.filter(f=>f.t>=onset && f.t<=onset+Math.max(0.03,ev.sound*spb*0.5)).map(f=>f.r).sort((a,b)=>a-b);
    const relThr=Math.max(floorThr, (ev.decay?0.3:0.6)*(body.length? body[Math.floor(body.length/2)] : localPeak));
    let release=null, below=null;
    for(let j=oi+1;j<win.length;j++){
      if(win[j].r<relThr){ if(below===null) below=win[j].t; if(win[j].t-below>=0.04){ release=below; break; } }
      else below=null;
    }
    // never went quiet: the sound ran right into the next note (tenuto/slur) — it lasted the full value.
    // went quiet right at the end of the window: release where it dropped.
    if(release===null) release = below!==null? below : e;
    // room echo: time how long the tail takes to halve after the release, and take back the
    // part of that tail that fell inside the release threshold (exponential decay estimate)
    const bodyLvl=relThr/(ev.decay?0.3:0.6);
    const ri=win.findIndex(f=>f.t>=release);
    if(ri>=0){
      const half=win.slice(ri).find(f=>f.r<relThr*0.5);
      if(half){ const comp=Math.min(0.08,(half.t-release)*(ev.decay?0.6:0.737)); release=Math.max(onset+0.01,release-comp); }
    }
    const measured=Math.max(0,Math.min(1.05,(release-onset)/notated));
    const diff=measured-target;
    const verdict = Math.abs(diff)<=MIC_TOL? "ok" : diff>0? "long" : "short";
    return Object.assign(base,{measured,verdict});
  });
  return {heard:true,items,good:items.filter(i=>i.verdict==="ok").length,shift,noise,peak};
}
