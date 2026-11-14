"""Capture only the repository's fictional city, for the review backdrop.

Run a repository-root HTTP server on 8765, then run this script. No save is
created or changed: cityPreview uses the existing read-only preview mode.
Requires the environment's Python Playwright and system Chromium.
"""
import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True,
        args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 844, "height": 390}, device_scale_factor=1)
    page.set_default_timeout(180000)
    page.goto("http://127.0.0.1:8765/workout/island/?cityPreview=full&dev=1", wait_until="load")
    page.wait_for_function("() => Boolean(window.__cityPreview && window.__island?.view)")
    page.evaluate("""async () => {
      const v=window.__island.view;
      await Promise.all([v.modelsReady,v.cityReady,v.pilotReady]);
    }""")
    # Wait for asynchronously requested authored building models to appear.
    page.wait_for_timeout(10000)
    result = page.evaluate("""async () => {
      const T=await import('/workout/island/vendor/three.module.js');
      const v=window.__island.view;
      v.pause?.(); cancelAnimationFrame(v.frame);
      v.environment.water.sea.visible=false;
      v.environment.scenery.root.visible=false;
      v.environment.flora.rebuild(v.environment.flora.placements.filter(p=>Math.hypot(p.x,p.z)<30));
      v.avatar.holder.visible=false;
      v.scene.background=null;v.scene.fog=null;
      v.renderer.setClearColor(0,0);
      v.zoom=1.65;v.target.set(0,.4,0);v.resize();
      // Match an unobstructed 844:390 overview, without the app panel offset.
      const span=24.5;v.elevation=.48;v.camera.left=-span*844/390;v.camera.right=span*844/390;
      v.camera.top=span;v.camera.bottom=-span;v.camera.updateProjectionMatrix();
      v.updateCamera();
      const target=new T.WebGLRenderTarget(844,390,{format:T.RGBAFormat});
      target.texture.colorSpace=T.SRGBColorSpace;
      v.renderer.setRenderTarget(target);v.renderer.render(v.scene,v.camera);
      const pixels=new Uint8Array(844*390*4);v.renderer.readRenderTargetPixels(target,0,0,844,390,pixels);
      v.renderer.setRenderTarget(null);target.dispose();
      const canvas=document.createElement('canvas');canvas.width=844;canvas.height=390;
      const ctx=canvas.getContext('2d'),out=ctx.createImageData(844,390);
      for(let y=0;y<390;y++)out.data.set(pixels.subarray((389-y)*844*4,(390-y)*844*4),y*844*4);
      ctx.putImageData(out,0,0);
      return {png:canvas.toDataURL('image/png').split(',')[1],buildings:window.__cityPreview.count,
              models:v.models.metrics(),source:'existing read-only cityPreview=full',
              referenceCommit:'11fef2fb98eec4173381346caee94f2930f9cffa',
              camera:{elevation:.48,span:24.5},previewOnly:true};
    }""")
    destination = ROOT / "preview" / "city-reference.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(base64.b64decode(result.pop("png")))
    (destination.parent / "city-reference.json").write_text(json.dumps(result, indent=2)+"\n")
    print(json.dumps({"path": str(destination), **result}))
    browser.close()
