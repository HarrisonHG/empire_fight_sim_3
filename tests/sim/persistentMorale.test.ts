import { describe, expect, it } from "vitest";

import {
  applyCombatConsequences,
  type CombatConsequenceApplication,
} from "../../src/sim/combatConsequences";
import {
  collectCombatMoraleAssessments,
  type CombatMoraleAssessment,
} from "../../src/sim/combatMorale";
import {
  createCombatSurvivabilityStore,
  getUnitAccumulatedDamage,
  type CombatSurvivabilityApplication,
} from "../../src/sim/combatSurvivability";
import {
  applyUnitCohesionLoss,
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitAnchor,
  getUnitCohesion,
  getUnitMaximumCohesion,
  getUnitMovementStyle,
  restoreUnitCohesion,
  setIndividualPressure,
  type FormationBehaviourStore,
} from "../../src/sim/formationBehaviour";
import {
  advancePersistentMoraleOneTick,
  createPersistentMoraleStore,
  getPersistentUnitMorale,
  RECOVERY_CONSTANTS,
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
      experienceAdjustment: 0,
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
    advanceUntilState(harness, "recovering");
    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "recovering",
    );

    expect(advance(harness, [], {
      pressureUpdates: renewedContactUpdates(),
      recoveryThreatSummaries: recoveryThreats(false),
    })).toEqual([
      {
        kind: "unit_morale_changed",
        unitId: TARGET_UNIT_ID,
        previousState: "recovering",
        state: "routing",
      },
    ]);
  });

  it("does not leave routing while a hostile remains in the local threat range", () => {
    const harness = routeHarness();
    setTargetPressure(harness, 0);

    for (let tick = 0; tick < 12; tick += 1) {
      advance(harness, [], { recoveryThreatSummaries: recoveryThreats(true) });
    }

    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "routing",
    );
  });

  it("keeps routing beyond its minimum until both pressure and risk fall below explicit stop gates", () => {
    const harness = routeHarness();
    setTargetPressure(harness, 0);

    for (let tick = 0; tick < RECOVERY_CONSTANTS.minimumRoutingTicks; tick += 1) {
      advance(harness, [], { recoveryThreatSummaries: recoveryThreats(false) });
    }
    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "routing",
    );

    const ticksToRecovery = advanceUntilState(harness, "recovering");
    expect(ticksToRecovery).toBeGreaterThan(0);
    const morale = getPersistentUnitMorale(harness.store, TARGET_UNIT_ID);
    expect(morale.pressure).toBeLessThan(RECOVERY_CONSTANTS.routingStopPressure);
    expect(morale.routingRisk).toBeLessThan(RECOVERY_CONSTANTS.routingStopRisk);
  });

  it("decays routing risk by role only while no fresh source has renewed it", () => {
    const harnesses = [
      routeHarness({ targetRole: "veteran", targetConfidence: 500 }),
      routeHarness({ targetRole: "regular", targetConfidence: 500 }),
      routeHarness({ targetRole: "recruit", targetConfidence: 500 }),
    ];
    const before = harnesses.map((harness) =>
      getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).routingRisk,
    );

    for (let tick = 0; tick < 2; tick += 1) {
      for (const harness of harnesses) {
        setTargetPressure(harness, 0);
        advance(harness, [], { recoveryThreatSummaries: recoveryThreats(true) });
      }
    }

    const shed = harnesses.map(
      (harness, index) =>
        before[index]! -
        getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).routingRisk,
    );
    expect(shed).toEqual([12, 8, 4]);
  });

  it("holds recovery for the configured visible minimum before returning to steady", () => {
    const harness = routeHarness({
      targetRole: "veteran",
      targetConfidence: 800,
    });
    setTargetPressure(harness, 0);
    advanceUntilState(harness, "recovering");
    for (
      let tick = 0;
      tick < RECOVERY_CONSTANTS.minimumRecoveringTicks - 1;
      tick += 1
    ) {
      advance(harness, [], { recoveryThreatSummaries: recoveryThreats(false) });
    }
    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "recovering",
    );
    advance(harness, [], { recoveryThreatSummaries: recoveryThreats(false) });
    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "steady",
    );
  });

  it("rebuilds recovering cohesion gradually through the formation store without exceeding its configured maximum", () => {
    const harness = routeHarness({ targetCohesion: 600 });
    applyUnitCohesionLoss(harness.formation, TARGET_UNIT_ID, 30);
    setTargetPressure(harness, 0);
    advanceUntilState(harness, "recovering");
    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "recovering",
    );
    const before = getUnitCohesion(harness.formation, TARGET_UNIT_ID);
    for (let tick = 0; tick < 3; tick += 1) {
      advance(harness, [], {
        pressureUpdates: calmPressureUpdates(),
        recoveryThreatSummaries: recoveryThreats(false),
      });
    }
    expect(getUnitCohesion(harness.formation, TARGET_UNIT_ID)).toBe(before + 6);
    restoreUnitCohesion(
      harness.formation,
      TARGET_UNIT_ID,
      Number.MAX_SAFE_INTEGER,
    );
    expect(getUnitCohesion(harness.formation, TARGET_UNIT_ID)).toBeLessThan(
      3_000_000_000,
    );
    expect(getUnitCohesion(harness.formation, TARGET_UNIT_ID)).toBe(
      getUnitMaximumCohesion(harness.formation, TARGET_UNIT_ID),
    );
  });

  it("keeps persistent cohesion aligned after same-tick recovery restoration", () => {
    const harness = routeHarness({ targetCohesion: 600 });
    applyUnitCohesionLoss(harness.formation, TARGET_UNIT_ID, 30);
    setTargetPressure(harness, 0);
    advanceUntilState(harness, "recovering");

    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).cohesion).toBe(
      getUnitCohesion(harness.formation, TARGET_UNIT_ID),
    );
  });

  it("lets a routed unit at zero cohesion enter recovery when safe", () => {
    const harness = routeHarness({ targetCohesion: 600 });
    applyUnitCohesionLoss(harness.formation, TARGET_UNIT_ID, 600);
    setTargetPressure(harness, 0);

    advanceUntilState(harness, "recovering");

    const morale = getPersistentUnitMorale(harness.store, TARGET_UNIT_ID);
    expect(morale.state).toBe("recovering");
    expect(morale.cohesion).toBe(0);
    expect(getUnitCohesion(harness.formation, TARGET_UNIT_ID)).toBe(0);
  });

  it("keeps recovering below the required cohesion floor and reaches steady only after all gates pass", () => {
    const harness = routeHarness({ targetCohesion: 600 });
    applyUnitCohesionLoss(harness.formation, TARGET_UNIT_ID, 600);
    setTargetPressure(harness, 0);
    advanceUntilState(harness, "recovering");

    for (let tick = 0; tick < 120; tick += 1) {
      advance(harness, [], {
        pressureUpdates: calmPressureUpdates(),
        recoveryThreatSummaries: recoveryThreats(false),
      });
    }
    let morale = getPersistentUnitMorale(harness.store, TARGET_UNIT_ID);
    expect(morale.state).toBe("recovering");
    expect(morale.cohesion).toBeLessThan(RECOVERY_CONSTANTS.minimumCohesion);

    advanceUntilState(harness, "steady");
    morale = getPersistentUnitMorale(harness.store, TARGET_UNIT_ID);
    expect(morale.state).toBe("steady");
    expect(morale.cohesion).toBeGreaterThanOrEqual(
      RECOVERY_CONSTANTS.minimumCohesion,
    );
    expect(morale.cohesion).toBe(getUnitCohesion(harness.formation, TARGET_UNIT_ID));
  });

  it("allows steady recovery at configured maximum cohesion below the normal floor", () => {
    const harness = routeHarness({ targetCohesion: 400 });
    applyUnitCohesionLoss(harness.formation, TARGET_UNIT_ID, 400);
    setTargetPressure(harness, 0);
    advanceUntilState(harness, "recovering");

    advanceUntilState(harness, "steady");

    const morale = getPersistentUnitMorale(harness.store, TARGET_UNIT_ID);
    expect(getUnitMaximumCohesion(harness.formation, TARGET_UNIT_ID)).toBe(400);
    expect(morale.state).toBe("steady");
    expect(morale.cohesion).toBe(400);
    expect(morale.cohesion).toBe(getUnitCohesion(harness.formation, TARGET_UNIT_ID));
  });

  it("uses confidence and troop profile to recover faster without restoring damage", () => {
    const high = routeHarness({ targetRole: "veteran", targetConfidence: 800 });
    const low = routeHarness({ targetRole: "recruit", targetConfidence: 200 });
    for (const harness of [high, low]) {
      setTargetPressure(harness, 0);
      advanceUntilState(harness, "recovering");
    }
    for (let tick = 0; tick < 100; tick += 1) {
      advance(high, [], { recoveryThreatSummaries: recoveryThreats(false) });
      advance(low, [], { recoveryThreatSummaries: recoveryThreats(false) });
    }
    expect(getPersistentUnitMorale(high.store, TARGET_UNIT_ID).state).toBe("steady");
    expect(getPersistentUnitMorale(low.store, TARGET_UNIT_ID).state).toBe("recovering");
    for (let tick = 0; tick < 160; tick += 1) {
      advance(low, [], { recoveryThreatSummaries: recoveryThreats(false) });
    }
    expect(getPersistentUnitMorale(low.store, TARGET_UNIT_ID).state).toBe("steady");
  });

  it("returns veteran, regular, then recruit units to steady under the same safe recovery sequence", () => {
    const veteran = ticksFromRecoveryToSteady("veteran");
    const regular = ticksFromRecoveryToSteady("regular");
    const recruit = ticksFromRecoveryToSteady("recruit");

    expect(veteran).toBeGreaterThanOrEqual(RECOVERY_CONSTANTS.minimumRecoveringTicks);
    expect(veteran).toBeLessThan(regular);
    expect(regular).toBeLessThan(recruit);
  });

  it("is deterministic for identical recovery sequences", () => {
    expect(runRecoverySequence()).toEqual(runRecoverySequence());
  });

  it("does not restore accumulated damage or remove members during recovery", () => {
    const harness = routeHarness();
    const survivability = createCombatSurvivabilityStore(harness.identity, {
      entityCount: harness.identity.entityCount,
      units: [{ unitId: TARGET_UNIT_ID, initialAccumulatedDamage: 7 }],
    });
    const memberIds = getUnitIds(harness.identity).flatMap((unitId) =>
      getUnitMembers(harness.identity, unitId),
    );
    setTargetPressure(harness, 0);
    for (let tick = 0; tick < 400; tick += 1) {
      advance(harness, [], {
        recoveryThreatSummaries: recoveryThreats(false),
      });
      if (getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state === "recovering") {
        break;
      }
    }

    expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
      "recovering",
    );
    expect(getUnitAccumulatedDamage(survivability, TARGET_UNIT_ID)).toBe(7);
    expect(getUnitIds(harness.identity).flatMap((unitId) =>
      getUnitMembers(harness.identity, unitId),
    )).toEqual(memberIds);
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
  readonly targetConfidence?: number;
  readonly targetCohesion?: number;
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
      formationUnit(TARGET_UNIT_ID, 200, options.targetCohesion),
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
      ...((entityId === 2 || entityId === 3) &&
      options.targetConfidence !== undefined
        ? { confidence: options.targetConfidence }
        : {}),
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
    appliedHitPressureDeltaPerMember: 0,
    zeroHitCohesionLossValue: 0,
    cohesionLossValue: 0,
    cohesionPressureDeltaPerMember: 0,
    decayPerMember: 0,
  };
}

