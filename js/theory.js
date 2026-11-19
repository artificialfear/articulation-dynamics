"use strict";
/* =====================================================================
   theory.js — instruments, transposition, pitch patterns, note spelling
   Pitches in the data model are CONCERT semitone offsets (n.p) from the
   pattern's tonic, so a shared example reads correctly on any instrument.
   ===================================================================== */

/* tr  = semitones from concert to written (written = concert + tr)
   bb  = concert MIDI of the B♭ tonic in this instrument's warm-up register
   f/eb = offset from that B♭ to the F / E♭ scale tonic used for this instrument
   rf  = offset to the concert F used for single-pitch F and Remington (which
         descends a 5th, so it starts higher on instruments with a low limit)
   snd = sample set (assets/sounds/<snd>/) */
const INSTRUMENTS = [
  { id:"concertT", name:"Concert pitch (treble)", clef:"treble", tr:0,  bb:70, f:-5, eb:-7, rf:-5, snd:"trumpet" },
  { id:"concertB", name:"Concert pitch (bass)",   clef:"bass",   tr:0,  bb:46, f:7,  eb:5,  rf:7,  snd:"trombone" },
  { id:"flute",    name:"Flute",             clef:"treble", tr:0,  bb:70, f:-5, eb:-7, rf:7,  snd:"flute" },
  { id:"oboe",     name:"Oboe",              clef:"treble", tr:0,  bb:70, f:-5, eb:-7, rf:-5, snd:"oboe" },
  { id:"bassoon",  name:"Bassoon",           clef:"bass",   tr:0,  bb:46, f:7,  eb:5,  rf:7,  snd:"bassoon" },
  { id:"clarinet", name:"Clarinet",          clef:"treble", tr:2,  bb:58, f:-5, eb:-7, rf:7,  snd:"clarinet" },
  { id:"bassclar", name:"Bass Clarinet",     clef:"treble", tr:14, bb:46, f:-5, eb:-7, rf:7,  snd:"clarinet" },
  { id:"altosax",  name:"Alto Saxophone",    clef:"treble", tr:9,  bb:58, f:-5, eb:-7, rf:7,  snd:"alto_sax" },
  { id:"tenorsax", name:"Tenor Saxophone",   clef:"treble", tr:14, bb:46, f:7,  eb:5,  rf:7,  snd:"tenor_sax" },
  { id:"barisax",  name:"Baritone Saxophone",clef:"treble", tr:21, bb:46, f:-5, eb:-7, rf:7,  snd:"baritone_sax" },
  { id:"trumpet",  name:"Trumpet",           clef:"treble", tr:2,  bb:58, f:-5, eb:5,  rf:7,  snd:"trumpet" },
  { id:"horn",     name:"French Horn",       clef:"treble", tr:7,  bb:58, f:-5, eb:-7, rf:7,  snd:"french_horn" },
  { id:"trombone", name:"Trombone",          clef:"bass",   tr:0,  bb:46, f:7,  eb:5,  rf:7,  snd:"trombone" },
  { id:"euph",     name:"Euphonium",         clef:"bass",   tr:0,  bb:46, f:7,  eb:5,  rf:7,  snd:"trombone" },
  { id:"tuba",     name:"Tuba",              clef:"bass",   tr:0,  bb:34, f:7,  eb:5,  rf:7,  snd:"tuba" },
  { id:"mallets",  name:"Mallets",           clef:"treble", tr:0,  bb:70, f:-5, eb:-7, rf:-5, snd:"marimba" },
  { id:"perc",     name:"Percussion (snare)",clef:"percussion", tr:0, bb:70, f:0, eb:0, rf:0, snd:"snare", perc:true },
];
const INST_BY = Object.fromEntries(INSTRUMENTS.map(i=>[i.id,i]));

const PATTERNS = {
  single_F:  { name:"Single pitch — concert F",  tonic:"RF", key:null },
  single_Bb: { name:"Single pitch — concert B♭", tonic:"Bb", key:null },
  scale_Bb:  { name:"Concert B♭ scale",           tonic:"Bb", key:"Bb", scale:true },
  scale_F:   { name:"Concert F scale",            tonic:"F",  key:"F",  scale:true },
  scale_Eb:  { name:"Concert E♭ scale",           tonic:"Eb", key:"Eb", scale:true },
  remington: { name:"Remington long tones (concert F)", tonic:"RF", key:null, remington:true },
};
const MAJOR = [0,2,4,5,7,9,11,12];
const REMINGTON = [0,-1,0,-2,0,-3,0,-4,0,-5,0,-6,0,-7];
const LETTERS = "CDEFGAB";
const NAT = [0,2,4,5,7,9,11];
const FLAT_NAMES = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

