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
    const sessions = new Map(), attaching = new Map(), pending = new Set();
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
          page.on('worker', worker => {
            const entry = {url:worker.url(), hooked:false, closed:false}; workers.push(entry);
            worker.on('close', () => {entry.closed = true;});
            // The page CDP audit/log channels cover startup. Also listen inside
            // workers once attached so later importScripts/eval policy errors
            // are reported even if their console lacks Chrome's usual wording.
            const hook = worker.evaluate(() => globalThis.addEventListener('securitypolicyviolation', event => {
              console.error('ISLAND_CSP_VIOLATION ' + JSON.stringify({blockedURI:event.blockedURI, effectiveDirective:event.effectiveDirective,
                disposition:event.disposition, originalPolicy:event.originalPolicy, sourceFile:event.sourceFile, lineNumber:event.lineNumber}));
            }, true)).then(() => {entry.hooked = true;}).catch(error => {
              if (!entry.closed) policyErrors.push({url:worker.url(), reason:`Worker CSP hook failed: ${error.message}`});
            });
            pending.add(hook); hook.finally(() => pending.delete(hook));
          });
        } catch (error) {
          if (!page.isClosed()) policyErrors.push({url:page.url(), reason:`Chromium CSP audit unavailable: ${error.message}`});
        }
      })();
      attaching.set(page, task); return task;
    }
    context.on('page', page => {void attachPage(page);});
    await Promise.all(context.pages().map(attachPage));
    const snapshot = () => ({expectedPolicy, violations:violations.map(v => ({...v})), policyErrors:policyErrors.map(v => ({...v})), workers:workers.map(v => ({...v}))});
    return {violations, policyErrors, attachPage, snapshot,
      async assertClean() {
        await Promise.all([...attaching.values()]);
        // A test may freeze page.clock. Flush browser microtasks without using
        // that clock; the following Node timer drains protocol notifications.
        await Promise.all(context.pages().filter(page => !page.isClosed()).map(page => page.evaluate(() => Promise.resolve()).catch(() => {})));
        await Promise.all([...pending]);
        // Drain bindings/audit messages already emitted during exit or teardown.
        await new Promise(resolve => setTimeout(resolve, 25));
        if (violations.length || policyErrors.length) throw Error(`Island CSP audit failed: ${JSON.stringify(snapshot())}`);
      },
      async dispose() { await Promise.allSettled([...sessions.values()].map(session => session.detach())); sessions.clear(); },
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
