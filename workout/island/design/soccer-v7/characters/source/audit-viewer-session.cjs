/** Local-only audit session. An optional explicit runtime override is diagnostic. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const packageRoot = path.resolve(__dirname, '..');
const {chromium} = createRequire(path.join(packageRoot, 'source/audit-transitions.cjs'))('playwright');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const DECLARED_SOURCE_FILES=Object.freeze({manifest:'asset-manifest.json',motion:'animations.json',preview:'preview.js',motionRuntime:'source/motion-runtime.js',locomotion:'source/locomotion-space.js',locomotionCurve:'source/locomotion-curve.js',dribble:'source/locomotion-dribble.js',recovery:'source/recovery-state.js',scene:'source/scene.js',props:'source/props.js',palmSupport:'source/palm-support.js',bootBounds:'verification/boot-bounds.json'});
function declaredSourceBindings(hashes,inputs){
  const unknownKeys=Object.keys(hashes||{}).filter(key=>key!=='models'&&!Object.hasOwn(DECLARED_SOURCE_FILES,key));
  const rows=Object.entries(DECLARED_SOURCE_FILES).map(([key,file])=>{const expected=hashes?.[key],actual=(inputs[file]||inputs[path.join(packageRoot,file)])?.sha256;return{key,file,declaredSha256:expected,actualSha256:actual,pass:typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)&&expected===actual};});
  return{rows,unknownKeys,pass:unknownKeys.length===0&&rows.every(row=>row.pass)};
}
/** Snapshot only executable package resources; gallery/docs are not inputs. */
function capturePackageSnapshot(directory=packageRoot) {
  const files=['preview.html','preview.css'];
  const collect=relative=>{for(const entry of fs.readdirSync(path.join(directory,relative),{withFileTypes:true})){const file=relative+'/'+entry.name;if(entry.isDirectory())collect(file);else if(entry.isFile()&&/\.(?:js|wasm|glb)$/.test(entry.name))files.push(file);}};
  for(const relative of['vendor','offline','models'])collect(relative);
  files.sort();
  const before=Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(directory,file)))]));
  const bytes=new Map(files.map(file=>[file,fs.readFileSync(path.join(directory,file))]));
  const changed=files.filter(file=>before[file]!==sha(bytes.get(file))||before[file]!==sha(fs.readFileSync(path.join(directory,file))));
  if(changed.length)throw Error('Package changed while RAM snapshot was constructed: '+changed.join(', '));
  const text=bytes.get('vendor/data.js').toString('utf8'),match=text.match(/globalThis\.SOCCER_V7_DATA\s*=\s*([\s\S]+);\s*$/);
  if(!match)throw Error('Expected generated JSON-only data assignment');
  const data=JSON.parse(match[1]),models=data.hashes?.models;
  if(!models||!Object.keys(models).length)throw Error('Package has no declared model hashes');
  const manifestPaths=(data.manifest?.characters||[]).flatMap(character=>(character.kits||[]).flatMap(kit=>[kit.lod0,kit.lod1].filter(Boolean)));
  if(!manifestPaths.length||manifestPaths.some(file=>!models[file])||Object.keys(models).some(file=>!manifestPaths.includes(file)))throw Error('Manifest model paths disagree with declared model hashes');
  const integrity=Object.entries(models).map(([file,expected])=>{
    const model=bytes.get(file),offline=file.replace(/^models\//,'offline/').replace(/\.glb$/,'.js'),script=bytes.get(offline);
    const encoded=script?.toString('utf8').match(/\["([^"]+)"\]="([A-Za-z0-9+/=]+)";/);
    const modelSha256=model&&sha(model),payloadSha256=encoded&&sha(Buffer.from(encoded[2],'base64'));
    return{file,offline,expected,modelSha256,payloadSha256,pass:Boolean(model&&encoded&&encoded[1]===file&&modelSha256===expected&&payloadSha256===expected)};
  });
  if(integrity.some(row=>!row.pass))throw Error('RAM snapshot contains a half-published model/data/offline package: '+integrity.filter(row=>!row.pass).map(row=>row.file).join(', '));
  return{bytes,integrity,atomicConstruction:true};
}
async function openAuditViewer({runtimePath=null, sourcePaths=[]}={}) {
  const productionSourcePaths=Object.values(DECLARED_SOURCE_FILES).map(file=>path.join(packageRoot,file));
  const missingProductionSources=Object.entries(DECLARED_SOURCE_FILES).filter(([,file])=>!fs.existsSync(path.join(packageRoot,file))).map(([key,file])=>({key,file}));
  if(!runtimePath&&missingProductionSources.length)throw Error('Actual package is missing required declared source witnesses: '+missingProductionSources.map(row=>row.file).join(', '));
  const inputPaths=[...new Set([...(runtimePath?[runtimePath]:[]),...productionSourcePaths.filter(file=>runtimePath?fs.existsSync(file):true),...sourcePaths])];
  const immutableInputs=Object.fromEntries(inputPaths.map(file=>{const bytes=fs.readFileSync(file);return[file,{bytes:bytes.length,sha256:sha(bytes)}];}));
  const override=runtimePath?fs.readFileSync(runtimePath):null;
  const snapshot=capturePackageSnapshot(),packageSnapshot=snapshot.bytes;
  // Snapshot construction must also leave declared source witnesses unchanged.
  const constructionSourceChanges=inputPaths.filter(file=>sha(fs.readFileSync(file))!==immutableInputs[file].sha256);
  if(constructionSourceChanges.length)throw Error('Declared input changed during snapshot construction: '+constructionSourceChanges.join(', '));
  const served = {}, decodedModels = {}, errors = [], remoteRequests = [];
  const mime = {'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'};
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(packageRoot,'.'+pathname);
    if(!file.startsWith(packageRoot+'/')){res.writeHead(403);res.end();return;}
    try{
      const isOverride=pathname==='/vendor/viewer-runtime.js'&&override!==null;
      const relative=path.relative(packageRoot,file);
      if(!packageSnapshot.has(relative)){res.writeHead(404);res.end();return;}
      const bytes=isOverride?override:packageSnapshot.get(relative);
      served[path.relative(packageRoot,file)]={bytes:bytes.length,sha256:sha(bytes),override:isOverride};
      if(pathname.startsWith('/offline/')){
        const found=bytes.toString('utf8').match(/\["([^"]+)"\]="([^"]+)";/);
        if(found){const model=Buffer.from(found[2],'base64');decodedModels[found[1]]={bytes:model.length,sha256:sha(model)};}
      }
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
    page.on('pageerror',error=>errors.push(String(error)));
    await page.route(/^https?:/,route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();remoteRequests.push(route.request().url());return route.abort('blockedbyclient');});
    await page.addInitScript(()=>{globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=()=>{};});
    await page.goto(origin+'/preview.html?paused&clean',{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>Boolean(globalThis.soccerV7?.ready),{timeout:60000});
    await page.evaluate(()=>soccerV7.ready);
    await page.evaluate(()=>soccerV7.setPlaying(false));
    return{page,errors,remoteRequests,origin,served,decodedModels,immutableInputs,metadata(){
      const unchanged=Object.entries(immutableInputs).map(([file,expected])=>({file,expected,...(()=>{try{const bytes=fs.readFileSync(file);return{bytes:bytes.length,sha256:sha(bytes),pass:sha(bytes)===expected.sha256};}catch{return{pass:false};}})()}));
      const servedUnchanged=Object.entries(served).map(([file,expected])=>{const source=expected.override?runtimePath:path.join(packageRoot,file);try{const bytes=fs.readFileSync(source);return{file,source,pass:sha(bytes)===expected.sha256,sha256:sha(bytes)};}catch{return{file,source,pass:false};}});
      const modelsMatchDisk=Object.entries(decodedModels).map(([file,expected])=>{const bytes=fs.readFileSync(path.join(packageRoot,file));return{file,...expected,diskSha256:sha(bytes),pass:sha(bytes)===expected.sha256};});
      return{packageSnapshot:{kind:'RAM-pinned-before-browser-open',sha256:sha(Buffer.from(JSON.stringify([...packageSnapshot].map(([file,bytes])=>[file,sha(file==='vendor/viewer-runtime.js'&&override?override:bytes)])))),atomicConstruction:snapshot.atomicConstruction,modelIntegrity:snapshot.integrity,files:[...packageSnapshot].map(([file,bytes])=>{const actual=file==='vendor/viewer-runtime.js'&&override?override:bytes;return{file,bytes:actual.length,sha256:sha(actual)};})},diagnosticOverride:override!==null,missingProductionSources,productionSourceFilesPresent:missingProductionSources.length===0,overrides:override===null?{}:{'vendor/viewer-runtime.js':{source:runtimePath,sha256:sha(override),bytes:override.length}},immutableInputs,unchanged,served,servedUnchanged,decodedModels,modelsMatchDisk,errors,remoteRequests};
    },async close(){await browser.close();await new Promise(resolve=>server.close(resolve));}};
  }catch(error){if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));throw error;}
}
module.exports={openAuditViewer,packageRoot,sha,capturePackageSnapshot,DECLARED_SOURCE_FILES,declaredSourceBindings};
