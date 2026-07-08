import {
  getFactionIdForUnit,
  getUnitIds,
  getUnitMembers,
  type FactionId,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import type { WorldState } from "./types";

export interface UnitSummary {
  readonly unitId: UnitId;
  readonly factionId: FactionId;
  readonly memberCount: number;
  readonly centreX: number;
  readonly centreY: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly extentX: number;
  readonly extentY: number;
}

export function createUnitSummaries(
  world: WorldState,
  identityStore: UnitIdentityStore,
): UnitSummary[] {
  return createUnitSummariesInto(world, identityStore, []);
}

export function createUnitSummariesInto(
  world: WorldState,
  identityStore: UnitIdentityStore,
  out: UnitSummary[],
): UnitSummary[] {
  validateWorldForSummaries(world, identityStore);
  out.length = 0;

  const unitIds = getUnitIds(identityStore);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const memberEntityIds = getUnitMembers(identityStore, unitId);
    out.push(createUnitSummary(world, identityStore, unitId, memberEntityIds));
  }

  return out;
}

export function getUnitSummaryById(
  summaries: readonly UnitSummary[],
  unitId: UnitId,
): UnitSummary | undefined {
  for (let index = 0; index < summaries.length; index += 1) {
    const summary = summaries[index]!;
    if (summary.unitId === unitId) {
      return summary;
    }
  }

  return undefined;
}

function createUnitSummary(
  world: WorldState,
  identityStore: UnitIdentityStore,
  unitId: UnitId,
  memberEntityIds: readonly number[],
): UnitSummary {
  let minX = Number.MAX_SAFE_INTEGER;
  let minY = Number.MAX_SAFE_INTEGER;
  let maxX = Number.MIN_SAFE_INTEGER;
  let maxY = Number.MIN_SAFE_INTEGER;
  let sumX = 0;
  let sumY = 0;

  for (let memberIndex = 0; memberIndex < memberEntityIds.length; memberIndex += 1) {
    const entityId = memberEntityIds[memberIndex]!;
    const positionX = world.positionsX[entityId]!;
    const positionY = world.positionsY[entityId]!;

    sumX += positionX;
    sumY += positionY;
    minX = Math.min(minX, positionX);
    minY = Math.min(minY, positionY);
    maxX = Math.max(maxX, positionX);
    maxY = Math.max(maxY, positionY);
  }

  // Unit centres are integer arithmetic means rounded toward zero.
  const centreX = Math.trunc(sumX / memberEntityIds.length);
  const centreY = Math.trunc(sumY / memberEntityIds.length);

  // Extents are axis-aligned integer distances from the derived centre to bounds.
  const extentX = Math.max(centreX - minX, maxX - centreX);
  const extentY = Math.max(centreY - minY, maxY - centreY);

  return {
    unitId,
    factionId: getFactionIdForUnit(identityStore, unitId),
    memberCount: memberEntityIds.length,
    centreX,
    centreY,
    minX,
    minY,
    maxX,
    maxY,
    extentX,
    extentY,
  };
}

function validateWorldForSummaries(
  world: WorldState,
  identityStore: UnitIdentityStore,
): void {
  if (world.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "World entity count must match unit identity entity count.",
    );
  }

  if (
    world.positionsX.length < world.entityCount ||
    world.positionsY.length < world.entityCount
  ) {
    throw new RangeError(
      "World position arrays must cover the world entity count.",
    );
  }
}

