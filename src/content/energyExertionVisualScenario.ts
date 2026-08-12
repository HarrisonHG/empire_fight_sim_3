import type {
  CombatSandboxUnitScenario,
  RetainedCasualtyVisualFixtureEvent,
  SimulationScenario,
} from "../sim/types";
import type { IndividualPhysicalGait } from "../sim/individualPhysicalGait";

export const ENERGY_EXERTION_VISUAL_SCENARIO_ID = "energy-exertion";
export const ENERGY_EXERTION_VISUAL_SEED = 0x7e_0001;
export const ENERGY_EXERTION_CHAMBER_SPACING = 620;
export const ENERGY_EXERTION_WORLD_WIDTH = 3_120;
export const ENERGY_EXERTION_WORLD_HEIGHT = 1_260;
export const ENERGY_EXERTION_RECOMMENDED_END_TICK = 300;

export interface EnergyExertionVisualChamber {
  readonly id: number;
  readonly label: string;
  readonly entityIds: readonly number[];
  readonly centreX: number;
  readonly centreY: number;
  readonly focusWidth: number;
  readonly focusHeight: number;
}

const CHAMBER_LABELS = Object.freeze([
  "Safe stationary recovery",
  "Walk versus jog versus sprint",
  "Equal work, different capacities",
  "Repeated attack and defence exertion",
  "Light versus heavy burden",
  "Walking versus casualty dragging",
  "Fresh versus exhausted combat recovery",
  "Safe rest versus hostile staredown",
  "Unit rest and re-engagement",
  "Barbarian downed, egress and waiting",
] as const);

const CHAMBER_ENTITY_IDS = Object.freeze([
  Object.freeze([0]),
  Object.freeze([1, 2, 3]),
  Object.freeze([4, 5]),
  Object.freeze([6, 7]),
  Object.freeze([8, 9]),
  Object.freeze([10, 11, 12, 13, 14, 15]),
  Object.freeze([16, 17, 18, 19]),
  Object.freeze([20, 21, 22]),
  Object.freeze([23, 24, 25, 26, 27]),
  Object.freeze([28]),
]);

export const ENERGY_EXERTION_VISUAL_CHAMBERS: readonly EnergyExertionVisualChamber[] =
  Object.freeze(CHAMBER_LABELS.map((label, index) => Object.freeze({
    id: index + 1,
    label,
    entityIds: CHAMBER_ENTITY_IDS[index]!,
    centreX: 320 + (index % 5) * ENERGY_EXERTION_CHAMBER_SPACING,
    centreY: 300 + Math.floor(index / 5) * ENERGY_EXERTION_CHAMBER_SPACING,
    focusWidth: 560,
    focusHeight: 500,
  })));

export const ENERGY_EXERTION_VISUAL_LEGEND_LINES = Object.freeze([
  "Energy arc: cyan fresh · green working · amber winded · red spent; the missing arc is expended capacity.",
  "Centre pip: white expenditure · blue recovery · grey stationary/no change. Detailed numeric evidence is in the hideable Individuals table.",
  "Movement requests remain production walking, jogging and sprinting; gait capability may reduce the effective and actual gait.",
  "Fixture-only energy capacities and recovery values shorten observation time. Production expenditure and recovery rules are unchanged.",
] as const);

export const ENERGY_EXERTION_EXPECTED_TIMELINE = Object.freeze([
  "1 · the stationary working fighter recovers toward full while remaining still.",
  "2 · sprint drains first, jog lasts longer, and walking remains viable; low bands visibly cap later gait.",
  "3 · equal jogging expenditure removes the same points while the smaller capacity crosses bands first.",
  "4 · repeated canonical attacks and defences produce visible action costs and readiness recovery evidence.",
  "5 · equal walking with heavy armour, held shield and polearm costs more than light unarmed movement.",
  "6 · the ordinary walker pays walking only while moving helpers pay walking plus drag surcharge and the patient is externally moved free.",
  "7 · fresh and exhausted pairs retain the same combat identity while attack and guard recovery multipliers differ.",
  "8 · the isolated fighter recovers; the otherwise-equal staredown remains constrained by nearby hostile threat.",
  "9 · the exhausted unit rests while safe, leaves rest after recovery, and resumes its existing cautious advance.",
  "10 · one continuous energy value recovers while downed, pays walking during egress, then recovers while waiting without revival.",
] as const);

const FIXTURE_EVENTS: readonly RetainedCasualtyVisualFixtureEvent[] = Object.freeze([
  hitAll(11, 14, 0),
  hitAll(28, 28, 0),
]);

