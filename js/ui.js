"use strict";
/* =====================================================================
   ui.js — app state, panels, settings drawer, sharing, presentation
   mode, keyboard. Quiz and mic check live in quiz.js / mic.js.
   ===================================================================== */
const VERSION = "2.4.1";
const $ = id => document.getElementById(id);
/* Agenda board: ?board=1&mode=art|dyn&lvl=6beg|6int|7th|8th&seed=<date|level>
   Opens in presentation mode with the class's level; nothing is saved on the board. */
const QS = new URLSearchParams(location.search);
const BOARD = QS.get("board")==="1";
const LEVELS = {
  "6beg": { name:"6th Grade Beginning Band", tempo:72, range:[1,4], pool:{stacc:true,ten:true,acc:true},
            art:{rests:false,slurs:false,ties:false,noEighths:true}, dyn:{rests:false,slurs:false,ties:false,noEighths:true} },
  "6int": { name:"6th Grade Intermediate Band", tempo:80, range:[1,4], pool:{stacc:true,ten:true,acc:true,marc:true},
            art:{rests:true,slurs:false,ties:false}, dyn:{rests:true,slurs:false,ties:false} },
  "7th":  { name:"7th Grade Band", tempo:88, range:[0,5], pool:{stacc:true,ten:true,acc:true,marc:true},
            art:{rests:true,slurs:false,ties:true}, dyn:{rests:true,slurs:false,ties:true} },
  "8th":  { name:"8th Grade Band", tempo:96, range:[0,5], pool:{stacc:true,ten:true,acc:true,marc:true,lift:true},
            art:{rests:true,slurs:false,ties:true}, dyn:{rests:true,slurs:false,ties:true} },
};
const store = {
  get(k,d){ if(BOARD && k!=="theme") return d; try{ const v=localStorage.getItem("adt."+k); return v===null? d : JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ if(BOARD) return; try{ localStorage.setItem("adt."+k, JSON.stringify(v)); }catch(e){} }
};
// carry settings over from v1 (clef + playback pitch)
const legacyInst = ({treble:"concertT",bass:"concertB",percussion:"perc"})[store.get("clef","treble")]||"concertT";
const legacyPattern = store.get("pitch","F")==="Bb"? "single_Bb" : "single_F";

const S = {
  mode: store.get("mode","art"),
  inst: store.get("inst",legacyInst),
  pattern: store.get("pattern",legacyPattern),
  tempo: store.get("tempo",80),
  countin: store.get("countin",true),
  metro: store.get("metro",true),
  cursor: store.get("cursor",true),
  labels: store.get("labels",false),
  shapes: store.get("shapes",true),
  sound: store.get("sound","inst"),
  pool: Object.assign({stacc:true,ten:true,acc:true,marc:true,lift:false,none:false}, store.get("pool",{})),
  artOpt: Object.assign({rests:true,slurs:true,ties:false}, store.get("artOpt",{})),
  dynOpt: Object.assign({rests:false,slurs:true,ties:true}, store.get("dynOpt",{})),
  art:{notes:[],sel:-1}, dyn:{notes:[],sel:-1},
  present:false, reveal:false, presentFs:false, dynRange:[0,5],
  dynView: store.get("dynView","random"), warmSel: store.get("warmSel","1"),
};
const WARM = warmupNotes();
const isWarm = () => S.mode==="dyn" && S.dynView==="warmup";
const warmPattern = () => S.pattern==="single_Bb"? "single_Bb" : "single_F";   // the warm-up is a long-tone on concert F (or B♭)
if(!INST_BY[S.inst]) S.inst="concertT";
if(!PATTERNS[S.pattern]) S.pattern="single_F";
if(S.mode==="quiz" && typeof Quiz==="undefined") S.mode="art";
const inst = () => INST_BY[S.inst];
const st = () => S.mode==="dyn"? S.dyn : S.art;
let R=null;   // the current render

/* ---------------- examples ---------------- */
function newExample(mode){
  const opt = mode==="art"? S.artOpt : S.dynOpt, perc=inst().perc;
  const notes=genRhythm(mode,opt);
  if(opt.ties && !perc) addTies(notes,mode);
  if(opt.slurs && !perc && patternMoves(S.pattern)) addSlur(notes);
  assignPitches(notes,S.pattern);
  if(mode==="art") randomizeArts(notes,S.pool); else randomizeDyns(notes,S.dynRange[0],S.dynRange[1]);
  return notes;
}
function repitch(notes){ assignPitches(notes,S.pattern); }
function dirty(){ if(location.hash) history.replaceState(null,"",location.pathname+location.search); }
function setStatus(t){ $("status").textContent=t||""; }

/* ---------------- drawing ---------------- */
function draw(){
  stopPlayback(); closeShare();
  if(S.mode==="quiz"){ Quiz.draw(); updateChrome(); return; }
  if(isWarm()){ R=renderWarmup(); updateChrome(); return; }
  const s=st();
  R=renderScore($("score"),{
    mode:S.mode, notes:s.notes, inst:inst(), pattern:S.pattern, showArts:true, showDyns:true,
    labels: S.present? S.reveal : S.labels,
    shapes: S.present? S.reveal : S.shapes,
  });
  applySel(); updatePanels(); updateChrome();
  if(S.mode==="dyn") $("dWarn").textContent=dynWarnings(s.notes).join(" ");
  if(typeof Mic!=="undefined" && Mic.onDraw) Mic.onDraw(R);
}
/* the warm-up: #1 (ladder) and/or #2 (shapes), one staff per line, sharing one loudness curve and one cursor */
const warmRange = () => S.warmSel==="both"? {from:0,to:filled(WARM)} : WARMUP_EX[S.warmSel];
function renderWarmup(){
  const host=$("score"); host.innerHTML="";
  const LW=levelFn(WARM), lines=[], els=new Array(WARM.length).fill(null);
  const shown=WARMUP_LINES.filter(l=>S.warmSel==="both" || String(l.ex)===S.warmSel);
  let lastEx=null;
  shown.forEach((ln,k)=>{
    const [m0,m1]=ln.m;
    if(ln.ex!==lastEx){ const lb=document.createElement("div"); lb.className="wlabel"; lb.innerHTML=`#${ln.ex}<span>${WARMUP_EX[ln.ex].name}</span>`; host.appendChild(lb); lastEx=ln.ex; }
    const d=document.createElement("div"); d.className="wline"; host.appendChild(d);
    const idx=WARM.map((n,i)=>i).filter(i=>WARM[i].start>=m0*4 && WARM[i].start<m1*4);
    const sub=idx.map(i=>Object.assign(clone(WARM[i]),{start:WARM[i].start-m0*4}));
    const r=renderScore(d,{mode:"dyn",notes:sub,inst:inst(),pattern:warmPattern(),showArts:false,showDyns:true,
      labels: S.present? S.reveal : S.labels, shapes: S.present? S.reveal : S.shapes,
      measures:m1-m0, noTime:k>0, noEnd:k<shown.length-1, L:b=>LW(b+m0*4), width:1000,
      tieIn: idx[0]>0 && WARM[idx[0]-1].tie && k>0});
    idx.forEach((gi,j)=>els[gi]=r.els[j]);
    lines.push({render:r,b0:m0*4,b1:m1*4});
  });
  return {lines,els,xs:[],svg:lines[0].render.svg,anchors:[]};
}
function playWarm(){
  const s=warmRange();
  playExample({notes:WARM, mode:"dyn", inst:inst(), pattern:warmPattern(), tempo:S.tempo, countin:S.countin, metro:S.metro, render:R, cursor:S.cursor,
    sound:S.sound, total:filled(WARM), from:s.from, to:s.to, onStatus:setStatus});
  setPlayLabels(true);
}
function setWarmSel(v){ S.warmSel=v; store.set("warmSel",v); draw(); }
function applySel(){ if(!R) return; const sel=st().sel; R.els.forEach((el,i)=>el&&el.classList.toggle("sel",i===sel)); }
function nearestNote(render,e){
  const svg=render.svg, pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
  const p=pt.matrixTransform(svg.getScreenCTM().inverse());
  let best=-1,bd=1e9; render.xs.forEach((x,i)=>{ if(x==null) return; const d=Math.abs(x-p.x); if(d<bd){bd=d;best=i;} });
  return bd>90? -1 : best;
}
$("score").addEventListener("click",e=>{
  if(S.mode==="quiz"){ Quiz.onScoreClick(e); return; }
  if(!R || S.present || isWarm()) return;
  const i=nearestNote(R,e), s=st();
  s.sel = (s.sel===i)? -1 : i;
  applySel(); updatePanels();
});

/* ---------------- panels ---------------- */
const NONE_SYM='<span style="font-size:1.3rem;color:var(--muted)">∅</span>';
function mkBtn(host,html,onclick,data={}){ const b=document.createElement("button"); b.innerHTML=html; b.onclick=onclick; Object.assign(b.dataset,data); host.appendChild(b); return b; }
function toolButtons(host,mode){
  host.innerHTML="";
  mkBtn(host,`<span class="sym">⌒</span><span class="nm">Slur to next</span>`,()=>editSel(n=>toggleSlur(st().notes,st().sel)),{tool:"slur"});
  mkBtn(host,`<span class="sym">‿</span><span class="nm">Tie to next</span>`,()=>editSel(n=>toggleTie(st().notes,st().sel)),{tool:"tie"});
  mkBtn(host,`<span class="sym">▲</span><span class="nm">Pitch up</span>`,()=>changePitch(1),{tool:"up"});
  mkBtn(host,`<span class="sym">▼</span><span class="nm">Pitch down</span>`,()=>changePitch(-1),{tool:"down"});
}
function buildStatic(){
  // instrument picker
  const groups=[["Concert pitch",["concertT","concertB"]],["Woodwinds",["flute","oboe","bassoon","clarinet","bassclar","altosax","tenorsax","barisax"]],["Brass",["trumpet","horn","trombone","euph","tuba"]],["Percussion",["mallets","perc"]]];
  $("inst").innerHTML=groups.map(([g,ids])=>`<optgroup label="${g}">${ids.map(id=>`<option value="${id}">${INST_BY[id].name}</option>`).join("")}</optgroup>`).join("");
  $("pattern").innerHTML=Object.entries(PATTERNS).map(([k,p])=>`<option value="${k}">${p.name}</option>`).join("");
  // articulation palette
  const ap=$("aPal"); ap.innerHTML="";
  ARTS.forEach((a,k)=>mkBtn(ap,`<span class="sym">${a.id?artGlyph(a.id):NONE_SYM}</span><span class="nm">${k}·${a.name}</span>`,()=>editSel(n=>n.art=a.id),{art:a.id||""}));
  toolButtons($("aTools"),"art");
  // dynamics palettes
  const dp=$("dPal"); dp.innerHTML="";
  [null,0,1,2,3,4,5,FP].forEach(l=>mkBtn(dp,`<span class="sym">${l===null?NONE_SYM:dynGlyph(DYNS[l])}</span><span class="nm">${l===null?"None":DYN_NAME[DYNS[l]]}</span>`,()=>editSel(n=>n.dyn=l),{dyn:l===null?"":l}));
  const hp=$("hPal"); hp.innerHTML="";
  [[null,"No hairpin"],["cresc","Crescendo"],["dim","Decrescendo"]].forEach(([t,nm])=>mkBtn(hp,`<span class="sym">${t?hairGlyph(t):NONE_SYM}</span><span class="nm">${nm}</span>`,()=>editSel(n=>n.hp=t),{hp:t||""}));
  toolButtons($("dTools"),"dyn");
  // rhythm builders
  ["art","dyn"].forEach(mode=>{
    const host=$(mode==="art"?"aBuild":"dBuild"); host.innerHTML="";
    BUILD[mode].forEach(([code,nm])=>mkBtn(host,`<span class="sym">${rhythmIcon(code)}</span><span class="nm">${nm}</span>`,()=>{ const s=S[mode]; if(addRhythm(mode,s.notes,code,S.pattern)){ s.sel=-1; dirty(); draw(); } },{code}));
    const u=mkBtn(host,`<span class="sym">⌫</span><span class="nm">Undo</span>`,()=>{ S[mode].notes.pop(); fixDangling(S[mode].notes); S[mode].sel=-1; dirty(); draw(); },{t:"undo"}); u.className="tool";
    const c=mkBtn(host,`<span class="sym">✕</span><span class="nm">Start over</span>`,()=>{ S[mode].notes=[]; S[mode].sel=-1; dirty(); draw(); },{t:"clear"}); c.className="tool";
  });
  // random pools (drawer)
  const pool=$("aPool"); pool.innerHTML="";
  [["stacc","Staccato"],["ten","Tenuto"],["acc","Accent"],["marc","Marcato"],["lift","Long Lifted"],["none","Plain notes (no articulation)"]].forEach(([k,nm])=>pool.appendChild(optBox(nm,S.pool[k],v=>{S.pool[k]=v;store.set("pool",S.pool);})));
  [["rests","Rests"],["slurs","Slurs"],["ties","Ties"]].forEach(([k,nm])=>pool.appendChild(optBox(nm,S.artOpt[k],v=>{S.artOpt[k]=v;store.set("artOpt",S.artOpt);})));
  const dpool=$("dPool"); dpool.innerHTML="";
  [["rests","Rests"],["slurs","Slurs"],["ties","Ties"]].forEach(([k,nm])=>dpool.appendChild(optBox(nm,S.dynOpt[k],v=>{S.dynOpt[k]=v;store.set("dynOpt",S.dynOpt);})));
  $("aPool").insertAdjacentHTML("beforeend",`<div class="note">Slurs only appear with a scale or long-tone pitch pattern (a slur needs two different pitches).</div>`);
  buildRefs();
}
function optBox(label,checked,onchange){
  const l=document.createElement("label"); l.className="opt";
  l.innerHTML=`<input type="checkbox" ${checked?"checked":""}> ${label}`;
  l.querySelector("input").onchange=e=>onchange(e.target.checked); return l;
}
function fixDangling(notes){ const n=notes[notes.length-1]; if(n){ n.sl=false; n.tie=false; } }
function editSel(fn){
  const s=st(), n=s.notes[s.sel]; if(!n) return;
  fn(n); dirty(); draw();
}
function changePitch(dir){
  const s=st(); let i=s.sel; const notes=s.notes; if(!notes[i]||notes[i].rest) return;
  while(i>0 && notes[i-1].tie) i--;                       // whole tie chain moves together
  const np=stepPitch(notes[i].p,S.pattern,dir);
  let j=i; do{ notes[j].p=np; j++; } while(notes[j-1].tie && j<notes.length);
  dirty(); draw();
}
function updatePanels(){
  const mode=S.mode; if(mode==="quiz") return;
  const s=st(), n=s.notes[s.sel], ok=!!n && !n.rest;
  const nxt=n? s.notes[s.sel+1] : null;
  if(mode==="art"){
    $("aSelInfo").textContent = ok? `Note ${s.sel+1} of ${s.notes.length} selected — choose its articulation (keys 0–5, ←/→ to move).` : "Tap a note in the measure to choose its articulation.";
    [...$("aPal").children].forEach(b=>{ b.disabled=!ok; b.classList.toggle("on", ok && (b.dataset.art||null)===(n.art||null)); });
  } else {
    $("dSelInfo").textContent = ok? `Note ${s.sel+1} of ${s.notes.length} selected.` : "Tap a note to give it a dynamic or start a hairpin there.";
    [...$("dPal").children].forEach(b=>{ b.disabled=!ok; b.classList.toggle("on", ok && String(n.dyn===null?"":n.dyn)===b.dataset.dyn); });
    [...$("hPal").children].forEach(b=>{ b.disabled=!ok; b.classList.toggle("on", ok && (n.hp||"")===b.dataset.hp); });
  }
  const moves=patternMoves(S.pattern) && !inst().perc;
  [...$(mode==="art"?"aTools":"dTools").children].forEach(b=>{
    const t=b.dataset.tool;
    if(t==="slur"){ b.disabled=!(ok && nxt && !nxt.rest && nxt.p!==n.p); b.classList.toggle("on",ok&&n.sl);
      b.title = ok && nxt && !nxt.rest && nxt.p===n.p ? "A slur needs two different pitches — use ▲/▼ or a scale pattern" : ""; }
    if(t==="tie"){ b.disabled=!(ok && nxt && !nxt.rest); b.classList.toggle("on",ok&&n.tie); }
    if(t==="up"||t==="down") b.disabled=!(ok && moves);
  });
  // builder
  const notes=s.notes, pos=filled(notes), tot=beatsFor(mode);
  $(mode==="art"?"aBuildInfo":"dBuildInfo").textContent = pos>=tot
    ? (mode==="art"? "measure is full — tap notes or Randomize to add articulations" : "both measures are full — tap notes or Randomize to add dynamics")
    : `${fmtBeats(pos)} of ${tot} beats filled`;
  [...$(mode==="art"?"aBuild":"dBuild").children].forEach(b=>{
    if(b.dataset.code) b.disabled=!canAdd(mode,notes,b.dataset.code);
    if(b.dataset.t) b.disabled=!notes.length;
  });
}
const fmtBeats = b => b%1 ? (Math.floor(b)||"")+"½" : String(b);
function updateChrome(){
  const m=S.mode;
  $("tabArt").classList.toggle("on",m==="art"); $("tabDyn").classList.toggle("on",m==="dyn"); $("tabQuiz").classList.toggle("on",m==="quiz");
  $("artUI").classList.toggle("hidden",m!=="art"); $("dynUI").classList.toggle("hidden",m!=="dyn"); $("quizUI").classList.toggle("hidden",m!=="quiz");
  $("shapesLbl").textContent = m==="dyn"? "Show loudness" : "Show note shapes";
  $("share").classList.toggle("hidden",m==="quiz");
  $("micBtn").classList.toggle("hidden", m!=="art" || typeof Mic==="undefined" || !Mic.supported());
  $("artRefs").classList.toggle("hidden",m==="dyn"); $("dynRefs").classList.toggle("hidden",m==="art");
  $("pReveal").textContent = m==="quiz"? "👁 Reveal" : (S.reveal? "🙈 Hide shapes" : "👁 Show shapes");
  $("pTempoVal").textContent = "♩ = "+S.tempo;
  $("pMode").classList.toggle("hidden", m==="quiz");
  const warm=isWarm();
  $("pWarm").classList.toggle("hidden", m!=="dyn");
  $("pWarm").textContent = warm? "🎲 Random" : "🎯 Warm-up";
  $("warmUI").classList.toggle("hidden",!warm); $("dynRandom").classList.toggle("hidden",warm);
  $("dynView").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.v===S.dynView));
  $("pWarmSel").classList.toggle("hidden",!warm);
  ["warmSel","pWarmSel"].forEach(id=>$(id).querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.v===S.warmSel)));
  if(m==="dyn") $("share").classList.toggle("hidden",warm);
  $("pMode").textContent = m==="art"? "🔊 Dynamics" : "🎵 Articulation";
  if(BOARD){
    const lv=LEVELS[QS.get("lvl")]||LEVELS["7th"];
    $("boardTitle").innerHTML = isWarm()? `<b>🎯 Dynamics Warm-up</b> · ${lv.name} · <span>play on concert F</span>`
      : `<b>${m==="art"?"🎵 Articulation":"🔊 Dynamics"} of the Day</b> · ${lv.name} · <span>play on concert F</span>`;
  }
  if(m!=="quiz" && $("banner")) $("banner").classList.add("hidden");
}

