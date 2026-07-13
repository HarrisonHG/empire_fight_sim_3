import { describe, expect, it } from "vitest";

import {
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitHeading,
} from "../../src/sim/formationBehaviour";
import {
  createIndividualCombatActionStore,
  getIndividualCombatActionState,
  getIndividualCombatFacing,
} from "../../src/sim/individualCombatAction";
import {
  createIndividualCombatProfileStore,
  type IndividualCombatProfileConfig,
} from "../../src/sim/individualCombatProfile";
import {
  applyIndividualLandedHits,
  createIndividualGlobalHitStore,
  getIndividualCurrentGlobalHits,
} from "../../src/sim/individualGlobalHits";
import {
  createIndividualLandedHitGateStore,
  filterIndividualLandedHitsThroughGate,
  LANDED_HIT_GATE_TICKS_PER_SECOND,
  type IndividualLandedHitGateDecisionRecord,
} from "../../src/sim/individualLandedHitGate";
import {
  createIndividualMeleeDefenceStore,
  getIndividualGuardState,
  type IndividualMeleeDefenceRecord,
} from "../../src/sim/individualMeleeDefence";
import type { WorldState } from "../../src/sim/types";
import { createUnitIdentityStore } from "../../src/sim/unitIdentity";

describe("individual landed-hit gate", () => {
  it("accepts the first landed strike for an attacker-target relationship", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 2 });

    const result = filterIndividualLandedHitsThroughGate(store, 0, [
      landedRecord(0, 1),
    ]);

    expect(result).toMatchObject({
      landedRecordsConsidered: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      relationshipCreatedCount: 1,
      expiredRelationshipCount: 0,
      activeRelationshipCount: 1,
    });
    expect(result.decisions).toEqual([
      {
        attackerEntityId: 0,
        targetEntityId: 1,
        currentTick: 0,
        outcome: "accepted",
        reason: "accepted",
        previousNextAllowedTick: null,
        resultingNextAllowedTick: LANDED_HIT_GATE_TICKS_PER_SECOND,
        cooldownTicksRemaining: LANDED_HIT_GATE_TICKS_PER_SECOND,
      },
    ]);
    expect(result.acceptedRecords).toEqual([landedRecord(0, 1)]);
  });

  it("rejects the same pair for the next 19 ticks without extending cooldown", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 2 });
    filterIndividualLandedHitsThroughGate(store, 0, [landedRecord(0, 1)]);

    for (let tick = 1; tick < LANDED_HIT_GATE_TICKS_PER_SECOND; tick += 1) {
      const result = filterIndividualLandedHitsThroughGate(store, tick, [
        landedRecord(0, 1),
      ]);

      expect(result.acceptedCount).toBe(0);
      expect(result.rejectedCount).toBe(1);
      expect(result.decisions[0]).toMatchObject({
        outcome: "rejected",
        reason: "relationshipCooldown",
        previousNextAllowedTick: LANDED_HIT_GATE_TICKS_PER_SECOND,
        resultingNextAllowedTick: LANDED_HIT_GATE_TICKS_PER_SECOND,
        cooldownTicksRemaining: LANDED_HIT_GATE_TICKS_PER_SECOND - tick,
      });
    }
  });

  it("accepts the same pair at exactly tick 20", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 2 });
    filterIndividualLandedHitsThroughGate(store, 0, [landedRecord(0, 1)]);

    const result = filterIndividualLandedHitsThroughGate(
      store,
      LANDED_HIT_GATE_TICKS_PER_SECOND,
      [landedRecord(0, 1)],
    );

    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.decisions[0]).toMatchObject({
      outcome: "accepted",
      previousNextAllowedTick: LANDED_HIT_GATE_TICKS_PER_SECOND,
      resultingNextAllowedTick: LANDED_HIT_GATE_TICKS_PER_SECOND * 2,
    });
  });

  it("lets another attacker hit the same target immediately", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 3 });
    filterIndividualLandedHitsThroughGate(store, 0, [landedRecord(0, 2)]);

    const result = filterIndividualLandedHitsThroughGate(store, 1, [
      landedRecord(1, 2),
    ]);

    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.decisions[0]).toMatchObject({
      attackerEntityId: 1,
      targetEntityId: 2,
      previousNextAllowedTick: null,
    });
  });

  it("lets the same attacker hit another target immediately", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 3 });
    filterIndividualLandedHitsThroughGate(store, 0, [landedRecord(0, 1)]);

    const result = filterIndividualLandedHitsThroughGate(store, 1, [
      landedRecord(0, 2),
    ]);

    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.decisions[0]).toMatchObject({
      attackerEntityId: 0,
      targetEntityId: 2,
      previousNextAllowedTick: null,
    });
  });

  it("does not create or extend relationships for blocked or parried attacks", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 4 });

    const defended = filterIndividualLandedHitsThroughGate(store, 0, [
      defendedRecord(0, 1, "parried"),
      defendedRecord(0, 2, "bucklerBlocked"),
      defendedRecord(0, 3, "shieldBlocked"),
    ]);
    const landed = filterIndividualLandedHitsThroughGate(store, 1, [
      landedRecord(0, 1),
      landedRecord(0, 2),
      landedRecord(0, 3),
    ]);

    expect(defended).toMatchObject({
      landedRecordsConsidered: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      activeRelationshipCount: 0,
    });
    expect(landed.acceptedCount).toBe(3);
    expect(landed.rejectedCount).toBe(0);
  });

  it("resolves multiple same-tick records in target then attacker order", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 5 });

    const result = filterIndividualLandedHitsThroughGate(store, 0, [
      landedRecord(4, 3),
      landedRecord(2, 1),
      landedRecord(1, 1),
      landedRecord(3, 3),
    ]);

    expect(decisionPairs(result.decisions)).toEqual([
      [1, 1],
      [2, 1],
      [3, 3],
      [4, 3],
    ]);
    expect(result.acceptedCount).toBe(4);
  });

  it("produces identical decisions for reversed input order", () => {
    const forward = runSingleTick([
      landedRecord(4, 3),
      landedRecord(2, 1),
      landedRecord(1, 1),
      landedRecord(3, 3),
    ]);
    const reversed = runSingleTick([
      landedRecord(3, 3),
      landedRecord(1, 1),
      landedRecord(2, 1),
      landedRecord(4, 3),
    ]);

    expect(reversed).toEqual(forward);
  });

  it("expires stale relationships deterministically", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 3 });
    filterIndividualLandedHitsThroughGate(store, 0, [
      landedRecord(0, 1),
      landedRecord(0, 2),
    ]);

    const result = filterIndividualLandedHitsThroughGate(
      store,
      LANDED_HIT_GATE_TICKS_PER_SECOND,
      [landedRecord(0, 1)],
    );
    const empty = filterIndividualLandedHitsThroughGate(
      store,
      LANDED_HIT_GATE_TICKS_PER_SECOND,
      [],
    );

    expect(result.expiredRelationshipCount).toBe(1);
    expect(result.activeRelationshipCount).toBe(1);
    expect(empty.expiredRelationshipCount).toBe(0);
    expect(empty.activeRelationshipCount).toBe(1);
  });

  it("passes only accepted records into global-hit application", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 2 });
    const profiles = createProfileStore(2);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 2 });

    const first = filterIndividualLandedHitsThroughGate(store, 0, [
      landedRecord(0, 1),
    ]);
    applyIndividualLandedHits(hits, first.acceptedRecords);
    const rejected = filterIndividualLandedHitsThroughGate(store, 1, [
      landedRecord(0, 1),
    ]);
    applyIndividualLandedHits(hits, rejected.acceptedRecords);

    expect(first.acceptedCount).toBe(1);
    expect(rejected.rejectedCount).toBe(1);
    expect(getIndividualCurrentGlobalHits(hits, 1)).toBe(1);
  });

  it("lets several attackers each remove one hit from the same target", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 4 });
    const profiles = createProfileStore(4);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 4 });

    const gated = filterIndividualLandedHitsThroughGate(store, 0, [
      landedRecord(0, 3),
      landedRecord(1, 3),
      landedRecord(2, 3),
    ]);
    const applied = applyIndividualLandedHits(hits, gated.acceptedRecords);

    expect(gated.acceptedCount).toBe(3);
    expect(applied.totalAppliedHitLoss).toBe(2);
    expect(applied.alreadyZeroApplicationCount).toBe(1);
    expect(getIndividualCurrentGlobalHits(hits, 3)).toBe(0);
  });

  it("reuses output arrays", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 3 });
    const decisions: IndividualLandedHitGateDecisionRecord[] = [
      {} as IndividualLandedHitGateDecisionRecord,
    ];
    const accepted: IndividualMeleeDefenceRecord[] = [landedRecord(1, 2)];

    const first = filterIndividualLandedHitsThroughGate(
      store,
      0,
      [landedRecord(0, 1)],
      decisions,
      accepted,
    );
    const second = filterIndividualLandedHitsThroughGate(
      store,
      1,
      [landedRecord(0, 1)],
      decisions,
      accepted,
    );

    expect(first.decisions).toBe(decisions);
    expect(first.acceptedRecords).toBe(accepted);
    expect(second.decisions).toBe(decisions);
    expect(second.acceptedRecords).toBe(accepted);
    expect(second.decisions).toHaveLength(1);
    expect(second.acceptedRecords).toHaveLength(0);
  });

  it("replays deterministically", () => {
    expect(runReplay()).toEqual(runReplay());
  });

  it("rejects decreasing tick values", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 2 });
    filterIndividualLandedHitsThroughGate(store, 3, []);

    expect(() =>
      filterIndividualLandedHitsThroughGate(store, 2, []),
    ).toThrow(RangeError);
  });

  it("keeps repeated calls at the same tick deterministic", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 2 });
    const first = filterIndividualLandedHitsThroughGate(store, 0, [
      landedRecord(0, 1),
    ]);
    const second = filterIndividualLandedHitsThroughGate(store, 0, [
      landedRecord(0, 1),
    ]);

    expect(first.decisions[0]).toMatchObject({ outcome: "accepted" });
    expect(second.decisions[0]).toMatchObject({
      outcome: "rejected",
      cooldownTicksRemaining: LANDED_HIT_GATE_TICKS_PER_SECOND,
    });
  });

  it("does not expose movement, action, defence, formation, morale, casualty, or production fields", () => {
    const store = createIndividualLandedHitGateStore({ entityCount: 2 });

    const result = filterIndividualLandedHitsThroughGate(store, 0, [
      landedRecord(0, 1),
    ]);

    expect(Object.keys(result.decisions[0]!).sort()).toEqual([
      "attackerEntityId",
      "cooldownTicksRemaining",
      "currentTick",
      "outcome",
      "previousNextAllowedTick",
      "reason",
      "resultingNextAllowedTick",
      "targetEntityId",
    ]);
  });

  it("does not mutate world, action, defence, formation, morale, casualty, or production state", () => {
    const world: WorldState = {
      entityCount: 2,
      bounds: { width: 128, height: 128 },
      ids: Uint32Array.from([0, 1]),
      positionsX: Int32Array.from([50, 58]),
      positionsY: Int32Array.from([50, 50]),
      velocitiesX: new Int32Array(2),
      velocitiesY: new Int32Array(2),
    };
    const identity = createUnitIdentityStore({
      entityCount: 2,
      units: [
        { unitId: 1, factionId: 1, memberEntityIds: [0] },
        { unitId: 2, factionId: 2, memberEntityIds: [1] },
      ],
    });
    const formation = createFormationBehaviourStore(identity, {
      entityCount: 2,
      rngSeed: 0x5e01,
      units: [
        formationUnit(1, 50, 1),
        formationUnit(2, 58, -1),
      ],
      individuals: [
        individual(0),
        individual(1),
      ],
    });
    const profiles = createProfileStore(2);
    const action = createIndividualCombatActionStore(identity, formation, profiles, {
      entityCount: 2,
    });
    const defence = createIndividualMeleeDefenceStore({ entityCount: 2 });
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 2 });
    const positionsX = Array.from(world.positionsX);
    const positionsY = Array.from(world.positionsY);
    const velocitiesX = Array.from(world.velocitiesX);
    const velocitiesY = Array.from(world.velocitiesY);
    const facing = getIndividualCombatFacing(action, 1);
    const actionState = getIndividualCombatActionState(action, 1);
    const guardState = getIndividualGuardState(defence, 1);
    const heading = getUnitHeading(formation, 2);
    const pressure = getIndividualPressure(formation, 1);
    const currentHits = getIndividualCurrentGlobalHits(hits, 1);

    filterIndividualLandedHitsThroughGate(
      createIndividualLandedHitGateStore({ entityCount: 2 }),
      0,
      [landedRecord(0, 1)],
    );

    expect(Array.from(world.positionsX)).toEqual(positionsX);
    expect(Array.from(world.positionsY)).toEqual(positionsY);
    expect(Array.from(world.velocitiesX)).toEqual(velocitiesX);
    expect(Array.from(world.velocitiesY)).toEqual(velocitiesY);
    expect(getIndividualCombatFacing(action, 1)).toEqual(facing);
    expect(getIndividualCombatActionState(action, 1)).toBe(actionState);
    expect(getIndividualGuardState(defence, 1)).toBe(guardState);
    expect(getUnitHeading(formation, 2)).toEqual(heading);
    expect(getIndividualPressure(formation, 1)).toBe(pressure);
    expect(getIndividualCurrentGlobalHits(hits, 1)).toBe(currentHits);
  });
});

