import { describe, expect, it } from "vitest";

import { CASUALTY_LIFECYCLE_VISUAL_SCENARIO } from "../../src/content/casualtyLifecycleVisualScenario";
import { getUnitHeading } from "../../src/sim/formationBehaviour";
import { getActiveCasualtyDragGroups } from "../../src/sim/individualCasualtyAssistance";
import { isIndividualCombatEligible, isIndividualCombatTargetEligible } from "../../src/sim/individualCombatEligibility";
import { getIndividualCombatProfile } from "../../src/sim/individualCombatProfile";
import { getIndividualCollisionResolutionInspection } from "../../src/sim/individualCollisionResolution";
import { getActiveMeleeDistances, getSelectedTargetEntityId } from "../../src/sim/individualMeleeTargetSelection";
import { PRODUCTION_PERSONAL_SPACE_GEOMETRY } from "../../src/sim/individualPhysicalOccupancy";
import { advanceSimulationOneTick, createSimulation } from "../../src/sim/simulation";
import { buildSpatialGrid, createSpatialGrid, queryEntitiesWithinRadiusInto } from "../../src/sim/spatialGrid";
import type { SimulationState } from "../../src/sim/types";
import { getUnitIdForEntity } from "../../src/sim/unitIdentity";

describe("retained casualty contact and extraction contracts", () => {
  it("starts at legal facing contact and naturally attacks/defends deterministically", () => {
    const first = contactTrace();
    expect(contactTrace()).toEqual(first);
    for (const frame of first.slice(0, 2)) {
      for (const pair of frame.pair) {
        expect(pair.distance).toBe(2 * PRODUCTION_PERSONAL_SPACE_GEOMETRY.activeStandingRadius);
        expect(pair.facingDot).toBeGreaterThan(0);
        expect(pair.inQuery).toBe(true);
        expect(pair.sourceEligible).toBe(true);
        expect(pair.targetEligible).toBe(true);
        if (frame.tick === 1) expect(pair.selected).toBe(pair.target);
      }
    }
    const exchange = first.find((frame) => frame.attacks.length > 0)!;
    expect(exchange).toBeDefined();
    expect(exchange.tick).toBe(4); // Rule tick 3; snapshot tick 4.
    expect(exchange.attacks).toHaveLength(1);
    const attack = exchange.attacks[0]!;
    expect([attack.attackerEntityId, attack.targetEntityId].sort((a, b) => a - b))
      .toEqual([14, 25]);
    expect(exchange.defences).toHaveLength(1);
    expect(exchange.defences[0]).toMatchObject({
      attackerEntityId: attack.attackerEntityId,
      defenderEntityId: attack.targetEntityId,
    });
  });

  it("rejects the same eligible, query-visible contact when only headings face away", () => {
    const trace = contactTrace(true);
    for (const frame of trace.slice(0, 2)) {
      for (const pair of frame.pair) {
        expect(pair.distance).toBe(2 * PRODUCTION_PERSONAL_SPACE_GEOMETRY.activeStandingRadius);
        expect(pair.facingDot).toBeLessThan(0);
        expect(pair.inQuery).toBe(true);
        expect(pair.sourceEligible).toBe(true);
        expect(pair.targetEligible).toBe(true);
        expect(pair.selected).toBe(-1);
      }
    }
    expect(trace.every((frame) => frame.attacks.length === 0 && frame.defences.length === 0))
      .toBe(true);
  });

  it("separates gathering, stationary phase entry and common resolved extraction movement", () => {
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    const initialPatient = position(simulation, 8);
    let entryPositions: ReturnType<typeof position>[] = [];
    for (let tick = 1; tick <= 12; tick += 1) {
      const before = [8, 9, 10].map((id) => position(simulation, id));
      advanceSimulationOneTick(simulation);
      const group = getActiveCasualtyDragGroups(simulation.combatSandbox!.casualtyDragGroupStore)
        .find((candidate) => candidate.patientEntityId === 8)!;
      expect(group.helperEntityIds).toEqual([9, 10]);
      const after = [8, 9, 10].map((id) => position(simulation, id));
      expect(Math.hypot(after[1]!.x - after[2]!.x, after[1]!.y - after[2]!.y))
        .toBeGreaterThanOrEqual(2 * PRODUCTION_PERSONAL_SPACE_GEOMETRY.activeStandingRadius);
      if (tick <= 8) expect(after[0]).toEqual(initialPatient);
      if (tick === 7) expect(group.phase).toBe("gathering");
      if (tick === 8) {
        expect(group.phase).toBe("dragging");
        expect(after).toEqual([{ x: 2800, y: 300 }, { x: 2806, y: 296 }, { x: 2806, y: 304 }]);
        expect(getIndividualCollisionResolutionInspection(
          simulation.combatSandbox!.individualCollisionResolutionStore, 8,
        )).toMatchObject({ permittedDeltaX: 0, permittedDeltaY: 0, resolvedDeltaX: 0, resolvedDeltaY: 0 });
        entryPositions = after;
      }
      if (tick >= 9) {
        expect(group.phase).toBe("dragging");
        for (const [index, entityId] of [8, 9, 10].entries()) {
          const delta = { x: after[index]!.x - before[index]!.x, y: after[index]!.y - before[index]!.y };
          expect(delta).toEqual({ x: -1, y: 0 });
          expect(getIndividualCollisionResolutionInspection(
            simulation.combatSandbox!.individualCollisionResolutionStore, entityId,
          )).toMatchObject({ permittedDeltaX: -1, permittedDeltaY: 0, resolvedDeltaX: delta.x, resolvedDeltaY: delta.y });
          expect({ x: after[index]!.x - after[0]!.x, y: after[index]!.y - after[0]!.y })
            .toEqual({ x: entryPositions[index]!.x - entryPositions[0]!.x, y: entryPositions[index]!.y - entryPositions[0]!.y });
        }
      }
    }
  });
});

