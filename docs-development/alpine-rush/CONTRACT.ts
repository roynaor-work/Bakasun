/** Proposed v1 integration contract. This file specifies interfaces; no engine is implemented here. */
export type Phase = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';
export type RiderId = 'player' | 'rival-1' | 'rival-2' | 'rival-3' | 'rival-4' | 'rival-5';
export interface RiderFrame {
 id: RiderId;
 x: number; // lateral metres; right on the screen is positive; nominal safe interval [-7.5,7.5]
 z?: number; // camera-relative metres: ahead is negative Z. Player is rendered at Z=0.
 height?: number; // height above the riding surface, metres; engine owns airborne motion
 lean?: number; // presentation input [-1,1], signed consistently with steering
 boosting?: boolean;
 hit?: boolean;
}
export interface ObstacleFrame {
 id: string; // stable and bounded IDs; reuse objects between runs, do not create unbounded render IDs
 type: 'rock' | 'gate' | 'ramp' | 'boost';
 x: number;
 z: number; // player-relative metres. The view does not advance interactive objects by itself.
 radius?: number; // used for rocks; other geometry must match the dimensions below
}
export interface SkiFrame {
 schemaVersion: 1;
 phase: Phase;
 timeMs: number; // simulation clock; does not advance while paused
 distanceM: number;
 remainingM: number;
 rank: number;
 totalRiders: number;
 speedKmh: number;
 player: RiderFrame;
 rivals: RiderFrame[];
 obstacles: ObstacleFrame[];
 // Controller/HUD extension. The supplied demo only renders the fields above.
 countdown?: number;
 boostFraction?: number;
 result?: { runId:string; rank:number; elapsedMs:number; peakKmh:number; reward:number };
}
export interface SkiView {
 render(frame: SkiFrame): void;
 setQuality(value:'high'|'low'): void;
 dispose(): void;
 canvas: HTMLCanvasElement;
}
export declare function createSkiView(host:HTMLElement,options?:{modelUrl?:string}):Promise<SkiView>;

/** Controller translates PointerEvents/keyboard into these logical commands. */
export type SkiCommand =
 | {type:'start';trackId:string;seed:number}
 | {type:'steer';value:number} // [-1,1] analog target; controller converts drag delta once
 | {type:'boost'}
 | {type:'pause'}
 | {type:'resume'}
 | {type:'retry'}
 | {type:'exit'};
export interface SkiEngine {
 command(command:SkiCommand):void;
 step(dtSeconds:number):void; // fixed 1/60 s steps through an accumulator; bound catch-up after backgrounding
 snapshot():SkiFrame; // no DOM, Three.js, audio or random mutations when observing
 drainEvents():SkiEvent[]; // consume once, do not replay sounds/rewards on every render
 dispose():void;
}
export type SkiEvent = {
 id:string;
 type:'countdown'|'boost-start'|'boost-end'|'takeoff'|'land'|'collision'|'overtake'|'finish';
 riderId?:RiderId;
 objectId?:string;
};

/* Coordinate/geometry rules:
 - World units are metres. World forward progress is a scalar s that increases downhill.
 - Convert to view once: rival.z=player.s-rival.s; object.z=player.s-object.s.
 - Player x is in track-local space. Track curvature, if introduced, must share a centreline
   with physics; extend view and contract together, never curve only the visible road.
 - Current visual boost pad: width 3.3 m, length 5.5 m.
 - Current ramp: width 4 m, length 6 m, takeoff height 1.2 m; approaches from +Z.
 - Gate: posts at x ±2.2 m, top bar at y 2.2 m, width 4.6 m.
 - Gate bar may be non-colliding; posts and rocks must have matching hitboxes.
 - A player's footprint must be fitted to the snowboard before tuning hitboxes.
 - The view caches interactive objects by id. Use a bounded pool or add explicit removal
   during integration so a multi-track campaign does not accumulate resources.
 - Only decorative trees/flags move from distanceM inside the view. All gameplay objects
   come exclusively from frame.obstacles. No invisible duplicate colliders.
 - HUD must use snapshot values. Replace demo.mjs with a real controller for production.
 - Asynchronous loading: if the session is exited while assets load, dispose the late view
   immediately and never reattach it to the closed game. Controller owns requestAnimationFrame,
   input subscriptions, ResizeObserver policy, audio and engine lifetime.
 - View.dispose() is idempotent. Invoke it on exit, retry replacement and loading failure.
*/
