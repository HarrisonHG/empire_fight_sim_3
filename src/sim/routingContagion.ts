import {
  applyUnitCohesionLoss,
  getIndividualConfidence,
  getIndividualPressure,
  getUnitAnchor,
  getUnitCohesion,
  setIndividualPressure,
  type RoutingPassThroughInteraction,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import {
  ROUTING_PASS_THROUGH_PROXIMITY_DISTANCE,
  type UnitMoraleMovementStateSource,
} from "./moraleMovement";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryEntitiesWithinRadiusInto,
  type SpatialGrid,
} from "./spatialGrid";
import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import type { WorldState } from "./types";
import {
  isIndividualCharacterActive,
  type IndividualCasualtyLifecycleStore,
} from "./individualCasualtyLifecycle";
import {
  isIndividualOrdinaryParticipationEligible,
  type IndividualOrdinaryParticipationSnapshot,
} from "./individualOrdinaryParticipation";

/** All 4F values are integer, bounded, and resolved once per target per tick. */
export const ROUTING_CONTAGION_CONSTANTS = {
  localRadius: 96,
  passThroughDistance: ROUTING_PASS_THROUGH_PROXIMITY_DISTANCE,
  nearbyPressurePerMember: 6,
  passThroughPressurePerMember: 18,
  passThroughCohesionLoss: 8,
  pressureCapPerMember: 32,
  cohesionLossCap: 12,
  highConfidenceThreshold: 750,
  highCohesionThreshold: 700,
  maxPressureResistance: 3,
  maxCohesionResistance: 2,
} as const;

export interface UnitRoutingContagionSummary {
  readonly unitId: UnitId;
  readonly nearbyRouterUnitIds: readonly UnitId[];
  readonly passThroughRouterUnitIds: readonly UnitId[];
  readonly pressureAppliedPerMember: number;
  readonly cohesionLossApplied: number;
  readonly pressureCapPerMember: number;
  readonly cohesionLossCap: number;
  readonly pressureCapReached: boolean;
  readonly cohesionLossCapReached: boolean;
}

export interface RoutingContagionStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export interface RoutingContagionTickResult {
  readonly summaries: readonly UnitRoutingContagionSummary[];
}

interface InternalRoutingContagionStore extends RoutingContagionStore {
  readonly unitIndexById: ReadonlyMap<UnitId, number>;
  grid: SpatialGrid | undefined;
  readonly scratchNearbyEntityIds: number[];
  readonly scratchCandidateUnitIds: UnitId[];
  readonly cohesionAtTickStart: Int32Array;
  readonly pressureAppliedPerMember: Int32Array;
  readonly cohesionLossApplied: Int32Array;
  readonly nearbyRouterUnitIds: UnitId[][];
  readonly passThroughRouterUnitIds: UnitId[][];
}

export function createRoutingContagionStore(
  identityStore: UnitIdentityStore,
): RoutingContagionStore {
  const unitIds = getUnitIds(identityStore);
  return {
    entityCount: identityStore.entityCount,
    unitCount: identityStore.unitCount,
    unitIndexById: new Map(
      unitIds.map((unitId, unitIndex) => [unitId, unitIndex]),
    ),
    grid: undefined,
    scratchNearbyEntityIds: [],
    scratchCandidateUnitIds: [],
    cohesionAtTickStart: new Int32Array(unitIds.length),
    pressureAppliedPerMember: new Int32Array(unitIds.length),
    cohesionLossApplied: new Int32Array(unitIds.length),
    nearbyRouterUnitIds: Array.from({ length: unitIds.length }, () => []),
    passThroughRouterUnitIds: Array.from({ length: unitIds.length }, () => []),
  } as InternalRoutingContagionStore;
}

/**
 * Resolves 4F contagion after movement and combat pressure, but before the
 * morale assessment used by persistent arbitration. Only the supplied
 * tick-start routing-state projection can act as a router this tick.
 */
