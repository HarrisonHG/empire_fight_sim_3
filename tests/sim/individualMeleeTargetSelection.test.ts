import { describe, expect, it } from "vitest";

import {
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitAnchor,
  getUnitCohesion,
  getUnitOrder,
  type FormationBehaviourStore,
} from "../../src/sim/formationBehaviour";
import {
  createIndividualCombatProfileStore,
  getIndividualCombatProfile,
  type IndividualAttackMode,
  type IndividualCombatProfileConfig,
  type IndividualCombatProfileStore,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import {
  advanceIndividualMeleeTargetSelection,
  createIndividualMeleeTargetSelectionStore,
  getSelectedTargetEntityId,
  NO_INDIVIDUAL_TARGET,
  type IndividualMeleeTargetSelectionStore,
  type IndividualSelectedTargetRecord,
} from "../../src/sim/individualMeleeTargetSelection";
import { queryEntitiesWithinRadiusInto } from "../../src/sim/spatialGrid";
import type { WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";

describe("individual melee threat and target selection", () => {
  it("selects the nearest valid hostile and exposes its threat explanation", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
      entity(110, 100, 2, "oneHanded", -1),
    ]);

    const record = sourceRecord(select(harness).records, 0);
    expect(record).toEqual({
      sourceEntityId: 0,
      targetEntityId: 1,
      distanceSquared: 64,
      sourceThreatDistance: 12,
      sourcePreferredMinimumDistance: 4,
      targetThreatDistance: 12,
      sourceCanThreatTarget: true,
      targetCanThreatSource: true,
      withinPreferredDistance: true,
      facingEligible: true,
      selectionReason: "nearestValidHostile",
    });
    expect(getSelectedTargetEntityId(harness.store, 0)).toBe(1);
  });

  it("ignores allies and selects the hostile", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(106, 100, 1, "oneHanded", -1),
      entity(110, 100, 2, "oneHanded", -1),
    ]);

    expect(sourceRecord(select(harness).records, 0).targetEntityId).toBe(2);
  });

  it("rejects hostiles behind the temporary unit-heading facing", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(94, 100, 2, "oneHanded", 1),
    ]);

    expect(sourceRecord(select(harness).records, 0)).toMatchObject({
      targetEntityId: NO_INDIVIDUAL_TARGET,
      facingEligible: false,
      selectionReason: "noValidTarget",
    });
  });

  it.each([
    { weapon: "dagger" as const, distance: 9, selected: false, reach: 8 },
    { weapon: "oneHanded" as const, distance: 9, selected: true, reach: 12 },
    { weapon: "polearm" as const, distance: 19, selected: true, reach: 20 },
    { weapon: "pike" as const, distance: 23, selected: true, reach: 24 },
  ])(
    "maps $weapon profile reach to a $reach-unit world threat distance",
    ({ weapon, distance, selected, reach }) => {
      const harness = createHarness([
        entity(100, 100, 1, weapon, 1),
        entity(100 + distance, 100, 2, "oneHanded", -1),
      ]);
      const record = sourceRecord(select(harness).records, 0);
      expect(record.sourceThreatDistance).toBe(reach);
      expect(record.targetEntityId !== NO_INDIVIDUAL_TARGET).toBe(selected);
    },
  );

  it("prefers a farther target inside a long weapon's preferred band", () => {
    const harness = createHarness([
      entity(100, 100, 1, "polearm", 1),
      entity(108, 100, 2, "oneHanded", -1),
      entity(116, 100, 2, "oneHanded", -1),
    ]);

    expect(sourceRecord(select(harness).records, 0)).toMatchObject({
      targetEntityId: 2,
      withinPreferredDistance: true,
      selectionReason: "preferredDistance",
    });
  });

  it("retains a valid previous target before reconsidering a nearer hostile", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
      entity(110, 100, 2, "oneHanded", -1),
    ]);
    select(harness);
    harness.world.positionsX[1] = 110;
    harness.world.positionsX[2] = 106;

    expect(sourceRecord(select(harness).records, 0)).toMatchObject({
      targetEntityId: 1,
      selectionReason: "previousTargetContinued",
    });
  });

  it("releases a previous target that becomes distant or invalid", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    select(harness);
    harness.world.positionsX[1] = 130;

    expect(sourceRecord(select(harness).records, 0).targetEntityId).toBe(
      NO_INDIVIDUAL_TARGET,
    );
    expect(getSelectedTargetEntityId(harness.store, 0)).toBe(
      NO_INDIVIDUAL_TARGET,
    );
  });

  it("uses entity ID for deterministic ties independent of query return order", () => {
    const definitions = [
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 106, 2, "oneHanded", -1),
      entity(108, 94, 2, "oneHanded", -1),
    ];
    const normal = createHarness(definitions);
    const reversed = createHarness(definitions);

    const normalRecord = sourceRecord(select(normal).records, 0);
    const reversedRecord = sourceRecord(
      advanceIndividualMeleeTargetSelection(
        reversed.world,
        reversed.identity,
        reversed.formation,
        reversed.profiles,
        reversed.store,
        reversed.records,
        (grid, x, y, radius, out) =>
          queryEntitiesWithinRadiusInto(grid, x, y, radius, out).reverse(),
      ).records,
      0,
    );

    expect(normalRecord).toMatchObject({
      targetEntityId: 1,
      selectionReason: "entityIdTieBreak",
    });
    expect(reversedRecord).toEqual(normalRecord);
  });

  it("allows rear-rank selection only when actual position and reach permit it", () => {
    const harness = createHarness([
      entity(108, 100, 1, "polearm", 1, 10),
      entity(80, 100, 1, "polearm", 1, 10),
      entity(120, 100, 2, "oneHanded", -1),
    ]);
    const records = select(harness).records;

    expect(sourceRecord(records, 0).targetEntityId).toBe(2);
    expect(sourceRecord(records, 1).targetEntityId).toBe(NO_INDIVIDUAL_TARGET);
  });

  it("does not activate unarmed, ranged, thrown-only, or magic-only profiles", () => {
    const harness = createHarness([
      entity(100, 80, 1, "unarmed", 1),
      entity(100, 100, 1, "ranged", 1),
      entity(100, 120, 1, "thrown", 1, undefined, ["thrown"]),
      entity(100, 140, 1, "rod", 1, undefined, ["magic"]),
      entity(108, 110, 2, "oneHanded", -1),
    ]);

    const sourceIds = select(harness).records.map((record) => record.sourceEntityId);
    expect(sourceIds).not.toContain(0);
    expect(sourceIds).not.toContain(1);
    expect(sourceIds).not.toContain(2);
    expect(sourceIds).not.toContain(3);
    expect(getIndividualCombatProfile(harness.profiles, 0).supportedAttackModes)
      .toEqual([]);
  });

  it("does not mutate world, formation, pressure, orders, or production combat state", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    const positionsX = harness.world.positionsX.slice();
    const positionsY = harness.world.positionsY.slice();
    const anchor = getUnitAnchor(harness.formation, 1);
    const cohesion = getUnitCohesion(harness.formation, 1);
    const order = getUnitOrder(harness.formation, 1);
    const pressure = getIndividualPressure(harness.formation, 0);

    select(harness);

    expect(harness.world.positionsX).toEqual(positionsX);
    expect(harness.world.positionsY).toEqual(positionsY);
    expect(getUnitAnchor(harness.formation, 1)).toEqual(anchor);
    expect(getUnitCohesion(harness.formation, 1)).toBe(cohesion);
    expect(getUnitOrder(harness.formation, 1)).toBe(order);
    expect(getIndividualPressure(harness.formation, 0)).toBe(pressure);
  });

  it("replays identical target sequences deterministically", () => {
    expect(runReplay()).toEqual(runReplay());
  });
});