function formationUnit(unitId: number, anchorX: number, cohesion?: number) {
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
    ...(cohesion === undefined ? {} : { cohesion }),
  };
}

function routeHarness(options: MoraleHarnessOptions = {}): MoraleHarness {
  const harness = createHarness(options);
  setTargetPressure(harness, 150);
  for (let tick = 0; tick < 30; tick += 1) {
    advance(harness);
    if (getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state === "routing") {
      break;
    }
  }
  expect(getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state).toBe(
    "routing",
  );
  return harness;
}

function recoveryThreats(hostileNearby: boolean) {
  return [
    { unitId: SOURCE_UNIT_ID, hostileNearby: false },
    { unitId: TARGET_UNIT_ID, hostileNearby },
  ];
}

function calmPressureUpdates(): readonly UnitPressureUpdate[] {
  return [pressureUpdate(SOURCE_UNIT_ID, false), pressureUpdate(TARGET_UNIT_ID, false)];
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

function runRecoverySequence(): unknown {
  const harness = routeHarness();
  const timeline: unknown[] = [];

  setTargetPressure(harness, 0);
  for (let tick = 0; tick < 20; tick += 1) {
    const events = advance(harness, [], {
      recoveryThreatSummaries: recoveryThreats(tick === 8),
    });
    timeline.push({
      events,
      morale: getPersistentUnitMorale(harness.store, TARGET_UNIT_ID),
    });
  }

  return timeline;
}

function advanceUntilState(
  harness: MoraleHarness,
  state: "recovering" | "steady",
): number {
  for (let tick = 0; tick < 400; tick += 1) {
    advance(harness, [], {
      pressureUpdates: calmPressureUpdates(),
      recoveryThreatSummaries: recoveryThreats(false),
    });
    if (getPersistentUnitMorale(harness.store, TARGET_UNIT_ID).state === state) {
      return tick + 1;
    }
  }
  throw new Error(`Morale never reached ${state}.`);
}

function ticksFromRecoveryToSteady(
  targetRole: "recruit" | "regular" | "veteran",
): number {
  const harness = routeHarness({ targetRole, targetConfidence: 500 });
  setTargetPressure(harness, 0);
  advanceUntilState(harness, "recovering");
  return advanceUntilState(harness, "steady");
}