/* ---------------- symbol guide ---------------- */
function buildRefs(){
  const ar=$("artRefs"); ar.innerHTML="";
  ar.insertAdjacentHTML("beforeend",`<div class="ref wide"><svg viewBox="0 0 330 92" class="shape"><rect x="80" y="26" width="170" height="44" fill="#fff" stroke="#222" stroke-width="1.4"/><line x1="80" y1="14" x2="80" y2="82" stroke="#9b4dca" stroke-width="2" stroke-dasharray="4 3"/><line x1="250" y1="14" x2="250" y2="82" stroke="#9b4dca" stroke-width="2" stroke-dasharray="4 3"/><text x="74" y="22" text-anchor="end" font-size="12" fill="currentColor">Beginning /</text><text x="74" y="36" text-anchor="end" font-size="12" fill="currentColor">Initiation</text><text x="256" y="22" font-size="12" fill="currentColor">End /</text><text x="256" y="36" font-size="12" fill="currentColor">Release</text><text x="165" y="53" text-anchor="middle" font-size="13" fill="#222">Middle / Sustain</text></svg><div><b>Note Shapes and Note Lengths</b><p>Every note has a beginning, a middle, and an end. Each articulation changes how much of the note is <b style="display:inline;color:${GREEN}">sound</b> and how much is space, and whether the sound stays even or has weight that decays. Notes with no marking: 75% sound.</p></div></div>`);
  const ART_REF = {
    ten:["Tenuto","Line. Full, even sound for the whole note, connected right into the next note."],
    lift:["Long Lifted","Dot + line. Full, even sound, then lift off for the last quarter of the note."],
    stacc:["Staccato","Dot. Even sound for half the note, then space for the other half."],
    acc:["Accent","Wedge (>). Weight at the start, then let the sound decay through the full length of the note."],
    marc:["Marcato","Rooftop (^). Weight at the start, decay quickly, and release at the halfway point. Half sound, half space."],
  };
  Object.entries(ART_REF).forEach(([id,[nm,txt]])=>ar.insertAdjacentHTML("beforeend",`<div class="ref"><div class="sym">${artNoteGlyph(id)}</div><div><b>${nm}</b><svg class="shape" viewBox="0 0 162 26">${shapeMarkup(1,1,160,24,id)}</svg><span class="pct">${SHAPE[id].pct}</span><p>${txt}</p></div></div>`));
  const curve = (same)=>`<svg viewBox="0 0 70 46" width="52"><ellipse cx="14" cy="${same?30:34}" rx="7" ry="5" fill="#111" transform="rotate(-20 14 ${same?30:34})"/><ellipse cx="56" cy="${same?30:22}" rx="7" ry="5" fill="#111" transform="rotate(-20 56 ${same?30:22})"/><path d="M14 ${same?40:44} Q35 ${same?52:50} 56 ${same?40:32}" stroke="#111" stroke-width="2" fill="none"/></svg>`;
  ar.insertAdjacentHTML("beforeend",`<div class="ref"><div class="sym">${curve(false)}</div><div><b>Slur</b><p>Curved line over <i>different</i> pitches. Tongue only the first note; connect the rest with air.</p></div></div>`);
  ar.insertAdjacentHTML("beforeend",`<div class="ref"><div class="sym">${curve(true)}</div><div><b>Tie</b><p>Curved line joining the <i>same</i> pitch. Hold for both values added together — don't tongue the second note.</p></div></div>`);
  const dr=$("dynRefs"); dr.innerHTML="";
  DYNS.forEach(d=>dr.insertAdjacentHTML("beforeend",`<div class="ref"><div class="sym">${dynGlyph(d)}</div><div><b>${DYN_NAME[d]}</b><p>${DYN_MEAN[d]}</p></div></div>`));
  dr.insertAdjacentHTML("beforeend",`<div class="ref"><div class="sym">${hairGlyph("cresc")}</div><div><b>Crescendo</b><p>Gradually get louder until the next dynamic marking.</p></div></div>`);
  dr.insertAdjacentHTML("beforeend",`<div class="ref"><div class="sym">${hairGlyph("dim")}</div><div><b>Decrescendo</b><p>Gradually get softer (also called diminuendo). Keep your tone supported.</p></div></div>`);
  dr.insertAdjacentHTML("beforeend",`<div class="ref"><div class="sym"><svg viewBox="0 0 60 34" width="52"><path d="M2 32 L2 26 L30 12 L58 6 L58 32 Z" fill="${GREEN}" stroke="#3f7f1f"/></svg></div><div><b>Loudness lane</b><p>The green shape under the music shows how loud each note should be. Taller = louder.</p></div></div>`);
}

