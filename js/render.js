"use strict";
/* =====================================================================
   render.js — VexFlow drawing for one example (1 or 2 measures), plus
   the small glyph icons used in buttons and reference cards.
   ===================================================================== */
const VF = (window.Vex && Vex.Flow) || window.VexFlow;
const SVGNS = "http://www.w3.org/2000/svg";
const GREEN = "#6cbf3a";
const DYN_GLYPH = { p:"dynamicPiano", m:"dynamicMezzo", f:"dynamicForte" };

function svgEl(tag,attrs,parent){ const e=document.createElementNS(SVGNS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); if(parent) parent.appendChild(e); return e; }
function svgText(svg,x,y,txt,o={}){
  const t=svgEl("text",{x,y,"text-anchor":o.anchor||"middle","font-family":"system-ui,Segoe UI,Arial,sans-serif","font-size":o.size||13,fill:o.color||"#444"},svg);
  if(o.italic) t.setAttribute("font-style","italic"); if(o.bold) t.setAttribute("font-weight","700");
  t.textContent=txt; return t;
}
function shapeMarkup(x,y,w,h,art,sound){
  const sh=SHAPE[art||"none"], sw=w*(sound===undefined? sh.sound : sound);
  let m=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#222" stroke-width="1.2"/>`;
  m += sh.decay ? `<polygon points="${x},${y} ${x+sw},${y+h/2} ${x},${y+h}" fill="${GREEN}"/>`
                : `<rect x="${x}" y="${y}" width="${sw}" height="${h}" fill="${GREEN}"/>`;
  m += `<rect x="${x}" y="${y}" width="${sw}" height="${h}" fill="none" stroke="#222" stroke-width="1.4" stroke-dasharray="3 2"/>`;
  return m;
}
function dynWidth(text,size){ let w=0; for(const ch of text) w+=new VF.Glyph(DYN_GLYPH[ch],size).getMetrics().width; return w; }
function drawDyn(ctx,text,x,y,size){ let cx=x; for(const ch of text){ const g=new VF.Glyph(DYN_GLYPH[ch],size); g.render(ctx,cx,y); cx+=g.getMetrics().width; } return cx-x; }
const noteCenter = sn => (sn.getNoteHeadBeginX()+sn.getNoteHeadEndX())/2;

function padRests(measureNotes,offset){
  let pos=measureNotes.reduce((t,n)=>t+DUR_BEATS[n.dur],0);
  const out=[];
  if(pos===0){ out.push({dur:"w",start:offset}); return out; }
  if(pos%1){ out.push({dur:"8",start:offset+pos}); pos+=0.5; }
  while(pos<4){ out.push({dur:"q",start:offset+pos}); pos+=1; }
  return out;
}
function beatToX(anchors,beat){
  if(beat<=anchors[0][0]) return anchors[0][1];
  for(let k=1;k<anchors.length;k++){
    if(beat<=anchors[k][0]){ const [b0,x0]=anchors[k-1],[b1,x1]=anchors[k]; return x0+(x1-x0)*(beat-b0)/Math.max(1e-6,b1-b0); }
  }
  return anchors[anchors.length-1][1];
}

