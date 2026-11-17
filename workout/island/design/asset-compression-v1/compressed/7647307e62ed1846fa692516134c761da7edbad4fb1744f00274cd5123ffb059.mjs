import {create as speedMeter} from './alpine-dial.mjs';
import {create as powerMeter} from '../design/hud-kit/power-meter.mjs';
import {create as eventBanner} from '../design/hud-kit/event-banner.mjs';

/** Adapt snapshots to the shared HUD kit. No game command, score or storage
 * reaches the components; their cached setters avoid per-frame DOM rebuilds. */
export function createAlpineHud({speed,callout,kicker,line,maxSpeedKmh=120}){
  const doc=speed.ownerDocument;speed.classList.add('ih-kit','alpine-kit-speed');speed.dataset.theme='alpine';
  callout.classList.add('ih-kit');callout.dataset.theme='alpine';
  const meter=speedMeter(speed,{maxKmh:Math.ceil(maxSpeedKmh),unit:'קמ״ש'}),tank=powerMeter(speed,{label:'מאיץ'}),event=eventBanner(callout);
  const cue=doc.createElement('span');cue.className='alpine-flight-cue';cue.setAttribute('role','status');cue.setAttribute('aria-live','polite');speed.append(cue);
  const speedState={kmh:0},tankState={value:0},eventState={visible:false,kind:'fall',title:'',detail:''};let lastCue='',dead=false;
  return {
    update(state){if(dead)return;speedState.kmh=state.speedKmh;tankState.value=state.boostFraction;meter.update(speedState);tank.update(tankState);
      const text=state.player?.airborne?(state.player.trick?'טריק באוויר':'באוויר · בחרו טריק'):state.player?.landing?'נחיתה · חוזרים לגלישה':'';
      if(text!==lastCue){lastCue=text;cue.textContent=text;cue.hidden=!text;}
    },
    event(kind,title,detail){if(dead)return;const fall=kind==='crash'||kind==='hit';eventState.visible=fall;eventState.title=fall?'נפילה · חוזרים למסלול':title;eventState.detail=detail;event.update(eventState);kicker.hidden=line.hidden=fall;},
    hide(){if(dead)return;eventState.visible=false;event.update(eventState);},
    destroy(){if(dead)return;dead=true;meter.destroy();tank.destroy();event.destroy();cue.remove();}
  };
}