/* ---------------- playback ---------------- */
function play(){
  if(playing){ stopPlayback(); return; }
  if(S.mode==="quiz"){ Quiz.play(); }
  else if(isWarm()){ playWarm(); return; }
  else playExample({notes:st().notes, mode:S.mode, inst:inst(), pattern:S.pattern, tempo:S.tempo, countin:S.countin, metro:S.metro, render:R, cursor:S.cursor, sound:S.sound, onStatus:setStatus});
  setPlayLabels(true);
}
function setPlayLabels(on){ $("play").textContent=on?"■ Stop":"▶ Play"; $("pPlay").textContent=on?"■ Stop":"▶ Play"; }
document.addEventListener("playback-stopped",()=>setPlayLabels(false));

/* ---------------- mode / new ---------------- */
function setMode(m){
  S.mode=m; store.set("mode",m);
  if(m!=="quiz") S.reveal=false;
  if(typeof Mic!=="undefined" && Mic.close) Mic.close();
  draw();
}
function newHere(){
  if(S.mode==="quiz") return Quiz.newQuestion();
  if(isWarm()){ S.dynView="random"; store.set("dynView","random"); }
  S[S.mode].notes=newExample(S.mode); S[S.mode].sel=-1; S.reveal=false; dirty(); draw();
}

