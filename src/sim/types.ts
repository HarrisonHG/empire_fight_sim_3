declare const entityIdBrand: unique symbol;

export type EntityId = number & {
  readonly [entityIdBrand]: "EntityId";
};

export interface SimulationBounds {
  readonly width: number;
  readonly height: number;
}

export interface SimulationScenario {
  readonly seed: number;
  readonly entityCount: number;
  readonly bounds: SimulationBounds;
  readonly minSpeedUnitsPerTick: number;
  readonly maxSpeedUnitsPerTick: number;
}

export interface WorldState {
  readonly entityCount: number;
  readonly bounds: SimulationBounds;
  readonly ids: Uint32Array;
  readonly positionsX: Int32Array;
  readonly positionsY: Int32Array;
  readonly velocitiesX: Int32Array;
  readonly velocitiesY: Int32Array;
}

export interface InitialSimulationSnapshot {
  readonly kind: "initial";
  readonly tick: number;
  readonly entityCount: number;
  readonly bounds: SimulationBounds;
  readonly ids: Uint32Array;
  readonly positions: Int32Array;
}

export interface PositionSimulationSnapshot {
  readonly kind: "positions";
  readonly tick: number;
  readonly entityCount: number;
  readonly positions: Int32Array;
}

export type SimulationSnapshot =
  | InitialSimulationSnapshot
  | PositionSimulationSnapshot;

export interface SimulationState {
  tick: number;
  rngState: number;
  readonly world: WorldState;
}

export function entityIdFromIndex(index: number): EntityId {
  if (!Number.isSafeInteger(index) || index < 0 || index > 0xffff_ffff) {
    throw new RangeError("Entity IDs must be unsigned 32-bit integers.");
  }

  return index as EntityId;
}
