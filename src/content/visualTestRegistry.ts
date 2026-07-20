import { MILESTONE_3_COMBAT_FOUNDATION_SCENARIO } from "./liveCombatScenario";
import {
  INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES,
  INDIVIDUAL_COMBAT_VISUAL_CHAMBERS,
  INDIVIDUAL_COMBAT_VISUAL_DETAIL_LABELS,
  INDIVIDUAL_COMBAT_VISUAL_SCENARIO,
  INDIVIDUAL_COMBAT_VISUAL_SCENARIO_ID,
} from "./individualCombatVisualScenario";
import { MILESTONE_4_VISUAL_SCENARIO } from "./milestone4VisualScenario";
import {
  DEFENCE_OVERWHELM_CHAMBERS,
  DEFENCE_OVERWHELM_LEGEND_LINES,
  DEFENCE_OVERWHELM_SCENARIO,
  DEFENCE_OVERWHELM_SCENARIO_ID,
} from "./defenceOverwhelmVisualScenario";
import { MOVEMENT_BEHAVIOUR_SCENARIO } from "./movementBehaviourScenario";
import {
  CASUALTY_LIFECYCLE_EXPECTED_TIMELINE,
  CASUALTY_LIFECYCLE_RECOMMENDED_END_TICK,
  CASUALTY_LIFECYCLE_VISUAL_CHAMBERS,
  CASUALTY_LIFECYCLE_VISUAL_LEGEND_LINES,
  CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
  CASUALTY_LIFECYCLE_VISUAL_SCENARIO_ID,
} from "./casualtyLifecycleVisualScenario";
import type { SimulationScenario } from "../sim/types";

export interface VisualTestEntry {
  readonly id: string;
  readonly title: string;
  readonly milestone: string;
  readonly purpose: string;
  readonly expectedObservations: readonly string[];
  readonly legendLines?: readonly string[];
  readonly worldLabels?: readonly VisualTestWorldLabel[];
  readonly focusAreas?: readonly VisualTestFocusArea[];
  readonly showCasualtyVisuals?: boolean;
  readonly recommendedTickRange: Readonly<{
    readonly start: number;
    readonly end: number;
  }>;
  readonly scenario: SimulationScenario;
  readonly scenarioFactory: () => SimulationScenario;
}

export interface VisualTestWorldLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface VisualTestFocusArea extends VisualTestWorldLabel {
  readonly id: number;
  readonly entityIds: readonly number[];
  readonly width: number;
  readonly height: number;
}

export const VISUAL_TEST_REGISTRY: readonly VisualTestEntry[] = Object.freeze([
  Object.freeze({
    id: CASUALTY_LIFECYCLE_VISUAL_SCENARIO_ID,
    title: "Casualty lifecycle regression",
    milestone: "Milestone 6 awaiting human visual acceptance",
    purpose:
      "Retains ten isolated production-authority chambers for casualty, rescue, treatment, execution, comfort and respawn procedures.",
    expectedObservations: CASUALTY_LIFECYCLE_EXPECTED_TIMELINE,
    legendLines: CASUALTY_LIFECYCLE_VISUAL_LEGEND_LINES,
    worldLabels: Object.freeze(CASUALTY_LIFECYCLE_VISUAL_CHAMBERS.map((area) =>
      Object.freeze({
        text: `${area.id} ${area.label}`,
        x: area.centreX,
        y: area.centreY - 190,
      }),
    )),
    focusAreas: Object.freeze(CASUALTY_LIFECYCLE_VISUAL_CHAMBERS.map((area) =>
      Object.freeze({
        id: area.id,
        entityIds: area.entityIds,
        text: area.label,
        x: area.centreX,
        y: area.centreY,
        width: area.focusWidth,
        height: area.focusHeight,
      }),
    )),
    showCasualtyVisuals: true,
    recommendedTickRange: Object.freeze({
      start: 0,
      end: CASUALTY_LIFECYCLE_RECOMMENDED_END_TICK,
    }),
    scenario: CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
    scenarioFactory: () => CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
  }),
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
    scenarioFactory: () => MOVEMENT_BEHAVIOUR_SCENARIO,
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
    scenarioFactory: () => MILESTONE_3_COMBAT_FOUNDATION_SCENARIO,
  }),
  Object.freeze({
    id: INDIVIDUAL_COMBAT_VISUAL_SCENARIO_ID,
    title: "Individual combat regression",
    milestone: "Milestone 5 accepted",
    purpose:
      "Retains deterministic individual-combat chambers for defence, reach, armour hits, landed-hit gates, and zero-hit eligibility.",
    expectedObservations: Object.freeze([
      "The first frontal weapon defence parries a polearm attack.",
      "A held full shield blocks the first frontal attack.",
      "Two attackers make one defender prevent one strike while another lands through the guard opening.",
      "The polearm attacker commits from farther away than the one-handed attacker.",
      "Heavy armour starts with more global hits while ordinary accepted strikes remove one hit.",
      "Same-pair landed outcomes faster than one second are gate-rejected and do not remove hits.",
      "Separate attackers can each land one accepted hit on the same target; zero-hit fighters transition into authoritative dying state and are filtered from ordinary interaction.",
    ]),
    legendLines: INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES,
    worldLabels: Object.freeze([
      ...INDIVIDUAL_COMBAT_VISUAL_CHAMBERS.map((chamber) =>
        Object.freeze({
          text: `${chamber.id} ${chamber.label}`,
          x: chamber.centreX,
          y: chamber.centreY - 48,
        }),
      ),
      ...INDIVIDUAL_COMBAT_VISUAL_DETAIL_LABELS,
    ]),
    recommendedTickRange: Object.freeze({ start: 0, end: 80 }),
    scenario: INDIVIDUAL_COMBAT_VISUAL_SCENARIO,
    scenarioFactory: () => INDIVIDUAL_COMBAT_VISUAL_SCENARIO,
  }),
  Object.freeze({
    id: DEFENCE_OVERWHELM_SCENARIO_ID,
    title: "Guard readiness and overwhelm regression",
    milestone: "Milestone 5 accepted",
    purpose:
      "Shows persistent guard readiness, offensive openings, cadence depletion, experience recovery, and rear desperate defence.",
    expectedObservations: Object.freeze([
      "Counterattacks during attack commitment or recovery use equipment-minimum chance.",
      "Regular readiness recovers faster than recruit readiness at comparable production cadence.",
      "Same-tick attackers deplete one defender in canonical order.",
      "Veteran readiness remains above regular readiness under the same flurry.",
      "A genuine rear attack uses fixed five-percent desperate defence when equipment is usable.",
    ]),
    legendLines: DEFENCE_OVERWHELM_LEGEND_LINES,
    worldLabels: DEFENCE_OVERWHELM_CHAMBERS.map((entry) =>
      Object.freeze({
        text: `${entry.id} ${entry.label}`,
        x: entry.centreX,
        y: entry.centreY - 48,
      }),
    ),
    recommendedTickRange: Object.freeze({ start: 0, end: 120 }),
    scenario: DEFENCE_OVERWHELM_SCENARIO,
    scenarioFactory: () => DEFENCE_OVERWHELM_SCENARIO,
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
    scenarioFactory: () => MILESTONE_4_VISUAL_SCENARIO,
  }),
]);

export function findVisualTestEntry(id: string): VisualTestEntry | undefined {
  return VISUAL_TEST_REGISTRY.find((entry) => entry.id === id);
}

export function visualTestHref(id: string): string {
  return `/test?scenario=${encodeURIComponent(id)}`;
}