/* ---------------- share ---------------- */
function shareURL(){ return location.origin+location.pathname+"#ex="+encodeExample(S.mode,st().notes,S.pattern,S.tempo); }
function openShare(){
  const pop=$("sharePop"), url=shareURL(), b=$("share").getBoundingClientRect();
  pop.innerHTML=`<b>Share this example</b><p class="hint" style="margin:4px 0 8px">Anyone who opens the link sees this exact ${S.mode==="art"?"measure":"example"} in their own instrument's key. Paste it into Brightspace or project it later.</p>
    <div style="display:flex;gap:8px"><input id="shareUrl" readonly value="${url}"><button id="shareCopy" class="btn primary">Copy</button></div><div id="shareMsg" class="hint" style="margin-top:6px"></div>`;
  pop.style.left=Math.max(8,Math.min(window.innerWidth-470,b.left+window.scrollX))+"px"; pop.style.top=(b.bottom+window.scrollY+6)+"px";
  pop.classList.remove("hidden");
  const inp=$("shareUrl"); inp.focus(); inp.select();
  $("shareCopy").onclick=async()=>{
    try{ await navigator.clipboard.writeText(url); $("shareMsg").textContent="Copied!"; }
    catch(e){ inp.select(); document.execCommand && document.execCommand("copy"); $("shareMsg").textContent="Press Ctrl+C to copy."; }
  };
}
function closeShare(){ $("sharePop").classList.add("hidden"); }
$("share").onclick=e=>{ e.stopPropagation(); $("sharePop").classList.contains("hidden")? openShare() : closeShare(); };
document.addEventListener("click",e=>{ if(!$("sharePop").contains(e.target) && e.target!==$("share")) closeShare(); });
function loadFromHash(){
  const m=location.hash.match(/ex=([^&]+)/); if(!m) return false;
  const ex=decodeExample(m[1]); if(!ex) return false;
  S.mode=ex.mode; S.pattern=ex.pattern; S.tempo=ex.tempo;
  S[ex.mode].notes=ex.notes; S[ex.mode].sel=-1;
  return true;
}

