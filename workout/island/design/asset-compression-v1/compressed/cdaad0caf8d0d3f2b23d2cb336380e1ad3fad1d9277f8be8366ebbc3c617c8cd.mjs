export const STATIONS = Object.freeze({
  language: {building:'library',icon:'📚',title:'סִפְרִיָּה',subject:'שָׂפָה'},
  math: {building:'mathLab',icon:'🧮',title:'מַעְבֶּדֶת חֶשְׁבּוֹן',subject:'חֶשְׁבּוֹן'},
  animals: {building:'zoo',icon:'🦒',title:'גַּן חַיּוֹת',subject:'חַיּוֹת'},
  puzzles: {building:'puzzleRoom',icon:'🧩',title:'חֲדַר פָּאזֵלִים',subject:'פָּאזֵלִים'},
});
export const ROUND_LENGTH = 8;
export const levelForAge=age=>Math.max(1,Math.min(7,age-3));
export const questionsForAge=age=>age<=5?5:8;
export const roundsForAge=age=>age<=5?1:2;
export function dayKey(now=Date.now()) {
  const d=new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function initialLearning(now=Date.now()) {
  const day=dayKey(now);
  return {age:4,stations:Object.fromEntries(Object.keys(STATIONS).map(id=>[id,{level:1,successStreak:0,errorStreak:0,stars:0,recent:[]}])),startDay:day,missionDate:day,lastMissionDate:null,roundsToday:0,required:true};
}
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const integer=(n,min,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function validLearning(l) {
  return Boolean(l&&integer(l.age,4,10)&&typeof l.required==='boolean'&&validDay(l.startDay)&&validDay(l.missionDate)&&(l.lastMissionDate===null||validDay(l.lastMissionDate))&&integer(l.roundsToday,0)&&l.stations&&Object.keys(l.stations).length===4&&Object.keys(STATIONS).every(id=>{
    const s=l.stations[id];return s&&integer(s.level,1,7)&&integer(s.successStreak,0,2)&&integer(s.errorStreak,0,1)&&integer(s.stars,0)&&Array.isArray(s.recent)&&s.recent.length<=48&&s.recent.every(x=>typeof x==='string'&&x.length<=2000);
  }));
}
export function syncLearningDay(l,now) {
  const day=dayKey(now);if(l.missionDate===day)return false;
  l.missionDate=day;l.roundsToday=0;return true;
}
export function dailyStatus(l,now=Date.now()) {
  const day=dayKey(now),rounds=l.missionDate===day?l.roundsToday:0,firstDay=l.startDay===day;
  const target=roundsForAge(l.age);
  return {day,rounds,target,complete:rounds>=target,firstDay,locked:l.required&&!firstDay&&rounds<target};
}
export function recordAnswer(s,correct) {
  if(correct){s.errorStreak=0;if(++s.successStreak===3){s.level=Math.min(7,s.level+1);s.successStreak=0;}}
  else{s.successStreak=0;if(++s.errorStreak===2){s.level=Math.max(1,s.level-1);s.errorStreak=0;}}
  return s.level;
}
export function roundReward(firstTry,retried,total=8) {
  return {money:12+firstTry*6+retried*3,stars:firstTry/total>=.85?3:firstTry/total>=.5?2:1};
}
export function completeDailyRound(l,now) {
  syncLearningDay(l,now);l.roundsToday=Math.min(Number.MAX_SAFE_INTEGER,l.roundsToday+1);if(l.roundsToday>=roundsForAge(l.age))l.lastMissionDate=l.missionDate;
}
// Backup settings are restored; earned stars and completed days are merged additively.
export function mergeLearning(current,incoming,{restoreSettings=true}={}) {
  if(restoreSettings){current.age=incoming.age;current.required=incoming.required;}
  for(const id of Object.keys(STATIONS)){if(incoming.stations[id].stars>current.stations[id].stars)current.stations[id]=structuredClone(incoming.stations[id]);else current.stations[id].stars=Math.max(current.stations[id].stars,incoming.stations[id].stars);}
  if(incoming.missionDate>current.missionDate){current.missionDate=incoming.missionDate;current.roundsToday=incoming.roundsToday;}
  if(current.missionDate===incoming.missionDate)current.roundsToday=Math.max(current.roundsToday,incoming.roundsToday);
  if(incoming.lastMissionDate&&(!current.lastMissionDate||incoming.lastMissionDate>current.lastMissionDate))current.lastMissionDate=incoming.lastMissionDate;
  // Import never shortens or renews the live save's first-day exemption.
}
