import { describe, expect, it } from "vitest";

import {
  applyCombatConsequences,
  type CombatConsequenceApplication,
} from "../../src/sim/combatConsequences";
import {
  collectCombatMoraleAssessments,
  type CombatMoraleAssessment,
} from "../../src/sim/combatMorale";
import type { CombatSurvivabilityApplication } from "../../src/sim/combatSurvivability";
import {
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitAnchor,
  getUnitMovementStyle,
  setIndividualPressure,
  type FormationBehaviourStore,
} from "../../src/sim/formationBehaviour";
import {
  advancePersistentMoraleOneTick,
  createPersistentMoraleStore,
  getPersistentUnitMorale,
  type PersistentMoraleEvent,
  type PersistentMoraleStore,
} from "../../src/sim/persistentMorale";
import {
  createUnitIdentityStore,
  getUnitIds,
  getUnitMembers,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";

describe("persistent unit morale", () => {
  it("persists unit state and observed inputs across ticks", () => {
    const harness = createHarness();

    advance(harness);
    advance(harness);

    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID)).toEqual({
      unitId: TARGET_UNIT_ID,
      pressure: 0,
      confidence: 500,
      cohesion: 1_000,
      state: "steady",
      stateTicks: 2,
      routingRisk: 0,
      recoveryProgress: 0,
    });
  });

  it("does not route a healthy unit after repeated weak consequences", () => {
    const harness = createHarness();

    for (let tick = 0; tick < 8; tick += 1) {
      advance(harness, [weakSurvivabilityApplication(tick)]);
    }

    const morale = getPersistentUnitMorale(harness.store, TARGET_UNIT_ID);
    expect(morale.state).not.toBe("routing");
    expect(["strained", "shaken", "wavering"]).toContain(morale.state);
    expect(morale.routingRisk).toBeGreaterThan(0);
  });

  it("increases persistent strain and routing risk under sustained consequences", () => {
    const harness = createHarness();
    let firstRisk = 0;

    for (let tick = 0; tick < 15; tick += 1) {
      advance(harness, [weakSurvivabilityApplication(tick)]);
      if (tick === 0) {
        firstRisk = getPersistentUnitMorale(
          harness.store,
          TARGET_UNIT_ID,
        ).routingRisk;
      }
    }

    const morale = getPersistentUnitMorale(harness.store, TARGET_UNIT_ID);
    expect(morale.state).toBe("routing");
    expect(morale.routingRisk).toBeGreaterThan(firstRisk);
  });

  it("emits each morale transition once and not on unchanged ticks", () => {
    const harness = createHarness();

    setTargetPressure(harness, 20);
    expect(advance(harness)).toEqual([
      {
        kind: "unit_morale_changed",
        unitId: TARGET_UNIT_ID,
        previousState: "steady",
        state: "strained",
      },
    ]);
    expect(advance(harness)).toEqual([]);

    setTargetPressure(harness, 50);
    expect(advance(harness)).toEqual([
      {
        kind: "unit_morale_changed",
        unitId: TARGET_UNIT_ID,
        previousState: "strained",
        state: "shaken",
      },
    ]);
    expect(advance(harness)).toEqual([]);
  });

  it("does not oscillate downward when inputs move back below a threshold", () => {
    const harness = createHarness();

    setTargetPressure(harness, 50);
    advance(harness);
    setTargetPressure(harness, 0);
    expect(advance(harness)).toEqual([]);

    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID)).toMatchObject({
      state: "shaken",
      stateTicks: 2,
      pressure: 0,
    });
  });

  it("is deterministic for identical consequence sequences", () => {
    expect(runDeterministicSequence()).toEqual(runDeterministicSequence());
  });

  it("does not remove entities or change formation movement data", () => {
    const harness = createHarness();
    const entityIds = Array.from({ length: harness.identity.entityCount }, (_, id) => id);
    const targetAnchor = getUnitAnchor(harness.formation, TARGET_UNIT_ID);
    const targetStyle = getUnitMovementStyle(harness.formation, TARGET_UNIT_ID);
    const pressureBefore = targetPressures(harness);

    advance(harness, [weakSurvivabilityApplication(0)]);

    expect(getUnitIds(harness.identity)).toEqual([
      SOURCE_UNIT_ID,
      TARGET_UNIT_ID,
    ]);
    expect(
      getUnitIds(harness.identity).flatMap((unitId) =>
        getUnitMembers(harness.identity, unitId),
      ),
    ).toEqual(entityIds);
    expect(getUnitAnchor(harness.formation, TARGET_UNIT_ID)).toEqual(targetAnchor);
    expect(getUnitMovementStyle(harness.formation, TARGET_UNIT_ID)).toBe(
      targetStyle,
    );
    expect(targetPressures(harness)).not.toEqual(pressureBefore);
  });
});

