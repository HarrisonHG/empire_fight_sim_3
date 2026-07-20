import type {
  CombatSandboxUnitScenario,
  RetainedCasualtyVisualFixtureEvent,
  SimulationScenario,
} from "../sim/types";
import {
  calculateTraumaticWoundOpportunityRoll,
  type IndividualTraumaticWoundOpportunity,
} from "../sim/individualTraumaticWound";

export const CASUALTY_LIFECYCLE_VISUAL_SCENARIO_ID = "casualty-lifecycle";
export const CASUALTY_LIFECYCLE_VISUAL_SEED = 0x6c_0004;
export const CASUALTY_LIFECYCLE_CHAMBER_SPACING = 620;
export const CASUALTY_LIFECYCLE_LOCAL_INTERACTION_RADIUS = 192;
export const CASUALTY_LIFECYCLE_WORLD_WIDTH = 3_120;
export const CASUALTY_LIFECYCLE_WORLD_HEIGHT = 1_260;
export const CASUALTY_LIFECYCLE_RECOMMENDED_END_TICK = 2_650;

export interface CasualtyLifecycleVisualChamber {
  readonly id: number;
  readonly label: string;
  readonly entityIds: readonly number[];
  readonly centreX: number;
  readonly centreY: number;
  readonly focusWidth: number;
  readonly focusHeight: number;
}

const CHAMBER_LABELS = Object.freeze([
  "Zero hits and interaction filtering",
  "Normal versus Fortitude death count",
  "Chirurgeon pause and successful save",
  "Interrupted herb treatment",
  "Two-fighter drag, safety and handoff",
  "Solo-Physick drag and treatment",
  "Citizen trauma withdrawal and return",
  "Execution and terminal citizen comfort",
  "Barbarian immunity, egress and waiting",
  "Herb-backed versus herb-free limb treatment",
] as const);

const CHAMBER_ENTITY_IDS = Object.freeze([
  Object.freeze([0, 1]),
  Object.freeze([2, 3]),
  Object.freeze([4, 5]),
  Object.freeze([6, 7]),
  Object.freeze([8, 9, 10, 11, 24]),
  Object.freeze([12, 13, 26]),
  Object.freeze([14, 15, 25]),
  Object.freeze([16, 17, 18]),
  Object.freeze([19]),
  Object.freeze([20, 21, 22, 23]),
]);

export const CASUALTY_LIFECYCLE_VISUAL_CHAMBERS: readonly CasualtyLifecycleVisualChamber[] =
  Object.freeze(CHAMBER_LABELS.map((label, index) => Object.freeze({
    id: index + 1,
    label,
    entityIds: CHAMBER_ENTITY_IDS[index]!,
    centreX: 320 + (index % 5) * CASUALTY_LIFECYCLE_CHAMBER_SPACING,
    centreY: 300 + Math.floor(index / 5) * CASUALTY_LIFECYCLE_CHAMBER_SPACING,
    focusWidth: 560,
    focusHeight: 500,
  })));

export const CASUALTY_LIFECYCLE_VISUAL_LEGEND_LINES = Object.freeze([
  "Lifecycle: green ring active · red cross dying · violet square terminal awaiting comfort · cyan diamond comforted.",
  "Presence: amber chevrons respawn egress · blue double-square waiting at respawn.",
  "Procedure: red burst fresh zero · outlined ring-arc death clock · pause bars owned pause · orange rescue/drag lines and destination · short bars committed drag hands.",
  "Medicine: gold claim line · white approach arrow · H current/reserved herb · A/L disabled arm/leg · magenta trauma.",
  "Treatment clocks: outlined ring arcs; cyan dying · green missing hit · magenta trauma · amber herb limb · red herb-free limb · violet comfort.",
  "Execution: outward arrow executing · inward brackets being executed · shared red ring clock · persistent red dagger completion.",
  "Outcomes: ! interruption · + restoration · heart comfort completion · combat-event crosses expire after their short standard lifetime.",
  "Production treatment, comfort and execution durations are unchanged. Chamber 9 uses an explicit 60-tick visual death-count policy.",
] as const);

