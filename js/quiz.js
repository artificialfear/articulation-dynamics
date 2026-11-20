"use strict";
/* =====================================================================
   quiz.js — Listening Quiz
   Types:  name  (Articulations only) – markings hidden, identify each note
           spot  – one note/spot is PLAYED differently than written; find it
           which – three versions shown (A/B/C); which one is playing?
   Modes:  class – whole class answers aloud, teacher presses Reveal
           solo  – student answers on their device; running score
   ===================================================================== */
const CONTRAST = { stacc:["ten","acc",null], ten:["stacc","marc"], acc:["stacc","marc"], marc:["ten","acc"], lift:["stacc","marc"], none:["stacc","marc","acc"] };
const Q = { topic:"art", type:"name", mode:"class", q:null, score:{right:0,total:0,streak:0}, renders:[] };
const artName = a => a? ART_BY[a].name : "None";

const Quiz = {
  init(){
    Q.topic=store.get("qTopic","art"); Q.type=store.get("qType","name"); Q.mode=store.get("qMode","class");
    segInit("qTopic","topic"); segInit("qType","type"); segInit("qMode","mode");
    $("qNew").onclick=()=>Quiz.newQuestion();
    $("qReveal").onclick=()=>Quiz.reveal();
    $("qCheck").onclick=()=>Quiz.check();
    $("qResetScore").onclick=()=>{ Q.score={right:0,total:0,streak:0}; Quiz.updateChrome(); };
    const pal=$("qPal"); pal.innerHTML="";
    ARTS.forEach((a,k)=>mkBtn(pal,`<span class="sym">${a.id?artGlyph(a.id):NONE_SYM}</span><span class="nm">${k}·${a.name}</span>`,()=>Quiz.answer(a.id),{art:a.id||""}));
    if(!document.getElementById("banner")){ const b=document.createElement("div"); b.id="banner"; b.className="quiz-msg hidden"; $("scoreWrap").appendChild(b); }
  },
  /* ---------- questions ---------- */
  newQuestion(){
    stopPlayback();
    if(Q.topic==="dyn" && Q.type==="name") Q.type="spot";
    let base=newExample(Q.topic);
    for(let k=0;k<20 && Q.topic==="art" && artEligible(base).length<3;k++) base=newExample("art");   // enough notes to quiz on
    const q={topic:Q.topic,type:Q.type,mode:Q.mode,notes:base,revealed:false,checked:false,answers:{},sel:-1,msg:""};
    if(Q.type==="name"){
      q.targets=artEligible(base);
    } else if(Q.type==="spot"){
      q.played=clone(base);
      if(Q.topic==="art"){
        const i=pick(artEligible(base)), was=base[i].art, now=pick(CONTRAST[was||"none"]);
        q.played[i].art=now; q.wrong=[i];
        q.explain=`Note ${i+1} is written ${artName(was)} but was played ${artName(now)}.`;
      } else spotDyn(q);
    } else {
      // options must sound different: articulation patterns differ; dynamics differ in contour
      // (which way and how the loudness moves), not just in starting level
      const contour = v => { const out=[]; let last=null; v.forEach(n=>{ if(n.dyn!==null){ if(last!==null) out.push(Math.sign(n.dyn-last)); last=n.dyn; } out.push(n.hp||""); }); return JSON.stringify(out); };
      const seen=new Set(), opts=[];
      for(let pass=0; pass<2 && opts.length<3; pass++){
        for(let tries=0; opts.length<3 && tries<80; tries++){
          const v=clone(base);
          if(Q.topic==="art") randomizeArts(v,S.pool); else randomizeDyns(v);
          const key = Q.topic==="art"? JSON.stringify(v.map(n=>n.art)) : (pass===0? contour(v) : JSON.stringify(v.map(n=>[n.dyn,n.hp])));
          if(!seen.has(key)){ seen.add(key); opts.push(v); }
        }
      }
      q.options=opts; q.answer=rnd(opts.length);
    }
    Q.q=q; Quiz.draw();
  },
  draw(){
    if(!Q.q || Q.q.topic!==Q.topic || Q.q.type!==Q.type) return Quiz.newQuestion();
    const q=Q.q, host=$("score"); Q.q.mode=Q.mode;
    const reveal = q.revealed || q.checked;
    const base={mode:q.topic, inst:inst(), pattern:S.pattern};
    if(q.type==="which"){
      host.innerHTML=`<div id="qWhich"></div>`; const w=$("qWhich"); Q.renders=[];
      q.options.forEach((v,k)=>{
        const d=document.createElement("div"); d.className="opt"; d.dataset.k=k;
        if(reveal && k===q.answer) d.classList.add("right");
        if(reveal && q.picked===k && k!==q.answer) d.classList.add("wrong");
        d.innerHTML=`<div class="lbl">${"ABC"[k]}</div><div class="sc"></div>`; w.appendChild(d);
        Q.renders.push(renderScore(d.querySelector(".sc"),Object.assign({},base,{notes:v,showArts:true,showDyns:true,labels:reveal&&S.labels,shapes:false})));
      });
      R=null;
    } else {
      let notes=q.notes, cfg;
      if(q.type==="name"){
        if(reveal){
          const marks={}; if(q.checked) q.targets.forEach(i=>{ const ok=(q.answers[i]||null)===(q.notes[i].art||null); marks[i]=ok?{text:"✓",color:"#16a34a"}:{text:"✗ "+artName(q.notes[i].art),color:"#dc2626"}; });
          cfg={notes,showArts:true,labels:S.labels||q.revealed,shapes:S.shapes,marks:q.checked?marks:null};
        } else {
          notes=clone(q.notes); notes.forEach((n,i)=>n.art = q.answers.hasOwnProperty(i)? q.answers[i] : null);
          cfg={notes,showArts:true,labels:false,shapes:false,qmarks:q.targets.filter(i=>!q.answers.hasOwnProperty(i))};
        }
      } else {
        cfg={notes,showArts:true,showDyns:true,labels:reveal&&S.labels,shapes:reveal&&S.shapes};
      }
      R=renderScore(host,Object.assign({},base,{showDyns:true},cfg));
      Q.renders=[R];
      if(q.type==="name" && !reveal && q.sel>=0 && R.els[q.sel]) R.els[q.sel].classList.add("sel");
      if(q.type==="spot" && reveal){
        q.wrong.forEach(i=>R.els[i]&&R.els[i].classList.add("wrong"));
        if(q.picked!==undefined && !q.wrong.includes(q.picked) && R.els[q.picked]) R.els[q.picked].classList.add("sel");
      }
    }
    Quiz.updateChrome();
  },
  /* ---------- playback ---------- */
  play(){
    const q=Q.q; if(!q) return;
    const notes = q.type==="spot"? q.played : q.type==="which"? q.options[q.answer] : q.notes;
    const showWhere = q.type!=="which";            // never highlight which option is playing
    playExample({visualDelay:VIS_DELAY, notes, mode:q.topic, inst:inst(), pattern:S.pattern, tempo:S.tempo, countin:S.countin, metro:S.metro,
      render: showWhere? R : null, cursor: showWhere && S.cursor, sound:S.sound, onStatus:setStatus});
  },
  /* ---------- answering ---------- */
  onScoreClick(e){
    const q=Q.q; if(!q || q.revealed || q.checked) return;
    if(q.type==="which"){
      const opt=e.target.closest(".opt"); if(!opt || Q.mode!=="solo") return;
      q.picked=+opt.dataset.k; Quiz.grade(q.picked===q.answer); return;
    }
    if(!R) return;
    const i=nearestNote(R,e); if(i<0) return;
    if(q.type==="name"){ if(Q.mode!=="solo" || !q.targets.includes(i)) return; q.sel=i; Quiz.draw(); }
    else if(q.type==="spot" && Q.mode==="solo"){ q.picked=i; Quiz.grade(q.wrong.includes(i)); }
  },
  answer(art){
    const q=Q.q; if(!q || q.type!=="name" || q.sel<0 || q.checked) return;
    q.answers[q.sel]=art;
    const next=q.targets.find(i=>!q.answers.hasOwnProperty(i));   // jump to the next unanswered note
    q.sel = next===undefined? -1 : next;
    Quiz.draw();
  },
  check(){
    const q=Q.q; if(!q || q.type!=="name" || q.checked) return;
    const right=q.targets.filter(i=>(q.answers[i]||null)===(q.notes[i].art||null)).length, n=q.targets.length;
    q.checked=true;
    Q.score.right+=right; Q.score.total+=n; Q.score.streak = right===n? Q.score.streak+1 : 0;
    q.msg = right===n? `Perfect — all ${n} correct!` : `${right} of ${n} correct. The right answers are shown in red under the notes you missed.`;
    q.good = right===n; Quiz.draw();
  },
  grade(ok){
    const q=Q.q; q.checked=true;
    Q.score.total++; if(ok){ Q.score.right++; Q.score.streak++; } else Q.score.streak=0;
    if(q.type==="which") q.msg = ok? `Yes — it was ${"ABC"[q.answer]}!` : `Not quite — it was ${"ABC"[q.answer]}.`;
    else q.msg = (ok? "Yes! " : "Not that one. ") + q.explain;
    q.good=ok; Quiz.draw();
  },
  reveal(){
    const q=Q.q; if(!q) return;
    q.revealed=!q.revealed || q.checked;
    if(q.type==="spot") q.msg=q.explain;
    else if(q.type==="which") q.msg=`It was ${"ABC"[q.answer]}.`;
    else q.msg="Here are the articulations.";
    q.good=true; Quiz.draw();
  },
  /* ---------- chrome ---------- */
  updateChrome(){
    const q=Q.q, solo=Q.mode==="solo";
    segSet("qTopic",Q.topic); segSet("qType",Q.type); segSet("qMode",Q.mode);
    $("qType").querySelector("[data-v=name]").disabled = Q.topic==="dyn";
    $("qCheck").classList.toggle("hidden", !(solo && Q.type==="name"));
    $("qReveal").classList.toggle("hidden", solo && Q.type!=="name");
    $("qScore").classList.toggle("hidden",!solo); $("qResetScore").classList.toggle("hidden",!solo);
    $("qScore").textContent=`Score ${Q.score.right}/${Q.score.total}`+(Q.score.streak>1? ` · 🔥 ${Q.score.streak} in a row`:"");
    const topicWord = Q.topic==="art"? "articulation" : "dynamics";
    const P = {
      name:  solo? "Listen, then tap each ? note and pick its articulation. Press Check when you're done." : "Listen, then name each note's articulation out loud. Press Reveal to check.",
      spot:  Q.topic==="art"
               ? (solo? "One note is played with the wrong articulation. Listen, then tap that note." : "One note is played with the wrong articulation. Which one? Press Reveal to check.")
               : (solo? "One spot is played with the wrong dynamics. Listen, then tap where it went wrong." : "One spot is played with the wrong dynamics. Where? Press Reveal to check."),
      which: solo? `Three versions with different ${topicWord}. Listen, then tap the one being played.` : `Three versions with different ${topicWord}. Which one is being played? Press Reveal to check.`,
    };
    $("qPrompt").textContent=P[Q.type];
    const showPal = Q.type==="name" && solo;
    $("qPal").classList.toggle("hidden",!showPal);
    if(showPal) [...$("qPal").children].forEach(b=>{ b.disabled = !q || q.sel<0 || q.checked; b.classList.toggle("on", !!q && q.sel>=0 && (b.dataset.art||null)===(q.answers[q.sel]??"__")); });
    $("qCheck").disabled = !q || q.checked || (q.targets||[]).some(i=>!q.answers.hasOwnProperty(i));
    const ban=$("banner"); const msg=q&&q.msg? q.msg : "";
    ban.textContent=msg; ban.className="quiz-msg"+(msg?"":" hidden")+(q&&q.msg? (q.good?" good":" bad"):"");
    $("qMsg").textContent="";
  },
  onKey(e){
    const q=Q.q; if(!q) return;
    if(q.type==="name" && Q.mode==="solo" && !q.checked){
      if(/^[0-5]$/.test(e.key) && q.sel>=0){ Quiz.answer(ARTS[+e.key].id); return; }
      if(e.key==="ArrowRight"||e.key==="ArrowLeft"){ e.preventDefault(); const t=q.targets; let p=t.indexOf(q.sel); p=p<0?0:(p+(e.key==="ArrowRight"?1:t.length-1))%t.length; q.sel=t[p]; Quiz.draw(); return; }
      if(e.key==="Enter"){ Quiz.check(); return; }
    }
    if(q.type==="which" && Q.mode==="solo" && !q.checked && /^[abcABC123]$/.test(e.key)){
      const k="abc123".indexOf(e.key.toLowerCase())%3; if(k<q.options.length){ q.picked=k; Quiz.grade(k===q.answer); }
    }
  },
  onPatternChange(){ Q.q=null; },
};
function segInit(id,key){
  $(id).querySelectorAll("button").forEach(b=>b.onclick=()=>{ if(b.disabled) return; Q[key]=b.dataset.v; store.set("q"+key[0].toUpperCase()+key.slice(1),Q[key]); Quiz.newQuestion(); });
}
function segSet(id,v){ $(id).querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.v===v)); }

