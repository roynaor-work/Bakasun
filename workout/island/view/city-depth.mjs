import * as T from '../vendor/three.module.js';
import {GROUND} from './environment.mjs?v=island-alpine-20261027-1';

/** Geometry only: the report supplies every status, assignment and radius. */
export class CityDepthView {
  constructor(view) {this.view = view; this.root = new T.Group(); this.root.name = 'city-markers'; view.scene.add(this.root); this.icons = new Map();}
  clear() {
    this.root.traverse(o => {if (o.userData.ownedGeometry) o.geometry?.dispose(); if (o.userData.ownedMaterial) o.material?.dispose();});
    this.root.clear();
  }
  icon(kind, value) {
    const key = `${kind}:${value}`;
    if (!this.icons.has(key)) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
      const c = canvas.getContext('2d');
      c.fillStyle = '#fff8e6'; c.strokeStyle = '#294e54'; c.lineWidth = 4; c.beginPath(); c.arc(48,48,43,0,Math.PI*2); c.fill(); c.stroke();
      if (kind === 'water') {
        c.fillStyle = value === 'capacity' ? '#d58b27' : '#3298b8'; c.beginPath(); c.moveTo(43,17); c.bezierCurveTo(32,36,22,42,22,55); c.bezierCurveTo(22,82,64,82,64,55); c.bezierCurveTo(64,42,53,32,43,17); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 7; c.beginPath(); c.moveTo(28,69); c.lineTo(58,40); c.stroke();
        c.fillStyle = '#294e54'; c.font = 'bold 25px sans-serif'; c.textAlign = 'center'; c.fillText(value === 'capacity' ? '!' : '↔',75,37);
      } else {
        c.fillStyle = '#286c51'; c.font = 'bold 58px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(value),48,49);
      }
      const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace;
      this.icons.set(key, new T.SpriteMaterial({map, depthTest:false, depthWrite:false, toneMapped:false}));
    }
    const sprite = new T.Sprite(this.icons.get(key)); sprite.scale.set(.85,.85,1); sprite.renderOrder = 10; return sprite;
  }
  mesh(geometry, color, opacity = 1) {
    const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({color, side:T.DoubleSide, transparent:opacity < 1, opacity, depthWrite:false}));
    mesh.userData.ownedGeometry = mesh.userData.ownedMaterial = true; return mesh;
  }
  height(item) {
    if (item.cityHeight == null) {item.group.updateWorldMatrix(true,true); item.cityHeight = new T.Box3().setFromObject(item.group).max.y - item.group.position.y;}
    return item.cityHeight;
  }
  update(report, selectedId) {
    if (!report || !this.view.state) return;
    const {view} = this, world = view.state.buildings;
    const signature = JSON.stringify([selectedId, view.size, world.map(b => [b.id,b.x,b.z,view.groups.get(b.id)?.group.uuid]), report.buildings.map(b => [b.id,b.status,b.water?.reason,b.production?.tier,b.service]), report.port.slots.filter(s => s.state === 'offered').map(s => s.harborId)]);
    if (signature === this.signature) return; this.signature = signature; this.clear();
    for (const row of report.buildings) {
      const item = view.groups.get(row.id), building = world.find(b => b.id === row.id);
      if (!item || !building) continue;
      const record = view.definition(building.typeId), position = view.worldPosition(building.x,building.z,record.footprint);
      this.height(item);
      if (row.status === 'damaged' && !item.repairMarker) {
        const style = view.data.config.events.repairMarker;
        item.repairMarker = this.mesh(new T.ConeGeometry(style.radius,style.height,style.sides),style.color);
        item.repairMarker.position.y = item.cityHeight + style.offset; item.repairMarker.rotation.z = Math.PI; item.group.add(item.repairMarker);
      }
      if (item.repairMarker) item.repairMarker.visible = row.status === 'damaged';
      // Routine helper badges belong to the selected building's inspection;
      // unselected homes and industry keep the city free of floating signs.
      if (row.id === selectedId && row.status === 'unserved') {
        const marker = this.icon('water',row.water.reason); marker.position.copy(position); marker.position.y += item.cityHeight + .65;
        marker.userData = {cityKind:'water', buildingId:row.id, reason:row.water.reason}; this.root.add(marker);
      }
      if (row.id === selectedId && row.production) {
        const marker = this.icon('production',row.production.tier); marker.position.copy(position); marker.position.y += item.cityHeight + .65;
        marker.position.x += .85; marker.scale.set(.65,.65,1);
        marker.userData = {cityKind:'production', buildingId:row.id, tier:row.production.tier}; this.root.add(marker);
      }
      if (row.id === selectedId && row.service) {
        view.showRadius({...record,radius:row.service.radius},building);
        for (const id of row.service.serves) {
          const target = world.find(b => b.id === id); if (!target) continue;
          const footprint = view.definition(target.typeId).footprint;
          const highlight = new T.Group(); highlight.userData = {cityKind:'served', buildingId:id};
          const ring = this.mesh(new T.RingGeometry(Math.max(...footprint) * .62,Math.max(...footprint) * .62 + .12,48),'#36d9d0',.95);
          ring.rotation.x = -Math.PI/2; ring.position.copy(view.worldPosition(target.x,target.z,footprint)); ring.position.y = GROUND + .07;
          highlight.add(ring);
          const height=this.height(view.groups.get(id)), box=new T.BoxGeometry(footprint[0]+.12,height+.12,footprint[1]+.12);
          const outline=new T.LineSegments(new T.EdgesGeometry(box),new T.LineBasicMaterial({color:'#36fff0',transparent:true,opacity:.9,depthTest:false,depthWrite:false,toneMapped:false}));box.dispose();
          outline.position.copy(view.worldPosition(target.x,target.z,footprint));outline.position.y+=height/2;outline.renderOrder=8;outline.userData.ownedGeometry=outline.userData.ownedMaterial=true;highlight.add(outline);
          this.root.add(highlight);
        }
      }
    }
    const selected = report.buildings.find(row => row.id === selectedId);
    if (!selected?.service && view.cityRadius) {view.showRadius(null); view.cityRadius = false;}
    if (selected?.service) view.cityRadius = true;
    for (const id of new Set(report.port.slots.filter(slot => slot.state === 'offered').map(slot => slot.harborId))) {
      const building = world.find(b => b.id === id); if (!building) continue;
      const footprint = view.definition(building.typeId).footprint, position = view.worldPosition(building.x,building.z,footprint);
      const crate = new T.Group(); crate.userData = {cityKind:'port', buildingId:id};
      crate.position.copy(position); crate.position.x += footprint[0]/2 + .2; crate.position.y += .3;
      crate.add(this.mesh(new T.BoxGeometry(.6,.6,.6),'#c38b4a'));
      for (const z of [-.307,.307]) {const brace = this.mesh(new T.BoxGeometry(.64,.09,.035),'#75502c'); brace.position.z = z; brace.rotation.z = Math.PI/4; crate.add(brace);}
      this.root.add(crate);
    }
  }
  dispose() {this.clear(); this.root.removeFromParent(); for (const material of this.icons.values()) {material.map.dispose(); material.dispose();} this.icons.clear();}
}
