/** Street Slam contract between engine, input and presentation.
 * Based on the Codex design hand-off (engine-contract.d.ts, 25.10.2026).
 * Changes made while implementing, kept in both sides together:
 *  - InputFrame.primaryCancelled: a cancelled touch / lost focus drops a charge without shooting.
 *  - Phase 'practice' for the first-run drill (no clock, no reward).
 *  - Snapshot extras the HUD needs: overtimes, buzzer, mode, dunkReady, shotWindow, practice, result,
 *    per-player hasBall/charge/speed/stats, ball.dribble/pass/shot.kind/result.
 *  - More event types (pass, jump, charge, miss, rim, board, floor, fence, stuck, switch, buzzer,
 *    overtime, tipoff, inbound, practiceStep, practiceDone). Sound and toasts read them; none of
 *    them can change the match. Rendering never awards points. */
export type Vec2 = Readonly<{x:number; z:number}>;
export type Vec3 = Readonly<{x:number; y:number; z:number}>;
export type Team = 'home' | 'away';
export type Phase = 'ready' | 'playing' | 'paused' | 'scoreReset' | 'overtime' | 'finished' | 'practice';
export type Animation = 'idle' | 'run' | 'dribble' | 'pass' | 'shoot' | 'dunk' | 'block' | 'steal' | 'land' | 'celebrate';
export interface InputFrame {
  /** Normalized, court-relative (+Z toward the near baseline). The controller converts the
   * screen joystick with the camera basis before it reaches the engine. */
  move: Vec2;
  /** Edges, at most one per fixed step; a press and its release never share a step. */
  primaryPressed: boolean;
  primaryReleased: boolean;
  primaryCancelled?: boolean;
  secondaryPressed: boolean;
}
export interface PlayerSnapshot {
  id: 'h1'|'h2'|'a1'|'a2'; team: Team; position: Vec3; yaw: number;
  animation: Animation; animationT: number; stamina: number;
  hasBall: boolean; charge: number; speed: number; inactive: boolean;
}
export interface ShotSnapshot {
  id: number; shooterId: string; releasedAtTick: number;
  origin: Vec3; pointsIfMade: 2 | 3; kind: 'jump' | 'dunk';
  /** Stays true through reset. Scoring requires a descending hoop-plane crossing inside the ring. */
  resolved: boolean; result: null | 'made' | 'floor' | 'outside' | 'blocked' | 'stuck';
}
export interface Snapshot {
  version: 1; tick: number; phase: Phase; remainingMs: number; overtimes: number; buzzer: boolean;
  mode: 'match' | 'practice';
  controlledPlayerId: string; attackTeam: Team;
  score: Readonly<Record<Team,number>>;
  players: readonly PlayerSnapshot[];
  ball: {position: Vec3; velocity: Vec3; ownerId: string | null; dribble: number; shot: ShotSnapshot | null;
    pass: null | {from:string; to:string; team:Team; t:number}};
  availableActions: {primary:'shoot'|'block'|'rebound'; secondary:'pass'|'steal'|'switch'};
  dunkReady: boolean;
  shotWindow: {tapMax:number; perfectFrom:number; perfectTo:number; maxHold:number};
  practice: null | {step:0|1|2|3; target:Vec2};
  result: null | {practice:true} | {won:boolean; stars:0|1|2|3; scoreFor:number; scoreAgainst:number;
    overtimes:number; stage:number; seed:number; durationSeconds:number};
}
export type MatchEvent = {seq:number; tick:number} & (
  | {type:'shotReleased'; shotId:number; playerId:string; points:2|3; kind:'jump'|'dunk'}
  | {type:'score'; shotId:number; team:Team; points:2|3; playerId:string; kind:'jump'|'dunk'}
  | {type:'miss'; shotId:number; reason:'floor'|'outside'|'blocked'|'stuck'}
  | {type:'possession'; playerId:string|null; reason:string}
  | {type:'block'|'steal'|'dunk'|'pass'|'jump'|'charge'|'switch'; playerId:string}
  | {type:'rim'|'board'|'floor'|'fence'; speed:number}
  | {type:'buzzer'|'stuck'|'practiceDone'|'tipoff'|'inbound'|'overtime'|'practiceStep'|'chargeCancelled'|'lateRelease'|'stealAttempt'|'shotStart'}
  | {type:'finished'; winner:Team});
export interface Engine {
  /** Fixed 1/60 s step; paused/finished never advance match time. */
  step(input: InputFrame): void;
  snapshot(): Snapshot;
  /** Destructive drain, consumed once by the presentation layer. */
  drainEvents(): MatchEvent[];
  pause(): void;
  /** Also drops any charge whose release was lost during the pause. */
  resume(): void;
  restart(seed:number): void;
  dispose(): void;
}
export interface Renderer {
  render(previous:Snapshot,current:Snapshot,alpha:number,dt?:number):void;
  /** Dedupes event seq; effects cannot modify engine state. */
  effects(events:readonly MatchEvent[]):void;
  resize(width:number,height:number,dpr:number):void;
  dispose():void;
}
