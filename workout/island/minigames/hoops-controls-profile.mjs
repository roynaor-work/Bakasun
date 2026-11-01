/** Local authored control contract; presentation data never changes match rules. */
export async function loadHoopsControlsProfile({fetcher=globalThis.fetch,signal}={}){
 const base=new URL('../design/controls/',import.meta.url);
 const read=async file=>{const response=await fetcher(new URL(file,base),{signal});if(!response.ok)throw Error('Hoops controls '+file+': '+response.status);return response.json();};
 const [hoops,interaction]=await Promise.all([read('hoops.json'),read('interaction.json')]);
 return validateHoopsControlsProfile({hoops,interaction});
}

export function validateHoopsControlsProfile(profile){
 const {hoops,interaction}=profile||{};
 if(hoops?.game!=='hoops'||hoops.schema_version!==1||interaction?.schema_version!==1)throw Error('Invalid basketball control contract');
 const thresholds=interaction.gesture_thresholds;
 for(const key of ['hold_from_ms','swipe_min_distance_px','swipe_axis_dominance','cancel_outside_action_px','stick_dead_zone','one_finger_sprint_on','one_finger_sprint_off','one_finger_sprint_hold_ms'])if(!Number.isFinite(thresholds?.[key])||thresholds[key]<0)throw Error('Invalid control threshold '+key);
 for(const name of ['844x390','390x844']){
  const layout=hoops.layouts?.[name];if(!layout?.slots)throw Error('Missing control layout '+name);
  for(const [slot,rect] of Object.entries(layout.slots)){
   for(const key of ['width','height','offset_x','offset_y'])if(!Number.isFinite(rect[key])||rect[key]<0)throw Error('Invalid control slot '+slot);
   if(rect.width<48||rect.height<48)throw Error('Control target below 48px');
  }
 }
 for(const name of ['attack','off_ball','defense','inbound','free_throw'])if(!Array.isArray(hoops.states?.[name]?.controls))throw Error('Missing control state '+name);
 return profile;
}
