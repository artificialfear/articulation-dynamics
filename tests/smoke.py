"""Smoke test for the Articulation & Dynamics Trainer.
Usage: python3 tests/smoke.py [site_dir] [out_dir]
Loads the app from a local server, exercises every feature, screenshots, and
fails on any page error or console error."""
import sys, os, re, threading, http.server, functools, socketserver
from playwright.sync_api import sync_playwright

site = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
out = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else "shots")
os.makedirs(out, exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=site)
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), H)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{port}/index.html"

# every script tag carries ?v=<VERSION> so students never get stale code
html = open(os.path.join(site, "index.html")).read()
ver = re.search(r'const VERSION = "([\d.]+)"', open(os.path.join(site, "js/ui.js")).read()).group(1)
tags = re.findall(r'src="js/[a-z]+\.js\?v=([\d.]+)"', html)
assert tags and all(t == ver for t in tags), ("script versions", ver, tags)

errors = []
def watch(pg):
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and errors.append("console: " + m.text))

def ev(pg, js): return pg.evaluate(js)

with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 1200, "height": 1100})
    pg = ctx.new_page(); watch(pg)
    pg.add_init_script("localStorage.setItem('adt.theme', JSON.stringify('light'))")
    pg.goto(URL); pg.wait_for_selector("#score svg")
    assert ev(pg, "VERSION") == ver

    # ---- every instrument x pattern x mode renders, spelled in a real key
    res = ev(pg, """()=>{
      const host=document.createElement('div'); document.body.appendChild(host); let n=0;
      for(const i of INSTRUMENTS) for(const pat of Object.keys(PATTERNS)) for(const mode of ['art','dyn']){
        S.inst=i.id; S.pattern=pat; S.artOpt={rests:true,slurs:true,ties:true}; S.dynOpt={rests:true,slurs:true,ties:true};
        for(let k=0;k<3;k++){ const notes=newExample(mode); renderScore(host,{mode,notes,inst:i,pattern:pat,showArts:true,showDyns:true,labels:true,shapes:true}); n++; }
      }
      host.remove(); return n; }""")
    assert res == ev(pg, "INSTRUMENTS.length") * 6 * 2 * 3, res

    # ---- random generation invariants
    bad = ev(pg, """()=>{
      const out=[]; S.inst='altosax'; S.pattern='scale_Bb'; S.artOpt={rests:true,slurs:true,ties:true};
      let slurs=0, ties=0, rests=0;
      for(let k=0;k<300;k++){
        const ns=newExample('art');
        if(filled(ns)!==4) out.push('art not 4 beats');
        ns.forEach((n,i)=>{ if(n.sl){ slurs++; if(ns[i+1].p===n.p) out.push('slur on same pitch'); if(ns[i+1].rest) out.push('slur into rest'); }
                            if(n.tie){ ties++; if(ns[i+1].p!==n.p) out.push('tie pitch differs'); }
                            if(n.rest){ rests++; if(n.art) out.push('art on rest'); } });
        const el=artEligible(ns), used=new Set(el.map(i=>ns[i].art).filter(Boolean));
        if(used.size!==Math.min(el.length,4)) out.push('coverage '+used.size+'/'+el.length);
      }
      for(let k=0;k<300;k++){
        const ns=newExample('dyn');
        if(filled(ns)!==8) out.push('dyn not 8 beats');
        if(!ns.some(n=>n.hp)) out.push('no hairpin');
        if(dynWarnings(ns).length) out.push('bad hairpin');
        if(ns.some(n=>n.rest&&(n.dyn!==null||n.hp))) out.push('dyn on rest');
      }
      if(!slurs||!ties||!rests) out.push('features never generated '+[slurs,ties,rests]);
      return out.slice(0,10); }""")
    assert not bad, bad

    # ---- restore a normal state and drive the UI
    pg.goto(URL); pg.wait_for_selector("#score svg")
    pg.select_option("#inst", "altosax")
    pg.click("#gear"); pg.select_option("#pattern", "scale_Bb"); pg.click("#drawerClose"); pg.wait_for_timeout(300)
    pg.click("#aNewAll")
    assert pg.locator("#score .vf-keysignature").count() == 1, "alto in concert Bb shows a G-major key signature"
    pg.screenshot(path=f"{out}/v2-art-alto-Bb.png")

    # select a note, apply articulation, tie, pitch change
    i = ev(pg, "S.art.notes.findIndex((n,i)=>!n.rest && S.art.notes[i+1] && !S.art.notes[i+1].rest)")
    x = ev(pg, f"R.xs[{i}]/760")
    box = pg.locator("#score svg").bounding_box()
    pg.mouse.click(box["x"] + box["width"] * x, box["y"] + box["height"] * 0.45)
    assert ev(pg, "S.art.sel") == i, (ev(pg, "S.art.sel"), i)
    pg.keyboard.press("1"); assert ev(pg, f"S.art.notes[{i}].art") == "stacc"
    pg.keyboard.press("t"); assert ev(pg, f"S.art.notes[{i}].tie") is True
    assert ev(pg, f"S.art.notes[{i}].p===S.art.notes[{i+1}].p")
    pg.keyboard.press("t"); pg.keyboard.press("ArrowUp")
    pg.screenshot(path=f"{out}/v2-art-edit.png")

    # builder with rests
    pg.click("#aBuild button[data-t=clear]")
    for c in ["q", "8r", "8", "88", "qr"]:
        pg.click(f"#aBuild button[data-code='{c}']")
    assert ev(pg, "filled(S.art.notes)") == 4 and ev(pg, "S.art.notes.filter(n=>n.rest).length") == 2
    assert pg.is_disabled("#aBuild button[data-code=q]")
    pg.click("#aShuffle"); pg.screenshot(path=f"{out}/v2-build-rests.png")

    # share link round trip
    pg.click("#share"); url = pg.input_value("#shareUrl")
    before = ev(pg, "JSON.stringify(S.art.notes.map(n=>[n.dur,n.rest,n.p,n.art,n.sl,n.tie]))")
    pg2 = ctx.new_page(); watch(pg2)
    pg2.goto(url.replace(URL.split("/index.html")[0], f"http://127.0.0.1:{port}")); pg2.wait_for_selector("#score svg")
    after = ev(pg2, "JSON.stringify(S.art.notes.map(n=>[n.dur,n.rest,n.p,n.art,n.sl,n.tie]))")
    assert before == after, (before, after)
    pg2.select_option("#inst", "trumpet"); pg2.screenshot(path=f"{out}/v2-shared-as-trumpet.png"); pg2.close()

    # playback with instrument samples
    pg.keyboard.press("Escape")
    pg.click("#play"); pg.wait_for_timeout(2500)
    assert pg.locator("#score svg line.cursor").count() == 1
    assert pg.inner_text("#status") == ""
    assert ev(pg, "Object.keys(sampleCache.alto_sax.map).length") > 5
    pg.screenshot(path=f"{out}/v2-playing.png")
    pg.click("#play")

    # presentation mode
    pg.keyboard.press("p")
    assert ev(pg, "document.documentElement.classList.contains('present')")
    assert pg.is_visible("#presentBar") and not pg.is_visible("#transport")
    pg.screenshot(path=f"{out}/v2-present.png")
    pg.click("#pReveal"); assert ev(pg, "S.reveal") is True
    pg.screenshot(path=f"{out}/v2-present-reveal.png")
    pg.click("#pExit"); assert not ev(pg, "document.documentElement.classList.contains('present')")

    # dynamics with loudness lane, slurs, ties
    pg.click("#tabDyn"); pg.click("#dNewAll")
    assert pg.locator("#score svg path[fill='#6cbf3a']").count() >= 2, "loudness lane"
    pg.check("#labels"); pg.screenshot(path=f"{out}/v2-dyn.png")
    pg.select_option("#inst", "tuba"); pg.screenshot(path=f"{out}/v2-dyn-tuba.png")
    pg.select_option("#inst", "perc"); pg.click("#dNewAll"); pg.screenshot(path=f"{out}/v2-dyn-perc.png")
    pg.click("#play"); pg.wait_for_timeout(800); pg.click("#play")

    # ---- quiz
    pg.select_option("#inst", "trumpet"); pg.click("#tabQuiz")
    assert pg.is_visible("#quizUI")
    # name it / whole class: hidden marks, ? marks, reveal shows them
    pg.click("#qTopic [data-v=art]"); pg.click("#qType [data-v=name]"); pg.click("#qMode [data-v=class]")
    assert ev(pg, "R.notes.filter(n=>n.art).length") == 0, "markings hidden"
    assert pg.locator("#score svg text:text('?')").count() >= 3
    pg.click("#play"); pg.wait_for_timeout(1200); pg.click("#play")
    pg.screenshot(path=f"{out}/quiz-name-class.png")
    pg.click("#qReveal"); assert ev(pg, "R.notes.filter(n=>n.art).length") >= 3
    assert pg.is_visible("#banner")
    pg.screenshot(path=f"{out}/quiz-name-revealed.png")
    # name it / on my own: answer everything with the right answer except one, check score
    pg.click("#qMode [data-v=solo]")
    tg = ev(pg, "Q.q.targets"); truth = ev(pg, "Q.q.targets.map(i=>Q.q.notes[i].art)")
    ids = [None, "stacc", "ten", "acc", "marc", "lift"]
    for k, i in enumerate(tg):
        x = ev(pg, f"R.xs[{i}]/R.W"); box = pg.locator("#score svg").bounding_box()
        pg.mouse.click(box["x"] + box["width"] * x, box["y"] + box["height"] * 0.5)
        assert ev(pg, "Q.q.sel") == i, ("sel", ev(pg, "Q.q.sel"), i)
        a = truth[k] if k else ("ten" if truth[k] != "ten" else "stacc")
        pg.keyboard.press(str(ids.index(a)))
    assert not pg.is_disabled("#qCheck"); pg.click("#qCheck")
    assert ev(pg, "Q.score.right") == len(tg) - 1 and ev(pg, "Q.score.total") == len(tg)
    pg.screenshot(path=f"{out}/quiz-name-solo-checked.png")
    # spot the mistake / on my own: tapping the right note scores
    pg.click("#qType [data-v=spot]")
    w = ev(pg, "Q.q.wrong[0]"); x = ev(pg, f"R.xs[{w}]/R.W"); box = pg.locator("#score svg").bounding_box()
    pg.click("#play"); pg.wait_for_timeout(600); pg.click("#play")
    pg.mouse.click(box["x"] + box["width"] * x, box["y"] + box["height"] * 0.5)
    assert ev(pg, "Q.q.checked") and ev(pg, "Q.q.good") is True
    pg.screenshot(path=f"{out}/quiz-spot-solo.png")
    # which one / dynamics / whole class + present
    pg.click("#qTopic [data-v=dyn]"); assert pg.is_disabled("#qType [data-v=name]")
    pg.click("#qType [data-v=which]"); pg.click("#qMode [data-v=class]")
    assert pg.locator("#qWhich .opt").count() == 3
    pg.click("#play"); pg.wait_for_timeout(800)
    assert pg.locator("#score .vf-stavenote.play").count() == 0, "which-one must not highlight the answer"
    assert pg.locator("#score svg line.cursor").count() == 0
    pg.click("#play")
    pg.keyboard.press("p"); pg.screenshot(path=f"{out}/quiz-which-present.png")
    pg.keyboard.press("r"); assert pg.locator("#qWhich .opt.right").count() == 1
    pg.screenshot(path=f"{out}/quiz-which-present-revealed.png"); pg.click("#pExit")
    # dynamics spot: every generated mistake must actually change what's played
    same = ev(pg, """()=>{ let bad=0; Q.type='spot'; Q.topic='dyn';
      for(let k=0;k<200;k++){ Quiz.newQuestion(); const a=levelFn(Q.q.notes), b=levelFn(Q.q.played);
        let diff=0; for(let t=0;t<8;t+=0.25) diff=Math.max(diff,Math.abs(a(t)-b(t))); if(diff<1) bad++; if(!Q.q.wrong.length) bad++; }
      return bad; }""")
    assert same == 0, ("dyn spot mistakes not audible", same)
    same = ev(pg, """()=>{ let bad=0; Q.type='spot'; Q.topic='art';
      for(let k=0;k<200;k++){ Quiz.newQuestion(); const i=Q.q.wrong[0]; if((Q.q.notes[i].art||null)===(Q.q.played[i].art||null)) bad++; }
      Q.type='which'; for(let k=0;k<100;k++){ Quiz.newQuestion(); if(Q.q.options.length<3) bad++; }
      return bad; }""")
    assert same == 0, ("art spot/which", same)
    pg.click("#tabArt"); assert not pg.is_visible("#banner")

    # ---- agenda board mode (?board=1): presentation, class level, same example all day, nothing saved
    bp = ctx.new_page(); watch(bp)
    bp.add_init_script("window.__closed=0; window.addEventListener('message', e=>{ if(e.data&&e.data.artDyn==='close') window.__closed++; });")
    def board(q):
        bp.goto(f"http://127.0.0.1:{port}/index.html?board=1&{q}"); bp.wait_for_selector("#score svg")
        return ev(bp, "JSON.stringify(S[S.mode].notes)")
    a1 = board("mode=art&lvl=7th&seed=2026-11-20|7th"); a2 = board("mode=art&lvl=7th&seed=2026-11-20|7th")
    a3 = board("mode=art&lvl=7th&seed=2026-11-21|7th")
    assert a1 == a2 and a1 != a3, "same class + day = same example"
    assert ev(bp, "document.documentElement.classList.contains('present') && document.documentElement.classList.contains('board')")
    assert ev(bp, "S.art.notes.every(n=>n.rest || noteKey(inst(),S.pattern,n.p)==='b/4')"), "whole band reads the middle line"
    assert "Articulation of the Day" in bp.inner_text("#boardTitle") and "7th Grade" in bp.inner_text("#boardTitle")
    assert not bp.is_visible("header") and bp.is_visible("#presentBar")
    bp.screenshot(path=f"{out}/board-art-7th.png")
    beg = board("mode=art&lvl=6beg&seed=2026-11-20|6beg")
    assert ev(bp, "S.art.notes.length===4 && S.art.notes.every(n=>n.dur==='q' && !n.rest)"), "6 Beg = four quarters"
    assert ev(bp, "S.art.notes.every(n=>!n.art || ['stacc','ten','acc'].includes(n.art))")
    board("mode=dyn&lvl=6beg&seed=2026-11-20|6beg")
    assert ev(bp, "S.dyn.notes.every(n=>n.dur!=='8') && S.dyn.notes.every(n=>n.dyn===null || (n.dyn>=1 && n.dyn<=4))"), "6 Beg dynamics p..f, no eighths"
    assert "Dynamics of the Day" in bp.inner_text("#boardTitle")
    bp.screenshot(path=f"{out}/board-dyn-6beg.png")
    bp.click("#pMode"); assert ev(bp, "S.mode") == "art"
    t0 = ev(bp, "S.tempo"); bp.click("#pFaster"); assert ev(bp, "S.tempo") == t0 + 4
    bp.click("#pPlay"); bp.wait_for_timeout(700); bp.click("#pPlay")
    bp.click("#pReveal"); assert ev(bp, "S.reveal") is True
    snap = ev(bp, "JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith('adt.')).sort())")
    bp.click("#pExit"); bp.wait_for_timeout(150); assert ev(bp, "window.__closed") == 1, "Back to agenda tells the board"
    bp.keyboard.press("Escape"); bp.wait_for_timeout(150); assert ev(bp, "window.__closed") == 2
    bp.click("#pFaster"); bp.click("#pMode")
    assert ev(bp, "JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith('adt.')).sort())") == snap, "board saves nothing"
    bp.close()

    # ---- mic analysis on synthetic takes (known lengths, noise, room echo, mic lag)
    acc = ev(pg, """()=>{
      const out={worst:0, bad:[], flagged:0};
      const sim=(notes,spb,frac,lag)=>{
        const sr=48000,hop=256,t0=10,T=t0+4*spb, plan=playPlan(notes,'art'), frames=[];
        for(let t=t0-0.3;t<T+4*spb+0.7;t+=hop/sr){
          let r=0.002*(0.7+Math.random()*0.6);
          [0,1,2,3].forEach(b=>{ if(t>=t0+b*spb+lag && t<t0+b*spb+lag+0.03) r+=0.2; });
          plan.forEach((ev,k)=>{
            const s=T+ev.start*spb+lag, len=frac(ev,k)*(ev.end-ev.start)*spb, e=s+len;
            if(t>=s && t<e){ const x=(t-s)/len; r+=0.1*(ev.decay? (1-0.6*x) : 1); }
            else if(t>=e && t<e+0.3){ r+=0.1*(ev.decay?0.4:1)*Math.exp(-(t-e)/0.05); }
          });
          frames.push({t,r});
        }
        return analyzeTake(frames,notes,T,spb,t0);
      };
      S.inst='trumpet'; S.pattern='scale_Bb'; S.artOpt={rests:true,slurs:true,ties:true};
      for(let k=0;k<60;k++){
        const notes=newExample('art'), spb=60/(60+Math.random()*80), lag=0.02+Math.random()*0.12;
        const plan=playPlan(notes,'art');
        const good=sim(notes,spb,(ev)=>Math.min(1,ev.sound/(ev.end-ev.start)),lag);
        good.items.forEach((it,j)=>{ const d=Math.abs(it.measured-it.target); out.worst=Math.max(out.worst,d); (out.errs=out.errs||[]).push([d,it.name,Math.round(spb*1000),plan[j].end-plan[j].start]); if(it.verdict!=='ok') out.bad.push([it.name,it.target,it.measured,lag,spb]); });
        // everything held full length: short notes (50% goal) must be flagged too long
        const held=sim(notes,spb,()=>0.98,lag);
        held.items.forEach(it=>{ if(it.target<=0.55 && it.verdict!=='long') out.bad.push(['held',it.name,it.measured]); if(it.target<=0.55) out.flagged++; });
      }
      return out; }""")
    assert not acc["bad"], acc["bad"][:5]
    errs = sorted(acc["errs"], reverse=True); mean = sum(e[0] for e in errs)/len(errs)
    print("mic analysis: mean error", round(mean, 3), "worst", [(round(e[0],3),)+tuple(e[1:]) for e in errs[:4]])
    assert acc["worst"] < 0.14 and mean < 0.03   # app tolerance is 0.15; synthetic takes are random, (acc["worst"], mean)
    assert acc["flagged"] > 20, acc

    # ---- Dynamics Warm-up: #1 ladder (half note + half rest, in time), #2 shapes; pick #1 / #2 / Both
    pg.select_option("#inst", "clarinet"); pg.click("#tabDyn"); pg.click("#dynView [data-v=warmup]")
    assert pg.is_visible("#warmUI") and not pg.is_visible("#dynRandom")
    assert ev(pg, "WARM.filter(n=>n.ferm).length") == 0 and ev(pg, "filled(WARM)") == 72
    assert ev(pg, "WARM.filter(n=>n.start<40).every((n,i,a)=> n.dur==='h' && (i%2? n.rest : !n.rest))"), "ladder = half note, half rest"
    assert ev(pg, "WARM.some(n=>n.dyn===FP)") and not ev(pg, "dynWarnings(WARM).length")
    assert ev(pg, "noteKey(inst(),warmPattern(),0)") == "g/4", "clarinet warm-up on concert F = written G"
    pg.click("#warmSel [data-v='1']")
    assert pg.locator("#score .wline").count() == 2 and pg.inner_text("#score .wlabel").startswith("#1")
    pg.click("#warmSel [data-v='2']")
    assert pg.locator("#score .wline").count() == 2 and pg.inner_text("#score .wlabel").startswith("#2")
    assert pg.locator("#score .wline:nth-of-type(2) .vf-timesignature").count() == 1, "#2 alone starts with 4/4"
    pg.click("#warmSel [data-v=both]")
    assert pg.locator("#score .wline").count() == 4 and pg.locator("#score .wlabel").count() == 2
    pg.check("#labels"); pg.check("#shapes"); pg.screenshot(path=f"{out}/warmup.png", full_page=True)
    # #2 alone plays from beat 44: the cursor starts on its first line and moves to its second
    ev(pg, "S.tempo=160"); pg.click("#warmSel [data-v='2']")
    pg.click("#warmPlay"); pg.wait_for_timeout(2600)
    lines = pg.locator("#score .wline")
    cur1 = lines.nth(0).locator("line.cursor").count() == 1
    pg.wait_for_timeout(5400)
    cur2 = lines.nth(1).locator("line.cursor").count() == 1
    assert cur1 and cur2, (cur1, cur2)
    pg.click("#warmPlay")
    # fp is two events: loud for ~half a beat, then piano (render the warm-up's fp offline and measure it)
    fpq = ev(pg, """async()=>{
      const sr=22050, oac=new OfflineAudioContext(1,sr*3,sr), g=oac.createGain(); const env=oac.createGain();
      const o=oac.createOscillator(); o.frequency.value=220; o.connect(env); env.connect(oac.destination);
      envelope(env,0,2.5,DYN_GAIN[1],DYN_GAIN[1],1,false,false,1,null,{g:DYN_GAIN[4],hold:0.375,drop:0.06});
      o.start(0); o.stop(2.6); const b=await oac.startRendering(), d=b.getChannelData(0);
      const rms=(a,z)=>{ let s=0; for(let i=Math.floor(a*sr);i<z*sr;i++) s+=d[i]*d[i]; return Math.sqrt(s/((z-a)*sr)); };
      return [rms(0.05,0.35), rms(0.6,2.0)]; }""")
    assert fpq[0] > 3 * fpq[1], ("fp: forte part should be clearly louder than the piano part", fpq)
    assert ev(pg, "(()=>{ const src=String(playExample); return src.includes('hold:Math.max(0.25') })()")
    # "Synth (octaves)": every note sounds twice, an octave apart
    octs = ev(pg, """()=>{ const freqs=[]; const orig=synthVoice;
      window.synthVoice=function(t,len,g0,g1,b,d,midi){ freqs.push(midi); };
      try{ octaveVoice(0,1,0.2,0.2,1,false,65,false,null,null); } finally { window.synthVoice=orig; }
      return freqs; }""")
    assert octs == [65, 53], octs
    pg.click("#gear"); pg.select_option("#sound", "octaves"); pg.click("#drawerClose"); pg.wait_for_timeout(300)
    pg.click("#warmPlay"); pg.wait_for_timeout(1500); pg.click("#warmPlay")
    pg.click("#gear"); pg.select_option("#sound", "inst"); pg.click("#drawerClose"); pg.wait_for_timeout(300)
    # ff is drawn tighter than two separate f's
    kern = ev(pg, "[dynWidth('ff',38), 2*dynWidth('f',38)]"); assert kern[0] < kern[1]*0.8, kern
    pg.click("#warmSel [data-v=both]")
    pg.keyboard.press("p"); assert pg.is_visible("#pWarmSel")
    pg.click("#pWarmSel [data-v='1']"); assert ev(pg, "S.warmSel") == "1"
    pg.screenshot(path=f"{out}/warmup-present.png"); pg.keyboard.press("r")
    pg.screenshot(path=f"{out}/warmup-present-reveal.png"); pg.click("#pExit")
    pg.click("#dynView [data-v=random]"); assert pg.is_visible("#dynRandom")
    pg.uncheck("#labels"); pg.click("#tabArt")

    # drawer + dark theme + narrow
    pg.select_option("#inst", "clarinet"); pg.click("#tabArt")
    pg.click("#gear"); pg.screenshot(path=f"{out}/v2-drawer.png"); pg.check("#darkTheme"); pg.click("#drawerClose"); pg.wait_for_timeout(300)
    pg.set_viewport_size({"width": 800, "height": 1000}); pg.screenshot(path=f"{out}/v2-narrow-dark.png", full_page=True)
    pg.close()
    b.close()

    # ---- full mic flow with Chromium's fake microphone
    b = p.chromium.launch(channel="chromium", args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 1200, "height": 1100}, permissions=["microphone"])
    pg = ctx.new_page(); watch(pg)
    pg.add_init_script("localStorage.setItem('adt.theme', JSON.stringify('light')); localStorage.setItem('adt.tempo','160'); localStorage.setItem('adt.mode', JSON.stringify('art'))")
    pg.goto(URL); pg.wait_for_selector("#score svg")
    assert pg.is_visible("#micBtn")
    pg.click("#micBtn"); assert pg.is_visible("#micUI")
    pg.click("#micStart"); pg.wait_for_timeout(800)
    assert "Listening" in pg.inner_text("#micTitle")
    pg.screenshot(path=f"{out}/mic-listening.png")
    pg.wait_for_function("!Mic.busy", timeout=15000)
    title = pg.inner_text("#micTitle")
    assert "notes in shape" in title or "didn't hear" in title, title
    assert ev(pg, "Mic.frames.length") > 100, "mic frames captured"
    pg.screenshot(path=f"{out}/mic-result.png")
    pg.click("#tabDyn"); assert not pg.is_visible("#micUI") and not pg.is_visible("#micBtn")
    b.close()
srv.shutdown()
if errors:
    print("ERRORS:", *errors[:20], sep="\n  "); sys.exit(1)
print("OK")
