export function actionIcon(kind){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('soccer-action-icon');svg.dataset.soccerIcon=kind;
  const paths={shoot:'m4 4 6 3 1 5 9 3 1 3v2H3v-6l1-4zm-1 13h18M9 9l3-2m-2 5 3-2m-1 4 3-2',pass:'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7l5 4-2 6H9l-2-6zM12 3v4m9 5-4-1M18 19l-3-2M6 19l3-2M3 12l4-1',slide:'M3 20h18M4 16l6-6 7 5M10 10l4-5 4 3M7 20l4-5',steal:'M5 19V9h3V4h3v6h2V3h3v8h2V6h3v9l-5 6H9z'};
  paths.sprint='M14 3l-8 11h6l-2 7 9-12h-6z';
  paths.switch='M5 7h14l-4-4M19 17H5l4 4M19 7l-4 4M5 17l4-4';
  paths.header='M8 21v-4c-3-2-4-6-2-9 2-4 8-4 10-1l1 4 3 2-3 1v3h-4v4M5 4l2 2M11 1v3M17 3l-2 3M13 10h.1';
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[kind]);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
}
