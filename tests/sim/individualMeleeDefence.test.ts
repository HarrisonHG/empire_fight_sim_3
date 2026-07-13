import { describe, expect, it } from "vitest";

import {
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitHeading,
  type FormationBehaviourStore,
} from "../../src/sim/formationBehaviour";
import {
  advanceIndividualCombatActions,
  createIndividualCombatActionStore,
  getIndividualCombatActionState,
  getIndividualCombatFacing,
  type IndividualCombatActionStore,
  type IndividualMeleeAttackAttemptRecord,
} from "../../src/sim/individualCombatAction";
import {
  createIndividualCombatProfileStore,
  type IndividualCombatProfileConfig,
  type IndividualCombatProfileStore,
  type IndividualShieldCarriedState,
  type IndividualShieldCategory,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import {
  createIndividualMeleeDefenceStore,
  getDefenceRecoveryTicksRemaining,
  getIndividualGuardState,
  INDIVIDUAL_MELEE_DEFENCE_TIMING,
  resolveIndividualMeleeDefences,
  type IndividualGuardStateEvent,
  type IndividualMeleeDefenceRecord,
  type IndividualMeleeDefenceStore,
} from "../../src/sim/individualMeleeDefence";
import type { WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";

describe("individual melee defence resolution", () => {
  it("parries a ready frontal attack and consumes guard", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);

    const result = resolve(harness, [attempt(0, 1)]);

    expect(result.records).toEqual([
      expect.objectContaining({
        attackerEntityId: 0,
        defenderEntityId: 1,
        availableDefenceType: "weaponParry",
        outcome: "parried",
        guardStateBeforeResolution: "ready",
        defenceRecoveryTicksAssigned:
          INDIVIDUAL_MELEE_DEFENCE_TIMING.weaponParry.recoveryTicks,
      }),
    ]);
    expect(result.guardStateEvents).toEqual([
      {
        entityId: 1,
        previousGuardState: "ready",
        guardState: "recovering",
      },
    ]);
    expect(getIndividualGuardState(harness.defence, 1)).toBe("recovering");
  });

  it("lands another in-arc attack before guard recovery completes", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);
    resolve(harness, [attempt(0, 1)]);

    const result = resolve(harness, [attempt(2, 1)]);

    expect(result.records).toEqual([
      expect.objectContaining({
        attackerEntityId: 2,
        defenderEntityId: 1,
        availableDefenceType: "weaponParry",
        outcome: "landed",
        landedReason: "guardRecovering",
        guardStateBeforeResolution: "recovering",
      }),
    ]);
  });

  it("returns guard to ready after exactly the configured duration", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    resolve(harness, [attempt(0, 1)]);
    expect(getDefenceRecoveryTicksRemaining(harness.defence, 1)).toBe(4);

    resolve(harness, []);
    expect(getDefenceRecoveryTicksRemaining(harness.defence, 1)).toBe(3);
    expect(getIndividualGuardState(harness.defence, 1)).toBe("recovering");
    resolve(harness, []);
    expect(getDefenceRecoveryTicksRemaining(harness.defence, 1)).toBe(2);
    resolve(harness, []);
    expect(getDefenceRecoveryTicksRemaining(harness.defence, 1)).toBe(1);
    const readyTick = resolve(harness, []);

    expect(getDefenceRecoveryTicksRemaining(harness.defence, 1)).toBe(0);
    expect(getIndividualGuardState(harness.defence, 1)).toBe("ready");
    expect(readyTick.guardStateEvents).toEqual([
      {
        entityId: 1,
        previousGuardState: "recovering",
        guardState: "ready",
      },
    ]);
  });

  it("uses held bucklers for buckler blocks", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1, "buckler", "held"),
    ]);

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "bucklerBlock",
      outcome: "bucklerBlocked",
      defenceRecoveryTicksAssigned:
        INDIVIDUAL_MELEE_DEFENCE_TIMING.bucklerBlock.recoveryTicks,
    });
  });

  it("uses held full shields for shield blocks and prefers shields over parry", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1, "shield", "held"),
    ]);

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "shieldBlock",
      outcome: "shieldBlocked",
      defenceRecoveryTicksAssigned:
        INDIVIDUAL_MELEE_DEFENCE_TIMING.shieldBlock.recoveryTicks,
    });
  });

  it("gives full shields a wider arc than bucklers or weapon parries", () => {
    const shieldHarness = createHarness([
      entity(100, 108, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1, "shield", "held"),
    ]);
    const bucklerHarness = createHarness([
      entity(100, 108, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1, "buckler", "held"),
    ]);
    const weaponHarness = createHarness([
      entity(100, 108, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);

    expect(resolve(shieldHarness, [attempt(0, 1)]).records[0]).toMatchObject({
      outcome: "shieldBlocked",
      incomingDirectionName: "south",
    });
    expect(resolve(bucklerHarness, [attempt(0, 1)]).records[0]).toMatchObject({
      outcome: "landed",
      landedReason: "outsideDefenceArc",
    });
    expect(resolve(weaponHarness, [attempt(0, 1)]).records[0]).toMatchObject({
      outcome: "landed",
      landedReason: "outsideDefenceArc",
    });
  });

  it("does not treat slung shields as active defence", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "unarmed", -1, "shield", "slung"),
    ]);

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "none",
      outcome: "landed",
      landedReason: "noActiveDefence",
    });
  });

  it("lets rear attacks land without consuming frontal guard", () => {
    const harness = createHarness([
      entity(108, 100, 1, "oneHanded", -1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 100, 1, "oneHanded", 1),
    ]);

    const result = resolve(harness, [attempt(0, 1), attempt(2, 1)]);

    expect(result.records).toEqual([
      expect.objectContaining({
        attackerEntityId: 0,
        outcome: "landed",
        landedReason: "outsideDefenceArc",
      }),
      expect.objectContaining({
        attackerEntityId: 2,
        outcome: "parried",
        guardStateBeforeResolution: "ready",
      }),
    ]);
  });

  it.each([
    { weapon: "unarmed" as const },
    { weapon: "ranged" as const },
  ])("lands against $weapon defenders without held shields", ({ weapon }) => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, weapon, -1),
    ]);

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "none",
      outcome: "landed",
      landedReason: "noActiveDefence",
    });
  });

  it.each([
    {
      name: "committing",
      prepare: (harness: DefenceHarness) => {
        advanceIndividualCombatActions(
          harness.world,
          harness.identity,
          harness.formation,
          harness.profiles,
          [selectedRecord(1, 0)],
          harness.actions,
        );
      },
    },
    {
      name: "attack-recovering",
      prepare: (harness: DefenceHarness) => {
        advanceIndividualCombatActions(
          harness.world,
          harness.identity,
          harness.formation,
          harness.profiles,
          [selectedRecord(1, 0)],
          harness.actions,
        );
        for (let tick = 0; tick < 4; tick += 1) {
          advanceIndividualCombatActions(
            harness.world,
            harness.identity,
            harness.formation,
            harness.profiles,
            [selectedRecord(1, 0)],
            harness.actions,
          );
        }
      },
    },
  ])("$name defenders cannot actively defend", ({ prepare }) => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    prepare(harness);

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      outcome: "landed",
      landedReason: "defenderBusy",
    });
  });

  it("creates one defence and one opening for two frontal attackers", () => {
    const harness = createHarness([
      entity(92, 96, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);

    expect(resolve(harness, [attempt(2, 1), attempt(0, 1)]).records).toEqual([
      expect.objectContaining({
        attackerEntityId: 0,
        outcome: "parried",
      }),
      expect.objectContaining({
        attackerEntityId: 2,
        outcome: "landed",
        landedReason: "guardRecovering",
      }),
    ]);
  });

  it("orders three attackers canonically by defender then attacker", () => {
    const harness = createHarness([
      entity(92, 96, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 100, 1, "oneHanded", 1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);

    expect(
      resolve(harness, [attempt(3, 1), attempt(0, 1), attempt(2, 1)]).records.map(
        (record) => record.attackerEntityId,
      ),
    ).toEqual([0, 2, 3]);
  });

  it("produces identical records when input attempt order is reversed", () => {
    const forward = createHarness([
      entity(92, 96, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);
    const reversed = createHarness([
      entity(92, 96, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);

    expect(resolve(reversed, [attempt(2, 1), attempt(0, 1)]).records).toEqual(
      resolve(forward, [attempt(0, 1), attempt(2, 1)]).records,
    );
  });

  it("uses stable defender action and facing snapshots for simultaneous attacks", () => {
    const harness = createHarness([
      entity(92, 96, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);

    const records = resolve(harness, [attempt(0, 1), attempt(2, 1)]).records;

    expect(records).toEqual([
      expect.objectContaining({
        defenderActionState: "ready",
        defenderFacingX: -1,
        defenderFacingY: 0,
      }),
      expect.objectContaining({
        defenderActionState: "ready",
        defenderFacingX: -1,
        defenderFacingY: 0,
        guardStateBeforeResolution: "recovering",
      }),
    ]);
  });

  it("keeps northeast and southeast inside an east-facing wrap-around frontal arc", () => {
    const northeast = createHarness([
      entity(108, 92, 1, "oneHanded", -1),
      entity(100, 100, 2, "oneHanded", 1),
    ]);
    const southeast = createHarness([
      entity(108, 108, 1, "oneHanded", -1),
      entity(100, 100, 2, "oneHanded", 1),
    ]);

    expect(resolve(northeast, [attempt(0, 1)]).records[0]).toMatchObject({
      incomingDirectionName: "northeast",
      outcome: "parried",
    });
    expect(resolve(southeast, [attempt(0, 1)]).records[0]).toMatchObject({
      incomingDirectionName: "southeast",
      outcome: "parried",
    });
  });

  it("ignores invalidated attack-attempt records", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);

    expect(resolve(harness, [invalidatedAttempt(0, 1)]).records).toEqual([]);
  });

  it("does not mutate action facing/state, formation heading, movement, pressure, morale or hits", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    const positionsX = Array.from(harness.world.positionsX);
    const positionsY = Array.from(harness.world.positionsY);
    const velocitiesX = Array.from(harness.world.velocitiesX);
    const velocitiesY = Array.from(harness.world.velocitiesY);
    const facing = getIndividualCombatFacing(harness.actions, 1);
    const actionState = getIndividualCombatActionState(harness.actions, 1);
    const heading = getUnitHeading(harness.formation, 2);
    const pressure = getIndividualPressure(harness.formation, 1);

    resolve(harness, [attempt(0, 1)]);

    expect(Array.from(harness.world.positionsX)).toEqual(positionsX);
    expect(Array.from(harness.world.positionsY)).toEqual(positionsY);
    expect(Array.from(harness.world.velocitiesX)).toEqual(velocitiesX);
    expect(Array.from(harness.world.velocitiesY)).toEqual(velocitiesY);
    expect(getIndividualCombatFacing(harness.actions, 1)).toEqual(facing);
    expect(getIndividualCombatActionState(harness.actions, 1)).toBe(actionState);
    expect(getUnitHeading(harness.formation, 2)).toEqual(heading);
    expect(getIndividualPressure(harness.formation, 1)).toBe(pressure);
  });

  it("reuses output arrays", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    const records: IndividualMeleeDefenceRecord[] = [
      {} as IndividualMeleeDefenceRecord,
    ];
    const events: IndividualGuardStateEvent[] = [
      {
        entityId: 99,
        previousGuardState: "ready",
        guardState: "ready",
      },
    ];

    const result = resolveIndividualMeleeDefences(
      harness.world,
      harness.identity,
      harness.actions,
      harness.profiles,
      harness.defence,
      [attempt(0, 1)],
      records,
      events,
    );

    expect(result.records).toBe(records);
    expect(result.guardStateEvents).toBe(events);
    expect(records).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it("replays deterministically", () => {
    expect(runReplay()).toEqual(runReplay());
  });
});

interface EntityDefinition {
  readonly x: number;
  readonly y: number;
  readonly factionId: number;
  readonly weapon: IndividualWeaponCategory;
  readonly headingX: -1 | 1;
  readonly shieldCategory: IndividualShieldCategory;
  readonly shieldCarriedState: IndividualShieldCarriedState;
}

interface DefenceHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly formation: FormationBehaviourStore;
  readonly profiles: IndividualCombatProfileStore;
  readonly actions: IndividualCombatActionStore;
  readonly defence: IndividualMeleeDefenceStore;
  readonly records: IndividualMeleeDefenceRecord[];
  readonly events: IndividualGuardStateEvent[];
}

function entity(
  x: number,
  y: number,
  factionId: number,
  weapon: IndividualWeaponCategory,
  headingX: -1 | 1,
  shieldCategory: IndividualShieldCategory = "none",
  shieldCarriedState: IndividualShieldCarriedState = "none",
): EntityDefinition {
  return {
    x,
    y,
    factionId,
    weapon,
    headingX,
    shieldCategory,
    shieldCarriedState,
  };
}

function createHarness(definitions: readonly EntityDefinition[]): DefenceHarness {
  const entityCount = definitions.length;
  const world: WorldState = {
    entityCount,
    bounds: { width: 512, height: 512 },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: Int32Array.from(definitions.map((definition) => definition.x)),
    positionsY: Int32Array.from(definitions.map((definition) => definition.y)),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const identity = createUnitIdentityStore({
    entityCount,
    units: definitions.map((definition, entityId) => ({
      unitId: entityId + 1,
      factionId: definition.factionId,
      memberEntityIds: [entityId],
    })),
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x5c20,
    units: definitions.map((definition, entityId) => ({
      unitId: entityId + 1,
      anchorX: definition.x,
      anchorY: definition.y,
      headingX: definition.headingX,
      headingY: 0,
      spacing: 4,
      rows: 1,
      cols: 1,
      unitSpeed: 0,
      order: "hold" as const,
    })),
    individuals: definitions.map((_, entityId) => ({
      entityId,
      role: "regular" as const,
      slotRow: 0,
      slotCol: 0,
      memberMaxStep: 0,
    })),
  });
  const profiles = createIndividualCombatProfileStore({
    entityCount,
    profiles: definitions.map((definition, entityId) =>
      combatProfile(entityId, definition),
    ),
  });
  const actions = createIndividualCombatActionStore(identity, formation, profiles, {
    entityCount,
  });
  return {
    world,
    identity,
    formation,
    profiles,
    actions,
    defence: createIndividualMeleeDefenceStore({ entityCount }),
    records: [],
    events: [],
  };
}

function combatProfile(
  entityId: number,
  definition: EntityDefinition,
): IndividualCombatProfileConfig {
  return {
    entityId,
    primaryWeapon: definition.weapon,
    shieldCategory: definition.shieldCategory,
    shieldCarriedState: definition.shieldCarriedState,
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

function resolve(
  harness: DefenceHarness,
  attempts: readonly IndividualMeleeAttackAttemptRecord[],
) {
  return resolveIndividualMeleeDefences(
    harness.world,
    harness.identity,
    harness.actions,
    harness.profiles,
    harness.defence,
    attempts,
    harness.records,
    harness.events,
  );
}

function attempt(
  attackerEntityId: number,
  defenderEntityId: number,
  weaponCategory: IndividualWeaponCategory = "oneHanded",
  awkwardDistance = false,
): IndividualMeleeAttackAttemptRecord {
  return {
    attackerEntityId,
    targetEntityId: defenderEntityId,
    weaponCategory,
    commitmentDurationTicks: 3,
    recoveryDurationTicks: 3,
    distanceSquaredAtResolution: 64,
    threatDistance: 12,
    preferredMinimumDistance: 4,
    awkwardDistance,
    facingX: 1,
    facingY: 0,
    outcome: "attempted",
  };
}

function invalidatedAttempt(
  attackerEntityId: number,
  defenderEntityId: number,
): IndividualMeleeAttackAttemptRecord {
  return {
    ...attempt(attackerEntityId, defenderEntityId),
    outcome: "invalidated",
    invalidationReason: "outOfThreatDistance",
  };
}

function selectedRecord(sourceEntityId: number, targetEntityId: number) {
  return {
    sourceEntityId,
    targetEntityId,
    distanceSquared: 64,
    sourceThreatDistance: 12,
    sourcePreferredMinimumDistance: 4,
    targetThreatDistance: 12,
    sourceCanThreatTarget: true,
    targetCanThreatSource: true,
    withinPreferredDistance: true,
    facingEligible: true,
    selectionReason: "nearestValidHostile" as const,
  };
}

function runReplay(): unknown {
  const harness = createHarness([
    entity(92, 96, 1, "oneHanded", 1),
    entity(100, 100, 2, "oneHanded", -1, "shield", "held"),
    entity(92, 104, 1, "oneHanded", 1),
  ]);
  const trace: unknown[] = [];
  for (let tick = 0; tick < 10; tick += 1) {
    const attempts =
      tick % 2 === 0
        ? [attempt(2, 1), attempt(0, 1)]
        : [attempt(0, 1)];
    const result = resolve(harness, attempts);
    trace.push({
      tick,
      records: result.records.map((record) => ({ ...record })),
      events: result.guardStateEvents.map((event) => ({ ...event })),
      guardState: getIndividualGuardState(harness.defence, 1),
      recoveryTicks: getDefenceRecoveryTicksRemaining(harness.defence, 1),
    });
  }
  return trace;
}
