import { describe, expect, it } from "vitest";

import {
  PERSONAL_SPACE_SPIKE_CHAMBERS,
  PERSONAL_SPACE_SPIKE_RECOMMENDED_END_TICK,
  PERSONAL_SPACE_SPIKE_SCENARIO,
  PERSONAL_SPACE_SPIKE_SCENARIO_ID,
} from "../../src/content/personalSpaceSpikeScenario";
import { findVisualTestEntry } from "../../src/content/visualTestRegistry";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import {
  PERSONAL_SPACE_DETOUR_PHASE,
  PERSONAL_SPACE_OCCUPANCY_CLASS_CODE,
  PERSONAL_SPACE_RESOLUTION_FLAG,
  type PersonalSpaceSpikeDebugSnapshot,
  type SimulationScenario,
  type SimulationState,
} from "../../src/sim/types";

describe("Milestone 8A isolated personal-space feasibility spike", () => {
  it("registers the retained debug-only route with all required chambers", () => {
    const entry = findVisualTestEntry(PERSONAL_SPACE_SPIKE_SCENARIO_ID);
    expect(entry?.scenario).toBe(PERSONAL_SPACE_SPIKE_SCENARIO);
    expect(entry?.showPersonalSpaceVisuals).toBe(true);
    expect(entry?.recommendedTickRange).toEqual({
      start: 0,
      end: PERSONAL_SPACE_SPIKE_RECOMMENDED_END_TICK,
    });
    expect(PERSONAL_SPACE_SPIKE_CHAMBERS.map((chamber) => chamber.label))
      .toEqual([
        "Hostile fronts settle",
        "Allied crossing streams",
        "Open-space overtaking",
        "Downed soft occupancy",
        "Yielding respawn egress",
        "Representative dense crowd",
      ]);
  });

  it("retains typed current-tick collision diagnostics in snapshots", () => {
    const simulation = createSimulation(PERSONAL_SPACE_SPIKE_SCENARIO);
    const initial = createInitialSnapshot(simulation);
    expect(initial.personalSpaceDebug).toMatchObject({
      algorithm: "boundedDiscreteCandidateRelaxation",
      standingRadius: 4,
      downedSoftRadius: 5,
      maximumResolutionPasses: 8,
      resolutionPassCount: 0,
    });
    expect(initial.personalSpaceDebug?.intendedDeltas).toBeInstanceOf(Int32Array);
    expect(initial.personalSpaceDebug?.resolutionFlags).toBeInstanceOf(Uint8Array);
    expect(initial.personalSpaceDebug?.detourPhaseCodes).toBeInstanceOf(Uint8Array);
    expect(initial.personalSpaceDebug?.detourSideByEntity).toBeInstanceOf(Int8Array);
    expect(initial.personalSpaceDebug?.detourTicksRemaining).toBeInstanceOf(Uint16Array);
    expect(initial.personalSpaceDebug?.courtesyBlockerByEntity)
      .toBeInstanceOf(Int32Array);
    expect(initial.personalSpaceDebug?.courtesyTicksRemaining)
      .toBeInstanceOf(Uint8Array);
    expect(initial.personalSpaceDebug?.overtakeLeaderByEntity)
      .toBeInstanceOf(Int32Array);
    expect(initial.personalSpaceDebug?.overtakeSideByEntity)
      .toBeInstanceOf(Int8Array);
    const intendedDeltas = initial.personalSpaceDebug?.intendedDeltas;
    const resolutionFlags = initial.personalSpaceDebug?.resolutionFlags;
    const courtesyBlockers = initial.personalSpaceDebug?.courtesyBlockerByEntity;
    const overtakeLeaders = initial.personalSpaceDebug?.overtakeLeaderByEntity;

    advanceSimulationOneTick(simulation);
    const positioned = createPositionSnapshot(simulation);
    expect(positioned.personalSpaceDebug).toBe(
      simulation.personalSpaceSpike?.store.debugSnapshot,
    );
    expect(positioned.personalSpaceDebug?.resolutionPassCount).toBeGreaterThan(0);
    expect(positioned.personalSpaceDebug?.localQueryCount).toBeGreaterThan(0);
    expect(positioned.personalSpaceDebug?.intendedDeltas).toBe(intendedDeltas);
    expect(positioned.personalSpaceDebug?.resolutionFlags).toBe(resolutionFlags);
    expect(positioned.personalSpaceDebug?.courtesyBlockerByEntity)
      .toBe(courtesyBlockers);
    expect(positioned.personalSpaceDebug?.overtakeLeaderByEntity)
      .toBe(overtakeLeaders);
  });

  it("settles hostile fronts without standing overlap or late vibration", () => {
    const simulation = createSimulation(PERSONAL_SPACE_SPIKE_SCENARIO);
    advance(simulation, 80);
    const settled = chamberPositions(simulation, 1);
    advance(simulation, 40);
    expect(chamberPositions(simulation, 1)).toEqual(settled);
    assertNoIllegalStandingOverlap(simulation);
    expect(Math.max(...settled.x.filter((_, index) => index % 2 === 0)))
      .toBeLessThan(
        Math.min(...settled.x.filter((_, index) => index % 2 === 1)),
    );
  });

  it("keeps a southbound allied crossing stream anchored to its own desire", () => {
    const simulation = createSimulation(PERSONAL_SPACE_SPIKE_SCENARIO);
    const southboundIds = PERSONAL_SPACE_SPIKE_CHAMBERS[1]!.entityIds.filter(
      (entityId) =>
        PERSONAL_SPACE_SPIKE_SCENARIO.personalSpaceSpike!.entities[entityId]!
          .requestedDeltaY > 0,
    );
    const startX = southboundIds.map((id) => simulation.world.positionsX[id]!);
    const startY = southboundIds.map((id) => simulation.world.positionsY[id]!);
    let midpointY: number[] = [];
    let maximumLateralDisplacement = 0;
    let redirectedTicks = 0;
    for (let tick = 0; tick < 200; tick += 1) {
      advanceSimulationOneTick(simulation);
      const debug = requiredDebug(simulation);
      expect(debug.unresolvedStandingOverlapCount).toBe(0);
      redirectedTicks += debug.redirectedCount;
      for (let index = 0; index < southboundIds.length; index += 1) {
        const entityId = southboundIds[index]!;
        maximumLateralDisplacement = Math.max(
          maximumLateralDisplacement,
          Math.abs(simulation.world.positionsX[entityId]! - startX[index]!),
        );
      }
      if (tick === 99) {
        midpointY = southboundIds.map((id) => simulation.world.positionsY[id]!);
      }
    }
    expect(redirectedTicks).toBeGreaterThan(0);
    expect(maximumLateralDisplacement).toBeLessThanOrEqual(12);
    for (let index = 0; index < southboundIds.length; index += 1) {
      const entityId = southboundIds[index]!;
      expect(simulation.world.positionsY[entityId]! - startY[index]!)
        .toBeGreaterThan(40);
      expect(simulation.world.positionsY[entityId]! - midpointY[index]!)
        .toBeGreaterThan(10);
      expect(simulation.world.positionsY[entityId]! - startY[index]!)
        .toBeGreaterThan(
          Math.abs(simulation.world.positionsX[entityId]! - startX[index]!) * 4,
        );
      expect(Math.abs(simulation.world.positionsX[entityId]! - startX[index]!))
        .toBeLessThanOrEqual(1);
    }
    assertNoIllegalStandingOverlap(simulation);
  });

  it("uses one bounded courtesy yielder and is rotationally equivalent", () => {
    const originalScenario = createCourtesyCrossingScenario(false);
    const rotatedScenario = createCourtesyCrossingScenario(true);
    const original = createSimulation(originalScenario);
    const rotated = createSimulation(rotatedScenario);
    const courtesyEpisodes = new Uint8Array(2);
    const previouslyActive = new Uint8Array(2);
    const activeStreaks = new Uint8Array(2);
    let maximumCourtesyStreak = 0;
    let observedCourtesyTicks = 0;
    for (let tick = 0; tick < 60; tick += 1) {
      advanceSimulationOneTick(original);
      advanceSimulationOneTick(rotated);
      const debug = requiredDebug(original);
      const active = [0, 1].filter((id) =>
        debug.courtesyBlockerByEntity[id]! >= 0
      );
      expect(active.length).toBeLessThanOrEqual(1);
      for (const entityId of [0, 1]) {
        const isActive = debug.courtesyBlockerByEntity[entityId]! >= 0;
        if (isActive && previouslyActive[entityId] === 0) {
          courtesyEpisodes[entityId] = courtesyEpisodes[entityId]! + 1;
        }
        activeStreaks[entityId] = isActive
          ? activeStreaks[entityId]! + 1
          : 0;
        maximumCourtesyStreak = Math.max(
          maximumCourtesyStreak,
          activeStreaks[entityId]!,
        );
        previouslyActive[entityId] = isActive ? 1 : 0;
      }
      if (active.length === 1) {
        observedCourtesyTicks += 1;
        const yielderId = active[0]!;
        const blockerId = debug.courtesyBlockerByEntity[yielderId]!;
        expect(debug.courtesyBlockerByEntity[blockerId]).toBe(-1);
        expect(debug.courtesyTicksRemaining[yielderId])
          .toBeLessThanOrEqual(20);
        expect(debug.resolvedDeltas[blockerId * 2]).toBe(
          originalScenario.personalSpaceSpike!.entities[blockerId]!
            .requestedDeltaX,
        );
        expect(debug.resolvedDeltas[blockerId * 2 + 1]).toBe(
          originalScenario.personalSpaceSpike!.entities[blockerId]!
            .requestedDeltaY,
        );
      }
      expectRotatedWorld(original, rotated, 80);
      assertNoIllegalStandingOverlap(original);
      assertNoIllegalStandingOverlap(rotated);
    }
    expect(observedCourtesyTicks).toBeGreaterThan(0);
    expect(maximumCourtesyStreak).toBeLessThanOrEqual(20);
    expect(Math.max(...courtesyEpisodes)).toBe(1);
  });

  it("makes a same-direction faster follower yield without pushing its leader", () => {
    const simulation = createSimulation(PERSONAL_SPACE_SPIKE_SCENARIO);
    const [leaderId, followerId] = PERSONAL_SPACE_SPIKE_CHAMBERS[2]!.entityIds;
    const leaderStartX = simulation.world.positionsX[leaderId!]!;
    let followerYieldTicks = 0;
    let leaderNonForwardTicks = 0;
    let maximumLateralDisplacement = 0;
    let observedBypassClearance = 0;
    const passingSides = new Set<number>();
    for (let tick = 0; tick < 220; tick += 1) {
      advanceSimulationOneTick(simulation);
      const debug = requiredDebug(simulation);
      if (debug.resolvedDeltas[followerId! * 2] !== 2) followerYieldTicks += 1;
      if (
        debug.resolvedDeltas[leaderId! * 2] !== 1 ||
        debug.resolvedDeltas[leaderId! * 2 + 1] !== 0
      ) leaderNonForwardTicks += 1;
      maximumLateralDisplacement = Math.max(
        maximumLateralDisplacement,
        Math.abs(simulation.world.positionsY[followerId!]! - 360),
      );
      if (debug.overtakeLeaderByEntity[followerId!] === leaderId) {
        passingSides.add(debug.overtakeSideByEntity[followerId!]!);
        if (
          Math.abs(
            simulation.world.positionsX[followerId!]! -
              simulation.world.positionsX[leaderId!]!,
          ) <= 8
        ) {
          observedBypassClearance = Math.max(
            observedBypassClearance,
            Math.abs(
              simulation.world.positionsY[followerId!]! -
                simulation.world.positionsY[leaderId!]!,
            ),
          );
        }
      }
    }
    expect(leaderNonForwardTicks).toBe(0);
    expect(simulation.world.positionsX[leaderId!]).toBe(leaderStartX + 220);
    expect(followerYieldTicks).toBeGreaterThan(0);
    expect(maximumLateralDisplacement).toBeGreaterThanOrEqual(9);
    expect(observedBypassClearance).toBeGreaterThanOrEqual(9);
    expect([...passingSides]).toHaveLength(1);
    expect(simulation.world.positionsX[followerId!]).toBeGreaterThan(
      simulation.world.positionsX[leaderId!]!,
    );
    expect(Math.abs(simulation.world.positionsY[followerId!]! - 360))
      .toBeLessThanOrEqual(1);
    assertNoIllegalStandingOverlap(simulation);
  });

  it("prefers avoidance but permits reduced soft-body crossing", () => {
    const simulation = createSimulation(PERSONAL_SPACE_SPIKE_SCENARIO);
    const moverIds = PERSONAL_SPACE_SPIKE_CHAMBERS[3]!.entityIds.slice(0, 12)
      .filter((entityId) =>
        requiredDebug(simulation).occupancyClassCodes[entityId] ===
          PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.activeStanding,
      );
    let crossingCount = 0;
    let redirectedCount = 0;
    for (let tick = 0; tick < 80; tick += 1) {
      advanceSimulationOneTick(simulation);
      const debug = requiredDebug(simulation);
      crossingCount += debug.downedSoftCrossingCount;
      redirectedCount += debug.redirectedCount;
    }
    expect(crossingCount).toBeGreaterThan(0);
    expect(redirectedCount).toBeGreaterThan(0);
    for (const entityId of moverIds) {
      expect(simulation.world.positionsX[entityId]).toBeGreaterThan(900);
    }
  });

  it("makes respawn egress stop following living traffic and resume its desire", () => {
    const simulation = createSimulation(PERSONAL_SPACE_SPIKE_SCENARIO);
    const ids = PERSONAL_SPACE_SPIKE_CHAMBERS[4]!.entityIds;
    const livingIds = ids.slice(0, 6);
    const egressId = ids[6]!;
    const livingStartY = livingIds.map((id) => simulation.world.positionsY[id]!);
    const egressStartX = simulation.world.positionsX[egressId]!;
    let egressYieldTicks = 0;
    let egressWaitTicks = 0;
    let egressReverseTicks = 0;
    let maximumSidewaysDisplacement = 0;
    let detourChanges = 0;
    advanceWithObservation(simulation, 120, (debug) => {
      if (
        (debug.resolutionFlags[egressId]! &
          PERSONAL_SPACE_RESOLUTION_FLAG.yieldingEgressYield) !== 0
      ) egressYieldTicks += 1;
      if (
        debug.resolvedDeltas[egressId * 2] === 0 &&
        debug.resolvedDeltas[egressId * 2 + 1] === 0
      ) egressWaitTicks += 1;
      if (debug.resolvedDeltas[egressId * 2]! < 0) egressReverseTicks += 1;
      maximumSidewaysDisplacement = Math.max(
        maximumSidewaysDisplacement,
        Math.abs(simulation.world.positionsY[egressId]! - 584),
      );
      detourChanges += debug.detourStrategyChangeCount;
    });
    for (let index = 0; index < livingIds.length; index += 1) {
      expect(simulation.world.positionsY[livingIds[index]!])
        .toBe(livingStartY[index]! + 120);
    }
    expect(egressYieldTicks).toBeGreaterThan(0);
    expect(egressWaitTicks + egressReverseTicks).toBeGreaterThan(0);
    expect(maximumSidewaysDisplacement).toBeLessThanOrEqual(12);
    expect(detourChanges).toBeGreaterThan(0);
    expect(simulation.world.positionsX[egressId]! - egressStartX)
      .toBeGreaterThan(40);
    assertNoIllegalStandingOverlap(simulation);
  });

  it("bounds dense-front detour and lateral direction changes", () => {
    const simulation = createSimulation(PERSONAL_SPACE_SPIKE_SCENARIO);
    const ids = PERSONAL_SPACE_SPIKE_CHAMBERS[5]!.entityIds;
    const previousLateralDirection = new Int8Array(simulation.world.entityCount);
    const previousPhase = new Uint8Array(simulation.world.entityCount);
    const previousSide = new Int8Array(simulation.world.entityCount);
    const directionChanges = new Uint16Array(simulation.world.entityCount);
    const strategyChanges = new Uint16Array(simulation.world.entityCount);
    for (let tick = 0; tick < 1_000; tick += 1) {
      advanceSimulationOneTick(simulation);
      const debug = requiredDebug(simulation);
      for (const entityId of ids) {
        const direction = Math.sign(debug.resolvedDeltas[entityId * 2 + 1]!);
        if (
          direction !== 0 && previousLateralDirection[entityId] !== 0 &&
          direction !== previousLateralDirection[entityId]
        ) directionChanges[entityId] = directionChanges[entityId]! + 1;
        if (direction !== 0) previousLateralDirection[entityId] = direction;
        const phase = debug.detourPhaseCodes[entityId]!;
        const side = debug.detourSideByEntity[entityId]!;
        if (phase !== previousPhase[entityId] || side !== previousSide[entityId]) {
          strategyChanges[entityId] = strategyChanges[entityId]! + 1;
          previousPhase[entityId] = phase;
          previousSide[entityId] = side;
        }
      }
      expect(debug.unresolvedStandingOverlapCount).toBe(0);
    }
    expect(Math.max(...directionChanges)).toBeLessThanOrEqual(8);
    expect(Math.max(...strategyChanges)).toBeLessThanOrEqual(8);
  });

  it("commits to 2s, 5s, and 10s detour attempts before reconsidering", () => {
    const scenario: SimulationScenario = {
      seed: 80,
      entityCount: 5,
      bounds: { width: 80, height: 80 },
      minSpeedUnitsPerTick: 1,
      maxSpeedUnitsPerTick: 1,
      personalSpaceSpike: {
        kind: "personalSpaceSpike",
        standingRadius: 4,
        downedSoftRadius: 5,
        maximumResolutionPasses: 8,
        entities: [
          { entityId: 0, x: 32, y: 32, requestedDeltaX: 2, requestedDeltaY: 0, occupancyClass: "activeStanding", teamId: 1 },
          { entityId: 1, x: 40, y: 32, requestedDeltaX: 0, requestedDeltaY: 0, occupancyClass: "activeStanding", teamId: 1 },
          { entityId: 2, x: 32, y: 24, requestedDeltaX: 0, requestedDeltaY: 0, occupancyClass: "activeStanding", teamId: 1 },
          { entityId: 3, x: 32, y: 40, requestedDeltaX: 0, requestedDeltaY: 0, occupancyClass: "activeStanding", teamId: 1 },
          { entityId: 4, x: 24, y: 32, requestedDeltaX: 0, requestedDeltaY: 0, occupancyClass: "activeStanding", teamId: 1 },
        ],
      },
    };
    const simulation = createSimulation(scenario);
    const transitions: Array<{ tick: number; phase: number; side: number }> = [];
    let previousPhase = -1;
    for (let tick = 1; tick <= 1_000; tick += 1) {
      advanceSimulationOneTick(simulation);
      const debug = requiredDebug(simulation);
      const phase = debug.detourPhaseCodes[0]!;
      if (phase !== previousPhase) {
        transitions.push({ tick, phase, side: debug.detourSideByEntity[0]! });
        previousPhase = phase;
      }
      expect(debug.unresolvedStandingOverlapCount).toBe(0);
    }
    expect(transitions).toEqual([
      { tick: 1, phase: PERSONAL_SPACE_DETOUR_PHASE.initialSide, side: 1 },
      { tick: 41, phase: PERSONAL_SPACE_DETOUR_PHASE.oppositeSide, side: -1 },
      { tick: 141, phase: PERSONAL_SPACE_DETOUR_PHASE.widerAlternative, side: -1 },
    ]);
    expect(Array.from(simulation.world.positionsX)).toEqual([32, 40, 32, 32, 24]);
    expect(Array.from(simulation.world.positionsY)).toEqual([32, 32, 24, 40, 32]);
  });

  it("is replay-stable, input-order independent, bounded, and locally queried", () => {
    const baseline = runDigest(PERSONAL_SPACE_SPIKE_SCENARIO, 120);
    const repeated = runDigest(PERSONAL_SPACE_SPIKE_SCENARIO, 120);
    const reversedScenario: SimulationScenario = {
      ...PERSONAL_SPACE_SPIKE_SCENARIO,
      personalSpaceSpike: {
        ...PERSONAL_SPACE_SPIKE_SCENARIO.personalSpaceSpike!,
        entities: [
          ...PERSONAL_SPACE_SPIKE_SCENARIO.personalSpaceSpike!.entities,
        ].reverse(),
      },
    };
    expect(repeated).toEqual(baseline);
    expect(runDigest(reversedScenario, 120)).toEqual(baseline);
    expect(baseline.maximumPassCount).toBeLessThanOrEqual(8);
    expect(baseline.maximumLocalCandidateCount).toBeLessThan(
      PERSONAL_SPACE_SPIKE_SCENARIO.entityCount ** 2,
    );
    expect(baseline.maximumUnresolvedOverlapCount).toBe(0);
    expect(baseline.fallbackResetCount).toBeLessThan(
      PERSONAL_SPACE_SPIKE_SCENARIO.entityCount * 8,
    );
  });

  it("clips requested movement at world bounds without granting distance", () => {
    const scenario: SimulationScenario = {
      seed: 8,
      entityCount: 2,
      bounds: { width: 32, height: 32 },
      minSpeedUnitsPerTick: 1,
      maxSpeedUnitsPerTick: 1,
      personalSpaceSpike: {
        kind: "personalSpaceSpike",
        standingRadius: 4,
        downedSoftRadius: 5,
        maximumResolutionPasses: 8,
        entities: [
          {
            entityId: 0, x: 0, y: 8,
            requestedDeltaX: -2, requestedDeltaY: 0,
            occupancyClass: "activeStanding", teamId: 1,
          },
          {
            entityId: 1, x: 31, y: 24,
            requestedDeltaX: 2, requestedDeltaY: 0,
            occupancyClass: "activeStanding", teamId: 1,
          },
        ],
      },
    };
    const simulation = createSimulation(scenario);
    advanceSimulationOneTick(simulation);
    expect(Array.from(simulation.world.positionsX)).toEqual([0, 31]);
    expect(Array.from(requiredDebug(simulation).resolvedDeltas)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(requiredDebug(simulation).resolutionPassCount).toBeLessThanOrEqual(8);
  });
});

function advance(simulation: SimulationState, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
}

function advanceWithObservation(
  simulation: SimulationState,
  ticks: number,
  observe: (debug: PersonalSpaceSpikeDebugSnapshot) => void,
): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    advanceSimulationOneTick(simulation);
    observe(requiredDebug(simulation));
  }
}

