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
  type PersistentMoraleContext,
  type PersistentMoraleEvent,
  type PersistentMoraleStore,
} from "../../src/sim/persistentMorale";
import type { UnitPressureUpdate } from "../../src/sim/combatPressure";
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

    for (let tick = 0; tick < 20; tick += 1) {
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

  it("emits each morale transition once after its duration gate", () => {
    const harness = createHarness();

    setTargetPressure(harness, 70);
    expect(advance(harness)).toEqual([]);
    expect(advance(harness)).toEqual([]);
    expect(advance(harness)).toEqual([
      {
        kind: "unit_morale_changed",
        unitId: TARGET_UNIT_ID,
        previousState: "steady",
        state: "strained",
      },
    ]);
    expect(advance(harness)).toEqual([]);

    expect(advance(harness)).toEqual([]);
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

  it("requires sustained calm input before de-escalating", () => {
    const harness = createHarness();

    setTargetPressure(harness, 70);
    for (let tick = 0; tick < 3; tick += 1) {
      advance(harness);
    }
    setTargetPressure(harness, 0);
    for (let tick = 0; tick < 3; tick += 1) {
      expect(advance(harness)).toEqual([]);
    }

    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "strained",
    );
    expect(advance(harness)).toEqual([
      {
        kind: "unit_morale_changed",
        unitId: TARGET_UNIT_ID,
        previousState: "strained",
        state: "steady",
      },
    ]);
  });

  it.each([
    { role: "veteran" as const, expectedState: "strained" },
    { role: "regular" as const, expectedState: "shaken" },
    { role: "recruit" as const, expectedState: "wavering" },
  ])(
    "applies identical pressure sequences differently for $role units",
    ({ role, expectedState }) => {
      const harness = createHarness({ targetRole: role });
      setTargetPressure(harness, 85);

      for (let tick = 0; tick < 7; tick += 1) {
        advance(harness);
      }

      expect(
        getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state,
      ).toBe(expectedState);
    },
  );

  it("routes only after sustained stress, recovers after safety, and relapses on contact", () => {
    const harness = createHarness();
    setTargetPressure(harness, 150);
    for (let tick = 0; tick < 15; tick += 1) {
      advance(harness);
    }
    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "routing",
    );

    setTargetPressure(harness, 0);
    for (let tick = 0; tick < 6; tick += 1) {
      advance(harness);
    }
    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "recovering",
    );

    expect(advance(harness, [], { pressureUpdates: renewedContactUpdates() })).toEqual([
      {
        kind: "unit_morale_changed",
        unitId: TARGET_UNIT_ID,
        previousState: "recovering",
        state: "wavering",
      },
    ]);
  });

  it("returns from recovering to steady only after the recovery duration", () => {
    const harness = createHarness();
    setTargetPressure(harness, 150);
    for (let tick = 0; tick < 15; tick += 1) {
      advance(harness);
    }
    setTargetPressure(harness, 0);
    for (let tick = 0; tick < 6; tick += 1) {
      advance(harness);
    }
    for (let tick = 0; tick < 5; tick += 1) {
      advance(harness);
    }
    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "recovering",
    );
    advance(harness);
    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "steady",
    );
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

interface MoraleHarnessOptions {
  readonly targetRole?: "recruit" | "regular" | "veteran";
}

function createHarness(options: MoraleHarnessOptions = {}): MoraleHarness {
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
      role:
        entityId === 2 || entityId === 3
          ? (options.targetRole ?? "regular")
          : "regular",
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
  context: PersistentMoraleContext = {},
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
    context,
  );
  return result.events.slice();
}

function renewedContactUpdates(): readonly UnitPressureUpdate[] {
  return [
    pressureUpdate(SOURCE_UNIT_ID, false),
    pressureUpdate(TARGET_UNIT_ID, true),
  ];
}

function pressureUpdate(
  unitId: number,
  hasFreshPressure: boolean,
): UnitPressureUpdate {
  return {
    unitId,
    engaged: hasFreshPressure,
    inContact: hasFreshPressure,
    hasFreshPressure,
    pressureBeforeAverage: 0,
    pressureAfterAverage: 0,
    confidenceAverage: 500,
    engagedPressureDeltaPerMember: 0,
    contactPressureDeltaPerMember: 0,
    consequencePressureDeltaPerMember: 0,
    cohesionLossValue: 0,
    cohesionPressureDeltaPerMember: 0,
    decayPerMember: 0,
  };
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
