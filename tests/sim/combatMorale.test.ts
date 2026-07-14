import { describe, expect, it } from "vitest";

import type { CombatConsequenceApplication } from "../../src/sim/combatConsequences";
import {
  assessUnitCombatMorale,
  collectCombatMoraleAssessments,
  collectCombatMoraleAssessmentsFromIndividualConsequences,
  type CombatMoraleAssessment,
} from "../../src/sim/combatMorale";
import type { IndividualCombatUnitConsequenceSummary } from "../../src/sim/individualCombatConsequences";
import {
  createCombatSurvivabilityStore,
  getUnitAccumulatedDamage,
  getUnitMaxDamageCapacity,
  isUnitDamageCapacityReached,
  type CombatSurvivabilityStore,
} from "../../src/sim/combatSurvivability";
import { createCombatTempoStore, getUnitAttackCooldownTicks } from "../../src/sim/combatTempo";
import {
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitAnchor,
  getUnitCohesion,
  getUnitHeading,
  getUnitMovementStyle,
  getUnitOrder,
  type FormationBehaviourStore,
} from "../../src/sim/formationBehaviour";
import type { WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  getFactionIdForUnit,
  getUnitIds,
  getUnitMembers,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";
import {
  createUnitLoadoutStore,
  getUnitLoadoutSummary,
  type UnitLoadoutStore,
} from "../../src/sim/unitLoadout";

const FORBIDDEN_MORALE_TERMS = [
  "death",
  "dead",
  "removal",
  "removed",
  "wound",
  "wounds",
  "healing",
  "call",
  "shout",
  "special",
  "effect",
  "movement",
  "displacement",
] as const;

describe("combat morale assessments", () => {
  it("reports steady defaults without recent combat context", () => {
    const harness = createMoraleHarness({});

    const assessment = assessUnitCombatMorale(
      harness.identity,
      harness.formation,
      10,
    );

    expect(assessment).toEqual({
      unitId: 10,
      memberEntityIds: [0, 1],
      pressureTotal: 0,
      pressureAverage: 0,
      pressureMaximum: 0,
      cohesion: 1_000,
      recentCombatShockValue: 0,
      recentCombatShockSource: "none",
      moraleState: "steady",
      breakRiskReasonCodes: [],
    });
  });

  it("classifies pressure average thresholds deterministically", () => {
    expect(
      assessTarget({
        initialPressureByEntityId: pressureMap([
          [2, 20],
          [3, 20],
          [4, 20],
        ]),
      }),
    ).toMatchObject({
      pressureTotal: 60,
      pressureAverage: 20,
      pressureMaximum: 20,
      moraleState: "pressured",
      breakRiskReasonCodes: ["pressureAverage"],
    });
    expect(
      assessTarget({
        initialPressureByEntityId: pressureMap([
          [2, 50],
          [3, 50],
          [4, 50],
        ]),
      }),
    ).toMatchObject({
      pressureAverage: 50,
      moraleState: "wavering",
      breakRiskReasonCodes: ["pressureAverage", "pressureMaximum"],
    });
    expect(
      assessTarget({
        initialPressureByEntityId: pressureMap([
          [2, 80],
          [3, 80],
          [4, 80],
        ]),
      }),
    ).toMatchObject({
      pressureAverage: 80,
      moraleState: "breakRisk",
      breakRiskReasonCodes: ["pressureAverage", "pressureMaximum"],
    });
  });

  it("classifies pressure maximum thresholds independently of average pressure", () => {
    expect(
      assessTarget({
        initialPressureByEntityId: pressureMap([
          [2, 0],
          [3, 0],
          [4, 30],
        ]),
      }),
    ).toMatchObject({
      pressureAverage: 10,
      pressureMaximum: 30,
      moraleState: "pressured",
      breakRiskReasonCodes: ["pressureMaximum"],
    });
    expect(
      assessTarget({
        initialPressureByEntityId: pressureMap([
          [2, 0],
          [3, 0],
          [4, 70],
        ]),
      }),
    ).toMatchObject({
      pressureMaximum: 70,
      moraleState: "wavering",
      breakRiskReasonCodes: ["pressureAverage", "pressureMaximum"],
    });
    expect(
      assessTarget({
        initialPressureByEntityId: pressureMap([
          [2, 0],
          [3, 0],
          [4, 100],
        ]),
      }),
    ).toMatchObject({
      pressureMaximum: 100,
      moraleState: "breakRisk",
      breakRiskReasonCodes: ["pressureAverage", "pressureMaximum"],
    });
  });

  it("classifies cohesion thresholds without mutating cohesion", () => {
    expect(assessTarget({ targetCohesion: 700 })).toMatchObject({
      cohesion: 700,
      moraleState: "pressured",
      breakRiskReasonCodes: ["lowCohesion"],
    });
    expect(assessTarget({ targetCohesion: 400 })).toMatchObject({
      cohesion: 400,
      moraleState: "wavering",
      breakRiskReasonCodes: ["lowCohesion"],
    });
    expect(assessTarget({ targetCohesion: 200 })).toMatchObject({
      cohesion: 200,
      moraleState: "breakRisk",
      breakRiskReasonCodes: ["lowCohesion"],
    });
  });

  it("uses recent consequence combat shock as pressured context", () => {
    const harness = createMoraleHarness({});
    const recentConsequences = [
      consequenceRecord({ targetUnitId: 20, cohesionDamageValue: 3 }),
    ];

    const assessment = assessUnitCombatMorale(
      harness.identity,
      harness.formation,
      20,
      recentConsequences,
    );

    expect(assessment).toMatchObject({
      recentCombatShockValue: 3,
      recentCombatShockSource: "legacyConsequence",
      moraleState: "pressured",
      breakRiskReasonCodes: ["combatShock"],
    });
  });

  it("ignores recent consequence records for other target units", () => {
    const harness = createMoraleHarness({});
    const recentConsequences = [
      consequenceRecord({ targetUnitId: 30, cohesionDamageValue: 9 }),
    ];

    const assessment = assessUnitCombatMorale(
      harness.identity,
      harness.formation,
      20,
      recentConsequences,
    );

    expect(assessment).toMatchObject({
      recentCombatShockValue: 0,
      recentCombatShockSource: "none",
      moraleState: "steady",
      breakRiskReasonCodes: [],
    });
  });

  it("maps archived capacity events as break-risk combat shock context", () => {
    const harness = createMoraleHarness({});
    const recentConsequences = [
      consequenceRecord({
        targetUnitId: 20,
        cohesionDamageValue: 1,
        capacityReached: true,
      }),
    ];

    const assessment = assessUnitCombatMorale(
      harness.identity,
      harness.formation,
      20,
      recentConsequences,
    );

    expect(assessment).toMatchObject({
      recentCombatShockValue: 1,
      recentCombatShockSource: "legacyCapacityReached",
      moraleState: "breakRisk",
      breakRiskReasonCodes: ["combatShock", "combatShockBreakRisk"],
    });
  });

  it("uses individual newly-zero transitions as the morale shock context", () => {
    const harness = createMoraleHarness({});

    const result = collectCombatMoraleAssessmentsFromIndividualConsequences(
      harness.identity,
      harness.formation,
      [
        individualConsequenceSummary(20, {
          newlyZeroMembers: 1,
          incomingZeroHitTransitions: 1,
        }),
      ],
      [],
    );

    expect(result.assessments.find((assessment) => assessment.unitId === 20))
      .toMatchObject({
        recentCombatShockValue: 1,
        recentCombatShockSource: "individualZeroHit",
        moraleState: "breakRisk",
        breakRiskReasonCodes: ["combatShock", "combatShockBreakRisk"],
      });
    expect(getUnitAccumulatedDamage(harness.survivability, 20)).toBe(0);
    expect(isUnitDamageCapacityReached(harness.survivability, 20)).toBe(false);
  });

  it("combines reason codes in stable priority order", () => {
    const assessment = assessTarget({
      targetCohesion: 150,
      initialPressureByEntityId: pressureMap([
        [2, 100],
        [3, 90],
        [4, 80],
      ]),
      recentConsequences: [
        consequenceRecord({
          targetUnitId: 20,
          cohesionDamageValue: 2,
          capacityReached: true,
        }),
      ],
    });

    expect(assessment).toMatchObject({
      moraleState: "breakRisk",
      breakRiskReasonCodes: [
        "pressureAverage",
        "pressureMaximum",
        "lowCohesion",
        "combatShock",
        "combatShockBreakRisk",
      ],
    });
  });

  it("collects assessments in deterministic unit order", () => {
    const harness = createMoraleHarness({
      unitDefinitions: [
        { unitId: 30, factionId: 3, memberEntityIds: [5] },
        { unitId: 10, factionId: 1, memberEntityIds: [0, 1] },
        { unitId: 20, factionId: 2, memberEntityIds: [2, 3, 4] },
      ],
    });

    const result = collectCombatMoraleAssessments(
      harness.identity,
      harness.formation,
    );

    expect(result.assessments.map((record) => record.unitId)).toEqual([
      10,
      20,
      30,
    ]);
  });

  it("reuses caller-provided output arrays without retaining stale records", () => {
    const harness = createMoraleHarness({});
    const out: CombatMoraleAssessment[] = [
      staleAssessmentRecord(),
      staleAssessmentRecord(),
    ];

    const first = collectCombatMoraleAssessments(
      harness.identity,
      harness.formation,
      [],
      out,
    );
    const second = collectCombatMoraleAssessments(
      harness.identity,
      harness.formation,
      [consequenceRecord({ targetUnitId: 20, cohesionDamageValue: 1 })],
      out,
    );

    expect(first.assessments).toBe(out);
    expect(second.assessments).toBe(out);
    expect(out).toHaveLength(3);
    expect(out.map((record) => record.unitId)).toEqual([10, 20, 30]);
    expect(out[1]).toMatchObject({
      unitId: 20,
      moraleState: "pressured",
      recentCombatShockValue: 1,
    });
  });

  it("throws RangeError for unknown units and mismatched identity/formation stores", () => {
    const harness = createMoraleHarness({});
    const mismatchedFormation = {
      entityCount: harness.identity.entityCount - 1,
      unitCount: harness.identity.unitCount,
    } as FormationBehaviourStore;

    expect(() =>
      assessUnitCombatMorale(harness.identity, harness.formation, 999),
    ).toThrow(RangeError);
    expect(() =>
      collectCombatMoraleAssessments(harness.identity, mismatchedFormation),
    ).toThrow(RangeError);
    expect(() =>
      collectCombatMoraleAssessments(harness.identity, harness.formation, [
        consequenceRecord({ targetUnitId: 999 }),
      ]),
    ).toThrow(RangeError);
  });

  it("does not mutate world, stores, or recent consequence records", () => {
    const harness = createMoraleHarness({
      targetCohesion: 650,
      initialPressureByEntityId: pressureMap([
        [2, 20],
        [3, 25],
        [4, 30],
      ]),
    });
    const recentConsequences = Object.freeze([
      Object.freeze(consequenceRecord({ targetUnitId: 20 })),
      Object.freeze(consequenceRecord({ targetUnitId: 30 })),
    ]);
    const beforeState = snapshotHarnessState(harness);
    const beforeConsequences = JSON.stringify(recentConsequences);

    collectCombatMoraleAssessments(
      harness.identity,
      harness.formation,
      recentConsequences,
    );

    expect(snapshotHarnessState(harness)).toEqual(beforeState);
    expect(JSON.stringify(recentConsequences)).toBe(beforeConsequences);
  });

  it("produces repeated deterministic runs from identical starting state", () => {
    const run = (): readonly unknown[] => {
      const harness = createMoraleHarness({
        targetCohesion: 390,
        initialPressureByEntityId: pressureMap([
          [2, 40],
          [3, 50],
          [4, 60],
        ]),
      });
      const result = collectCombatMoraleAssessments(
        harness.identity,
        harness.formation,
        [
          consequenceRecord({ targetUnitId: 20, cohesionDamageValue: 1 }),
          consequenceRecord({ targetUnitId: 30, capacityReached: true }),
        ],
      );
      return [result.assessments, snapshotHarnessState(harness)];
    };

    expect(run()).toEqual(run());
  });

  it("does not emit death, removal, wounds, healing, calls, shouts, special-effect, or movement-displacement fields", () => {
    const assessment = assessTarget({
      targetCohesion: 150,
      initialPressureByEntityId: pressureMap([
        [2, 90],
        [3, 90],
        [4, 90],
      ]),
      recentConsequences: [
        consequenceRecord({ targetUnitId: 20, capacityReached: true }),
      ],
    });

    expect(Object.keys(assessment).sort()).toEqual([
      "breakRiskReasonCodes",
      "cohesion",
      "memberEntityIds",
      "moraleState",
      "pressureAverage",
      "pressureMaximum",
      "pressureTotal",
      "recentCombatShockSource",
      "recentCombatShockValue",
      "unitId",
    ]);
    expect(JSON.stringify(assessment)).not.toMatch(
      forbiddenMoraleTermPattern(),
    );
  });
});

interface MoraleHarnessOptions {
  readonly unitDefinitions?: readonly MoraleUnitDefinition[];
  readonly sourceCohesion?: number;
  readonly targetCohesion?: number;
  readonly reserveCohesion?: number;
  readonly initialPressureByEntityId?: ReadonlyMap<number, number>;
}

interface MoraleUnitDefinition {
  readonly unitId: number;
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
}

interface MoraleHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
  readonly tempo: ReturnType<typeof createCombatTempoStore>;
  readonly survivability: CombatSurvivabilityStore;
}

