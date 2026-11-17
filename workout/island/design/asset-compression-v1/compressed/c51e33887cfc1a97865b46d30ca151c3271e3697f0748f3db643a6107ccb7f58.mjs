import * as T from '../vendor/three.module.js';

/** Vacant lots stay visually silent. Only the current selection receives a
 * faint ground wash and hairline outline; names live in the building controls.
 * Every saved footprint remains clickable without a floating screen target. */
export class ReadyPlotsView{
  constructor(scene,ground){
    this.ground=ground;this.rows=[];this.selected=null;this.disposed=false;
    this.geometry=new T.PlaneGeometry(1,1);
    this.borderGeometry=new T.BufferGeometry().setFromPoints([[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0]].map(point=>new T.Vector3(...point)));
    this.fillMaterial=new T.MeshBasicMaterial({color:'#d8ceaa',transparent:true,opacity:.09,depthWrite:false,side:T.DoubleSide,toneMapped:false});
    this.borderMaterial=new T.LineBasicMaterial({color:'#c8b986',transparent:true,opacity:.48,depthWrite:false,toneMapped:false});
    this.fill=new T.Mesh(this.geometry,this.fillMaterial);this.border=new T.LineLoop(this.borderGeometry,this.borderMaterial);
    this.fill.name='ready-selection-wash';this.border.name='ready-selection-outline';
    for(const mark of [this.fill,this.border]){mark.visible=false;mark.rotation.x=-Math.PI/2;mark.renderOrder=2;scene.add(mark);}
  }
  resize(){}
  update(){}
  setSelection(id){if(this.disposed||id===this.selected)return;this.selected=id||null;this.showSelection();}
  show(rows=[],size=32){
    if(this.disposed)return;
    // Picking is independent of rendering capacity: no hidden lot becomes
    // impossible to select merely because an older town has more reservations.
    this.rows=rows.slice();this.size=size;this.showSelection();
  }
  showSelection(){
    const row=this.rows.find(lot=>lot.id===this.selected),visible=!!row;
    this.fill.visible=this.border.visible=visible;if(!visible)return;
    const offset=(this.size-1)/2,x=row.x+(row.w-1)/2-offset,z=row.z+(row.d-1)/2-offset;
    for(const [mark,lift]of [[this.fill,.044],[this.border,.048]]){mark.position.set(x,this.ground+lift,z);mark.scale.set(Math.max(.01,row.w-.16),Math.max(.01,row.d-.16),1);}
  }
  pick(){return null;}
  pickCell(cell){
    const row=cell&&this.rows.find(lot=>cell.x>=lot.x&&cell.x<lot.x+lot.w&&cell.z>=lot.z&&cell.z<lot.z+lot.d);
    return row?{x:row.x,z:row.z,readyPlotId:row.id}:null;
  }
  metrics(){return {plots:this.rows.length,labels:0,draws:this.fill.visible?2:0,selected:this.fill.visible?1:0,disposed:this.disposed};}
  dispose(){
    if(this.disposed)return;this.disposed=true;
    for(const mark of [this.fill,this.border]){mark.visible=false;mark.removeFromParent();}
    for(const resource of [this.geometry,this.borderGeometry,this.fillMaterial,this.borderMaterial])resource.dispose();
    this.rows=[];this.selected=null;
  }
}