import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';

const src=await readFile(new URL('../workout/island/minigames/boar-island/game.js',import.meta.url),'utf8');

test('Boar fire paths (static guard): only the fire button, the keyboard F key, the bot and the QA hook can start firing; the scene and the stick cannot',()=>{
 const sets=[...src.matchAll(/pointer\.down=true/g)];
 // allowed sites: the fire button handler, the desktop (non-touch) scene handler behind the AIMSTICK guard, the bot, the QA hook
 const lines=src.split('\n').filter(l=>/pointer\.down=true|pointer\.down=on/.test(l));
 assert.equal(lines.length,4,'exactly four places may start firing:\n'+lines.map(l=>l.slice(0,100)).join('\n'));
 const button=lines.filter(l=>l.includes('firePointer=e.pointerId')),scene=lines.filter(l=>l.includes("setPointerCapture(e.pointerId)")&&!l.includes('firePointer')),bot=lines.filter(l=>l.includes('pointer.y=clamp(projected.y')),qa=lines.filter(l=>l.includes('qaFire=Boolean(on)'));
 assert.equal(button.length+bot.length+qa.length+scene.length,4);assert.equal(sets.length,3,'three literal pointer.down=true sites (button, scene, bot)');
 assert.match(src,/pointerdown',e=>\{if\(e\.pointerType!=='mouse'&&!LEGACY&&!AIMSTICK\)enableAimControls\(\);if\(mode!=='battle'\|\|AIMSTICK\)return;/,'the scene never fires once touch controls are active, for any pointer type');
 assert.match(src,/if\(AIMSTICK&&pointer\.down&&!fireAllowed\(\)\)pointer\.down=false;/,'a hard per-frame guard drops any fire that did not come from the button');
 assert.doesNotMatch(src.slice(src.indexOf('function buildAimControls')),/aimZone\.addEventListener\('pointer(down|move)'[^\n]*pointer\.down\s*=\s*true/,'the stick handlers never set fire');
});
test('Boar fire (browser, optional): touch, drag, two fingers, cancel, mouse: zero shots except from the one fire button',{skip:process.env.ISLAND_BROWSER_TESTS!=='1'},()=>{
 const run=spawnSync(process.execPath,['workout/island/tests/boar-touch-browser.mjs'],{encoding:'utf8',timeout:900000,env:{...process.env,CHROMIUM_PATH:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':'/opt/pw-browsers/chromium')}});
 assert.equal(run.status,0,run.stdout+run.stderr);
});