function assessTarget(
  options: MoraleHarnessOptions & {
    readonly recentConsequences?: readonly CombatConsequenceApplication[];
  },
): CombatMoraleAssessment {
  const harness = createMoraleHarness(options);
  return assessUnitCombatMorale(
    harness.identity,
    harness.formation,
    20,
    options.recentConsequences,
  );
}

function createMoraleHarness(options: MoraleHarnessOptions): MoraleHarness {
  const entityCount = 6;
  const unitDefinitions = options.unitDefinitions ?? [
    { unitId: 10, factionId: 1, memberEntityIds: [0, 1] },
    { unitId: 20, factionId: 2, memberEntityIds: [2, 3, 4] },
    { unitId: 30, factionId: 3, memberEntityIds: [5] },
  ];
  const world = createWorld(entityCount);
  const identity = createUnitIdentityStore({
    entityCount,
    units: unitDefinitions,
  });
  const loadout = createUnitLoadoutStore(identity, {
    entityCount,
    units: [],
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x3d01,
    units: unitDefinitions.map((unit) =>
      formationUnit(unit, cohesionForUnit(unit.unitId, options)),
    ),
    individuals: Array.from({ length: entityCount }, (_, entityId) => ({
      entityId,
      role: "regular" as const,
      slotRow: 0,
      slotCol: entityId,
      memberMaxStep: 0,
      pressure: options.initialPressureByEntityId?.get(entityId) ?? 0,
    })),
  });
  const tempo = createCombatTempoStore(identity, {
    entityCount,
    units: [],
  });
  const survivability = createCombatSurvivabilityStore(identity, {
    entityCount,
    units: [{ unitId: 20, maxDamageCapacity: 3 }],
  });

  return { world, identity, loadout, formation, tempo, survivability };
}