export function advanceRoutingContagionOneTick(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  tickStartMoraleStates: UnitMoraleMovementStateSource,
  routingPassThroughInteractions: readonly RoutingPassThroughInteraction[],
  store: RoutingContagionStore,
  out: UnitRoutingContagionSummary[] = [],
  lifecycleStore?: IndividualCasualtyLifecycleStore,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): RoutingContagionTickResult {
  const internal = asInternal(store);
  validateStores(world, identityStore, formationStore, internal);
  const unitIds = getUnitIds(identityStore);
  const grid = prepareGrid(world, internal, lifecycleStore, ordinaryParticipation);
  resetTickScratch(formationStore, internal, unitIds);

  for (let routerIndex = 0; routerIndex < unitIds.length; routerIndex += 1) {
    const routerUnitId = unitIds[routerIndex]!;
    if (tickStartMoraleStates.get(routerUnitId) !== "routing") {
      continue;
    }
    if (!hasActiveMember(identityStore, routerUnitId, lifecycleStore, ordinaryParticipation)) continue;
    collectRouterContributions(
      identityStore,
      formationStore,
      internal,
      grid,
      routerUnitId,
      routingPassThroughInteractions,
      lifecycleStore,
      ordinaryParticipation,
    );
  }

  out.length = 0;
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const appliedCohesionLoss = applyUnitEffects(
      identityStore,
      formationStore,
      internal,
      unitId,
      unitIndex,
      lifecycleStore,
      ordinaryParticipation,
    );
    out.push({
      unitId,
      nearbyRouterUnitIds: internal.nearbyRouterUnitIds[unitIndex]!.slice(),
      passThroughRouterUnitIds:
        internal.passThroughRouterUnitIds[unitIndex]!.slice(),
      pressureAppliedPerMember: internal.pressureAppliedPerMember[unitIndex]!,
      cohesionLossApplied: appliedCohesionLoss,
      pressureCapPerMember: ROUTING_CONTAGION_CONSTANTS.pressureCapPerMember,
      cohesionLossCap: ROUTING_CONTAGION_CONSTANTS.cohesionLossCap,
      pressureCapReached:
        internal.pressureAppliedPerMember[unitIndex]! >=
        ROUTING_CONTAGION_CONSTANTS.pressureCapPerMember,
      cohesionLossCapReached:
        internal.cohesionLossApplied[unitIndex]! >=
        ROUTING_CONTAGION_CONSTANTS.cohesionLossCap,
    });
  }

  return { summaries: out };
}

function collectRouterContributions(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: InternalRoutingContagionStore,
  grid: SpatialGrid,
  routerUnitId: UnitId,
  routingPassThroughInteractions: readonly RoutingPassThroughInteraction[],
  lifecycleStore?: IndividualCasualtyLifecycleStore,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): void {
  const routerAnchor = getUnitAnchor(formationStore, routerUnitId);
  const nearbyEntityIds = queryEntitiesWithinRadiusInto(
    grid,
    routerAnchor.x,
    routerAnchor.y,
    ROUTING_CONTAGION_CONSTANTS.localRadius,
    store.scratchNearbyEntityIds,
  );
  const candidateUnitIds = collectDistinctCandidateUnitIds(
    identityStore,
    routerUnitId,
    nearbyEntityIds,
    store.scratchCandidateUnitIds,
  );
  const routerFactionId = getFactionIdForUnit(identityStore, routerUnitId);

  for (let candidateIndex = 0; candidateIndex < candidateUnitIds.length; candidateIndex += 1) {
    const targetUnitId = candidateUnitIds[candidateIndex]!;
    if (getFactionIdForUnit(identityStore, targetUnitId) !== routerFactionId) {
      continue;
    }
    if (!hasActiveMember(identityStore, targetUnitId, lifecycleStore, ordinaryParticipation)) continue;
    const targetAnchor = getUnitAnchor(formationStore, targetUnitId);
    if (
      !isWithinDistance(
        routerAnchor.x,
        routerAnchor.y,
        targetAnchor.x,
        targetAnchor.y,
        ROUTING_CONTAGION_CONSTANTS.localRadius,
      )
    ) {
      continue;
    }

    const targetUnitIndex = requireUnitIndex(store, targetUnitId);
    const passThrough = hasRoutingPassThroughInteraction(
      routingPassThroughInteractions,
      routerUnitId,
      targetUnitId,
    );
    applyPairContribution(
      identityStore,
      formationStore,
      store,
      routerUnitId,
      targetUnitId,
      targetUnitIndex,
      passThrough,
      lifecycleStore,
      ordinaryParticipation,
    );
  }
}

