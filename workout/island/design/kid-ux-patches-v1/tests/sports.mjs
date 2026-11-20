const timeoutButton='[data-hoops-control=timeout]';
const timeoutBanner='.hoops-toast[data-kind=timeout-rejected]:visible';

const accessibleTarget = target =>
  Boolean(target?.centerHit && target.visibleWidth >= 44 && target.visibleHeight >= 44);
const concise = ({ text, fontPx, ratio, width, height, visibleWidth, visibleHeight } = {}) =>
  ({ text, fontPx, ratio: ratio === undefined ? undefined : Number(ratio.toFixed(2)), width, height, visibleWidth, visibleHeight });

async function startHoopsFixture({page,note}){
  note('Used the existing perf-hoops.html test entry with the production basketball session, base CSS and synthetic roster. The backing canvas is scaled to 0.35 for software rendering. The browser and touch viewport remain 844×390.');
  const current=new URL(page.url()),target=new URL('tools/perf-hoops.html',current);
  target.search=new URLSearchParams({
    dev:'1',hoopsQuality:'0',hoopsAuto:'0',hoopsProfile:'quick',dpr:'0.35',dur:'3600',
  });
  if(current.searchParams.has('kidUx'))target.searchParams.set('kidUx',current.searchParams.get('kidUx'));
  await page.goto(target.href,{waitUntil:'commit'});
  await page.waitForFunction(()=>Boolean(window.__session),null,{timeout:85_000});
  await page.evaluate(async()=>{
    const css=['../styles.css','../ui/game-shell.css','../design/ui-kit-v2/ui-kit.css','../ui/ui-kit-bridge.css'];
    const links=css.map(path=>{
      const link=document.createElement('link');
      link.rel='stylesheet';link.href=path;
      const loaded=new Promise((resolve,reject)=>{
        link.onload=resolve;link.onerror=()=>reject(new Error('Fixture stylesheet unavailable: '+path));
      });
      return { link, loaded };
    });
    document.head.prepend(...links.map(({link})=>link));
    document.getElementById('perf').hidden=true;
    const screen=document.querySelector('.game-screen');
    screen.classList.add('modal','panel');
    const overlay=document.createElement('div');overlay.className='modal-overlay';
    screen.before(overlay);overlay.append(screen);
    window.__island={games:{current:{session:window.__session}}};
    await Promise.all(links.map(({loaded})=>loaded));
  });
}

async function startSport(context,game){
  if(game==='streetSlam'){
    await startHoopsFixture(context);
  }else{
    await context.seed();
    if(game==='soccer'){
      context.note('Used the app’s low graphics profile for software rendering. Game rules and touch controls were active.');
      await context.page.evaluate(()=>{
        const url=new URL(location.href);
        url.searchParams.set('quality','low');
        history.replaceState(history.state,'',url);
      });
    }
    await context.startGame(game);
  }
  await context.page.waitForFunction(()=>__island.games.current?.session.ready===true ||
    Boolean(__island.games.current?.session.loadFailed),null,{timeout:85_000});
  const loadIssue=await context.page.evaluate(()=>__island.games.current?.session.loadFailed);
  if(loadIssue)throw new Error('Game renderer failed before touch checks: '+loadIssue);
  if(game==='tennis'){
    context.note('Used the game’s Canvas renderer fallback to keep the live touch controls responsive in software rendering.');
    await context.page.evaluate(()=>__island.games.current.session.debug.fallback());
  }
}