interface EntityDefinition {
  readonly x: number;
  readonly y: number;
  readonly factionId: number;
  readonly weapon: IndividualWeaponCategory;
  readonly headingX: -1 | 1;
  readonly unitId?: number;
  readonly supportedAttackModes?: readonly IndividualAttackMode[];
}

interface TargetHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly formation: FormationBehaviourStore;
  readonly profiles: IndividualCombatProfileStore;
  readonly store: IndividualMeleeTargetSelectionStore;
  readonly records: IndividualSelectedTargetRecord[];
}

function entity(
  x: number,
  y: number,
  factionId: number,
  weapon: IndividualWeaponCategory,
  headingX: -1 | 1,
  unitId?: number,
  supportedAttackModes?: readonly IndividualAttackMode[],
): EntityDefinition {
  return {
    x,
    y,
    factionId,
    weapon,
    headingX,
    ...(unitId === undefined ? {} : { unitId }),
    ...(supportedAttackModes === undefined ? {} : { supportedAttackModes }),
  };
}

function createHarness(definitions: readonly EntityDefinition[]): TargetHarness {
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
  const unitIds = Array.from(
    new Set(definitions.map((definition, index) => definition.unitId ?? index + 1)),
  );
  const identity = createUnitIdentityStore({
    entityCount,
    units: unitIds.map((unitId) => {
      const members = definitions.flatMap((definition, entityId) =>
        (definition.unitId ?? entityId + 1) === unitId ? [entityId] : [],
      );
      return {
        unitId,
        factionId: definitions[members[0]!]!.factionId,
        memberEntityIds: members,
      };
    }),
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x5b,
    units: unitIds.map((unitId) => {
      const entityId = definitions.findIndex(
        (definition, index) => (definition.unitId ?? index + 1) === unitId,
      );
      const definition = definitions[entityId]!;
      return {
        unitId,
        anchorX: definition.x,
        anchorY: definition.y,
        headingX: definition.headingX,
        headingY: 0,
        spacing: 4,
        rows: definitions.filter((candidate, index) =>
          (candidate.unitId ?? index + 1) === unitId,
        ).length,
        cols: 1,
        unitSpeed: 0,
        order: "hold" as const,
      };
    }),
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
      combatProfile(entityId, definition.weapon, definition.supportedAttackModes),
    ),
  });
  return {
    world,
    identity,
    formation,
    profiles,
    store: createIndividualMeleeTargetSelectionStore({
      entityCount,
      bounds: world.bounds,
    }),
    records: [],
  };
}

