"use strict";
/* =====================================================================
   model.js — articulation/dynamics data, random generation, rhythm
   builder, share-link encoding, and the playback plan.
   Note: {dur:'w'|'h'|'q'|'8', start:beat, rest?:true, p:concert offset,
          art:null|id, dyn:null|0-5, hp:null|'cresc'|'dim',
          sl:bool (slurred to next note), tie:bool (tied to next note)}
   ===================================================================== */

const ARTS = [
  { id:null,   name:"None",        codes:[] },
  { id:"stacc",name:"Staccato",    codes:["a."], glyphs:["articStaccatoAbove"] },
  { id:"ten",  name:"Tenuto",      codes:["a-"], glyphs:["articTenutoAbove"] },
  { id:"acc",  name:"Accent",      codes:["a>"], glyphs:["articAccentAbove"] },
  { id:"marc", name:"Marcato",     codes:["a^"], glyphs:["articMarcatoAbove"] },
  { id:"lift", name:"Long Lifted", codes:["a.","a-"], glyphs:["articStaccatoAbove","articTenutoAbove"] },
];
const ART_BY = Object.fromEntries(ARTS.filter(a=>a.id).map(a=>[a.id,a]));
const ART_IDS = ["stacc","ten","acc","marc","lift"];

/* Raven Band "Note Shapes and Note Lengths" guide */
const SHAPE = {
  none:  { sound:0.75, decay:false },
  ten:   { sound:1.00, decay:false, pct:"100% Sound / 0% Space" },
  lift:  { sound:0.75, decay:false, pct:"75% Sound / 25% Space" },
  stacc: { sound:0.50, decay:false, pct:"50% Sound / 50% Space" },
  acc:   { sound:1.00, decay:true,  pct:"100% Sound / 0% Space · Weight + Decay" },
  marc:  { sound:0.50, decay:true,  pct:"50% Sound / 50% Space · Weight + Decay" },
};
const DYN_SUSTAIN = 0.95;
const DYNS = ["pp","p","mp","mf","f","ff"];
const DYN_NAME = { pp:"pianissimo", p:"piano", mp:"mezzo piano", mf:"mezzo forte", f:"forte", ff:"fortissimo" };
const DYN_MEAN = { pp:"Very soft", p:"Soft", mp:"Medium soft", mf:"Medium loud", f:"Loud", ff:"Very loud" };
const DYN_GAIN = [0.05, 0.10, 0.17, 0.26, 0.40, 0.58];
const DUR_BEATS = { w:4, h:2, q:1, "8":0.5 };

