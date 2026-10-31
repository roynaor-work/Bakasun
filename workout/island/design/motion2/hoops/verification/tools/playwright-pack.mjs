// Test-only Playwright adapter: substitute one asset response, preserving the
// original viewer, renderer, checks, thresholds, and test-viewer CLI unchanged.
import {readFile, appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const playwright = await import(pathToFileURL(process.env.HOOPS_PLAYWRIGHT_PATH).href);
const body = await readFile(process.env.HOOPS_CHECK_PACK, 'utf8');
const sha256 = createHash('sha256').update(body).digest('hex');
const glbAssets = new Map(await Promise.all(['soccer-player','goalkeeper','basketball-player','skier']
  .map(async name=>{
    const pathname=`/design/characters/${name}.glb`;
    const bytes=await readFile(resolve(process.env.HOOPS_ISLAND,`.${pathname}`));
    return [pathname,{bytes,sha256:createHash('sha256').update(bytes).digest('hex')}];
  })));

export const chromium = {
  async launch(options) {
    const browser = await playwright.chromium.launch(options);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
      const context = await newContext(...args);
      const route = context.route.bind(context);
      context.route = (pattern, handler, ...rest) => route(pattern, async request => {
        const url = new URL(request.request().url());
        if (url.protocol === 'http:' && url.hostname === '127.0.0.1'
            && url.pathname === '/design/motion/hoops.json' && !url.search) {
          await appendFile(process.env.HOOPS_CHECK_REQUESTS,
            JSON.stringify({pathname:url.pathname, sha256}) + '\n');
          return request.fulfill({status:200, contentType:'application/json',
            headers:{'content-length':String(Buffer.byteLength(body))},body});
        }
        const asset=glbAssets.get(url.pathname);
        if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.search && asset) {
          await appendFile(process.env.HOOPS_CHECK_REQUESTS,
            JSON.stringify({pathname:url.pathname,sha256:asset.sha256,bytes:asset.bytes.length})+'\n');
          return request.fulfill({status:200,contentType:'model/gltf-binary',
            headers:{'content-length':String(asset.bytes.length)},body:asset.bytes});
        }
        return handler(request);
      }, ...rest);
      return context;
    };
    return browser;
  },
};