function applyPairContribution(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: InternalRoutingContagionStore,
  routerUnitId: UnitId,
  targetUnitId: UnitId,
  targetUnitIndex: number,
  passThrough: boolean,
  lifecycleStore?: IndividualCasualtyLifecycleStore,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): void {
  const targetMembers = getUnitMembers(identityStore, targetUnitId);
  const resistance = calculateResistance(
    formationStore,
    targetMembers,
    store.cohesionAtTickStart[targetUnitIndex]!,
    lifecycleStore,
    ordinaryParticipation,
  );
  const requestedPressure = reduceButKeepPositive(
    passThrough
      ? ROUTING_CONTAGION_CONSTANTS.passThroughPressurePerMember
      : ROUTING_CONTAGION_CONSTANTS.nearbyPressurePerMember,
    resistance.pressure,
  );
  const requestedCohesionLoss = passThrough
    ? reduceButKeepPositive(
        ROUTING_CONTAGION_CONSTANTS.passThroughCohesionLoss,
        resistance.cohesion,
      )
    : 0;
  const pressureRemaining =
    ROUTING_CONTAGION_CONSTANTS.pressureCapPerMember -
    store.pressureAppliedPerMember[targetUnitIndex]!;
  const cohesionRemaining =
    ROUTING_CONTAGION_CONSTANTS.cohesionLossCap -
    store.cohesionLossApplied[targetUnitIndex]!;
  const pressureApplied = Math.min(requestedPressure, Math.max(0, pressureRemaining));
  const cohesionApplied = Math.min(
    requestedCohesionLoss,
    Math.max(0, cohesionRemaining),
  );

  store.pressureAppliedPerMember[targetUnitIndex] =
    store.pressureAppliedPerMember[targetUnitIndex]! + pressureApplied;
  store.cohesionLossApplied[targetUnitIndex] =
    store.cohesionLossApplied[targetUnitIndex]! + cohesionApplied;
  if (passThrough) {
    store.passThroughRouterUnitIds[targetUnitIndex]!.push(routerUnitId);
  } else {
    store.nearbyRouterUnitIds[targetUnitIndex]!.push(routerUnitId);
  }
}

function applyUnitEffects(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: InternalRoutingContagionStore,
  unitId: UnitId,
  unitIndex: number,
  lifecycleStore?: IndividualCasualtyLifecycleStore,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): number {
  const pressureApplied = store.pressureAppliedPerMember[unitIndex]!;
  const members = getUnitMembers(identityStore, unitId);
  if (pressureApplied > 0) {
    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      const entityId = members[memberIndex]!;
      if (
        !isIndividualOrdinaryParticipationEligible(ordinaryParticipation, entityId) ||
        (lifecycleStore !== undefined &&
          !isIndividualCharacterActive(lifecycleStore, entityId))
      ) continue;
      setIndividualPressure(
        formationStore,
        entityId,
        getIndividualPressure(formationStore, entityId) + pressureApplied,
      );
    }
  }
  return applyUnitCohesionLoss(
    formationStore,
    unitId,
    store.cohesionLossApplied[unitIndex]!,
  );
}

function calculateResistance(
  formationStore: FormationBehaviourStore,
  targetMembers: readonly number[],
  cohesionAtTickStart: number,
  lifecycleStore?: IndividualCasualtyLifecycleStore,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): { readonly pressure: number; readonly cohesion: number } {
  let confidenceTotal = 0;
  let activeCount = 0;
  for (let memberIndex = 0; memberIndex < targetMembers.length; memberIndex += 1) {
    if (
      !isIndividualOrdinaryParticipationEligible(
        ordinaryParticipation,
        targetMembers[memberIndex]!,
      ) ||
      (lifecycleStore !== undefined &&
        !isIndividualCharacterActive(lifecycleStore, targetMembers[memberIndex]!))
    ) continue;
    confidenceTotal += getIndividualConfidence(
      formationStore,
      targetMembers[memberIndex]!,
    );
    activeCount += 1;
  }
  const confidenceAverage = activeCount === 0 ? 0 : Math.trunc(confidenceTotal / activeCount);
  const highConfidence =
    confidenceAverage >= ROUTING_CONTAGION_CONSTANTS.highConfidenceThreshold;
  const highCohesion =
    cohesionAtTickStart >= ROUTING_CONTAGION_CONSTANTS.highCohesionThreshold;
  const pressure = Math.min(
    ROUTING_CONTAGION_CONSTANTS.maxPressureResistance,
    (highConfidence ? 2 : 0) + (highCohesion ? 1 : 0),
  );
  const cohesion = Math.min(
    ROUTING_CONTAGION_CONSTANTS.maxCohesionResistance,
    (highConfidence ? 1 : 0) + (highCohesion ? 1 : 0),
  );
  return { pressure, cohesion };
}

