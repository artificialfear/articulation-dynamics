"use strict";
/* =====================================================================
   audio.js — Web Audio playback: instrument samples (FluidR3 GM, CC-BY 3.0)
   with a synth fallback, snare for percussion, metronome, cursor.
   ===================================================================== */
let AC=null, master=null, live=[], timers=[], playing=false, playToken=0;
function audio(){
  if(!AC){ AC=new (window.AudioContext||window.webkitAudioContext)(); master=AC.createGain(); master.gain.value=0.9; master.connect(AC.destination); }
  if(AC.state==="suspended") AC.resume();
  return AC;
}
const midiFreq = m => 440*Math.pow(2,(m-69)/12);

/* ---------- samples ---------- */
const SAMPLE_PCS=[0,3,6,9];                       // C, E♭, G♭, A — every minor 3rd
const sampleCache={};                             // snd -> {map:{midi:AudioBuffer}}
const midiName = m => FLAT_NAMES[mod(m,12)]+(Math.floor(m/12)-1);
function sampleNotes(inst){ const [lo,hi]=instRange(inst); const out=[]; for(let m=lo-2;m<=hi+2;m++) if(SAMPLE_PCS.includes(mod(m,12))) out.push(m); return out; }
async function loadSamples(inst){
  if(inst.perc) return true;
  const c=sampleCache[inst.snd]||(sampleCache[inst.snd]={map:{}});
  const need=sampleNotes(inst).filter(m=>!c.map[m]);
  await Promise.all(need.map(async m=>{
    const r=await fetch(`assets/sounds/${inst.snd}/${midiName(m)}.mp3`);
    if(!r.ok) throw new Error("missing sample "+inst.snd+" "+midiName(m));
    const buf=await AC.decodeAudioData(await r.arrayBuffer());
    // even out loudness across samples: RMS of the steady part
    const d=buf.getChannelData(0), a=Math.floor(0.3*buf.sampleRate), b=Math.min(d.length,Math.floor(1.2*buf.sampleRate));
    let s=0; for(let k=a;k<b;k++) s+=d[k]*d[k];
    buf._g = 0.32/Math.max(1e-4,Math.sqrt(s/Math.max(1,b-a)));
    c.map[m]=buf;
  }));
  return true;
}
function nearestSample(inst,midi){
  const c=sampleCache[inst.snd]; if(!c) return null;
  let best=null, bd=99; for(const k in c.map){ const d=Math.abs(k-midi); if(d<bd){bd=d;best=+k;} }
  return best===null? null : {m:best,buf:c.map[best]};
}

