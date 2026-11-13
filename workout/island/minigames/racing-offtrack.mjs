// racing-v23 (Roy after v22 on the phone: "maybe better to remove the walls altogether... when you go too far off the track, flip over and come back to the
// middle from speed 0"). One place for the two flags and every distance, read by the session (physics config), the view and the trackside builders.
//  ?racingWalls=1    the v9-v22 fences: physics wall, the low barrier, guardrails, rails and the old trackside layout (default: no walls, open run-off).
//  ?racingOffTrack=0 no off-track flip: the old recovery (3.5 s on the grass or 2.8 road widths away -> back to the last gate at 8-15 m/s).
// Distances are metres beyond the asphalt edge (half the road width from the centre line); the run-off asphalt of the F1 circuits ends at 4.6 m, the gravel at 9.5 m.
export const OFF_TRACK=Object.freeze({
 // measured (tools/racing-offtrack-sim.mjs, a sloppy "kid" bot that runs wide every 6-12 s): 5.5 m / 0.35 s flipped it 7.3 times a race, 7 m / 0.6 s 4.8 times,
 // in the same race time (the time goes on the slow grass, not on the flip); Roy: flip when you go out "too much", so the lenient pair is the default
 soft:7,       // deep in the gravel trap: beyond this for `dwell` seconds = flip
 dwell:.6,
 hard:9,       // beyond this = flip at once (just before the end of the gravel; the car never reaches the trackside objects, CLEAR_ZONE)
 long:4,       // this long off the asphalt without coming back (any distance) = flip too: lost on the grass (the old rule sent the car back to the last gate at 3.5 s)
 minStrength:.5, // the flip of a car that left the track is always the big one (two rolls), whatever its speed
 gate:10       // with no walls a gate counts anywhere up to this far beyond the edge (the old 0.64 road widths cut the run-off out)
});
// Solid trackside objects (tyre stacks, fences, boards, stands, trees, spectators) start this far beyond the edge when there are no walls.
export const CLEAR_ZONE=10.6;
const read=search=>{try{return new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export const racingWallsOn=search=>read(search).get('racingWalls')==='1';
export const racingOffTrackOn=search=>read(search).get('racingOffTrack')!=='0';
/** The physics part of the config, tunable from the address: ?racingOffTrackSoft=, Dwell=, Hard=, Long= (Roy can try other values on the phone). */
export function offTrackConfig(search){
 const q=read(search),num=(key,fallback,lo,hi)=>{const v=Number(q.get(key));return q.get(key)!==null&&q.get(key)!==''&&Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):fallback;};
 return {soft:num('racingOffTrackSoft',OFF_TRACK.soft,1,20),dwell:num('racingOffTrackDwell',OFF_TRACK.dwell,0,3),hard:num('racingOffTrackHard',OFF_TRACK.hard,2,30),long:num('racingOffTrackLong',OFF_TRACK.long,.5,10)};
}
/** Lane (signed distance from the centre line) of a trackside object: unchanged with walls, pushed out to the clear zone without them. */
export function clearLane(lane,half,clear,nearHalfDepth=0){
 if(!clear)return lane;const side=Math.sign(lane)||1,need=half+clear+nearHalfDepth;return Math.abs(lane)>=need?lane:side*need;
}
