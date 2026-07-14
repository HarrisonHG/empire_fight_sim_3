import { getUnitHeading, type FormationBehaviourStore } from "./formationBehaviour";
import {
  getIndividualCombatProfile,
  type IndividualCombatProfile,
  type IndividualCombatProfileStore,
} from "./individualCombatProfile";
import {
  isIndividualCombatEligible,
  type IndividualCombatEligibilitySnapshot,
} from "./individualCombatEligibility";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryEntitiesWithinRadiusInto,
  type SpatialGrid,
} from "./spatialGrid";
import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  type UnitIdentityStore,
} from "./unitIdentity";
import type { SimulationBounds, WorldState } from "./types";

export const NO_INDIVIDUAL_TARGET = -1;

/** Named conversion from profile-relative reach to world-space distances. */
export const INDIVIDUAL_MELEE_DISTANCE = Object.freeze({
  dagger: Object.freeze({ threat: 8, preferredMinimum: 0 }),
  oneHanded: Object.freeze({ threat: 12, preferredMinimum: 4 }),
  greatWeapon: Object.freeze({ threat: 16, preferredMinimum: 8 }),
  polearmOrStaff: Object.freeze({ threat: 20, preferredMinimum: 12 }),
  pike: Object.freeze({ threat: 24, preferredMinimum: 16 }),
});

export type IndividualTargetSelectionReason =
  | "previousTargetContinued"
  | "preferredDistance"
  | "mutualThreat"
  | "nearestValidHostile"
  | "entityIdTieBreak"
  | "noValidTarget";

export interface IndividualSelectedTargetRecord {
  readonly sourceEntityId: number;
  readonly targetEntityId: number;
  readonly distanceSquared: number;
  readonly sourceThreatDistance: number;
  readonly sourcePreferredMinimumDistance: number;
  readonly targetThreatDistance: number;
  readonly sourceCanThreatTarget: boolean;
  readonly targetCanThreatSource: boolean;
  readonly withinPreferredDistance: boolean;
  readonly facingEligible: boolean;
  readonly selectionReason: IndividualTargetSelectionReason;
}

export interface IndividualMeleeTargetSelectionStore {
  readonly entityCount: number;
}

export interface IndividualMeleeTargetSelectionStoreConfig {
  readonly entityCount: number;
  readonly bounds: SimulationBounds;
}

export interface IndividualMeleeTargetSelectionTickResult {
  readonly records: readonly IndividualSelectedTargetRecord[];
  readonly queryCount: number;
  readonly activeTargetCount: number;
}

export type IndividualTargetCandidateQuery = (
  grid: SpatialGrid,
  x: number,
  y: number,
  radius: number,
  out: number[],
) => number[];

interface InternalIndividualMeleeTargetSelectionStore
  extends IndividualMeleeTargetSelectionStore {
  readonly selectedTargetByEntity: Int32Array;
  readonly grid: SpatialGrid;
  readonly queryScratch: number[];
}

const TARGET_GRID_CELL_SIZE = 32;

export function createIndividualMeleeTargetSelectionStore(
  config: IndividualMeleeTargetSelectionStoreConfig,
): IndividualMeleeTargetSelectionStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  const selectedTargetByEntity = new Int32Array(config.entityCount);
  selectedTargetByEntity.fill(NO_INDIVIDUAL_TARGET);
  return {
    entityCount: config.entityCount,
    selectedTargetByEntity,
    grid: createSpatialGrid({
      bounds: config.bounds,
      cellSize: TARGET_GRID_CELL_SIZE,
      capacity: config.entityCount,
    }),
    queryScratch: [],
  } as InternalIndividualMeleeTargetSelectionStore;
}

export function getSelectedTargetEntityId(
  store: IndividualMeleeTargetSelectionStore,
  sourceEntityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(sourceEntityId, internal.entityCount);
  return internal.selectedTargetByEntity[sourceEntityId]!;
}

