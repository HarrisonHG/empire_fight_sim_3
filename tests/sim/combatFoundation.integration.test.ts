import { describe, expect, it } from "vitest";

import {
  advanceCombatPipelineOneTick,
  createCombatPipelineOutput,
  type CombatPipelineTickResult,
} from "../../src/sim/combatPipeline";
import {
  applyCombatConsequences,
  type CombatConsequenceTickResult,
} from "../../src/sim/combatConsequences";
import {
  collectCombatMoraleAssessments,
  type CombatMoraleAssessment,
  type CombatMoraleTickResult,
} from "../../src/sim/combatMorale";
import {
  createCombatSurvivabilityStore,
  getUnitAccumulatedDamage,
  getUnitMaxDamageCapacity,
  isUnitDamageCapacityReached,
  type CombatSurvivabilityStore,
} from "../../src/sim/combatSurvivability";
import {
  createCombatTempoStore,
  getUnitAttackCooldownTicks,
  type CombatTempoStore,
} from "../../src/sim/combatTempo";
import {
  advanceFormationOneTick,
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

const SOURCE_UNIT_ID = 10;
const TARGET_UNIT_ID = 20;
const SOURCE_ENTITY_ID = 0;
const TARGET_ENTITY_ID = 1;

interface CombatFoundationHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
  readonly tempo: CombatTempoStore;
  readonly survivability: CombatSurvivabilityStore;
}

interface CombatFoundationRun {
  readonly harness: CombatFoundationHarness;
  readonly pipelineResult: CombatPipelineTickResult;
  readonly consequenceResult: CombatConsequenceTickResult;
  readonly moraleResult: CombatMoraleTickResult;
  readonly protectedStoreSnapshotAfterPipeline: ProtectedStoreSnapshot;
  readonly pressureBeforeConsequences: readonly number[];
  readonly pressureAfterConsequences: readonly number[];
  readonly nonPressureFormationAfterConsequences: unknown;
}

interface ProtectedStoreSnapshot {
  readonly world: unknown;
  readonly identity: unknown;
  readonly loadout: unknown;
  readonly tempo: unknown;
  readonly survivability: unknown;
  readonly formationNonPressure: unknown;
}

function createCombatFoundationHarness(): CombatFoundationHarness {
  const world: WorldState = {
    entityCount: 2,
    bounds: { width: 1_000, height: 1_000 },
    ids: Uint32Array.from([SOURCE_ENTITY_ID, TARGET_ENTITY_ID]),
    positionsX: Int32Array.from([100, 110]),
    positionsY: Int32Array.from([100, 100]),
    velocitiesX: new Int32Array(2),
    velocitiesY: new Int32Array(2),
  };

  const identity = createUnitIdentityStore({
    entityCount: world.entityCount,
    units: [
      {
        unitId: SOURCE_UNIT_ID,
        factionId: 1,
        memberEntityIds: [SOURCE_ENTITY_ID],
      },
      {
        unitId: TARGET_UNIT_ID,
        factionId: 2,
        memberEntityIds: [TARGET_ENTITY_ID],
      },
    ],
  });

  const loadout = createUnitLoadoutStore(identity, {
    entityCount: world.entityCount,
    units: [
      {
        unitId: SOURCE_UNIT_ID,
        weaponReachBand: "long",
      },
    ],
  });

  const formation = createFormationBehaviourStore(identity, {
    entityCount: world.entityCount,
    rngSeed: 0x3f0a,
    units: [
      {
        unitId: SOURCE_UNIT_ID,
        order: "advance",
        anchorX: 100,
        anchorY: 100,
        headingX: 1,
        headingY: 0,
        spacing: 10,
        rows: 1,
        cols: 1,
        unitSpeed: 0,
      },
      {
        unitId: TARGET_UNIT_ID,
        order: "hold",
        anchorX: 110,
        anchorY: 100,
        headingX: -1,
        headingY: 0,
        spacing: 10,
        rows: 1,
        cols: 1,
        unitSpeed: 0,
      },
    ],
    individuals: [
      {
        entityId: SOURCE_ENTITY_ID,
        role: "regular",
        slotRow: 0,
        slotCol: 0,
        memberMaxStep: 0,
      },
      {
        entityId: TARGET_ENTITY_ID,
        role: "regular",
        slotRow: 0,
        slotCol: 0,
        memberMaxStep: 0,
      },
    ],
  });

  const tempo = createCombatTempoStore(identity, {
    entityCount: world.entityCount,
    units: [
      {
        unitId: SOURCE_UNIT_ID,
        initialCooldownTicks: 1,
      },
    ],
  });

  const survivability = createCombatSurvivabilityStore(identity, {
    entityCount: world.entityCount,
    units: [
      {
        unitId: TARGET_UNIT_ID,
        maxDamageCapacity: 5,
      },
    ],
  });

  return {
    world,
    identity,
    loadout,
    formation,
    tempo,
    survivability,
  };
}

