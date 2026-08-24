import type {
  PersonalSpaceSpikeEntityScenario,
  SimulationScenario,
} from "../sim/types";

export const PERSONAL_SPACE_SPIKE_SCENARIO_ID = "personal-space-spike";
export const PERSONAL_SPACE_SPIKE_RECOMMENDED_END_TICK = 1_000;

export interface PersonalSpaceSpikeChamber {
  readonly id: number;
  readonly label: string;
  readonly centreX: number;
  readonly centreY: number;
  readonly focusWidth: number;
  readonly focusHeight: number;
  readonly entityIds: readonly number[];
}

const entities: PersonalSpaceSpikeEntityScenario[] = [];
const chamberEntityIds: number[][] = Array.from({ length: 6 }, () => []);

function add(
  chamberId: number,
  x: number,
  y: number,
  requestedDeltaX: number,
  requestedDeltaY: number,
  occupancyClass: PersonalSpaceSpikeEntityScenario["occupancyClass"],
  teamId: number,
): void {
  const entityId = entities.length;
  entities.push(Object.freeze({
    entityId,
    x,
    y,
    requestedDeltaX,
    requestedDeltaY,
    occupancyClass,
    teamId,
  }));
  chamberEntityIds[chamberId - 1]!.push(entityId);
}

// 1. Two compact hostile files meet and retain a hard person-space front.
for (let row = 0; row < 3; row += 1) {
  for (let rank = 0; rank < 2; rank += 1) {
    add(1, 250 - rank * 8, 112 + row * 8, 1, 0, "activeStanding", 1);
    add(1, 350 + rank * 8, 112 + row * 8, -1, 0, "activeStanding", 2);
  }
}

// 2. A southbound allied file crosses eastbound traffic without being advected.
for (let row = 0; row < 2; row += 1) {
  for (let rank = 0; rank < 4; rank += 1) {
    add(2, 824 + rank * 8, 112 + row * 8, 1, 0, "activeStanding", 1);
    add(2, 896 + row * 8, 64 + rank * 8, 0, 1, "activeStanding", 1);
  }
}

// 3. A two-unit follower yields locally to a one-unit leader without pushing.
add(3, 310, 360, 1, 0, "activeStanding", 1);
add(3, 286, 360, 2, 0, "activeStanding", 1);

// 4. A broad soft-body band makes avoidance preferable but not mandatory.
for (let lane = 0; lane < 6; lane += 1) {
  add(4, 850, 336 + lane * 10, 2, 0, "activeStanding", 1);
  add(4, 900, 336 + lane * 10, 0, 0, "downedSoft", 1);
}

// 5. Living traffic keeps its tactical line while the egress presence yields.
for (let rank = 0; rank < 6; rank += 1) {
  add(5, 292, 536 + rank * 8, 0, 1, "activeStanding", 1);
}
add(5, 246, 584, 1, 0, "yieldingEgress", 2);

// 6. Two tightly packed 6x6 crowds expose bounded dense-front behaviour.
for (let row = 0; row < 6; row += 1) {
  for (let rank = 0; rank < 6; rank += 1) {
    add(6, 788 - rank * 8, 576 + row * 8, 1, 0, "activeStanding", 1);
    add(6, 1012 + rank * 8, 576 + row * 8, -1, 0, "activeStanding", 2);
  }
}

const CHAMBER_LAYOUT = [
  [1, "Hostile fronts settle", 300, 120],
  [2, "Allied crossing streams", 900, 120],
  [3, "Open-space overtaking", 300, 360],
  [4, "Downed soft occupancy", 900, 360],
  [5, "Yielding respawn egress", 300, 600],
  [6, "Representative dense crowd", 900, 600],
] as const;

export const PERSONAL_SPACE_SPIKE_CHAMBERS: readonly PersonalSpaceSpikeChamber[] =
  Object.freeze(CHAMBER_LAYOUT.map(([id, label, centreX, centreY]) =>
    Object.freeze({
      id,
      label,
      centreX,
      centreY,
      focusWidth: 520,
      focusHeight: 190,
      entityIds: Object.freeze([...chamberEntityIds[id - 1]!]),
    }),
  ));

export const PERSONAL_SPACE_SPIKE_EXPECTED_OBSERVATIONS = Object.freeze([
  "1 · opposing compact files stop at standing-radius contact without interpenetration, explosive separation, or front vibration.",
  "2 · one predicted crossing stream takes a bounded courtesy wait while the other clears; no axis has inherent priority and neither pair member waits reciprocally.",
  "3 · the faster rear mover takes a radius-aware committed open-space bypass while the slower leader keeps its forward motion; contact never becomes pushing.",
  "4 · movers try bounded lateral avoidance before a reduced forward step may cross the soft downed footprint.",
  "5 · the respawn-egress presence commits to bounded detours, then waits or changes tactic instead of following the living stream sideways forever.",
  "6 · the dense opposing crowd remains locally queried and bounded; persistent tactics eliminate per-tick back-corner left/right jitter.",
]);

export const PERSONAL_SPACE_SPIKE_LEGEND_LINES = Object.freeze([
  "Thin circle: personal-space footprint · amber circle: downed soft occupancy · cyan circle: yielding respawn egress.",
  "Amber vector: intended local step · green vector: collision-resolved step.",
  "Red centre mark: blocked · violet centre mark: redirected · amber centre mark: reduced soft-body crossing.",
  "Blue centre mark: a persistent 2s/5s/10s local-detour tactic is active; movement remains anchored to the original desire line.",
  "Pink centre mark: bounded pair-specific courtesy wait · teal centre mark: committed radius-aware overtake.",
  "This is the isolated Milestone 8A solver only. Production battle movement remains collision-free until later Milestone 8 slices.",
]);

export const PERSONAL_SPACE_SPIKE_SCENARIO: SimulationScenario = Object.freeze({
  seed: 0x08_a0_2026,
  entityCount: entities.length,
  bounds: Object.freeze({ width: 1_200, height: 720 }),
  minSpeedUnitsPerTick: 1,
  maxSpeedUnitsPerTick: 1,
  personalSpaceSpike: Object.freeze({
    kind: "personalSpaceSpike",
    standingRadius: 4,
    downedSoftRadius: 5,
    maximumResolutionPasses: 8,
    entities: Object.freeze([...entities]),
  }),
});
