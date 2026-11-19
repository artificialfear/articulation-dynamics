"""Smoke test: load the app, exercise both modes, screenshot, fail on console errors.
Usage: python3 tests/smoke.py [site_dir] [out_dir]"""
import sys, os, threading, http.server, functools, socketserver
from playwright.sync_api import sync_playwright

site = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "site")
out = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else "shots")
os.makedirs(out, exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=site)
H.log_message = lambda *a: None
srv = socketserver.TCPServer(("127.0.0.1", 0), H)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

errors = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium")
    for theme in ["light", "dark"]:
        pg = b.new_page(viewport={"width": 1200, "height": 1100})
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        pg.add_init_script(f"localStorage.setItem('adt.theme', JSON.stringify('{theme}'))")
        pg.goto(f"http://127.0.0.1:{port}/index.html")
        pg.wait_for_selector("#score svg")
        if theme == "light":
            # stress random generation
            for _ in range(40):
                pg.click("#aNewAll")
            n = pg.eval_on_selector_all("#score g.vf-stavenote", "e=>e.length")
            assert 5 <= n <= 7, n
            arts = pg.evaluate("S.art.notes.map(n=>n.art)")
            assert all(a in arts for a in ["stacc", "ten", "acc", "marc"]), arts
            box = pg.locator("#score svg").bounding_box()
            nx = pg.evaluate("render.xs[2]/760")
            pg.mouse.click(box["x"] + box["width"] * nx, box["y"] + box["height"] * 0.4)
            assert pg.evaluate("S.art.sel") == 2
            for k in "12345":  # every articulation renders
                pg.keyboard.press(k)
                assert pg.evaluate("S.art.notes[2].art") == ["stacc","ten","acc","marc","lift"][int(k)-1]
            pg.keyboard.press("0")
            pg.check("#labels")
            pg.screenshot(path=f"{out}/art-{theme}.png", full_page=True)
            # rhythm builder (articulation): q, 8, 8-pair, then partial screenshot, then fill
            pg.click("#aBuild button[data-tool=clear]")
            assert pg.evaluate("S.art.notes.length") == 0
            pg.click("#aBuild button[data-code=q]"); pg.click("#aBuild button[data-code='8']")
            assert pg.is_disabled("#aBuild button[data-code='88']")  # off the beat
            pg.screenshot(path=f"{out}/build-art-partial.png")
            pg.click("#aBuild button[data-code='8']"); pg.click("#aBuild button[data-code='88']")
            pg.click("#aBuild button[data-code=q]")
            assert pg.evaluate("filled(S.art.notes)") == 4
            assert pg.is_disabled("#aBuild button[data-code=q]")
            pg.click("#aBuild button[data-tool=undo]")
            assert pg.evaluate("filled(S.art.notes)") == 3
            pg.click("#aBuild button[data-code=q]"); pg.click("#aShuffle")
            pg.screenshot(path=f"{out}/build-art-full.png")
            pg.uncheck("#countin")
            pg.click("#play"); pg.wait_for_timeout(1400)
            assert pg.locator("#score svg line[stroke='#db2777']").count() == 1
            x1 = float(pg.get_attribute("#score svg line[stroke='#db2777']", "x1"))
            pg.screenshot(path=f"{out}/cursor-art.png")
            pg.wait_for_timeout(600)
            x2 = float(pg.get_attribute("#score svg line[stroke='#db2777']", "x1"))
            assert x2 > x1, (x1, x2)
            pg.click("#play")
            assert pg.locator("#score svg line[stroke='#db2777']").count() == 0
            pg.uncheck("#cursor"); pg.click("#play"); pg.wait_for_timeout(300)
            assert pg.locator("#score svg line[stroke='#db2777']").count() == 0
            pg.click("#play"); pg.check("#cursor"); pg.check("#countin")
            # full screen toggles the layout class and button label
            pg.click("#fs"); pg.wait_for_timeout(400)
            assert pg.evaluate("!!document.fullscreenElement"), "fullscreen did not engage"
            assert pg.evaluate("document.documentElement.classList.contains('is-fs')")
            assert "Exit" in pg.inner_text("#fs")
            pg.screenshot(path=f"{out}/fullscreen-art.png")
            pg.keyboard.press("f"); pg.wait_for_timeout(400)
            assert not pg.evaluate("!!document.fullscreenElement")
            assert "Full Screen" in pg.inner_text("#fs")
            pg.click("#tabDyn")
            for _ in range(60):
                pg.click("#dNewAll")
                hp = pg.evaluate("S.dyn.notes.filter(n=>n.hp).length")
                assert hp >= 1
                assert pg.evaluate("S.dyn.notes.some(n=>n.m===1&&n.dyn!==null)")
                assert pg.evaluate("dynWarnings().length") == 0, pg.evaluate("dynWarnings()")
            # rhythm builder (dynamics): whole, then half+quarter+8th pair, randomize
            pg.click("#dBuild button[data-tool=clear]")
            pg.click("#dBuild button[data-code=w]")
            assert pg.is_disabled("#dBuild button[data-code=w]") is False  # measure 2 can start with whole
            pg.click("#dBuild button[data-code=h]")
            assert pg.is_disabled("#dBuild button[data-code=w]")
            pg.screenshot(path=f"{out}/build-dyn-partial.png")
            pg.click("#dBuild button[data-code=q]"); pg.click("#dBuild button[data-code='88']")
            assert pg.evaluate("filled(S.dyn.notes)") == 8
            pg.click("#dShuffle")
            assert pg.evaluate("S.dyn.notes.filter(n=>n.hp).length") >= 1
            pg.screenshot(path=f"{out}/build-dyn-full.png")
            pg.click("#dNewAll")
            pg.select_option("#clef", "bass")
            pg.screenshot(path=f"{out}/dyn-{theme}-labels.png", full_page=True)
            pg.uncheck("#labels")
            pg.click("#dNewAll")
            pg.mouse.click(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.5)
            pg.screenshot(path=f"{out}/dyn-{theme}.png", full_page=True)
            pg.uncheck("#countin"); pg.click("#play"); pg.wait_for_timeout(2500)
            pg.screenshot(path=f"{out}/cursor-dyn.png"); pg.click("#play"); pg.check("#countin")
            pg.select_option("#clef", "treble")
        else:
            pg.screenshot(path=f"{out}/art-{theme}.png", full_page=True)
        pg.set_viewport_size({"width": 800, "height": 1000})
        pg.screenshot(path=f"{out}/narrow-{theme}.png", full_page=True)
        pg.close()
    b.close()
srv.shutdown()
if errors:
    print("ERRORS:", *errors, sep="\n  "); sys.exit(1)
print("OK")