export function advanceIndividualMeleeTargetSelection(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  profileStore: IndividualCombatProfileStore,
  store: IndividualMeleeTargetSelectionStore,
  out: IndividualSelectedTargetRecord[] = [],
  candidateQuery: IndividualTargetCandidateQuery =
    queryEntitiesWithinRadiusInto,
  eligibility?: IndividualCombatEligibilitySnapshot,
): IndividualMeleeTargetSelectionTickResult {
  validateStores(world, identityStore, formationStore, profileStore, store);
  if (
    eligibility !== undefined &&
    eligibility.entityCount !== world.entityCount
  ) {
    throw new RangeError(
      "Individual melee targeting eligibility must match world entity count.",
    );
  }
  const internal = asInternal(store);
  buildSpatialGrid(internal.grid, world);
  out.length = 0;
  let queryCount = 0;
  let activeTargetCount = 0;

  for (let sourceEntityId = 0; sourceEntityId < world.entityCount; sourceEntityId += 1) {
    const sourceProfile = getIndividualCombatProfile(profileStore, sourceEntityId);
    const sourceDistances = getActiveMeleeDistances(sourceProfile);
    if (sourceDistances.threat === 0) {
      internal.selectedTargetByEntity[sourceEntityId] = NO_INDIVIDUAL_TARGET;
      continue;
    }
    if (!isIndividualCombatEligible(eligibility, sourceEntityId)) {
      internal.selectedTargetByEntity[sourceEntityId] = NO_INDIVIDUAL_TARGET;
      out.push(noTargetRecord(sourceEntityId, sourceDistances));
      continue;
    }

    queryCount += 1;
    const sourceX = world.positionsX[sourceEntityId]!;
    const sourceY = world.positionsY[sourceEntityId]!;
    const sourceUnitId = getUnitIdForEntity(identityStore, sourceEntityId);
    const sourceFactionId = getFactionIdForUnit(identityStore, sourceUnitId);
    const sourceHeading = getUnitHeading(formationStore, sourceUnitId);
    const candidateIds = candidateQuery(
      internal.grid,
      sourceX,
      sourceY,
      sourceDistances.threat,
      internal.queryScratch,
    );
    const previousTarget = internal.selectedTargetByEntity[sourceEntityId]!;
    let continuedEntityId = NO_INDIVIDUAL_TARGET;
    let continuedDistanceSquared = -1;
    let continuedTargetThreatDistance = 0;
    let continuedTargetCanThreat = false;
    let continuedWithinPreferred = false;
    let bestEntityId = NO_INDIVIDUAL_TARGET;
    let bestDistanceSquared = -1;
    let bestTargetThreatDistance = 0;
    let bestTargetCanThreat = false;
    let bestWithinPreferred = false;
    let sawNonPreferred = false;
    let sawNonMutual = false;
    let selectedByEntityIdTie = false;

    for (let index = 0; index < candidateIds.length; index += 1) {
      const targetEntityId = candidateIds[index]!;
      if (targetEntityId === sourceEntityId) continue;
      if (!isIndividualCombatEligible(eligibility, targetEntityId)) continue;
      const targetUnitId = getUnitIdForEntity(identityStore, targetEntityId);
      if (getFactionIdForUnit(identityStore, targetUnitId) === sourceFactionId) {
        continue;
      }
      const deltaX = world.positionsX[targetEntityId]! - sourceX;
      const deltaY = world.positionsY[targetEntityId]! - sourceY;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      const facingEligible =
        deltaX * sourceHeading.x + deltaY * sourceHeading.y > 0;
      if (
        !facingEligible ||
        distanceSquared > sourceDistances.threat * sourceDistances.threat
      ) {
        continue;
      }

      const targetProfile = getIndividualCombatProfile(profileStore, targetEntityId);
      const targetDistances = getActiveMeleeDistances(targetProfile);
      const targetHeading = getUnitHeading(formationStore, targetUnitId);
      const targetFacingSource =
        -deltaX * targetHeading.x + -deltaY * targetHeading.y > 0;
      const targetCanThreatSource =
        targetDistances.threat > 0 &&
        targetFacingSource &&
        distanceSquared <= targetDistances.threat * targetDistances.threat;
      const withinPreferredDistance =
        distanceSquared >=
        sourceDistances.preferredMinimum * sourceDistances.preferredMinimum;
      if (targetEntityId === previousTarget) {
        continuedEntityId = targetEntityId;
        continuedDistanceSquared = distanceSquared;
        continuedTargetThreatDistance = targetDistances.threat;
        continuedTargetCanThreat = targetCanThreatSource;
        continuedWithinPreferred = withinPreferredDistance;
      }
      if (!withinPreferredDistance) sawNonPreferred = true;
      if (!targetCanThreatSource) sawNonMutual = true;
      if (bestEntityId === NO_INDIVIDUAL_TARGET) {
        bestEntityId = targetEntityId;
        bestDistanceSquared = distanceSquared;
        bestTargetThreatDistance = targetDistances.threat;
        bestTargetCanThreat = targetCanThreatSource;
        bestWithinPreferred = withinPreferredDistance;
        selectedByEntityIdTie = false;
      } else {
        const samePriority = candidatesTieBeforeEntityId(
          withinPreferredDistance,
          targetCanThreatSource,
          distanceSquared,
          bestWithinPreferred,
          bestTargetCanThreat,
          bestDistanceSquared,
        );
        if (
          compareCandidates(
            targetEntityId,
            withinPreferredDistance,
            targetCanThreatSource,
            distanceSquared,
            bestEntityId,
            bestWithinPreferred,
            bestTargetCanThreat,
            bestDistanceSquared,
          ) < 0
        ) {
          bestEntityId = targetEntityId;
          bestDistanceSquared = distanceSquared;
          bestTargetThreatDistance = targetDistances.threat;
          bestTargetCanThreat = targetCanThreatSource;
          bestWithinPreferred = withinPreferredDistance;
          selectedByEntityIdTie = samePriority;
        } else if (samePriority) {
          selectedByEntityIdTie = true;
        }
      }
    }

    const continued = continuedEntityId !== NO_INDIVIDUAL_TARGET;
    const targetEntityId = continued ? continuedEntityId : bestEntityId;
    const selected = targetEntityId !== NO_INDIVIDUAL_TARGET;
    const selectedDistanceSquared = continued
      ? continuedDistanceSquared
      : bestDistanceSquared;
    const selectedTargetThreatDistance = continued
      ? continuedTargetThreatDistance
      : bestTargetThreatDistance;
    const selectedTargetCanThreat = continued
      ? continuedTargetCanThreat
      : bestTargetCanThreat;
    const selectedWithinPreferred = continued
      ? continuedWithinPreferred
      : bestWithinPreferred;
    internal.selectedTargetByEntity[sourceEntityId] = targetEntityId;
    if (selected) activeTargetCount += 1;
    out.push(
      !selected
        ? noTargetRecord(sourceEntityId, sourceDistances)
        : {
            sourceEntityId,
            targetEntityId,
            distanceSquared: selectedDistanceSquared,
            sourceThreatDistance: sourceDistances.threat,
            sourcePreferredMinimumDistance:
              sourceDistances.preferredMinimum,
            targetThreatDistance: selectedTargetThreatDistance,
            sourceCanThreatTarget: true,
            targetCanThreatSource: selectedTargetCanThreat,
            withinPreferredDistance: selectedWithinPreferred,
            facingEligible: true,
            selectionReason:
              continued
                ? "previousTargetContinued"
                : determineSelectionReason(
                    selectedWithinPreferred,
                    selectedTargetCanThreat,
                    sawNonPreferred,
                    sawNonMutual,
                    selectedByEntityIdTie,
                  ),
          },
    );
  }

  return { records: out, queryCount, activeTargetCount };
}