export const ENERGY_EXERTION_VISUAL_SCENARIO: SimulationScenario = Object.freeze({
  seed: ENERGY_EXERTION_VISUAL_SEED,
  entityCount: 29,
  bounds: Object.freeze({
    width: ENERGY_EXERTION_WORLD_WIDTH,
    height: ENERGY_EXERTION_WORLD_HEIGHT,
  }),
  minSpeedUnitsPerTick: 1,
  maxSpeedUnitsPerTick: 1,
  combatSandbox: Object.freeze({
    kind: "liveCombatSandbox" as const,
    appliedDamagePressureScale: 1,
    includeEnergyDebug: true,
    inspectedEntityIds: Object.freeze(Array.from({ length: 29 }, (_, id) => id)),
    retainedCasualtyVisualFixture: Object.freeze({
      kind: "casualtyLifecycle" as const,
      events: FIXTURE_EVENTS,
    }),
    units: Object.freeze([
      unit(101, 1, 1, 0, 0, "Recovering stationary", {
        energyProfile: energy(500, 150, 12),
      }),

      mover(201, 2, 2, -80, -44, "Walking", "walking", {
        energyProfile: energy(2_000, 2_000, 0),
      }),
      mover(202, 2, 2, -80, 0, "Jogging", "jogging", {
        energyProfile: energy(2_000, 2_000, 0),
      }),
      mover(203, 2, 2, -80, 44, "Sprinting", "sprinting", {
        energyProfile: energy(2_000, 2_000, 0),
      }),

      mover(301, 3, 3, -80, -28, "Small capacity jog", "jogging", {
        energyProfile: energy(500, 500, 0),
      }),
      mover(302, 3, 3, -80, 28, "Large capacity jog", "jogging", {
        energyProfile: energy(1_000, 1_000, 0),
      }),

      fighter(401, 4, 4, -8, 0, "Repeated attacker", 1, {
        energyProfile: energy(700, 700, 8),
      }),
      fighter(402, 5, 4, 8, 0, "Repeated defender", -1, {
        energyProfile: energy(700, 700, 8),
        shieldClass: "shield",
        weaponCategory: "oneHanded",
        weaponReachBand: "medium",
      }),

      mover(501, 6, 5, -80, -28, "Light walking", "walking", {
        energyProfile: energy(600, 600, 0),
      }),
      mover(502, 6, 5, -80, 28, "Heavy walking", "walking", {
        energyProfile: energy(600, 600, 0),
        armourClass: "heavy",
        shieldClass: "shield",
        weaponCategory: "polearm",
        weaponReachBand: "long",
      }),

      mover(601, 7, 6, -120, -80, "Ordinary walking comparison", "walking", {
        energyProfile: energy(700, 700, 0),
      }),
      unit(602, 7, 6, 0, 24, "Drag patient", {
        energyProfile: energy(700, 350, 8),
      }),
      unit(603, 7, 6, 24, 12, "Drag helper A", {
        energyProfile: energy(700, 700, 0),
      }),
      unit(604, 7, 6, 24, 36, "Drag helper B", {
        energyProfile: energy(700, 700, 0),
      }),
      fighter(605, 8, 6, 82, 24, "Extraction threat", -1, {
        attackIntervalTicks: 1_000,
      }),
      unit(606, 7, 6, -112, 24, "Drag handoff Chirurgeon", {
        medicalProfile: Object.freeze({
          hasChirurgeon: true,
          hasPhysick: false,
          startingGenericHerbs: 0,
        }),
      }),

      fighter(701, 9, 7, -70, -28, "Fresh attacker", 1, {
        energyProfile: energy(600, 600, 0),
      }),
      fighter(702, 10, 7, -54, -28, "Fresh defender", -1, {
        energyProfile: energy(600, 600, 0),
        shieldClass: "shield",
        weaponCategory: "oneHanded",
        weaponReachBand: "medium",
      }),
      fighter(703, 11, 7, 54, 28, "Spent attacker", 1, {
        energyProfile: energy(600, 30, 0),
      }),
      fighter(704, 12, 7, 70, 28, "Spent defender", -1, {
        energyProfile: energy(600, 30, 0),
        shieldClass: "shield",
        weaponCategory: "oneHanded",
        weaponReachBand: "medium",
      }),

      unit(801, 13, 8, -100, -44, "Safe recovery", {
        energyProfile: energy(500, 150, 10),
      }),
      unit(802, 14, 8, -20, 44, "Hostile staredown subject", {
        energyProfile: energy(500, 150, 10),
      }),
      unit(803, 15, 8, 20, 44, "Staredown threat"),

      group(901, 16, 9, -120, 0, "Exhausted resting unit", 4, {
        order: "advanceCautious",
        unitSpeed: 2,
        ordinaryPhysicalGait: "jogging",
        energyProfile: energy(500, 25, 12),
      }),
      unit(902, 17, 9, 220, 0, "Distant re-engagement target", {
        weaponCategory: "unarmed",
        weaponReachBand: "none",
      }),

      unit(1001, 18, 10, -80, 0, "Barbarian energy continuity", {
        procedureKind: "barbarian",
        deathCountPolicy: Object.freeze({
          kind: "fixedTicks" as const,
          durationTicks: 40,
        }),
        respawnDestination: Object.freeze({
          x: chamber(10).centreX + 100,
          y: chamber(10).centreY,
        }),
        energyProfile: energy(500, 80, 10),
      }),
    ]),
  }),
});

