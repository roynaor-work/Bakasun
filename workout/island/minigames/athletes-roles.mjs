/** Unified athletes, roles (09/11/2026). One table of who the athletes are in every sports game, so a new game (ice hockey, handball...) starts
 * from the same description instead of its own character code. Data only. Every entry names the same canonical 18-bone rig, the shared gait donor
 * (the soccer reference gaits) and the quality standard; what differs per game is the body, the clip library, the kit and what the hands hold.
 *
 * Status of a game: 'unified' = its players use athletes-gait (arms, lean, heading); 'reference' = the soccer reference itself;
 * 'planned' = not built yet (the missing pieces are listed in needs). */
import {ATHLETE_STANDARD} from './athletes-core.mjs';

export const RIG = 'canonical18';
export const SHARED = Object.freeze({rig: RIG, donor: 'assets/athletes-v1/gait-donor.json', standard: ATHLETE_STANDARD, heading: 'athletes-gait.stepHeading', feelScoreMin: ATHLETE_STANDARD.feelScoreMin});

export const ATHLETE_ROLES = Object.freeze({
  soccer: {
    status: 'reference', module: 'soccer-athlete.mjs', clips: ['assets/soccer-v9/clips.json', 'assets/soccer-v10/clips.json'],
    roles: {field: {heightM: 1.78, holds: 'none'}, keeper: {heightM: 1.86, holds: 'ball in hands'}},
    kit: 'KIT shader (soccer-athlete.mjs: skin tone, hair, kit colours, numbers)', notes: 'The quality reference. Its gaits are the donor of the other games.',
  },
  basketball: {
    status: 'unified', module: 'hoops-tall.mjs', clips: ['assets/hoops-tall/motion.json', 'assets/hoops-v8/motion.json'],
    roles: {guard: {heightM: 1.88, holds: 'ball'}, wing: {heightM: 1.98, holds: 'ball'}, center: {heightM: 2.08, holds: 'ball'}},
    kit: 'vertex colours of the merged body (hoops-tall.mjs applyKit)', notes: 'Gaits and idle arms unified in 2026-11 (athletes-gait.unifyTallPack); the visible body heading follows the travel direction.',
  },
  tennis: {
    status: 'partial', module: 'tennis-view.mjs', clips: ['assets/tennis-motion-v1/core.json'],
    roles: {player: {heightM: 1.8, holds: 'racket'}},
    kit: 'character kid-full.glb, own materials', notes: 'Legs and spine from the clips, arms and racket by contact IK (the racket must meet the ball), so the arm carry stays with the IK; the run clips measure 65 degrees of arm abduction and are not used for the arms.',
  },
  hockey: {
    status: 'planned', module: null, clips: [],
    roles: {skater: {heightM: 1.85, holds: 'stick'}, goalie: {heightM: 1.85, holds: 'blocker and catcher'}},
    kit: 'jersey and helmet colours on the canonical body', needs: [
      'skating gait on the canonical rig: stride, glide, crossover, stop (no feet planted, so foot lock is replaced by edge contact)',
      'stick: a prop bone on the right hand, shot clips (wrist, slap, pass, receive)',
      'goalie: stance, butterfly, side slide, glove save',
      'skates and the pad volumes in the body model',
    ],
  },
});

/** The games whose players must pass the same checks (tests iterate this). */
export const unifiedSports = () => Object.entries(ATHLETE_ROLES).filter(([, v]) => v.status === 'unified' || v.status === 'reference').map(([k]) => k);
/** Everything a new sport has to provide before it can use the shared layer; empty list = ready. */
export function missingForSport(entry) {
  const need = [];
  if (!entry.module) need.push('a module that builds the players');
  if (!entry.clips?.length) need.push('a motion library on the canonical rig');
  if (!entry.roles || !Object.keys(entry.roles).length) need.push('roles with heights');
  return need.concat(entry.needs || []);
}