/* ---------------- presentation & full screen ---------------- */
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function requestFs(){ const de=document.documentElement, req=de.requestFullscreen||de.webkitRequestFullscreen; if(req) Promise.resolve(req.call(de)).catch(()=>{}); }
function exitFs(){ if(fsEl()) (document.exitFullscreen||document.webkitExitFullscreen).call(document); }
function toggleFullscreen(){ fsEl()? exitFs() : requestFs(); }
function enterPresent(){
  S.present=true; S.reveal=false; document.documentElement.classList.add("present"); $("presentBar").classList.remove("hidden");
  closeDrawer(); if(!BOARD) requestFs(); draw();
}
function exitPresent(){
  if(!S.present) return;
  if(BOARD){ stopPlayback(); try{ window.parent.postMessage({artDyn:"close"},"*"); }catch(e){} return; }
  S.present=false; S.presentFs=false; document.documentElement.classList.remove("present"); $("presentBar").classList.add("hidden");
  exitFs(); draw();
}
function onFsChange(){
  const on=!!fsEl();
  document.documentElement.classList.toggle("is-fs",on);
  $("fs").textContent = on? "✕" : "⛶"; $("fs").title = on? "Exit full screen (F)" : "Full screen (F)";
  if(on && S.present) S.presentFs=true;
  if(!on && S.present && S.presentFs) exitPresent();   // Esc out of full screen also leaves presentation mode
}
document.addEventListener("fullscreenchange",onFsChange);
document.addEventListener("webkitfullscreenchange",onFsChange);
if(!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen)) $("fs").classList.add("hidden");
$("fs").onclick=toggleFullscreen;
$("present").onclick=()=> S.present? exitPresent() : enterPresent();
$("pExit").onclick=exitPresent;
$("pPlay").onclick=play;
$("pNew").onclick=()=>newHere();
$("pWarm").onclick=()=>{ S.dynView = S.dynView==="warmup"? "random" : "warmup"; store.set("dynView",S.dynView); S.reveal=false; draw(); };
$("dynView").querySelectorAll("button").forEach(b=>b.onclick=()=>{ S.dynView=b.dataset.v; store.set("dynView",S.dynView); draw(); });
["warmSel","pWarmSel"].forEach(id=>$(id).querySelectorAll("button").forEach(b=>b.onclick=()=>setWarmSel(b.dataset.v)));
$("warmPlay").onclick=()=>{ if(playing) stopPlayback(); else playWarm(); };
$("pMode").onclick=()=>{ S.mode = S.mode==="art"? "dyn" : "art"; S.reveal=false; draw(); };
function nudgeTempo(d){ S.tempo=Math.max(50,Math.min(160,S.tempo+d)); store.set("tempo",S.tempo); $("tempo").value=S.tempo; $("tempoVal").textContent=S.tempo+" bpm"; updateChrome(); }
$("pSlower").onclick=()=>nudgeTempo(-4); $("pFaster").onclick=()=>nudgeTempo(4);
$("pReveal").onclick=()=>{ if(S.mode==="quiz") Quiz.reveal(); else { S.reveal=!S.reveal; draw(); } };