export function getActiveMeleeDistances(profile: IndividualCombatProfile): {
  readonly threat: number;
  readonly preferredMinimum: number;
} {
  if (
    profile.primaryWeapon === "unarmed" ||
    !profile.supportedAttackModes.includes("melee")
  ) {
    return { threat: 0, preferredMinimum: 0 };
  }
  switch (profile.reach) {
    case 1:
      return INDIVIDUAL_MELEE_DISTANCE.dagger;
    case 2:
      return INDIVIDUAL_MELEE_DISTANCE.oneHanded;
    case 3:
      return INDIVIDUAL_MELEE_DISTANCE.greatWeapon;
    case 4:
      return INDIVIDUAL_MELEE_DISTANCE.polearmOrStaff;
    case 5:
      return INDIVIDUAL_MELEE_DISTANCE.pike;
    default:
      return { threat: 0, preferredMinimum: 0 };
  }
}

function compareCandidates(
  leftEntityId: number,
  leftWithinPreferred: boolean,
  leftCanThreat: boolean,
  leftDistanceSquared: number,
  rightEntityId: number,
  rightWithinPreferred: boolean,
  rightCanThreat: boolean,
  rightDistanceSquared: number,
): number {
  if (leftWithinPreferred !== rightWithinPreferred) {
    return leftWithinPreferred ? -1 : 1;
  }
  if (leftCanThreat !== rightCanThreat) {
    return leftCanThreat ? -1 : 1;
  }
  if (leftDistanceSquared !== rightDistanceSquared) {
    return leftDistanceSquared - rightDistanceSquared;
  }
  return leftEntityId - rightEntityId;
}

