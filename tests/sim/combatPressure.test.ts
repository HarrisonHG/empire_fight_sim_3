import { describe, expect, it } from "vitest";

import {
  applyCombatConsequences,
  type CombatConsequenceApplication,
} from "../../src/sim/combatConsequences";
import type { CombatAttackOpportunity } from "../../src/sim/combatTempo";
import type { CombatSurvivabilityApplication } from "../../src/sim/combatSurvivability";
import {
  advanceCombatPressureOneTick,
  createCombatPressureStore,
  type CombatPressureStore,
  type UnitPressureUpdate,
} from "../../src/sim/combatPressure";
import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitAnchor,
  getUnitMovementStyle,
  setIndividualPressure,
  type FormationBehaviourStore,
} from "../../src/sim/formationBehaviour";
import type { WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  getUnitIds,
  getUnitMembers,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";

describe("combat pressure stage", () => {
  it("increases pressure during sustained engagement", () => {
    const harness = createHarness();

    advancePressure(harness, engagedOpportunity());
    advancePressure(harness, engagedOpportunity());

    expect(targetPressures(harness)).toEqual([8, 8]);
  });

  it("uses engageFront as the contact-only pressure signal without an opportunity", () => {
    const harness = createFormationSignalHarness("hostile");
    advanceFormationOneTick(harness.world, harness.identity, harness.formation);

    const updates = advanceCombatPressureOneTick(
      harness.identity,
      harness.formation,
      [],
      [],
      harness.store,
    ).updates;

    expect(getUnitMovementStyle(harness.formation, SOURCE_UNIT_ID)).toBe(
      "engageFront",
    );
    expect(getIndividualPressure(harness.formation, 0)).toBe(2);
    expect(findUpdate(updates, SOURCE_UNIT_ID)).toMatchObject({
      engagedPressureDeltaPerMember: 0,
      contactPressureDeltaPerMember: 2,
      decayPerMember: 0,
    });
  });

  it("adds pressure for cohesion loss already observed from formation behaviour", () => {
    const harness = createFormationSignalHarness("allied");
    advanceFormationOneTick(harness.world, harness.identity, harness.formation);

    const updates = advanceCombatPressureOneTick(
      harness.identity,
      harness.formation,
      [],
      [],
      harness.store,
    ).updates;

    expect(getUnitMovementStyle(harness.formation, SOURCE_UNIT_ID)).toBe(
      "pushThrough",
    );
    expect(getIndividualPressure(harness.formation, 0)).toBe(25);
    expect(getIndividualPressure(harness.formation, 1)).toBe(13);
    expect(findUpdate(updates, SOURCE_UNIT_ID)).toMatchObject({
      cohesionLossValue: 5,
      cohesionPressureDeltaPerMember: 5,
      decayPerMember: 0,
    });
    expect(findUpdate(updates, TARGET_UNIT_ID)).toMatchObject({
      cohesionLossValue: 3,
      cohesionPressureDeltaPerMember: 3,
      decayPerMember: 0,
    });
  });

  it("records applied consequence pressure without applying it twice", () => {
    const harness = createHarness();
    const consequences = applyCombatConsequences(
      harness.identity,
      harness.formation,
      [survivabilityApplication(0)],
      harness.consequences,
    ).applications;

    const updates = advancePressure(harness, undefined, consequences);
    const targetUpdate = findUpdate(updates, TARGET_UNIT_ID);

    expect(targetPressures(harness)).toEqual([10, 10]);
    expect(targetUpdate).toMatchObject({
      consequencePressureDeltaPerMember: 10,
      decayPerMember: 0,
      pressureBeforeAverage: 10,
      pressureAfterAverage: 10,
    });
  });

  it("decays pressure after engagement and consequences end", () => {
    const harness = createHarness();
    setTargetPressure(harness, 8);

    advancePressure(harness);
    expect(targetPressures(harness)).toEqual([6, 6]);
    advancePressure(harness);
    expect(targetPressures(harness)).toEqual([4, 4]);
  });

  it("does not decay while a fresh pressure source remains", () => {
    const harness = createHarness();
    setTargetPressure(harness, 8);

    const engagementUpdates = advancePressure(harness, engagedOpportunity());
    expect(targetPressures(harness)).toEqual([12, 12]);
    expect(findUpdate(engagementUpdates, TARGET_UNIT_ID).decayPerMember).toBe(0);

    const consequences = applyCombatConsequences(
      harness.identity,
      harness.formation,
      [survivabilityApplication(0)],
      harness.consequences,
    ).applications;
    const consequenceUpdates = advancePressure(harness, undefined, consequences);
    expect(targetPressures(harness)).toEqual([22, 22]);
    expect(findUpdate(consequenceUpdates, TARGET_UNIT_ID).decayPerMember).toBe(0);
  });

  it("lets high confidence reduce engagement pressure and improve decay", () => {
    const lowConfidence = createHarness({ targetConfidence: 100 });
    const highConfidence = createHarness({ targetConfidence: 900 });

    advancePressure(lowConfidence, engagedOpportunity());
    advancePressure(highConfidence, engagedOpportunity());
    expect(targetPressures(lowConfidence)).toEqual([4, 4]);
    expect(targetPressures(highConfidence)).toEqual([3, 3]);

    advancePressure(lowConfidence);
    advancePressure(highConfidence);
    expect(targetPressures(lowConfidence)).toEqual([2, 2]);
    expect(targetPressures(highConfidence)).toEqual([0, 0]);
  });

  it("uses only tick-start routing state to give veteran, regular, and recruit units distinct safe decay", () => {
    const recruits = createHarness({ targetRole: "recruit" });
    const regulars = createHarness({ targetRole: "regular" });
    const veterans = createHarness({ targetRole: "veteran" });
    const routingStates = new Map([
      [SOURCE_UNIT_ID, "steady" as const],
      [TARGET_UNIT_ID, "routing" as const],
    ]);

    for (const harness of [recruits, regulars, veterans]) {
      setTargetPressure(harness, 10);
      advancePressure(harness, undefined, [], routingStates);
    }

    expect(targetPressures(recruits)).toEqual([8, 8]);
    expect(targetPressures(regulars)).toEqual([7, 7]);
    expect(targetPressures(veterans)).toEqual([6, 6]);
  });

  it("clamps pressure safely at the formation state maximum", () => {
    const harness = createHarness();
    setTargetPressure(harness, 0x7fff_ffff);

    advancePressure(harness, engagedOpportunity());

    expect(targetPressures(harness)).toEqual([0x7fff_ffff, 0x7fff_ffff]);
  });

  it("replays identical pressure sequences deterministically", () => {
    expect(runDeterministicSequence()).toEqual(runDeterministicSequence());
  });

  it("does not change formation movement data or entity membership", () => {
    const harness = createHarness();
    const targetAnchor = getUnitAnchor(harness.formation, TARGET_UNIT_ID);
    const targetStyle = getUnitMovementStyle(harness.formation, TARGET_UNIT_ID);
    const members = getUnitIds(harness.identity).flatMap((unitId) =>
      getUnitMembers(harness.identity, unitId),
    );

    advancePressure(harness, engagedOpportunity());

    expect(getUnitAnchor(harness.formation, TARGET_UNIT_ID)).toEqual(targetAnchor);
    expect(getUnitMovementStyle(harness.formation, TARGET_UNIT_ID)).toBe(
      targetStyle,
    );
    expect(getUnitIds(harness.identity).flatMap((unitId) =>
      getUnitMembers(harness.identity, unitId),
    )).toEqual(members);
  });
});

const SOURCE_UNIT_ID = 10;
const TARGET_UNIT_ID = 20;

interface PressureHarness {
  readonly identity: UnitIdentityStore;
  readonly formation: FormationBehaviourStore;
  readonly store: CombatPressureStore;
  readonly consequences: CombatConsequenceApplication[];
  readonly updates: UnitPressureUpdate[];
}

interface FormationSignalHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly formation: FormationBehaviourStore;
  readonly store: CombatPressureStore;
}

