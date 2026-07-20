import { describe, expect, it } from "vitest";

import { moveWorldOneTick } from "../../src/sim/movement";
import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
} from "../../src/sim/individualEnergy";
import { advanceSimulationOneTick } from "../../src/sim/simulation";
import type { SimulationState, WorldState } from "../../src/sim/types";

describe("fixed-tick movement", () => {
  it("moves by exactly one stored integer velocity and advances one tick", () => {
    const energyProfiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{ entityId: 0 }],
    });
    const simulation: SimulationState = {
      tick: 12,
      rngState: 123,
      world: createTestWorld({
        positionsX: [4],
        positionsY: [5],
        velocitiesX: [2],
        velocitiesY: [-3],
      }),
      trustedIndividualEnergyProfileStore: energyProfiles,
      individualEnergyStore: createIndividualEnergyStore(energyProfiles),
    };

    advanceSimulationOneTick(simulation);

    expect(simulation.tick).toBe(13);
    expect(Array.from(simulation.world.positionsX)).toEqual([6]);
    expect(Array.from(simulation.world.positionsY)).toEqual([2]);
    expect(Array.from(simulation.world.velocitiesX)).toEqual([2]);
    expect(Array.from(simulation.world.velocitiesY)).toEqual([-3]);
  });

  it("reflects each axis deterministically and remains inside bounds", () => {
    const world = createTestWorld({
      positionsX: [0, 8],
      positionsY: [9, 1],
      velocitiesX: [-2, 3],
      velocitiesY: [2, -3],
    });

    moveWorldOneTick(world);

    expect(Array.from(world.positionsX)).toEqual([2, 7]);
    expect(Array.from(world.positionsY)).toEqual([7, 2]);
    expect(Array.from(world.velocitiesX)).toEqual([2, -3]);
    expect(Array.from(world.velocitiesY)).toEqual([-2, 3]);
  });
});

interface TestWorldValues {
  readonly positionsX: readonly number[];
  readonly positionsY: readonly number[];
  readonly velocitiesX: readonly number[];
  readonly velocitiesY: readonly number[];
}

function createTestWorld(values: TestWorldValues): WorldState {
  const entityCount = values.positionsX.length;

  return {
    entityCount,
    bounds: { width: 10, height: 10 },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: Int32Array.from(values.positionsX),
    positionsY: Int32Array.from(values.positionsY),
    velocitiesX: Int32Array.from(values.velocitiesX),
    velocitiesY: Int32Array.from(values.velocitiesY),
  };
}