function runCombatFoundationChain(): CombatFoundationRun {
  const harness = createCombatFoundationHarness();
  advanceFormationOneTick(harness.world, harness.identity, harness.formation);

  const pipelineResult = advanceCombatPipelineOneTick(
    harness.world,
    harness.identity,
    harness.loadout,
    harness.formation,
    harness.tempo,
    harness.survivability,
    createCombatPipelineOutput(),
  );
  const protectedStoreSnapshotAfterPipeline = snapshotProtectedStores(harness);
  const pressureBeforeConsequences = snapshotPressure(harness.formation);

  const consequenceResult = applyCombatConsequences(
    harness.identity,
    harness.formation,
    pipelineResult.applications,
    [],
  );
  const moraleResult = collectCombatMoraleAssessments(
    harness.identity,
    harness.formation,
    consequenceResult.applications,
  );
  const pressureAfterConsequences = snapshotPressure(harness.formation);
  const nonPressureFormationAfterConsequences = snapshotFormationNonPressure(
    harness.identity,
    harness.formation,
  );

  return {
    harness,
    pipelineResult,
    consequenceResult,
    moraleResult,
    protectedStoreSnapshotAfterPipeline,
    pressureBeforeConsequences,
    pressureAfterConsequences,
    nonPressureFormationAfterConsequences,
  };
}

function snapshotProtectedStores(
  harness: CombatFoundationHarness,
): ProtectedStoreSnapshot {
  return {
    world: snapshotWorld(harness.world),
    identity: snapshotIdentity(harness.identity),
    loadout: snapshotLoadout(harness.identity, harness.loadout),
    tempo: snapshotTempo(harness.identity, harness.tempo),
    survivability: snapshotSurvivability(
      harness.identity,
      harness.survivability,
    ),
    formationNonPressure: snapshotFormationNonPressure(
      harness.identity,
      harness.formation,
    ),
  };
}

function snapshotWorld(world: WorldState): unknown {
  return {
    entityCount: world.entityCount,
    bounds: world.bounds,
    ids: Array.from(world.ids),
    positionsX: Array.from(world.positionsX),
    positionsY: Array.from(world.positionsY),
    velocitiesX: Array.from(world.velocitiesX),
    velocitiesY: Array.from(world.velocitiesY),
  };
}

function snapshotIdentity(identity: UnitIdentityStore): unknown {
  return getUnitIds(identity).map((unitId) => ({
    unitId,
    factionId: getFactionIdForUnit(identity, unitId),
    members: getUnitMembers(identity, unitId),
  }));
}

function snapshotLoadout(
  identity: UnitIdentityStore,
  loadout: UnitLoadoutStore,
): unknown {
  return getUnitIds(identity).map((unitId) => ({
    unitId,
    summary: getUnitLoadoutSummary(loadout, unitId),
  }));
}

function snapshotTempo(
  identity: UnitIdentityStore,
  tempo: CombatTempoStore,
): unknown {
  return getUnitIds(identity).map((unitId) => ({
    unitId,
    attackCooldownTicks: getUnitAttackCooldownTicks(tempo, unitId),
  }));
}

function snapshotSurvivability(
  identity: UnitIdentityStore,
  survivability: CombatSurvivabilityStore,
): unknown {
  return getUnitIds(identity).map((unitId) => ({
    unitId,
    accumulatedDamage: getUnitAccumulatedDamage(survivability, unitId),
    maxDamageCapacity: getUnitMaxDamageCapacity(survivability, unitId),
    capacityReached: isUnitDamageCapacityReached(survivability, unitId),
  }));
}

function snapshotFormationNonPressure(
  identity: UnitIdentityStore,
  formation: FormationBehaviourStore,
): unknown {
  return getUnitIds(identity).map((unitId) => ({
    unitId,
    order: getUnitOrder(formation, unitId),
    movementStyle: getUnitMovementStyle(formation, unitId),
    anchor: getUnitAnchor(formation, unitId),
    heading: getUnitHeading(formation, unitId),
    cohesion: getUnitCohesion(formation, unitId),
  }));
}

function snapshotPressure(
  formation: FormationBehaviourStore,
): readonly number[] {
  const pressure: number[] = [];

  for (let entityId = 0; entityId < formation.entityCount; entityId += 1) {
    pressure.push(getIndividualPressure(formation, entityId));
  }

  return pressure;
}

function getAssessment(
  moraleResult: CombatMoraleTickResult,
  unitId: number,
): CombatMoraleAssessment {
  const assessment = moraleResult.assessments.find(
    (candidate) => candidate.unitId === unitId,
  );

  if (assessment === undefined) {
    throw new Error(`Missing morale assessment for unit ${unitId}.`);
  }

  return assessment;
}

function summarizeRun(run: CombatFoundationRun): unknown {
  return {
    movementStyles: snapshotFormationNonPressure(
      run.harness.identity,
      run.harness.formation,
    ),
    opportunities: run.pipelineResult.opportunities,
    strikes: run.pipelineResult.strikes,
    survivabilityApplications: run.pipelineResult.applications,
    consequenceApplications: run.consequenceResult.applications,
    moraleAssessments: run.moraleResult.assessments,
    pressure: snapshotPressure(run.harness.formation),
    survivability: snapshotSurvivability(
      run.harness.identity,
      run.harness.survivability,
    ),
  };
}