function createHarness(options: {
  readonly targetConfidence?: number;
  readonly targetRole?: "recruit" | "regular" | "veteran";
} = {}): PressureHarness {
  const identity = createUnitIdentityStore({
    entityCount: 4,
    units: [
      { unitId: SOURCE_UNIT_ID, factionId: 1, memberEntityIds: [0, 1] },
      { unitId: TARGET_UNIT_ID, factionId: 2, memberEntityIds: [2, 3] },
    ],
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount: 4,
    rngSeed: 0x4b,
    units: [formationUnit(SOURCE_UNIT_ID, 100), formationUnit(TARGET_UNIT_ID, 200)],
    individuals: [0, 1, 2, 3].map((entityId) => ({
      entityId,
      role:
        entityId >= 2 ? (options.targetRole ?? "regular") : ("regular" as const),
      slotRow: 0,
      slotCol: entityId % 2,
      memberMaxStep: 1,
      ...(entityId >= 2 && options.targetConfidence !== undefined
        ? { confidence: options.targetConfidence }
        : {}),
    })),
  });
  return {
    identity,
    formation,
    store: createCombatPressureStore(identity, formation),
    consequences: [],
    updates: [],
  };
}

function createFormationSignalHarness(
  relationship: "allied" | "hostile",
): FormationSignalHarness {
  const world: WorldState = {
    entityCount: 2,
    bounds: { width: 1_000, height: 1_000 },
    ids: Uint32Array.from([0, 1]),
    positionsX: Int32Array.from([100, 116]),
    positionsY: Int32Array.from([100, 100]),
    velocitiesX: new Int32Array(2),
    velocitiesY: new Int32Array(2),
  };
  const identity = createUnitIdentityStore({
    entityCount: 2,
    units: [
      { unitId: SOURCE_UNIT_ID, factionId: 1, memberEntityIds: [0] },
      {
        unitId: TARGET_UNIT_ID,
        factionId: relationship === "allied" ? 1 : 2,
        memberEntityIds: [1],
      },
    ],
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount: 2,
    rngSeed: 0x4c,
    units: [
      {
        ...formationUnit(SOURCE_UNIT_ID, 100),
        unitSpeed: 1,
        order: "advance" as const,
        cohesion: 600,
      },
      {
        ...formationUnit(TARGET_UNIT_ID, 116),
        headingX: -1 as const,
        unitSpeed: 0,
        cohesion: 700,
      },
    ],
    individuals: [
      {
        entityId: 0,
        role: "regular",
        slotRow: 0,
        slotCol: 0,
        memberMaxStep: 2,
        confidence: relationship === "allied" ? 950 : 500,
      },
      {
        entityId: 1,
        role: "regular",
        slotRow: 0,
        slotCol: 0,
        memberMaxStep: 0,
      },
    ],
  });
  return {
    world,
    identity,
    formation,
    store: createCombatPressureStore(identity, formation),
  };
}

