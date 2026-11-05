// Runtime adapter for existing tests that autodetect Playwright but ignore
// CHROMIUM_PATH. This is audit tooling, not a change to any checked-in test.
const {chromium:realChromium}=await import(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
export const chromium=new Proxy(realChromium, {get(target,key){
  if(key==='launch')return async(options={})=>{
    const browser=await target.launch({...options,executablePath:options.executablePath||process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:[...(options.args||[]),'--no-sandbox']});
    const original=browser.newContext.bind(browser);
    browser.newContext=async(opts={})=>{
      const ctx=await original(opts);
      await ctx.route('**/*',route=>{const u=new URL(route.request().url());return ['http:','https:'].includes(u.protocol)&&!['127.0.0.1','localhost','[::1]'].includes(u.hostname)?route.abort('blockedbyclient'):route.continue();});
      return ctx;
    };
    return browser;
  };
  const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;
}});