/* cfg: {mode, notes, inst, pattern, showArts, showDyns, labels, shapes, qmarks, marks, width, hideIdx} */
function renderScore(host,cfg){
  host.innerHTML="";
  const inst=cfg.inst, M=measuresFor(cfg.mode), notes=cfg.notes;
  const W = cfg.width || (M===1? 760 : 1000);
  const r=new VF.Renderer(host,VF.Renderer.Backends.SVG); r.resize(W,500);
  const ctx=r.getContext(), svg=ctx.svg;
  const key=writtenKey(inst,cfg.pattern), clef=inst.clef, Y=70;
  const split=Math.round(W*0.515);
  const geo = M===1? [[10,W-20]] : [[10,split-10],[split,W-split-10]];
  const vfn=new Array(notes.length).fill(null);
  const items=[]; // every tickable with its beat (for spacing, shape bars, and the cursor)
  const staves=[];
  const STEM_UP = VF.Stem.UP;

  geo.forEach(([x,w],m)=>{
    const stave=new VF.Stave(x,Y,w);
    if(m===0){ stave.addClef(clef); if(key!=="C") stave.addKeySignature(key); stave.addTimeSignature("4/4"); }
    if(m===M-1) stave.setEndBarType(VF.Barline.type.END);
    stave.setContext(ctx).draw(); staves.push(stave);
    const idx=notes.map((n,i)=>i).filter(i=>Math.floor(notes[i].start/4+1e-9)===m);
    const tick=[];
    idx.forEach(i=>{
      const n=notes[i];
      const sn = n.rest
        ? new VF.StaveNote({clef, keys:[restKey(inst,n.dur)], duration:n.dur+"r"})
        : new VF.StaveNote({clef, keys:[noteKey(inst,cfg.pattern,n.p)], duration:n.dur, auto_stem:true});
      vfn[i]=sn; tick.push(sn); items.push({start:n.start,sn,i});
    });
    const pads=padRests(idx.map(i=>notes[i]),m*4).map(rs=>{
      const sn=new VF.StaveNote({clef, keys:[restKey(inst,rs.dur)], duration:rs.dur+"r"});
      sn.setStyle({fillStyle:"#b5b9c4",strokeStyle:"#b5b9c4"});
      items.push({start:rs.start,sn,i:-1}); return sn;
    });
    const beams = tick.length? VF.Beam.generateBeams(tick,{groups:[new VF.Fraction(1,4)], beam_rests:false}) : [];
    // articulations go on the notehead side (marcato always above), after beams fix stem directions
    if(cfg.showArts) idx.forEach(i=>{
      const n=notes[i]; if(n.rest||!n.art||(cfg.hideIdx&&cfg.hideIdx.includes(i))) return;
      const up = vfn[i].getStemDirection()===STEM_UP;
      ART_BY[n.art].codes.forEach(c=>{
        const pos = (c==="a^"||!up)? VF.Modifier.Position.ABOVE : VF.Modifier.Position.BELOW;
        vfn[i].addModifier(new VF.Articulation(c).setPosition(pos),0);
      });
    });
    const voice=new VF.Voice({num_beats:4,beat_value:4}).setMode(VF.Voice.Mode.SOFT).addTickables(tick.concat(pads));
    if(!inst.perc) VF.Accidental.applyAccidentals([voice], key);
    new VF.Formatter({softmaxFactor:150}).joinVoices([voice]).formatToStave([voice],stave);
    voice.draw(ctx,stave);
    beams.forEach(b=>b.setContext(ctx).draw());
  });
  // ties and slurs
  notes.forEach((n,i)=>{
    if(n.tie && vfn[i] && vfn[i+1] && !notes[i+1].rest)
      new VF.StaveTie({first_note:vfn[i],last_note:vfn[i+1],first_indices:[0],last_indices:[0]}).setContext(ctx).draw();
  });
  for(let i=0;i<notes.length;i++){
    if(!notes[i].sl || notes[i].rest) continue;
    let j=i; while(notes[j].sl && j+1<notes.length && !notes[j+1].rest) j++;
    if(j>i){
      const up = vfn[i].getStemDirection()===STEM_UP;
      new VF.Curve(vfn[i],vfn[j],{ cps:[{x:0,y:12},{x:0,y:12}], invert: !up }).setContext(ctx).draw();
    }
    i=j;
  }

  items.sort((a,b)=>a.start-b.start);
  const els=vfn.map((sn,i)=> sn && !notes[i].rest ? sn.getSVGElement() : null);
  const xs=vfn.map((sn,i)=> sn && !notes[i].rest ? noteCenter(sn) : null);
  const endX=staves[M-1].getX()+staves[M-1].getWidth()-10;
  const anchors=items.map(it=>[it.start,noteCenter(it.sn)]); anchors.push([M*4,endX]);
  let bb=svg.getBBox(); let bottom=bb.y+bb.height;
  const topLine=staves[0].getYForLine(0), botLine=staves[0].getYForLine(4);
  bottom=Math.max(bottom, botLine+28);

  // quiz: "?" above each note students must identify
  if(cfg.qmarks){
    const qy=Math.min(bb.y, topLine-10)-6;
    cfg.qmarks.forEach(i=>{ if(xs[i]!=null) svgText(svg,xs[i],qy,"?",{size:22,bold:true,color:"#6d28d9"}); });
  }

  let y=bottom+12;
  if(cfg.mode==="art"){
    if(cfg.shapes){
      const h=20; let m=""; var bars={};
      items.forEach((it,k)=>{
        if(it.i<0) return; const n=notes[it.i]; if(n.rest) return;
        const x=it.sn.getNoteHeadBeginX()-3;
        const nxt = k<items.length-1 ? items[k+1].sn.getNoteHeadBeginX()-9 : endX;
        const sound = (n.sl||n.tie)? 1 : undefined;
        m+=shapeMarkup(x,y,Math.max(14,nxt-x),h, (n.sl||n.tie)? (n.art==="acc"?"acc":"ten") : n.art, sound);
        bars[it.i]={x,y,w:Math.max(14,nxt-x),h};
      });
      const g=svgEl("g",{class:"shapes"},svg); g.innerHTML=m;
      y+=h+16;
    } else y+=8;
    if(cfg.labels && cfg.showArts) notes.forEach((n,i)=>{ if(n.art && xs[i]!=null) svgText(svg,xs[i],y,ART_BY[n.art].name,{size:12}); });
    if(cfg.labels) y+=16;
  } else {
    const dy=y+26, SZ=38, dynBox={};
    const lefts=vfn.map(sn=>sn? sn.getNoteHeadBeginX():null);
    if(cfg.showDyns){
      notes.forEach((n,i)=>{
        if(n.dyn===null||n.rest||(cfg.hideIdx&&cfg.hideIdx.includes(i))) return;
        const txt=DYNS[n.dyn], w=dynWidth(txt,SZ), x0=lefts[i]-2;
        drawDyn(ctx,txt,x0,dy,SZ); dynBox[i]={x0,x1:x0+w};
        if(cfg.labels) svgText(svg,x0+w/2,dy+22,DYN_NAME[txt],{size:12,italic:true});
      });
      notes.forEach((n,i)=>{
        if(!n.hp||n.rest||(cfg.hideIdx&&cfg.hideIdx.includes(i))) return;
        const xa = dynBox[i]? dynBox[i].x1+8 : lefts[i];
        const j=hpEnd(notes,i);
        let xb = j>=0 && dynBox[j]? dynBox[j].x0-8 : (j>=0? lefts[j]-8 : endX);
        if(xb-xa<24) xb=xa+24;
        const cy=dy-8, h=9;
        ctx.save(); ctx.setLineWidth(1.6); ctx.setStrokeStyle("#111"); ctx.beginPath();
        if(n.hp==="cresc"){ ctx.moveTo(xb,cy-h); ctx.lineTo(xa,cy); ctx.lineTo(xb,cy+h); }
        else { ctx.moveTo(xa,cy-h); ctx.lineTo(xb,cy); ctx.lineTo(xa,cy+h); }
        ctx.stroke(); ctx.restore();
        if(cfg.labels) svgText(svg,(xa+xb)/2,dy+22,n.hp==="cresc"?"crescendo":"decrescendo",{size:12,italic:true});
      });
    }
    y = dy + (cfg.labels? 34 : 14);
    if(cfg.shapes && cfg.showDyns){
      // loudness lane: how loud each note is across time
      const laneH=34, base=y+laneH, L=levelFn(notes);
      svgEl("line",{x1:staves[0].getNoteStartX()-6,x2:endX,y1:base,y2:base,stroke:"#9aa0ad","stroke-width":1},svg);
      playPlan(notes,"dyn").forEach(ev=>{
        const pts=[]; const b0=ev.start, b1=ev.start+ev.sound, K=16;
        for(let k=0;k<=K;k++){ const b=b0+(b1-b0)*k/K; pts.push([beatToX(anchors,b), base-(4+(L(b)/5)*(laneH-4))]); }
        const d=`M${pts[0][0]},${base} `+pts.map(p=>`L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")+` L${pts[K][0]},${base} Z`;
        svgEl("path",{d,fill:GREEN,stroke:"#3f7f1f","stroke-width":1},svg);
      });
      svgText(svg,staves[0].getX()+2,base-4,"loudness",{size:11,anchor:"start",color:"#6b7280",italic:true});
      y=base+14;
    }
  }
  // quiz feedback marks under notes: {i:{text,color}}
  if(cfg.marks){
    Object.entries(cfg.marks).forEach(([i,mk])=>{ if(xs[i]!=null) svgText(svg,xs[i],y+4,mk.text,{size:13,bold:true,color:mk.color}); });
    y+=20;
  }
  bb=svg.getBBox();
  const top=Math.min(bb.y,topLine-30)-8, h=Math.max(bb.y+bb.height,y)-top+8;
  svg.setAttribute("viewBox",`0 ${top} ${W} ${h}`);
  svg.removeAttribute("width"); svg.removeAttribute("height"); svg.style.width="100%"; svg.style.height="auto";
  return {svg,els,xs,anchors,top:topLine-14,bot:botLine+14,W,notes,bars:(typeof bars!=="undefined")?bars:null};
}

/* ---------- small icons ---------- */
function glyphSVG(fn,minW=30,minH=30,scale=1){
  const tmp=document.createElement("div"); tmp.style.cssText="position:absolute;left:-9999px;top:0";
  document.body.appendChild(tmp);
  const r=new VF.Renderer(tmp,VF.Renderer.Backends.SVG); r.resize(300,200);
  const ctx=r.getContext(); fn(ctx);
  const svg=ctx.svg, bb=svg.getBBox(), pad=3;
  const w=Math.max(minW,bb.width+pad*2), h=Math.max(minH,bb.height+pad*2), cx=bb.x+bb.width/2, cy=bb.y+bb.height/2;
  svg.setAttribute("viewBox",`${cx-w/2} ${cy-h/2} ${w} ${h}`);
  svg.removeAttribute("style"); svg.setAttribute("width",Math.round(w*scale)); svg.setAttribute("height",Math.round(h*scale));
  const out=svg.outerHTML; tmp.remove(); return out;
}
const artGlyph = id => glyphSVG(ctx=>{ ART_BY[id].glyphs.forEach((g,k)=>new VF.Glyph(g,40).render(ctx,100,100-k*9)); },30,30,1);
const artNoteGlyph = id => glyphSVG(ctx=>{
  const st=new VF.Stave(0,40,90,{left_bar:false,right_bar:false}); st.options.num_lines=0;
  const n=new VF.StaveNote({keys:["b/4"],duration:"q",stem_direction:-1});
  ART_BY[id].codes.forEach(c=>n.addModifier(new VF.Articulation(c).setPosition(VF.Modifier.Position.ABOVE),0));
  st.setContext(ctx); VF.Formatter.FormatAndDraw(ctx,st,[n]);
},10,10,0.8);
const dynGlyph = txt => glyphSVG(ctx=>drawDyn(ctx,txt,100,100,40),20,40,0.7);
const hairGlyph = type => glyphSVG(ctx=>{
  ctx.setLineWidth(2); ctx.beginPath();
  if(type==="cresc"){ ctx.moveTo(160,90); ctx.lineTo(100,100); ctx.lineTo(160,110); }
  else { ctx.moveTo(100,90); ctx.lineTo(160,100); ctx.lineTo(100,110); }
  ctx.stroke();
},40,40,0.7);
const rhythmIcon = code => glyphSVG(ctx=>{
  const st=new VF.Stave(0,40,code==="88"?110:80,{left_bar:false,right_bar:false}); st.options.num_lines=0;
  const rest=code.endsWith("r"), d=code.replace("r","");
  const durs = code==="88"? ["8","8"] : [d];
  const ns=durs.map(x=>new VF.StaveNote({keys:[rest&&x==="h"?"b/4":"b/4"],duration:x+(rest?"r":""),stem_direction:-1}));
  const bm=code==="88"? [new VF.Beam(ns)] : [];
  st.setContext(ctx); VF.Formatter.FormatAndDraw(ctx,st,ns); bm.forEach(b=>b.setContext(ctx).draw());
  if(rest && d==="h"){ ctx.save(); ctx.setLineWidth(1.2); ctx.beginPath(); ctx.moveTo(bb_l(ns[0])-6,st.getYForLine(2)); ctx.lineTo(bb_l(ns[0])+18,st.getYForLine(2)); ctx.stroke(); ctx.restore(); }
},10,10,0.55);
function bb_l(sn){ return sn.getAbsoluteX(); }
