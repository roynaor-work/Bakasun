/** Referee whistle rules shared by soccer and basketball. Pure functions plus a
 * tiny spacing gate: the callers own the clock and the audio graph.
 * Roy heard a whistle "in the middle of an active game" twice: soccer blew it on
 * every throw-in, corner and goal kick, basketball on every inbound. A broadcast
 * whistles for kickoff, a goal restart, half/full time and a call, nothing else. */
export const WHISTLE_SPACING={soccer:3,hoops:2.5};
export const SOCCER_WHISTLE_EVENTS=['play','halftime','fulltime','kickoff','foul','penalty'];
// Ball out of play: the taker just takes it, no whistle (soccer.mjs restart kinds).
const SOCCER_QUIET_RESTARTS=new Set(['throwIn','corner','goalKick','keeperThrow','keeperPunt']);
// 'play' fires after soccer.mjs already set phase='playing', so it must pass the
// live-phase guard: it is the whistle that starts play, not one during play.
const SOCCER_LIVE_OK=new Set(['play','kickoff','foul','penalty']);

/** Soccer: does this match event earn a whistle at all (before spacing)? */
export function whistleFor(type,detail={}){
  switch(type){
    case 'restart':return !SOCCER_QUIET_RESTARTS.has(detail.restart)&&detail.restart==='kickoff';
    case 'play':case 'halftime':case 'fulltime':case 'kickoff':case 'foul':case 'penalty':return true;
    default:return false;
  }
}

/** Soccer: never whistle while the ball is in play, except the call that stops it
 * or the signal that starts it. */
export function whistleAllowedInPhase(type,phase){return phase!=='playing'||SOCCER_LIVE_OK.has(type);}

/** Basketball: gain for the referee sample, 0 for silence. Out of bounds is a quiet
 * call; inbounds and quarter starts are the horn's job (hoops-audio maps them to
 * the buzzer), and only the opening tip gets a jump-ball whistle. */
export function hoopsWhistleGain(type,detail={},{jumpBalls=0}={}){
  switch(type){
    case 'foul':case 'goaltending':return .9;
    case 'violation':return detail.kind==='out'?.6:.9;
    case 'timeout':return .8;
    case 'jumpBall':return jumpBalls===0?.7:0;
    default:return 0;
  }
}

/** Minimum spacing between whistles. `now` is in seconds on one monotonic clock;
 * allow() only records a whistle it lets through. */
export function createWhistleGate(spacing){
  let last=-Infinity,blocked=0;
  return {
    allow(now){if(now-last<spacing){blocked++;return false;}last=now;return true;},
    mark(now){last=now;},
    get last(){return last;},get blocked(){return blocked;},
    reset(){last=-Infinity;blocked=0;}
  };
}
