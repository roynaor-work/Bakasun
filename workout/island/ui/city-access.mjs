const node=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
const button=(text,action,fn,cls='secondary-button')=>{const n=node('button',cls,text);n.type='button';n.dataset.action=action;n.onclick=fn;return n;};
const icons={games:'M3 8h18l2 10-4 2-4-4H9l-4 4-4-2 2-10Zm3 2v6m-3-3h6m7-2h.01m3 3h.01',scores:'M7 3h10v6c0 6-10 6-10 0V3Zm0 2H3v3c0 3 2 4 5 4m9-7h4v3c0 3-2 4-5 4m-4 3v6m-4 0h8',training:'m3 8 5-5m8 18 5-5M1 6l5-5m12 22 5-5M5 11l8 8m-2-14 8 8m-11 3 8-8',learning:'M12 6C8 3 4 3 1 4v15c4-1 7-1 11 2 4-3 7-3 11-2V4c-3-1-7-1-11 2Zm0 0v15'};
function icon(kind){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',icons[kind]);svg.append(path);return svg;}

export function achievementRows(state,games){
  return games.map(game=>{const p=state.minigameProgress?.[game.id]||{};return {id:game.id,title:game.title,level:p.stage||1,stars:(p.stars||[]).reduce((sum,n)=>sum+n,0),wins:state.minigameWins?.[game.id]||0,best:state.highScores?.[game.id]||0};});
}

/** Frequent actions belong on the map. This reuses the actual game/learning
 * flows, and shows earned local results rather than inventing a leaderboard. */
export class CityAccess{
  constructor({ui,engine,games,learning}){
    Object.assign(this,{ui,engine,games,learning});this.events=new AbortController();
    this.bar=node('nav','city-quick-access');this.bar.setAttribute('aria-label','הפעולות שלי');
    for(const [id,label,fn]of [['games','משחקים',()=>games.menu()],['scores','הדירוג שלי',()=>this.scores()],['training','אימון',()=>this.training()],['learning','למידה',()=>learning.daily()]]){
      const b=button('',`quick-${id}`,()=>{this.prepare();fn();},'city-quick-button');b.append(icon(id),node('strong','',label));b.setAttribute('aria-label',label);if(id==='games')b.hidden=ui.data.featureFlags.minigames===false;this.bar.append(b);
    }
    ui.root.append(this.bar);
    this.controls=node('div','city-map-controls');
    this.mapButton=button('מפה','city-map',()=>this.toggleMap(),'city-map-button');this.mapButton.setAttribute('aria-expanded','false');this.mapButton.setAttribute('aria-controls','city-map-panel');
    this.tourButton=button('לטיול','city-tour',()=>{this.mapPanel.hidden=true;this.mapButton.setAttribute('aria-expanded','false');this.ui.cancelPlacement();this.ui.closeInfo();this.ui.closeDetails();this.ui.setDockOpen(false);this.ui.view.setTour(!this.ui.view.touring);this.render();},'city-map-button');
    const zoom=node('div','city-zoom');for(const [label,factor,name]of [['+',1.25,'התקרבות'],['−',.8,'התרחקות']]){const b=button(label,'city-zoom-'+(factor>1?'in':'out'),()=>ui.view.zoomCenter(factor),'city-map-button');b.setAttribute('aria-label',name);zoom.append(b);}
    this.controls.append(this.mapButton,this.tourButton,zoom);ui.cameraControls.append(this.controls);
    this.rotateButton=button('סיבוב המפה בגרירה','city-rotate',()=>{ui.view.cameraMode=ui.view.cameraMode==='orbit'?'pan':'orbit';ui.view.setTour(false);ui.setMoreOpen(false);this.render();});ui.morePanel.append(this.rotateButton);
    this.cameraHelp=node('small','city-camera-help','גרירה או חצים לתנועה · +/− לזום');ui.morePanel.append(this.cameraHelp);
    this.panButton=button('חזרה לתנועה','city-pan-mode',()=>{ui.view.cameraMode='pan';this.render();},'city-map-button');this.panButton.hidden=true;this.controls.append(this.panButton);
    this.mapPanel=node('aside','city-map-panel panel');this.mapPanel.id='city-map-panel';this.mapPanel.hidden=true;this.mapPanel.setAttribute('aria-label','מפת העיר');
    const heading=node('div','city-map-heading');heading.append(node('strong','','לאן נלך?'),button('×','city-map-close',()=>this.toggleMap(false),'city-map-close'));heading.lastChild.setAttribute('aria-label','סגירת המפה');
    this.canvas=node('canvas','city-mini-map');this.canvas.width=this.canvas.height=240;this.canvas.tabIndex=0;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','מפת העיר. לחצו על מקום כדי להגיע אליו. חצים להזזה, Enter לבחירה.');
    this.canvas.onclick=e=>{const r=this.canvas.getBoundingClientRect(),size=engine.state.world.size;this.goTo(Math.max(0,Math.min(size-1,(e.clientX-r.left-this.canvas.clientLeft)/this.canvas.clientWidth*size)),Math.max(0,Math.min(size-1,(e.clientY-r.top-this.canvas.clientTop)/this.canvas.clientHeight*size)));};
    this.canvas.onkeydown=e=>{const delta={ArrowLeft:[-2,0],ArrowRight:[2,0],ArrowUp:[0,-2],ArrowDown:[0,2]}[e.key],size=engine.state.world.size;if(delta){e.preventDefault();this.mapCursor={x:Math.max(0,Math.min(size-1,(this.mapCursor?.x??size/2)+delta[0])),z:Math.max(0,Math.min(size-1,(this.mapCursor?.z??size/2)+delta[1]))};this.drawMap();}if(e.key==='Enter'&&this.mapCursor){e.preventDefault();this.goTo(this.mapCursor.x,this.mapCursor.z);}};
    this.destinations=node('div','city-map-destinations');
    this.mapPanel.append(heading,this.canvas,node('p','city-map-hint','לחצו במפה או בחרו מקום בעיר'),this.destinations,button('כל האי','city-overview',()=>{ui.view.overview();this.toggleMap(false);}));ui.root.append(this.mapPanel);
    this.tourHint=node('div','city-tour-hint');this.tourHint.hidden=true;this.tourHint.setAttribute('role','status');this.tourText=node('span','','נוגעים ברחוב כדי לבחור לאן ללכת');this.followButton=button('חזרה לדמות','city-tour-follow',()=>{ui.view.followTour();this.render();});this.followButton.hidden=true;this.tourHint.append(this.tourText,this.followButton,button('סיום טיול','city-tour-stop',()=>{ui.view.setTour(false);this.render();}));ui.root.append(this.tourHint);
    ui.view.canvas.addEventListener('pointerdown',()=>this.toggleMap(false),{signal:this.events.signal});
    document.addEventListener('pointerdown',()=>{this.keyboardInput=false;},{capture:true,signal:this.events.signal});
    document.addEventListener('keydown',e=>{this.keyboardInput=true;if(e.key==='Escape'){if(!this.mapPanel.hidden)this.toggleMap(false);if(ui.view.touring){ui.view.setTour(false);this.render();}}},{signal:this.events.signal});
    this.unsubscribe=engine.subscribe(()=>this.render());this.timer=setInterval(()=>this.render(),350);this.render();
  }
  prepare(){this.ui.cancelPlacement();this.ui.closeInfo();this.ui.closeDetails();this.ui.setDockOpen(false);this.ui.setMoreOpen(false);this.toggleMap(false);this.ui.view.setTour(false);}
  toggleMap(open=this.mapPanel.hidden){const wasOpen=!this.mapPanel.hidden;this.mapPanel.hidden=!open;this.mapButton.setAttribute('aria-expanded',String(open));if(open){this.ui.closeDetails();this.ui.setMoreOpen(false);this.ui.setDockOpen(false);this.render();}else if(wasOpen&&this.keyboardInput)this.mapButton.focus();}
  goTo(x,z){this.ui.view.flyToCell(x,z,3.3);this.toggleMap(false);}
  training(){
    const dialog=this.ui.openModal('access.training','access.trainingHint');dialog.dataset.trainingHub='true';
    for(const [title,detail,route]of [['האימון של היום','בוחרים תוכנית ומתאמנים','#/home'],['אימון חופשי','בוחרים בעצמכם את התרגילים','#/free'],['איך עושים תרגיל?','אנימציה והסבר לכל תרגיל','#/exercises']]){const a=node('a','city-training-link');a.href=new URL('../../'+route,import.meta.url).href;a.append(node('strong','',title),node('span','',detail));a.onclick=e=>{const saved=this.engine.save();if(!saved.ok){e.preventDefault();this.ui.result(saved);}};dialog.append(a);}
    dialog.append(button('תרגול כדורגל באי','access-soccer-training',()=>this.games.training()));
  }
  scores(){
    const dialog=this.ui.openModal('access.scores','access.scoresHint');dialog.dataset.personalScores='true';
    const table=node('table','city-score-table'),head=node('tr');for(const label of ['משחק','שלב','כוכבים','ניצחונות','שיא'])head.append(node('th','',label));const thead=node('thead');thead.append(head);table.append(thead);const body=node('tbody');
    for(const row of achievementRows(this.engine.state,this.games.enabledGames())){const tr=node('tr');tr.append(node('th','',this.ui.t(row.title)));for(const value of [row.level,row.stars,row.wins,row.best||'—'])tr.append(node('td','',String(value)));body.append(tr);}table.append(body);dialog.append(table);
    if(this.ui.data.featureFlags.soccer)dialog.append(node('p','city-score-rank',this.games.teamLabel()));
    dialog.append(button('לכל המשחקים','access-play-games',()=>this.games.menu(),'primary-button'));
  }
  render(){
    this.controls.hidden=!this.ui.morePanel.hidden;
    const orbit=this.ui.view.cameraMode==='orbit';this.panButton.hidden=!orbit;this.rotateButton.setAttribute('aria-pressed',String(orbit));this.rotateButton.textContent=orbit?'תנועה במפה בגרירה':'סיבוב המפה בגרירה';
    const touring=Boolean(this.ui.view.touring),tourLabel=touring?'בטיול':'לטיול';if(this.tourButton.textContent!==tourLabel)this.tourButton.textContent=tourLabel;if(this.tourButton.getAttribute('aria-pressed')!==String(touring))this.tourButton.setAttribute('aria-pressed',String(touring));this.tourHint.hidden=!touring||this.ui.modalRoot.children.length>0;
    this.followButton.hidden=!touring||this.ui.view.following;
    const message=this.ui.view.tourDestination?(this.ui.view.route.length?'בדרך! אפשר לגעת ברחוב ולשנות יעד':'הגענו! בחרו יעד נוסף בעיר'):'נוגעים ברחוב כדי לבחור לאן ללכת';if(this.tourText.textContent!==message)this.tourText.textContent=message;
    if(this.mapPanel.hidden)return;
    const state=this.engine.state,signature=JSON.stringify([state.world.size,state.buildings.map(b=>[b.id,b.typeId,b.x,b.z])]);
    if(signature!==this.mapSignature){this.mapSignature=signature;this.destinations.replaceChildren();const seen=new Set();for(const b of state.buildings){const type=this.ui.getBuilding(b.typeId);if(!type||type.isRoad||seen.has(b.typeId))continue;seen.add(b.typeId);this.destinations.append(button(`${type.icon} ${this.ui.label(type,'building')}`,'city-go-'+b.typeId,()=>{const [w,d]=type.footprint;this.goTo(b.x+(w-1)/2,b.z+(d-1)/2);}));}}
    this.drawMap();
  }
  drawMap(){
    const ctx=this.canvas.getContext('2d');if(!ctx)return;const {state,registry}=this.engine,size=state.world.size,s=240/size;ctx.fillStyle='#aac99c';ctx.fillRect(0,0,240,240);
    for(const road of [true,false])for(const b of state.buildings){const type=registry.buildings.get(b.typeId);if(!type||Boolean(type.isRoad)!==road)continue;const [w,d]=type.footprint;ctx.fillStyle=road?'#52666a':b.typeId==='cityHall'?'#f5d782':type.category==='sports'?'#76aec0':type.category==='learning'?'#b39ac9':'#f0e4ca';ctx.fillRect(b.x*s+.5,b.z*s+.5,w*s-1,d*s-1);}
    const corners=[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>{const r=this.ui.view.canvas.getBoundingClientRect();return this.ui.view.groundAt(r.left+x*r.width,r.top+y*r.height);}).filter(Boolean);
    if(corners.length===4){ctx.beginPath();corners.forEach((p,i)=>{const x=(p.x+(size-1)/2+.5)*s,z=(p.z+(size-1)/2+.5)*s;i?ctx.lineTo(x,z):ctx.moveTo(x,z);});ctx.closePath();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}
    const p=this.ui.view.avatar?.holder.position;if(p){ctx.beginPath();ctx.arc((p.x+size/2)*s,(p.z+size/2)*s,4,0,Math.PI*2);ctx.fillStyle='#cf6956';ctx.fill();}
    if(this.mapCursor){ctx.strokeStyle='#183f44';ctx.strokeRect(this.mapCursor.x*s-4,this.mapCursor.z*s-4,8,8);}
  }
  dispose(){clearInterval(this.timer);this.unsubscribe?.();this.events.abort();for(const n of [this.bar,this.controls,this.mapPanel,this.tourHint,this.rotateButton,this.cameraHelp])n.remove();}
}