function runSingleTick(records: readonly IndividualMeleeDefenceRecord[]) {
  const store = createIndividualLandedHitGateStore({ entityCount: 5 });
  const result = filterIndividualLandedHitsThroughGate(store, 0, records);
  return {
    decisions: result.decisions.map((decision) => ({ ...decision })),
    acceptedPairs: result.acceptedRecords.map((record) => [
      record.attackerEntityId,
      record.defenderEntityId,
    ]),
    counts: {
      considered: result.landedRecordsConsidered,
      accepted: result.acceptedCount,
      rejected: result.rejectedCount,
      active: result.activeRelationshipCount,
    },
  };
}

function runReplay(): unknown {
  const store = createIndividualLandedHitGateStore({ entityCount: 4 });
  const trace: unknown[] = [];
  const schedule: readonly (readonly IndividualMeleeDefenceRecord[])[] = [
    [landedRecord(0, 3), landedRecord(1, 3)],
    [landedRecord(0, 3), defendedRecord(2, 3, "parried")],
    [landedRecord(2, 3), landedRecord(0, 1)],
    [],
    [landedRecord(0, 3), landedRecord(1, 3)],
  ];

  for (let tick = 0; tick < schedule.length; tick += 1) {
    const result = filterIndividualLandedHitsThroughGate(
      store,
      tick,
      schedule[tick]!,
    );
    trace.push({
      tick,
      decisions: result.decisions.map((decision) => ({ ...decision })),
      acceptedPairs: result.acceptedRecords.map((record) => [
        record.attackerEntityId,
        record.defenderEntityId,
      ]),
      counts: {
        considered: result.landedRecordsConsidered,
        accepted: result.acceptedCount,
        rejected: result.rejectedCount,
        expired: result.expiredRelationshipCount,
        active: result.activeRelationshipCount,
      },
    });
  }
  return trace;
}

