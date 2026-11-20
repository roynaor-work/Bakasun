#!/usr/bin/env python3
"""Read-only kid UX capture. Requires Python Playwright and an installed Chromium.

Run from any directory. Only the chosen output directory is written. Product
files, configuration and real user storage are never changed. Each phase uses a
fresh ephemeral browser context. CDP generates all taps, swipes and holds.
"""
import argparse
import base64
import functools
import hashlib
import http.server
import json
import math
import os
from pathlib import Path
import subprocess
import threading
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
GAMES = ['alienDefense', 'fireRescue', 'navalDuel', 'soccer', 'tennis',
         'islandRacing', 'streetSlam', 'alpineRush', 'boarDefense', 'catchCriminal']

INSTRUMENT = r"""(() => {
  const a=window.__kidAudit={events:[],audio:[],speech:[],mutations:[],frames:[],captureCanvasText:false,canvasTexts:{}};
  const add=(list,x)=>{list.push(x);if(list.length>4000)list.shift();};
  for(const type of ['pointerdown','pointerup','pointercancel','click'])
    document.addEventListener(type,e=>{
      const n=e.target.closest?.('button,input,summary,[role=button]')||e.target;
      const row={type,t:performance.now(),trusted:e.isTrusted,pointerType:e.pointerType,pointerId:e.pointerId,isPrimary:e.isPrimary,
        action:n.dataset?.action||n.dataset?.gameControl||n.id||n.className?.baseVal||n.className,
        x:e.clientX,y:e.clientY};add(a.events,row);
      if(type==='pointerdown')requestAnimationFrame(t=>{row.nextFrameMs=t-row.t;});
    },true);
  const hook=()=>new MutationObserver(rows=>{
    const e=a.events.findLast(e=>e.type==='pointerdown');
    if(e&&performance.now()-e.t<1000&&!e.firstRelatedMutationMs){
      const row=rows.find(r=>{
        const b=r.target.nodeType===1?r.target.closest?.('button'):r.target.parentElement?.closest('button');
        return b&&(b.dataset.action||b.dataset.gameControl||b.id)===e.action;
      });if(row)e.firstRelatedMutationMs=performance.now()-e.t;
    }
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  if(document.documentElement)hook();else document.addEventListener('DOMContentLoaded',hook,{once:true});
  for(const name of ['OscillatorNode','AudioBufferSourceNode']){
    const p=window[name]?.prototype;if(!p)continue;const original=p.start;
    p.start=function(...args){add(a.audio,{kind:name,t:performance.now(),contextState:this.context.state});return original.apply(this,args);};
  }
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...args){const r={kind:'media',t:performance.now(),src:this.currentSrc||this.src,muted:this.muted,volume:this.volume};add(a.audio,r);const v=play.apply(this,args);v?.then(()=>r.accepted=true,()=>r.accepted=false);return v;};
  if(window.speechSynthesis){const speak=speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak=u=>{const r={t:performance.now(),text:u.text,lang:u.lang};add(a.speech,r);u.addEventListener('start',()=>r.started=performance.now());u.addEventListener('error',e=>r.error=e.error);return speak(u);};}
  const fill=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
    if(a.captureCanvasText){const r=this.canvas.getBoundingClientRect(),m=this.getTransform(),fontPx=+(this.font.match(/([\d.]+)px/)?.[1]||0),key=this.canvas.className+'|'+this.font+'|'+text;
      a.canvasTexts[key]={text:String(text),font:this.font,cssFontPx:Math.round(fontPx*Math.hypot(m.a,m.b)*r.width/this.canvas.width*100)/100,x,y,canvasClass:this.canvas.className,direction:this.direction};
      if(Object.keys(a.canvasTexts).length>200)delete a.canvasTexts[Object.keys(a.canvasTexts)[0]];}
    return fill.call(this,text,x,y,...rest);
  };
})();"""

MEASURE = r"""() => {
  const round=n=>Math.round(n*100)/100;
  const rect=r=>({x:round(r.x),y:round(r.y),width:round(r.width),height:round(r.height),right:round(r.right),bottom:round(r.bottom)});
  const shown=n=>n.checkVisibility?n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}):!!n.getClientRects().length;
  const clip=n=>{
    let r=n.getBoundingClientRect(),x=Math.max(0,r.left),y=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
    for(let p=n.parentElement;p;p=p.parentElement){if(p===document.body||p===document.documentElement)continue;const s=getComputedStyle(p),q=p.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(s.overflowX)){x=Math.max(x,q.left);right=Math.min(right,q.right);}
      if(/auto|scroll|hidden|clip/.test(s.overflowY)){y=Math.max(y,q.top);bottom=Math.min(bottom,q.bottom);}}
    return {x:round(x),y:round(y),width:round(Math.max(0,right-x)),height:round(Math.max(0,bottom-y))};
  };
  const sel=n=>n.id?'#'+n.id:n.dataset.action?'[data-action="'+n.dataset.action+'"]'+(n.dataset.gameId?'[data-game-id="'+n.dataset.gameId+'"]':'')+(n.dataset.stage?'[data-stage="'+n.dataset.stage+'"]':'')+(n.dataset.field?'[data-field="'+n.dataset.field+'"]':''):
    n.dataset.gameControl?'[data-game-control="'+n.dataset.gameControl+'"]':n.dataset.soccerControl?'[data-soccer-control="'+n.dataset.soccerControl+'"]':n.dataset.category?'[data-category="'+n.dataset.category+'"]':n.tagName.toLowerCase()+'.'+[...n.classList].join('.');
  const rgba=s=>{const m=s.match(/[\d.]+/g);return m?[+m[0],+m[1],+m[2],m[3]===undefined?1:+m[3]]:null;};
  const over=(f,b)=>f.slice(0,3).map((v,i)=>v*f[3]+b[i]*(1-f[3])).concat(1);
  const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const color=n=>{const chain=[];let complex=false;for(let p=n;p;p=p.parentElement){const s=getComputedStyle(p);chain.unshift(rgba(s.backgroundColor)||[0,0,0,0]);if(s.backgroundImage!=='none'||+s.opacity<1)complex=true;}
    const bg=chain.reduce((b,f)=>over(f,b),[255,255,255,1]),s=getComputedStyle(n),fg=over(rgba(s.color)||[0,0,0,1],bg),L=[lum(bg),lum(fg)].sort((a,b)=>b-a);return {foreground:s.color,background:bg.map(round),ratio:round((L[0]+.05)/(L[1]+.05)),requiresManual:complex,textShadow:s.textShadow};};
  const scope=document.querySelector('.game-pause-sheet')||[...document.querySelectorAll('.modal')].findLast(shown)||document;
  const all=[...scope.querySelectorAll('button,a[href],input:not([type=hidden]),select,summary,[role=button],.soccer-stick-zone,.hoops-stick-zone,.touch-stick,.catch6-steer,.fv24-card,.fv-card,.catch-power')].filter(shown);
  const targets=all.map(n=>{
    const r=n.getBoundingClientRect(),v=clip(n),x=v.x+v.width/2,y=v.y+v.height/2,hit=v.width>0&&v.height>0?document.elementFromPoint(x,y):null,s=getComputedStyle(n);
    return {selector:sel(n),label:(n.getAttribute('aria-label')||n.innerText||n.title||'').trim().slice(0,250),tag:n.tagName,role:n.getAttribute('role'),disabled:!!n.disabled,inert:!!n.closest('[inert]'),rect:rect(r),visibleRect:v,
      centerHit:!!hit&&(n===hit||n.contains(hit)||hit.contains(n)),hitElement:hit?sel(hit):null,under44:r.width<43.99||r.height<43.99,
      clipped:v.width+1<r.width||v.height+1<r.height,fontPx:parseFloat(s.fontSize),direction:s.direction,color:color(n)};
  });
  const active=targets.filter(t=>!t.disabled&&!t.inert&&t.visibleRect.width>0&&t.visibleRect.height>0);
  const gaps=[];for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
    const a=active[i],b=active[j],r=a.rect,s=b.rect;
    // Containment (e.g. a label wrapping an input) is not a pair of adjacent targets.
    if(r.x<=s.x&&r.y<=s.y&&r.right>=s.right&&r.bottom>=s.bottom||s.x<=r.x&&s.y<=r.y&&s.right>=r.right&&s.bottom>=r.bottom)continue;
    const dx=Math.max(0,r.x-s.right,s.x-r.right),dy=Math.max(0,r.y-s.bottom,s.y-r.bottom),gap=Math.hypot(dx,dy);
    if(gap<8)gaps.push({a:a.selector,b:b.selector,labels:[a.label,b.label],px:round(gap)});
  }
  const text=[...scope.querySelectorAll('p,small,span,strong,label,legend,h1,h2,h3,h4,bdi,summary')].filter(n=>shown(n)&&clip(n).width>0&&clip(n).height>0&&n.textContent.trim()&&!n.querySelector('p,small,span,strong,label,h2,h3,bdi')).map(n=>({selector:sel(n),text:n.textContent.trim().slice(0,300),fontPx:parseFloat(getComputedStyle(n).fontSize),direction:getComputedStyle(n).direction,rect:rect(n.getBoundingClientRect()),color:color(n)}));
  const scroll=[...scope.querySelectorAll('*'),...(scope===document?[]:[scope])].filter(n=>shown(n)&&n.clientHeight>40&&n.scrollHeight>n.clientHeight+8&&/auto|scroll/.test(getComputedStyle(n).overflowY)).map(n=>({selector:sel(n),top:n.scrollTop,height:n.clientHeight,total:n.scrollHeight,rect:rect(n.getBoundingClientRect())}));
  return {url:location.href,viewport:{width:innerWidth,height:innerHeight,scale:visualViewport?.scale},documentDirection:getComputedStyle(document.documentElement).direction,documentLang:document.documentElement.lang,targets,gapsUnder8:gaps,text,scroll,textContent:scope.innerText?.slice(0,18000)||document.body.innerText.slice(0,18000),instrument:window.__kidAudit?{events:__kidAudit.events.slice(-60),audio:__kidAudit.audio.slice(-60),speech:__kidAudit.speech.slice(-20),canvasTexts:Object.values(__kidAudit.canvasTexts)}:null};
}"""