function hasRoutingPassThroughInteraction(
  interactions: readonly RoutingPassThroughInteraction[],
  routerUnitId: UnitId,
  targetUnitId: UnitId,
): boolean {
  for (let index = 0; index < interactions.length; index += 1) {
    const interaction = interactions[index]!;
    if (
      interaction.routerUnitId === routerUnitId &&
      interaction.targetUnitId === targetUnitId
    ) {
      return true;
    }
  }
  return false;
}

function collectDistinctCandidateUnitIds(
  identityStore: UnitIdentityStore,
  routerUnitId: UnitId,
  entityIds: readonly number[],
  out: UnitId[],
): UnitId[] {
  out.length = 0;
  for (let entityIndex = 0; entityIndex < entityIds.length; entityIndex += 1) {
    const candidateUnitId = getUnitIdForEntity(
      identityStore,
      entityIds[entityIndex]!,
    );
    if (candidateUnitId === routerUnitId) continue;
    let known = false;
    for (let outIndex = 0; outIndex < out.length; outIndex += 1) {
      if (out[outIndex] === candidateUnitId) {
        known = true;
        break;
      }
    }
    if (!known) out.push(candidateUnitId);
  }
  return out;
}

function isWithinDistance(
  leftX: number,
  leftY: number,
  rightX: number,
  rightY: number,
  distance: number,
): boolean {
  const deltaX = leftX - rightX;
  const deltaY = leftY - rightY;
  return deltaX * deltaX + deltaY * deltaY <= distance * distance;
}

function prepareGrid(
  world: WorldState,
  store: InternalRoutingContagionStore,
  lifecycleStore?: IndividualCasualtyLifecycleStore,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): SpatialGrid {
  let grid = store.grid;
  if (
    grid === undefined ||
    grid.bounds.width !== world.bounds.width ||
    grid.bounds.height !== world.bounds.height ||
    grid.capacity < world.entityCount
  ) {
    grid = createSpatialGrid({
      bounds: world.bounds,
      cellSize: ROUTING_CONTAGION_CONSTANTS.localRadius,
      capacity: world.entityCount,
    });
    store.grid = grid;
  }
  buildSpatialGrid(grid, world, (entityId) =>
    (lifecycleStore === undefined ||
      isIndividualCharacterActive(lifecycleStore, entityId)) &&
    isIndividualOrdinaryParticipationEligible(ordinaryParticipation, entityId),
  );
  return grid;
}

function hasActiveMember(
  identityStore: UnitIdentityStore,
  unitId: UnitId,
  lifecycleStore?: IndividualCasualtyLifecycleStore,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): boolean {
  const members = getUnitMembers(identityStore, unitId);
  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    if (
      (lifecycleStore === undefined ||
        isIndividualCharacterActive(lifecycleStore, entityId)) &&
      isIndividualOrdinaryParticipationEligible(ordinaryParticipation, entityId)
    ) return true;
  }
  return false;
}

function resetTickScratch(
  formationStore: FormationBehaviourStore,
  store: InternalRoutingContagionStore,
  unitIds: readonly UnitId[],
): void {
  store.pressureAppliedPerMember.fill(0);
  store.cohesionLossApplied.fill(0);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    store.cohesionAtTickStart[unitIndex] = getUnitCohesion(
      formationStore,
      unitId,
    );
    store.nearbyRouterUnitIds[unitIndex]!.length = 0;
    store.passThroughRouterUnitIds[unitIndex]!.length = 0;
  }
}

function reduceButKeepPositive(value: number, resistance: number): number {
  return value > resistance ? value - resistance : 1;
}

function requireUnitIndex(
  store: InternalRoutingContagionStore,
  unitId: UnitId,
): number {
  const unitIndex = store.unitIndexById.get(unitId);
  if (unitIndex === undefined) {
    throw new RangeError("Unknown unit ID for routing contagion.");
  }
  return unitIndex;
}

function asInternal(
  store: RoutingContagionStore,
): InternalRoutingContagionStore {
  return store as InternalRoutingContagionStore;
}

function validateStores(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: InternalRoutingContagionStore,
): void {
  if (
    world.entityCount !== identityStore.entityCount ||
    world.entityCount !== formationStore.entityCount ||
    world.entityCount !== store.entityCount ||
    identityStore.unitCount !== formationStore.unitCount ||
    identityStore.unitCount !== store.unitCount
  ) {
    throw new RangeError("Routing contagion stores must match world and identity.");
  }
}