function combatProfile(
  entityId: number,
  primaryWeapon: IndividualWeaponCategory,
  supportedAttackModes?: readonly IndividualAttackMode[],
): IndividualCombatProfileConfig {
  return {
    entityId,
    primaryWeapon,
    ...(supportedAttackModes === undefined ? {} : { supportedAttackModes }),
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

function select(harness: TargetHarness) {
  return advanceIndividualMeleeTargetSelection(
    harness.world,
    harness.identity,
    harness.formation,
    harness.profiles,
    harness.store,
    harness.records,
  );
}

function sourceRecord(
  records: readonly IndividualSelectedTargetRecord[],
  sourceEntityId: number,
): IndividualSelectedTargetRecord {
  const record = records.find((candidate) => candidate.sourceEntityId === sourceEntityId);
  if (record === undefined) throw new Error(`Missing source record ${sourceEntityId}.`);
  return record;
}

function runReplay(): unknown {
  const harness = createHarness([
    entity(100, 100, 1, "polearm", 1),
    entity(114, 100, 2, "oneHanded", -1),
    entity(118, 100, 2, "pike", -1),
  ]);
  const trace: unknown[] = [];
  for (let tick = 0; tick < 12; tick += 1) {
    if (tick === 4) harness.world.positionsX[1] = 125;
    if (tick === 8) harness.world.positionsX[1] = 112;
    trace.push(select(harness).records.map((record) => ({ ...record })));
  }
  return {
    trace,
    targets: [0, 1, 2].map((entityId) =>
      getSelectedTargetEntityId(harness.store, entityId),
    ),
  };
}
