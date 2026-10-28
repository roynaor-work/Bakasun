import {STATIONS,levelForAge,questionsForAge,syncLearningDay,dailyStatus,recordAnswer,roundReward,completeDailyRound} from './state.mjs?v=island-naval-aim-20261028-2';
import {createQuestion} from './questions.mjs?v=island-naval-aim-20261028-2';

/** One in-memory round owns answers and pays once, only after all eight questions. */
export function installLearning(engine,changed) {
  let round=null;
  const state=engine.state;
  const nextQuestion=()=>{
    const s=state.learning.stations[round.station];
    round.question=createQuestion(round.station,s.level,{index:round.index,exclude:s.recent});
    s.recent=[...s.recent,round.question.id].slice(-24);
    round.attempts=0;round.resolved=false;round.feedback=null;
  };
  engine.refreshLearningDay=()=>{if(syncLearningDay(state.learning,engine.now()))changed('learning-day');};
  engine.learningStatus=()=>dailyStatus(state.learning,engine.now());
  engine.setLearningRequired=value=>{
    if(typeof value!=='boolean')return {ok:false,reason:'reason.invalid'};
    state.learning.required=value;changed('learning-settings');return {ok:true};
  };
  engine.setLearningAge=age=>{
    if(!Number.isInteger(age)||age<4||age>10)return {ok:false,reason:'reason.invalid'};
    if(state.learning.age!==age){state.learning.age=age;for(const s of Object.values(state.learning.stations)){s.level=levelForAge(age);s.successStreak=0;s.errorStreak=0;}round=null;changed('learning-age');}return {ok:true};
  };
  engine.startLearning=station=>{
    if(!STATIONS[station]||engine.isMinigameActive())return {ok:false,reason:'reason.gameBusy'};
    syncLearningDay(state.learning,engine.now());
    round={station,total:questionsForAge(state.learning.age),index:0,firstTry:0,retried:0,startedAt:engine.now()};nextQuestion();changed('learning-start');return {ok:true};
  };
  engine.learningRound=()=>round;
  engine.answerLearning=answer=>{
    if(!round||round.resolved)return {ok:false,reason:'reason.invalid'};
    const correct=String(answer)===round.question.answer,station=state.learning.stations[round.station];
    if(!round.attempts)recordAnswer(station,correct);
    round.attempts++;
    if(correct){if(round.attempts===1)round.firstTry++;else round.retried++;}
    round.resolved=correct||round.attempts>=2;
    round.feedback={ok:true,correct,resolved:round.resolved,hint:round.question.hint,answer:round.resolved?round.question.answer:null};
    changed('learning-answer');return round.feedback;
  };
  engine.nextLearning=()=>{
    if(!round?.resolved)return {ok:false,reason:'reason.invalid'};
    if(++round.index<round.total){nextQuestion();changed('learning-question');return {ok:true,done:false};}
    const result={...roundReward(round.firstTry,round.retried,round.total),firstTry:round.firstTry,retried:round.retried,total:round.total,station:round.station,level:state.learning.stations[round.station].level,pictureOnly:round.question.level<=2,seconds:Math.max(0,Math.round((engine.now()-round.startedAt)/1000))};
    state.money+=result.money;state.learning.stations[round.station].stars=Math.min(Number.MAX_SAFE_INTEGER,state.learning.stations[round.station].stars+result.stars);completeDailyRound(state.learning,engine.now());round=null;changed('learning-complete',{result});return {ok:true,done:true,result};
  };
  engine.cancelLearning=()=>{round=null;};
  engine.subscribe((_,event)=>{if(['reset','import'].includes(event.type))round=null;});
}