/* ---------------- settings drawer ---------------- */
function openDrawer(){ $("drawer").classList.add("open"); $("scrim").classList.remove("hidden"); }
function closeDrawer(){ $("drawer").classList.remove("open"); $("scrim").classList.add("hidden"); }
$("gear").onclick=openDrawer; $("drawerClose").onclick=closeDrawer; $("scrim").onclick=closeDrawer;

/* ---------------- wiring ---------------- */
$("tabArt").onclick=()=>setMode("art");
$("tabDyn").onclick=()=>setMode("dyn");
$("tabQuiz").onclick=()=>setMode("quiz");
$("aNewAll").onclick=$("dNewAll").onclick=()=>newHere();
$("aNewRhythm").onclick=()=>{ S.art.notes=newExample("art"); S.art.sel=-1; dirty(); draw(); };
$("dNewRhythm").onclick=()=>{ S.dyn.notes=newExample("dyn"); S.dyn.sel=-1; dirty(); draw(); };
$("aShuffle").onclick=()=>{ randomizeArts(S.art.notes,S.pool); dirty(); draw(); };
$("aClear").onclick=()=>{ S.art.notes.forEach(n=>n.art=null); dirty(); draw(); };
$("dShuffle").onclick=()=>{ randomizeDyns(S.dyn.notes,S.dynRange[0],S.dynRange[1]); S.dyn.sel=-1; dirty(); draw(); };
$("dClear").onclick=()=>{ S.dyn.notes.forEach(n=>{n.dyn=null;n.hp=null;}); dirty(); draw(); };
$("play").onclick=play;
$("micBtn").onclick=()=>Mic.toggle();
$("tempo").value=S.tempo; $("tempoVal").textContent=S.tempo+" bpm";
$("tempo").oninput=e=>{ S.tempo=+e.target.value; $("tempoVal").textContent=S.tempo+" bpm"; store.set("tempo",S.tempo); };
$("labels").checked=S.labels; $("labels").onchange=e=>{ S.labels=e.target.checked; store.set("labels",S.labels); draw(); };
$("shapes").checked=S.shapes; $("shapes").onchange=e=>{ S.shapes=e.target.checked; store.set("shapes",S.shapes); draw(); };
$("countin").checked=S.countin; $("countin").onchange=e=>{ S.countin=e.target.checked; store.set("countin",S.countin); };
$("metro").checked=S.metro; $("metro").onchange=e=>{ S.metro=e.target.checked; store.set("metro",S.metro); };
$("cursor").checked=S.cursor; $("cursor").onchange=e=>{ S.cursor=e.target.checked; store.set("cursor",S.cursor); if(!S.cursor) removeCursor(); };
$("sound").value=S.sound; $("sound").onchange=e=>{ S.sound=e.target.value; store.set("sound",S.sound); };
$("inst").onchange=e=>{
  S.inst=e.target.value; store.set("inst",S.inst);
  if(S.sound==="inst" && !inst().perc){ audio(); loadSamples(inst()).catch(()=>{}); }   // preload while they look at the music
  draw();
};
$("pattern").onchange=e=>{
  S.pattern=e.target.value; store.set("pattern",S.pattern);
  [S.art.notes,S.dyn.notes].forEach(ns=>{ if(!patternMoves(S.pattern)) ns.forEach(n=>n.sl=false); repitch(ns); });
  if(typeof Quiz!=="undefined" && Quiz.onPatternChange) Quiz.onPatternChange();
  dirty(); draw();
};
function applyTheme(t){ document.documentElement.dataset.theme=t; store.set("theme",t); $("darkTheme").checked=t==="dark"; }
$("darkTheme").onchange=e=>applyTheme(e.target.checked?"dark":"light");

