/** Basketball binary loading deliberately uses the browser's native body
 * reader. Do not wrap Response.body in FileLoader's progress ReadableStream:
 * Chrome can abort that wrapper even when all original bytes arrived intact. */
export async function fetchHoopsAsset(loader,url,responseType='arraybuffer',{fetcher=globalThis.fetch,signal,parse}={}){
 if(responseType!=='arraybuffer'&&responseType!=='text')throw Error('Unsupported basketball asset response: '+responseType);
 const manager=loader.manager,resolved=manager?.resolveURL(String(url))??String(url);
 manager?.itemStart(resolved);
 try{
  const response=await fetcher(resolved,{headers:loader.requestHeader,credentials:loader.withCredentials?'include':'same-origin',signal});
  if(!response.ok)throw Error('Basketball asset HTTP '+response.status+': '+resolved);
  const bytes=await (responseType==='text'?response.text():response.arrayBuffer());
  // A GLB stays registered with LoadingManager until parsing/dependencies end.
  return parse?await parse(bytes):bytes;
 }catch(error){manager?.itemError(resolved);throw error;}finally{manager?.itemEnd(resolved);}
}

function resourceDirectory(url){
 try{return new URL('.',url).href;}catch{const path=url.split(/[?#]/,1)[0],slash=path.lastIndexOf('/');return slash<0?'./':path.slice(0,slash+1);}
}

export function loadHoopsGLTF(loader,url,options={}){
 const requested=(loader.path||'')+String(url),resourcePath=loader.resourcePath||resourceDirectory(requested);
 return fetchHoopsAsset(loader,requested,'arraybuffer',{...options,parse:buffer=>loader.parseAsync(buffer,resourcePath)});
}
