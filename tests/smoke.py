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
            pg.click("#play"); pg.wait_for_timeout(300); pg.click("#play")
            pg.click("#tabDyn")
            for _ in range(60):
                pg.click("#dNewAll")
                hp = pg.evaluate("S.dyn.notes.filter(n=>n.hp).length")
                assert hp >= 1
                assert pg.evaluate("S.dyn.notes.some(n=>n.m===1&&n.dyn!==null)")
                assert pg.evaluate("dynWarnings().length") == 0, pg.evaluate("dynWarnings()")
            pg.select_option("#clef", "bass")
            pg.screenshot(path=f"{out}/dyn-{theme}-labels.png", full_page=True)
            pg.uncheck("#labels")
            pg.click("#dNewAll")
            pg.mouse.click(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.5)
            pg.screenshot(path=f"{out}/dyn-{theme}.png", full_page=True)
            pg.click("#play"); pg.wait_for_timeout(300); pg.click("#play")
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