function candidatesTieBeforeEntityId(
  leftWithinPreferred: boolean,
  leftCanThreat: boolean,
  leftDistanceSquared: number,
  rightWithinPreferred: boolean,
  rightCanThreat: boolean,
  rightDistanceSquared: number,
): boolean {
  return (
    leftWithinPreferred === rightWithinPreferred &&
    leftCanThreat === rightCanThreat &&
    leftDistanceSquared === rightDistanceSquared
  );
}

function determineSelectionReason(
  selectedWithinPreferred: boolean,
  selectedCanThreat: boolean,
  sawNonPreferred: boolean,
  sawNonMutual: boolean,
  selectedByEntityIdTie: boolean,
): IndividualTargetSelectionReason {
  if (selectedWithinPreferred && sawNonPreferred) {
    return "preferredDistance";
  }
  if (selectedCanThreat && sawNonMutual) {
    return "mutualThreat";
  }
  return selectedByEntityIdTie ? "entityIdTieBreak" : "nearestValidHostile";
}

function noTargetRecord(
  sourceEntityId: number,
  distances: { readonly threat: number; readonly preferredMinimum: number },
): IndividualSelectedTargetRecord {
  return {
    sourceEntityId,
    targetEntityId: NO_INDIVIDUAL_TARGET,
    distanceSquared: -1,
    sourceThreatDistance: distances.threat,
    sourcePreferredMinimumDistance: distances.preferredMinimum,
    targetThreatDistance: 0,
    sourceCanThreatTarget: false,
    targetCanThreatSource: false,
    withinPreferredDistance: false,
    facingEligible: false,
    selectionReason: "noValidTarget",
  };
}

function validateStores(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  profileStore: IndividualCombatProfileStore,
  store: IndividualMeleeTargetSelectionStore,
): void {
  const entityCount = world.entityCount;
  if (
    identityStore.entityCount !== entityCount ||
    formationStore.entityCount !== entityCount ||
    profileStore.entityCount !== entityCount ||
    store.entityCount !== entityCount
  ) {
    throw new RangeError(
      "Individual melee targeting stores must match world entity count.",
    );
  }
}

function asInternal(
  store: IndividualMeleeTargetSelectionStore,
): InternalIndividualMeleeTargetSelectionStore {
  return store as InternalIndividualMeleeTargetSelectionStore;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Target-selection entity ID is out of bounds.");
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