function position(simulation: SimulationState, entityId: number) {
  return { x: simulation.world.positionsX[entityId]!, y: simulation.world.positionsY[entityId]! };
}

function contactTrace(faceAway = false) {
  const original = CASUALTY_LIFECYCLE_VISUAL_SCENARIO;
  const simulation = createSimulation(faceAway ? {
    ...original,
    combatSandbox: {
      ...original.combatSandbox!,
      units: original.combatSandbox!.units.map((unit) =>
        unit.unitId === 701 || unit.unitId === 703
          ? { ...unit, headingX: -unit.headingX } : unit),
    },
  } : original);
  const combat = simulation.combatSandbox!;
  const grid = createSpatialGrid({ bounds: simulation.world.bounds, cellSize: 32, capacity: simulation.world.entityCount });
  const frames = [];
  for (let tick = 0; tick <= 5; tick += 1) {
    if (tick > 0) advanceSimulationOneTick(simulation);
    buildSpatialGrid(grid, simulation.world);
    const pair = [14, 25].map((source) => {
      const target = source === 14 ? 25 : 14;
      const heading = getUnitHeading(combat.formationStore, getUnitIdForEntity(combat.identityStore, source));
      const dx = simulation.world.positionsX[target]! - simulation.world.positionsX[source]!;
      const dy = simulation.world.positionsY[target]! - simulation.world.positionsY[source]!;
      const distances = getActiveMeleeDistances(getIndividualCombatProfile(combat.individualProfileStore, source));
      return {
        source, target, distance: Math.hypot(dx, dy), facingDot: dx * heading.x + dy * heading.y,
        inQuery: queryEntitiesWithinRadiusInto(grid, simulation.world.positionsX[source]!, simulation.world.positionsY[source]!, distances.threat, []).includes(target),
        sourceEligible: isIndividualCombatEligible(combat.individualCombatEligibilitySnapshot, source),
        targetEligible: isIndividualCombatTargetEligible(combat.individualCombatEligibilitySnapshot, target),
        selected: getSelectedTargetEntityId(combat.individualTargetSelectionStore, source),
      };
    });
    frames.push({ tick, pair,
      attacks: structuredClone(combat.individualCombatPipelineBuffers.attackAttempts),
      defences: structuredClone(combat.individualCombatPipelineBuffers.defenceRecords),
    });
  }
  return frames;
}
