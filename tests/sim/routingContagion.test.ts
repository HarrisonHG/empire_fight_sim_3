import { describe, expect, it } from "vitest";

import {
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitCohesion,
  type FormationBehaviourConfig,
} from "../../src/sim/formationBehaviour";
import type { MoraleMovementState } from "../../src/sim/moraleMovement";
import {
  ROUTING_CONTAGION_CONSTANTS,
  advanceRoutingContagionOneTick,
  createRoutingContagionStore,
} from "../../src/sim/routingContagion";
import {
  createUnitIdentityStore,
  type UnitId,
  type UnitIdentityConfig,
} from "../../src/sim/unitIdentity";
import type { WorldState } from "../../src/sim/types";

describe("local routing contagion", () => {
  it("applies small pressure from one nearby routing ally", () => {
    const harness = createHarness([router(1, 0, 100, 100), ally(2, 1, 150, 100)]);

    const summaries = advance(harness, [1]);

    expect(summaryFor(summaries, 2)).toMatchObject({
      nearbyRouterUnitIds: [1],
      passThroughRouterUnitIds: [],
      pressureAppliedPerMember: 5,
      cohesionLossApplied: 0,
    });
    expect(getIndividualPressure(harness.formation, 1)).toBe(5);
  });

  it("does not affect allies outside the bounded local radius", () => {
    const harness = createHarness([router(1, 0, 100, 100), ally(2, 1, 250, 100)]);

    const summaries = advance(harness, [1]);

    expect(summaryFor(summaries, 2)).toMatchObject({
      nearbyRouterUnitIds: [],
      passThroughRouterUnitIds: [],
      pressureAppliedPerMember: 0,
      cohesionLossApplied: 0,
    });
  });

  it("uses stronger pass-through pressure and cohesion loss instead of nearby pressure", () => {
    const harness = createHarness([router(1, 0, 100, 100), ally(2, 1, 106, 100)]);

    const summaries = advance(harness, [1]);

    expect(summaryFor(summaries, 2)).toMatchObject({
      nearbyRouterUnitIds: [],
      passThroughRouterUnitIds: [1],
      pressureAppliedPerMember: 17,
      cohesionLossApplied: 7,
    });
    expect(getUnitCohesion(harness.formation, 2)).toBe(993);
  });

  it("deduplicates a router-target pair even with multiple nearby members", () => {
    const harness = createHarness([
      router(1, 0, 100, 100, [0, 1]),
      ally(2, 2, 106, 100),
    ]);

    const summaries = advance(harness, [1]);

    expect(summaryFor(summaries, 2).passThroughRouterUnitIds).toEqual([1]);
    expect(summaryFor(summaries, 2).pressureAppliedPerMember).toBe(17);
  });

  it("caps multiple routing contributions per target per tick", () => {
    const definitions = [ally(10, 0, 100, 100)];
    for (let index = 1; index <= 7; index += 1) {
      definitions.push(router(index, index, 106, 100));
    }
    const harness = createHarness(definitions);

    const summaries = advance(harness, [1, 2, 3, 4, 5, 6, 7]);
    const target = summaryFor(summaries, 10);

    expect(target.passThroughRouterUnitIds).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(target.pressureAppliedPerMember).toBe(
      ROUTING_CONTAGION_CONSTANTS.pressureCapPerMember,
    );
    expect(target.pressureCapReached).toBe(true);
    expect(target.cohesionLossApplied).toBe(
      ROUTING_CONTAGION_CONSTANTS.cohesionLossCap,
    );
    expect(target.cohesionLossCapReached).toBe(true);
  });

  it("applies bounded confidence and cohesion resistance without removing contagion", () => {
    const harness = createHarness([
      router(1, 0, 100, 100),
      ally(2, 1, 150, 100, [1], 100, 500),
      ally(3, 2, 150, 140, [2], 900, 1_000),
    ]);

    const summaries = advance(harness, [1]);

    expect(summaryFor(summaries, 2).pressureAppliedPerMember).toBe(6);
    expect(summaryFor(summaries, 3).pressureAppliedPerMember).toBe(3);
    expect(summaryFor(summaries, 3).pressureAppliedPerMember).toBeGreaterThan(0);
  });

  it("does not recursively treat a newly affected ally as a router this tick", () => {
    const harness = createHarness([
      router(1, 0, 100, 100),
      ally(2, 1, 150, 100),
      ally(3, 2, 200, 100),
    ]);

    const summaries = advance(harness, [1]);

    expect(summaryFor(summaries, 2).nearbyRouterUnitIds).toEqual([1]);
    expect(summaryFor(summaries, 3).nearbyRouterUnitIds).toEqual([]);
    expect(getIndividualPressure(harness.formation, 2)).toBe(0);
  });

  it("is independent of unit-definition processing order", () => {
    const definitions = [
      router(1, 0, 100, 100),
      router(2, 1, 150, 100),
      ally(3, 2, 125, 150),
    ];
    const first = createHarness(definitions);
    const second = createHarness(definitions.slice().reverse());

    expect(advance(first, [1, 2])).toEqual(advance(second, [1, 2]));
  });

  it("replays deterministically without altering entity membership", () => {
    const run = () => {
      const harness = createHarness([
        router(1, 0, 100, 100, [0, 1]),
        router(2, 2, 150, 100),
        ally(3, 3, 125, 150),
      ]);
      let summaries = [] as ReturnType<typeof advance>;
      for (let tick = 0; tick < 20; tick += 1) {
        summaries = advance(harness, [1, 2]);
      }
      return {
        summaries,
        pressures: Array.from(
          { length: harness.world.entityCount },
          (_, entityId) => getIndividualPressure(harness.formation, entityId),
        ),
        cohesion: getUnitCohesion(harness.formation, 3),
        entityCount: harness.world.entityCount,
        ids: Array.from(harness.world.ids),
      };
    };

    const replay = run();
    expect(replay).toEqual(run());
    expect(replay.entityCount).toBe(4);
    expect(replay.ids).toEqual([0, 1, 2, 3]);
  });
});