/* dynamics "spot the mistake": change one marking's level, or turn a hairpin the wrong way */
function spotDyn(q){
  const ns=q.notes, marks=ns.map((n,i)=>i).filter(i=>ns[i].dyn!==null), hps=ns.map((n,i)=>i).filter(i=>ns[i].hp);
  const regionTo = i => { const j=hpEnd(ns,i); return j<0? ns.length-1 : j; };
  if(hps.length && Math.random()<0.6){
    const i=pick(hps), j=hpEnd(ns,i);
    let from=null; for(let k=i;k>=0;k--) if(ns[k].dyn!==null){ from=ns[k].dyn; break; }
    if(j>=0){
      const to=ns[j].dyn, opp=Math.max(0,Math.min(5,from-(to-from)));
      if(opp===from){ q.played[j].dyn = from<=2? 5 : 0; } else q.played[j].dyn=opp;
      q.played[i].hp = ns[i].hp==="cresc"? "dim" : "cresc";
    } else q.played[i].hp = ns[i].hp==="cresc"? "dim" : "cresc";
    q.wrong = ns.map((n,k)=>k).filter(k=>k>=i && k<=(j<0?ns.length-1:j) && !ns[k].rest);
    q.explain = `The ${ns[i].hp==="cresc"?"crescendo":"decrescendo"} starting on note ${i+1} was played ${ns[i].hp==="cresc"?"getting softer":"getting louder"}.`;
  } else {
    const m=pick(marks), cur=ns[m].dyn;
    let to; do{ to=rnd(6); } while(Math.abs(to-cur)<2);
    q.played[m].dyn=to;
    const nxt=ns.findIndex((n,k)=>k>m && n.dyn!==null);
    q.wrong = ns.map((n,k)=>k).filter(k=>k>=m && (nxt<0? true : k<nxt) && !ns[k].rest);
    q.explain = `Note ${m+1} is marked ${DYNS[cur]} (${DYN_NAME[DYNS[cur]]}) but was played ${DYNS[to]} (${DYN_NAME[DYNS[to]]}).`;
  }
}
