"""Inspect shipped avatar packing with synthetic appearance; no product modification."""
import re
from playwright.sync_api import sync_playwright
from common import *

PROBE=r"""async () => {
 const base=new URL('/Bakasun/workout/island/',location.href);
 const [{GLTFLoader},{HoopsDRACOLoader},{createAvatarV1},T]=await Promise.all([
  import(new URL('vendor/GLTFLoader.js',base)),import(new URL('minigames/hoops-draco.mjs',base)),
  import(new URL('minigames/hoops-players-v1.mjs',base)),import(new URL('vendor/three.module.js',base))]);
 const draco=new HoopsDRACOLoader();draco.setDecoderPath(new URL('vendor/draco/',base).href);draco.setWorkerLimit(1);
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);const result={revision:T.REVISION,roles:[]};
 try {
  for(const role of ['PG','SG','SF','PF','C']){
   const path=`design/hoops/lod-v4/hoops-v4-${role.toLowerCase()}-lod.glb`;
   const gltf=await loader.loadAsync(new URL(path,base).href);
   const assets={bodies:{[role]:gltf},clips:new Map(),skins:[],v4:true,baseHeights:{[role]:200}};
   const avatar=createAvatarV1(assets,{id:'audit-'+role,pos:role,name:'בדיקה',number:1,ratings:{height:200},look:{}},
    {primary:'#245676',secondary:'#e3d6ad',trim:'#fff',wordmark:'בדיקה',mark:'',darkText:false});
   const meshes=[],textures=new Map();
   avatar.root.traverse(o=>{if(!o.isMesh||!o.visible)return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    meshes.push({name:o.name,bones:o.skeleton?.bones.length||0,triangles:(o.geometry.index?.count||o.geometry.attributes.position.count)/3});
    for(const m of mats)for(const [slot,t] of Object.entries(m))if(t?.isTexture){
     if(!textures.has(t.uuid))textures.set(t.uuid,{slots:[],width:t.image?.width,height:t.image?.height,canvas:!!t.isCanvasTexture});
     textures.get(t.uuid).slots.push(o.name+':'+slot);
    }
   });
   result.roles.push({role,path,meshes,textureCount:textures.size,textures:[...textures.values()],packing:avatar.packed.stats});
   avatar.dispose();gltf.scene.traverse(o=>{o.geometry?.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){if(!m)continue;for(const t of Object.values(m))if(t?.isTexture)t.dispose();m.dispose();}});
  }
 }finally{draco.dispose();}
 return result;
}"""

def main():
    out=OUT/'iterations/10';out.mkdir(parents=True,exist_ok=True)
    r={'started':stamp(),'conditions':'Actual shipped createAvatarV1 and compactAvatar, five current lod-v4 bodies, synthetic card/colours only; no animation clips or WebGL frame benchmark; same island document CSP on a synthetic local probe document.','errors':[]}
    policy=re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"',(ROOT/'workout/island/index.html').read_text()).group(1)
    with server() as base,sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        c=b.new_context(service_workers='block');blocked=[];block_external(c,base,blocked);c.add_init_script(OBSERVERS)
        p=c.new_page();p.on('pageerror',lambda e:r['errors'].append(str(e)))
        p.route('**/audit-runtime-probe.html',lambda route:route.fulfill(body='<!doctype html><html lang="he"><title>בדיקת נכסים</title><body></body></html>',content_type='text/html',headers={'content-security-policy':policy}))
        try:
            p.goto(base+'audit-runtime-probe.html');p.set_default_timeout(180000)
            r['result']=p.evaluate(PROBE);r['csp']=p.evaluate('() => window.__audit.csp')
        except Exception as e:r['harnessError']=str(e)
        r['externalBlocked']=blocked;c.close();b.close()
    r['finished']=stamp();write_json(out/'runtime-assets.json',r)
    print(json.dumps(r,ensure_ascii=False))

if __name__=='__main__':main()