function decisionPairs(
  decisions: readonly IndividualLandedHitGateDecisionRecord[],
): [number, number][] {
  return decisions.map((decision) => [
    decision.attackerEntityId,
    decision.targetEntityId,
  ]);
}

function createProfileStore(entityCount: number) {
  return createIndividualCombatProfileStore({
    entityCount,
    profiles: Array.from({ length: entityCount }, (_, entityId) =>
      combatProfile(entityId),
    ),
  });
}

function combatProfile(entityId: number): IndividualCombatProfileConfig {
  return {
    entityId,
    primaryWeapon: "oneHanded",
    shieldCategory: "none",
    shieldCarriedState: "none",
    armourCategory: "none",
    hasQualifyingHelmet: false,
    qualifications: {
      hasWeaponMaster: true,
      hasShield: true,
      hasMarksman: true,
      hasThrown: true,
      hasAmbidexterity: false,
      enduranceLevels: 0,
      fortitudeLevels: 0,
      hasDreadnought: false,
    },
    magicalCapabilities: {
      canUseRod: true,
      canUseStaff: true,
      canWearMageArmour: true,
      canDeliverCombatMagic: true,
    },
  };
}

function landedRecord(
  attackerEntityId: number,
  defenderEntityId: number,
): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId,
    defenderEntityId,
    attackerWeaponCategory: "oneHanded",
    defenderActiveWeaponCategory: "oneHanded",
    defenderShieldCategory: "none",
    defenderShieldCarriedState: "none",
    defenderActionState: "ready",
    guardStateBeforeResolution: "ready",
    defenderFacingX: -1,
    defenderFacingY: 0,
    incomingDirectionName: "west",
    incomingDirectionOctantIndex: 4,
    availableDefenceType: "none",
    outcome: "landed",
    landedReason: "noActiveDefence",
    defenceRecoveryTicksAssigned: 0,
    awkwardDistance: false,
  };
}

function defendedRecord(
  attackerEntityId: number,
  defenderEntityId: number,
  outcome: "parried" | "bucklerBlocked" | "shieldBlocked",
): IndividualMeleeDefenceRecord {
  const availableDefenceType =
    outcome === "shieldBlocked"
      ? "shieldBlock"
      : outcome === "bucklerBlocked"
        ? "bucklerBlock"
        : "weaponParry";
  return {
    ...landedRecord(attackerEntityId, defenderEntityId),
    availableDefenceType,
    outcome,
    defenceRecoveryTicksAssigned: 4,
  };
}

function formationUnit(unitId: number, anchorX: number, headingX: -1 | 1) {
  return {
    unitId,
    anchorX,
    anchorY: 50,
    headingX,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: 1,
    unitSpeed: 0,
    order: "hold" as const,
  };
}

function individual(entityId: number) {
  return {
    entityId,
    role: "regular" as const,
    slotRow: 0,
    slotCol: 0,
    memberMaxStep: 0,
  };
}