/* one note: g0/g1 = level at start/end of the sound; boost = attack weight; decay = weight+decay shape */
function envelope(env,t,len,g0,g1,boost,decay,legatoIn,scale=1,curve=null){
  const atk=legatoIn?0.045:0.018, rel=Math.min(0.04,len*0.3), peak=Math.min(0.95,g0*boost)*scale;
  env.gain.setValueAtTime(0.0001,t);
  env.gain.linearRampToValueAtTime(peak,t+atk);
  const sEnd=Math.max(t+atk+0.01,t+len-rel);
  if(decay) env.gain.linearRampToValueAtTime(g0*0.2*scale,sEnd);
  else {
    let after=t+atk;
    if(boost>1){ const d=Math.min(0.16,len*0.5); after=t+atk+d; env.gain.linearRampToValueAtTime(g0*scale,after); }
    // loudness that changes inside one long note (e.g. tied p < f > p): follow the curve [[secondsFromStart, gain], …]
    if(curve) curve.forEach(([dt,g])=>{ const tt=t+dt; if(tt>after && tt<sEnd) env.gain.linearRampToValueAtTime(g*scale,tt); });
    env.gain.linearRampToValueAtTime(g1*scale,sEnd);
  }
  env.gain.linearRampToValueAtTime(0.0001,t+len);
}
function synthVoice(t,len,g0,g1,boost,decay,midi,legatoIn,curve){
  const o1=AC.createOscillator(), o2=AC.createOscillator(), filt=AC.createBiquadFilter(), env=AC.createGain(), mix=AC.createGain();
  o1.type=o2.type="sawtooth"; o1.frequency.value=o2.frequency.value=midiFreq(midi); o2.detune.value=7;
  filt.type="lowpass"; filt.Q.value=0.8; filt.frequency.value=500+Math.max(g0,g1)*5200;
  mix.gain.value=0.5; o1.connect(mix); o2.connect(mix); mix.connect(filt); filt.connect(env); env.connect(master);
  envelope(env,t,len,g0,g1,boost,decay,legatoIn,1,curve);
  o1.start(t); o2.start(t); o1.stop(t+len+0.05); o2.stop(t+len+0.05); live.push(o1,o2);
}
function sampleVoice(inst,t,len,g0,g1,boost,decay,midi,legatoIn,curve){
  const s=nearestSample(inst,midi); if(!s) return synthVoice(t,len,g0,g1,boost,decay,midi,legatoIn,curve);
  const src=AC.createBufferSource(), env=AC.createGain();
  src.buffer=s.buf; src.playbackRate.value=Math.pow(2,(midi-s.m)/12);
  src.loop=true; src.loopStart=0.6; src.loopEnd=Math.max(0.9,Math.min(s.buf.duration-0.25,2.8));
  src.connect(env); env.connect(master);
  envelope(env,t,len,g0,g1,boost,decay,legatoIn,s.buf._g,curve);
  src.start(t, legatoIn?0.12:0); src.stop(t+len+0.06); live.push(src);
}
let noiseBuf=null;
function snareVoice(t,g,boost){
  if(!noiseBuf){ noiseBuf=AC.createBuffer(1,AC.sampleRate*0.4,AC.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; }
  const n=AC.createBufferSource(), bp=AC.createBiquadFilter(), env=AC.createGain();
  n.buffer=noiseBuf; bp.type="bandpass"; bp.frequency.value=2200; bp.Q.value=0.7;
  n.connect(bp); bp.connect(env); env.connect(master);
  const pk=Math.min(0.9,g*2.2*boost);
  env.gain.setValueAtTime(0.0001,t); env.gain.linearRampToValueAtTime(pk,t+0.003); env.gain.exponentialRampToValueAtTime(0.0001,t+0.16);
  const o=AC.createOscillator(), og=AC.createGain(); o.type="triangle"; o.frequency.setValueAtTime(220,t); o.frequency.exponentialRampToValueAtTime(140,t+0.08);
  og.gain.setValueAtTime(0.0001,t); og.gain.linearRampToValueAtTime(pk*0.6,t+0.003); og.gain.exponentialRampToValueAtTime(0.0001,t+0.09);
  o.connect(og); og.connect(master);
  n.start(t); n.stop(t+0.2); o.start(t); o.stop(t+0.12); live.push(n,o);
}
function click(t,strong,vol=1){
  const o=AC.createOscillator(), g=AC.createGain(); o.type="square"; o.frequency.value=strong?1600:1100;
  g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime((strong?0.35:0.22)*vol,t+0.002); g.gain.exponentialRampToValueAtTime(0.0001,t+0.05);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+0.06); live.push(o);
}
function at(t,fn){ timers.push(setTimeout(fn, Math.max(0,(t-AC.currentTime)*1000))); }

/* ---------- playback ----------
   o: {notes, mode, inst, pattern, tempo, countin, metro, render, cursor, sound, onEnd, onStatus, noCountClicks} */