export default {
  '016': async context => {
    const { page, tap, box, shot, check } = context;
    await startSport(context,'soccer');
    const controls = page.locator('.soccer-actions button:visible');
    const labels = await controls.locator('.soccer-action-label').evaluateAll(nodes => nodes.map(node => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const ink = range.getBoundingClientRect(), target = node.closest('button').getBoundingClientRect();
      return { text:node.textContent,fontPx:parseFloat(getComputedStyle(node).fontSize),
        inside:ink.left>=target.left && ink.right<=target.right };
    }));
    const objective = await box('.soccer-objective');
    check(labels.length >= 4 && labels.every(row => row.fontPx >= 14 && row.inside), { labels });
    const fixture=await box('.soccer-fixture'), score=await box('.soccer-scoreboard');
    const clearOfScore=Boolean(fixture && score && (fixture.left>=score.right || fixture.top>=score.bottom));
    check(objective?.fontPx >= 14 && objective.ratio >= 4.5 && clearOfScore,
      { objective:concise(objective || {}), clearOfScore });
    const target=controls.filter({has:page.locator('.soccer-action-label')}).first();
    const label=await target.locator('.soccer-action-label').textContent();
    const event=await tap(target,{hold:130,wait:0});
    const cue=await box('.kid-soccer-touch-cue:visible');
    const distance=cue ? Math.hypot(Math.max(cue.left-event.x, event.x-cue.right,0),Math.max(cue.top-event.y,event.y-cue.bottom,0)) : 0;
    check(cue?.text===label && cue.fontPx >= 14 && cue.ratio >= 4.5 && distance >= 32,
      { cue:cue?.text || null, label, distance });
    const {x,y,width,height}=await box(target);
    await context.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+width/2,y:y+height/2}]});
    try { await shot('soccer-actions'); }
    finally { await context.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
  },

  '017': async context => {
    const { page, tap, box, shot, check } = context;
    await startSport(context,'tennis');
    const buttons=page.locator('.soccer-actions button[data-game-control]:visible');
    const labels=await buttons.locator('.tennis-control-caption').evaluateAll(nodes=>nodes.map(node=>{
      const range=document.createRange();range.selectNodeContents(node);
      const ink=range.getBoundingClientRect(), button=node.closest('button'), r=button.getBoundingClientRect();
      return { text:node.textContent,fontPx:parseFloat(getComputedStyle(node).fontSize),
        inkWidth:Number(ink.width.toFixed(2)),targetWidth:r.width,inside:ink.left>=r.left && ink.right<=r.right };
    }));
    const target=await box('#drop');
    check(labels.length===4 && labels.every(row=>row.fontPx>=14 && row.inside), { labels });
    check(labels.some(row=>row.text==='קצרה') && accessibleTarget(target),
      { shortName:labels.find(row=>row.text.includes('קצר'))?.text, target:concise(target || {}) });
    await tap('#drop');
    await shot('tennis-captions');
  },

  '018': async context => {
    const { box, shot, check } = context;
    await startSport(context,'tennis');
    const label='#shoot .tennis-control-caption';
    const rest=await box(label);
    check(rest?.fontPx>=14 && rest.ratio>=4.5 && !rest.complexBackground, { normal:concise(rest || {}) });
    const { x,y,width,height }=await box('#shoot');
    await context.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+width/2,y:y+height/2}]});
    try {
      await context.page.locator('#shoot.held').waitFor();
      const held=await box(label);
      const pointer=await context.page.evaluate(()=>__kidTest.events.findLast(event=>event.type==='pointerdown'));
      const transitions=await context.page.locator('#shoot').evaluate(node=>
        getComputedStyle(node).transitionProperty.split(',').map(property=>property.trim()));
      check(held?.fontPx>=14 && held.ratio>=4.5 && pointer?.trusted && pointer.pointerType==='touch' && pointer.action==='hit' &&
        !transitions.includes('background-color') && !transitions.includes('all'),
        { held:concise(held || {}), pointer, transitions });
      await shot('tennis-shot-held');
    } finally {
      await context.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await shot('tennis-shot');
  },

  '019': async context => {
    const { page, tap, box, shot, check } = context;
    await startSport(context,'streetSlam');
    await page.locator('.hoops-role-label:visible').first().waitFor({timeout:30_000});
    context.note('Held only the rendered court frame during the touch-controlled passing illustrations.');
    await page.evaluate(()=>{__island.games.current.session.debug.hold=true;});
    const roles=await page.locator('.hoops-role-label:visible').evaluateAll(nodes=>nodes.map(n=>({
      name:n.querySelector('.hoops-role-code').textContent,fontPx:parseFloat(getComputedStyle(n).fontSize),
    })));
    check(roles.length>=1 && roles.every(row=>/[א-ת]/.test(row.name) && row.fontPx>=14), { roles });
    const launcher=await box('.kid-hoops-pass-launch');
    check(accessibleTarget(launcher), { demoEntry:launcher?.text || null });
    if(!launcher?.centerHit)return;
    await tap('.kid-hoops-pass-launch');
    const types=[];
    for(const name of ['tap','double','hold']){
      const illustration=page.locator('.kid-hoops-pass-illustration');
      const state=await illustration.evaluate(node=>({
        step:node.dataset.step,animation:node.dataset.playing,
        hand:node.querySelector('.kid-pass-hand').textContent,
        path:node.querySelector('.kid-pass-path').getAttribute('d'),
        paused:__island.games.current.session.snapshot.paused,
      }));
      types.push(state);
      check(state.step===name && state.hand==='👆' && state.paused,
        { gesture:name, illustration:state });
      await shot('pass-'+name);
      await tap('.kid-hoops-pass-next');
    }
    await page.evaluate(()=>{__island.games.current.session.debug.hold=false;});
    check(new Set(types.map(row=>row.path)).size===3 && !await page.locator('.kid-hoops-pass-demo[open]').count() &&
      !await page.evaluate(()=>__island.games.current.session.snapshot.paused),
      { uniquePaths:new Set(types.map(row=>row.path)).size, returnedToPlay:!await page.locator('.kid-hoops-pass-demo[open]').count() });
  },

  '020': async context => {
    const { page, seed, tap, swipe, box, shot, check } = context;
    await seed();
    await page.evaluate(()=>__island.games.stages('streetSlam'));
    const play='[data-action=hoops-play-next]', back='[data-action=game-home-back]';
    const initial=[await box(play),await box(back)];
    const readableAction=target=>accessibleTarget(target) && target.fontPx>=14 && target.ratio>=4.5;
    check(initial.every(readableAction), { initialActions:initial.map(row=>concise(row || {})) });
    await shot('club-next-game');
    await tap('.hoops-more > summary',{scroll:true});
    const scrolling=page.locator('.kid-hoops-club-scroll');
    const area=await scrolling.count()?scrolling:page.locator('.modal[data-stage-map=streetSlam]');
    const bounds=await area.boundingBox(), x=bounds.x+bounds.width/2;
    const before=await area.evaluate(node=>node.scrollTop);
    await swipe(x,Math.min(315,bounds.y+bounds.height-12),x,Math.max(75,bounds.y+15));
    const after=await area.evaluate(node=>node.scrollTop);
    const whileScrolling=[await box(play),await box(back)];
    check(after>before && whileScrolling.every(readableAction),
      { scrollBefore:before, scrollAfter:after, actions:whileScrolling.map(row=>concise(row || {})) });
    await shot('club-after-scroll');
    if(whileScrolling[1]?.centerHit){
      await tap(back);
      check(Boolean(await page.locator('[data-game-home=streetSlam]').count()), { returnedToBasketballHome:true });
    }
  },

  '039': async context => {
    const { page, tap, box, shot, check, note } = context;
    await startSport(context,'streetSlam');
    note('Synthetic live possessions for rival rejection and legal player request. Trusted touch drives the timeout action.');
    await page.evaluate(()=>{
      const d=__island.games.current.session.debug,e=d.engine;
      d.hold=true;
      e.debug.setPhase('live');
      const rival=e.snapshot().players.find(p=>p.team===1);
      e.debug.give(rival.id);
      d.step(1,{move:{x:0,z:0}});
    });
    const before=await page.evaluate(()=>__island.games.current.session.snapshot.timeouts[0]);
    await tap(timeoutButton,{wait:0});
    await page.evaluate(()=>__island.games.current.session.debug.step());
    const rejected=await box(timeoutBanner);
    const whenRejected=await page.evaluate(()=>__island.games.current.session.snapshot);
    check(rejected?.text.includes('הכדור אצלכם') && rejected.fontPx>=14 && rejected.ratio>=4.5 &&
      whenRejected.timeouts[0]===before && whenRejected.phase==='live',
      { reason:rejected?.text || null, remaining:whenRejected.timeouts[0], phase:whenRejected.phase });
    if(rejected?.text){
      await page.waitForFunction(()=>{
        const notice=document.querySelector('.hoops-toast[data-kind=timeout-rejected]');
        return notice?.checkVisibility({opacityProperty:true,visibilityProperty:true}) &&
          Number(getComputedStyle(notice).opacity)>=.95;
      });
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    }
    await shot('timeout-rejected');
    await page.evaluate(()=>{
      const d=__island.games.current.session.debug,e=d.engine;
      const player=e.snapshot().players.find(p=>p.id===e.snapshot().controlled);
      e.debug.give(player.id);
      d.step(1,{move:{x:0,z:0}});
    });
    await tap(timeoutButton,{wait:0});
    await page.evaluate(()=>__island.games.current.session.debug.step());
    const state=await page.evaluate(()=>__island.games.current.session.snapshot);
    check(state.phase==='timeout' && state.timeouts[0]===before-1 && await page.locator('.hoops-bench:visible').count()===1,
      { allowedPhase:state.phase, remaining:state.timeouts[0] });
  },

  '040': async context => {
    const { page, tap, box, shot, check, note } = context;
    await startSport(context,'streetSlam');
    note('Synthetic legal timeout with the model held while the bench is inspected.');
    await page.evaluate(()=>{
      const d=__island.games.current.session.debug,e=d.engine;
      d.hold=true;
      e.debug.setPhase('dead');
      const result=e.timeout(0);
      if(!result.ok)throw new Error('Legal bench setup failed');
      d.step(1,{move:{x:0,z:0}});
    });
    const close='.hoops-bench-close';
    const control=await box(close);
    check(accessibleTarget(control) && control.text==='חזרה למשחק' && control.fontPx>=14 && control.ratio>=4.5,
      { benchClose:concise(control || {}) });
    await shot('timeout-bench');
    await tap(close);
    check(!await page.locator('.hoops-bench:visible').count() && await page.locator('.game-screen[data-game=streetSlam]').count()===1,
      { benchClosed:!await page.locator('.hoops-bench:visible').count() });
  },
};