SEED = r"""() => {
  const {engine:e,ui,view,data}=window.__island;
  ui.closeModal();ui.cancelPlacement();ui.closeInfo();ui.closeDetails();ui.setDockOpen(false);ui.setMoreOpen(false);
  e.setAvatar({...e.state.avatar,created:true});e.skipTutorial();e.setLearningAge(7);
  // A synthetic local progressed city, never a user's save. No balance/config edits.
  e.state.learning.roundsToday=2;e.state.events.nextAt=Date.now()+86400000;e.state.events.active=null;
  e.state.money=50000;
  const needed=new Set(['airbase','fireStation','harbor','soccer','tennis','basketball','library','mathLab','zoo','puzzleRoom']);
  for(const id of needed){if(e.state.buildings.some(b=>b.typeId===id))continue;
    const ready=e.readyPlots?.().find(p=>p.typeId===id);
    const cell=ready?{x:ready.x,z:ready.z}:ui.findCell(id);
    if(cell)e.state.buildings.push({id:'audit-'+id,typeId:id,x:cell.x,z:cell.z,level:1});
  }
  e.save();ui.refresh();
  return {age:e.state.learning.age,learning:e.learningStatus(),buildings:e.state.buildings.filter(b=>needed.has(b.typeId)),games:window.__island.games.enabledGames().map(g=>({id:g.id,title:ui.t(g.title)}))};
}"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


class Audit:
    def __init__(self, page, context, output, phase):
        self.page, self.context, self.output, self.phase = page, context, output, phase
        self.cdp = context.new_cdp_session(page)
        self.cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
        self.cdp.send('Emulation.setDeviceMetricsOverride', {'width': 844, 'height': 390, 'deviceScaleFactor': 1, 'mobile': True,
            'screenWidth': 844, 'screenHeight': 390, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
        self.data = {'phase': phase, 'screens': [], 'interactions': [], 'errors': [], 'fixtures': {}, 'console': [], 'requestsFailed': []}
        page.on('pageerror', lambda e: self.data['console'].append({'kind': 'pageerror', 'message': str(e)}))
        page.on('console', lambda m: self.data['console'].append({'kind': m.type, 'message': m.text}) if m.type in ['error', 'warning'] else None)
        page.on('requestfailed', lambda r: self.data['requestsFailed'].append({'url': r.url, 'failure': r.failure}))
        self.held = []
        self.fixture = 'fresh-install'

    def save(self):
        (self.output / f'evidence-{self.phase}.json').write_text(json.dumps(self.data, ensure_ascii=False, indent=2))

    def evaluate(self, code, arg=None):
        return self.page.evaluate(code, arg)

    def touch(self, kind, points):
        self.data.setdefault('touchCommands',[]).append({'type':kind,'points':[{'id':i+1,'x':round(p[0],2),'y':round(p[1],2)}for i,p in enumerate(points)],'hostMonotonic':round(time.monotonic(),4)})
        self.cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [dict(id=i+1, x=p[0], y=p[1], radiusX=7, radiusY=7, force=1) for i, p in enumerate(points)]})

    def swipe(self, x, y, end_x, end_y, steps=4):
        self.touch('touchStart', [(x, y)])
        for i in range(1, steps+1):
            self.touch('touchMove', [(x+(end_x-x)*i/steps, y+(end_y-y)*i/steps)])
            self.page.wait_for_timeout(20)
        self.touch('touchEnd', [])
        self.page.wait_for_timeout(180)

    def tap(self, selector, frame=None, hold=45, scroll=True):
        freeze=self.phase!='feedback' and not frame and not self.page.locator('.game-screen').count()
        previous=self.evaluate('() => __island.view.paused') if freeze else None
        if freeze:self.evaluate('() => {__island.view.paused=true;}')
        boar_hold=bool(frame and self.phase!='feedback' and frame.evaluate('() => Boolean(window.__boar && window.__boarIsland?.snapshot.mode!=="battle")'))
        if boar_hold:frame.evaluate('() => __boar.hold(true)')
        try:return self._tap(selector,frame,hold,scroll)
        finally:
            if freeze:self.evaluate('(v) => {__island.view.paused=v;}',previous)
            if boar_hold:frame.evaluate('() => __boar.hold(false)')

    def _tap(self, selector, frame=None, hold=45, scroll=True):
        scope = frame or self.page
        locator = scope.locator(selector).first
        locator.wait_for(state='visible', timeout=15000)
        if scroll:
            # Exercise native touch scrolling first. Programmatic repositioning
            # is a labelled setup fallback, never presented as a passing gesture.
            for _ in range(6):
                box = locator.bounding_box()
                if box and 4 <= box['y'] and box['y']+box['height'] <= 385:
                    break
                if not box:
                    raise RuntimeError('No target rectangle: '+selector)
                x = min(700, max(150, box['x']+box['width']/2))
                self.swipe(x, 280 if box['y']>200 else 120, x, 100 if box['y']>200 else 290)
            box=locator.bounding_box()
            if box and not (4<=box['y'] and box['y']+box['height']<=385):
                locator.evaluate('(n) => n.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"})')
                self.data['interactions'].append({'kind':'setup-scroll-into-view','selector':selector,'frame':frame.url if frame else 'main','note':'Capture setup after six native gestures; not proof that user scrolling passed.'})
        box = locator.bounding_box()
        if not box:
            raise RuntimeError('No target: '+selector)
        x, y = box['x']+box['width']/2, box['y']+box['height']/2
        if not (0 <= x < 844 and 0 <= y < 390):
            raise RuntimeError('Target is outside viewport: '+selector)
        before = scope.evaluate('() => ({t:performance.now(),audio:__kidAudit?.audio.length,speech:__kidAudit?.speech.length})')
        self.touch('touchStart', [(x, y)])
        self.page.wait_for_timeout(hold)
        self.touch('touchEnd', [])
        self.page.wait_for_timeout(200)
        after = scope.evaluate('() => ({t:performance.now(),events:__kidAudit?.events.slice(-5),audio:__kidAudit?.audio.slice(-20),speech:__kidAudit?.speech.slice(-4)})')
        self.data['interactions'].append({'selector': selector, 'frame': frame.url if frame else 'main', 'x': round(x, 2), 'y': round(y, 2), 'holdMs': hold, 'before': before, 'after': after})
        return after

    def shot(self, name, game='island', state='', frame=None):
        self.page.wait_for_timeout(140)
        path = self.output / 'screenshots' / (name+'.png')
        try:self.page.screenshot(path=str(path), full_page=False, timeout=30000)
        except Exception as error:
            if 'Timeout' not in str(error):raise
            result=self.cdp.send('Page.captureScreenshot',{'format':'png','fromSurface':False,'captureBeyondViewport':False})
            path.write_bytes(base64.b64decode(result['data']))
            self.data.setdefault('captureFallbacks',[]).append({'screen':name,'reason':'Playwright compositor screenshot timeout','method':'CDP Page.captureScreenshot fromSurface=false'})
        metrics = (frame or self.page).evaluate(MEASURE)
        if frame:
            metrics['frameViewport'] = metrics['viewport']
            metrics['frameRect'] = self.page.locator('iframe').first.bounding_box()
        screen = {'id': name, 'game': game, 'state': state or name, 'fixture': self.fixture, 'screenshot': 'screenshots/'+path.name, 'metrics': metrics}
        self.data['screens'].append(screen)
        self.save()
        print(json.dumps({'screen': name, 'targets': len(metrics['targets']), 'under44': len([t for t in metrics['targets'] if t['under44'] and t['visibleRect']['height']>0]), 'scrolls': len(metrics['scroll'])}), flush=True)
        return screen

    def pages(self, name, game='island', state='', frame=None, limit=16):
        # Freeze only decorative map animation during still menu captures. This
        # never freezes a played game or any UI clock, and is not used for timing.
        freeze=not frame and not self.page.locator('.game-screen').count()
        previous=self.evaluate('() => __island.view.paused') if freeze else None
        if freeze:self.evaluate('() => {__island.view.paused=true;}')
        boar_hold=bool(frame and frame.evaluate('() => Boolean(window.__boar && window.__boarIsland?.snapshot.mode!=="battle")'))
        if boar_hold:frame.evaluate('() => __boar.hold(true)')
        try:
            return self._pages(name,game,state,frame,limit)
        finally:
            if freeze:self.evaluate('(v) => {__island.view.paused=v;}',previous)
            if boar_hold:frame.evaluate('() => __boar.hold(false)')

    def _pages(self, name, game='island', state='', frame=None, limit=16):
        screen = self.shot(name, game, state, frame)
        scope = frame or self.page
        scrolls = screen['metrics']['scroll']
        if not scrolls:
            return
        # Pick the largest scrollable surface; nested surfaces have their own named captures.
        surface = max(scrolls, key=lambda s: min(s['rect']['width'], 844)*min(s['rect']['height'], 390))
        locator = scope.locator(surface['selector']).first
        for i in range(1, limit+1):
            prior = locator.evaluate('(n) => ({top:n.scrollTop,total:n.scrollHeight,height:n.clientHeight})')
            if prior['top']+prior['height'] >= prior['total']-3:
                break
            box = locator.bounding_box()
            top, bottom = max(15, box['y']), min(380, box['y']+box['height'])
            # Swipe on the scroll surface margin to avoid game tiles and draggable puzzles.
            x = min(815, max(22, box['x']+box['width']-13))
            self.swipe(x, bottom-18, x, top+18, steps=4)
            current = locator.evaluate('(n) => n.scrollTop')
            if current <= prior['top']+1:
                self.data['errors'].append({'screen': name, 'kind': 'touch-scroll-blocked', 'selector': surface['selector'], 'top': current})
                break
            self.shot(f'{name}--scroll-{i:02}', game, state, frame)

    def close(self):
        self.evaluate('() => {const {ui,view}=__island;ui.closeModal();ui.cancelPlacement();ui.closeInfo();ui.closeDetails();ui.setDockOpen(false);ui.setMoreOpen(false);ui.cityAccess.toggleMap(false);view.setTour(false);}')
        self.page.wait_for_timeout(120)

    def seed(self):
        self.fixture = 'synthetic-progressed-city-age-7'
        self.data['fixtures']['progressedCity'] = self.evaluate(SEED)

    def attempt(self, name, fn):
        try:
            fn()
        except Exception as e:
            self.data['errors'].append({'screen': name, 'kind': type(e).__name__, 'message': str(e)[:1800]})
            print('ERROR '+name+': '+str(e)[:400], flush=True)
            try:
                self.shot(name+'--capture-error', state='capture-error')
            except Exception:
                pass
            self.save()

    def island(self):
        self.pages('island-01-avatar-first-use')
        self.tap('[data-action=avatar-start]')
        self.shot('island-02-first-city')
        self.tap('[data-action=toggle-tasks]');self.pages('island-03-tutorial-tasks');self.close()
        self.tap('[data-action=toggle-more]');self.shot('island-04-more')
        self.tap('[data-action=help]');self.shot('island-05-help-toast');self.close()
        self.tap('[data-action=city-map]');self.pages('island-06-map');self.close()
        self.tap('[data-action=city-tour]');self.shot('island-07-tour');self.close()
        self.tap('[data-action=toggle-city]');self.pages('island-08-city-stats');self.close()
        self.tap('[data-action=quick-scores]');self.pages('island-09-scores');self.close()
        self.tap('[data-action=quick-training]');self.pages('island-10-training-hub');self.close()
        self.tap('[data-action=quick-learning]');self.pages('island-11-first-daily');self.close()
        self.tap('[data-action=toggle-more]');self.tap('[data-action=parent]',hold=1900)
        self.pages('island-12-parent-settings')
        self.tap('[data-action=learning-age][data-age="7"]')
        self.shot('island-13-parent-age-7');self.close()
        self.evaluate('() => __island.ui.showReset()');self.pages('island-14-reset-confirmation');self.close()
        self.seed()
        self.shot('island-15-progressed-city')
        self.evaluate('() => __island.ui.showAvatar()');self.pages('island-16-avatar-edit');self.close()
        self.tap('[data-action=toggle-build]')
        categories = self.evaluate('() => [...document.querySelectorAll("[data-category]")].map(n=>n.dataset.category)')
        for category in categories:
            self.attempt('catalog-'+category, lambda category=category: (self.tap('[data-category="'+category+'"]'),self.pages('island-17-catalog-'+category)))
        self.close()
        self.island_rest()

    def island_rest(self):
        self.seed()
        for tab in ['blueprint','overview','budget','zones']:
            self.close();self.evaluate('(tab) => __island.ui.cityManagement.open(tab)',tab)
            self.pages('island-18-city-'+tab)
        self.close()
        self.evaluate('() => __island.ui.readyPlots.openList()');self.pages('island-19-ready-plots');self.close()
        self.evaluate('() => {const p=__island.engine.readyPlots().find(p=>p.status!=="built");if(p)__island.ui.readyPlots.show(p.id);}')
        self.pages('island-20-ready-build-confirm');self.close()
        self.evaluate('() => __island.ui.showInfo(__island.engine.state.buildings.find(b=>b.typeId==="cityHall").id)');self.pages('island-21-building-info');self.close()
        self.evaluate('() => {__island.ui.selectBuilding("house");const p=__island.ui.findCell("house");if(p){__island.view.focusCell(p.x,p.z);__island.ui.updateGhost(p,false);}}')
        self.shot('island-22-placement-valid')
        self.evaluate('() => __island.ui.updateGhost({x:0,z:0},false)');self.shot('island-23-placement-invalid');self.close()
        for department in ['water','health','education','safety']:
            self.evaluate('(id) => __island.ui.cityManagement.showOverlay(id)',department);self.shot('island-24-coverage-'+department)
        self.evaluate('() => __island.ui.cityManagement.hideOverlay?.()');self.close()
        self.evaluate('() => __island.games.confirmMapExit()');self.pages('island-25-exit-confirm');self.close()
        self.evaluate('() => {const e=__island.engine;e.state.learning.startDay="2026-01-01";e.state.learning.roundsToday=0;e.save();__island.learning.daily();}')
        self.fixture='synthetic-next-day-locked-age-7';self.pages('island-26-daily-locked')
        self.close();self.seed()
        for station in ['language','math','animals','puzzles']:
            self.close();self.evaluate('(id) => __island.learning.start(id)',station);self.pages('learning-'+station+'-question','learning')
            q=self.evaluate('() => __island.engine.learningRound().question')
            self.data['fixtures']['question-'+station]=q
            if q['kind']=='choice':
                wrong=next((v for v in q['options'] if v!=q['answer']),None)
                if wrong is not None:
                    self.tap('[data-action=learning-answer][data-value='+json.dumps(wrong,ensure_ascii=False)+']')
                    self.shot('learning-'+station+'-wrong','learning')
                self.tap('[data-action=learning-answer][data-value='+json.dumps(q['answer'],ensure_ascii=False)+']')
                self.shot('learning-'+station+'-correct','learning')
            # Complete only the ephemeral round via the actual engine, without claiming a child completed it.
            self.evaluate('''() => {const e=__island.engine;let r;for(let i=0;i<10&&e.learningRound();i++){e.answerLearning(e.learningRound().question.answer);r=e.nextLearning();if(r.done){__island.learning.result(r.result);break;}}}''')
            self.fixture='synthetic-learning-completion-age-7';self.pages('learning-'+station+'-result','learning');self.fixture='synthetic-progressed-city-age-7'
        self.close();self.seed()
        for event in ['fire','aliens','ship']:
            self.close()
            result=self.evaluate('''(id) => {const {engine:e,activity,games}=__island;e.state.events.active=null;const r=activity.prepare(id);games.render();return r;}''',event)
            self.data['fixtures']['event-'+event]=result
            self.shot('island-27-event-'+event)
            self.evaluate('() => {__island.engine.state.events.active=null;__island.engine.state.events.nextAt=Date.now()+86400000;__island.games.render();}')

    def library(self):
        self.seed();self.tap('[data-action=quick-games]');self.pages('games-library','library')

    def game(self, game):
        self.seed();self.close()
        self.evaluate('(id) => __island.games.intro(id)',game)
        self.pages(game+'-instructions',game,'instructions')
        self.tap('[data-action=game-help-again]')
        self.shot(game+'-instructions-replay',game,'instructions replay')
        self.close()
        if game!='boarDefense':
            self.evaluate('(id) => __island.games.gameHome(id)',game);self.pages(game+'-home',game,'home');self.close()
            self.evaluate('(id) => __island.games.stages(id)',game);self.page.wait_for_timeout(600);self.pages(game+'-stages',game,'stages / league entry');self.close()
            self.evaluate('(id) => __island.games.gameUpgrades(id)',game);self.pages(game+'-upgrades',game,'upgrades');self.close()
            if self.evaluate('(id) => Boolean(__island.data.config.minigames[id].equipment)',game):
                self.evaluate('(id) => __island.games.equipment(id)',game);self.page.wait_for_timeout(400);self.pages(game+'-equipment',game,'equipment');self.close()
        if game=='soccer':
            for method in ['training','rosters','team']:
                self.evaluate('(method) => __island.games[method]()',method);self.pages('soccer-'+method,game,method);self.close()
        if game=='streetSlam':
            self.evaluate('() => __island.games.stages("streetSlam")')
            self.tap('.hoops-more > summary');self.pages('streetSlam-club',game,'club management');self.close()
        if game=='fireRescue':
            self.evaluate('() => __island.games.certificates()');self.pages('fireRescue-certificates',game,'certificates');self.close()
        if game=='alienDefense':
            self.evaluate('() => __island.games.hangar()');self.pages('alienDefense-hangar',game,'hangar');self.close()
        if game in ['islandRacing','alpineRush']:
            method='racingLeagueScreen' if game=='islandRacing' else 'alpineLeagueScreen'
            for tab in ['season','shop']:
                self.evaluate('(p) => __island.games[p.method](p.tab)',{'method':method,'tab':tab});self.page.wait_for_timeout(800);self.pages(game+'-league-'+tab,game,'league '+tab);self.close()
        if game=='islandRacing':
            self.evaluate('() => __island.games.racingLeagueGo()')
        else:
            self.evaluate('(id) => __island.games.intro(id,undefined,1)',game)
            self.tap('[data-action=game-understood]')
        self.shot(game+'-starting',game,'startup')
        self.page.wait_for_function('() => __island.games.current && document.querySelector(".game-screen")?.dataset.starting!=="true"',timeout=60000)
        self.page.wait_for_timeout(3000)
        self.start_internal(game)
        # Read readiness, do not change renderer quality, clocks or game balance.
        ready=self.evaluate('() => {const s=__island.games.current?.session;return {snapshot:s?.snapshot,debugKeys:s?.debug?Object.keys(s.debug):[],sessionKeys:s?Object.keys(s):[]};}')
        self.data['fixtures'][game+'-session']=ready
        self.shot(game+'-playing',game,'live play')
        if game=='boarDefense':
            self.boar()
        else:
            if game=='catchCriminal' and self.page.locator('.catch-help-ok:visible').count():
                self.pages('catchCriminal-in-game-help',game,'first chase help')
                self.tap('.catch-help-ok');self.page.wait_for_timeout(3500)
            self.game_input(game)
            if game=='catchCriminal':
                self.catch_phases()
        self.tap('[data-action=game-pause]')
        self.shot(game+'-pause',game,'pause and exit')
        self.tap('[data-action=game-resume]')
        self.page.wait_for_timeout(300)
        self.tap('[data-action=game-pause]')
        started=time.monotonic();self.tap('[data-action=game-exit]')
        inactive=self.evaluate('() => !__island.engine.isMinigameActive() && !__island.games.current')
        self.data['interactions'].append({'game':game,'kind':'exit-result','inactive':inactive,'hostRoundtripMs':round((time.monotonic()-started)*1000,1),'note':'Includes deliberate 200 ms instrumentation wait; not a UI latency metric.'})
        self.shot(game+'-after-exit',game,'returned to island')
        if game!='boarDefense':
            for outcome in ['win','lose']:
                self.fixture='synthetic-result-display-'+outcome
                self.evaluate('''(p) => __island.games.showResult(p.id,undefined,{outcome:p.outcome,stage:1,stars:p.outcome==='win'?3:0,score:p.outcome==='win'?120:0,money:p.outcome==='win'?30:0,parts:p.outcome==='win'?1:0})''',{'id':game,'outcome':outcome})
                self.page.wait_for_timeout(600);self.pages(game+'-result-'+outcome,game,'result display fixture');self.close()
        self.data['fixtures']['pressSamples']=self.evaluate('() => __island.pressSamples')
        self.save()

    def catch_phases(self):
        for selector in ['.catch-boost','.catch-brake','.catch-fire','.catch-cycle']:
            if self.page.locator(selector+':visible').count():
                self.attempt('catch-'+selector,lambda selector=selector:self.tap(selector,hold=300,scroll=False))
        self.shot('catchCriminal-chase-controls','catchCriminal','chase controls')
        self.fixture='synthetic-accelerated-chase-completion'
        self.evaluate('() => __island.games.current.session.debug.skipChase()')
        self.shot('catchCriminal-stop-transition','catchCriminal','chase to capture transition')
        self.page.wait_for_timeout(3500)
        self.shot('catchCriminal-capture-aim','catchCriminal','capture aim')
        self.touch('touchStart',[(200,280)]);self.touch('touchMove',[(260,205)]);self.page.wait_for_timeout(300)
        self.shot('catchCriminal-capture-held','catchCriminal','capture drag held')
        self.touch('touchEnd',[]);self.page.wait_for_timeout(250)
        self.shot('catchCriminal-capture-release','catchCriminal','capture release')
        self.data['fixtures']['catch-phases-snapshot']=self.evaluate('() => __island.games.current?.session.snapshot')
        self.fixture='synthetic-progressed-city-age-7'

    def wait_game(self):
        self.page.wait_for_function('() => __island.games.current && document.querySelector(".game-screen")?.dataset.starting!=="true"',timeout=60000)
        self.page.wait_for_timeout(1600)

    def start_internal(self, game, prefix=None):
        for action in ['racing-intro-go','alpine-start']:
            selector='[data-action="'+action+'"]'
            if self.page.locator(selector+':visible').count():
                self.page.locator(selector).wait_for(state='visible')
                self.page.wait_for_function('(action) => !document.querySelector("[data-action="+action+"]")?.disabled',arg=action,timeout=60000)
                self.shot((prefix or game)+'-internal-start-card',game,'internal start card')
                self.tap(selector);self.page.wait_for_timeout(3500)
                self.page.wait_for_function('() => __island.games.current?.session.snapshot.phase==="racing"',timeout=90000)

    def advanced(self):
        self.seed()
        self.evaluate('''() => {for(const [id,p]of Object.entries(__island.engine.state.minigameProgress)){p.stage=__island.data.config.minigames[id].levels.length;}__island.engine.save();}''')
        self.fixture='synthetic-unlocked-progress-age-7'
        for level in [3,12]:
            def inside(level=level):
                self.close();self.evaluate('(n) => __island.games.launch("fireRescue",undefined,n)',level);self.wait_game()
                self.page.wait_for_function('() => Boolean(__island.games.current?.session.debug?.flow)',timeout=60000)
                self.shot(f'fireRescue-entry-{level}-street','fireRescue','entry building on street')
                self.fixture='synthetic-truck-parked-at-entry-door'
                self.evaluate('''() => {const d=__island.games.current.session.debug,p=d.flow.building.door,m=d.model;m.truck.x=p[0];m.truck.z=p[2];m.truck.speed=0;}''')
                self.page.wait_for_function('() => __island.games.current?.session.snapshot.v24?.enterButton',timeout=15000)
                self.shot(f'fireRescue-entry-{level}-ready','fireRescue','entry button')
                self.tap('#fire-enter')
                self.page.wait_for_function('() => __island.games.current?.session.snapshot.v24?.interior?.ready',timeout=60000)
                self.shot(f'fireRescue-entry-{level}-lesson','fireRescue','interior lesson / room card')
                if self.page.locator('.fv24-card:visible').count():self.tap('.fv24-card')
                self.page.wait_for_timeout(700)
                if self.page.locator('.fv24-card:visible').count():
                    self.shot(f'fireRescue-entry-{level}-room-card','fireRescue','room instructions');self.tap('.fv24-card')
                self.page.wait_for_timeout(450)
                self.shot(f'fireRescue-entry-{level}-room','fireRescue','interior live room')
                s=self.evaluate('() => __island.games.current.session.snapshot.v24.interior')
                self.data['fixtures'][f'fire-entry-{level}']=s
                spots=s.get('screen',{}).get('spots',[])
                if spots:
                    point=spots[0];self.touch('touchStart',[(point['x'],point['y'])]);self.page.wait_for_timeout(450)
                    self.shot(f'fireRescue-entry-{level}-spray','fireRescue','direct touch on fire');self.touch('touchEnd',[])
                self.fixture='synthetic-clock-near-timeout'
                self.evaluate('''() => {const m=__island.games.current.session.debug.interior.model;for(let i=0;i<1600&&!m.result;i++){const s=m.snapshot();if(s.room?.remaining!==undefined&&s.room.remaining<=9)break;m.update(.1,{});}}''')
                self.shot(f'fireRescue-entry-{level}-clock','fireRescue','clock near timeout')
                self.tap('[data-action=game-pause]');self.shot(f'fireRescue-entry-{level}-pause','fireRescue','pause inside building');self.tap('[data-action=game-exit]')
            self.attempt(f'fire-entry-{level}',inside)
        for mode in ['targets','interior']:
            def bonus(mode=mode):
                self.close();self.fixture='synthetic-unlocked-fire-bonus'
                self.evaluate('(mode) => __island.games.launch("fireRescue",undefined,1,{fireMode:mode,level:1})',mode)
                self.wait_game();self.shot('fireRescue-bonus-'+mode+'-intro','fireRescue','bonus '+mode+' introduction')
                if self.page.locator('.fv-card:visible').count():self.tap('.fv-card')
                self.touch('touchStart',[(422,195)]);self.touch('touchEnd',[]);self.page.wait_for_timeout(2000)
                self.shot('fireRescue-bonus-'+mode+'-play','fireRescue','bonus '+mode+' live')
                self.data['fixtures']['fire-bonus-'+mode]=self.evaluate('() => __island.games.current?.session.snapshot')
                self.tap('[data-action=game-pause]');self.shot('fireRescue-bonus-'+mode+'-pause','fireRescue','bonus '+mode+' pause');self.tap('[data-action=game-exit]')
            self.attempt('fire-bonus-'+mode,bonus)
        for kind in ['targets','penalties','cones']:
            def drill(kind=kind):
                self.close();self.fixture='synthetic-progressed-city-age-7'
                self.evaluate('(kind) => __island.games.launch("soccer",undefined,1,kind)',kind);self.wait_game()
                self.shot('soccer-drill-'+kind,'soccer','practice '+kind)
                self.tap('[data-action=game-pause]');self.tap('[data-action=game-exit]')
            self.attempt('soccer-drill-'+kind,drill)
        self.attempt('alpine-league-live',self.alpine_league_live)
        self.attempt('racing-league-live',self.racing_league_live)
        self.attempt('hoops-extra-controls',self.hoops_extra_controls)
        self.close();self.fixture='synthetic-result-display-league'
        self.evaluate('''() => __island.games.racingLeagueResult({outcome:'win',score:120,money:0,parts:0,stars:3,stage:1,league:{place:1,points:25,coins:70,seasonPrize:0}})''')
        self.page.wait_for_timeout(700);self.pages('islandRacing-league-result','islandRacing','league result fixture');self.close()
        self.evaluate('''() => __island.games.alpineLeagueResult({outcome:'win',score:120,alpineLeague:{n:1,place:3,passed:true,completed:true,ms:83000,gates:10,crashes:0,coins:35,points:10,stars:2,goals:[{kind:'place',target:3,ok:true},{kind:'time',ms:90000,ok:true}]}},{peakKmh:72})''')
        self.page.wait_for_timeout(700);self.pages('alpineRush-league-result','alpineRush','league result fixture');self.close()
        self.learning_variants()

    def alpine_league_live(self):
        self.close();self.fixture='synthetic-progressed-city-age-7'
        self.evaluate('() => {if(!__island.engine.state.instructionsSeen.includes("alpineRush"))__island.engine.state.instructionsSeen.push("alpineRush");__island.games.alpineLeagueGo(1);}')
        self.wait_game();self.start_internal('alpineRush','alpineRush-league');self.shot('alpineRush-league-live','alpineRush','live league stage')
        self.game_input('alpineRush','alpineRush-league')
        self.tap('[data-action=game-pause]');self.shot('alpineRush-league-pause','alpineRush','league pause');self.tap('[data-action=game-exit]')

    def advanced_rest(self):
        self.seed()
        self.attempt('alpine-league-live',self.alpine_league_live)
        self.attempt('racing-league-live',self.racing_league_live)
        self.attempt('hoops-extra-controls',self.hoops_extra_controls)
        self.close();self.fixture='synthetic-result-display-league'
        self.evaluate('''() => __island.games.racingLeagueResult({outcome:'win',score:120,money:0,parts:0,stars:3,stage:1,league:{place:1,points:25,coins:70,seasonPrize:0}})''')
        self.page.wait_for_timeout(700);self.pages('islandRacing-league-result','islandRacing','league result fixture');self.close()
        self.evaluate('''() => __island.games.alpineLeagueResult({outcome:'win',score:120,alpineLeague:{n:1,place:3,passed:true,completed:true,ms:83000,gates:10,crashes:0,coins:35,points:10,stars:2,goals:[{kind:'place',target:3,ok:true},{kind:'time',ms:90000,ok:true}]}},{peakKmh:72})''')
        self.page.wait_for_timeout(700);self.pages('alpineRush-league-result','alpineRush','league result fixture');self.close()
        self.learning_variants()

    def racing_league_live(self):
        self.close();self.fixture='synthetic-progressed-city-age-7'
        self.evaluate('() => __island.games.racingLeagueGo()');self.wait_game();self.start_internal('islandRacing','islandRacing-league')
        self.shot('islandRacing-league-live','islandRacing','verified live league race')
        self.game_input('islandRacing','islandRacing-league')
        for action in ['racing-auto','racing-pit']:
            selector='[data-action="'+action+'"]'
            if self.page.locator(selector+':visible').count():
                self.tap(selector);self.shot('islandRacing-'+action,'islandRacing',action)
        self.data['fixtures']['racing-live-snapshot']=self.evaluate('() => __island.games.current?.session.snapshot')
        self.tap('[data-action=game-pause]');self.shot('islandRacing-league-pause','islandRacing','live league pause');self.tap('[data-action=game-exit]')

    def hoops_extra_controls(self):
        self.close();self.fixture='synthetic-progressed-city-age-7'
        self.evaluate('() => __island.games.launch("streetSlam",undefined,1)');self.wait_game()
        self.page.wait_for_function('() => document.querySelector("[data-action=shoot]")',timeout=60000)
        self.touch('touchStart',[(90,240)]);self.touch('touchMove',[(125,215)])
        b=self.page.locator('[data-action=shoot]').bounding_box()
        self.touch('touchStart',[(125,215),(b['x']+b['width']/2,b['y']+b['height']/2)])
        self.page.wait_for_timeout(450);self.shot('streetSlam-shot-two-thumbs','streetSlam','actual shot and movement');self.touch('touchEnd',[])
        for action in ['pass','cross','fake','sprint']:
            if self.page.locator('[data-action="'+action+'"]:visible').count():self.tap('[data-action="'+action+'"]',hold=180)
        if self.page.locator('.hoops-kit-trigger:visible').count():
            self.tap('.hoops-kit-trigger');self.pages('streetSlam-uniform-picker','streetSlam','uniform picker')
            self.data['fixtures']['hoops-kit-text']=self.evaluate('() => document.body.innerText')
            # The actual close control is discovered from the rendered card.
            close=self.page.locator('.hoops-kit-close:visible, [data-action=hoops-kit-close]:visible')
            if close.count():self.tap('.hoops-kit-close, [data-action=hoops-kit-close]')
            else:self.evaluate('() => __island.games.current.session.debug.screens?.close?.()')
        if self.page.locator('[data-action=timeout]:visible').count():
            self.tap('[data-action=timeout]');self.pages('streetSlam-timeout','streetSlam','timeout and tactics')
        self.data['fixtures']['hoops-extra-snapshot']=self.evaluate('() => __island.games.current?.session.snapshot')
        self.close()

    def learning_variants(self):
        self.seed();self.close();self.fixture='synthetic-learning-age-7-level-4'
        for station,index,want in [('language',3,'word'),('puzzles',1,'memory'),('puzzles',3,'jigsaw')]:
            self.close();self.evaluate('''(p) => {const e=__island.engine,s=e.state.learning.stations[p.station];s.level=4;s.successStreak=0;__island.learning.start(p.station);for(let i=0;i<p.index;i++){e.answerLearning(e.learningRound().question.answer);s.level=4;s.successStreak=0;e.nextLearning();}__island.learning.drawQuestion();}''',{'station':station,'index':index})
            self.pages('learning-variant-'+want,'learning',want)
            self.data['fixtures']['learning-variant-'+want]=self.evaluate('() => __island.engine.learningRound().question')
            buttons=self.page.locator('.learning-body button:visible')
            if buttons.count():
                target=buttons.first
                cl=target.get_attribute('class');self.tap('button.'+'.'.join(cl.split()))
                self.shot('learning-variant-'+want+'-touched','learning',want+' touched')
        self.close()

    def fire_cards(self):
        self.seed();self.fixture='synthetic-truck-parked-at-entry-door'
        self.evaluate('() => {__island.engine.state.minigameProgress.fireRescue.stage=30;}')
        for level in [3,12]:
            self.close();self.evaluate('(n) => __island.games.launch("fireRescue",undefined,n)',level);self.wait_game()
            self.page.wait_for_function('() => Boolean(__island.games.current?.session.debug?.flow)',timeout=60000)
            self.evaluate('''() => {const d=__island.games.current.session.debug,p=d.flow.building.door,m=d.model;m.truck.x=p[0];m.truck.z=p[2];m.truck.speed=0;}''')
            self.page.wait_for_function('() => __island.games.current?.session.snapshot.v24?.enterButton',timeout=15000)
            self.tap('#fire-enter')
            self.page.wait_for_function('() => __island.games.current?.session.snapshot.v24?.interior?.ready && document.querySelector(".fv24-fade")?.dataset.state==="clear"',timeout=60000)
            self.page.wait_for_timeout(600)
            self.shot(f'fireRescue-entry-{level}-visible-card','fireRescue','visible tutorial / room instruction')
            if self.page.locator('.fv24-card:visible').count():self.tap('.fv24-card')
            self.page.wait_for_timeout(700)
            if self.page.locator('.fv24-card:visible').count():
                self.shot(f'fireRescue-entry-{level}-visible-room-card','fireRescue','visible room card');self.tap('.fv24-card')
            self.page.wait_for_timeout(600)
            self.shot(f'fireRescue-entry-{level}-visible-play','fireRescue','visible interior play')
            self.tap('[data-action=game-pause]');self.tap('[data-action=game-exit]')

    def feedback(self):
        self.seed();self.fixture='isolated-software-renderer-feedback-probe'
        self.data['metadata']['exclusiveBrowserProbe']=True
        self.data['fixtures']['speechVoices']=self.evaluate('() => speechSynthesis.getVoices().map(v=>({lang:v.lang,name:v.name}))')
        self.attempt('naval-extra-controls',self.naval_extra_controls)
        for game in GAMES:
            def probe(game=game):
                self.close()
                if game=='islandRacing':self.evaluate('() => __island.games.racingLeagueGo()')
                else:self.evaluate('(id) => __island.games.launch(id,undefined,1)',game)
                self.wait_game();self.start_internal(game,'feedback-'+game)
                self.page.wait_for_timeout(800)
                if self.page.locator('.catch-help-ok:visible').count():self.tap('.catch-help-ok')
                if game=='boarDefense':
                    self.page.wait_for_function('() => __island.games.current?.session.snapshot.ready',timeout=60000)
                    frame=next(f for f in self.page.frames if 'boar-island/index.html' in f.url)
                    self.tap('#start',frame=frame);self.page.wait_for_timeout(1500)
                    fire=frame.locator('#fire-btn').bounding_box();aim=frame.locator('#aim-zone').bounding_box()
                    p=(aim['x']+aim['width']*.5,aim['y']+aim['height']*.6);q=(fire['x']+fire['width']/2,fire['y']+fire['height']/2)
                    self.touch('touchStart',[p]);self.touch('touchMove',[(p[0]+25,p[1]-10)]);self.touch('touchStart',[(p[0]+25,p[1]-10),q]);self.page.wait_for_timeout(800)
                    self.shot('feedback-boarDefense-firing',game,'actual two-finger aiming and firing',frame)
                    self.touch('touchEnd',[])
                    self.data['fixtures']['boar-real-two-finger-input']=frame.evaluate('() => __boar.state')
                self.evaluate('() => {__island.pressSamples.length=0;__kidAudit.events.length=0;__kidAudit.audio.length=0;}')
                selected=self.evaluate('''() => {for(const q of ['#shoot','[data-action=shoot]','[data-game-control=fire]','[data-game-control=nitro]','[data-game-control=boost]','.catch-fire']){const n=document.querySelector(q);if(n&&!n.disabled&&n.checkVisibility()&&n.getBoundingClientRect().width)return q;}return null;}''')
                if selected:
                    for _ in range(4):self.tap(selected,hold=55,scroll=False)
                for _ in range(4):
                    self.tap('[data-action=game-pause]',scroll=False);self.tap('[data-action=game-resume]',scroll=False)
                self.data['fixtures'][game+'-feedback']={'primaryControl':selected,'samples':self.evaluate('() => __island.pressSamples'),'events':self.evaluate('() => __kidAudit.events'),'audio':self.evaluate('() => __kidAudit.audio'),'snapshot':self.evaluate('() => __island.games.current?.session.snapshot')}
                self.shot('feedback-'+game,game,'isolated feedback probe')
                self.tap('[data-action=game-pause]');self.tap('[data-action=game-exit]')
            self.attempt('feedback-'+game,probe)
        self.close()

    def naval_extra_controls(self):
        self.close();self.evaluate('() => __island.games.launch("navalDuel",undefined,1)');self.wait_game()
        self.page.wait_for_timeout(800)
        self.evaluate('() => {__kidAudit.captureCanvasText=true;}');self.page.wait_for_timeout(500)
        self.shot('navalDuel-canvas-text','navalDuel','canvas HUD text measurements')
        self.evaluate('() => {__kidAudit.captureCanvasText=false;}')
        self.tap('.naval-weapon-picker')
        self.shot('navalDuel-weapon-picker','navalDuel','expanded weapon choices')
        choices=self.page.locator('[data-game-control=ammo-select]:visible')
        if choices.count()>1:
            target=choices.nth(1).get_attribute('data-ammo-index');self.tap('[data-ammo-index="'+target+'"]:visible')
            self.shot('navalDuel-weapon-changed','navalDuel','weapon selected by trusted touch')
        if self.page.locator('.naval-lock-btn:visible').count():
            self.tap('.naval-lock-btn');self.shot('navalDuel-lock-action','navalDuel','lock feedback')
        self.tap('[data-action=game-pause]');self.tap('[data-action=game-exit]')

    def hoops_details(self):
        self.seed();self.evaluate('() => __island.games.launch("streetSlam",undefined,1)');self.wait_game()
        self.page.wait_for_function('() => Boolean(__island.games.current?.session.debug?.view)',timeout=60000)
        self.fixture='synthetic-legal-timeout-bench-display-frozen-model'
        result=self.evaluate('''() => {const d=__island.games.current.session.debug,e=d.engine;d.hold=true;e.debug.setPhase('dead');const r=e.timeout(0);d.step(1,{move:{x:0,z:0}});return r;}''')
        self.data['fixtures']['timeout-command']=result
        self.page.locator('.hoops-bench:visible').wait_for(timeout=15000)
        self.pages('streetSlam-timeout-bench','streetSlam','timeout bench display from legal model state')
        self.tap('.hoops-bench-row.court .hoops-card')
        self.tap('.hoops-bench-row.bench .hoops-card')
        self.shot('streetSlam-timeout-substitution','streetSlam','trusted touches select a substitution in the fixture')
        self.data['fixtures']['timeout-bench']=self.evaluate('() => __island.games.current.session.snapshot')
        self.close()

    def game_input(self, game, prefix=None):
        # Two simultaneous real touch points: steering/aim plus the game's primary action.
        controls=self.page.locator('[data-game-control]:visible, .game-controls button:visible, #shoot:visible, #pass:visible, #sprint:visible, #soccer-switch:visible')
        info=[]
        for i in range(min(controls.count(),14)):
            n=controls.nth(i);box=n.bounding_box()
            if box:info.append({'control':n.get_attribute('data-game-control') or n.get_attribute('id') or n.get_attribute('data-action'),'box':box,'disabled':n.is_disabled()})
        self.data['fixtures'][game+'-controls']=info
        zones=self.page.locator('.soccer-stick-zone:visible, .catch6-steer:visible, .racing-stick-zone:visible, .alpine-stick-zone:visible')
        left=(120,285)
        if zones.count():
            z=zones.first.bounding_box();left=(z['x']+min(z['width']*.5,95),z['y']+min(z['height']*.5,60))
        action=next((c for c in info if not c['disabled'] and c['control'] in ['shoot','fire','pass','jump','accelerate','brake','sprint','hit']),None)
        self.data['fixtures'][game+'-before-input']=self.evaluate('() => __island.games.current?.session.snapshot')
        self.touch('touchStart',[left]);self.page.wait_for_timeout(80)
        moved=(min(800,left[0]+32),max(15,left[1]-18));self.touch('touchMove',[moved]);self.page.wait_for_timeout(200)
        if action:
            b=action['box'];right=(b['x']+b['width']/2,b['y']+b['height']/2)
            if 0<=right[0]<844 and 0<=right[1]<390:
                self.touch('touchStart',[moved,right]);self.page.wait_for_timeout(450)
        self.shot((prefix or game)+'-touch-held',game,'two thumbs / live touch')
        self.touch('touchEnd',[]);self.page.wait_for_timeout(250)
        self.data['fixtures'][game+'-after-input']=self.evaluate('() => __island.games.current?.session.snapshot')
        # Explicitly touch each enabled DOM game control; disabled controls are recorded separately.
        selectors=self.evaluate('() => [...document.querySelectorAll("[data-game-control]")].filter(n=>!n.disabled&&n.getBoundingClientRect().width).map(n=>n.dataset.gameControl)')
        for control in dict.fromkeys(selectors):
            self.attempt(game+'-control-'+control,lambda control=control:self.tap('[data-game-control="'+control+'"]:visible',hold=160,scroll=False))
        for target in ['#shoot','#pass','#sprint','#soccer-switch']:
            if self.page.locator(target+':visible').count() and not self.page.locator(target).first.is_disabled():
                self.attempt(game+'-id-control-'+target,lambda target=target:self.tap(target,hold=160,scroll=False))
        self.shot((prefix or game)+'-after-controls',game,'control feedback')

    def boar(self):
        self.page.wait_for_function('() => __island.games.current?.session.snapshot.ready',timeout=60000)
        frame=next(f for f in self.page.frames if 'boar-island/index.html' in f.url)
        self.pages('boarDefense-campaign-menu','boarDefense','embedded campaign menu',frame)
        for selector,name in [('#help','help'),('#garage','shop')]:
            if frame.locator(selector).count():
                self.tap(selector,frame=frame);self.pages('boarDefense-'+name,'boarDefense',name,frame)
                if name=='help':self.tap('#help-close',frame=frame)
                if name=='shop':
                    self.tap('#tab-upgrades',frame=frame);self.pages('boarDefense-fortifications','boarDefense','fortifications',frame)
                    self.tap('#shop-back',frame=frame)
        start=next((s for s in ['#start','#play','#start-game'] if frame.locator(s).count()),None)
        if start:self.tap(start,frame=frame)
        else:raise RuntimeError('Campaign start selector not found')
        self.page.wait_for_timeout(2000);self.shot('boarDefense-battle','boarDefense','embedded live battle',frame)
        self.touch('touchStart',[(160,280)]);self.touch('touchMove',[(190,265)]);self.page.wait_for_timeout(150)
        fire=frame.locator('#fire-btn,#fire-button,#touch-fire,#fire').first
        if fire.count():
            b=fire.bounding_box();self.touch('touchStart',[(190,265),(b['x']+b['width']/2,b['y']+b['height']/2)])
        self.page.wait_for_timeout(500);self.shot('boarDefense-battle-touch','boarDefense','embedded live touch',frame);self.touch('touchEnd',[])
        self.data['fixtures']['boar-input']=frame.evaluate('() => window.__boar?.state')
        self.fixture='synthetic-accelerated-boar-loss'
        outcome=frame.evaluate('() => {__boar.sim(600);return __boarIsland.snapshot;}')
        self.data['fixtures']['boar-loss']=outcome
        if outcome['mode']=='dead':
            self.pages('boarDefense-defeat','boarDefense','campaign defeat',frame)
            self.tap('#death-shop',frame=frame);self.pages('boarDefense-defeat-shop','boarDefense','shop after defeat',frame)
            self.tap('#shop-back',frame=frame)
        self.fixture='synthetic-accelerated-boar-win'
        outcome=frame.evaluate('() => {__boar.start(1);for(let i=0;i<150&&__boarIsland.snapshot.mode==="battle";i++){__boar.sim(.5);__boar.killAll();}return __boarIsland.snapshot;}')
        self.data['fixtures']['boar-win']=outcome
        self.pages('boarDefense-wave-result','boarDefense','campaign between waves',frame)
        self.fixture='synthetic-progressed-city-age-7'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase',default='island',help='island, library, a game ID, or comma-separated phases')
    parser.add_argument('--output',type=Path,default=HERE)
    parser.add_argument('--browser',default=os.environ.get('BAKASUN_BROWSER','/usr/bin/chromium'))
    args=parser.parse_args();output=args.output.resolve();(output/'screenshots').mkdir(parents=True,exist_ok=True)
    handler=functools.partial(Quiet,directory=str(ROOT))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=args.browser,headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--disable-background-timer-throttling'])
            context=browser.new_context(viewport={'width':844,'height':390},screen={'width':844,'height':390},device_scale_factor=1,is_mobile=True,has_touch=True,locale='he-IL',timezone_id='Asia/Jerusalem',service_workers='block',user_agent='Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')
            context.add_init_script(INSTRUMENT);page=context.new_page();page.set_default_timeout(15000)
            metadata={'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'release':json.loads((ROOT/'workout/island/release.json').read_text())['version'],'capturedAt':datetime.now(ZoneInfo('Asia/Jerusalem')).isoformat(),'browser':browser.version,'viewport':{'width':844,'height':390},'deviceScaleFactor':1,'touchProtocol':'CDP Input.dispatchTouchEvent','renderer':'SwiftShader software WebGL','serviceWorkers':'blocked in disposable context','cspBypass':False}
            try:
                page.goto(f'http://127.0.0.1:{server.server_port}/workout/island/?dev=1',wait_until='load')
                page.wait_for_function('() => window.__island?.view.metrics().avatarLoaded',timeout=90000)
                for phase in args.phase.split(','):
                    if phase not in ['island','island-rest','library','advanced','advanced-rest','learning','fire-cards','feedback','hoops-detail']+GAMES:raise ValueError('Unknown phase: '+phase)
                    audit=Audit(page,context,output,phase);audit.data['metadata']=metadata.copy()
                    if phase=='island':audit.attempt('island',audit.island)
                    elif phase=='island-rest':audit.attempt('island-rest',audit.island_rest)
                    elif phase=='library':audit.attempt('library',audit.library)
                    elif phase=='advanced':audit.attempt('advanced',audit.advanced)
                    elif phase=='advanced-rest':audit.attempt('advanced-rest',audit.advanced_rest)
                    elif phase=='learning':audit.attempt('learning',audit.learning_variants)
                    elif phase=='fire-cards':audit.attempt('fire-cards',audit.fire_cards)
                    elif phase=='feedback':audit.attempt('feedback',audit.feedback)
                    elif phase=='hoops-detail':audit.attempt('hoops-detail',audit.hoops_details)
                    else:audit.attempt(phase,lambda:audit.game(phase))
                    audit.save();audit.close()
            finally:
                context.close();browser.close()
    finally:
        server.shutdown();server.server_close()


if __name__=='__main__':
    main()
