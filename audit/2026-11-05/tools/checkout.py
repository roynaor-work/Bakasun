"""Order failure behavior, synthetic in-memory form values, remote calls blocked."""
from playwright.sync_api import sync_playwright
from common import *

def main():
    report={'started':stamp(),'conditions':'no real order sent; all external requests aborted; synthetic form values are not exported','cases':[]}
    with server() as base,sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        for deny_session in [False,True]:
            blocked=[];c=b.new_context(viewport={'width':390,'height':844},service_workers='block');block_external(c,base,blocked)
            c.add_init_script("localStorage.setItem('north.adult','1')")
            p=c.new_page();p.goto(base+'north/index.html',wait_until='load')
            p.locator('[data-add]').first.click();p.keyboard.press('Escape')
            p.goto(base+'north/index.html#/checkout',wait_until='load')
            if p.locator('input[name=pay][value=cash]').count():p.locator('input[name=pay][value=cash]').check()
            p.locator('[name=name]').fill('בדיקה סינתטית')
            # All-zero validation fixture exists only in browser memory. No
            # contact values, real or synthetic, are written into evidence.
            p.locator('[name=phone]').fill('0'*10)
            p.locator('[name=adult]').check();p.locator('[name=terms]').check()
            if deny_session:p.evaluate("""() => {const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===sessionStorage)throw new DOMException('synthetic session quota','QuotaExceededError');return old.call(this,k,v)}}""")
            p.locator('#paybtn').click();p.wait_for_function("() => location.hash.startsWith('#/thanks/')",timeout=30000)
            p.wait_for_timeout(200)
            result=p.evaluate("""() => {let o;try{o=JSON.parse(sessionStorage.getItem('north.last'))}catch{};return {cartCount:document.getElementById('cartn').textContent,savedOrder:o?.saved??null,sessionOrderAvailable:!!o,checkoutRecoveryLink:!!document.querySelector('#view a[href="#/checkout"]'),manualSendSuggested:document.querySelector('#view').innerText.includes('כדי שלא נפספס')}}""")
            p.reload(wait_until='load');p.wait_for_timeout(200)
            result['afterReloadClaimsReceived']=p.locator('#view h1').inner_text()=='ההזמנה נקלטה'
            result['afterReloadCartCount']=p.locator('#cartn').inner_text()
            report['cases'].append({'name':'failed-order-and-session-denied' if deny_session else 'failed-order','result':result,'blockedRequestTypes':blocked})
            c.close()
        b.close()
    report['finished']=stamp();write_json(OUT/'iterations/05/checkout.json',report)
    for case in report['cases']:print(json.dumps(case,ensure_ascii=False))

if __name__=='__main__':main()
