/** Island Pro Basketball control icons (original strokes, 32x32). No words on the court. */
const PATHS={
 shoot:'<circle cx="10" cy="22" r="6"/><path d="M4 22h12M10 16v12M7 17c2 2 2 8 0 10M13 17c-2 2-2 8 0 10"/><path d="M15 14c4-7 8-9 13-9"/><path d="m24 3 4 2-2 4"/>',
 jump:'<path d="M16 28V12"/><path d="m10 17 6-6 6 6"/><path d="M8 5h16"/>',
 block:'<path d="M10 28V14m4 14V9m4 19V9m4 19V13"/><path d="M8 18c0-3 2-4 2-4m12 0s3 2 3 6v3c0 4-3 5-6 5h-6"/>',
 pass:'<path d="M4 20c5-8 14-10 22-6"/><path d="m21 9 5 5-6 3"/><circle cx="7" cy="24" r="3.5"/>',
 steal:'<path d="M5 18c4-1 8-1 11 2"/><path d="M5 12c5 0 9 1 12 4"/><circle cx="23" cy="17" r="5"/><path d="M26 6l-3 4m5 0-4 2"/>',
 cross:'<path d="M4 8l8 8-8 8"/><path d="M28 8l-8 8 8 8"/><circle cx="16" cy="16" r="3"/>',
 switch:'<circle cx="10" cy="10" r="4"/><circle cx="22" cy="22" r="4"/><path d="M17 7h7v7m0-7-6 6M15 25H8v-7m0 7 6-6"/>',
 sprint:'<path d="M18 3 9 17h7l-2 12 9-15h-7z"/>',
 timeout:'<path d="M6 7h20M16 7v20"/><path d="M10 27h12"/>',
 pnr:'<circle cx="9" cy="22" r="4"/><circle cx="21" cy="12" r="4"/><path d="M9 17c0-7 5-11 9-11"/><path d="M24 16c2 4 2 8-1 12"/><path d="m20 25 3 3 3-3"/>',
 iso:'<circle cx="16" cy="9" r="4"/><path d="M16 14v12"/><path d="m11 21 5 5 5-5"/><path d="M6 28h20"/>',
 motion:'<path d="M26 16a10 10 0 1 1-3-7"/><path d="M26 4v6h-6"/><circle cx="16" cy="16" r="2.5"/>',
 man:'<circle cx="11" cy="10" r="4"/><circle cx="21" cy="22" r="4"/><path d="M14 13l4 6"/>',
 zone:'<rect x="5" y="9" width="22" height="16" rx="3"/><path d="M5 17h22M16 9v16"/>',
 replay:'<path d="M6 16a10 10 0 1 0 3-7"/><path d="M6 4v6h6"/><path d="m14 12 6 4-6 4z"/>',
 perfect:'<path d="m16 3 3.8 8 8.7 1.1-6.4 6 1.7 8.6L16 22.4l-7.8 4.3 1.7-8.6-6.4-6L12.2 11Z"/>',
 early:'<circle cx="16" cy="16" r="12"/><path d="M16 9v7l-5 4"/>',
 late:'<circle cx="16" cy="16" r="12"/><path d="M16 9v7l5 4"/>',
 move:'<circle cx="16" cy="16" r="5"/><path d="M16 3v5m-3-2 3-3 3 3M16 29v-5m-3 2 3 3 3-3M3 16h5m-2-3-3 3 3 3M29 16h-5m2-3 3 3-3 3"/>',
 bench:'<path d="M4 18h24M7 18v8M25 18v8M6 13h20"/><circle cx="11" cy="8" r="3"/><circle cx="21" cy="8" r="3"/>',
 retry:'<path d="M26 16a10 10 0 1 1-3-7"/><path d="M26 4v6h-6"/>',
 back:'<path d="M10 4H4v24h6m4-18 6 6-6 6m-6-6h18"/>',
 warning:'<path d="M16 4 29 27H3Z"/><path d="M16 12v7"/><circle cx="16" cy="23" r="1"/>',
 whistle:'<circle cx="12" cy="19" r="7"/><path d="M18 15h10v6h-6"/><path d="M12 12V7"/>',
};
export function hoopsIcon(name,doc=document){
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2.4');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
 svg.innerHTML=PATHS[name]||PATHS.shoot;svg.dataset.icon=name;return svg;
}
export const HOOPS_ICONS=Object.keys(PATHS);
