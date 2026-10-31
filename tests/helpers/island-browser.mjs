import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const islandRoot = path.resolve(fileURLToPath(new URL('../../workout/island/', import.meta.url)));

/** Use the shipped policy as the single source of truth. A missing or
 * ambiguous policy is a test setup failure, never permission to omit CSP. */
export async function readIslandCsp() {
  const html = await readFile(path.join(islandRoot, 'index.html'), 'utf8');
  const policies = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attributes = {};
    for (const match of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    if (attributes['http-equiv']?.toLowerCase() === 'content-security-policy') policies.push(attributes.content);
  }
  if (policies.length !== 1 || !policies[0]?.trim()) throw Error('Island test server requires exactly one nonempty CSP in index.html');
  return policies[0].replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const cspMonitors = new WeakMap();
const cspMessage = /ISLAND_CSP_VIOLATION|content[- ]security[- ]policy|violates? (?:the following |an? )?(?:report-only )?(?:policy|directive)|\bCSP\b.*(?:violation|blocked|refused)/i;

/** Install before navigation. Init scripts run in every document/frame, before
 * its scripts, while Chromium's audit/log channels also cover worker/startup
 * failures. Every HTML response must carry the exact shipped policy. Console
 * diagnostics remain evidence even if a violation event is not dispatched. */
export async function installIslandCspMonitor(context) {
  if (cspMonitors.has(context)) return cspMonitors.get(context);
  const installation = (async () => {
    const expectedPolicy = await readIslandCsp(), violations = [], policyErrors = [], workers = [];
    let htmlResponsesSeen=0;
    const sessions = new Map(), attaching = new Map(), pending = new Set(), resumeWorkers = new Set(), workerClosers = new Set();
    context.on('close', () => {for(const close of workerClosers)close();});
    const binding = '__islandReportCspViolation';
    const record = value => violations.push({...value, observedAt: Date.now()});
    await context.exposeBinding(binding, ({page, frame}, value) => record({kind:'event', pageUrl:page?.url(), frameUrl:frame?.url(), ...value}));
    await context.addInitScript(({binding}) => {
      globalThis.addEventListener('securitypolicyviolation', event => {
        const value = {blockedURI:event.blockedURI, effectiveDirective:event.effectiveDirective, violatedDirective:event.violatedDirective,
          disposition:event.disposition, originalPolicy:event.originalPolicy, documentURI:event.documentURI, sourceFile:event.sourceFile,
          lineNumber:event.lineNumber, columnNumber:event.columnNumber, statusCode:event.statusCode, sample:event.sample};
        // A detached/closing frame may lose its binding after the event; its
        // browser audit/console record remains independently monitored below.
        globalThis[binding](value).catch(() => {});
      }, true);
    }, {binding});
    context.on('console', message => {
      if (cspMessage.test(message.text())) record({kind:'console', text:message.text(), location:message.location(), pageUrl:message.page()?.url()});
    });
    context.on('response', response => {
      if (!/\btext\/html\b/i.test(response.headers()['content-type'] || '')) return;
      htmlResponsesSeen++;
      const task = (async () => {
        const actualPolicy = await response.headerValue('content-security-policy');
        if (actualPolicy !== expectedPolicy) policyErrors.push({url:response.url(), expectedPolicy, actualPolicy,
          reason:actualPolicy === null ? 'HTML response omitted the shipped CSP header' : 'HTML response changed the shipped CSP header'});
      })().catch(error => policyErrors.push({url:response.url(), reason:`Unable to inspect HTML CSP: ${error.message}`}));
      pending.add(task); task.finally(() => pending.delete(task));
    });
    function attachPage(page) {
      if (attaching.has(page)) return attaching.get(page);
      const task = (async () => {
        if (page.isClosed()) return;
        try {
          const cdp = await context.newCDPSession(page); sessions.set(page, cdp);
          cdp.on('Audits.issueAdded', ({issue}) => {
            if (issue.code === 'ContentSecurityPolicyIssue') record({kind:'chromium-audit', pageUrl:page.url(), ...issue.details.contentSecurityPolicyIssueDetails});
          });
          cdp.on('Log.entryAdded', ({entry}) => {
            if (cspMessage.test(entry.text)) record({kind:'chromium-log', pageUrl:page.url(), text:entry.text, source:entry.source,
              url:entry.url, lineNumber:entry.lineNumber, workerId:entry.workerId});
          });
          await Promise.all([cdp.send('Audits.enable'), cdp.send('Log.enable')]);
          // Worker security diagnostics do not reliably reach a page session.
          // Attach ONLY its related workers (never documents/other contexts),
          // install a Runtime binding while startup is paused, and always
          // resume, including when a worker domain or hook reports an error.
          const children=new Map();let commandId=0;
          function command(child,method,params={}){
            if(child.entry.closed)return Promise.reject(Error('Worker target closed'));
            const id=++commandId;
            return new Promise((resolve,reject)=>{
              const timer=setTimeout(()=>{child.commands.delete(id);reject(Error(`Worker CDP timeout: ${method}`));},10000);
              child.commands.set(id,{resolve,reject,timer});
              cdp.send('Target.sendMessageToTarget',{sessionId:child.sessionId,message:JSON.stringify({id,method,params})}).catch(error=>{
                clearTimeout(timer);child.commands.delete(id);reject(error);
              });
            });
          }
          function closeChild(child){
            child.entry.closed=true;resumeWorkers.delete(child.resume);
            for(const request of child.commands.values()){clearTimeout(request.timer);request.reject(Error('Worker target closed'));}
            child.commands.clear();children.delete(child.sessionId);workerClosers.delete(child.close);
          }
          cdp.on('Target.receivedMessageFromTarget',({sessionId,message})=>{
            const child=children.get(sessionId);if(!child)return;
            const value=JSON.parse(message);
            if(value.id){const request=child.commands.get(value.id);if(!request)return;clearTimeout(request.timer);child.commands.delete(value.id);
              if(value.error)request.reject(Error(value.error.message));else request.resolve(value.result);return;}
            if(value.method==='Runtime.bindingCalled'&&value.params.name==='__islandWorkerCsp'){
              try{record({kind:'worker-event',workerUrl:child.entry.url,pageUrl:page.url(),...JSON.parse(value.params.payload)});}
              catch(error){policyErrors.push({url:child.entry.url,reason:`Worker CSP event unreadable: ${error.message}`});}
            }else if(value.method==='Audits.issueAdded'&&value.params.issue.code==='ContentSecurityPolicyIssue'){
              record({kind:'worker-audit',workerUrl:child.entry.url,...value.params.issue.details.contentSecurityPolicyIssueDetails});
            }else if(value.method==='Log.entryAdded'&&cspMessage.test(value.params.entry.text)){
              record({kind:'worker-log',workerUrl:child.entry.url,...value.params.entry});
            }
          });
          cdp.on('Target.detachedFromTarget',({sessionId})=>{const child=children.get(sessionId);if(child)closeChild(child);});
          cdp.on('Target.attachedToTarget',({sessionId,targetInfo,waitingForDebugger})=>{
            const entry={url:targetInfo.url,hooked:false,closed:false,waitingForDebugger,domains:{}};workers.push(entry);
            const child={sessionId,entry,commands:new Map()};children.set(sessionId,child);
            child.resume=()=>command(child,'Runtime.runIfWaitingForDebugger');child.close=()=>closeChild(child);
            resumeWorkers.add(child.resume);workerClosers.add(child.close);
            const hook=(async()=>{
              try{
                // Not every worker target exposes Log/Audits. Runtime binding
                // plus the pre-start listener is required; native logs are an
                // additional independent channel when its domains are present.
                await Promise.all(['Log.enable','Audits.enable'].map(async method=>{
                  try{await command(child,method);entry.domains[method]=true;}catch{entry.domains[method]=false;}
                }));
                await command(child,'Runtime.enable');
                await command(child,'Runtime.addBinding',{name:'__islandWorkerCsp'});
                const result=await command(child,'Runtime.evaluate',{expression:`globalThis.addEventListener('securitypolicyviolation',event=>globalThis.__islandWorkerCsp(JSON.stringify({blockedURI:event.blockedURI,effectiveDirective:event.effectiveDirective,violatedDirective:event.violatedDirective,disposition:event.disposition,originalPolicy:event.originalPolicy,sourceFile:event.sourceFile,lineNumber:event.lineNumber,columnNumber:event.columnNumber})),true);typeof globalThis.__islandWorkerCsp`});
                if(result.exceptionDetails||result.result?.value!=='function')throw Error('Worker CSP listener/binding was not installed');
                entry.hooked=true;
              }catch(error){if(!entry.closed)policyErrors.push({url:entry.url,reason:`Worker CSP hook failed: ${error.message}`});}
              finally{if(!entry.closed)await child.resume().catch(error=>{if(!entry.closed)policyErrors.push({url:entry.url,reason:`Unable to resume worker: ${error.message}`});});}
            })();
            pending.add(hook);hook.finally(()=>pending.delete(hook));
          });
          await cdp.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:false,filter:[{type:'worker',exclude:false},{exclude:true}]});
        } catch (error) {
          if (!page.isClosed()) policyErrors.push({url:page.url(), reason:`Chromium CSP audit unavailable: ${error.message}`});
        }
      })();
      attaching.set(page, task); return task;
    }
    context.on('page', page => {void attachPage(page);});
    await Promise.all(context.pages().map(attachPage));
    const snapshot = () => ({expectedPolicy, htmlResponsesSeen, violations:violations.map(v => ({...v})), policyErrors:policyErrors.map(v => ({...v})), workers:workers.map(v => ({...v}))});
    return {violations, policyErrors, attachPage, snapshot,
      async assertClean() {
        await Promise.all([...attaching.values()]);
        // A test may freeze page.clock. Flush browser microtasks without using
        // that clock; the following Node timer drains protocol notifications.
        await Promise.all(context.pages().filter(page => !page.isClosed()).map(page => page.evaluate(() => Promise.resolve()).catch(() => {})));
        await Promise.all([...pending]);
        // Drain bindings/audit messages already emitted during exit or teardown.
        await new Promise(resolve => setTimeout(resolve, 25));
        if(!htmlResponsesSeen)throw Error(`Island CSP audit failed: No HTML response audited: ${JSON.stringify(snapshot())}`);
        if (violations.length || policyErrors.length) throw Error(`Island CSP audit failed: ${JSON.stringify(snapshot())}`);
      },
      async dispose() {
        await Promise.allSettled([...resumeWorkers].map(resume=>resume()));
        await Promise.allSettled([...sessions.values()].map(async session=>{try{await session.send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:false});}catch{}await session.detach();session.removeAllListeners();}));
        for(const close of [...workerClosers])close();sessions.clear();
      },
    };
  })();
  cspMonitors.set(context, installation); return installation;
}

export async function islandChromium() {
  try { return (await import('playwright')).chromium; }
  catch {
    const modulePath = process.env.ISLAND_PLAYWRIGHT || path.resolve(path.dirname(process.execPath), '../node_modules/playwright/index.mjs');
    return (await import(pathToFileURL(modulePath).href)).chromium;
  }
}

// Mirror the published subtree; missing lab and other application paths are 404.
export async function serveIsland(prefix = '/Bakasun/workout/island/') {
  const csp = await readIslandCsp();
  if (process.env.ISLAND_URL) {
    const target = new URL('./', process.env.ISLAND_URL);
    target.search = ''; target.hash = '';
    return { url: target.href, csp, async close() {} };
  }
  const root = islandRoot;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
      let file = path.resolve(root, pathname.slice(prefix.length) || '.');
      if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await readFile(file);
      const headers = { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' };
      if (path.extname(file).toLowerCase() === '.html') headers['content-security-policy'] = csp;
      response.writeHead(200, headers);
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}${prefix}`,
    csp,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}
