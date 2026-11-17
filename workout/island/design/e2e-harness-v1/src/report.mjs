import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function buildReport(results, metadata = {}) {
  return {schemaVersion: 1, generatedAt: new Date().toISOString(), metadata,
    summary: {total: results.length, passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status !== 'passed').length}, results};
}

export function renderHtml(report) {
  const e = escapeHtml;
  const rows = report.results.map(r => `<tr><td><a href="#${e(r.game)}-${e(r.variant)}">${e(r.label)} / ${e(r.variant)}</a></td><td class="${e(r.status)}">${e(r.status)}</td><td>${e(r.firstFrameMs ?? '—')}</td><td>${e(r.playWallMs)}</td><td>${e(r.render.triangles?.max ?? '—')}</td><td>${e(r.render.drawCalls?.max ?? '—')}</td><td>${r.diagnostics?.consoleErrors.length ?? '—'}</td><td>${r.diagnostics?.cspViolations.length ?? '—'}</td></tr>`).join('\n');
  const sections = report.results.map(r => `<section id="${e(r.game)}-${e(r.variant)}"><h2>${e(r.label)} · ${e(r.game)} · ${e(r.variant)}</h2>
    <p class="${e(r.status)}">${e(r.status)} · ${e(r.scenario)} · finish: ${e(r.finishMode)}</p>
    <p>Play: ${e(r.playWallMs)} ms wall time, ${e(r.playActiveMs ?? 'unavailable')} ms active play; UI replays: ${e(r.replays ?? 0)}; observed simulation increments: ${e(r.simulationDeltaSeconds ?? 'unavailable')} s. First-frame latency is sampled detection, not a GPU timestamp.</p>
    <p>${r.noWasm || r.launchArgs?.some(a => a.includes('--jitless')) ? 'Diagnostic: WebAssembly and JS JIT are disabled.' : 'The harness is JavaScript only; existing application codecs run normally.'} Service workers are blocked for a cold network run. All user input uses CDP touch.</p>
    <p>URL: <code>${e(r.url)}</code></p>
    ${r.failure ? `<pre class="failed">${e(r.failure.phase + ': ' + r.failure.message)}</pre>` : ''}
    <ul>${r.checkpoints.map(c => `<li class="${e(c.status)}">${e(c.name)}: ${e(c.status)}${c.reason ? ' · ' + e(c.reason) : ''}</li>`).join('')}</ul>
    <div class="shots">${Object.entries(r.screenshots).map(([phase, file]) => `<figure><a href="${e(file)}"><img loading="lazy" src="${e(file)}" width="844" height="390" alt="${e(r.label + ' ' + phase)}"></a><figcaption>${e(phase)}</figcaption></figure>`).join('')}</div>
    <h3>Checks</h3><ul>${r.checks.map(c => `<li class="${c.pass ? 'passed' : 'failed'}">${e(c.name)}: ${c.pass ? 'PASS' : 'FAIL'}${c.pass ? '' : `<pre>${e(JSON.stringify(c, null, 2))}</pre>`}</li>`).join('')}</ul>
    <details><summary>Diagnostics (unfiltered)</summary><pre>${e(JSON.stringify(r.diagnostics, null, 2))}</pre></details>
    <details><summary>Renderer samples</summary><pre>${e(JSON.stringify(r.samples, null, 2))}</pre></details>
    <p><a href="${e(r.game + '/' + r.variant + '/result.json')}">Result JSON</a> · <a href="${e(r.game + '/' + r.variant + '/touches.json')}">CDP touch journal</a></p>
    </section>`).join('\n');
  return `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'"><link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E"><title>Island E2E harness v1</title>
    <style>body{font:16px system-ui,sans-serif;margin:24px;color:#172b36;background:#f4f7f8}h1,h2{line-height:1.3}a{color:#075b9a}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px;text-align:start;border:1px solid #ccd5da}section{background:white;padding:20px;margin:24px 0;border-radius:10px}pre,code{direction:ltr;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}pre{max-height:450px;overflow:auto;background:#edf1f3;padding:12px}.passed{color:#10633a}.failed{color:#a12420}.blocked{color:#735000}.shots{display:flex;gap:14px;flex-wrap:wrap}figure{margin:0;max-width:100%}img{width:422px;max-width:100%;height:auto;border:1px solid #ccd5da}.scroll{overflow:auto}li{margin:7px 0}</style>
    <h1>ערכת בדיקות האי · E2E v1</h1><p dir="ltr">${report.summary.passed} passed / ${report.summary.failed} failed / ${report.summary.total} runs · ${e(report.generatedAt)}</p><p><a href="report.json">Full JSON report</a></p>
    <p dir="ltr">844×390 · hasTouch + isMobile · ANGLE / SwiftShader · JavaScript only · No game-state injection</p>
    <div class="scroll"><table><thead><tr><th>Game / URL case</th><th>Status</th><th>First frame (ms)</th><th>Play (ms)</th><th>Peak triangles sampled</th><th>Peak draw calls sampled</th><th>Console errors</th><th>CSP evidence</th></tr></thead><tbody>${rows}</tbody></table></div>${sections}</html>\n`.replace(/[\t ]+$/gm, '');
}

export async function writeReport(outputDir, results, metadata = {}) {
  await mkdir(outputDir, {recursive: true});
  const report = buildReport(results, metadata);
  await writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(outputDir, 'report.html'), renderHtml(report));
  return report;
}