function chamber(id: number): EnergyExertionVisualChamber {
  const value = ENERGY_EXERTION_VISUAL_CHAMBERS[id - 1];
  if (value === undefined) throw new RangeError(`Unknown energy chamber ${id}.`);
  return value;
}

function energy(maximumEnergy: number, startingEnergy: number, safeRestRecoveryPerTick: number) {
  return Object.freeze({ maximumEnergy, startingEnergy, safeRestRecoveryPerTick });
}

function mover(
  unitId: number,
  factionId: number,
  chamberId: number,
  offsetX: number,
  offsetY: number,
  label: string,
  gait: Exclude<IndividualPhysicalGait, "stationary">,
  overrides: UnitOverrides = {},
): CombatSandboxUnitScenario {
  return unit(unitId, factionId, chamberId, offsetX, offsetY, label, {
    order: "advanceCautious",
    unitSpeed: 3,
    ordinaryPhysicalGait: gait,
    headingX: 0,
    headingY: chamberId <= 5 ? -1 : 1,
    ...overrides,
  });
}

function fighter(
  unitId: number,
  factionId: number,
  chamberId: number,
  offsetX: number,
  offsetY: number,
  label: string,
  headingX: -1 | 1,
  overrides: UnitOverrides = {},
): CombatSandboxUnitScenario {
  return unit(unitId, factionId, chamberId, offsetX, offsetY, label, {
    headingX,
    weaponCategory: "polearm",
    weaponReachBand: "long",
    attackIntervalTicks: 8,
    maxDamageCapacity: 1_000_000,
    ...overrides,
  });
}

function group(
  unitId: number,
  factionId: number,
  chamberId: number,
  offsetX: number,
  offsetY: number,
  label: string,
  memberCount: number,
  overrides: UnitOverrides = {},
): CombatSandboxUnitScenario {
  return unit(unitId, factionId, chamberId, offsetX, offsetY, label, {
    memberCount,
    rows: 2,
    cols: 2,
    ...overrides,
  });
}

type UnitOverrides = Partial<CombatSandboxUnitScenario> & {
  readonly procedureKind?: "citizen" | "barbarian";
  readonly deathCountPolicy?: CombatSandboxUnitScenario["casualtyProcedure"]["deathCountPolicy"];
  readonly respawnDestination?: { readonly x: number; readonly y: number };
};

function unit(
  unitId: number,
  factionId: number,
  chamberId: number,
  offsetX: number,
  offsetY: number,
  label: string,
  overrides: UnitOverrides = {},
): CombatSandboxUnitScenario {
  const area = chamber(chamberId);
  const memberCount = overrides.memberCount ?? 1;
  const anchorX = area.centreX + offsetX;
  const anchorY = area.centreY + offsetY;
  const {
    procedureKind = "citizen",
    deathCountPolicy = Object.freeze({ kind: "normalFortitude" as const }),
    respawnDestination,
    casualtyProcedure: _casualtyProcedure,
    ...rest
  } = overrides;
  return Object.freeze({
    unitId,
    factionId,
    memberCount,
    deploymentZone: Object.freeze({
      minX: anchorX,
      maxX: anchorX,
      minY: anchorY,
      maxY: anchorY,
    }),
    anchorX,
    anchorY,
    headingX: 1,
    headingY: 0,
    spacing: 6,
    rows: 1,
    cols: memberCount,
    unitSpeed: 0,
    ordinaryPhysicalGait: "walking" as const,
    order: "hold" as const,
    role: "regular" as const,
    memberMaxStep: 3,
    weaponCategory: "unarmed" as const,
    weaponReachBand: "none" as const,
    armourClass: "none" as const,
    shieldClass: "none" as const,
    attackIntervalTicks: 1_000,
    maxDamageCapacity: 100,
    casualtyProcedure: Object.freeze({
      procedureKind,
      deathCountPolicy,
      ...(respawnDestination === undefined ? {} : { respawnDestination }),
    }),
    label,
    ...rest,
  });
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