const mod = (a,n)=>((a%n)+n)%n;
function parseName(nm){ const li=LETTERS.indexOf(nm[0]); const alter=(nm.slice(1).match(/#/g)||[]).length-(nm.slice(1).match(/b/g)||[]).length; return {li,alter,pc:mod(NAT[li]+alter,12)}; }
function nameOf(li,alter){ return LETTERS[li]+(alter>0?"#".repeat(alter):"b".repeat(-alter)); }
const STEP_FOR = {0:0,2:1,7:4,9:5};
function transposeName(nm,tr){
  const k=parseName(nm), li=(k.li+STEP_FOR[mod(tr,12)])%7, pc=mod(k.pc+tr,12);
  let alter=pc-NAT[li]; if(alter>6) alter-=12; if(alter<-6) alter+=12;
  return nameOf(li,alter);
}
function tonicMidi(inst,tonic){ return inst.bb + ({Bb:0, F:inst.f, Eb:inst.eb, RF:inst.rf})[tonic]; }
function concertMidi(inst,pattern,p){ return tonicMidi(inst,PATTERNS[pattern].tonic)+p; }
function writtenKey(inst,pattern){
  const pat=PATTERNS[pattern];
  if(inst.perc || !pat.key) return "C";
  return transposeName(pat.key, inst.tr);
}
/* VexFlow key string ("eb/4") for a written MIDI pitch, spelled in keyName when diatonic */
function spell(midi,keyName){
  const k=parseName(keyName), pc=mod(midi,12);
  let li=-1;
  for(let d=0;d<7;d++){ if(mod(k.pc+MAJOR[d],12)===pc){ li=(k.li+d)%7; break; } }
  let alter;
  if(li<0){ const nm=FLAT_NAMES[pc]; li=LETTERS.indexOf(nm[0]); alter=nm.length>1?-1:0; }
  else { alter=pc-NAT[li]; if(alter>6) alter-=12; if(alter<-6) alter+=12; }
  const oct=Math.floor((midi-alter)/12)-1;
  return LETTERS[li].toLowerCase()+(alter>0?"#".repeat(alter):"b".repeat(-alter))+"/"+oct;
}
function noteKey(inst,pattern,p){
  if(inst.perc) return "b/4";
  return spell(concertMidi(inst,pattern,p)+inst.tr, writtenKey(inst,pattern));
}
function restKey(inst,dur){
  if(inst.clef==="bass") return dur==="w"?"f/3":"d/3";
  return dur==="w"?"d/5":"b/4";
}
/* Concert pitch range an instrument can need across every pattern (for sample loading) */
function instRange(inst){
  const ts=[inst.bb, inst.bb+inst.f, inst.bb+inst.eb, inst.bb+inst.rf];
  return [Math.min(...ts)-7, Math.max(...ts)+12];
}

/* ---------- pitch assignment ---------- */
// Steps through the pattern for sounding notes; tie targets copy the previous pitch,
// notes inside a slur always move (so a slur never looks like a tie).
function assignPitches(notes,pattern,startFrom){
  const pat=PATTERNS[pattern];
  let deg = startFrom && startFrom.deg!==undefined ? startFrom.deg : (pat.scale? Math.floor(Math.random()*5) : 0);
  let rem = startFrom && startFrom.rem!==undefined ? startFrom.rem : 2*Math.floor(Math.random()*4);
  let prev=null;
  notes.forEach((n,i)=>{
    if(n.rest){ n.p=0; return; }
    if(prev && prev.tie){ n.p=prev.p; prev=n; return; }
    if(!pat.scale && !pat.remington){ n.p=0; }
    else if(pat.remington){ n.p=REMINGTON[rem%REMINGTON.length]; rem++; }
    else {
      const mustMove = prev && prev.sl;
      let step;
      if(deg<=0) step=1; else if(deg>=7) step=-1;
      else step = mustMove ? (Math.random()<0.5?-1:1) : [-1,-1,0,1,1][Math.floor(Math.random()*5)];
      if(prev) deg=Math.max(0,Math.min(7,deg+step));
      n.p=MAJOR[deg];
    }
    prev=n;
  });
  return {deg,rem};
}
// move a single note up/down one step in the pattern
function stepPitch(p,pattern,dir){
  const pat=PATTERNS[pattern];
  if(pat.scale){ let d=MAJOR.indexOf(p); if(d<0) d=0; d=Math.max(0,Math.min(7,d+dir)); return MAJOR[d]; }
  if(pat.remington) return Math.max(-7,Math.min(0,p+dir));
  return Math.max(-12,Math.min(12,p+dir));
}
const patternMoves = pattern => !!(PATTERNS[pattern].scale || PATTERNS[pattern].remington);
