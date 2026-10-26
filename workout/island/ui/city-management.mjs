import {CITY_DEPARTMENTS,CITY_ZONES} from '../engine/city-management.mjs?v=island-ready-plots-20261026-1';
import {cityBlueprint,citySitesSignature} from '../engine/city-sites.mjs?v=island-ready-plots-20261026-1';

const node=(tag,className='',text='')=>{const item=document.createElement(tag);item.className=className;item.textContent=text;return item;};
const button=(text,action,handler,className='secondary-button')=>{const item=node('button',className,text);item.type='button';item.dataset.action=action;item.onclick=handler;return item;};
const amount=value=>Number(value.toFixed(1)).toLocaleString('he-IL');
const serviceTypes={water:'waterTower',health:'hospital',education:'school',safety:'fireStation'};

/** City decisions use engine commands; the dashboard never edits a saved object. */
export class CityManagementInterface{
  constructor(ui){
    this.ui=ui;this.engine=ui.engine;this.t=ui.t;
    this.legend=node('aside','city-map-legend panel');this.legend.hidden=true;ui.root.append(this.legend);
    this.pulse=button('','city-command',()=>this.open('blueprint'),'city-command-button');
    this.pulse.append(node('span','city-command-icon','🏙'),node('strong','',this.t('city.open')));this.pulseBalance=node('span','city-command-balance');this.pulseBars=node('span','city-command-bars');
    for(const id of CITY_ZONES){const bar=node('i');bar.style.setProperty('--zone-color',ui.data.config.cityManagement.zones[id].color);this.pulseBars.append(bar);}
    this.pulse.append(this.pulseBalance,this.pulseBars);ui.root.append(this.pulse);
    this.growthNotice=node('aside','city-growth-notice panel');this.growthNotice.hidden=true;this.growthNotice.setAttribute('role','status');this.growthNotice.setAttribute('aria-live','polite');ui.root.append(this.growthNotice);
    this.overlayUnsubscribe=this.engine.subscribe(()=>{if(this.overlay)this.updateOverlay();this.updatePulse();});this.updatePulse();
  }
  addEntry(parent){parent.append(button(this.t('city.open'),'city-management',()=>this.open('blueprint'),'primary-button city-management-entry'));}
  open(tab='overview'){
    const {ui,engine,t}=this;ui.cancelPlacement();ui.closeInfo();
    const modal=ui.openModal('city.title','city.subtitle',{blocking:false});modal.classList.add('city-management-modal');modal.parentElement.classList.add('city-planning-overlay');ui.root.dataset.cityPlanning='true';this.panel=modal;
    const tools=node('div','city-panel-tools');
    const center=button('⌂','city-center',()=>ui.view.home(),'round-button');center.setAttribute('aria-label',t('city.center'));
    const collapse=button('⌄','city-collapse',()=>{const collapsed=modal.dataset.collapsed!=='true';modal.dataset.collapsed=String(collapsed);collapse.textContent=collapsed?'⌃':'⌄';collapse.setAttribute('aria-expanded',String(!collapsed));collapse.setAttribute('aria-label',t(collapsed?'city.expand':'city.collapse'));},'round-button');collapse.setAttribute('aria-label',t('city.collapse'));collapse.setAttribute('aria-expanded','true');tools.append(center,collapse);
    const mini=node('div','city-mini-status');modal.append(tools,mini);
    const navigation=node('nav','city-tabs');navigation.setAttribute('aria-label',t('city.open'));
    const pages={};
    for(const id of ['blueprint','overview','budget','zones']){
      const control=button(t(`city.${id}`),`city-tab-${id}`,()=>select(id),'city-tab');
      control.setAttribute('aria-controls',`city-page-${id}`);navigation.append(control);
      const page=node('section','city-page');page.id=`city-page-${id}`;page.setAttribute('aria-label',t(`city.${id}`));pages[id]=page;
    }
    const select=id=>{tab=id;this.activeTab=id;for(const [key,page]of Object.entries(pages))page.hidden=key!==id;for(const control of navigation.children)control.setAttribute('aria-pressed',String(control.dataset.action===`city-tab-${id}`));if(id==='blueprint')updateBlueprint();else ui.view.setCitySites?.([]);};
    const mode=node('div','city-mode'),modeText=node('strong'),toggle=button('', 'city-toggle-management',()=>engine.setCityPolicy({enabled:!engine.state.cityManagement.enabled}),'primary-button');
    const instructions=node('details','city-instructions');instructions.append(node('summary','',t('city.instructions')),node('p','city-explanation',t('city.explanation')));
    mode.append(modeText,toggle);modal.append(mode,instructions,navigation,...Object.values(pages));
    const stats=node('div','city-summary'),statValues={};
    for(const id of ['residents','jobs','balance']){const card=node('div','city-stat'),value=node('strong');card.append(node('span','',t(`city.${id}`)),value);stats.append(card);statValues[id]=value;}
    const demand=node('div','city-demand'),demandValues={};demand.append(node('h3','',t('city.demand')));
    for(const id of CITY_ZONES){
      const row=node('div','city-demand-row'),label=node('span','',t(`city.${id}`)),meter=node('meter'),value=node('b');
      meter.min=0;meter.max=100;meter.setAttribute('aria-label',t(`city.${id}`));meter.style.setProperty('--zone-color',ui.data.config.cityManagement.zones[id].color);row.append(label,meter,value);demand.append(row);demandValues[id]={meter,value};
    }
    demand.append(node('p','city-hint',t('city.demandHint')));
    const advice=node('div','city-advice');advice.append(node('h3','',t('city.advice')));const adviceText=node('p'),adviceAction=button('','city-advice-action',()=>{},'secondary-button');advice.append(adviceText,adviceAction);
    const services=node('div','city-services'),serviceValues={};
    for(const id of CITY_DEPARTMENTS){
      const card=node('article','city-service'),heading=node('h4','',t(`city.${id}`)),value=node('b'),meter=node('meter'),description=node('span','city-service-amount');
      meter.min=0;meter.max=100;meter.setAttribute('aria-label',t(`city.${id}`));
      const actions=node('div','city-service-actions');
      const map=button(t('city.mapShort'),`city-map-${id}`,()=>{ui.closeModal();this.showOverlay(id);}),build=button(t('city.buildShort'),`city-build-${id}`,()=>{ui.closeModal();ui.openBuildingCatalog(serviceTypes[id]);});map.setAttribute('aria-label',`${t('city.showCoverage')} · ${t(`city.${id}`)}`);build.setAttribute('aria-label',`${t('city.buildService')} · ${t(`city.${id}`)}`);actions.append(map,build);
      card.append(heading,value,meter,description,actions);services.append(card);serviceValues[id]={value,meter,description};
    }
    pages.overview.append(stats,advice,demand,node('h3','',t('city.coverage')),services);
    const blueprintIntro=node('div','city-blueprint-intro');blueprintIntro.append(node('strong','',t('city.blueprintTitle')),node('p','city-hint',t(ui.readyPlots?.active?'ready.listHint':'city.blueprintHint')));
    const blueprintList=node('div','city-blueprint-list');pages.blueprint.append(blueprintIntro,blueprintList);
    let blueprintSignature;
    const updateBlueprint=()=>{
      const prepared=ui.readyPlots?.active,readyRows=prepared?engine.readyPlots():null,signature=prepared?JSON.stringify(readyRows):citySitesSignature(engine.state);
      if(signature!==blueprintSignature){
        blueprintSignature=signature;this.blueprint=prepared?readyRows:cityBlueprint(engine.state,engine.registry,ui.data.featureFlags);blueprintList.replaceChildren();
        for(const site of this.blueprint){
          const type=engine.registry.buildings.get(site.typeId),control=button('',`city-site-${site.number}`,()=>this.chooseSite(site),'city-blueprint-site');control.style.setProperty('--site-color',site.color);
          const badge=node('b','city-site-number',String(site.number)),details=node('span','city-site-details');details.append(node('strong','',`${type.icon} ${ui.label(type,'building')}`),node('small','',prepared?ui.readyPlots.reason(site):t(site.reason)));
          control.append(badge,details,node('span','city-site-cost',`● ${type.cost}`));blueprintList.append(control);
        }
        if(!this.blueprint.length)blueprintList.append(node('p','city-hint',t('city.noSites')));
      }
      if(tab==='blueprint')ui.view.setCitySites?.(prepared?[]:this.blueprint);
    };

    const ledger=node('dl','city-ledger'),ledgerValues={};
    for(const id of ['existingIncome','taxIncome','expenses','net']){const value=node('dd');ledger.append(node('dt','',t(`city.${id}`)),value);ledgerValues[id]=value;}
    const taxes=node('fieldset','city-policy');taxes.append(node('legend','',t('city.taxRate')));const taxButtons=[];
    for(const rate of ui.data.config.cityManagement.taxRates){const control=button(`${rate}%`,`city-tax-${rate}`,()=>engine.setCityPolicy({taxRate:rate}));taxButtons.push(control);taxes.append(control);}
    const funding=node('div','city-funding'),fundingButtons={};
    for(const id of CITY_DEPARTMENTS){
      const group=node('fieldset','city-policy');group.append(node('legend','',t('city.funding',{department:t(`city.${id}`)})));fundingButtons[id]=[];
      for(const level of ui.data.config.cityManagement.fundingLevels){const control=button(`${level}%`,`city-funding-${id}-${level}`,()=>engine.setCityPolicy({funding:{[id]:level}}));fundingButtons[id].push(control);group.append(control);}
      funding.append(group);
    }
    const shortage=node('p','city-shortage',t('city.underfunded'));
    pages.budget.append(node('p','city-hint',t('city.ledgerHint')),ledger,taxes,node('p','city-hint',t('city.taxHint')),funding,node('p','city-hint',t('city.fundingHint')),shortage);

    const kinds=node('div','city-zone-types');
    for(const id of CITY_ZONES){
      const definition=ui.data.config.cityManagement.zones[id],type=engine.registry.buildings.get(definition.typeId);
      const control=button('',`city-plan-${id}`,()=>{ui.closeModal();ui.startZone(id);},'city-zone-type');control.style.setProperty('--zone-color',definition.color);
      control.append(node('strong','',`${type.icon} ${t(`city.${id}`)}`),node('span','',t('city.zoneCost',{cost:type.cost})),node('b','',t('city.plan')));kinds.append(control);
    }
    const countdown=node('p','city-growth-clock'),queue=node('div','city-zone-queue'),queueHeading=node('h3','',t('city.queue'));
    pages.zones.append(kinds,node('p','city-hint',t('city.zoneHint')),countdown,queueHeading,queue,node('p','city-hint',t('city.removeZoneHint')));
    let queueSignature;
    const update=()=>{
      if(tab==='blueprint')updateBlueprint();
      const report=engine.cityReport(),policy=engine.state.cityManagement;
      mini.textContent=`${report.residents} ${t('city.residents')} · ${t('city.perMinute',{amount:amount(report.budget.net)})}`;
      modeText.textContent=t(policy.enabled?'city.active':'city.inactive');mode.dataset.enabled=String(policy.enabled);
      toggle.textContent=t(policy.enabled?'city.pause':policy.developed?'city.resume':'city.start');toggle.setAttribute('aria-pressed',String(policy.enabled));
      statValues.residents.textContent=report.residents;statValues.jobs.textContent=report.jobs;statValues.balance.textContent=`${report.budget.net>=0?'+':''}${amount(report.budget.net)}`;statValues.balance.dataset.negative=String(report.budget.net<0);
      for(const id of CITY_ZONES){demandValues[id].meter.value=report.demand[id];demandValues[id].value.textContent=`${report.demand[id]}%`;}
      const cfg=ui.data.config.cityManagement;
      let adviceId='grow';if(!policy.enabled)adviceId='start';else if(report.disconnected.length)adviceId='roads';else if(report.residents>=cfg.bootstrapResidents&&report.services.water.coverage<80)adviceId='water';else if(report.residents>=cfg.bootstrapResidents&&report.jobs<report.residents*cfg.jobsPerResident)adviceId='jobs';
      const missing=CITY_DEPARTMENTS.find(id=>report.services[id].coverage<70);
      if(adviceId==='grow'&&report.residents>=8&&missing)adviceId='service';
      adviceText.textContent=t(`city.advice.${adviceId}`,{department:missing?t(`city.${missing}`):''});
      const department=adviceId==='water'?'water':missing;
      adviceAction.textContent=t(adviceId==='start'?'city.start':adviceId==='roads'?'city.action.roads':adviceId==='jobs'?'city.action.jobs':adviceId==='grow'?'city.action.plan':'city.action.coverage',{department:department?t(`city.${department}`):''});
      adviceAction.onclick=()=>{if(adviceId==='start')engine.setCityPolicy({enabled:true});else if(adviceId==='grow')select('zones');else{ui.closeModal();if(adviceId==='roads')ui.selectBuilding('road');else if(adviceId==='jobs')ui.startZone('commercial');else this.showOverlay(department);}};
      for(const id of CITY_DEPARTMENTS){const service=report.services[id],target=serviceValues[id];target.value.textContent=`${service.coverage}%`;target.meter.value=service.coverage;target.description.textContent=`${t('city.coverageAmount',{covered:amount(service.covered),total:service.total})} · ${t('city.capacity',{capacity:amount(service.capacity)})}`;}
      ledgerValues.existingIncome.textContent=amount(report.budget.income-report.budget.taxes);ledgerValues.taxIncome.textContent=`+${amount(report.budget.taxes)}`;ledgerValues.expenses.textContent=`−${amount(report.budget.expenses)}`;ledgerValues.net.textContent=amount(report.budget.net);
      for(const [index,control]of taxButtons.entries())control.setAttribute('aria-pressed',String(policy.taxRate===ui.data.config.cityManagement.taxRates[index]));
      for(const id of CITY_DEPARTMENTS)for(const [index,control]of fundingButtons[id].entries())control.setAttribute('aria-pressed',String(policy.funding[id]===ui.data.config.cityManagement.fundingLevels[index]));
      shortage.hidden=!policy.enabled||policy.operatingRatio>=.999;
      countdown.textContent=t(policy.enabled?'city.nextGrowth':'city.reason.paused',{seconds:report.growthIn});
      const signature=JSON.stringify(report.zones);if(signature!==queueSignature){
        queueSignature=signature;queue.replaceChildren();
        if(!report.zones.length)queue.append(node('p','city-hint',t('city.noZones')));
        for(const zone of report.zones){
          const row=node('article','city-zone-row');row.dataset.status=zone.status;
          const details=node('div'),label=node('strong','',t('city.zoneLocation',{kind:t(`city.${zone.kind}`),x:zone.x,z:zone.z})),status=node('span','',t(zone.status==='developed'?'city.developed':zone.status==='occupied'?'city.occupied':zone.reason));
          details.append(label,status);row.append(details,button(t('city.viewZone'),`city-view-${zone.id}`,()=>{ui.closeModal();ui.view.focusCell(zone.x,zone.z);}),button(t('city.removeZone'),`city-remove-${zone.id}`,()=>engine.removeZone(zone.id)));queue.append(row);
        }
      }
    };
    const unsubscribe=engine.subscribe(update),resize=new ResizeObserver(()=>this.updateViewport());resize.observe(modal);
    ui.modalCleanup=()=>{unsubscribe();resize.disconnect();this.panel=null;this.activeTab=null;this.blueprint=[];ui.view.setCitySites?.([]);delete ui.root.dataset.cityPlanning;ui.view.setPlanningViewport?.(null);};select(tab);update();this.updateViewport();
  }
  chooseSite(site){this.ui.closeModal();if(this.ui.readyPlots?.active){this.ui.readyPlots.show(site.id);return;}this.ui.selectBuilding(site.typeId);this.ui.updateGhost(site,false);this.ui.view.focusCell(site.x,site.z);}
  selectSiteAt(cell){const site=this.panel&&this.activeTab==='blueprint'&&this.blueprint?.find(row=>cell.x>=row.x&&cell.x<row.x+row.w&&cell.z>=row.z&&cell.z<row.z+row.d);if(!site)return false;this.chooseSite(site);return true;}
  updateViewport(){
    if(!this.panel)return;const rect=this.panel.getBoundingClientRect(),canvas=this.ui.view.canvas.getBoundingClientRect(),portrait=canvas.width<=600&&canvas.height>500;
    this.ui.view.setPlanningViewport?.(portrait?{left:0,right:0,top:0,bottom:Math.ceil(canvas.bottom-rect.top+8)}:{left:0,right:this.panel.dataset.collapsed==='true'?0:Math.ceil(canvas.right-rect.left+8),top:0,bottom:0});
  }
  updatePulse(){
    const report=this.engine.cityReport({includeZones:false});this.pulseBalance.textContent=`${report.budget.net>=0?'+':''}${amount(report.budget.net)}`;this.pulseBalance.dataset.negative=String(report.budget.net<0);
    for(const [index,bar]of [...this.pulseBars.children].entries())bar.style.height=`${Math.max(3,report.demand[CITY_ZONES[index]]*.22)}px`;
    this.pulse.setAttribute('aria-label',`${this.t('city.open')} · ${this.t('city.perMinute',{amount:amount(report.budget.net)})}`);
  }
  onGrowth(developed){
    const buildings=developed.map(row=>this.engine.state.buildings.find(b=>b.id===row.buildingId)).filter(Boolean);if(!buildings.length)return;
    this.ui.view.highlightCityBuildings?.(buildings.map(row=>row.id));
    const names=[...new Set(buildings.map(row=>this.t(`building.${row.typeId}`)))].join(' · '),residents=buildings.reduce((sum,row)=>sum+(this.engine.registry.buildings.get(row.typeId).levels[0].population||0),0);
    this.growthNotice.replaceChildren(node('strong','',this.t(buildings.length===1?'city.growthTitleOne':'city.growthTitle',{count:buildings.length})),node('span','',`${names}${residents?' · '+this.t('city.growthResidents',{count:residents}):''}`),button(this.t('city.viewGrowth'),'city-view-growth',()=>{const row=buildings.at(-1);this.ui.view.focusCell(row.x,row.z);}));this.growthNotice.hidden=false;
    clearTimeout(this.noticeTimer);this.noticeTimer=setTimeout(()=>{this.growthNotice.hidden=true;},7000);
  }
  showOverlay(id){
    this.overlay=id;this.legend.hidden=false;this.legend.replaceChildren(node('span','',this.t('city.mapLegend',{department:this.t(`city.${id}`)})),button('×','city-close-map',()=>this.hideOverlay(),'round-button'));
    this.legend.querySelector('button').setAttribute('aria-label',this.t('city.closeMap'));this.updateOverlay();
  }
  updateOverlay(){this.ui.view.setCityOverlay?.(this.overlay,this.engine.cityReport({includeZones:false}));}
  hideOverlay(){this.overlay=null;this.legend.hidden=true;this.ui.view.setCityOverlay?.(null);}
  dispose(){if(this.panel)this.ui.closeModal();clearTimeout(this.noticeTimer);this.overlayUnsubscribe?.();this.hideOverlay();this.legend.remove();this.pulse.remove();this.growthNotice.remove();}
}
