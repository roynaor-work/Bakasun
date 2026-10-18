export function actionIcon(kind){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('soccer-action-icon');
  const paths={shoot:'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7l5 4-2 6H9l-2-6z',pass:'M4 19L20 5M10 5h10v10',slide:'M3 20h18M4 16l6-6 7 5M10 10l4-5 4 3M7 20l4-5',steal:'M5 19V9h3V4h3v6h2V3h3v8h2V6h3v9l-5 6H9z'};
  paths.sprint='M14 3l-8 11h6l-2 7 9-12h-6z';
  paths.switch='M5 7h14l-4-4M19 17H5l4 4M19 7l-4 4M5 17l4-4';
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[kind]);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
}
