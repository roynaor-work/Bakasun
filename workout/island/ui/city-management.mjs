import {CITY_DEPARTMENTS,CITY_ZONES} from '../engine/city-management.mjs?v=island-c2-20261025-1';

const node=(tag,className='',text='')=>{const item=document.createElement(tag);item.className=className;item.textContent=text;return item;};
const button=(text,action,handler,className='secondary-button')=>{const item=node('button',className,text);item.type='button';item.dataset.action=action;item.onclick=handler;return item;};
const amount=value=>Number(value.toFixed(1)).toLocaleString('he-IL');
const serviceTypes={water:'waterTower',health:'hospital',education:'school',safety:'fireStation'};

/** City decisions use engine commands; the dashboard never edits a saved object. */
export class CityManagementInterface{
  constructor(ui){
    this.ui=ui;this.engine=ui.engine;this.t=ui.t;
    this.legend=node('aside','city-map-legend panel');this.legend.hidden=true;ui.root.append(this.legend);
    this.overlayUnsubscribe=this.engine.subscribe(()=>{if(this.overlay)this.updateOverlay();});
  }
  addEntry(parent){parent.append(button(this.t('city.open'),'city-management',()=>this.open(),'primary-button city-management-entry'));}
  open(tab='overview'){
    const {ui,engine,t}=this;ui.cancelPlacement();ui.closeInfo();
    const modal=ui.openModal('city.title','city.subtitle');modal.classList.add('city-management-modal');
    const navigation=node('nav','city-tabs');navigation.setAttribute('aria-label',t('city.open'));
    const pages={};
    for(const id of ['overview','budget','zones']){
      const control=button(t(`city.${id}`),`city-tab-${id}`,()=>select(id),'city-tab');
      control.setAttribute('aria-controls',`city-page-${id}`);navigation.append(control);
      const page=node('section','city-page');page.id=`city-page-${id}`;page.setAttribute('aria-label',t(`city.${id}`));pages[id]=page;
    }
    const select=id=>{tab=id;for(const [key,page]of Object.entries(pages))page.hidden=key!==id;for(const control of navigation.children)control.setAttribute('aria-pressed',String(control.dataset.action===`city-tab-${id}`));};
    const mode=node('div','city-mode'),modeText=node('strong'),toggle=button('', 'city-toggle-management',()=>engine.setCityPolicy({enabled:!engine.state.cityManagement.enabled}),'primary-button');
    mode.append(modeText,toggle);modal.append(mode,node('p','city-explanation',t('city.explanation')),navigation,...Object.values(pages));
    const stats=node('div','city-summary'),statValues={};
    for(const id of ['residents','jobs','balance']){const card=node('div','city-stat'),value=node('strong');card.append(node('span','',t(`city.${id}`)),value);stats.append(card);statValues[id]=value;}
    const demand=node('div','city-demand'),demandValues={};demand.append(node('h3','',t('city.demand')));
    for(const id of CITY_ZONES){
      const row=node('div','city-demand-row'),label=node('span','',t(`city.${id}`)),meter=node('meter'),value=node('b');
      meter.min=0;meter.max=100;meter.setAttribute('aria-label',t(`city.${id}`));meter.style.setProperty('--zone-color',ui.data.config.cityManagement.zones[id].color);row.append(label,meter,value);demand.append(row);demandValues[id]={meter,value};
    }
    demand.append(node('p','city-hint',t('city.demandHint')));
    const advice=node('div','city-advice');advice.append(node('h3','',t('city.advice')));const adviceText=node('p');advice.append(adviceText);
    const services=node('div','city-services'),serviceValues={};
    for(const id of CITY_DEPARTMENTS){
      const card=node('article','city-service'),heading=node('h4','',t(`city.${id}`)),value=node('b'),meter=node('meter'),description=node('span','city-service-amount');
      meter.min=0;meter.max=100;meter.setAttribute('aria-label',t(`city.${id}`));
      const actions=node('div','city-service-actions');
      actions.append(button(t('city.showCoverage'),`city-map-${id}`,()=>{ui.closeModal();this.showOverlay(id);}),button(t('city.buildService'),`city-build-${id}`,()=>{ui.closeModal();ui.openBuildingCatalog(serviceTypes[id]);}));
      card.append(heading,value,meter,description,actions);services.append(card);serviceValues[id]={value,meter,description};
    }
    pages.overview.append(stats,advice,demand,node('h3','',t('city.coverage')),services);

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
      const report=engine.cityReport(),policy=engine.state.cityManagement;
      modeText.textContent=t(policy.enabled?'city.active':'city.inactive');mode.dataset.enabled=String(policy.enabled);
      toggle.textContent=t(policy.enabled?'city.pause':policy.developed?'city.resume':'city.start');toggle.setAttribute('aria-pressed',String(policy.enabled));
      statValues.residents.textContent=report.residents;statValues.jobs.textContent=report.jobs;statValues.balance.textContent=`${report.budget.net>=0?'+':''}${amount(report.budget.net)}`;statValues.balance.dataset.negative=String(report.budget.net<0);
      for(const id of CITY_ZONES){demandValues[id].meter.value=report.demand[id];demandValues[id].value.textContent=`${report.demand[id]}%`;}
      let adviceId='grow';if(!policy.enabled)adviceId='start';else if(report.disconnected.length)adviceId='roads';else if(report.residents>=8&&report.services.water.coverage<80)adviceId='water';else if(report.residents>=8&&report.jobs<report.residents*.45)adviceId='jobs';
      const missing=CITY_DEPARTMENTS.find(id=>report.services[id].coverage<70);
      if(adviceId==='grow'&&report.residents>=8&&missing)adviceId='service';
      adviceText.textContent=t(`city.advice.${adviceId}`,{department:missing?t(`city.${missing}`):''});
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
    const unsubscribe=engine.subscribe(update);ui.modalCleanup=unsubscribe;select(tab);update();
  }
  showOverlay(id){
    this.overlay=id;this.legend.hidden=false;this.legend.replaceChildren(node('span','',this.t('city.mapLegend',{department:this.t(`city.${id}`)})),button('×','city-close-map',()=>this.hideOverlay(),'round-button'));
    this.legend.querySelector('button').setAttribute('aria-label',this.t('city.closeMap'));this.updateOverlay();
  }
  updateOverlay(){this.ui.view.setCityOverlay?.(this.overlay,this.engine.cityReport());}
  hideOverlay(){this.overlay=null;this.legend.hidden=true;this.ui.view.setCityOverlay?.(null);}
  dispose(){this.overlayUnsubscribe?.();this.hideOverlay();this.legend.remove();}
}
