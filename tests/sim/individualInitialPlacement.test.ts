import { describe, expect, it } from "vitest";

import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
import { VISUAL_TEST_REGISTRY } from "../../src/content/visualTestRegistry";
import {
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  CombatSandboxUnitScenario,
  SimulationScenario,
} from "../../src/sim/types";

describe("Milestone 8G retained production initial placement", () => {
  it("starts every retained production battle without hard-standing overlap", () => {
    const illegal: string[] = [];
    for (const entry of VISUAL_TEST_REGISTRY) {
      if (entry.scenario.combatSandbox?.kind !== "liveCombatSandbox") continue;
      const simulation = createSimulation(entry.scenarioFactory());
      const count = simulation.combatSandbox!.individualInitialPlacementEvidence
        .illegalHardStandingOverlapCount;
      if (count > 0) {
        const evidence = simulation.combatSandbox!.individualInitialPlacementEvidence;
        const left = evidence.firstOverlapLeftEntityId;
        const right = evidence.firstOverlapRightEntityId;
        illegal.push(`${entry.id}:${count}:${left},${right}:` +
          `${simulation.world.positionsX[left]},${simulation.world.positionsY[left]}-` +
          `${simulation.world.positionsX[right]},${simulation.world.positionsY[right]}`);
      }
    }
    expect(illegal).toEqual([]);
  });

  it("replays the nearest legal setup adjustment deterministically", () => {
    const first = createSimulation(denseScenario(true, false));
    const second = createSimulation(denseScenario(true, false));

    expect(Array.from(first.world.positionsX)).toEqual(
      Array.from(second.world.positionsX),
    );
    expect(Array.from(first.world.positionsY)).toEqual(
      Array.from(second.world.positionsY),
    );
    expect(first.combatSandbox!.individualInitialPlacementEvidence
      .illegalHardStandingOverlapCount).toBe(0);
    const deltaX = first.world.positionsX[1]! - first.world.positionsX[0]!;
    const deltaY = first.world.positionsY[1]! - first.world.positionsY[0]!;
    expect(deltaX * deltaX + deltaY * deltaY).toBe(64);
  });

  it("retains legal deterministic placement when unit definitions reverse", () => {
    const forward = createSimulation(denseScenario(true, false));
    const reversed = createSimulation(denseScenario(true, true));

    expect(Array.from(reversed.world.positionsX)).toEqual(
      Array.from(forward.world.positionsX),
    );
    expect(Array.from(reversed.world.positionsY)).toEqual(
      Array.from(forward.world.positionsY),
    );
    expect(reversed.combatSandbox!.individualInitialPlacementEvidence
      .illegalHardStandingOverlapCount).toBe(0);
  });

  it("reports an opted-out illegal fixture without runtime depenetration", () => {
    const simulation = createSimulation(denseScenario(false, false));
    const startX = Array.from(simulation.world.positionsX);
    const startY = Array.from(simulation.world.positionsY);

    expect(simulation.combatSandbox!.individualInitialPlacementEvidence)
      .toMatchObject({
        illegalHardStandingOverlapCount: 1,
        firstOverlapLeftEntityId: 0,
        firstOverlapRightEntityId: 1,
      });

    advanceSimulationOneTick(simulation);

    expect(Array.from(simulation.world.positionsX)).toEqual(startX);
    expect(Array.from(simulation.world.positionsY)).toEqual(startY);
    expect(simulation.combatSandbox!.individualInitialPlacementEvidence
      .illegalHardStandingOverlapCount).toBe(1);
  });
});

function denseScenario(
  requireLegalInitialHardStandingPlacement: boolean,
  reverse: boolean,
): SimulationScenario {
  const source = MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox!;
  const units = [
    denseUnit(source.units[0]!, 10, 1),
    denseUnit(source.units[2]!, 20, 2),
  ];
  return {
    seed: 0x8_6002,
    entityCount: 2,
    bounds: { width: 120, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 2,
      requireLegalInitialHardStandingPlacement,
      inspectedEntityIds: [0, 1],
      units: reverse ? units.slice().reverse() : units,
    },
  };
}

function denseUnit(
  source: CombatSandboxUnitScenario,
  unitId: number,
  factionId: number,
): CombatSandboxUnitScenario {
  return {
    ...source,
    unitId,
    factionId,
    memberCount: 1,
    ...(source.memberProfiles === undefined
      ? {}
      : { memberProfiles: source.memberProfiles.slice(0, 1) }),
    deploymentZone: { minX: 50, maxX: 50, minY: 50, maxY: 50 },
    anchorX: 50,
    anchorY: 50,
    rows: 1,
    cols: 1,
    order: "hold",
    casualtyProcedure: factionId === 1
      ? source.casualtyProcedure
      : {
          ...source.casualtyProcedure,
          respawnDestination: { x: 110, y: 110 },
        },
  };
}
