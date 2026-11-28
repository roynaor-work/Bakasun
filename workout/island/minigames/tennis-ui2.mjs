/** Tennis v24.4 controls (Roy, 18/11/2026, after v24.3 on the phone: "improve where the buttons are, their shape, and how comfortable they are").
 * Built on the Codex package tennis-ui-v2 (CC0, assets/tennis-ui-v2): its button plates (serve, the hit = its "smash", drop; a lob plate made in
 * the same style, since the package has none), shown at the package's touch size, and its layout at 844x390:
 *  - one row along the bottom right, under the right thumb: the hit (the button used most, 64 px, in the corner), then lob and drop, 56 px each,
 *    12 px apart, the captions under the plates, outside the art;
 *  - the serve at the centre right (the package's place for the one-off action), above the row, at the top of the thumb's arc;
 *  - the vertical quality bar on the outer right edge, centred on the screen height, 14 px track (the package's meter rail), never under a button.
 * The press shows the package's "pressed" plate. ?tennisUi=v24 keeps the v24.3 layout (phone fix E) and the drawn buttons. */
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function tennisUi2Enabled(search=globalThis.location?.search||''){return param('tennisUi',search)!=='v24';}
/** The layout in CSS pixels, from the bottom-right corner of the controls (right/bottom offsets of each button), and the bar. */
export const UI2=Object.freeze({
 inset:Object.freeze({right:44,bottom:28}),
 buttons:Object.freeze({shoot:Object.freeze({right:0,bottom:0,size:64,art:'smash'}),sprint:Object.freeze({right:76,bottom:0,size:56,art:'lob'}),drop:Object.freeze({right:144,bottom:0,size:56,art:'drop'}),pass:Object.freeze({right:32,bottom:140,size:56,art:'serve'})}),
 meter:Object.freeze({right:16,width:14,height:176,lift:10})
});
/** Dress the four buttons with the package plates and put them in place (CSS does the rest under .tennis-ui2). */
export function applyTennisUi2(actions,base=import.meta.url){
 actions.classList.add('tennis-ui2');
 for(const [id,b]of Object.entries(UI2.buttons)){const button=actions.querySelector('#'+id);if(!button)continue;
  const art=state=>`url(${new URL(`../assets/tennis-ui-v2/button-${b.art}-${state}.svg?v=island-v2-20261107-26`,base).href})`;
  button.style.setProperty('--ui2-art',art('idle'));button.style.setProperty('--ui2-pressed',art('pressed'));
  Object.assign(button.style,{right:b.right+'px',bottom:b.bottom+'px',width:b.size+'px',height:b.size+'px',minWidth:b.size+'px',minHeight:b.size+'px'});}
 return actions;
}
/** Where the bar goes: on the right edge, centred on the stage height (a little above the middle), clamped inside the stage. */
export function ui2MeterBox(stageHeight){
 const m=UI2.meter,height=Math.max(64,Math.min(m.height,stageHeight-24));
 return {right:m.right,width:m.width,height,top:Math.max(8,Math.min(stageHeight-height-8,(stageHeight-height)/2-m.lift))};
}
