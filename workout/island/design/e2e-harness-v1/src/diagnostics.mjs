const cspText = /content[- ]security[- ]policy|violat(?:es|ed|ion).*\b(?:policy|directive)|\bCSP\b.*(?:violation|blocked|refused)/i;

export async function monitor(context, page, cdp) {
  const data = {consoleErrors: [], pageErrors: [], cspViolations: [], failedRequests: [], wasmRequests: [], warnings: [], crashes: [], cspDocuments: [], monitorErrors: []};
  let phase = 'setup';
  const record = (kind, value) => data[kind].push({phase, at: new Date().toISOString(), ...value});
  context.on('console', msg => {
    const item = {text: msg.text(), location: msg.location(), url: msg.page()?.url()};
    if (msg.type() === 'error') record('consoleErrors', item);
    if (msg.type() === 'warning') record('warnings', item);
    if (cspText.test(msg.text())) record('cspViolations', {source: 'console', ...item});
  });
  context.on('weberror', e => record('pageErrors', {text: e.error().message, stack: e.error().stack, url: e.page()?.url()}));
  page.on('crash', () => record('crashes', {url: page.url()}));
  context.on('requestfailed', req => {
    const item = {url: req.url(), type: req.resourceType(), reason: req.failure()?.errorText};
    record('failedRequests', item);
    if (/csp|content_security_policy/i.test(item.reason || '')) record('cspViolations', {source: 'network', ...item});
  });
  context.on('request', req => {
    if (/\.wasm(?:[?#]|$)/i.test(req.url())) record('wasmRequests', {url: req.url(), type: req.resourceType()});
  });
  context.on('response', response => {
    if (response.request().resourceType() !== 'document') return;
    record('cspDocuments', {url: response.url(), header: response.headers()['content-security-policy'] || null});
  });
  cdp.on('Audits.issueAdded', ({issue}) => {
    if (issue.code === 'ContentSecurityPolicyIssue') record('cspViolations', {source: 'chromium-audit', ...issue.details.contentSecurityPolicyIssueDetails});
  });
  cdp.on('Log.entryAdded', ({entry}) => {
    if (cspText.test(entry.text)) record('cspViolations', {source: 'chromium-log', text: entry.text, url: entry.url, workerId: entry.workerId});
    // Console API errors are captured by Playwright; browser worker errors can
    // only reach the Log domain. Keep these independently, without an allowlist.
    if (entry.level === 'error' && entry.source === 'worker') record('pageErrors', {source: 'worker-log', text: entry.text, url: entry.url});
  });
  await Promise.all([cdp.send('Audits.enable'), cdp.send('Log.enable'), cdp.send('Network.enable')]);
  cdp.on('Network.loadingFailed', value => {
    if (value.blockedReason === 'csp') record('cspViolations', {source: 'chromium-network', requestId: value.requestId, errorText: value.errorText});
  });
  // A passive observer in every frame also covers events without console text.
  // It never writes storage, calls app methods or changes game state/time.
  await context.exposeBinding('__e2eObserveCsp', ({frame}, value) => record('cspViolations', {source: 'event', frame: frame.url(), ...value}));
  await context.addInitScript(() => {
    globalThis.addEventListener('securitypolicyviolation', event => {
      void globalThis.__e2eObserveCsp({blockedURI: event.blockedURI, effectiveDirective: event.effectiveDirective,
        disposition: event.disposition, originalPolicy: event.originalPolicy, sourceFile: event.sourceFile,
        lineNumber: event.lineNumber}).catch(() => {});
    }, true);
  });
  // A dedicated worker has its own CSP and may never report to a page CDP
  // session. Observe related worker targets before their first script executes.
  const workers = new Map(); let commandId = 0, closing = false;
  function command(worker, method, params = {}) {
    if (worker.closed) return Promise.reject(new Error('Worker detached'));
    const id = ++commandId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {worker.pending.delete(id); reject(new Error(`Worker monitor timeout: ${method}`));}, 10000);
      worker.pending.set(id, {resolve, reject, timer});
      cdp.send('Target.sendMessageToTarget', {sessionId: worker.id, message: JSON.stringify({id, method, params})}).catch(error => {
        clearTimeout(timer); worker.pending.delete(id); reject(error);
      });
    });
  }
  function detached(id) {
    const worker = workers.get(id); if (!worker) return;
    worker.closed = true;
    for (const request of worker.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Worker detached')); }
    worker.pending.clear(); workers.delete(id);
  }
  context.on('close', () => {closing = true; for (const id of workers.keys()) detached(id);});
  cdp.on('Target.detachedFromTarget', ({sessionId}) => detached(sessionId));
  cdp.on('Target.receivedMessageFromTarget', ({sessionId, message}) => {
    const worker = workers.get(sessionId); if (!worker) return;
    const value = JSON.parse(message);
    if (value.id) {
      const request = worker.pending.get(value.id); if (!request) return;
      clearTimeout(request.timer); worker.pending.delete(value.id);
      if (value.error) request.reject(new Error(value.error.message)); else request.resolve(value.result);
      return;
    }
    if (value.method === 'Runtime.bindingCalled' && value.params.name === '__e2eWorkerCsp') {
      try { record('cspViolations', {source: 'worker-event', workerUrl: worker.url, ...JSON.parse(value.params.payload)}); }
      catch (error) { record('monitorErrors', {text: error.message, workerUrl: worker.url}); }
    } else if (value.method === 'Audits.issueAdded' && value.params.issue.code === 'ContentSecurityPolicyIssue') {
      record('cspViolations', {source: 'worker-audit', workerUrl: worker.url, ...value.params.issue.details.contentSecurityPolicyIssueDetails});
    } else if (value.method === 'Log.entryAdded' && cspText.test(value.params.entry.text)) {
      record('cspViolations', {source: 'worker-log', workerUrl: worker.url, text: value.params.entry.text});
    }
  });
  cdp.on('Target.attachedToTarget', async ({sessionId, targetInfo}) => {
    const worker = {id: sessionId, url: targetInfo.url, pending: new Map(), closed: false};
    workers.set(sessionId, worker);
    try {
      if (['worker', 'shared_worker'].includes(targetInfo.type)) {
        await command(worker, 'Runtime.enable');
        await command(worker, 'Log.enable');
        await command(worker, 'Runtime.addBinding', {name: '__e2eWorkerCsp'});
        await command(worker, 'Runtime.evaluate', {expression: `globalThis.addEventListener('securitypolicyviolation', event => globalThis.__e2eWorkerCsp(JSON.stringify({blockedURI:event.blockedURI,effectiveDirective:event.effectiveDirective,disposition:event.disposition,originalPolicy:event.originalPolicy})))`});
      }
    } catch (error) {
      if (!closing && !worker.closed) record('monitorErrors', {text: error.message, workerUrl: worker.url});
    } finally {
      try { await command(worker, 'Runtime.runIfWaitingForDebugger'); } catch {}
    }
  });
  await cdp.send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: true, flatten: false});
  return {data, setPhase(value) { phase = value; }};
}

export function diagnosticChecks(data) {
  return [
    {name: 'zero-console-errors', pass: data.consoleErrors.length === 0, actual: data.consoleErrors.length, expected: 0},
    {name: 'zero-page-errors', pass: data.pageErrors.length === 0, actual: data.pageErrors.length, expected: 0},
    {name: 'zero-csp-violations', pass: data.cspViolations.length === 0, actual: data.cspViolations.length, expected: 0},
    {name: 'zero-page-crashes', pass: data.crashes.length === 0, actual: data.crashes.length, expected: 0},
    {name: 'diagnostics-observers-active', pass: (data.monitorErrors?.length ?? 0) === 0, actual: data.monitorErrors?.length ?? 0, expected: 0}
  ];
}