function advancePressure(
  harness: PressureHarness,
  opportunity: CombatAttackOpportunity | undefined = undefined,
  consequences: readonly CombatConsequenceApplication[] = [],
  tickStartMoraleStates?: ReadonlyMap<
    number,
    "steady" | "strained" | "shaken" | "wavering" | "routing" | "recovering"
  >,
): readonly UnitPressureUpdate[] {
  const result = advanceCombatPressureOneTick(
    harness.identity,
    harness.formation,
    opportunity === undefined ? [] : [opportunity],
    consequences,
    harness.store,
    harness.updates,
    {},
    tickStartMoraleStates,
  );
  return result.updates.slice();
}

function engagedOpportunity(): CombatAttackOpportunity {
  return {
    sourceUnitId: SOURCE_UNIT_ID,
    targetUnitId: TARGET_UNIT_ID,
    sourceMovementStyle: "engageFront",
    engagementState: "engaged",
    weaponReachBand: "long",
  };
}

function survivabilityApplication(
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

function findUpdate(
  updates: readonly UnitPressureUpdate[],
  unitId: number,
): UnitPressureUpdate {
  const update = updates.find((candidate) => candidate.unitId === unitId);
  if (update === undefined) {
    throw new Error(`Missing pressure update for unit ${unitId}.`);
  }
  return update;
}

function setTargetPressure(harness: PressureHarness, pressure: number): void {
  for (const entityId of getUnitMembers(harness.identity, TARGET_UNIT_ID)) {
    setIndividualPressure(harness.formation, entityId, pressure);
  }
}

function targetPressures(harness: PressureHarness): readonly number[] {
  return getUnitMembers(harness.identity, TARGET_UNIT_ID).map((entityId) =>
    getIndividualPressure(harness.formation, entityId),
  );
}

function runDeterministicSequence(): unknown {
  const harness = createHarness({ targetConfidence: 900 });
  const timeline: unknown[] = [];

  for (let tick = 0; tick < 8; tick += 1) {
    const consequences =
      tick === 2
        ? applyCombatConsequences(
            harness.identity,
            harness.formation,
            [survivabilityApplication(tick)],
            harness.consequences,
          ).applications
        : [];
    timeline.push(
      advancePressure(
        harness,
        tick < 4 ? engagedOpportunity() : undefined,
        consequences,
      ),
    );
  }

  return { timeline, pressure: targetPressures(harness) };
}