function formationUnit(
  unit: MoraleUnitDefinition,
  cohesion: number | undefined,
) {
  return {
    unitId: unit.unitId,
    anchorX: unit.unitId * 10,
    anchorY: 100,
    headingX: 1,
    headingY: 0,
    spacing: 10,
    rows: 1,
    cols: unit.memberEntityIds.length,
    unitSpeed: 0,
    order: "hold" as const,
    ...(cohesion !== undefined ? { cohesion } : {}),
  };
}

function cohesionForUnit(
  unitId: number,
  options: MoraleHarnessOptions,
): number | undefined {
  if (unitId === 10) return options.sourceCohesion;
  if (unitId === 20) return options.targetCohesion;
  if (unitId === 30) return options.reserveCohesion;
  return undefined;
}

function createWorld(entityCount: number): WorldState {
  return {
    entityCount,
    bounds: { width: 1_000, height: 1_000 },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: Int32Array.from(
      { length: entityCount },
      (_, index) => index * 10,
    ),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
}

function consequenceRecord(
  overrides: Partial<CombatConsequenceApplication>,
): CombatConsequenceApplication {
  return {
    sourceUnitId: 10,
    targetUnitId: 20,
    affectedMemberEntityIds: [2, 3, 4],
    incomingDamageValue: 1,
    appliedDamageValue: 1,
    capacityReached: false,
    pressureDeltaPerMember: 10,
    pressureBeforeByMember: [0, 0, 0],
    pressureAfterByMember: [10, 10, 10],
    cohesionDamageValue: 0,
    ...overrides,
  };
}

function individualConsequenceSummary(
  unitId: number,
  overrides: Partial<IndividualCombatUnitConsequenceSummary> = {},
): IndividualCombatUnitConsequenceSummary {
  return {
    unitId,
    tickStartEligibleMembers: 3,
    endOfTickEligibleMembers: 3,
    newlyZeroMembers: 0,
    outgoingSelectedTargets: 0,
    incomingSelectedByHostiles: 0,
    outgoingValidAttackAttempts: 0,
    outgoingInvalidatedAttempts: 0,
    outgoingGateAcceptedHits: 0,
    incomingValidAttackAttempts: 0,
    incomingInvalidatedAttempts: 0,
    incomingPreventedAttacks: 0,
    incomingParries: 0,
    incomingBucklerBlocks: 0,
    incomingShieldBlocks: 0,
    incomingLandedOutcomes: 0,
    incomingGateAcceptedHits: 0,
    incomingGateRejectedHits: 0,
    incomingAppliedHitLoss: 0,
    incomingZeroHitTransitions: 0,
    hasOutgoingEngagement: false,
    hasIncomingEngagement: false,
    ...overrides,
  };
}

function staleAssessmentRecord(): CombatMoraleAssessment {
  return {
    unitId: 999,
    memberEntityIds: [999],
    pressureTotal: 999,
    pressureAverage: 999,
    pressureMaximum: 999,
    cohesion: 999,
    recentCombatShockValue: 999,
    recentCombatShockSource: "legacyCapacityReached",
    moraleState: "breakRisk",
    breakRiskReasonCodes: ["combatShockBreakRisk"],
  };
}

function pressureMap(
  entries: readonly (readonly [number, number])[],
): ReadonlyMap<number, number> {
  return new Map(entries);
}

function snapshotHarnessState(
  harness: MoraleHarness,
): Record<string, unknown> {
  const unitIds = getUnitIds(harness.identity);
  return {
    world: {
      entityCount: harness.world.entityCount,
      ids: Array.from(harness.world.ids),
      positionsX: Array.from(harness.world.positionsX),
      positionsY: Array.from(harness.world.positionsY),
      velocitiesX: Array.from(harness.world.velocitiesX),
      velocitiesY: Array.from(harness.world.velocitiesY),
    },
    identity: unitIds.map((unitId) => ({
      unitId,
      factionId: getFactionIdForUnit(harness.identity, unitId),
      members: Array.from(getUnitMembers(harness.identity, unitId)),
    })),
    loadout: unitIds.map((unitId) =>
      getUnitLoadoutSummary(harness.loadout, unitId),
    ),
    formation: unitIds.map((unitId) => ({
      unitId,
      anchor: getUnitAnchor(harness.formation, unitId),
      heading: getUnitHeading(harness.formation, unitId),
      order: getUnitOrder(harness.formation, unitId),
      style: getUnitMovementStyle(harness.formation, unitId),
      cohesion: getUnitCohesion(harness.formation, unitId),
    })),
    pressure: Array.from(
      { length: harness.formation.entityCount },
      (_, entityId) => getIndividualPressure(harness.formation, entityId),
    ),
    tempo: unitIds.map((unitId) => ({
      unitId,
      attackCooldownTicks: getUnitAttackCooldownTicks(harness.tempo, unitId),
    })),
    survivability: unitIds.map((unitId) => ({
      unitId,
      accumulatedDamage: getUnitAccumulatedDamage(harness.survivability, unitId),
      maxDamageCapacity: getUnitMaxDamageCapacity(harness.survivability, unitId),
      capacityReached: isUnitDamageCapacityReached(
        harness.survivability,
        unitId,
      ),
    })),
  };
}

function forbiddenMoraleTermPattern(): RegExp {
  return new RegExp(FORBIDDEN_MORALE_TERMS.join("|"), "i");
}
