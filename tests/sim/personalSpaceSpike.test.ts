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
        "Catch-up and overtaking",
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
    const intendedDeltas = initial.personalSpaceDebug?.intendedDeltas;
    const resolutionFlags = initial.personalSpaceDebug?.resolutionFlags;

    advanceSimulationOneTick(simulation);
    const positioned = createPositionSnapshot(simulation);
    expect(positioned.personalSpaceDebug).toBe(
      simulation.personalSpaceSpike?.store.debugSnapshot,
    );
    expect(positioned.personalSpaceDebug?.resolutionPassCount).toBeGreaterThan(0);
    expect(positioned.personalSpaceDebug?.localQueryCount).toBeGreaterThan(0);
    expect(positioned.personalSpaceDebug?.intendedDeltas).toBe(intendedDeltas);
    expect(positioned.personalSpaceDebug?.resolutionFlags).toBe(resolutionFlags);
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

  it("allows allied crossing and a stable one-sided overtake without phasing", () => {
    const simulation = createSimulation(PERSONAL_SPACE_SPIKE_SCENARIO);
    const initialCrossing = chamberPositions(simulation, 2);
    const fasterEntityId = PERSONAL_SPACE_SPIKE_CHAMBERS[2]!.entityIds[1]!;
    const observedPassDirections = new Set<number>();
    let redirectedTicks = 0;
    for (let tick = 0; tick < 120; tick += 1) {
      advanceSimulationOneTick(simulation);
      const debug = requiredDebug(simulation);
      expect(debug.unresolvedStandingOverlapCount).toBe(0);
      redirectedTicks += debug.redirectedCount;
      const resolvedY = debug.resolvedDeltas[fasterEntityId * 2 + 1]!;
      if (resolvedY !== 0) observedPassDirections.add(Math.sign(resolvedY));
    }
    const finalCrossing = chamberPositions(simulation, 2);
    expect(finalCrossing.x).not.toEqual(initialCrossing.x);
    expect(finalCrossing.y).not.toEqual(initialCrossing.y);
    expect(redirectedTicks).toBeGreaterThan(0);
    expect([...observedPassDirections]).toEqual([-1]);
    expect(simulation.world.positionsX[fasterEntityId]).toBeGreaterThan(
      simulation.world.positionsX[fasterEntityId - 1]!,
    );
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

  it("makes respawn egress yield while living traffic keeps full progress", () => {
    const simulation = createSimulation(PERSONAL_SPACE_SPIKE_SCENARIO);
    const ids = PERSONAL_SPACE_SPIKE_CHAMBERS[4]!.entityIds;
    const livingIds = ids.slice(0, 6);
    const egressId = ids[6]!;
    const livingStartY = livingIds.map((id) => simulation.world.positionsY[id]!);
    const egressStartX = simulation.world.positionsX[egressId]!;
    let egressYieldTicks = 0;
    advanceWithObservation(simulation, 120, (debug) => {
      if (
        (debug.resolutionFlags[egressId]! &
          PERSONAL_SPACE_RESOLUTION_FLAG.yieldingEgressYield) !== 0
      ) egressYieldTicks += 1;
    });
    for (let index = 0; index < livingIds.length; index += 1) {
      expect(simulation.world.positionsY[livingIds[index]!])
        .toBe(livingStartY[index]! + 120);
    }
    expect(egressYieldTicks).toBeGreaterThan(0);
    expect(simulation.world.positionsX[egressId]! - egressStartX)
      .toBeLessThan(120);
    assertNoIllegalStandingOverlap(simulation);
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
    expect(baseline.fallbackResetCount).toBe(0);
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
    principalRelationships: Array.from(debug.principalRelationshipCodes),
    maximumPassCount,
    maximumLocalCandidateCount,
    maximumUnresolvedOverlapCount,
    fallbackResetCount,
  };
}
