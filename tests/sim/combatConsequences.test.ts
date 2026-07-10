import { describe, expect, it } from "vitest";

import {
  applyCombatConsequence,
  applyCombatConsequences,
  type CombatConsequenceApplication,
} from "../../src/sim/combatConsequences";
import type { CombatSurvivabilityApplication } from "../../src/sim/combatSurvivability";
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

const FORBIDDEN_CONSEQUENCE_TERMS = [
  "death",
  "dead",
  "removal",
  "removed",
  "wound",
  "wounds",
  "healing",
  "routing",
  "routed",
  "call",
  "shout",
  "special",
  "effect",
] as const;

describe("combat consequences", () => {
  it("applies pressure from applied damage to all target unit members", () => {
    const harness = createConsequenceHarness({
      initialPressureByEntityId: new Map([
        [0, 1],
        [1, 2],
        [2, 5],
        [3, 6],
        [4, 7],
      ]),
    });
    const result = applyCombatConsequence(
      harness.identity,
      harness.formation,
      survivabilityApplication({ appliedDamageValue: 2, incomingDamageValue: 2 }),
    );

    expect(result).toEqual({
      sourceUnitId: 10,
      targetUnitId: 20,
      affectedMemberEntityIds: [2, 3, 4],
      incomingDamageValue: 2,
      appliedDamageValue: 2,
      capacityReached: false,
      pressureDeltaPerMember: 20,
      pressureBeforeByMember: [5, 6, 7],
      pressureAfterByMember: [25, 26, 27],
      cohesionDamageValue: 2,
    });
    expect(snapshotPressure(harness.formation)).toEqual([1, 2, 25, 26, 27, 0]);
  });

  it("leaves source unit pressure unaffected", () => {
    const harness = createConsequenceHarness({
      initialPressureByEntityId: new Map([
        [0, 11],
        [1, 12],
        [2, 3],
        [3, 4],
        [4, 5],
      ]),
    });

    applyCombatConsequence(
      harness.identity,
      harness.formation,
      survivabilityApplication({ appliedDamageValue: 1, incomingDamageValue: 1 }),
    );

    expect(getIndividualPressure(harness.formation, 0)).toBe(11);
    expect(getIndividualPressure(harness.formation, 1)).toBe(12);
  });

  it("applies mitigated-hit pressure when incoming damage is fully absorbed", () => {
    const harness = createConsequenceHarness({});
    const result = applyCombatConsequence(
      harness.identity,
      harness.formation,
      survivabilityApplication({
        incomingDamageValue: 1,
        armourReduction: 1,
        shieldReduction: 1,
        appliedDamageValue: 0,
      }),
    );

    expect(result).toMatchObject({
      pressureDeltaPerMember: 2,
      pressureBeforeByMember: [0, 0, 0],
      pressureAfterByMember: [2, 2, 2],
      cohesionDamageValue: 0,
    });
    expect(snapshotPressure(harness.formation)).toEqual([0, 0, 2, 2, 2, 0]);
  });

  it("records zero damage as a no-op for pressure and cohesion", () => {
    const harness = createConsequenceHarness({
      initialPressureByEntityId: new Map([
        [2, 8],
        [3, 9],
        [4, 10],
      ]),
    });
    const before = snapshotPressure(harness.formation);
    const result = applyCombatConsequence(
      harness.identity,
      harness.formation,
      survivabilityApplication({
        incomingDamageValue: 0,
        appliedDamageValue: 0,
      }),
    );

    expect(result).toMatchObject({
      pressureDeltaPerMember: 0,
      pressureBeforeByMember: [8, 9, 10],
      pressureAfterByMember: [8, 9, 10],
      cohesionDamageValue: 0,
    });
    expect(snapshotPressure(harness.formation)).toEqual(before);
  });

  it("adds the capacity-reached pressure and cohesion bonuses", () => {
    const harness = createConsequenceHarness({});
    const result = applyCombatConsequence(
      harness.identity,
      harness.formation,
      survivabilityApplication({
        incomingDamageValue: 1,
        appliedDamageValue: 1,
        accumulatedDamageBefore: 0,
        accumulatedDamageAfter: 1,
        capacityReached: true,
      }),
    );

    expect(result).toMatchObject({
      pressureDeltaPerMember: 15,
      pressureAfterByMember: [15, 15, 15],
      cohesionDamageValue: 2,
    });
  });

  it("accumulates pressure across repeated consequence applications", () => {
    const harness = createConsequenceHarness({});
    const result = applyCombatConsequences(harness.identity, harness.formation, [
      survivabilityApplication({ appliedDamageValue: 1, incomingDamageValue: 1 }),
      survivabilityApplication({
        incomingDamageValue: 1,
        armourReduction: 1,
        appliedDamageValue: 0,
      }),
    ]);

    expect(result.applications.map((record) => record.pressureBeforeByMember)).toEqual([
      [0, 0, 0],
      [10, 10, 10],
    ]);
    expect(result.applications.map((record) => record.pressureAfterByMember)).toEqual([
      [10, 10, 10],
      [12, 12, 12],
    ]);
    expect(snapshotPressure(harness.formation)).toEqual([0, 0, 12, 12, 12, 0]);
  });

  it("preserves deterministic input order in consequence records", () => {
    const harness = createConsequenceHarness({});
    const applications = [
      survivabilityApplication({ sourceUnitId: 10, targetUnitId: 20 }),
      survivabilityApplication({ sourceUnitId: 20, targetUnitId: 30 }),
      survivabilityApplication({ sourceUnitId: 30, targetUnitId: 10 }),
    ];

    const result = applyCombatConsequences(
      harness.identity,
      harness.formation,
      applications,
    );

    expect(
      result.applications.map((record) => [
        record.sourceUnitId,
        record.targetUnitId,
      ]),
    ).toEqual([
      [10, 20],
      [20, 30],
      [30, 10],
    ]);
  });

  it("reuses caller-provided output arrays without retaining stale records", () => {
    const harness = createConsequenceHarness({});
    const out: CombatConsequenceApplication[] = [
      staleConsequenceRecord(),
      staleConsequenceRecord(),
    ];

    const first = applyCombatConsequences(
      harness.identity,
      harness.formation,
      [survivabilityApplication({ targetUnitId: 20 })],
      out,
    );
    const second = applyCombatConsequences(
      harness.identity,
      harness.formation,
      [survivabilityApplication({ targetUnitId: 30 })],
      out,
    );

    expect(first.applications).toBe(out);
    expect(second.applications).toBe(out);
    expect(out).toHaveLength(1);
    expect(out[0]?.targetUnitId).toBe(30);
    expect(out[0]?.affectedMemberEntityIds).toEqual([5]);
  });

  it("records affected member IDs in stable identity order", () => {
    const harness = createConsequenceHarness({
      targetMemberEntityIds: [4, 2, 3],
    });

    const result = applyCombatConsequence(
      harness.identity,
      harness.formation,
      survivabilityApplication({ targetUnitId: 20 }),
    );

    expect(result.affectedMemberEntityIds).toEqual([2, 3, 4]);
  });

  it("records cohesion damage values without mutating unit cohesion", () => {
    const harness = createConsequenceHarness({
      sourceCohesion: 720,
      targetCohesion: 640,
      reserveCohesion: 530,
    });
    const cohesionBefore = snapshotCohesion(harness.identity, harness.formation);

    const result = applyCombatConsequence(
      harness.identity,
      harness.formation,
      survivabilityApplication({
        appliedDamageValue: 3,
        incomingDamageValue: 3,
        capacityReached: true,
      }),
    );

    expect(result.cohesionDamageValue).toBe(4);
    expect(snapshotCohesion(harness.identity, harness.formation)).toEqual(
      cohesionBefore,
    );
  });

  it("throws validation errors for invalid stores, unit IDs, applications, and config", () => {
    const harness = createConsequenceHarness({});
    const mismatchedFormation = {
      entityCount: harness.identity.entityCount - 1,
      unitCount: harness.identity.unitCount,
    } as FormationBehaviourStore;

    expect(() =>
      applyCombatConsequence(
        harness.identity,
        mismatchedFormation,
        survivabilityApplication({}),
      ),
    ).toThrow(RangeError);
    expect(() =>
      applyCombatConsequence(
        harness.identity,
        harness.formation,
        survivabilityApplication({ targetUnitId: 999 }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      applyCombatConsequence(
        harness.identity,
        harness.formation,
        survivabilityApplication({ appliedDamageValue: -1 }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      applyCombatConsequences(
        harness.identity,
        harness.formation,
        [survivabilityApplication({})],
        [],
        { appliedDamagePressureScale: -1 },
      ),
    ).toThrow(RangeError);
  });

  it("throws RangeError for unknown source unit IDs", () => {
    const harness = createConsequenceHarness({});

    expect(() =>
      applyCombatConsequence(
        harness.identity,
        harness.formation,
        survivabilityApplication({ sourceUnitId: 999 }),
      ),
    ).toThrow(RangeError);
  });

  it("throws RangeError for non-integer incoming damage values", () => {
    const harness = createConsequenceHarness({});

    expect(() =>
      applyCombatConsequence(
        harness.identity,
        harness.formation,
        survivabilityApplication({ incomingDamageValue: 1.5 }),
      ),
    ).toThrow(RangeError);
  });

  it("throws RangeError for non-integer applied damage values", () => {
    const harness = createConsequenceHarness({});

    expect(() =>
      applyCombatConsequence(
        harness.identity,
        harness.formation,
        survivabilityApplication({ appliedDamageValue: 1.5 }),
      ),
    ).toThrow(RangeError);
  });

  it("does not mutate input application records or the input applications array", () => {
    const harness = createConsequenceHarness({});
    const applications = Object.freeze([
      Object.freeze(survivabilityApplication({ appliedDamageValue: 1 })),
      Object.freeze(
        survivabilityApplication({
          incomingDamageValue: 1,
          appliedDamageValue: 0,
        }),
      ),
    ]);
    const before = JSON.stringify(applications);

    applyCombatConsequences(harness.identity, harness.formation, applications);

    expect(JSON.stringify(applications)).toBe(before);
  });

  it("mutates only individual pressure among existing public state", () => {
    const harness = createConsequenceHarness({
      sourceCohesion: 800,
      targetCohesion: 700,
      reserveCohesion: 600,
    });
    const before = snapshotPublicHarnessState(harness);

    applyCombatConsequence(
      harness.identity,
      harness.formation,
      survivabilityApplication({ appliedDamageValue: 1 }),
    );

    expect(snapshotPublicHarnessState(harness)).toEqual({
      ...before,
      pressure: [0, 0, 10, 10, 10, 0],
    });
  });

  it("produces repeated deterministic runs from identical starting state", () => {
    const run = (): readonly unknown[] => {
      const harness = createConsequenceHarness({
        initialPressureByEntityId: new Map([
          [2, 4],
          [3, 5],
          [4, 6],
        ]),
      });
      const result = applyCombatConsequences(harness.identity, harness.formation, [
        survivabilityApplication({ targetUnitId: 20, appliedDamageValue: 1 }),
        survivabilityApplication({
          targetUnitId: 20,
          incomingDamageValue: 1,
          appliedDamageValue: 0,
        }),
        survivabilityApplication({
          targetUnitId: 30,
          appliedDamageValue: 2,
          incomingDamageValue: 2,
        }),
      ]);
      return [result.applications, snapshotPressure(harness.formation)];
    };

    expect(run()).toEqual(run());
  });

  it("does not emit death, removal, wounds, healing, routing, calls, shouts, or special-effect fields", () => {
    const harness = createConsequenceHarness({});
    const result = applyCombatConsequence(
      harness.identity,
      harness.formation,
      survivabilityApplication({ appliedDamageValue: 1, capacityReached: true }),
    );

    expect(Object.keys(result).sort()).toEqual([
      "affectedMemberEntityIds",
      "appliedDamageValue",
      "capacityReached",
      "cohesionDamageValue",
      "incomingDamageValue",
      "pressureAfterByMember",
      "pressureBeforeByMember",
      "pressureDeltaPerMember",
      "sourceUnitId",
      "targetUnitId",
    ]);
    expect(JSON.stringify(result)).not.toMatch(forbiddenConsequenceTermPattern());
  });
});

interface ConsequenceHarnessOptions {
  readonly targetMemberEntityIds?: readonly number[];
  readonly initialPressureByEntityId?: ReadonlyMap<number, number>;
  readonly sourceCohesion?: number;
  readonly targetCohesion?: number;
  readonly reserveCohesion?: number;
}

interface ConsequenceHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
  readonly tempo: ReturnType<typeof createCombatTempoStore>;
  readonly survivability: CombatSurvivabilityStore;
}

function createConsequenceHarness(
  options: ConsequenceHarnessOptions,
): ConsequenceHarness {
  const targetMembers = options.targetMemberEntityIds ?? [2, 3, 4];
  const entityCount = 6;
  const world = createWorld(entityCount);
  const identity = createUnitIdentityStore({
    entityCount,
    units: [
      { unitId: 10, factionId: 1, memberEntityIds: [0, 1] },
      { unitId: 20, factionId: 2, memberEntityIds: targetMembers },
      { unitId: 30, factionId: 3, memberEntityIds: [5] },
    ],
  });
  const loadout = createUnitLoadoutStore(identity, {
    entityCount,
    units: [],
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x3c01,
    units: [
      formationUnit(10, 100, options.sourceCohesion),
      formationUnit(20, 140, options.targetCohesion),
      formationUnit(30, 180, options.reserveCohesion),
    ],
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
  unitId: number,
  anchorX: number,
  cohesion: number | undefined,
) {
  return {
    unitId,
    anchorX,
    anchorY: 100,
    headingX: 1,
    headingY: 0,
    spacing: 10,
    rows: 1,
    cols: unitId === 20 ? 3 : unitId === 10 ? 2 : 1,
    unitSpeed: 0,
    order: "hold" as const,
    ...(cohesion !== undefined ? { cohesion } : {}),
  };
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

function survivabilityApplication(
  overrides: Partial<CombatSurvivabilityApplication>,
): CombatSurvivabilityApplication {
  return {
    sourceUnitId: 10,
    targetUnitId: 20,
    incomingDamageValue: 1,
    armourReduction: 0,
    shieldReduction: 0,
    appliedDamageValue: 1,
    accumulatedDamageBefore: 0,
    accumulatedDamageAfter: 1,
    capacityReached: false,
    ...overrides,
  };
}

function staleConsequenceRecord(): CombatConsequenceApplication {
  return {
    sourceUnitId: 999,
    targetUnitId: 999,
    affectedMemberEntityIds: [999],
    incomingDamageValue: 999,
    appliedDamageValue: 999,
    capacityReached: true,
    pressureDeltaPerMember: 999,
    pressureBeforeByMember: [999],
    pressureAfterByMember: [999],
    cohesionDamageValue: 999,
  };
}

function snapshotPressure(
  formation: FormationBehaviourStore,
): readonly number[] {
  return Array.from(
    { length: formation.entityCount },
    (_, entityId) => getIndividualPressure(formation, entityId),
  );
}

function snapshotCohesion(
  identity: UnitIdentityStore,
  formation: FormationBehaviourStore,
): readonly number[] {
  return getUnitIds(identity).map((unitId) =>
    getUnitCohesion(formation, unitId),
  );
}

function snapshotPublicHarnessState(
  harness: ConsequenceHarness,
): readonly unknown[] | Record<string, unknown> {
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
    pressure: snapshotPressure(harness.formation),
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

function forbiddenConsequenceTermPattern(): RegExp {
  return new RegExp(FORBIDDEN_CONSEQUENCE_TERMS.join("|"), "i");
}
