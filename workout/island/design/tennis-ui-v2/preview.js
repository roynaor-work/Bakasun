(() => {
  'use strict';
  const config = window.TENNIS_UI_V2_CONFIG;
  const root = document.querySelector('.tennis-v2');
  let format = 'svg';
  const imageFor = (id, width, height) => {
    const image = document.createElement('img');
    image.dataset.asset = id; image.src = config.assets[id][format];
    image.alt = ''; image.width = width; image.height = height;
    return image;
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const hud = window.TennisUIV2.create(root, {
    onServe({position}) {
      const id = position >= .46 && position <= .54 ? 'power-serve'
        : position >= .34 && position <= .66 ? 'perfect-green' : null;
      if (id) hud.playEffect(id, {x:.5,y:.62});
    },
    onAction({id}) {
      if (id === 'slice') hud.playEffect('spin',{x:.5,y:.57});
      if (id === 'smash') hud.playEffect('power-serve',{x:.5,y:.57});
      root.dataset.lastAction=id;
    }
  });
  // Public only for inspection and automated checks; no test-only time manipulation.
  window.tennisPreview = hud;
  for (const [id,label] of [['moving','זז'],['locked','ננעל'],['hidden','נעלם']]) {
    const figure=element('figure');
    const art=element('div','state-art'); art.append(imageFor('meter-'+id,32,176));
    figure.append(art,element('figcaption','',label));
    document.querySelector('#meter-states').append(figure);
  }
  for (const control of config.controls) {
    const card = element('article','button-card');
    const samples = element('div','button-samples');
    for (const [id,label] of [['idle','רגיל'],['pressed','לחוץ'],['disabled','מושבת']]) {
      const figure=element('figure');
      figure.append(imageFor(control.states[id],56,56),element('figcaption','',label));
      samples.append(figure);
    }
    card.append(element('h3','',control.labelHe),samples);
    document.querySelector('#button-gallery').append(card);
  }
  const points = {'power-serve':{x:.5,y:.62},spin:{x:.55,y:.52},'perfect-green':{x:.5,y:.59},out:{x:.67,y:.63},net:{x:.5,y:.47}};
  for (const fx of config.effects) {
    const card = element('article','fx-card');
    const art = element('div','fx-art'); art.append(imageFor(fx.asset,100,100));
    const button = element('button','', 'הפעלה במגרש'); button.type='button';
    button.setAttribute('aria-label','הדגמת '+fx.labelHe);
    button.dataset.demoEffect=fx.id;
    button.addEventListener('click',() => {
      hud.playEffect(fx.id,points[fx.id]);
      root.scrollIntoView({behavior:'auto',block:'start'});
    });
    card.append(art,element('h3','',fx.labelHe),element('p','',`${fx.durationMs}ms · ללא לולאה`),button);
    document.querySelector('#fx-gallery').append(card);
  }
  const stateLabels = {moving:'המד זז',locked:'המד ננעל',hidden:'המד נעלם · ראלי'};
  root.addEventListener('tennis-ui-state',event => {
    document.querySelector('#state-readout').textContent=stateLabels[event.detail.state];
  });
  document.querySelector('#new-serve').addEventListener('click',() => {
    hud.startServe();
    root.scrollIntoView({behavior:'auto',block:'start'});
  });
  document.querySelector('#pause').addEventListener('click',event => {
    const next=!hud.snapshot().paused;
    hud.setPaused(next);
    event.currentTarget.setAttribute('aria-pressed',String(next));
    event.currentTarget.textContent=next?'המשך':'השהיה';
  });
  document.querySelector('#format').addEventListener('change',event => {
    format=event.target.value;
    hud.setFormat(format);
    document.querySelectorAll('[data-asset]').forEach(image => image.src=config.assets[image.dataset.asset][format]);
  });
  const reduceMotion=document.querySelector('#reduce-motion');
  reduceMotion.checked=hud.snapshot().reducedMotion;
  reduceMotion.addEventListener('change',event => hud.setReducedMotion(event.target.checked));
  document.querySelector('#position').addEventListener('input',event => {
    const value=Number(event.target.value);
    if (hud.snapshot().state !== 'moving') hud.startServe();
    hud.setPosition(value/100);
    document.querySelector('#position-value').textContent=`${value}%`;
  });
  // Decode both formats before any timed feedback can be requested.
  const preloads=[];
  for (const asset of Object.values(config.assets)) for (const path of Object.values(asset)) {
    const img=new Image(); img.src=path; preloads.push(img.decode());
  }
  window.tennisPreviewReady=Promise.all(preloads);
})();
