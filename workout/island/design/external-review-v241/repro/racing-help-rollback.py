import json
from playwright.sync_api import sync_playwright
# Uses the actual ActivityInterface.helpLines and translator, with real pure models.
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':844,'height':390})
 page.route('**/review-help.html*',lambda r:r.fulfill(status=200,content_type='text/html',body='<!doctype html><html lang="he"><body></body></html>'))
 page.goto('http://127.0.0.1:8766/workout/island/review-help.html?racingPitAuto=0&navalRadar=v24&navalAirEnd=v24')
 result=page.evaluate('''async()=>{
 const [{ActivityInterface},{createTranslator},{createRacing},racingFlags,{createNavalModel}]=await Promise.all([import('./ui/activity.mjs'),import('./ui/translate.mjs'),import('./minigames/racing-physics.mjs'),import('./minigames/racing-v24.mjs'),import('./minigames/naval.mjs')]);
 const [config,strings]=await Promise.all([fetch('./data/config.json').then(r=>r.json()),fetch('./data/strings.he.json').then(r=>r.json())]);
 const t=createTranslator(strings),help=id=>{const n=ActivityInterface.prototype.helpLines.call({t},id);document.body.append(n);return [...n.children].map(p=>p.textContent);};
 const racingHelp=help('islandRacing'),navalHelp=help('navalDuel');
 const race=createRacing({stage:1,seed:7,config:{...racingFlags.v24PhysicsConfig(racingFlags.racingV24Flags()),pitAuto:racingFlags.pitAutoEnabled(),countdown:0}});
 const naval=createNavalModel({config:{...config.minigames,width:844,height:390},balance:config.minigames.navalDuel,level:1,seed:7});
 const out={query:location.search,racingHelp,racingPit:{...race.pit},navalHelp,navalFlags:naval.snapshot().v241};race.dispose();return out;
 }''')
 assert result['racingPit']['on'] is False
 assert result['racingPit']['auto'] is False
 assert 'בכל מרוץ' in result['racingHelp'][1] and 'מבטלת' in result['racingHelp'][1]
 assert result['navalFlags']['radarOn'] is False and result['navalFlags']['airEnd'] is False
 assert 'המכ״ם' in result['navalHelp'][0] and 'השלב מחכה' in result['navalHelp'][2]
 print(json.dumps(result,indent=2,ensure_ascii=False))
 b.close()
