import { describe, expect, it } from "vitest";

import {
  createCombatTempoStore,
  getUnitAttackCooldownTicks,
  type CombatAttackOpportunity,
  type CombatTempoStore,
} from "../../src/sim/combatTempo";
import type { CombatStrikeResolution } from "../../src/sim/combatResolution";
import {
  advanceCombatPipelineOneTick,
  createCombatPipelineOutput,
  type CombatPipelineOutput,
} from "../../src/sim/combatPipeline";
import {
  createCombatSurvivabilityStore,
  getUnitAccumulatedDamage,
  getUnitMaxDamageCapacity,
  isUnitDamageCapacityReached,
  type CombatSurvivabilityApplication,
  type CombatSurvivabilityStore,
} from "../../src/sim/combatSurvivability";
import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getUnitAnchor,
  getUnitHeading,
  getUnitMovementStyle,
  type FormationBehaviourStore,
  type UnitOrder,
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
  type ArmourClass,
  type ShieldClass,
  type UnitLoadoutStore,
  type WeaponReachBand,
} from "../../src/sim/unitLoadout";

describe("combat pipeline", () => {
  it("produces no records when there is no engagement", () => {
    const { world, identity, loadout, formation, tempo, survivability } =
      createPipelineHarness({
        positions: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        units: [
          {
            unitId: 10,
            factionId: 1,
            memberEntityIds: [0],
            reach: "short",
          },
          { unitId: 20, factionId: 2, memberEntityIds: [1] },
        ],
        tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
      });

    const result = advanceCombatPipelineOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
      survivability,
    );

    expect(result.opportunities).toEqual([]);
    expect(result.strikes).toEqual([]);
    expect(result.applications).toEqual([]);
    expect(getUnitAttackCooldownTicks(tempo, 10)).toBe(10);
    expect(getUnitAccumulatedDamage(survivability, 20)).toBe(0);
  });

  it("produces no strikes or applications for threatening-only targets", () => {
    const { world, identity, loadout, formation, tempo, survivability } =
      createPipelineHarness({
        positions: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
        ],
        units: [
          {
            unitId: 10,
            factionId: 1,
            memberEntityIds: [0],
            reach: "short",
          },
          { unitId: 20, factionId: 2, memberEntityIds: [1] },
        ],
        tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
      });

    const result = advanceCombatPipelineOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
      survivability,
    );

    expect(result.opportunities).toEqual([]);
    expect(result.strikes).toEqual([]);
    expect(result.applications).toEqual([]);
    expect(getUnitAttackCooldownTicks(tempo, 10)).toBe(10);
    expect(getUnitAccumulatedDamage(survivability, 20)).toBe(0);
  });

  it("produces no strikes or applications for contacting-only targets", () => {
    const { world, identity, loadout, formation, tempo, survivability } =
      createPipelineHarness({
        positions: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
        ],
        units: [
          {
            unitId: 10,
            factionId: 1,
            memberEntityIds: [0],
            order: "hold",
            reach: "short",
          },
          { unitId: 20, factionId: 2, memberEntityIds: [1] },
        ],
        tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
      });

    const result = advanceCombatPipelineOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
      survivability,
    );

    expect(getUnitMovementStyle(formation, 10)).toBe("orderedHalt");
    expect(result.opportunities).toEqual([]);
    expect(result.strikes).toEqual([]);
    expect(result.applications).toEqual([]);
    expect(getUnitAccumulatedDamage(survivability, 20)).toBe(0);
  });

  it("eventually produces an opportunity, strike, and application after formation creates engageFront", () => {
    const harness = createEngagedPipelineHarness();
    const results: ReturnType<typeof runPipeline>[] = [];

    for (let tick = 0; tick < 10; tick += 1) {
      results.push(runPipeline(harness));
    }

    expect(results.slice(0, 9).every((result) => result.opportunities.length === 0))
      .toBe(true);
    expect(results[9]).toMatchObject({
      opportunities: [
        {
          sourceUnitId: 10,
          targetUnitId: 20,
          sourceMovementStyle: "engageFront",
          engagementState: "engaged",
          weaponReachBand: "long",
        },
      ],
      strikes: [
        {
          sourceUnitId: 10,
          targetUnitId: 20,
          sourceMovementStyle: "engageFront",
          engagementState: "engaged",
          weaponReachBand: "long",
          consequenceKind: "damage",
          damageValue: 1,
        },
      ],
      applications: [
        {
          sourceUnitId: 10,
          targetUnitId: 20,
          incomingDamageValue: 1,
          appliedDamageValue: 1,
          accumulatedDamageBefore: 0,
          accumulatedDamageAfter: 1,
          capacityReached: false,
        },
      ],
    });
    expect(getUnitAccumulatedDamage(harness.survivability, 20)).toBe(1);
  });

  it("preserves deterministic record order and target links", () => {
    const harness = createPipelineHarness({
      positions: [
        { x: 100, y: 100 },
        { x: 110, y: 100 },
        { x: 200, y: 100 },
        { x: 210, y: 100 },
      ],
      units: [
        {
          unitId: 10,
          factionId: 1,
          memberEntityIds: [0],
          order: "advance",
          reach: "long",
        },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
        {
          unitId: 30,
          factionId: 1,
          memberEntityIds: [2],
          order: "advance",
          reach: "long",
        },
        { unitId: 40, factionId: 2, memberEntityIds: [3] },
      ],
      tempoUnits: [
        { unitId: 10, initialCooldownTicks: 1 },
        { unitId: 30, initialCooldownTicks: 1 },
      ],
    });
    advanceFormationOneTick(harness.world, harness.identity, harness.formation, {
      loadoutStore: harness.loadout,
    });

    const result = runPipeline(harness);

    expect(result.opportunities.map((record) => record.targetUnitId)).toEqual([
      20,
      40,
    ]);
    expect(result.strikes.map((record) => record.targetUnitId)).toEqual([
      20,
      40,
    ]);
    expect(result.applications.map((record) => record.targetUnitId)).toEqual([
      20,
      40,
    ]);
    for (let index = 0; index < result.opportunities.length; index += 1) {
      expect(result.strikes[index]?.targetUnitId).toBe(
        result.opportunities[index]?.targetUnitId,
      );
      expect(result.applications[index]?.targetUnitId).toBe(
        result.strikes[index]?.targetUnitId,
      );
    }
  });

  it("changes survivability only after an application", () => {
    const harness = createEngagedPipelineHarness({
      tempoUnits: [{ unitId: 10, initialCooldownTicks: 2 }],
    });

    expect(getUnitAccumulatedDamage(harness.survivability, 20)).toBe(0);
    expect(runPipeline(harness).applications).toEqual([]);
    expect(getUnitAccumulatedDamage(harness.survivability, 20)).toBe(0);

    const second = runPipeline(harness);

    expect(second.applications).toHaveLength(1);
    expect(getUnitAccumulatedDamage(harness.survivability, 20)).toBe(1);
  });

  it("changes tempo cooldowns according to existing combat tempo rules", () => {
    const harness = createEngagedPipelineHarness();
    const cooldowns: number[] = [];
    const applicationCounts: number[] = [];

    for (let tick = 0; tick < 12; tick += 1) {
      const result = runPipeline(harness);
      cooldowns.push(getUnitAttackCooldownTicks(harness.tempo, 10));
      applicationCounts.push(result.applications.length);
    }

    expect(cooldowns).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 10, 9, 8]);
    expect(applicationCounts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
  });

  it("preserves armour and shield mitigation through the pipeline", () => {
    const harness = createEngagedPipelineHarness({
      targetArmourClass: "medium",
      targetShieldClass: "shield",
      tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = runPipeline(harness);

    expect(result.strikes[0]).toMatchObject({
      targetArmourClass: "medium",
      targetShieldClass: "shield",
      damageValue: 1,
    });
    expect(result.applications[0]).toMatchObject({
      incomingDamageValue: 1,
      armourReduction: 1,
      shieldReduction: 1,
      appliedDamageValue: 0,
      accumulatedDamageBefore: 0,
      accumulatedDamageAfter: 0,
    });
    expect(getUnitAccumulatedDamage(harness.survivability, 20)).toBe(0);
  });

  it("surfaces capacityReached without death, removal, wounds, routing, or healing", () => {
    const harness = createEngagedPipelineHarness({
      survivabilityUnits: [{ unitId: 20, maxDamageCapacity: 1 }],
      tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = runPipeline(harness);
    const keys = collectResultKeys(result);

    expect(result.applications[0]?.capacityReached).toBe(true);
    expect(harness.world.entityCount).toBe(2);
    expect(Array.from(harness.world.ids)).toEqual([0, 1]);
    expect(getUnitMembers(harness.identity, 20)).toEqual([1]);
    expect(keys).not.toContain("dead");
    expect(keys).not.toContain("death");
    expect(keys).not.toContain("removed");
    expect(keys).not.toContain("wound");
    expect(keys).not.toContain("wounds");
    expect(keys).not.toContain("routing");
    expect(keys).not.toContain("routed");
    expect(keys).not.toContain("healing");
  });

  it("clears and reuses caller-provided output arrays", () => {
    const harness = createEngagedPipelineHarness({
      tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
    });
    const out = createStaleOutput();

    const result = advanceCombatPipelineOneTick(
      harness.world,
      harness.identity,
      harness.loadout,
      harness.formation,
      harness.tempo,
      harness.survivability,
      out,
    );

    expect(result).toBe(out);
    expect(result.opportunities).toBe(out.opportunities);
    expect(result.strikes).toBe(out.strikes);
    expect(result.applications).toBe(out.applications);
    expect(out.opportunities).toHaveLength(1);
    expect(out.strikes).toHaveLength(1);
    expect(out.applications).toHaveLength(1);
    expect(out.opportunities[0]?.sourceUnitId).toBe(10);
    expect(out.strikes[0]?.sourceUnitId).toBe(10);
    expect(out.applications[0]?.sourceUnitId).toBe(10);
  });

  it("clears stale output records when no pipeline records are produced", () => {
    const { world, identity, loadout, formation, tempo, survivability } =
      createPipelineHarness({
        positions: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        units: [
          {
            unitId: 10,
            factionId: 1,
            memberEntityIds: [0],
            reach: "short",
          },
          { unitId: 20, factionId: 2, memberEntityIds: [1] },
        ],
        tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
      });
    const out = createStaleOutput();

    advanceCombatPipelineOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
      survivability,
      out,
    );

    expect(out.opportunities).toEqual([]);
    expect(out.strikes).toEqual([]);
    expect(out.applications).toEqual([]);
  });

  it("does not mutate caller-owned record arrays when fresh output is used", () => {
    const harness = createEngagedPipelineHarness({
      tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
    });
    const externalOpportunities = [createExternalOpportunity()];
    const externalStrikes = [createExternalStrike()];
    const externalApplications = [createExternalApplication()];
    const before = {
      opportunities: externalOpportunities.map((record) => ({ ...record })),
      strikes: externalStrikes.map((record) => ({ ...record })),
      applications: externalApplications.map((record) => ({ ...record })),
    };

    runPipeline(harness);

    expect(externalOpportunities).toEqual(before.opportunities);
    expect(externalStrikes).toEqual(before.strikes);
    expect(externalApplications).toEqual(before.applications);
  });

  it("repeats identical pipeline results and store states", () => {
    const run = () => {
      const harness = createEngagedPipelineHarness({
        tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
      });
      const result = runPipeline(harness);
      return {
        result,
        tempo: snapshotTempo(harness.tempo, harness.identity),
        survivability: snapshotSurvivability(
          harness.survivability,
          harness.identity,
        ),
      };
    };

    expect(run()).toEqual(run());
  });

  it("does not mutate world, identity, loadout, or formation state", () => {
    const harness = createEngagedPipelineHarness({
      tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
    });
    const before = snapshotInputs(
      harness.world,
      harness.identity,
      harness.loadout,
      harness.formation,
    );

    runPipeline(harness);

    expect(
      snapshotInputs(
        harness.world,
        harness.identity,
        harness.loadout,
        harness.formation,
      ),
    ).toEqual(before);
  });

  it("throws for mismatched world, loadout, formation, tempo, or survivability counts", () => {
    const harness = createEngagedPipelineHarness();
    const mismatchedWorld: WorldState = { ...harness.world, entityCount: 3 };
    const mismatchedLoadoutEntityCount: UnitLoadoutStore = {
      ...harness.loadout,
      entityCount: 3,
    };
    const mismatchedLoadoutUnitCount: UnitLoadoutStore = {
      ...harness.loadout,
      unitCount: 3,
    };
    const mismatchedFormationEntityCount: FormationBehaviourStore = {
      ...harness.formation,
      entityCount: 3,
    };
    const mismatchedFormationUnitCount: FormationBehaviourStore = {
      ...harness.formation,
      unitCount: 3,
    };
    const mismatchedTempoEntityCount: CombatTempoStore = {
      ...harness.tempo,
      entityCount: 3,
    };
    const mismatchedTempoUnitCount: CombatTempoStore = {
      ...harness.tempo,
      unitCount: 3,
    };
    const mismatchedSurvivabilityEntityCount: CombatSurvivabilityStore = {
      ...harness.survivability,
      entityCount: 3,
    };
    const mismatchedSurvivabilityUnitCount: CombatSurvivabilityStore = {
      ...harness.survivability,
      unitCount: 3,
    };

    expect(() =>
      advanceCombatPipelineOneTick(
        mismatchedWorld,
        harness.identity,
        harness.loadout,
        harness.formation,
        harness.tempo,
        harness.survivability,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatPipelineOneTick(
        harness.world,
        harness.identity,
        mismatchedLoadoutEntityCount,
        harness.formation,
        harness.tempo,
        harness.survivability,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatPipelineOneTick(
        harness.world,
        harness.identity,
        mismatchedLoadoutUnitCount,
        harness.formation,
        harness.tempo,
        harness.survivability,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatPipelineOneTick(
        harness.world,
        harness.identity,
        harness.loadout,
        mismatchedFormationEntityCount,
        harness.tempo,
        harness.survivability,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatPipelineOneTick(
        harness.world,
        harness.identity,
        harness.loadout,
        mismatchedFormationUnitCount,
        harness.tempo,
        harness.survivability,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatPipelineOneTick(
        harness.world,
        harness.identity,
        harness.loadout,
        harness.formation,
        mismatchedTempoEntityCount,
        harness.survivability,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatPipelineOneTick(
        harness.world,
        harness.identity,
        harness.loadout,
        harness.formation,
        mismatchedTempoUnitCount,
        harness.survivability,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatPipelineOneTick(
        harness.world,
        harness.identity,
        harness.loadout,
        harness.formation,
        harness.tempo,
        mismatchedSurvivabilityEntityCount,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatPipelineOneTick(
        harness.world,
        harness.identity,
        harness.loadout,
        harness.formation,
        harness.tempo,
        mismatchedSurvivabilityUnitCount,
      ),
    ).toThrow(RangeError);
  });

  it("does not add out-of-scope consequence fields to pipeline results", () => {
    const harness = createEngagedPipelineHarness({
      tempoUnits: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = runPipeline(harness);
    const keys = collectResultKeys(result);

    expect(keys).not.toContain("death");
    expect(keys).not.toContain("dead");
    expect(keys).not.toContain("healing");
    expect(keys).not.toContain("morale");
    expect(keys).not.toContain("routing");
    expect(keys).not.toContain("routed");
    expect(keys).not.toContain("specialCallResolution");
    expect(keys).not.toContain("displacement");
    expect(keys).not.toContain("hitLocation");
    expect(keys).not.toContain("entityRemoval");
    expect(keys).not.toContain("removedEntityId");
  });
});

interface PipelineHarnessUnit {
  readonly unitId: number;
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
  readonly headingX?: number;
  readonly headingY?: number;
  readonly order?: UnitOrder;
  readonly reach?: WeaponReachBand;
  readonly armourClass?: ArmourClass;
  readonly shieldClass?: ShieldClass;
}

interface PipelineHarnessConfig {
  readonly positions: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly units: readonly PipelineHarnessUnit[];
  readonly tempoUnits?: readonly {
    readonly unitId: number;
    readonly attackIntervalTicks?: number;
    readonly initialCooldownTicks?: number;
  }[];
  readonly survivabilityUnits?: readonly {
    readonly unitId: number;
    readonly maxDamageCapacity?: number;
    readonly initialAccumulatedDamage?: number;
  }[];
}

interface EngagedHarnessOptions {
  readonly targetArmourClass?: ArmourClass;
  readonly targetShieldClass?: ShieldClass;
  readonly tempoUnits?: PipelineHarnessConfig["tempoUnits"];
  readonly survivabilityUnits?: PipelineHarnessConfig["survivabilityUnits"];
}

interface PipelineHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
  readonly tempo: CombatTempoStore;
  readonly survivability: CombatSurvivabilityStore;
}

function createEngagedPipelineHarness(
  options: EngagedHarnessOptions = {},
): PipelineHarness {
  const harness = createPipelineHarness({
    positions: [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ],
    units: [
      {
        unitId: 10,
        factionId: 1,
        memberEntityIds: [0],
        order: "advance",
        reach: "long",
      },
      {
        unitId: 20,
        factionId: 2,
        memberEntityIds: [1],
        ...(options.targetArmourClass !== undefined
          ? { armourClass: options.targetArmourClass }
          : {}),
        ...(options.targetShieldClass !== undefined
          ? { shieldClass: options.targetShieldClass }
          : {}),
      },
    ],
    ...(options.tempoUnits !== undefined
      ? { tempoUnits: options.tempoUnits }
      : {}),
    ...(options.survivabilityUnits !== undefined
      ? { survivabilityUnits: options.survivabilityUnits }
      : {}),
  });

  advanceFormationOneTick(harness.world, harness.identity, harness.formation, {
    loadoutStore: harness.loadout,
  });
  expect(getUnitMovementStyle(harness.formation, 10)).toBe("engageFront");

  return harness;
}

function createPipelineHarness(config: PipelineHarnessConfig): PipelineHarness {
  const entityCount = config.positions.length;
  const world: WorldState = {
    entityCount,
    bounds: { width: 1_000, height: 1_000 },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: Int32Array.from(config.positions.map((position) => position.x)),
    positionsY: Int32Array.from(config.positions.map((position) => position.y)),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const identity = createUnitIdentityStore({
    entityCount,
    units: config.units.map((unit) => ({
      unitId: unit.unitId,
      factionId: unit.factionId,
      memberEntityIds: unit.memberEntityIds,
    })),
  });
  const loadout = createUnitLoadoutStore(identity, {
    entityCount,
    units: config.units.map((unit) => ({
      unitId: unit.unitId,
      ...(unit.reach !== undefined ? { weaponReachBand: unit.reach } : {}),
      ...(unit.armourClass !== undefined
        ? { armourClass: unit.armourClass }
        : {}),
      ...(unit.shieldClass !== undefined
        ? { shieldClass: unit.shieldClass }
        : {}),
    })),
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x4001,
    units: config.units.map((unit) => {
      const anchor = config.positions[unit.memberEntityIds[0]!]!;
      return {
        unitId: unit.unitId,
        anchorX: anchor.x,
        anchorY: anchor.y,
        headingX: unit.headingX ?? 1,
        headingY: unit.headingY ?? 0,
        spacing: 10,
        rows: 1,
        cols: unit.memberEntityIds.length,
        unitSpeed: 0,
        order: unit.order ?? "hold",
      };
    }),
    individuals: config.units.flatMap((unit) =>
      unit.memberEntityIds.map((entityId, slotCol) => ({
        entityId,
        role: "regular" as const,
        slotRow: 0,
        slotCol,
        memberMaxStep: 0,
      })),
    ),
  });
  const tempo = createCombatTempoStore(identity, {
    entityCount,
    units: config.tempoUnits ?? [],
  });
  const survivability = createCombatSurvivabilityStore(identity, {
    entityCount,
    units: config.survivabilityUnits ?? [],
  });

  return { world, identity, loadout, formation, tempo, survivability };
}

function runPipeline(harness: PipelineHarness) {
  const result = advanceCombatPipelineOneTick(
    harness.world,
    harness.identity,
    harness.loadout,
    harness.formation,
    harness.tempo,
    harness.survivability,
  );

  return {
    opportunities: result.opportunities.map((record) => ({ ...record })),
    strikes: result.strikes.map((record) => ({ ...record })),
    applications: result.applications.map((record) => ({ ...record })),
  };
}

function createStaleOutput(): CombatPipelineOutput {
  const out = createCombatPipelineOutput();
  out.opportunities.push(createExternalOpportunity());
  out.strikes.push(createExternalStrike());
  out.applications.push(createExternalApplication());
  return out;
}

function createExternalOpportunity(): CombatAttackOpportunity {
  return {
    sourceUnitId: 99,
    targetUnitId: 100,
    sourceMovementStyle: "engageFront",
    engagementState: "engaged",
    weaponReachBand: "short",
  };
}

function createExternalStrike(): CombatStrikeResolution {
  return {
    sourceUnitId: 99,
    targetUnitId: 100,
    sourceMovementStyle: "engageFront",
    engagementState: "engaged",
    weaponReachBand: "short",
    consequenceKind: "damage",
    damageValue: 99,
  };
}

function createExternalApplication(): CombatSurvivabilityApplication {
  return {
    sourceUnitId: 99,
    targetUnitId: 100,
    incomingDamageValue: 99,
    armourReduction: 0,
    shieldReduction: 0,
    appliedDamageValue: 99,
    accumulatedDamageBefore: 0,
    accumulatedDamageAfter: 99,
    capacityReached: true,
  };
}

function collectResultKeys(result: {
  readonly opportunities: readonly unknown[];
  readonly strikes: readonly unknown[];
  readonly applications: readonly unknown[];
}): string[] {
  const keys: string[] = [];
  for (const record of [
    ...result.opportunities,
    ...result.strikes,
    ...result.applications,
  ]) {
    keys.push(...Object.keys(record as Record<string, unknown>));
  }
  return keys;
}

function snapshotTempo(
  tempo: CombatTempoStore,
  identity: UnitIdentityStore,
): readonly unknown[] {
  return getUnitIds(identity).map((unitId) => ({
    unitId,
    attackCooldownTicks: getUnitAttackCooldownTicks(tempo, unitId),
  }));
}

function snapshotSurvivability(
  survivability: CombatSurvivabilityStore,
  identity: UnitIdentityStore,
): readonly unknown[] {
  return getUnitIds(identity).map((unitId) => ({
    unitId,
    accumulatedDamage: getUnitAccumulatedDamage(survivability, unitId),
    maxDamageCapacity: getUnitMaxDamageCapacity(survivability, unitId),
    capacityReached: isUnitDamageCapacityReached(survivability, unitId),
  }));
}

function snapshotInputs(
  world: WorldState,
  identity: UnitIdentityStore,
  loadout: UnitLoadoutStore,
  formation: FormationBehaviourStore,
): readonly unknown[] {
  const unitIds = getUnitIds(identity);
  return [
    {
      entityCount: world.entityCount,
      ids: Array.from(world.ids),
      positionsX: Array.from(world.positionsX),
      positionsY: Array.from(world.positionsY),
      velocitiesX: Array.from(world.velocitiesX),
      velocitiesY: Array.from(world.velocitiesY),
    },
    unitIds.map((unitId) => ({
      unitId,
      factionId: getFactionIdForUnit(identity, unitId),
      members: Array.from(getUnitMembers(identity, unitId)),
    })),
    unitIds.map((unitId) => getUnitLoadoutSummary(loadout, unitId)),
    unitIds.map((unitId) => ({
      unitId,
      anchor: getUnitAnchor(formation, unitId),
      heading: getUnitHeading(formation, unitId),
      style: getUnitMovementStyle(formation, unitId),
    })),
  ];
}
