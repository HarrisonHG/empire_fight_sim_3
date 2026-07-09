import type { WorldState } from "./types";
import {
  getFactionIdForUnit,
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import {
  getUnitWeaponReachBand,
  type UnitLoadoutStore,
  type WeaponReachBand,
} from "./unitLoadout";

export type UnitThreatRelationship = "allied" | "hostile";

export interface UnitThreatSummary {
  readonly unitId: UnitId;
  readonly weaponReachBand: WeaponReachBand;
  readonly threatRange: number;
  readonly contactDistance: number;
}

export interface UnitThreatContact {
  readonly sourceUnitId: UnitId;
  readonly targetUnitId: UnitId;
  readonly relationship: UnitThreatRelationship;
  readonly distance: number;
  readonly forwardDistance: number;
  readonly lateralDistance: number;
  readonly inFront: boolean;
  readonly inThreatRange: boolean;
  readonly inContactRange: boolean;
}

interface UnitCentre {
  readonly x: number;
  readonly y: number;
}

const THREAT_RANGE_BY_REACH_BAND: Readonly<Record<WeaponReachBand, number>> = {
  none: 0,
  close: 4,
  short: 8,
  medium: 12,
  long: 18,
  veryLong: 24,
  ranged: 80,
};

const CONTACT_DISTANCE_BY_REACH_BAND: Readonly<
  Record<WeaponReachBand, number>
> = {
  none: 1,
  close: 2,
  short: 4,
  medium: 6,
  long: 10,
  veryLong: 14,
  ranged: 24,
};

const DEFAULT_FORWARD_X = 1;
const DEFAULT_FORWARD_Y = 0;

export function getThreatRangeForReachBand(
  reachBand: WeaponReachBand,
): number {
  return THREAT_RANGE_BY_REACH_BAND[reachBand];
}

export function getContactDistanceForReachBand(
  reachBand: WeaponReachBand,
): number {
  return CONTACT_DISTANCE_BY_REACH_BAND[reachBand];
}

export function getUnitThreatSummary(
  loadoutStore: UnitLoadoutStore,
  unitId: UnitId,
): UnitThreatSummary {
  const weaponReachBand = getUnitWeaponReachBand(loadoutStore, unitId);
  return {
    unitId,
    weaponReachBand,
    threatRange: getThreatRangeForReachBand(weaponReachBand),
    contactDistance: getContactDistanceForReachBand(weaponReachBand),
  };
}

export function computeUnitThreatContact(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  sourceUnitId: UnitId,
  targetUnitId: UnitId,
): UnitThreatContact {
  validateThreatGeometryInputs(world, identityStore, loadoutStore);

  const sourceSummary = getUnitThreatSummary(loadoutStore, sourceUnitId);
  const sourceFactionId = getFactionIdForUnit(identityStore, sourceUnitId);
  const targetFactionId = getFactionIdForUnit(identityStore, targetUnitId);
  const sourceCentre = computeUnitCentre(world, identityStore, sourceUnitId);
  const targetCentre = computeUnitCentre(world, identityStore, targetUnitId);

  const deltaX = targetCentre.x - sourceCentre.x;
  const deltaY = targetCentre.y - sourceCentre.y;
  const forwardDistance =
    deltaX * DEFAULT_FORWARD_X + deltaY * DEFAULT_FORWARD_Y;
  const lateralProjection =
    deltaX * -DEFAULT_FORWARD_Y + deltaY * DEFAULT_FORWARD_X;
  const lateralDistance = Math.abs(lateralProjection);
  const distance = Math.hypot(deltaX, deltaY);
  const inFront = forwardDistance > 0;
  const relationship: UnitThreatRelationship =
    sourceFactionId === targetFactionId ? "allied" : "hostile";

  return {
    sourceUnitId,
    targetUnitId,
    relationship,
    distance,
    forwardDistance,
    lateralDistance,
    inFront,
    inThreatRange: inFront && distance <= sourceSummary.threatRange,
    inContactRange: inFront && distance <= sourceSummary.contactDistance,
  };
}

export function collectHostileThreatContacts(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  sourceUnitId: UnitId,
  out: UnitThreatContact[],
): UnitThreatContact[] {
  validateThreatGeometryInputs(world, identityStore, loadoutStore);
  const sourceFactionId = getFactionIdForUnit(identityStore, sourceUnitId);
  getUnitThreatSummary(loadoutStore, sourceUnitId);

  out.length = 0;
  const unitIds = getUnitIds(identityStore);
  for (let index = 0; index < unitIds.length; index += 1) {
    const targetUnitId = unitIds[index]!;
    if (targetUnitId === sourceUnitId) {
      continue;
    }
    if (getFactionIdForUnit(identityStore, targetUnitId) === sourceFactionId) {
      continue;
    }

    out.push(
      computeUnitThreatContact(
        world,
        identityStore,
        loadoutStore,
        sourceUnitId,
        targetUnitId,
      ),
    );
  }

  return out;
}

function computeUnitCentre(
  world: WorldState,
  identityStore: UnitIdentityStore,
  unitId: UnitId,
): UnitCentre {
  const members = getUnitMembers(identityStore, unitId);
  let sumX = 0;
  let sumY = 0;

  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    sumX += world.positionsX[entityId]!;
    sumY += world.positionsY[entityId]!;
  }

  return {
    x: Math.trunc(sumX / members.length),
    y: Math.trunc(sumY / members.length),
  };
}

function validateThreatGeometryInputs(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
): void {
  if (world.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "World entity count must match unit identity entity count.",
    );
  }
  if (loadoutStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Unit loadout entity count must match unit identity entity count.",
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