export const CASUALTY_LIFECYCLE_EXPECTED_TIMELINE = Object.freeze([
  "1 · t0 first step: target reaches zero; later snapshots retain dying and no-target eligibility.",
  "2 · t0: normal and Fortitude counts start together; Fortitude has the longer authoritative duration.",
  "3 · early claim/approach; 600 valid progress ticks restore one hit after an owned pause.",
  "4 · early herb reservation; t40 range interruption releases it; t80 return allows a fresh action and later consumption.",
  "5 · hostile exposure drives a sustained two-helper extraction toward safety, then physical Chirurgeon handoff.",
  "6 · hostile exposure drives a sustained solo-Physick extraction, claim and Chirurgeon treatment.",
  "7 · t3 trauma makes the armed citizen ignore the nearby hostile, withdraw to the Physick, receive herb treatment and return.",
  "8 · t0 execution starts with distinct actor/target roles; t100 completes; the executor steps sideways; t120 Physick arrives; comfort follows.",
  "9 · early barbarian trauma opportunity is ignored; t60 death-count expiry begins egress, then waiting remains terminal.",
  "10 · early limb claims; disabled leg uses 600-tick herb treatment while disabled arm uses 2,400-tick herb-free treatment.",
] as const);

export const CASUALTY_LIFECYCLE_TRAUMA_TICK = findSuccessfulTraumaTick(14, 25, 0);

const FIXTURE_EVENTS: readonly RetainedCasualtyVisualFixtureEvent[] = Object.freeze([
  hitAll(0, 1, 0),
  hitAll(2, 1, 0),
  hitAll(3, 1, 0),
  hitAll(4, 5, 0),
  hitLoss(6, 7, 1, 0),
  hitAll(8, 9, 0),
  hitAll(12, 13, 0),
  Object.freeze({
    tick: CASUALTY_LIFECYCLE_TRAUMA_TICK,
    kind: "traumaticWoundOpportunity" as const,
    attackerEntityId: 25,
    targetEntityId: 14,
    triggerKind: "limbCleave" as const,
  }),
  hitAll(16, 17, 0),
  Object.freeze({
    tick: 0,
    kind: "executionIntent" as const,
    executorEntityId: 17,
    targetEntityId: 16,
  }),
  ...Array.from({ length: 24 }, (_, index) => Object.freeze({
    tick: 101 + index,
    kind: "boundedMove" as const,
    entityId: 17,
    goalX: chamber(8).centreX + 4,
    goalY: chamber(8).centreY + 48,
  })),
  Object.freeze({
    tick: 120,
    kind: "relocate" as const,
    entityId: 18,
    x: chamber(8).centreX + 4,
    y: chamber(8).centreY,
  }),
  Object.freeze({
    tick: 0,
    kind: "traumaticWoundOpportunity" as const,
    attackerEntityId: 19,
    targetEntityId: 19,
    triggerKind: "limbCleave" as const,
  }),
  hitAll(19, 19, 0),
  Object.freeze({
    tick: 0,
    kind: "limbDisability" as const,
    entityId: 20,
    disability: "disabledLeg" as const,
  }),
  Object.freeze({
    tick: 0,
    kind: "limbDisability" as const,
    entityId: 20,
    disability: "disabledArm" as const,
  }),
  Object.freeze({
    tick: 0,
    kind: "limbDisability" as const,
    entityId: 22,
    disability: "disabledArm" as const,
  }),
  Object.freeze({
    tick: 40,
    kind: "relocate" as const,
    entityId: 7,
    x: chamber(4).centreX + 180,
    y: chamber(4).centreY,
  }),
  Object.freeze({
    tick: 80,
    kind: "relocate" as const,
    entityId: 7,
    x: chamber(4).centreX + 4,
    y: chamber(4).centreY,
  }),
]);

