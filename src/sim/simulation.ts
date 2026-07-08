import { moveWorldOneTick } from "./movement";
import type {
  InitialSimulationSnapshot,
  PositionSimulationSnapshot,
  SimulationScenario,
  SimulationState,
} from "./types";
import { createWorld } from "./world";

export const FIXED_TICKS_PER_SECOND = 20;

interface SnapshotBuffers {
  readonly ids: Uint32Array;
  readonly positions: Int32Array;
}

const snapshotBuffersBySimulation = new WeakMap<
  SimulationState,
  SnapshotBuffers
>();

export function createSimulation(
  scenario: SimulationScenario,
): SimulationState {
  const initializedWorld = createWorld(scenario);
  const simulation: SimulationState = {
    tick: 0,
    rngState: initializedWorld.rngState,
    world: initializedWorld.world,
  };

  snapshotBuffersBySimulation.set(simulation, {
    ids: initializedWorld.world.ids.slice(),
    positions: new Int32Array(initializedWorld.world.entityCount * 2),
  });

  return simulation;
}

/** Advances the complete simulation by exactly one fixed tick. */
export function advanceSimulationOneTick(simulation: SimulationState): void {
  // Foundation system order: movement with boundary reflection, then tick count.
  moveWorldOneTick(simulation.world);
  simulation.tick += 1;
}

/**
 * Returns an ephemeral initial snapshot view. Its positions buffer is reused by
 * later snapshot calls and must be consumed or copied before the next call.
 */
export function createInitialSnapshot(
  simulation: SimulationState,
): InitialSimulationSnapshot {
  return {
    kind: "initial",
    tick: simulation.tick,
    entityCount: simulation.world.entityCount,
    bounds: {
      width: simulation.world.bounds.width,
      height: simulation.world.bounds.height,
    },
    ids: getSnapshotBuffers(simulation).ids,
    positions: fillSnapshotPositions(simulation),
  };
}

/**
 * Returns an ephemeral position snapshot view backed by the simulation-owned
 * reusable buffer. Consume or copy it before creating the next snapshot.
 */
export function createPositionSnapshot(
  simulation: SimulationState,
): PositionSimulationSnapshot {
  return {
    kind: "positions",
    tick: simulation.tick,
    entityCount: simulation.world.entityCount,
    positions: fillSnapshotPositions(simulation),
  };
}

function fillSnapshotPositions(simulation: SimulationState): Int32Array {
  const { world } = simulation;
  const snapshotPositions = getSnapshotBuffers(simulation).positions;

  for (let index = 0; index < world.entityCount; index += 1) {
    const positionOffset = index * 2;
    snapshotPositions[positionOffset] = world.positionsX[index]!;
    snapshotPositions[positionOffset + 1] = world.positionsY[index]!;
  }

  return snapshotPositions;
}

function getSnapshotBuffers(simulation: SimulationState): SnapshotBuffers {
  const existingBuffers = snapshotBuffersBySimulation.get(simulation);
  if (existingBuffers !== undefined) {
    return existingBuffers;
  }

  const buffers: SnapshotBuffers = {
    ids: simulation.world.ids.slice(),
    positions: new Int32Array(simulation.world.entityCount * 2),
  };
  snapshotBuffersBySimulation.set(simulation, buffers);
  return buffers;
}
