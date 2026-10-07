from playwright.sync_api import sync_playwright, expect
import json
# Only synthetic landmarks; camera frames are never inspected in this UI check.
fake=r'''
window.__kind='stand';
function makePose(kind){
 const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:.99}));
 const put=(i,x,y)=>Object.assign(p[i],{x,y});
 for(const [i,x,y]of [[0,.5,.14],[11,.4,.3],[12,.6,.3],[13,.3,.5],[14,.7,.5],[15,.3,.7],[16,.7,.7],[23,.43,.45],[24,.57,.45],[25,.4,.66],[26,.6,.66],[27,.4,.86],[28,.6,.86]])put(i,x,y);
 if(kind==='deep'||kind==='partial'){put(23,.43,kind==='partial'?.55:.65);put(24,.57,kind==='partial'?.55:.65);put(25,.35,.68);put(26,.65,.68);}
 if(kind==='open'){put(27,.25,.86);put(28,.75,.86);put(15,.25,.18);put(16,.75,.18);}
 if(kind==='left'){put(25,.32,.45);put(27,.4,.68);}
 return kind==='missing'?null:p;
}
window.Worker=class {
 constructor(){this.stopped=false;}
 postMessage(d){if(this.stopped)return; if(d.type==='init')setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);
 else {d.bitmap.close();const points=makePose(window.__kind);setTimeout(()=>{if(!this.stopped)this.onmessage?.({data:{type:'pose',points,world:points,ms:1,timestamp:d.timestamp,session:d.session}})},0);}}
 terminate(){this.stopped=true;}
};
'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
 ctx=browser.new_context(permissions=['camera'],viewport={'width':390,'height':844})
 ctx.add_init_script(fake);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8765/workout/cam-lab/')
 for ex,kind in [('squats','deep'),('jumping-jacks','open'),('high-knees','left')]:
  page.select_option('#exercise',ex);page.evaluate("window.__kind='missing'")
  page.get_by_role('button',name='פתיחת המצלמה והצבה').click()
  expect(page.locator('#start')).to_be_disabled()
  page.evaluate("window.__kind='stand'")
  expect(page.locator('#start')).to_be_enabled(timeout=10000)
  page.locator('#start').click();page.wait_for_timeout(400)
  page.evaluate('(k)=>window.__kind=k',kind);page.wait_for_timeout(1000)
  page.evaluate("window.__kind='stand'");expect(page.locator('#count')).to_have_text('1',timeout=5000)
  if ex=='squats':
   page.evaluate("window.__kind='partial'");page.wait_for_timeout(1000)
   page.evaluate("window.__kind='stand'");expect(page.locator('#feedback')).to_contain_text('תְּנוּעָה',timeout=5000)
  page.locator('#finish').click();expect(page.locator('#results')).to_be_visible()
  expect(page.locator('#result-count')).to_contain_text('1 חזרות נספרו')
  if ex=='squats':expect(page.locator('#result-reasons')).to_contain_text('טווח תנועה חלקי: 1')
  assert page.evaluate('document.querySelector("video").srcObject===null')
  page.locator('#again').click()
 assert not errors,errors
 print(json.dumps({'three_exercise_UI':'passed','placement_gate':'passed','partial_result_reason':'passed','camera_stopped':'passed','pageerrors':errors}))
 browser.close()