describe("combat foundation integration", () => {
  it("runs the accepted formation, combat, consequence, and morale chain", () => {
    const run = runCombatFoundationChain();

    expect(
      getUnitMovementStyle(run.harness.formation, SOURCE_UNIT_ID),
    ).toBe("engageFront");
    expect(run.pipelineResult.opportunities).toEqual([
      {
        sourceUnitId: SOURCE_UNIT_ID,
        targetUnitId: TARGET_UNIT_ID,
        sourceMovementStyle: "engageFront",
        engagementState: "engaged",
        weaponReachBand: "long",
      },
    ]);
    expect(run.pipelineResult.strikes).toEqual([
      expect.objectContaining({
        sourceUnitId: SOURCE_UNIT_ID,
        targetUnitId: TARGET_UNIT_ID,
        weaponReachBand: "long",
        damageValue: 1,
        consequenceKind: "damage",
      }),
    ]);
    expect(run.pipelineResult.applications).toEqual([
      expect.objectContaining({
        sourceUnitId: SOURCE_UNIT_ID,
        targetUnitId: TARGET_UNIT_ID,
        incomingDamageValue: 1,
        appliedDamageValue: 1,
        accumulatedDamageBefore: 0,
        accumulatedDamageAfter: 1,
        capacityReached: false,
      }),
    ]);

    expect(run.consequenceResult.applications).toEqual([
      {
        sourceUnitId: SOURCE_UNIT_ID,
        targetUnitId: TARGET_UNIT_ID,
        affectedMemberEntityIds: [TARGET_ENTITY_ID],
        incomingDamageValue: 1,
        appliedDamageValue: 1,
        capacityReached: false,
        pressureDeltaPerMember: 10,
        pressureBeforeByMember: [0],
        pressureAfterByMember: [10],
        cohesionDamageValue: 1,
      },
    ]);
    expect(run.pressureBeforeConsequences).toEqual([0, 0]);
    expect(run.pressureAfterConsequences).toEqual([0, 10]);

    const sourceAssessment = getAssessment(
      run.moraleResult,
      SOURCE_UNIT_ID,
    );
    const targetAssessment = getAssessment(
      run.moraleResult,
      TARGET_UNIT_ID,
    );

    expect(sourceAssessment).toMatchObject({
      unitId: SOURCE_UNIT_ID,
      memberEntityIds: [SOURCE_ENTITY_ID],
      pressureTotal: 0,
      pressureAverage: 0,
      pressureMaximum: 0,
      recentCohesionDamageValue: 0,
      recentCapacityReached: false,
      moraleState: "steady",
      breakRiskReasonCodes: [],
    });
    expect(targetAssessment).toMatchObject({
      unitId: TARGET_UNIT_ID,
      memberEntityIds: [TARGET_ENTITY_ID],
      pressureTotal: 10,
      pressureAverage: 10,
      pressureMaximum: 10,
      recentCohesionDamageValue: 1,
      recentCapacityReached: false,
      moraleState: "pressured",
      breakRiskReasonCodes: ["recentCohesionDamage"],
    });
  });

  it("limits consequence and morale stages to accepted pressure-only mutation", () => {
    const run = runCombatFoundationChain();

    expect(snapshotWorld(run.harness.world)).toEqual(
      run.protectedStoreSnapshotAfterPipeline.world,
    );
    expect(snapshotIdentity(run.harness.identity)).toEqual(
      run.protectedStoreSnapshotAfterPipeline.identity,
    );
    expect(snapshotLoadout(run.harness.identity, run.harness.loadout)).toEqual(
      run.protectedStoreSnapshotAfterPipeline.loadout,
    );
    expect(snapshotTempo(run.harness.identity, run.harness.tempo)).toEqual(
      run.protectedStoreSnapshotAfterPipeline.tempo,
    );
    expect(
      snapshotSurvivability(run.harness.identity, run.harness.survivability),
    ).toEqual(run.protectedStoreSnapshotAfterPipeline.survivability);
    expect(run.nonPressureFormationAfterConsequences).toEqual(
      run.protectedStoreSnapshotAfterPipeline.formationNonPressure,
    );
    expect(run.pressureAfterConsequences).toEqual([0, 10]);
  });

  it("produces deterministic structural summaries for repeated identical runs", () => {
    expect(summarizeRun(runCombatFoundationChain())).toEqual(
      summarizeRun(runCombatFoundationChain()),
    );
  });

  it("does not emit deferred death, removal, routing, healing, call, shout, or special-effect fields", () => {
    const summary = JSON.stringify(summarizeRun(runCombatFoundationChain()));

    expect(summary).not.toMatch(
      /death|dead|removal|removed|routing|routed|healing|heal|calls|call|shouts|shout|specialEffect|special-effect/i,
    );
  });

  it("proves empty units are rejected before morale assessment can divide by member count", () => {
    expect(() =>
      createUnitIdentityStore({
        entityCount: 1,
        units: [
          {
            unitId: SOURCE_UNIT_ID,
            factionId: 1,
            memberEntityIds: [],
          },
        ],
      }),
    ).toThrow(RangeError);
  });
});
