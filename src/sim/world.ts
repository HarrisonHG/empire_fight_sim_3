import { SeededRng } from "./rng";
import {
  entityIdFromIndex,
  type SimulationScenario,
  type WorldState,
} from "./types";

const DIRECTIONS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

export interface InitializedWorld {
  readonly world: WorldState;
  readonly rngState: number;
}

export function createWorld(scenario: SimulationScenario): InitializedWorld {
  validateScenario(scenario);

  const rng = new SeededRng(scenario.seed);
  const ids = new Uint32Array(scenario.entityCount);
  const positionsX = new Int32Array(scenario.entityCount);
  const positionsY = new Int32Array(scenario.entityCount);
  const velocitiesX = new Int32Array(scenario.entityCount);
  const velocitiesY = new Int32Array(scenario.entityCount);

  for (let index = 0; index < scenario.entityCount; index += 1) {
    const speed = rng.nextIntInclusive(
      scenario.minSpeedUnitsPerTick,
      scenario.maxSpeedUnitsPerTick,
    );
    const direction = DIRECTIONS[
      rng.nextIntInclusive(0, DIRECTIONS.length - 1)
    ]!;

    ids[index] = entityIdFromIndex(index);
    positionsX[index] = rng.nextIntInclusive(0, scenario.bounds.width - 1);
    positionsY[index] = rng.nextIntInclusive(0, scenario.bounds.height - 1);
    velocitiesX[index] = direction[0] * speed;
    velocitiesY[index] = direction[1] * speed;
  }

  return {
    world: {
      entityCount: scenario.entityCount,
      bounds: scenario.bounds,
      ids,
      positionsX,
      positionsY,
      velocitiesX,
      velocitiesY,
    },
    rngState: rng.state,
  };
}

function validateScenario(scenario: SimulationScenario): void {
  assertPositiveInteger(scenario.entityCount, "entityCount");
  assertPositiveInteger(scenario.bounds.width, "bounds.width");
  assertPositiveInteger(scenario.bounds.height, "bounds.height");
  assertPositiveInteger(
    scenario.minSpeedUnitsPerTick,
    "minSpeedUnitsPerTick",
  );
  assertPositiveInteger(
    scenario.maxSpeedUnitsPerTick,
    "maxSpeedUnitsPerTick",
  );

  if (scenario.bounds.width < 2 || scenario.bounds.height < 2) {
    throw new RangeError("Simulation bounds must be at least 2 by 2 units.");
  }

  if (scenario.maxSpeedUnitsPerTick < scenario.minSpeedUnitsPerTick) {
    throw new RangeError("Maximum speed must not be less than minimum speed.");
  }

  const maximumReflectableSpeed = Math.min(
    scenario.bounds.width - 1,
    scenario.bounds.height - 1,
  );
  if (scenario.maxSpeedUnitsPerTick > maximumReflectableSpeed) {
    throw new RangeError(
      "Maximum speed must fit within each axis for one-step reflection.",
    );
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