document.addEventListener("keydown",e=>{
  const tg=e.target; if(tg.tagName==="SELECT" || (tg.tagName==="INPUT" && !["checkbox","range"].includes(tg.type))) return;
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  const k=e.key;
  if(k===" "){ e.preventDefault(); play(); return; }
  if(k==="n"||k==="N"){ newHere(); return; }
  if(!BOARD && (k==="p"||k==="P")){ S.present? exitPresent() : enterPresent(); return; }
  if(!BOARD && (k==="f"||k==="F")){ toggleFullscreen(); return; }
  if(k==="r"||k==="R"){ $("pReveal").click(); return; }
  if(k==="Escape"){ if(S.present){ exitPresent(); return; } closeDrawer(); closeShare(); if(S.mode!=="quiz"){ st().sel=-1; applySel(); updatePanels(); } return; }
  if(S.mode==="quiz"){ Quiz.onKey && Quiz.onKey(e); return; }
  if(isWarm()) return;
  const s=st(); const notes=s.notes;
  const selectable=notes.map((n,i)=>i).filter(i=>!notes[i].rest);
  if(k==="ArrowRight"||k==="ArrowLeft"){
    e.preventDefault(); if(!selectable.length) return;
    let pos=selectable.indexOf(s.sel);
    pos = pos<0? 0 : (pos+(k==="ArrowRight"?1:selectable.length-1))%selectable.length;
    s.sel=selectable[pos]; applySel(); updatePanels(); return;
  }
  if(s.sel<0) return;
  if(k==="ArrowUp"||k==="ArrowDown"){ e.preventDefault(); if(patternMoves(S.pattern)&&!inst().perc) changePitch(k==="ArrowUp"?1:-1); return; }
  if(k==="s"||k==="S"){ const b=$(S.mode==="art"?"aTools":"dTools").querySelector("[data-tool=slur]"); if(!b.disabled) b.click(); return; }
  if(k==="t"||k==="T"){ const b=$(S.mode==="art"?"aTools":"dTools").querySelector("[data-tool=tie]"); if(!b.disabled) b.click(); return; }
  if(S.mode==="art" && /^[0-5]$/.test(k) && !notes[s.sel].rest) editSel(n=>n.art=ARTS[+k].id);
});