function requiredDebug(
  simulation: SimulationState,
): PersonalSpaceSpikeDebugSnapshot {
  const debug = simulation.personalSpaceSpike?.store.debugSnapshot;
  if (debug === undefined) throw new Error("Missing personal-space spike debug.");
  return debug;
}

function chamberPositions(simulation: SimulationState, chamberId: number) {
  const ids = PERSONAL_SPACE_SPIKE_CHAMBERS[chamberId - 1]!.entityIds;
  return {
    x: ids.map((entityId) => simulation.world.positionsX[entityId]!),
    y: ids.map((entityId) => simulation.world.positionsY[entityId]!),
  };
}

function assertNoIllegalStandingOverlap(simulation: SimulationState): void {
  const debug = requiredDebug(simulation);
  for (let left = 0; left < simulation.world.entityCount; left += 1) {
    if (!isHardStanding(debug.occupancyClassCodes[left]!)) continue;
    for (let right = left + 1; right < simulation.world.entityCount; right += 1) {
      if (!isHardStanding(debug.occupancyClassCodes[right]!)) continue;
      const dx = simulation.world.positionsX[right]! - simulation.world.positionsX[left]!;
      const dy = simulation.world.positionsY[right]! - simulation.world.positionsY[left]!;
      const minimum = debug.radii[left]! + debug.radii[right]!;
      expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(minimum * minimum);
    }
  }
  expect(debug.unresolvedStandingOverlapCount).toBe(0);
}

