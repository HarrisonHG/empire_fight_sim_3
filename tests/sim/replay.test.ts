import { describe, expect, it } from "vitest";

import { FOUNDATION_SCENARIO } from "../../src/content/foundationScenario";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";

describe("deterministic replay", () => {
  it("produces byte-equal authoritative state for the same replay inputs", () => {
    const first = runScenario(FORWARD_TICKS, FOUNDATION_SCENARIO);
    const second = runScenario(FORWARD_TICKS, FOUNDATION_SCENARIO);

    expect(encodeAuthoritativeState(first)).toEqual(
      encodeAuthoritativeState(second),
    );
  });

  it("produces different authoritative state for a different seed", () => {
    const baseline = runScenario(FORWARD_TICKS, FOUNDATION_SCENARIO);
    const differentSeedScenario: SimulationScenario = {
      ...FOUNDATION_SCENARIO,
      seed: FOUNDATION_SCENARIO.seed + 1,
    };
    const differentSeed = runScenario(FORWARD_TICKS, differentSeedScenario);

    expect(encodeAuthoritativeState(differentSeed)).not.toEqual(
      encodeAuthoritativeState(baseline),
    );
  });

  it("initializes 2,000 stable IDs with non-zero integer velocities", () => {
    const simulation = createSimulation(FOUNDATION_SCENARIO);
    const { world } = simulation;

    expect(world.entityCount).toBe(2_000);

    for (let index = 0; index < world.entityCount; index += 1) {
      expect(world.ids[index]).toBe(index);
      expect(Number.isInteger(world.velocitiesX[index])).toBe(true);
      expect(Number.isInteger(world.velocitiesY[index])).toBe(true);
      expect(
        world.velocitiesX[index] !== 0 || world.velocitiesY[index] !== 0,
      ).toBe(true);
    }
  });

  it("creates the complete initial snapshot contract", () => {
    const simulation = createSimulation(FOUNDATION_SCENARIO);
    const snapshot = createInitialSnapshot(simulation);

    expect(snapshot.kind).toBe("initial");
    expect(snapshot.tick).toBe(0);
    expect(snapshot.entityCount).toBe(2_000);
    expect(snapshot.bounds).toEqual(FOUNDATION_SCENARIO.bounds);
    expect(snapshot.ids).toHaveLength(2_000);
    expect(snapshot.positions).toHaveLength(4_000);

    for (let index = 0; index < snapshot.entityCount; index += 1) {
      const positionOffset = index * 2;
      expect(snapshot.ids[index]).toBe(simulation.world.ids[index]);
      expect(snapshot.positions[positionOffset]).toBe(
        simulation.world.positionsX[index],
      );
      expect(snapshot.positions[positionOffset + 1]).toBe(
        simulation.world.positionsY[index],
      );
    }
  });

  it("creates position-only snapshots and updates them after one tick", () => {
    const simulation = createSimulation(FOUNDATION_SCENARIO);
    const beforeSnapshot = createPositionSnapshot(simulation);
    const beforePositions = beforeSnapshot.positions.slice();

    expect(beforeSnapshot.kind).toBe("positions");
    expect(beforeSnapshot.tick).toBe(0);
    expect(beforeSnapshot.entityCount).toBe(2_000);
    expect(beforeSnapshot.positions).toHaveLength(4_000);
    expect("ids" in beforeSnapshot).toBe(false);

    advanceSimulationOneTick(simulation);
    const afterSnapshot = createPositionSnapshot(simulation);

    expect(afterSnapshot.tick).toBe(1);
    expect(afterSnapshot.positions).not.toEqual(beforePositions);
  });

  it("reuses one simulation-owned interleaved position buffer", () => {
    const simulation = createSimulation(FOUNDATION_SCENARIO);
    const initialSnapshot = createInitialSnapshot(simulation);
    const firstPositionSnapshot = createPositionSnapshot(simulation);

    advanceSimulationOneTick(simulation);
    const secondPositionSnapshot = createPositionSnapshot(simulation);

    expect(firstPositionSnapshot.positions).toBe(initialSnapshot.positions);
    expect(secondPositionSnapshot.positions).toBe(firstPositionSnapshot.positions);
  });
});

const FORWARD_TICKS = 500;
const HEADER_UINT32_COUNT = 5;

function runScenario(
  tickCount: number,
  scenario: SimulationScenario,
): SimulationState {
  const simulation = createSimulation(scenario);

  for (let tick = 0; tick < tickCount; tick += 1) {
    advanceSimulationOneTick(simulation);
  }

  return simulation;
}

function encodeAuthoritativeState(simulation: SimulationState): Uint8Array {
  const { world } = simulation;
  const componentViews = [
    world.ids,
    world.positionsX,
    world.positionsY,
    world.velocitiesX,
    world.velocitiesY,
  ];
  const headerByteLength = HEADER_UINT32_COUNT * Uint32Array.BYTES_PER_ELEMENT;
  const componentByteLength = componentViews.reduce(
    (total, view) => total + view.byteLength,
    0,
  );
  const encoded = new Uint8Array(headerByteLength + componentByteLength);
  const header = new DataView(encoded.buffer, 0, headerByteLength);

  header.setUint32(0, simulation.tick, true);
  header.setUint32(4, simulation.rngState, true);
  header.setUint32(8, world.entityCount, true);
  header.setUint32(12, world.bounds.width, true);
  header.setUint32(16, world.bounds.height, true);

  let offset = headerByteLength;
  for (const view of componentViews) {
    encoded.set(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
      offset,
    );
    offset += view.byteLength;
  }

  return encoded;
}