async function playExample(o){
  stopPlayback();
  audio(); playing=true; const token=++playToken;
  let useSamples = o.sound==="inst" && !o.inst.perc;
  if(useSamples){
    const c=sampleCache[o.inst.snd], need=sampleNotes(o.inst);
    if(!c || need.some(m=>!c.map[m])){
      o.onStatus && o.onStatus("Loading "+o.inst.name.toLowerCase()+" sound…");
      try{ await loadSamples(o.inst); }catch(e){ useSamples=false; console.warn(e); }
      o.onStatus && o.onStatus("");
      if(token!==playToken) return null;
    }
  }
  const spb=60/o.tempo; let t=AC.currentTime+0.12;
  const total=o.total||beatsFor(o.mode), tm=o.tm||null, T=b=>tm? tm.toTime(b) : b;
  const from=o.from||0, to=o.to==null? total : o.to;
  const countT=t;
  if(o.countin){ if(!o.noCountClicks) for(let b=0;b<4;b++) click(t+b*spb,b===0); t+=4*spb; }
  const t0=t-T(from)*spb;                                   // so `from` lands right after the count-off
  if(o.metro) for(let b=Math.ceil(from);b<to;b++){ if(tm && tm.inHold(b)) continue; click(t0+T(b)*spb,b%4===0,0.55); }
  const L = o.mode==="dyn"? levelFn(o.notes) : null;
  const base=DYN_GAIN[3];
  playPlan(o.notes,o.mode).forEach(ev=>{
    if(ev.start<from-1e-6 || ev.start>=to-1e-6) return;
    const st=t0+T(ev.start)*spb, en=t0+T(ev.start+ev.sound)*spb;
    const len=Math.max(0.07, en-st + (ev.legatoOut?0.03:0));
    const midi=concertMidi(o.inst,o.pattern,ev.p);
    const g0 = L? lvlGain(L(ev.start)) : base;
    const g1 = L? lvlGain(L(ev.start+ev.sound)) : base;
    let curve=null;
    if(L && ev.sound>1){ curve=[]; const K=Math.ceil(ev.sound*4); for(let k=1;k<K;k++){ const b=ev.start+ev.sound*k/K; curve.push([t0+T(b)*spb-st, lvlGain(L(b))]); } }
    const first=o.notes[ev.idxs[0]];
    let boost = ev.legatoIn? 1 : ev.boost;
    if(o.mode==="dyn" && first.dyn===FP) boost=DYN_GAIN[4]/DYN_GAIN[1];   // fp: forte attack, then piano
    if(o.inst.perc) snareVoice(st,g0,boost);
    else if(useSamples) sampleVoice(o.inst,st,len,g0,g1,boost,ev.decay,midi,ev.legatoIn,curve);
    else synthVoice(st,len,g0,g1,boost,ev.decay,midi,ev.legatoIn,curve);
    if(o.render) ev.idxs.forEach(i=>{
      const n=o.notes[i], a=t0+T(n.start)*spb, b=t0+T(n.start+DUR_BEATS[n.dur]*0.92)*spb;
      at(a,()=>highlight(o.render,i,true)); at(b,()=>highlight(o.render,i,false));
    });
  });
  if(o.cursor && o.render) startCursor(o.render,t0,spb,total,tm,from,to);
  at(t0+T(to)*spb+0.06,()=>{ if(token===playToken){ stopPlayback(); o.onEnd&&o.onEnd(); } });
  return {t0,spb,countT,total};
}
function highlight(render,i,on){ const el=render.els[i]; if(el) el.classList.toggle("play",on); }
function stopPlayback(){
  playToken++;
  timers.forEach(clearTimeout); timers=[];
  if(AC){ const now=AC.currentTime; live.forEach(o=>{ try{o.stop(now);}catch(e){} }); }
  live=[]; playing=false;
  document.querySelectorAll(".vf-stavenote.play").forEach(el=>el.classList.remove("play"));
  removeCursor();
  document.dispatchEvent(new Event("playback-stopped"));
}

/* ---------- cursor ---------- */
let cursorRAF=0, cursorEl=null;
function startCursor(render,t0,spb,total,tm,from=0,to=total){
  removeCursor();
  // a render with .lines = several staves (warm-up): the cursor hops to the line that's playing
  const lines = render.lines || [{render,b0:0,b1:total}];
  let cur=null;
  const place=ln=>{
    if(cur===ln) return; if(cursorEl) cursorEl.remove();
    const r=ln.render; cursorEl=svgEl("line",{y1:r.top,y2:r.bot,stroke:"#db2777","stroke-width":3,"stroke-linecap":"round",opacity:0.75,class:"cursor"},r.svg);
    cursorEl.style.pointerEvents="none"; cur=ln;
  };
  place(lines.find(l=>from>=l.b0 && from<l.b1)||lines[0]);
  const tick=()=>{
    if(!cursorEl) return;
    const tb=(AC.currentTime-t0)/spb, beat=Math.max(from,Math.min(to,tm? tm.toBeat(tb) : tb));
    const ln=lines.find(l=>beat>=l.b0 && beat<l.b1) || lines[lines.length-1];
    place(ln);
    const x=beatToX(ln.render.anchors, beat-ln.b0);
    cursorEl.setAttribute("x1",x); cursorEl.setAttribute("x2",x); cursorEl.setAttribute("opacity", AC.currentTime<t0+(tm?tm.toTime(from):from)*spb?"0.3":"0.75");
    cursorRAF=requestAnimationFrame(tick);
  };
  tick();
}
function removeCursor(){ cancelAnimationFrame(cursorRAF); cursorRAF=0; if(cursorEl){ cursorEl.remove(); cursorEl=null; } }
