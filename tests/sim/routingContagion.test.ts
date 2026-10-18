import { describe, expect, it } from "vitest";

import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  collectResolvedRoutingPassThroughInteractions,
  getIndividualPressure,
  getUnitCohesion,
  type FormationBehaviourConfig,
} from "../../src/sim/formationBehaviour";
import { createIndividualOrdinaryParticipationSnapshot, setIndividualOrdinaryParticipationEligible } from "../../src/sim/individualOrdinaryParticipation";
import { createIndividualCasualtyLifecycleStore, createIndividualPlayerPresenceStore, applyIndividualZeroHitLifecycleTransitions } from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
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

  it("treats stationary routing overlap as nearby pressure only", () => {
    const harness = createHarness([router(1, 0, 100, 100), ally(2, 1, 106, 100)]);

    const summaries = advance(harness, [1]);

    expect(summaryFor(summaries, 2)).toMatchObject({
      nearbyRouterUnitIds: [1],
      passThroughRouterUnitIds: [],
      pressureAppliedPerMember: 5,
      cohesionLossApplied: 0,
    });
    expect(getUnitCohesion(harness.formation, 2)).toBe(1_000);
  });

  it("uses an actual routing movement segment for pass-through, then does not repeat it without a new movement interaction", () => {
    const harness = createRoutingMovementHarness();
    const routingStates = new Map<UnitId, MoraleMovementState>([[1, "routing"]]);

    const firstMovement = advanceFormationOneTick(
      harness.world,
      harness.identity,
      harness.formation,
      routingStates,
    );
    const firstSummaries = advance(
      harness,
      [1],
      firstMovement.routingPassThroughInteractions,
    );

    expect(firstMovement.routingPassThroughInteractions).toEqual([
      { routerUnitId: 1, targetUnitId: 2 },
    ]);
    expect(summaryFor(firstSummaries, 2)).toMatchObject({
      passThroughRouterUnitIds: [1],
      pressureAppliedPerMember: 17,
      cohesionLossApplied: 7,
    });

    const stoppedSummaries = advance(
      harness,
      [1],
      [],
    );

    expect(summaryFor(stoppedSummaries, 2)).toMatchObject({
      nearbyRouterUnitIds: [1],
      passThroughRouterUnitIds: [],
      pressureAppliedPerMember: 5,
      cohesionLossApplied: 0,
    });
    expect(getUnitCohesion(harness.formation, 2)).toBe(993);
  });

  it("deduplicates a router-target pair even with multiple nearby members", () => {
    const harness = createHarness([
      router(1, 0, 100, 100, [0, 1]),
      ally(2, 2, 106, 100),
    ]);

    const summaries = advance(harness, [1], [
      { routerUnitId: 1, targetUnitId: 2 },
      { routerUnitId: 1, targetUnitId: 2 },
    ]);

    expect(summaryFor(summaries, 2).passThroughRouterUnitIds).toEqual([1]);
    expect(summaryFor(summaries, 2).pressureAppliedPerMember).toBe(17);
  });

  it("caps multiple routing contributions per target per tick", () => {
    const definitions = [ally(10, 0, 100, 100)];
    for (let index = 1; index <= 7; index += 1) {
      definitions.push(router(index, index, 106, 100));
    }
    const harness = createHarness(definitions);

    const summaries = advance(
      harness,
      [1, 2, 3, 4, 5, 6, 7],
      [1, 2, 3, 4, 5, 6, 7].map((routerUnitId) => ({
        routerUnitId,
        targetUnitId: 10,
      })),
    );
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

  it("does not cascade through a newly routed unit until the following tick", () => {
    const harness = createHarness([
      router(1, 0, 100, 100),
      ally(2, 1, 150, 100),
      ally(3, 2, 200, 100),
    ]);

    const tickOneStates = new Map<UnitId, MoraleMovementState>([[1, "routing"]]);
    const tickOneMovement = advanceFormationOneTick(
      harness.world,
      harness.identity,
      harness.formation,
      tickOneStates,
    );
    const tickOneSummaries = advance(
      harness,
      [1],
      tickOneMovement.routingPassThroughInteractions,
    );

    expect(summaryFor(tickOneSummaries, 2).nearbyRouterUnitIds).toEqual([1]);
    expect(summaryFor(tickOneSummaries, 3).nearbyRouterUnitIds).toEqual([]);
    expect(getIndividualPressure(harness.formation, 2)).toBe(0);

    // This is the projection produced by the end-of-tick morale transition.
    const tickTwoStates = new Map<UnitId, MoraleMovementState>([
      [1, "routing"],
      [2, "routing"],
    ]);
    const tickTwoMovement = advanceFormationOneTick(
      harness.world,
      harness.identity,
      harness.formation,
      tickTwoStates,
    );
    const tickTwoSummaries = advance(
      harness,
      [1, 2],
      tickTwoMovement.routingPassThroughInteractions,
    );

    expect(summaryFor(tickTwoSummaries, 3).nearbyRouterUnitIds).toEqual([2]);
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

function createRoutingMovementHarness() {
  const world: WorldState = {
    entityCount: 2,
    bounds: { width: 116, height: 200 },
    ids: Uint32Array.from([0, 1]),
    positionsX: Int32Array.from([100, 110]),
    positionsY: Int32Array.from([100, 100]),
    velocitiesX: new Int32Array(2),
    velocitiesY: new Int32Array(2),
  };
  const identity = createUnitIdentityStore({
    entityCount: 2,
    units: [
      { unitId: 1, factionId: 1, memberEntityIds: [0] },
      { unitId: 2, factionId: 1, memberEntityIds: [1] },
    ],
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount: 2,
    rngSeed: 0x46_43,
    units: [
      {
        unitId: 1,
        anchorX: 100,
        anchorY: 100,
        headingX: -1,
        headingY: 0,
        spacing: 10,
        rows: 1,
        cols: 1,
        unitSpeed: 15,
        order: "advance",
      },
      {
        unitId: 2,
        anchorX: 110,
        anchorY: 100,
        headingX: 1,
        headingY: 0,
        spacing: 10,
        rows: 1,
        cols: 1,
        unitSpeed: 0,
        order: "hold",
      },
    ],
    individuals: [
      {
        entityId: 0,
        role: "regular",
        slotRow: 0,
        slotCol: 0,
        memberMaxStep: 15,
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
    store: createRoutingContagionStore(identity),
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
  routingPassThroughInteractions: ReadonlyArray<{
    readonly routerUnitId: UnitId;
    readonly targetUnitId: UnitId;
  }> = [],
) {
  const states = new Map<UnitId, MoraleMovementState>();
  for (const unitId of routingUnitIds) states.set(unitId, "routing");
  return advanceRoutingContagionOneTick(
    harness.world,
    harness.identity,
    harness.formation,
    states,
    routingPassThroughInteractions,
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

describe("collision-resolved routing pass-through evidence", () => {
  const routing = new Map<UnitId, MoraleMovementState>([[1, "routing"]]);
  const snapshot = (h: ReturnType<typeof createHarness>, states = routing) =>
    advanceFormationOneTick(h.world, h.identity, h.formation, states,
      undefined, undefined, undefined, undefined, undefined, true);
  const collect = (h: ReturnType<typeof createHarness>, states = routing) =>
    collectResolvedRoutingPassThroughInteractions(h.world, h.identity, h.formation, states);

  it.each([false, true])("uses each redirected segment and tick-start target geometry (into=%s)", (into) => {
    const h = createHarness([router(1, 0, 100, 100),
      ally(2, 1, into ? 100 : 115, into ? 115 : 100)]);
    expect(snapshot(h).routingPassThroughInteractions).toEqual([]);
    // Proposed horizontal segment qualifies only in the away case.
    h.world.positionsX[0] = 108;
    expect(collect(h)).toEqual(into ? [] : [{ routerUnitId: 1, targetUnitId: 2 }]);
    // Collision redirects vertically. Target movement must not replace its snapshot.
    h.world.positionsX[0] = 100; h.world.positionsY[0] = 108;
    h.world.positionsX[1] = into ? 400 : 100;
    h.world.positionsY[1] = into ? 400 : 102;
    expect(collect(h)).toEqual(into ? [{ routerUnitId: 1, targetUnitId: 2 }] : []);
  });

  it("does not retain a pair merely because a distant member of the router unit moved", () => {
    const h = createHarness([router(1, 0, 100, 100, [0, 1]), ally(2, 2, 110, 100)]);
    h.world.positionsX[1] = 300;
    snapshot(h);
    h.world.positionsX[1] = 301;
    expect(collect(h)).toEqual([]);
  });

  it("requires actual movement even for stationary overlap and preserves nearby contagion", () => {
    const h = createHarness([router(1, 0, 100, 100), ally(2, 1, 106, 100)]);
    snapshot(h);
    const interactions = collect(h);
    expect(interactions).toEqual([]);
    expect(summaryFor(advance(h, [1], interactions), 2)).toMatchObject({
      nearbyRouterUnitIds: [1], passThroughRouterUnitIds: [], cohesionLossApplied: 0,
    });
  });

  it.each(["routerParticipation", "targetParticipation", "routerLifecycle", "targetLifecycle", "notRouting"] as const)("excludes %s", (exclusion) => {
    const h = createHarness([router(1, 0, 100, 100), ally(2, 1, 110, 100)]);
    const life = createIndividualCasualtyLifecycleStore(2);
    const presence = createIndividualPlayerPresenceStore(2);
    const ordinary = createIndividualOrdinaryParticipationSnapshot(2);
    const entityId = exclusion.startsWith("router") ? 0 : 1;
    if (exclusion.endsWith("Participation")) setIndividualOrdinaryParticipationEligible(ordinary, entityId, false);
    if (exclusion.endsWith("Lifecycle")) {
      const procedures = createIndividualCasualtyProcedureProfileStore({ entityCount: 2,
        profiles: [0, 1].map(entityId => ({ entityId, procedureKind: "citizen" as const,
          deathCountPolicy: { kind: "normalFortitude" as const } })) });
      applyIndividualZeroHitLifecycleTransitions(life, presence, procedures, h.world,
        [{ entityId, attackerEntityId: 1 - entityId, previousHits: 1 }], 0);
    }
    const states = exclusion === "notRouting" ? new Map<UnitId, MoraleMovementState>() : routing;
    advanceFormationOneTick(h.world, h.identity, h.formation, states, undefined, life, ordinary, undefined, undefined, true);
    h.world.positionsX[0] = 102;
    expect(collectResolvedRoutingPassThroughInteractions(h.world, h.identity, h.formation, states, life, ordinary)).toEqual([]);
  });

  it("deduplicates genuine resolved passes and replays with reversed unit definitions", () => {
    const run = (reverse: boolean) => {
      const definitions = [router(1, 0, 100, 100, [0, 1]), ally(2, 2, 110, 100, [2, 3])];
      const h = createHarness(reverse ? definitions.slice().reverse() : definitions);
      const trace = [];
      for (let tick = 0; tick < 4; tick += 1) {
        snapshot(h);
        h.world.positionsX[0] = h.world.positionsX[0]! + 1;
        h.world.positionsX[1] = h.world.positionsX[1]! + 1;
        const pairs = collect(h);
        expect(pairs).toEqual([{ routerUnitId: 1, targetUnitId: 2 }]);
        trace.push({ pairs, summaries: advance(h, [1], pairs) });
      }
      return trace;
    };
    expect(run(false)).toEqual(run(false));
    expect(run(true)).toEqual(run(false));
  });

  it("bounds resolved collection to local queries with reusable formation storage at 2,000 entities", () => {
    const definitions = Array.from({ length: 2_000 }, (_, id) =>
      ally(id + 1, id, 5 + (id % 50) * 10, 5 + Math.floor(id / 50) * 10));
    const h = createHarness(definitions);
    const states = new Map<UnitId, MoraleMovementState>(definitions.filter((_, id) => id % 2 === 0).map(d => [d.unitId, "routing"]));
    const diagnostics = { queryCount: 0, candidateCount: 0, maximumQueryRadius: 0 };
    const internal = h.formation as unknown as { contactSnapshotPositionsX: Int32Array; contactSnapshotPositionsY: Int32Array;
      routingPassThroughRouterUnitIds: Int32Array; routingPassThroughTargetUnitIds: Int32Array; scratchNearbyEntityIds: number[] };
    const retained = [internal.contactSnapshotPositionsX, internal.contactSnapshotPositionsY,
      internal.routingPassThroughRouterUnitIds, internal.routingPassThroughTargetUnitIds, internal.scratchNearbyEntityIds];
    for (let tick = 0; tick < 2; tick += 1) {
      snapshot(h, states);
      for (let id = 0; id < 2_000; id += 2) h.world.positionsX[id] = h.world.positionsX[id]! + 1;
      const pairs = collectResolvedRoutingPassThroughInteractions(h.world, h.identity, h.formation, states, undefined, undefined, diagnostics);
      expect(pairs.length).toBeLessThanOrEqual(256);
    }
    expect(diagnostics.queryCount).toBe(2_000);
    expect(diagnostics.maximumQueryRadius).toBe(13);
    expect(diagnostics.candidateCount).toBeLessThan(12_000);
    for (let index = 0; index < retained.length; index += 1) {
      expect([internal.contactSnapshotPositionsX, internal.contactSnapshotPositionsY,
        internal.routingPassThroughRouterUnitIds, internal.routingPassThroughTargetUnitIds, internal.scratchNearbyEntityIds][index]).toBe(retained[index]);
    }
  });
});