const rnd = n => Math.floor(Math.random()*n);
function seededRandom(str){
  let h=1779033703^str.length;
  for(let i=0;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19; }
  let a=h>>>0;
  return ()=>{ a=(a+0x6D2B79F5)|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
}
function withSeed(seed,fn){ const orig=Math.random; Math.random=seededRandom(String(seed)); try{ return fn(); } finally { Math.random=orig; } }
const pick = arr => arr[rnd(arr.length)];
const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j=rnd(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; };
function weighted(opts){ const t=opts.reduce((s,o)=>s+o[1],0); let r=Math.random()*t; for(const o of opts){ if((r-=o[1])<0) return o[0]; } return opts[0][0]; }
const clone = x => JSON.parse(JSON.stringify(x));
const blank = (dur,start,rest) => ({dur,start,rest:!!rest,p:0,art:null,dyn:null,hp:null,sl:false,tie:false});
const measuresFor = mode => mode==="art"? 1 : 2;
const beatsFor = mode => measuresFor(mode)*4;
const sounding = notes => notes.map((n,i)=>i).filter(i=>!notes[i].rest);

/* ---------------- rhythm generation ---------------- */
function genMeasureArt(m,opt){
  const out=[]; const base=m*4;
  if(opt.noEighths){ for(let b=0;b<4;b++) out.push(blank("q",base+b)); return out; }
  let q=0,e=0;
  for(let b=0;b<4;b++){
    const o=[["q",4],["ee",4]];
    if(opt.rests){ o.push(["qr",1],["er8",1],["8er",1]); }
    const c=weighted(o);
    if(c==="q"){ out.push(blank("q",base+b)); q++; }
    else if(c==="ee"){ out.push(blank("8",base+b),blank("8",base+b+0.5)); e++; }
    else if(c==="qr") out.push(blank("q",base+b,true));
    else if(c==="er8") out.push(blank("8",base+b,true),blank("8",base+b+0.5));
    else out.push(blank("8",base+b),blank("8",base+b+0.5,true));
  }
  if(!q || !e || sounding(out).length<4) return genMeasureArt(m,opt); // keep a mix of values and enough notes
  return out;
}
function genMeasureDyn(m,opt){
  const out=[]; let pos=0; const base=m*4;
  while(pos<4){
    const o=[];
    if(pos===0) o.push(["w",1]);
    if(pos%2===0) o.push(["h",3]);
    o.push(["q",4]); if(!opt.noEighths) o.push(["ee",2]);
    if(opt.rests && pos>0) o.push(["qr",1]);
    const c=weighted(o);
    if(c==="ee"){ out.push(blank("8",base+pos),blank("8",base+pos+0.5)); pos+=1; }
    else if(c==="qr"){ out.push(blank("q",base+pos,true)); pos+=1; }
    else { out.push(blank(c,base+pos)); pos+=DUR_BEATS[c]; }
  }
  return out;
}
function genRhythm(mode,opt){
  let notes=[];
  for(let m=0;m<measuresFor(mode);m++) notes=notes.concat(mode==="art"? genMeasureArt(m,opt) : genMeasureDyn(m,opt));
  return notes;
}
/* ties: across a beat or barline between two sounding notes */
function addTies(notes,mode){
  const cands=[];
  for(let i=0;i<notes.length-1;i++){
    const a=notes[i], b=notes[i+1];
    if(a.rest||b.rest||a.sl) continue;
    if(!Number.isInteger(b.start)) continue;           // tie into a beat (or barline)
    if(mode==="art" && a.dur==="q" && b.dur==="q") continue; // q~q looks like a half note; skip in 1 measure
    cands.push(i);
  }
  if(cands.length) notes[pick(cands)].tie=true;
}
/* slurs: one group of 2–4 consecutive sounding notes */
function addSlur(notes){
  const runs=[]; let run=[];
  notes.forEach((n,i)=>{ if(n.rest){ if(run.length) runs.push(run); run=[]; } else run.push(i); });
  if(run.length) runs.push(run);
  const ok=runs.filter(r=>r.length>=2); if(!ok.length) return;
  const r=pick(ok); const len=Math.min(r.length, 2+rnd(3)); const st=rnd(r.length-len+1);
  const grp=r.slice(st,st+len);
  if(grp.some((i,k)=>k<grp.length-1 && notes[i].tie)) return;
  grp.slice(0,-1).forEach(i=>notes[i].sl=true);
}

/* ---------------- articulations ---------------- */
const tiedInto = (notes,i) => i>0 && notes[i-1].tie;
const inSlur = (notes,i) => notes[i].sl || (i>0 && notes[i-1].sl);
function artEligible(notes){ return notes.map((n,i)=>i).filter(i=>!notes[i].rest && !tiedInto(notes,i) && !inSlur(notes,i)); }
function randomizeArts(notes,pool){
  const on = ART_IDS.filter(k=>pool[k]);
  const allowNone = pool.none || on.length===0;
  notes.forEach(n=>n.art=null);
  const el = artEligible(notes); const n=el.length;
  let seq = shuffle(on.slice()).slice(0,n);
  const fill = allowNone? on.concat([null]) : on;
  while(seq.length<n) seq.push(pick(fill));
  if(allowNone && on.length && !seq.includes(null) && n>on.length) seq[seq.length-1]=null;
  seq=shuffle(seq);
  el.forEach((i,k)=>notes[i].art=seq[k]);
}

/* ---------------- dynamics ---------------- */
function hpEnd(notes,i){ for(let j=i+1;j<notes.length;j++) if(notes[j].dyn!==null) return j; return -1; }
function randomizeDyns(notes,lo=0,hi=5){
  notes.forEach(n=>{n.dyn=null;n.hp=null;});
  const ok = notes.map((n,i)=>i).filter(i=>!notes[i].rest && !tiedInto(notes,i) && Number.isInteger(notes[i].start));
  if(!ok.length) return;
  const target = 3 + rnd(2);
  const chosen = [ok[0]];
  const m2 = ok.filter(i=>notes[i].start>=4 && notes[i].start<=6 && notes[i].start-notes[ok[0]].start>=2);
  if(m2.length) chosen.push(pick(m2));
  for(const i of shuffle(ok.filter(i=>!chosen.includes(i)))){
    if(chosen.length>=target) break;
    if(chosen.every(j=>Math.abs(notes[j].start-notes[i].start)>=2)) chosen.push(i);
  }
  chosen.sort((a,b)=>a-b);
  const mid=(lo+hi)/2;
  if(chosen.length===1){                         // only one spot for a marking: hairpin to the end
    const lv=lo+rnd(hi-lo+1); notes[chosen[0]].dyn=lv; notes[chosen[0]].hp = lv>mid? "dim" : "cresc"; return;
  }
  const hp = chosen.slice(0,-1).map(()=>Math.random()<0.6);
  if(hp.length && !hp.some(Boolean)) hp[rnd(hp.length)]=true;
  // start away from the edges when the range allows (p..f in the full range)
  let lvl = hi-lo>=3? lo+1+rnd(hi-lo-1) : lo+rnd(hi-lo+1);
  notes[chosen[0]].dyn=lvl;
  for(let k=1;k<chosen.length;k++){
    let next;
    if(hp[k-1]){
      let dir=Math.random()<0.5?1:-1;
      if(lvl+dir<lo||lvl+dir>hi) dir=-dir;
      const room = dir>0? hi-lvl : lvl-lo;
      next = lvl + dir*Math.min(3, 1+rnd(room));
      notes[chosen[k-1]].hp = dir>0?"cresc":"dim";
    } else { do { next=lo+rnd(hi-lo+1); } while(next===lvl || Math.abs(next-lvl)>3); }
    notes[chosen[k]].dyn=next; lvl=next;
  }
}
function dynWarnings(notes){
  const out=[];
  notes.forEach((n,i)=>{
    if(!n.hp) return;
    let from=null; for(let k=i;k>=0;k--) if(notes[k].dyn!==null){ from=notes[k].dyn; break; }
    const j=hpEnd(notes,i); if(j<0||from===null) return;
    const to=notes[j].dyn;
    if(n.hp==="cresc" && to<=from) out.push(`Crescendo on note ${i+1} leads to ${DYNS[to]}, which isn't louder than ${DYNS[from]}.`);
    if(n.hp==="dim" && to>=from) out.push(`Decrescendo on note ${i+1} leads to ${DYNS[to]}, which isn't softer than ${DYNS[from]}.`);
  });
  return out;
}
/* loudness level (fractional index into DYN_GAIN) as a function of beat */
function levelFn(notes){
  const marks=notes.map((n,i)=>i).filter(i=>notes[i].dyn!==null);
  const first = marks.length? notes[marks[0]].dyn : 3;
  const total = notes.length? Math.ceil((notes[notes.length-1].start+DUR_BEATS[notes[notes.length-1].dur])/4)*4 : 8;
  const events=[];
  notes.forEach((n,i)=>{
    if(n.dyn!==null) events.push({beat:n.start,set:n.dyn});
    if(n.hp){
      const j=hpEnd(notes,i);
      let from=null; for(let k=i;k>=0;k--) if(notes[k].dyn!==null){ from=notes[k].dyn; break; }
      if(from===null) from=first;
      const endBeat = j>=0? notes[j].start : total;
      const to = j>=0? notes[j].dyn : Math.max(0,Math.min(5,from+(n.hp==="cresc"?2:-2)));
      events.push({beat:n.start,ramp:[endBeat,from,to]});
    }
  });
  return beat=>{
    let lvl=first;
    for(const e of events){ if(e.beat>beat) break; if(e.set!==undefined) lvl=e.set; }
    for(const e of events){ if(e.ramp && beat>=e.beat && beat<=e.ramp[0]){ const [b1,l0,l1]=e.ramp; return l0+(l1-l0)*(beat-e.beat)/Math.max(0.001,b1-e.beat); } }
    return lvl;
  };
}
function lvlGain(l){ l=Math.max(0,Math.min(5,l)); const a=Math.floor(l), b=Math.min(5,a+1), f=l-a; return DYN_GAIN[a]+(DYN_GAIN[b]-DYN_GAIN[a])*f; }

/* ---------------- playback plan ----------------
   One event per sounding note-group (ties merged). Times in beats.
   sound = beats of sound; legatoIn = previous note slurred into this one. */
function playPlan(notes,mode){
  const ev=[];
  for(let i=0;i<notes.length;i++){
    const n=notes[i]; if(n.rest) continue;
    const idxs=[i]; let j=i;
    while(notes[j].tie && j+1<notes.length && !notes[j+1].rest){ j++; idxs.push(j); }
    const last=notes[j], first=n;
    const startB=first.start, endB=last.start+DUR_BEATS[last.dur];
    const legatoOut = !!last.sl && j+1<notes.length && !notes[j+1].rest;
    const legatoIn = i>0 && notes[i-1].sl && !notes[i-1].rest;
    let soundB, art=first.art, decay=false, boost=1;
    if(mode==="dyn"){
      soundB = legatoOut? endB-startB : (last.start-startB) + DUR_BEATS[last.dur]*DYN_SUSTAIN;
    } else {
      const sh=SHAPE[last.art||"none"];
      soundB = legatoOut? endB-startB : (last.start-startB) + DUR_BEATS[last.dur]*Math.min(sh.sound,0.995);
      decay = !!(SHAPE[art||"none"].decay);
      boost = art==="acc"?2.2 : art==="marc"?2.8 : 1;
    }
    ev.push({idxs,start:startB,end:endB,sound:soundB,art,decay,boost,legatoIn,legatoOut,p:first.p});
    i=j;
  }
  return ev;
}

/* ---------------- rhythm builder ---------------- */
const BUILD = {
  art: [["q","Quarter"],["8","Eighth"],["88","Eighth pair"],["qr","Quarter rest"],["8r","Eighth rest"]],
  dyn: [["w","Whole"],["h","Half"],["q","Quarter"],["8","Eighth"],["88","Eighth pair"],["hr","Half rest"],["qr","Quarter rest"],["8r","Eighth rest"]],
};
const filled = notes => notes.reduce((t,n)=>t+DUR_BEATS[n.dur],0);
function codeBeats(code){ return code==="88"?1 : DUR_BEATS[code.replace("r","")]; }
function canAdd(mode,notes,code){
  const pos=filled(notes);
  if(pos>=beatsFor(mode)) return false;
  const inM=pos%4, beats=codeBeats(code), d=code.replace("r","");
  if(inM+beats>4) return false;
  if(d==="w" && inM!==0) return false;
  if((d==="h"||code==="88") && inM%1) return false;
  return true;
}
function nextPitchFor(notes,pattern){
  const pat=PATTERNS[pattern], s=sounding(notes);
  if(!s.length) return pat.scale? MAJOR[rnd(5)] : 0;
  const prev=notes[s[s.length-1]];
  if(prev.tie) return prev.p;
  if(pat.remington){
    if(prev.p!==0) return 0;
    const nz=s.map(i=>notes[i].p).filter(p=>p!==0).pop();
    return (nz===undefined || nz<=-7)? -1 : nz-1;
  }
  if(pat.scale){
    let d=Math.max(0,MAJOR.indexOf(prev.p));
    const opts = prev.sl? [-1,1] : [-1,-1,0,1,1];
    let step=pick(opts); if(d+step<0||d+step>7) step=-step||1;
    d=Math.max(0,Math.min(7,d+step)); return MAJOR[d];
  }
  return 0;
}
function addRhythm(mode,notes,code,pattern){
  if(!canAdd(mode,notes,code)) return false;
  const pos=filled(notes);
  const add = code==="88"? [blank("8",pos),blank("8",pos+0.5)] : [blank(code.replace("r",""),pos,code.endsWith("r"))];
  add.forEach(n=>{ if(!n.rest) n.p=nextPitchFor(notes,pattern); notes.push(n); });
  return true;
}
/* edit helpers for the selected note */
function canTie(notes,i){ const a=notes[i], b=notes[i+1]; return !!(a && b && !a.rest && !b.rest); }
function toggleTie(notes,i){
  if(!canTie(notes,i)) return;
  const a=notes[i]; a.tie=!a.tie;
  if(a.tie){ a.sl=false; notes[i+1].p=a.p; notes[i+1].art=null; notes[i+1].dyn=null; }
}
function toggleSlur(notes,i){
  if(!canTie(notes,i)) return;
  const a=notes[i]; a.sl=!a.sl; if(a.sl) a.tie=false;
}

/* ---------------- share links ---------------- */
// compact per-note token: dur | r | p | art | dyn | hp | sl | tie
const ART_CODE={stacc:"s",ten:"t",acc:"a",marc:"m",lift:"l"}, ART_DEC=Object.fromEntries(Object.entries(ART_CODE).map(([k,v])=>[v,k]));
function encodeExample(mode,notes,pattern,tempo){
  const toks=notes.map(n=>[n.dur, n.rest?"r":"", n.p, n.art?ART_CODE[n.art]:"", n.dyn===null?"":n.dyn, n.hp==="cresc"?"<":n.hp==="dim"?">":"", n.sl?"_":"", n.tie?"~":""].join("."));
  const raw=[2,mode,pattern,tempo,toks.join(",")].join("|");
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function decodeExample(str){
  try{
    const raw=decodeURIComponent(escape(atob(str.replace(/-/g,"+").replace(/_/g,"/"))));
    const [ver,mode,pattern,tempo,body]=raw.split("|");
    if(ver!=="2" || !["art","dyn"].includes(mode) || !PATTERNS[pattern]) return null;
    let start=0;
    const notes=(body||"").split(",").filter(Boolean).map(t=>{
      const [dur,r,p,a,d,h,sl,tie]=t.split(".");
      if(!DUR_BEATS[dur]) throw new Error("bad dur");
      const n=blank(dur,start,r==="r"); start+=DUR_BEATS[dur];
      n.p=parseInt(p,10)||0; n.art=ART_DEC[a]||null; n.dyn=d===""?null:Math.max(0,Math.min(5,parseInt(d,10)));
      n.hp=h==="<"?"cresc":h===">"?"dim":null; n.sl=sl==="_"; n.tie=tie==="~";
      return n;
    });
    if(start>beatsFor(mode)) return null;
    return {mode,pattern,tempo:Math.max(40,Math.min(200,parseInt(tempo,10)||80)),notes};
  }catch(e){ return null; }
}