const SOURCE_UNIT_ID = 10;
const TARGET_UNIT_ID = 20;

interface MoraleHarness {
  readonly identity: UnitIdentityStore;
  readonly formation: FormationBehaviourStore;
  readonly store: PersistentMoraleStore;
  readonly assessments: CombatMoraleAssessment[];
  readonly consequences: CombatConsequenceApplication[];
  readonly events: PersistentMoraleEvent[];
}

function createHarness(): MoraleHarness {
  const identity = createUnitIdentityStore({
    entityCount: 4,
    units: [
      { unitId: SOURCE_UNIT_ID, factionId: 1, memberEntityIds: [0, 1] },
      { unitId: TARGET_UNIT_ID, factionId: 2, memberEntityIds: [2, 3] },
    ],
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount: 4,
    rngSeed: 0x4a,
    units: [
      formationUnit(SOURCE_UNIT_ID, 100),
      formationUnit(TARGET_UNIT_ID, 200),
    ],
    individuals: [0, 1, 2, 3].map((entityId) => ({
      entityId,
      role: "regular" as const,
      slotRow: 0,
      slotCol: entityId % 2,
      memberMaxStep: 1,
    })),
  });
  const assessments: CombatMoraleAssessment[] = [];
  collectCombatMoraleAssessments(identity, formation, [], assessments);

  return {
    identity,
    formation,
    store: createPersistentMoraleStore(identity, formation, assessments),
    assessments,
    consequences: [],
    events: [],
  };
}

function advance(
  harness: MoraleHarness,
  applications: readonly CombatSurvivabilityApplication[] = [],
): readonly PersistentMoraleEvent[] {
  applyCombatConsequences(
    harness.identity,
    harness.formation,
    applications,
    harness.consequences,
    { appliedDamagePressureScale: 10 },
  );
  collectCombatMoraleAssessments(
    harness.identity,
    harness.formation,
    harness.consequences,
    harness.assessments,
  );
  const result = advancePersistentMoraleOneTick(
    harness.identity,
    harness.formation,
    harness.assessments,
    harness.store,
    harness.events,
  );
  return result.events.slice();
}

function formationUnit(unitId: number, anchorX: number) {
  return {
    unitId,
    anchorX,
    anchorY: 100,
    headingX: 1 as const,
    headingY: 0 as const,
    spacing: 10,
    rows: 1,
    cols: 2,
    unitSpeed: 0,
    order: "hold" as const,
  };
}

function weakSurvivabilityApplication(
  accumulatedDamageBefore: number,
): CombatSurvivabilityApplication {
  return {
    sourceUnitId: SOURCE_UNIT_ID,
    targetUnitId: TARGET_UNIT_ID,
    incomingDamageValue: 1,
    armourReduction: 0,
    shieldReduction: 0,
    appliedDamageValue: 1,
    accumulatedDamageBefore,
    accumulatedDamageAfter: accumulatedDamageBefore + 1,
    capacityReached: false,
  };
}

function setTargetPressure(harness: MoraleHarness, pressure: number): void {
  for (const entityId of getUnitMembers(harness.identity, TARGET_UNIT_ID)) {
    setIndividualPressure(harness.formation, entityId, pressure);
  }
}

function targetPressures(harness: MoraleHarness): readonly number[] {
  return getUnitMembers(harness.identity, TARGET_UNIT_ID).map((entityId) =>
    getIndividualPressure(harness.formation, entityId),
  );
}

function runDeterministicSequence(): unknown {
  const harness = createHarness();
  const timeline: unknown[] = [];

  for (let tick = 0; tick < 15; tick += 1) {
    const events = advance(harness, [weakSurvivabilityApplication(tick)]);
    timeline.push({
      events,
      morale: getPersistentUnitMorale(harness.store, TARGET_UNIT_ID),
    });
  }

  return timeline;
}