export const CASUALTY_LIFECYCLE_VISUAL_SCENARIO: SimulationScenario = Object.freeze({
  seed: CASUALTY_LIFECYCLE_VISUAL_SEED,
  entityCount: 27,
  bounds: Object.freeze({
    width: CASUALTY_LIFECYCLE_WORLD_WIDTH,
    height: CASUALTY_LIFECYCLE_WORLD_HEIGHT,
  }),
  minSpeedUnitsPerTick: 1,
  maxSpeedUnitsPerTick: 1,
  combatSandbox: Object.freeze({
    kind: "liveCombatSandbox" as const,
    appliedDamagePressureScale: 1,
    inspectedEntityIds: Object.freeze(Array.from({ length: 27 }, (_, id) => id)),
    retainedCasualtyVisualFixture: Object.freeze({
      kind: "casualtyLifecycle" as const,
      events: FIXTURE_EVENTS,
    }),
    units: Object.freeze([
      unit(101, 1, 1, -18, 0, "Zero-hit patient"),
      unit(102, 2, 1, 18, 0, "Interaction-filter observer"),
      unit(201, 3, 2, -36, 0, "Normal death count"),
      unit(202, 4, 2, 36, 0, "Fortitude rank five", { fortitudeLevels: 5 }),
      unit(301, 5, 3, 0, 0, "Dying patient"),
      unit(302, 5, 3, 20, 0, "Chirurgeon", {
        medicalProfile: medical(true, true, 0),
      }),
      unit(401, 6, 4, 0, 0, "Living missing-hit patient", { armourClass: "heavy" }),
      unit(402, 6, 4, 4, 0, "Herb Physick", {
        medicalProfile: medical(true, true, 2),
      }),
      unit(501, 7, 5, 0, 0, "Two-fighter drag patient"),
      unit(502, 7, 5, 20, -12, "Ordinary helper A"),
      unit(503, 7, 5, 20, 12, "Ordinary helper B"),
      unit(504, 7, 5, -96, 0, "Handoff Chirurgeon", {
        medicalProfile: medical(true, false, 0),
      }),
      unit(601, 8, 6, 0, 0, "Solo-drag patient"),
      unit(602, 8, 6, 20, 0, "Solo Physick carrier", {
        medicalProfile: medical(true, true, 0),
      }),
      unit(701, 9, 7, -60, 0, "Traumatised citizen", {
        weaponCategory: "twoHanded",
        weaponReachBand: "medium",
        attackIntervalTicks: 1_000,
      }),
      unit(702, 9, 7, 60, 0, "Trauma Physick", {
        medicalProfile: medical(true, true, 1),
      }),
      unit(801, 10, 8, 0, 0, "Execution target"),
      unit(802, 10, 8, 4, 0, "Explicit executor"),
      unit(803, 10, 8, 240, 0, "Terminal-comfort Physick", {
        medicalProfile: medical(true, true, 0),
      }),
      unit(901, 12, 9, 0, 0, "Barbarian casualty", {
        procedureKind: "barbarian",
        deathCountPolicy: Object.freeze({ kind: "fixedTicks" as const, durationTicks: 60 }),
        respawnDestination: Object.freeze({
          x: chamber(9).centreX + 120,
          y: chamber(9).centreY,
        }),
      }),
      unit(1001, 13, 10, -100, 0, "Leg-priority patient; arm also disabled"),
      unit(1002, 13, 10, -96, 0, "Herb-backed limb Physick", {
        medicalProfile: medical(true, true, 1),
      }),
      unit(1003, 14, 10, 100, 0, "Disabled-arm patient"),
      unit(1004, 14, 10, 104, 0, "Herb-free limb Physick", {
        medicalProfile: medical(true, true, 0),
      }),
      unit(505, 15, 5, 80, 0, "Hostile extraction pressure", {
        headingX: -1,
        weaponCategory: "oneHanded",
        weaponReachBand: "medium",
        attackIntervalTicks: 1_000,
      }),
      unit(703, 17, 7, -56, 0, "Ignored hostile", {
        headingX: -1,
        weaponCategory: "oneHanded",
        weaponReachBand: "medium",
        attackIntervalTicks: 1_000,
      }),
      unit(603, 16, 6, 80, 0, "Hostile solo-extraction pressure", {
        headingX: -1,
        weaponCategory: "oneHanded",
        weaponReachBand: "medium",
        attackIntervalTicks: 1_000,
      }),
    ]),
  }),
});

