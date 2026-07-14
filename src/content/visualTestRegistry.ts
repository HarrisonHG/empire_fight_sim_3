import { MILESTONE_3_COMBAT_FOUNDATION_SCENARIO } from "./liveCombatScenario";
import {
  INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES,
  INDIVIDUAL_COMBAT_VISUAL_SCENARIO,
  INDIVIDUAL_COMBAT_VISUAL_SCENARIO_ID,
} from "./individualCombatVisualScenario";
import { MILESTONE_4_VISUAL_SCENARIO } from "./milestone4VisualScenario";
import { MOVEMENT_BEHAVIOUR_SCENARIO } from "./movementBehaviourScenario";
import type { SimulationScenario } from "../sim/types";

export interface VisualTestEntry {
  readonly id: string;
  readonly title: string;
  readonly milestone: string;
  readonly purpose: string;
  readonly expectedObservations: readonly string[];
  readonly legendLines?: readonly string[];
  readonly recommendedTickRange: Readonly<{
    readonly start: number;
    readonly end: number;
  }>;
  readonly scenario: SimulationScenario;
}

export const VISUAL_TEST_REGISTRY: readonly VisualTestEntry[] = Object.freeze([
  Object.freeze({
    id: "movement-behaviour",
    title: "Movement behaviour regression",
    milestone: "Milestone 2",
    purpose:
      "Retains the accepted formation movement and allied-blocker arbitration cases.",
    expectedObservations: Object.freeze([
      "An unblocked unit formed-marches while an ordered unit remains halted.",
      "Allied blockers produce formed detour, loose flow, and halt-and-wait lanes.",
      "Push-through visibly disrupts both allied formations.",
      "The veteran formation remains more stable than recruits under equal pressure.",
    ]),
    recommendedTickRange: Object.freeze({ start: 0, end: 120 }),
    scenario: MOVEMENT_BEHAVIOUR_SCENARIO,
  }),
  Object.freeze({
    id: "combat-foundation",
    title: "Archived combat foundation regression",
    milestone: "Milestone 3",
    purpose:
      "Retains the accepted 20-blue versus 15-red unit-level combat pipeline as an isolated archived fixture.",
    expectedObservations: Object.freeze([
      "Both sides advance and their reach-aware fronts engage without interpenetrating.",
      "Archived opportunity, strike, application, and consequence counters accumulate.",
      "Pressure and morale diagnostics update.",
      "No entities die or disappear.",
    ]),
    recommendedTickRange: Object.freeze({ start: 0, end: 420 }),
    scenario: MILESTONE_3_COMBAT_FOUNDATION_SCENARIO,
  }),
  Object.freeze({
    id: INDIVIDUAL_COMBAT_VISUAL_SCENARIO_ID,
    title: "Individual combat regression",
    milestone: "Milestone 5 pending human inspection",
    purpose:
      "Retains deterministic individual-combat chambers for defence, reach, armour hits, landed-hit gates, and zero-hit eligibility.",
    expectedObservations: Object.freeze([
      "The first frontal weapon defence parries a polearm attack.",
      "A held full shield blocks the first frontal attack.",
      "Two attackers make one defender prevent one strike while another lands through the guard opening.",
      "The polearm attacker commits from farther away than the one-handed attacker.",
      "Heavy armour starts with more global hits while ordinary accepted strikes remove one hit.",
      "Same-pair landed outcomes faster than one second are gate-rejected and do not remove hits.",
      "Separate attackers can each land one accepted hit on the same target; zero-hit fighters remain standing until the casualty milestone.",
    ]),
    legendLines: INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES,
    recommendedTickRange: Object.freeze({ start: 0, end: 80 }),
    scenario: INDIVIDUAL_COMBAT_VISUAL_SCENARIO,
  }),
  Object.freeze({
    id: "morale-inspection",
    title: "Morale, routing, and recovery regression",
    milestone: "Milestone 4",
    purpose:
      "Combines the accepted comparison, contagion, and pursuit inspections in isolated areas.",
    expectedObservations: Object.freeze([
      "The recruit breaks first; the regular degrades faster than the veteran.",
      "The routed recruit passes through and disrupts the reserve.",
      "Routed units flee before stopping; recovering units halt and reform.",
      "The veteran pursuit subject reaches steady and re-engages before the regular.",
    ]),
    recommendedTickRange: Object.freeze({ start: 0, end: 800 }),
    scenario: MILESTONE_4_VISUAL_SCENARIO,
  }),
]);

export function findVisualTestEntry(id: string): VisualTestEntry | undefined {
  return VISUAL_TEST_REGISTRY.find((entry) => entry.id === id);
}

export function visualTestHref(id: string): string {
  return `/test?scenario=${encodeURIComponent(id)}`;
}
