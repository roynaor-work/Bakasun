/** Street Slam control icons (original strokes, 32x32). No text on the court. */
const PATHS={
 shoot:'<circle cx="11" cy="21" r="6"/><path d="M5 21h12M11 15v12M8 16c2 2 2 8 0 10M14 16c-2 2-2 8 0 10"/><path d="M17 14c3-6 7-8 11-8"/><path d="m24 4 4 2-2 4"/>',
 dunk:'<path d="M6 9h20"/><path d="M9 9l2 7h10l2-7"/><circle cx="16" cy="21" r="5"/><path d="M16 2v4m-3-2 3 3 3-3"/>',
 pass:'<path d="M4 20c5-8 14-10 22-6"/><path d="m21 9 5 5-6 3"/><circle cx="7" cy="24" r="3.5"/>',
 block:'<path d="M10 28V14m4 14V9m4 19V9m4 19V13"/><path d="M8 18c0-3 2-4 2-4m12 0s3 2 3 6v3c0 4-3 5-6 5h-6"/>',
 steal:'<path d="M5 18c4-1 8-1 11 2"/><path d="M5 12c5 0 9 1 12 4"/><circle cx="23" cy="17" r="5"/><path d="M26 6l-3 4m5 0-4 2"/>',
 rebound:'<circle cx="16" cy="20" r="6"/><path d="M16 4v8m-4-4 4-4 4 4"/>',
 switch:'<circle cx="10" cy="10" r="4"/><circle cx="22" cy="22" r="4"/><path d="M17 7h7v7m0-7-6 6M15 25H8v-7m0 7 6-6"/>',
 skip:'<path d="M6 8v16l11-8Zm11 0v16l9-8Z"/>',
 move:'<circle cx="16" cy="16" r="5"/><path d="M16 3v5m-3-2 3-3 3 3M16 29v-5m-3 2 3 3 3-3M3 16h5m-2-3-3 3 3 3M29 16h-5m2-3 3 3-3 3"/>',
 retry:'<path d="M26 16a10 10 0 1 1-3-7"/><path d="M26 4v6h-6"/>',
 back:'<path d="M10 4H4v24h6m4-18 6 6-6 6m-6-6h18"/>',
};
export function slamIcon(name,doc=document){
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2.4');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
 svg.innerHTML=PATHS[name]||PATHS.shoot;svg.dataset.icon=name;return svg;
}
