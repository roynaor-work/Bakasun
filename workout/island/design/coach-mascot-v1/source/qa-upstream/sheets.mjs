// SPDX-License-Identifier: CC0-1.0
// Original diagnostic projection and sheet renderer, created for motion-qa-v1.
export const BONES = [
  ['Hips','Spine'],['Spine','Chest'],['Chest','UpperChest'],['UpperChest','Neck'],['Neck','Head'],
  ...['Left','Right'].flatMap(s => [[s+'Shoulder',s+'Arm'],[s+'Arm',s+'ForeArm'],[s+'ForeArm',s+'Hand'],['UpperChest',s+'Shoulder'],['Hips',s+'UpLeg'],[s+'UpLeg',s+'Leg'],[s+'Leg',s+'Foot'],[s+'Foot',s+'Toes']]),
];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finitePoint = p => Array.isArray(p) && p.length >= 3 && p.slice(0,3).every(Number.isFinite);
export function bonesFor(joints) {
  const bones = BONES.filter(([a,b])=>finitePoint(joints[a])&&finitePoint(joints[b]));
  const upper = finitePoint(joints.UpperChest)?'UpperChest':finitePoint(joints.Chest)?'Chest':finitePoint(joints.Spine)?'Spine':'Hips';
  if(!finitePoint(joints.UpperChest)&&finitePoint(joints.Neck)&&finitePoint(joints[upper]))bones.push([upper,'Neck']);
  for(const side of ['Left','Right']) {
    if(!finitePoint(joints[side+'Shoulder'])&&finitePoint(joints[side+'Arm'])&&finitePoint(joints[upper]))bones.push([upper,side+'Arm']);
    if(finitePoint(joints[side+'Shoulder'])&&upper!=='UpperChest')bones.push([upper,side+'Shoulder']);
  }
  return bones;
}
export function selectEight(frames) {
  if (!frames?.length) return [];
  const start=frames[0].t,end=frames.at(-1).t;
  if(!Number.isFinite(start)||!Number.isFinite(end))return Array.from({length:8}, (_,i) => frames[Math.round(i*(frames.length-1)/7)]);
  return Array.from({length:8}, (_,i) => {
    const target=start+(end-start)*i/7;
    return frames.reduce((nearest,frame)=>Math.abs(frame.t-target)<Math.abs(nearest.t-target)?frame:nearest);
  });
}

/** Eight sampled skeleton poses, in the measured world orientation, recentered per pose.
 * This deliberately labels itself as a diagnostic skeleton, never as a mesh render. */
export function sheetSvg(clip, suppliedFrames = clip.sheetFrames ?? clip.frames ?? []) {
  const frames = selectEight(suppliedFrames);
  const height = Number.isFinite(clip.height) && clip.height > 0 ? clip.height : 1.8;
  const width = 1280, panelWidth = 320, panelHeight = 310, top = 84;
  let horizontal=height*.35,up=height,down=height*.05;
  for(const frame of frames){
    const root=finitePoint(frame.root)?frame.root:finitePoint(frame.joints?.Hips)?frame.joints.Hips:[0,0,0];
    for(const p of [...Object.values(frame.joints??{}),frame.ball].filter(finitePoint)){
      const dx=p[0]-root[0],dz=p[2]-root[2];
      horizontal=Math.max(horizontal,Math.abs(dx*.86+dz*.50));
      const vertical=p[1]-dz*.21+dx*.12;
      up=Math.max(up,vertical);down=Math.max(down,-vertical);
    }
  }
  // One scale for all eight panels; keep jumps and wide extensions inside the image.
  const scale = Math.min(192/up,134/horizontal,21/down);
  const project = (p,root) => [160 + ((p[0]-root[0])*.86 + (p[2]-root[2])*.50)*scale,
    255 - p[1]*scale + ((p[2]-root[2])*.21 - (p[0]-root[0])*.12)*scale];
  const panels = frames.map((frame,index) => {
    const root = finitePoint(frame.root) ? frame.root : finitePoint(frame.joints?.Hips) ? frame.joints.Hips : [0,0,0];
    const joints = Object.fromEntries(Object.entries(frame.joints ?? {}).filter(([,p])=>finitePoint(p)));
    const projected = Object.fromEntries(Object.entries(joints).map(([k,p]) => [k,project(p,root)]));
    const bones = bonesFor(joints).map(([a,b])=>{
      const color = a.startsWith('Left') ? '#53c3e8' : a.startsWith('Right') ? '#bb9cf7' : '#dce6ee';
      return `<line x1="${projected[a][0].toFixed(2)}" y1="${projected[a][1].toFixed(2)}" x2="${projected[b][0].toFixed(2)}" y2="${projected[b][1].toFixed(2)}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
    }).join('');
    const dots = Object.entries(projected).map(([k,p])=>`<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="${k==='Head'?9:3.5}" fill="${joints[k][1]<-.005?'#ff7777':'#e9f0f7'}"/>`).join('');
    const ball = finitePoint(frame.ball) ? (()=>{const p=project(frame.ball,root);return `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="${Math.max(4,(clip.ballRadius??.12)*scale).toFixed(2)}" fill="#ffb66b" stroke="#ffcfa4" stroke-width="2"/>`;})() : '';
    return `<g transform="translate(${(index%4)*panelWidth} ${top+Math.floor(index/4)*panelHeight})"><rect x="8" y="8" width="304" height="294" rx="12" fill="#14212d" stroke="#354556"/><text x="24" y="34" font-size="15" fill="#dce6ee">${index+1} / 8 · ${Number(frame.t??0).toFixed(3)} s</text><path d="M28 255H292M160 238L202 268M118 268L160 238" stroke="#4b657a" stroke-width="1.5"/>${bones}${dots}${ball}<text x="24" y="286" font-size="12" fill="#9fb3c6">root x=${Number(root[0]).toFixed(2)} z=${Number(root[2]).toFixed(2)} m</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${top+panelHeight*2+38}" viewBox="0 0 ${width} ${top+panelHeight*2+38}" role="img" aria-labelledby="title desc"><title id="title">${escape(clip.id)} · eight diagnostic frames</title><desc id="desc">Eight evenly spaced sampled poses. Original skeleton diagram, not a character mesh. Cyan is left, purple is right, orange is ball, red is below floor. Root motion is recentered; numeric world position is retained.</desc><rect width="100%" height="100%" fill="#0b141d"/><g font-family="system-ui,sans-serif"><text x="24" y="34" fill="#f2f6fa" font-size="23">${escape(clip.id)} · 8 diagnostic skeleton frames</text><text x="24" y="62" fill="#a9bdcf" font-size="14">Left: cyan · Right: purple · Ball: orange · Below floor: red · root recentered, common scale</text>${panels}<text x="24" y="${top+panelHeight*2+24}" fill="#a9bdcf" font-size="13">Skeleton positions from measured animation. No mesh silhouette, collision hull or subjective visual-quality claim.</text></g></svg>`;
}
