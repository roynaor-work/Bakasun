#!/usr/bin/env python3
"""Audit the actual local GLB loader and character lab in Chromium/SwiftShader.

Run from any directory: python3 path/to/characters/source/check-browser.py
Requires Python Playwright and Chromium. Uses only an ephemeral loopback server;
blocks and records every nonlocal request. Writes verification/browser.json and
previews/*.png. These are software-renderer observations, not phone FPS claims.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import functools
import hashlib
import html
import json
import math
from pathlib import Path
import threading
import time
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = ROOT.parents[4]
ROUTE = "/" + ROOT.relative_to(REPOSITORY).as_posix() + "/preview.html"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def run() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--samples", type=int, default=21,
                        help="Uniform phases per clip, plus every event/contact phase")
    parser.add_argument("--skip-screenshots", action="store_true")
    args = parser.parse_args()
    if args.samples < 3:
        parser.error("--samples must be at least 3")
    started = time.monotonic()
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "renderer": "Chromium headless, ANGLE SwiftShader software renderer",
        "phonePerformanceVerified": False,
        "method": "Actual local GLTFLoader/Draco/SkeletonUtils; baked floor lifts; exact skinned vertex minima; uniform plus event/contact phases",
        "uniformSamplesPerClip": args.samples,
        "externalRequests": [], "httpErrors": [], "consoleErrors": [],
        "pageErrors": [], "failures": [], "layouts": [], "assets": [],
        "screenshots": [],
    }
    output = ROOT / "verification" / "browser.json"
    report["inputSha256"] = {
        name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        for name in ("asset-manifest.json", "motion/soccer-v6.json", "motion/floor-clearance.json",
                     "preview.html", "preview.css", "preview.js", "source/check-browser.py")
        if (ROOT / name).exists()
    }
    output.parent.mkdir(exist_ok=True)
    previews = ROOT / "previews"
    previews.mkdir(exist_ok=True)

    def check(condition, message):
        if not condition:
            report["failures"].append(message)

    handler = functools.partial(QuietHandler, directory=str(REPOSITORY))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=args.chromium, headless=True,
                args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader",
                      "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"],
            )
            context = browser.new_context(viewport={"width": 390, "height": 844},
                                          device_scale_factor=1)

            def local_only(route):
                url = route.request.url
                if url.startswith(origin + "/") or url.startswith(("data:", "blob:")):
                    route.continue_()
                else:
                    report["externalRequests"].append(url)
                    route.abort()

            context.route("**/*", local_only)
            page = context.new_page()
            page.on("pageerror", lambda error: report["pageErrors"].append(str(error)))
            page.on("console", lambda message: report["consoleErrors"].append(message.text)
                    if message.type == "error" else None)
            page.on("response", lambda response: report["httpErrors"].append(
                {"url": response.url.replace(origin, ""), "status": response.status})
                if response.status >= 400 else None)
            page.goto(origin + ROUTE, wait_until="networkidle", timeout=120_000)
            page.wait_for_function("window.soccerCharacters?.ready", timeout=120_000)
            page.evaluate("async () => {await window.soccerCharacters.ready; window.soccerCharacters.setPlaying(false)}")
            report["clearanceReady"] = page.evaluate("window.soccerCharacters.clearanceReady")
            check(report["clearanceReady"] is True, "Final baked floor clearance is unavailable or stale")
            metadata = page.evaluate("""() => {
              const a=window.soccerCharacters;
              return {characters:a.manifest.characters.map(c=>({id:c.id,role:c.role,label:c.label||c.name||c.id,kits:c.kits})),
                clips:Object.keys(a.motion.states),gl:a.renderer.getContext().getParameter(a.renderer.getContext().VERSION)};
            }""")
            report["metadata"] = metadata
            check(len(metadata["characters"]) == 8, "Expected eight character identities")
            check(len(metadata["clips"]) == 20, "Expected twenty motion clips")

            for width, height in ((390, 844), (844, 390), (1440, 1000), (320, 740)):
                page.set_viewport_size({"width": width, "height": height})
                page.evaluate("window.soccerCharacters.resize()")
                layout = page.evaluate("""() => {
                  const visible=n=>n.checkVisibility({checkVisibilityCSS:true});
                  const box=n=>{const b=n.getBoundingClientRect();return {width:b.width,height:b.height}};
                  return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,
                    documentHeight:document.documentElement.scrollHeight,canvas:box(document.querySelector('#stage')),
                    controls:[...document.querySelectorAll('button,select,summary')].filter(visible).map(n=>({id:n.id||n.tagName,...box(n)}))};
                }""")
                report["layouts"].append(layout)
                check(layout["documentWidth"] == width, f"Horizontal overflow at {width}×{height}")
                for control in layout["controls"]:
                    check(control["width"] >= 44 and control["height"] >= 44,
                          f"Touch control smaller than 44px: {control['id']} at {width}×{height}")
                page.locator("summary").click()
                check(page.evaluate("document.documentElement.scrollWidth") == width,
                      f"Expanded tools cause horizontal overflow at {width}×{height}")
                page.locator("summary").click()
            print("Layouts: portrait, landscape, desktop and narrow phone checked", flush=True)

            # Calls use promises to await genuine GLB decode and actor rebuilds.
            # Render suppression makes dense geometry checks independent of the
            # software rasterizer; playback skinning and floor code still run.
            page.set_viewport_size({"width": 390, "height": 844})
            for character in metadata["characters"]:
                cid = character["id"]
                page.evaluate("id => window.soccerCharacters.setCharacter(id)", cid)
                for lod in ("0", "1"):
                    page.evaluate("lod => window.soccerCharacters.setLOD(lod)", lod)
                    kit_ids = [k.get("id", "home") for k in character.get("kits") or [{"id": "home"}]]
                    for kit in kit_ids:
                        page.evaluate("kit => window.soccerCharacters.setKit(kit)", kit)
                        result = page.evaluate("""({samples}) => {
                          const a=window.soccerCharacters, render=a.renderer.render;
                          const result={path:a.actors[0].path,triangles:a.actors[0].triangles(),clips:[],minimumY:Infinity,maxQuaternionError:0,finite:true,bakedEnvelopeAvailable:true};
                          a.renderer.render=()=>{};
                          try {
                            for(const [id,c] of Object.entries(a.motion.states)) {
                              const phases=new Set(Array.from({length:samples},(_,i)=>i/(samples-1)));
                              for(const e of c.events||[])if(Number.isFinite(e.time))phases.add(Math.min(1,Math.max(0,e.time)));
                              for(const s of c.ballContactSeconds||[])phases.add(Math.min(1,Math.max(0,s/c.durationSeconds)));
                              let low=Infinity,qerror=0,finite=true,baked=true;
                              a.setClip(id);
                              for(const u of [...phases].sort((x,y)=>x-y)) {
                                a.seek(u); const p=a.probe(false); low=Math.min(low,p.minimumY);finite&&=p.finite;baked&&=p.bakedEnvelopeAvailable===true;
                                for(const actor of a.actors)for(const bone of Object.values(actor.bones)) {
                                  qerror=Math.max(qerror,Math.abs(bone.quaternion.lengthSq()-1));
                                  finite&&=[...bone.quaternion,...bone.position].every(Number.isFinite);
                                }
                              }
                              result.clips.push({id,samples:phases.size,minimumY:low,maxQuaternionError:qerror,finite,bakedEnvelopeAvailable:baked});
                              result.minimumY=Math.min(result.minimumY,low);result.maxQuaternionError=Math.max(result.maxQuaternionError,qerror);result.finite&&=finite;result.bakedEnvelopeAvailable&&=baked;
                            }
                          } finally {a.renderer.render=render;a.seek(0)}
                          return result;
                        }""", {"samples": args.samples})
                        result.update({"character": cid, "lod": int(lod), "kit": kit})
                        report["assets"].append(result)
                        check(result["finite"], f"Nonfinite skinning: {cid}, LOD {lod}, {kit}")
                        check(result["bakedEnvelopeAvailable"], f"Missing baked floor envelope: {cid}, LOD {lod}, {kit}")
                        check(math.isfinite(result["minimumY"]) and result["minimumY"] >= -0.001,
                              f"Geometry below floor: {cid}, LOD {lod}, {kit}: {result['minimumY']}")
                        check(result["maxQuaternionError"] <= 0.0001,
                              f"Nonunit quaternion: {cid}, LOD {lod}, {kit}")
                    print(f"Playback: {cid}, LOD {lod}, {len(kit_ids)} kit(s), twenty clips checked", flush=True)

            for character in metadata["characters"]:
                cid = character["id"]
                rows = [r for r in report["assets"] if r["character"] == cid]
                kit_ids = [k.get("id", "home") for k in character.get("kits") or [{"id": "home"}]]
                for kit in kit_ids:
                    a = next(r for r in rows if r["lod"] == 0 and r["kit"] == kit)
                    b = next(r for r in rows if r["lod"] == 1 and r["kit"] == kit)
                    check(b["triangles"] < a["triangles"], f"LOD 1 does not reduce triangles: {cid}/{kit}")
                if len(character.get("kits") or []) > 1:
                    for lod in (0, 1):
                        paths = {r["path"] for r in rows if r["lod"] == lod}
                        check(len(paths) == len(kit_ids), f"Kit does not switch GLB path: {cid}/LOD {lod}")

            report["crossfades"] = page.evaluate("""() => {
              const a=window.soccerCharacters,render=a.renderer.render,rows=[];
              const pose=()=>Object.fromEntries(Object.entries(a.actors[0].bones).map(([n,b])=>[n,b.quaternion.clone()]));
              const delta=previous=>Math.max(...Object.entries(previous).map(([n,q])=>q.clone().normalize().angleTo(a.actors[0].bones[n].quaternion.clone().normalize())));
              a.renderer.render=()=>{};a.setPlaying(true);
              try {
                for(const clip of Object.keys(a.motion.states)) {
                  let fadeMinimum=Infinity,fadeFinite=true;
                  const sample=()=>{fadeMinimum=Math.min(fadeMinimum,...a.actors.map(x=>x.minimumY()));fadeFinite&&=a.actors.every(x=>x.meshes.every(m=>m.skeleton.boneMatrices.every(Number.isFinite)))};
                  a.step(.05);const before=pose();a.setClip(clip);const immediate=delta(before);a.step(.06);sample();
                  const interrupted=pose();a.setClip('run');const interruptDelta=delta(interrupted);
                  for(let i=0;i<15;i++){a.step(1/60);sample()}
                  rows.push({transitionTo:clip,immediateRadians:immediate,interruptionRadians:interruptDelta,
                    fadeSamples:16,fadeMinimumY:fadeMinimum,fadeFinite,...a.probe(false)});
                }
              } finally {a.renderer.render=render;a.setPlaying(false);a.seek(0)}return rows;
            }""")
            for row in report["crossfades"]:
                check(row["immediateRadians"] <= 0.00001 and row["interruptionRadians"] <= 0.00001,
                      f"Crossfade discontinuity: {row['transitionTo']}")
                check(row["finite"] and row["fadeFinite"] and row["minimumY"] >= -0.001 and row["fadeMinimumY"] >= -0.001,
                      f"Crossfade invalid skin/floor: {row['transitionTo']}")

            # Exercise the visible native controls as well as the audit API.
            first = metadata["characters"][0]["id"]
            page.evaluate("window.soccerCharacters.setKit('home')")
            page.select_option("#character", first)
            page.wait_for_function("id=>window.soccerCharacters.actors[0].id===id", arg=first)
            page.select_option("#clip", "run")
            page.locator("#play").click()
            page.wait_for_function("window.soccerCharacters.playing")
            page.wait_for_function("window.soccerCharacters.time>0", timeout=10_000)
            check(page.evaluate("window.soccerCharacters.time") > 0, "Play button does not advance time")
            page.locator("#play").click()
            stopped = page.evaluate("window.soccerCharacters.time")
            page.wait_for_timeout(100)
            check(page.evaluate("window.soccerCharacters.time") == stopped, "Pause button does not hold time")
            page.locator("#scrub").focus()
            page.keyboard.press("Home")
            check(page.evaluate("window.soccerCharacters.time") == 0,
                  "Scrub keyboard Home does not return to start")
            page.locator("#scrub").evaluate("el=>{el.value='0.625';el.dispatchEvent(new Event('input',{bubbles:true}))}")
            report["scrub"] = page.evaluate("""() => {const a=window.soccerCharacters;return {time:a.time,duration:a.motion.states[a.clip].durationSeconds,playing:a.playing}}""")
            check(abs(report["scrub"]["time"] / report["scrub"]["duration"] - .625) < .001,
                  "Native scrub control does not seek to selected phase")
            check(not report["scrub"]["playing"], "Scrubbing should pause playback")
            page.locator("#reset").click()
            check(page.evaluate("window.soccerCharacters.time") == 0, "Reset does not return to start")
            page.locator("summary").click()
            page.locator("#skeleton").check()
            check(page.evaluate("window.soccerCharacters.actors.every(a=>a.helper.visible)"), "Skeleton toggle fails")
            page.locator("#skeleton").uncheck()
            page.locator("#wireframe").check()
            check(page.evaluate("window.soccerCharacters.actors.every(a=>a.meshes.every(m=>(Array.isArray(m.material)?m.material:[m.material]).every(x=>x.wireframe)))"), "Wireframe toggle fails")
            page.locator("#wireframe").uncheck()
            page.select_option("#lod", "0")
            page.wait_for_function("""() => {
              const a=window.soccerCharacters,c=a.manifest.characters[0];
              const id=document.querySelector('#kit').value,kits=c.kits||[];
              const kit=kits.find(k=>k.id===id)||kits[id==='away'?1:0]||kits[0];
              return a.actors[0].path===(kit?.lod0||c.lod0);
            }""")
            page.locator("summary").click()
            for kit in ("home", "away", "home"):
                page.select_option("#kit", kit)
                page.wait_for_function("""kitID => {
                  const a=window.soccerCharacters,c=a.manifest.characters[0],kits=c.kits||[];
                  const kit=kits.find(k=>k.id===kitID)||kits[kitID==='away'?1:0]||kits[0];
                  return a.actors[0].path===(kit?.lod0||c.lod0);
                }""", arg=kit)
            page.select_option("#view", "match")
            page.wait_for_function("window.soccerCharacters.actors.length===12")
            page.select_option("#view", "hero")
            page.wait_for_function("window.soccerCharacters.actors.length===1")

            await_match = "async () => {const a=window.soccerCharacters;await a.setLOD('auto');await a.setView('match');a.setClip('run');a.seek(.37);return {...a.probe(false),renderTriangles:a.renderer.info.render.triangles,drawsText:document.querySelector('#draws').textContent}}"
            report["match"] = page.evaluate(await_match)
            check(report["match"]["actors"] == 12, "Match view does not contain twelve actors")
            check(report["match"]["lod"] == 1, "Auto LOD should select LOD 1 in match view")
            check(report["match"]["finite"] and report["match"]["minimumY"] >= -0.001,
                  "Match view has invalid skin/floor")
            check(report["match"]["bakedEnvelopeAvailable"] is True,
                  "Match view is missing a baked floor envelope")
            check(report["match"]["calls"] > 0, "Match draw count is empty")
            print(f"Match: {report['match']['actors']} actors, {report['match']['calls']} draws", flush=True)

            def capture(name, locator=None):
                if args.skip_screenshots:
                    return
                path = previews / name
                if locator:
                    page.locator(locator).screenshot(path=str(path), animations="disabled")
                else:
                    page.screenshot(path=str(path), full_page=True, animations="disabled")
                report["screenshots"].append("previews/" + name)

            for width, height in ((390, 844), (844, 390)):
                page.set_viewport_size({"width": width, "height": height})
                page.evaluate("window.soccerCharacters.resize()")
                capture(f"match-{width}x{height}.png")
            page.evaluate("async () => {const a=window.soccerCharacters;await a.setView('hero');await a.setKit('home');await a.setCharacter(a.manifest.characters[0].id);await a.setLOD('0');a.setClip('idle');a.seek(.25)}")
            for width, height in ((390, 844), (844, 390)):
                page.set_viewport_size({"width": width, "height": height})
                page.evaluate("window.soccerCharacters.resize()")
                capture(f"hero-{width}x{height}.png")
            if not args.skip_screenshots:
                page.set_viewport_size({"width": 390, "height": 844})
                page.add_style_tag(content=".stage-heading,.view-marker,.player-caption,.orbit-hint,.stage-corner{visibility:hidden!important}")
                for character in metadata["characters"]:
                    cid = character["id"]
                    page.evaluate("id=>window.soccerCharacters.setCharacter(id)", cid)
                    for lod in ("0", "1"):
                        page.evaluate("lod=>window.soccerCharacters.setLOD(lod)", lod)
                        page.evaluate("() => {const a=window.soccerCharacters;a.resize();a.setClip('idle');a.seek(.25)}")
                        capture(f"{cid}-lod{lod}-full.png", "#stage")
                        page.evaluate("""() => {
                          const a=window.soccerCharacters;
                          a.camera.fov=32;a.camera.position.set(0,1.59,1.0);
                          a.camera.lookAt(0,1.58,0);a.camera.updateProjectionMatrix();a.renderer.render(a.scene,a.camera);
                        }""")
                        capture(f"{cid}-lod{lod}-head.png", "#stage")
                print("Screenshots: full lab, match, all identities at both LODs, head and full body", flush=True)
                gallery = context.new_page()
                gallery.set_viewport_size({"width": 1364, "height": 1000})
                for lod in ("0", "1"):
                    for crop in ("full", "head"):
                        cards = []
                        for character in metadata["characters"]:
                            name = f"{character['id']}-lod{lod}-{crop}.png"
                            encoded = base64.b64encode((previews / name).read_bytes()).decode()
                            label = html.escape(character["label"])
                            cards.append(f'<figure><img src="data:image/png;base64,{encoded}" alt="{label}"><figcaption>{label}<span>{html.escape(character["id"])}</span></figcaption></figure>')
                        gallery.set_content('''<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>סקירת סגל</title><style>
                          *{box-sizing:border-box}body{margin:0;padding:24px;background:#08161e;color:#f2f5f3;font:14px Arial,sans-serif}
                          header{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 20px;border-bottom:1px solid #233943;padding-bottom:16px}
                          h1{font-size:25px;margin:0}header p{margin:0;color:#88a0aa;font-size:12px;direction:ltr}
                          main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}figure{margin:0;background:#102731;min-width:0}
                          img{display:block;width:100%;height:auto}figcaption{height:44px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px}
                          figcaption span{font-size:10px;color:#88a0aa;direction:ltr}footer{font-size:10px;color:#88a0aa;padding-top:18px}
                          </style><header><h1>סגל / 06</h1><p>LOD ''' + lod + " · " + crop.upper() + ''' · LOCAL WEBGL</p></header><main>'''
                          + "".join(cards) + '''</main><footer>צילום הדמויות מתוך הטוען המקומי בפועל · Chromium / SwiftShader · אינו מדד ביצועים בטלפון</footer></html>''')
                        gallery.locator("img").last.wait_for()
                        gallery.evaluate("Promise.all([...document.images].map(i=>i.decode()))")
                        name = f"roster-lod{lod}-{crop}.png"
                        gallery.screenshot(path=str(previews / name), full_page=True)
                        report["screenshots"].append("previews/" + name)
                gallery.close()

            report["loadErrors"] = page.evaluate("window.soccerCharacters.loadErrors")
            check(not report["loadErrors"], "Character loader reported errors")
            check(not report["externalRequests"], "Lab attempted external network requests")
            check(not report["httpErrors"], "Local runtime resource returned HTTP errors")
            check(not report["pageErrors"], "Browser page errors occurred")
            check(not report["consoleErrors"], "Browser console errors occurred")
            browser.close()
    except Exception as error:
        report["failures"].append(f"{type(error).__name__}: {error}")
        report["exceptionTraceback"] = traceback.format_exc()
    finally:
        server.shutdown()
        report["durationSeconds"] = round(time.monotonic() - started, 2)
        report["success"] = not report["failures"]
        output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"success": report["success"], "failures": report["failures"],
                      "report": str(output), "durationSeconds": report["durationSeconds"]}, ensure_ascii=False), flush=True)
    return 0 if report["success"] else 1


if __name__ == "__main__":
    raise SystemExit(run())