function isHardStanding(classCode: number): boolean {
  return classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.activeStanding ||
    classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.assistedMoving ||
    classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.yieldingEgress;
}

function createCourtesyCrossingScenario(rotated: boolean): SimulationScenario {
  const base = [
    { entityId: 0, x: 20, y: 40, requestedDeltaX: 1, requestedDeltaY: 0 },
    { entityId: 1, x: 40, y: 20, requestedDeltaX: 0, requestedDeltaY: 1 },
  ];
  const entities = base.map((entity) => rotated
    ? {
        ...entity,
        x: 79 - entity.y,
        y: entity.x,
        requestedDeltaX: -entity.requestedDeltaY,
        requestedDeltaY: entity.requestedDeltaX,
        occupancyClass: "activeStanding" as const,
        teamId: 1,
      }
    : {
        ...entity,
        occupancyClass: "activeStanding" as const,
        teamId: 1,
      });
  return {
    seed: 81,
    entityCount: 2,
    bounds: { width: 80, height: 80 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    personalSpaceSpike: {
      kind: "personalSpaceSpike",
      standingRadius: 4,
      downedSoftRadius: 5,
      maximumResolutionPasses: 8,
      entities,
    },
  };
}

function expectRotatedWorld(
  original: SimulationState,
  rotated: SimulationState,
  size: number,
): void {
  for (let entityId = 0; entityId < original.world.entityCount; entityId += 1) {
    expect(rotated.world.positionsX[entityId]).toBe(
      size - 1 - original.world.positionsY[entityId]!,
    );
    expect(rotated.world.positionsY[entityId]).toBe(
      original.world.positionsX[entityId],
    );
  }
}

function runDigest(scenario: SimulationScenario, ticks: number) {
  const simulation = createSimulation(scenario);
  let maximumPassCount = 0;
  let maximumLocalCandidateCount = 0;
  let maximumUnresolvedOverlapCount = 0;
  let fallbackResetCount = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    advanceSimulationOneTick(simulation);
    const debug = requiredDebug(simulation);
    maximumPassCount = Math.max(maximumPassCount, debug.resolutionPassCount);
    maximumLocalCandidateCount = Math.max(
      maximumLocalCandidateCount,
      debug.localCandidateCount,
    );
    maximumUnresolvedOverlapCount = Math.max(
      maximumUnresolvedOverlapCount,
      debug.unresolvedStandingOverlapCount,
    );
    fallbackResetCount += debug.fallbackResetCount;
  }
  const debug = requiredDebug(simulation);
  return {
    positionsX: Array.from(simulation.world.positionsX),
    positionsY: Array.from(simulation.world.positionsY),
    resolvedDeltas: Array.from(debug.resolvedDeltas),
    resolutionFlags: Array.from(debug.resolutionFlags),
    detourPhases: Array.from(debug.detourPhaseCodes),
    detourSides: Array.from(debug.detourSideByEntity),
    detourTicksRemaining: Array.from(debug.detourTicksRemaining),
    courtesyBlockers: Array.from(debug.courtesyBlockerByEntity),
    courtesyTicksRemaining: Array.from(debug.courtesyTicksRemaining),
    overtakeLeaders: Array.from(debug.overtakeLeaderByEntity),
    overtakeSides: Array.from(debug.overtakeSideByEntity),
    principalRelationships: Array.from(debug.principalRelationshipCodes),
    maximumPassCount,
    maximumLocalCandidateCount,
    maximumUnresolvedOverlapCount,
    fallbackResetCount,
  };
}
