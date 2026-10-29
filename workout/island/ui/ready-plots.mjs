import {airportSpaceReason} from '../engine/ready-plots.mjs?v=island-soccer-athlete-20261029-1';
const node=(tag,className='',text='')=>{const item=document.createElement(tag);item.className=className;item.textContent=text;return item;};
const button=(text,action,handler,className='secondary-button')=>{const item=node('button',className,text);item.type='button';item.dataset.action=action;item.onclick=handler;return item;};
export const plotCanBuild=row=>Boolean(row&&(row.ok===true||row.status==='available'||row.status==='ready'));
export const readyPlotsActive=engine=>Boolean(engine.state.readyPlan&&typeof engine.readyPlots==='function'&&typeof engine.buildReadyPlot==='function');

/** The engine owns the permanent plan and all charges. This controller only
 * selects its saved lots and asks for one explicit build confirmation. */
export class ReadyPlotsInterface{
  constructor(ui){this.ui=ui;this.rows=[];this.active=false;}
  addEntry(parent){this.entry=button(this.ui.t('ready.open'),'ready-plots',()=>this.openList(),'ready-plots-entry');this.entry.hidden=true;parent.append(this.entry);}
  refresh(){
    const {ui}=this;this.active=ui.data.featureFlags?.readyPlots!==false&&readyPlotsActive(ui.engine);
    this.rows=this.active?ui.engine.readyPlots():[];
    if(this.entry){this.entry.hidden=!this.active;this.entry.setAttribute('aria-label',ui.t('ready.listCount',{count:this.rows.length}));}
    ui.view.setReadyPlots?.(this.rows.map(row=>{const type=ui.getBuilding(row.typeId);return {...row,icon:type?.icon||'◇',label:ui.label(type,'building')};}));
    this.updateConfirmation?.();this.updateList?.();
  }
  reason(row){return this.ui.t(plotCanBuild(row)?'ready.available':row?.reason||`ready.${row?.status||'unavailable'}`);}
  focus(row){if(!row)return;this.focusedId=row.id;const view=this.ui.view;if(view.focusReadyPlot)view.focusReadyPlot(row);else view.focusCell?.(row.x+(row.w-1)/2,row.z+(row.d-1)/2);view.setReadyPlotSelection?.(row.id);}
  focusType(typeId){const row=this.ui.engine.readyPlotForType?.(typeId)||this.rows.find(row=>row.typeId===typeId);this.focus(row);return row;}
  chooseType(typeId){
    this.refresh();const row=this.ui.engine.readyPlotForType?.(typeId)||this.rows.find(row=>row.typeId===typeId);
    if(row){this.show(row.id);return true;}
    if(typeId==='airport'){const reason=airportSpaceReason(this.ui.engine.state,this.ui.engine.registry,this.ui.data.featureFlags);if(reason){this.ui.toast(reason);return true;}}
    if(typeId==='road'){this.openList();return true;}
    const built=this.ui.engine.state.buildings.find(row=>row.typeId===typeId);
    if(built){this.ui.showInfo(built.id);return true;}
    this.ui.toast('ready.noPlot');return true;
  }
  selectCell(cell){
    if(!this.active)return false;
    const row=cell.readyPlotId?this.rows.find(row=>row.id===cell.readyPlotId):this.rows.find(row=>cell.x>=row.x&&cell.x<row.x+row.w&&cell.z>=row.z&&cell.z<row.z+row.d);
    if(!row)return false;this.show(row.id);return true;
  }
  show(id){
    const {ui}=this;this.refresh();const row=this.rows.find(row=>row.id===id);if(!row)return;
    ui.cancelPlacement();ui.closeDetails();ui.closeInfo();ui.setDockOpen(false);
    const type=ui.getBuilding(row.typeId),modal=ui.openModal('ready.confirmTitle','ready.confirmHint',{blocking:false});
    modal.classList.add('ready-plot-modal');modal.parentElement.classList.add('ready-plot-overlay');
    const title=node('h3','ready-plot-name',`${type.icon} ${ui.label(type,'building')}`),detail=node('p','ready-plot-number',ui.t('ready.plotNumber',{number:row.number}));
    const price=node('strong','ready-plot-price'),status=node('p','ready-plot-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const actions=node('div','ready-plot-actions');let committed=false;
    const confirm=button('','ready-plot-build',()=>{
      if(committed)return;
      const current=ui.engine.readyPlots().find(row=>row.id===id);if(!plotCanBuild(current)){this.refresh();return;}
      committed=true;confirm.disabled=true;const result=ui.engine.buildReadyPlot(id);
      if(result.ok){ui.closeModal();this.refresh();if(result.id)ui.view.highlightCityBuildings?.([result.id]);}
      else{committed=false;ui.result(result);this.refresh();}
    },'primary-button');
    const cancel=button(ui.t('app.cancel'),'ready-plot-cancel',()=>ui.closeModal());actions.append(confirm,cancel);
    modal.append(title,detail,price,status,actions);
    this.updateConfirmation=()=>{
      const current=this.rows.find(row=>row.id===id),priceText=ui.t('ready.price',{cost:Number(type.cost||0).toLocaleString('he-IL')}),statusText=current?this.reason(current):ui.t('ready.occupied'),confirmText=ui.t('ready.confirm',{cost:Number(type.cost||0).toLocaleString('he-IL')});
      if(price.textContent!==priceText)price.textContent=priceText;if(status.textContent!==statusText)status.textContent=statusText;if(confirm.textContent!==confirmText)confirm.textContent=confirmText;
      confirm.disabled=committed||!plotCanBuild(current);modal.dataset.status=current?.status||'occupied';
    };
    ui.modalCleanup=()=>{this.updateConfirmation=null;if(this.focusedId===id){this.focusedId=null;ui.view.setReadyPlotSelection?.(null);}};this.updateConfirmation();this.focus(row);
  }
  openList(){
    const {ui}=this;this.refresh();ui.cancelPlacement();ui.closeInfo();ui.closeDetails();ui.setDockOpen(false);
    const modal=ui.openModal('ready.listTitle','ready.listHint',{blocking:false});modal.classList.add('ready-plots-list-modal');modal.parentElement.classList.add('ready-plot-overlay');
    const list=node('div','ready-plots-list');list.setAttribute('aria-label',ui.t('ready.listTitle'));modal.append(list);let signature;
    this.updateList=()=>{
      const next=JSON.stringify(this.rows);if(next===signature)return;signature=next;list.replaceChildren();
      for(const row of this.rows){const type=ui.getBuilding(row.typeId),control=button('',`ready-plot-${row.id}`,()=>this.show(row.id),'ready-plot-list-item');control.dataset.status=row.status;control.style.setProperty('--plot-color',row.color||'#6ba68b');
        control.append(node('b','ready-plot-list-number',String(row.number)),node('span','ready-plot-list-icon',type.icon),node('strong','',ui.label(type,'building')),node('small','',`${this.reason(row)} · ● ${Number(type.cost||0).toLocaleString('he-IL')}`));list.append(control);
      }
      if(!this.rows.length)list.append(node('p','',ui.t('ready.noneVacant')));
    };
    ui.modalCleanup=()=>{this.updateList=null;};this.updateList();
  }
}
