import { createServer } from 'node:http'; import { readFile, stat } from 'node:fs/promises'; import path from 'node:path'; import zlib from 'node:zlib';
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
export async function serve(root, port=0){
  const server=createServer(async(req,res)=>{
    let p=decodeURIComponent(new URL(req.url,'http://x').pathname); if(p.endsWith('/'))p+='index.html';
    const file=path.join(root,p); if(!file.startsWith(root)){res.writeHead(403).end();return;}
    try{let body=await readFile(file);const ext=path.extname(file);const h={'content-type':TYPES[ext]||'application/octet-stream','cache-control':'no-cache'};
      if(/\.(html|js|css|json|svg)$/.test(ext)&&/gzip/.test(req.headers['accept-encoding']||'')){body=zlib.gzipSync(body);h['content-encoding']='gzip';}
      h['content-length']=body.length;res.writeHead(200,h).end(body);}catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  return {server,base:'http://127.0.0.1:'+server.address().port+'/'};
}