function chamber(id: number): CasualtyLifecycleVisualChamber {
  const value = CASUALTY_LIFECYCLE_VISUAL_CHAMBERS[id - 1];
  if (value === undefined) throw new RangeError(`Unknown casualty chamber ${id}.`);
  return value;
}

function unit(
  unitId: number,
  factionId: number,
  chamberId: number,
  offsetX: number,
  offsetY: number,
  label: string,
  overrides: Partial<CombatSandboxUnitScenario> & {
    readonly procedureKind?: "citizen" | "barbarian";
    readonly deathCountPolicy?: CombatSandboxUnitScenario["casualtyProcedure"]["deathCountPolicy"];
    readonly respawnDestination?: { readonly x: number; readonly y: number };
  } = {},
): CombatSandboxUnitScenario {
  const area = chamber(chamberId);
  const x = area.centreX + offsetX;
  const y = area.centreY + offsetY;
  const {
    procedureKind = "citizen",
    deathCountPolicy = Object.freeze({ kind: "normalFortitude" as const }),
    respawnDestination,
    ...unitOverrides
  } = overrides;
  return Object.freeze({
    unitId,
    factionId,
    memberCount: 1,
    deploymentZone: Object.freeze({ minX: x, maxX: x, minY: y, maxY: y }),
    anchorX: x,
    anchorY: y,
    headingX: 1,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: 1,
    unitSpeed: 0,
    order: "hold" as const,
    role: "regular" as const,
    memberMaxStep: 2,
    weaponCategory: "unarmed" as const,
    weaponReachBand: "none" as const,
    armourClass: "none" as const,
    shieldClass: "none" as const,
    attackIntervalTicks: 20,
    maxDamageCapacity: 1_000_000,
    casualtyProcedure: Object.freeze({
      procedureKind,
      deathCountPolicy,
      ...(respawnDestination === undefined ? {} : { respawnDestination }),
    }),
    label,
    ...unitOverrides,
  });
}

function medical(
  hasChirurgeon: boolean,
  hasPhysick: boolean,
  startingGenericHerbs: number,
): NonNullable<CombatSandboxUnitScenario["medicalProfile"]> {
  return Object.freeze({ hasChirurgeon, hasPhysick, startingGenericHerbs });
}

function hitAll(
  targetEntityId: number,
  attackerEntityId: number,
  tick: number,
): RetainedCasualtyVisualFixtureEvent {
  return Object.freeze({
    tick,
    kind: "landedHitLoss" as const,
    attackerEntityId,
    targetEntityId,
    hitLoss: "all" as const,
  });
}

function hitLoss(
  targetEntityId: number,
  attackerEntityId: number,
  amount: number,
  tick: number,
): RetainedCasualtyVisualFixtureEvent {
  return Object.freeze({
    tick,
    kind: "landedHitLoss" as const,
    attackerEntityId,
    targetEntityId,
    hitLoss: amount,
  });
}

function findSuccessfulTraumaTick(
  targetEntityId: number,
  attackerEntityId: number,
  startTick: number,
): number {
  for (let tick = startTick; tick < startTick + 10_000; tick += 1) {
    const opportunity: IndividualTraumaticWoundOpportunity = {
      targetEntityId,
      attackerEntityId,
      tick,
      triggerKind: "limbCleave",
    };
    if (calculateTraumaticWoundOpportunityRoll(
      CASUALTY_LIFECYCLE_VISUAL_SEED,
      opportunity,
    ) < 100) return tick;
  }
  throw new Error("Expected a deterministic casualty visual trauma opportunity.");
}
