#!/usr/bin/env python3
"""Bake five EXISTING Meshy ships for the preview, without modifying sources.

Needs Python Playwright + Chromium. Uses repo-local Three.js, never a CDN.
These preview derivatives retain their existing source terms (not CC0).
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import base64
import json
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[3]
JAVASCRIPT="""async () => {
 const T=await import('/workout/island/vendor/three.module.js');
 const {GLTFLoader}=await import('/workout/island/vendor/GLTFLoader.js');
 const {fitModel}=await import('/workout/island/view/local-models.mjs');
 const names=['alien-a.glb','alien-b.glb','alien-c.glb','alien-d-512.glb','boss.glb'];
 const loader=new GLTFLoader();
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
 renderer.setSize(256,256); renderer.setClearColor(0,0);
 renderer.outputColorSpace=T.SRGBColorSpace; renderer.toneMapping=T.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.1;
 const scene=new T.Scene();
 scene.add(new T.HemisphereLight(0xc0e5ff,0x262133,2.2));
 const key=new T.DirectionalLight(0xffe1bc,3); key.position.set(-3,6,5); scene.add(key);
 const rim=new T.DirectionalLight(0x71b6ff,2.4); rim.position.set(4,3,-4); scene.add(rim);
 const camera=new T.OrthographicCamera(-.7,.7,.7,-.7,.01,30);
 camera.up.set(0,0,-1); camera.position.set(0,4.5,4.8); camera.lookAt(0,0,0);
 const canvas=document.createElement('canvas'); canvas.width=1280;canvas.height=256;
 const c=canvas.getContext('2d');
 for(let i=0;i<names.length;i++) {
  const gltf=await loader.loadAsync('/workout/island/assets/models/'+names[i]);
  const root=fitModel(gltf.scene,{rotationY:270,scale:1},{length:1});
  const b=new T.Box3().setFromObject(root),center=b.getCenter(new T.Vector3());
  root.children[0].position.y-=center.y;
  scene.add(root); renderer.render(scene,camera);c.drawImage(renderer.domElement,i*256,0);
  root.removeFromParent();
 }
 renderer.dispose();return canvas.toDataURL('image/png').split(',')[1];
}"""


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass


def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(REPO)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=[
                '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            page=browser.new_page()
            page.goto(f'http://127.0.0.1:{server.server_port}/workout/island/design/alien-hits-v1/')
            data=page.evaluate(JAVASCRIPT)
            (ROOT/'preview-ships.png').write_bytes(base64.b64decode(data))
            browser.close()
    finally: server.shutdown()
    print(json.dumps({'previewShipsBytes':(ROOT/'preview-ships.png').stat().st_size}))


if __name__=='__main__': main()