/* ---------------- start ---------------- */
$("ver").textContent=VERSION;
applyTheme(store.get("theme", matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"));
buildStatic();
$("inst").value=S.inst; $("pattern").value=S.pattern;
if(BOARD){
  const lv=LEVELS[QS.get("lvl")]||LEVELS["7th"];
  Object.assign(S,{ inst:"neutral", pattern:"single_F", tempo:lv.tempo, dynRange:lv.range, labels:false, shapes:true,
    countin:true, metro:true, cursor:true, sound:"inst", mode: QS.get("mode")==="dyn"? "dyn" : "art",
    pool:Object.assign({stacc:false,ten:false,acc:false,marc:false,lift:false,none:false},lv.pool), artOpt:lv.art, dynOpt:lv.dyn });
  const seed=QS.get("seed")||new Date().toDateString();
  S.art.notes=withSeed(seed+"|art",()=>newExample("art"));      // same example all day for this class
  S.dyn.notes=withSeed(seed+"|dyn",()=>newExample("dyn"));
  document.documentElement.classList.add("board");
  $("tempo").value=S.tempo; $("tempoVal").textContent=S.tempo+" bpm";
  $("pExit").textContent="✕ Back to agenda";
}
const fromLink=!BOARD && loadFromHash();
if(fromLink){ $("pattern").value=S.pattern; $("tempo").value=S.tempo; $("tempoVal").textContent=S.tempo+" bpm"; }
if(!S.art.notes.length) S.art.notes=newExample("art");
if(!S.dyn.notes.length) S.dyn.notes=newExample("dyn");
if(typeof Quiz!=="undefined" && Quiz.init) Quiz.init();
if(typeof Quiz==="undefined"){ $("tabQuiz").classList.add("hidden"); }
setMode(S.mode);
if(BOARD) enterPresent();
