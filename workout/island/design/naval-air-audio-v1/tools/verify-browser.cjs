#!/usr/bin/env node
// CC0-1.0. Usage: node tools/verify-browser.cjs [optional Chromium executable]
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const types = {'.html': 'text/html; charset=utf-8', '.json': 'application/json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.md': 'text/plain; charset=utf-8'};
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
  if (name === 'favicon.ico') { res.writeHead(204).end(); return; }
  const target = path.resolve(root, name || 'preview.html');
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end(); return;
  }
  const size = fs.statSync(target).size;
  const headers = {'Content-Type': types[path.extname(target)] || 'application/octet-stream',
    'Content-Length': size, 'Accept-Ranges': 'bytes'};
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || end < start) { res.writeHead(416).end(); return; }
    res.writeHead(206, {...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1});
    fs.createReadStream(target, {start, end}).pipe(res);
  } else {
    res.writeHead(200, headers);
    fs.createReadStream(target).pipe(res);
  }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless: true, executablePath: process.argv[2] || undefined,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
    const page = await browser.newPage({viewport: {width: 1100, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/preview.html`);
    const files = [];
    for (const extension of ['ogg', 'mp3']) {
      await page.selectOption('#format', extension);
      for (const asset of manifest.assets) {
        const result = await page.evaluate(async ({id}) => {
          const audio = document.querySelector(`[data-id="${id}"] audio`);
          await audio.play();
          await new Promise(resolve => setTimeout(resolve, 140));
          const output = {duration_seconds: audio.duration, time_advanced: audio.currentTime > 0,
            media_error: audio.error?.message || null};
          audio.pause();
          return output;
        }, {id: asset.id});
        assert.ok(result.time_advanced && !result.media_error, `${asset.id}.${extension} playback`);
        // HTML media duration may be estimated by the demuxer. Exact duration
        // is checked independently on the decoded Web Audio sample buffer below.
        assert.ok(Math.abs(result.duration_seconds - asset.duration_seconds) < 0.05,
          `${asset.id}.${extension} HTML duration ${result.duration_seconds}`);
        const decoded = await page.evaluate(async name => {
          const context = new OfflineAudioContext(1, 44100, 44100);
          const buffer = await context.decodeAudioData(await (await fetch(name)).arrayBuffer());
          const output = {samples: buffer.length, sample_rate_hz: buffer.sampleRate, channels: buffer.numberOfChannels};
          if (name.startsWith('helicopter')) {
            const render = new OfflineAudioContext(1, buffer.length * 3, 44100);
            const source = render.createBufferSource();
            source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = 4;
            source.connect(render.destination); source.start();
            const data = (await render.startRendering()).getChannelData(0);
            const original = buffer.getChannelData(0);
            let maxError = 0;
            for (let i = 0; i < data.length; i++) maxError = Math.max(maxError, Math.abs(data[i] - original[i % buffer.length]));
            output.three_loop_max_sample_error = maxError;
            output.seam_step = Math.abs(original[0] - original[original.length - 1]);
          }
          return output;
        }, `${asset.id}.${extension}`);
        assert.equal(decoded.samples, asset.files.find(file => file.path.endsWith('.' + extension)).decoded_samples);
        assert.equal(decoded.sample_rate_hz, 44100);
        assert.equal(decoded.channels, 1);
        if (asset.loop) {
          assert.equal(decoded.three_loop_max_sample_error, 0);
          assert.ok(decoded.seam_step < 0.04);
        }
        files.push({path: `${asset.id}.${extension}`, ...result, ...decoded, passed: true});
      }
      await page.click('#loop-play');
      await page.waitForFunction(() => document.querySelector('#loop-play').getAttribute('aria-pressed') === 'true');
      await page.waitForTimeout(4100);
      await page.click('#loop-stop');
      assert.equal(await page.getAttribute('#loop-play', 'aria-pressed'), 'false');
    }
    // Switching format while a fetch/decode is pending must cancel the old loop.
    await page.click('#loop-play');
    await page.selectOption('#format', 'ogg');
    await page.waitForTimeout(250);
    assert.equal(await page.getAttribute('#loop-play', 'aria-pressed'), 'false');
    for (const width of [390, 1100]) {
      await page.setViewportSize({width, height: 1000});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow at ${width}`);
    }
    for (const anchor of await page.locator('a').all()) {
      // browser-validation.json is the report written after this run.
      const href = await anchor.getAttribute('href');
      if (href === 'browser-validation.json' && !fs.existsSync(path.join(root, href))) continue;
      assert.ok((await page.request.get(new URL(href, page.url()).href)).ok());
    }
    assert.deepEqual(errors, []);
    await page.setViewportSize({width: 390, height: 1000});
    await page.screenshot({path: '/tmp/naval-air-audio-mobile.png', fullPage: true});
    const report = {passed: true, browser: browser.version(), files,
      checks: ['All eight files play and decode at 44100 Hz mono with manifest sample counts',
        'Rotor loops render three exact consecutive copies for each codec',
        'Continuous loop controls play across a full boundary and stop for each codec',
        'Changing format cancels a pending loop', 'No page errors or HTTP audio failures',
        'No horizontal overflow at 390px and 1100px', 'All existing download/document links return HTTP 200'],
      local_file_playback: 'Not verified: managed Chromium blocks file:// navigation by administrator policy; HTTP playback passed',
      screenshot: 'Ephemeral review image: /tmp/naval-air-audio-mobile.png'};
    fs.writeFileSync(path.join(root, 'browser-validation.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
