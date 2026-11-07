/** Markdown tables from soccer-gameplay-sim JSON runs.
 * Usage: node tools/soccer-gameplay-report.mjs <baseline.json> <after.json> [stage|all] */
import {readFileSync} from 'node:fs';
const [,,aPath,bPath,which='all']=process.argv;
const A=JSON.parse(readFileSync(aPath,'utf8')),B=JSON.parse(readFileSync(bPath,'utf8'));
const stages=which==='all'?A.stages:[Number(which)];
const mean=(report,get)=>{const v=stages.map(st=>get(report.byStage[st])).filter(x=>x!==null&&x!==undefined&&Number.isFinite(x));return v.length?v.reduce((s,x)=>s+x,0)/v.length:null;};
const n=(d=1)=>x=>x===null?'-':x.toFixed(d),pc=x=>x===null?'-':(x*100).toFixed(0)+'%';
const rows=[
 ['שערים בסך הכול למשחק','2-5',s=>s.game.totalGoals,n(2)],
 ['משחקים עם 2-5 שערים','≥ 70%',s=>s.spread.totalGoals.inRange,pc],
 ['בעיטות בסך הכול למשחק','8-15',s=>s.game.totalShots,n(1)],
 ['החזקה של הבית','45-55%',s=>s.team[0].possession,pc],
 ['השלמת מסירה, בית','75-90%',s=>s.team[0].passCompletion,pc],
 ['השלמת מסירה, יריב','75-90%',s=>s.team[1].passCompletion,pc],
 ['מסירות יריב שנוירטו','≤ 15%',s=>s.team[1].passIntercepted,pc],
 ['מסירות יריב למשחק','-',s=>s.team[1].passes,n(1)],
 ['מסירות לא מכוונות (כולל שני הצדדים)','≤ 5%',s=>(s.team[0].passUnintended+s.team[1].passUnintended)/2,pc],
 ['מסירות ליריב בחזקה אחת (ספל), ממוצע','≥ 2',s=>s.team[1].passesPerSpell,n(2)],
 ['חזקות יריב עם 3 מסירות ומעלה','≥ 30%',s=>s.team[1].builtSpells,pc],
 ['משך חזקה של יריב (שניות)','-',s=>s.team[1].spellSeconds,n(1)],
 ['חטיפות בסך הכול','-',s=>s.team[0].tackles+s.team[1].tackles,n(1)],
 ['לחץ על נושא הכדור של הבית (מ\' ליריב הקרוב)','-',s=>s.team[0].carrierPressure,n(2)],
 ['בעיטות שער + זריקות + קרנות','-',s=>s.team[0].goalKicks+s.team[1].goalKicks+s.team[0].throwIns+s.team[1].throwIns+s.team[0].corners+s.team[1].corners,n(1)],
 ['כדור מת (אף אחד לא רודף)','< 3%',s=>s.game.deadBall,pc],
 ['חלונות 4 שנ\' תקועים','< 8%',s=>s.game.stuckWindows,pc],
 ['תקיעה ארוכה ביותר (שנ\')','< 5',s=>s.game.maxStuckSeconds,n(1)],
 ['תנועת כדור: חילופי שלישים קצה-לקצה','-',s=>s.game.swings,n(1)],
 ['כיסוי אורך המגרש ב-20 שנ\'','≥ 70%',s=>s.game.coverage,pc],
 ['החלפה אוטומטית: מחוץ למיקום (הנשלט לא הקרוב ב-1.5 מ\')','< 15%',s=>s.game.mismatchShare,pc],
 ['החלפה אוטומטית: חציון עד החלפה (שנ\')','< 0.3',s=>s.game.mismatchMedian,n(2)],
 ['החלפה אוטומטית: דיוק (1.5 שנ\' אחרי)','≥ 90%',s=>s.game.switchAccuracy,pc],
 ['החלפות אוטומטיות בדקה','-',s=>s.game.autoSwitchesPerMinute,n(1)],
 ['החלפה אוטומטית וחזרה תוך 1.5 שנ\' (למשחק)','≤ 1.5',s=>s.game.autoPingPong,n(2)],
 ['מגע עד תנועה (חציון, שנ\')','< 0.25',s=>s.game.touchToMoveMedian,n(2)],
];
console.log(`| מדד | יעד | ${A.ai==='v1'?'בסיס (v1)':A.ai} | ${B.ai==='v2'?'אחרי (v2)':B.ai} |\n|---|---|---|---|`);
for(const [name,target,get,fmt] of rows)console.log(`| ${name} | ${target} | ${fmt(mean(A,get))} | ${fmt(mean(B,get))} |`);