interface UnitDefinition {
  readonly unitId: UnitId;
  readonly factionId: number;
  readonly entityId: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly memberEntityIds: readonly number[];
  readonly confidence: number;
  readonly cohesion: number;
}

function router(
  unitId: UnitId,
  entityId: number,
  anchorX: number,
  anchorY: number,
  memberEntityIds: readonly number[] = [entityId],
): UnitDefinition {
  return {
    unitId,
    factionId: 1,
    entityId,
    anchorX,
    anchorY,
    memberEntityIds,
    confidence: 500,
    cohesion: 1_000,
  };
}

function ally(
  unitId: UnitId,
  entityId: number,
  anchorX: number,
  anchorY: number,
  memberEntityIds: readonly number[] = [entityId],
  confidence = 500,
  cohesion = 1_000,
): UnitDefinition {
  return {
    unitId,
    factionId: 1,
    entityId,
    anchorX,
    anchorY,
    memberEntityIds,
    confidence,
    cohesion,
  };
}

function createHarness(definitions: readonly UnitDefinition[]) {
  const entityCount = definitions.reduce(
    (maximum, definition) =>
      Math.max(maximum, ...definition.memberEntityIds),
    -1,
  ) + 1;
  const world: WorldState = {
    entityCount,
    bounds: { width: 500, height: 500 },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: new Int32Array(entityCount),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  for (const definition of definitions) {
    for (const entityId of definition.memberEntityIds) {
      world.positionsX[entityId] = definition.anchorX;
      world.positionsY[entityId] = definition.anchorY;
    }
  }
  const identityConfig: UnitIdentityConfig = {
    entityCount,
    units: definitions.map((definition) => ({
      unitId: definition.unitId,
      factionId: definition.factionId,
      memberEntityIds: definition.memberEntityIds,
    })),
  };
  const identity = createUnitIdentityStore(identityConfig);
  const formationConfig: FormationBehaviourConfig = {
    entityCount,
    rngSeed: 0x46_43,
    units: definitions.map((definition) => ({
      unitId: definition.unitId,
      anchorX: definition.anchorX,
      anchorY: definition.anchorY,
      headingX: 1,
      headingY: 0,
      spacing: 10,
      rows: 1,
      cols: 1,
      unitSpeed: 0,
      order: "hold",
      cohesion: definition.cohesion,
    })),
    individuals: definitions.flatMap((definition) =>
      definition.memberEntityIds.map((entityId) => ({
        entityId,
        role: "regular" as const,
        slotRow: 0,
        slotCol: 0,
        memberMaxStep: 0,
        confidence: definition.confidence,
      })),
    ),
  };
  const formation = createFormationBehaviourStore(identity, formationConfig);
  const store = createRoutingContagionStore(identity);
  return { world, identity, formation, store };
}

function advance(
  harness: ReturnType<typeof createHarness>,
  routingUnitIds: readonly UnitId[],
) {
  const states = new Map<UnitId, MoraleMovementState>();
  for (const unitId of routingUnitIds) states.set(unitId, "routing");
  return advanceRoutingContagionOneTick(
    harness.world,
    harness.identity,
    harness.formation,
    states,
    harness.store,
  ).summaries;
}

function summaryFor(
  summaries: ReturnType<typeof advance>,
  unitId: UnitId,
) {
  const summary = summaries.find((candidate) => candidate.unitId === unitId);
  if (summary === undefined) throw new Error(`Missing summary for unit ${unitId}.`);
  return summary;
}
