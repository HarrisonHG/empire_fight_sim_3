import {
  getIndividualRespawnEgressStartedTick,
  hasIndividualRespawnDestination,
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  type IndividualCasualtyLifecycleStore,
  type IndividualPlayerPresenceStore,
} from "./individualCasualtyLifecycle";
import {
  getIndividualCurrentEnergy,
  getIndividualEnergyBand,
  type IndividualEnergyBand,
  type IndividualEnergyStore,
} from "./individualEnergy";
import {
  INDIVIDUAL_PHYSICAL_GAITS,
  type IndividualPhysicalGait,
} from "./individualPhysicalGait";

export interface IndividualEnergyCapabilityStore {
  readonly entityCount: number;
}

export interface IndividualEnergyCapabilityInspection {
  readonly projectionTick: number | null;
  readonly sourceEnergy: number;
  readonly sourceEnergyBand: IndividualEnergyBand;
  readonly maximumOrdinaryGait: IndividualPhysicalGait;
  readonly maximumRoutingGait: IndividualPhysicalGait;
  readonly maximumActiveSpecialistGait: IndividualPhysicalGait;
  readonly maximumRespawnEgressGait: IndividualPhysicalGait;
  readonly canInitiateOrdinarySprintOrCharge: boolean;
  readonly minimumSafeWalkAvailable: boolean;
  readonly minimumActiveSpecialistWalkAvailable: boolean;
  readonly respawnEgressProcedureWalkAvailable: boolean;
}

interface InternalIndividualEnergyCapabilityStore
  extends IndividualEnergyCapabilityStore {
  readonly sourceEnergyByEntity: Uint32Array;
  readonly sourceBandByEntity: Uint8Array;
  readonly ordinaryMaximumGaitByEntity: Uint8Array;
  readonly routingMaximumGaitByEntity: Uint8Array;
  readonly activeSpecialistMaximumGaitByEntity: Uint8Array;
  readonly respawnEgressMaximumGaitByEntity: Uint8Array;
  readonly canInitiateSprintByEntity: Uint8Array;
  readonly minimumSafeWalkByEntity: Uint8Array;
  readonly minimumActiveSpecialistWalkByEntity: Uint8Array;
  readonly respawnEgressProcedureWalkByEntity: Uint8Array;
  projectionTick: number | null;
}

const BANDS: readonly IndividualEnergyBand[] = Object.freeze([
  "fresh", "working", "winded", "spent",
]);
const capabilityStoreInternals = new WeakMap<
  IndividualEnergyCapabilityStore,
  InternalIndividualEnergyCapabilityStore
>();

export function createIndividualEnergyCapabilityStore(
  entityCount: number,
  energy: IndividualEnergyStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
): IndividualEnergyCapabilityStore {
  if (!Number.isSafeInteger(entityCount) || entityCount < 0) {
    throw new RangeError(
      "Energy capability entityCount must be a non-negative safe integer.",
    );
  }
  const store = Object.freeze({ entityCount });
  capabilityStoreInternals.set(store, {
    entityCount,
    sourceEnergyByEntity: new Uint32Array(entityCount),
    sourceBandByEntity: new Uint8Array(entityCount),
    ordinaryMaximumGaitByEntity: new Uint8Array(entityCount),
    routingMaximumGaitByEntity: new Uint8Array(entityCount),
    activeSpecialistMaximumGaitByEntity: new Uint8Array(entityCount),
    respawnEgressMaximumGaitByEntity: new Uint8Array(entityCount),
    canInitiateSprintByEntity: new Uint8Array(entityCount),
    minimumSafeWalkByEntity: new Uint8Array(entityCount),
    minimumActiveSpecialistWalkByEntity: new Uint8Array(entityCount),
    respawnEgressProcedureWalkByEntity: new Uint8Array(entityCount),
    projectionTick: null,
  });
  populateCapabilities(store, energy, lifecycle, presence, null);
  return store;
}

export function projectIndividualEnergyCapabilitiesOneTick(
  store: IndividualEnergyCapabilityStore,
  energy: IndividualEnergyStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  tick: number,
): IndividualEnergyCapabilityStore {
  const internal = requireStore(store, energy.entityCount);
  if (lifecycle.entityCount !== internal.entityCount ||
      presence.entityCount !== internal.entityCount) {
    throw new RangeError("Energy capability dependencies must match entityCount.");
  }
  assertTick(tick);
  if (internal.projectionTick !== null && tick < internal.projectionTick) {
    throw new Error("Energy capability projection cannot move backwards.");
  }
  if (tick === internal.projectionTick) {
    throw new Error("Energy capability already projected for this tick.");
  }

  populateCapabilities(store, energy, lifecycle, presence, tick);
  internal.projectionTick = tick;
  return store;
}

function populateCapabilities(
  store: IndividualEnergyCapabilityStore,
  energy: IndividualEnergyStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  projectionTick: number | null,
): void {
  const internal = requireStore(store, energy.entityCount);
  if (lifecycle.entityCount !== internal.entityCount ||
      presence.entityCount !== internal.entityCount) {
    throw new RangeError("Energy capability dependencies must match entityCount.");
  }
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const currentEnergy = getIndividualCurrentEnergy(energy, entityId);
    const band = getIndividualEnergyBand(energy, entityId);
    const mobile = getIndividualCharacterLifecycleState(lifecycle, entityId) ===
        "active" &&
      getIndividualPlayerPresenceState(presence, entityId) === "activePresence";
    const maximumGait = mobile ? maximumGaitForBand(band) : "stationary";
    const presenceState = getIndividualPlayerPresenceState(presence, entityId);
    const respawnEgressWalkAvailable =
      projectionTick !== null &&
      getIndividualCharacterLifecycleState(lifecycle, entityId) === "terminal" &&
      presenceState === "respawnEgress" &&
      hasIndividualRespawnDestination(presence, entityId) &&
      projectionTick > getIndividualRespawnEgressStartedTick(presence, entityId);
    internal.sourceEnergyByEntity[entityId] = currentEnergy;
    internal.sourceBandByEntity[entityId] = BANDS.indexOf(band);
    internal.ordinaryMaximumGaitByEntity[entityId] =
      INDIVIDUAL_PHYSICAL_GAITS.indexOf(maximumGait);
    internal.routingMaximumGaitByEntity[entityId] =
      INDIVIDUAL_PHYSICAL_GAITS.indexOf(maximumGait);
    internal.activeSpecialistMaximumGaitByEntity[entityId] =
      INDIVIDUAL_PHYSICAL_GAITS.indexOf(maximumGait);
    internal.respawnEgressMaximumGaitByEntity[entityId] =
      INDIVIDUAL_PHYSICAL_GAITS.indexOf(
        respawnEgressWalkAvailable ? "walking" : "stationary",
      );
    internal.canInitiateSprintByEntity[entityId] =
      mobile && (band === "fresh" || band === "working") ? 1 : 0;
    internal.minimumSafeWalkByEntity[entityId] = mobile ? 1 : 0;
    internal.minimumActiveSpecialistWalkByEntity[entityId] = mobile ? 1 : 0;
    internal.respawnEgressProcedureWalkByEntity[entityId] =
      respawnEgressWalkAvailable ? 1 : 0;
  }
}

export function assertIndividualEnergyCapabilityProjectionTick(
  store: IndividualEnergyCapabilityStore,
  tick: number,
): void {
  const internal = requireStore(store);
  assertTick(tick);
  if (internal.projectionTick !== tick) {
    throw new Error(
      `Energy capability projection is stale: expected tick ${tick}, ` +
      `received ${internal.projectionTick}.`,
    );
  }
}

export function getIndividualEnergyCapabilityInspection(
  store: IndividualEnergyCapabilityStore,
  entityId: number,
): IndividualEnergyCapabilityInspection {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return {
    projectionTick: internal.projectionTick,
    sourceEnergy: internal.sourceEnergyByEntity[entityId]!,
    sourceEnergyBand: BANDS[internal.sourceBandByEntity[entityId]!]!,
    maximumOrdinaryGait:
      INDIVIDUAL_PHYSICAL_GAITS[internal.ordinaryMaximumGaitByEntity[entityId]!]!,
    maximumRoutingGait:
      INDIVIDUAL_PHYSICAL_GAITS[internal.routingMaximumGaitByEntity[entityId]!]!,
    maximumActiveSpecialistGait:
      INDIVIDUAL_PHYSICAL_GAITS[
        internal.activeSpecialistMaximumGaitByEntity[entityId]!
      ]!,
    maximumRespawnEgressGait:
      INDIVIDUAL_PHYSICAL_GAITS[
        internal.respawnEgressMaximumGaitByEntity[entityId]!
      ]!,
    canInitiateOrdinarySprintOrCharge:
      internal.canInitiateSprintByEntity[entityId] !== 0,
    minimumSafeWalkAvailable:
      internal.minimumSafeWalkByEntity[entityId] !== 0,
    minimumActiveSpecialistWalkAvailable:
      internal.minimumActiveSpecialistWalkByEntity[entityId] !== 0,
    respawnEgressProcedureWalkAvailable:
      internal.respawnEgressProcedureWalkByEntity[entityId] !== 0,
  };
}

export function getIndividualEnergyCapabilityProjectionTick(
  store: IndividualEnergyCapabilityStore,
): number | null {
  return requireStore(store).projectionTick;
}

export function getIndividualMaximumOrdinaryGait(
  store: IndividualEnergyCapabilityStore,
  entityId: number,
): IndividualPhysicalGait {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return INDIVIDUAL_PHYSICAL_GAITS[
    internal.ordinaryMaximumGaitByEntity[entityId]!
  ]!;
}

export function getIndividualMaximumRoutingGait(
  store: IndividualEnergyCapabilityStore,
  entityId: number,
): IndividualPhysicalGait {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return INDIVIDUAL_PHYSICAL_GAITS[
    internal.routingMaximumGaitByEntity[entityId]!
  ]!;
}

export function getIndividualMaximumActiveSpecialistGait(
  store: IndividualEnergyCapabilityStore,
  entityId: number,
): IndividualPhysicalGait {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return INDIVIDUAL_PHYSICAL_GAITS[
    internal.activeSpecialistMaximumGaitByEntity[entityId]!
  ]!;
}

export function getIndividualMaximumRespawnEgressGait(
  store: IndividualEnergyCapabilityStore,
  entityId: number,
): IndividualPhysicalGait {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return INDIVIDUAL_PHYSICAL_GAITS[
    internal.respawnEgressMaximumGaitByEntity[entityId]!
  ]!;
}

export function getIndividualMinimumSafeWalkAvailable(
  store: IndividualEnergyCapabilityStore,
  entityId: number,
): boolean {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.minimumSafeWalkByEntity[entityId] !== 0;
}

function maximumGaitForBand(
  band: IndividualEnergyBand,
): IndividualPhysicalGait {
  switch (band) {
    case "fresh":
    case "working": return "sprinting";
    case "winded": return "jogging";
    case "spent": return "walking";
  }
}

function requireStore(
  store: IndividualEnergyCapabilityStore,
  entityCount = store.entityCount,
): InternalIndividualEnergyCapabilityStore {
  if (store.entityCount !== entityCount) {
    throw new RangeError("Energy capability store must match entityCount.");
  }
  const internal = capabilityStoreInternals.get(store);
  if (internal === undefined) {
    throw new TypeError("Unknown individual energy capability store.");
  }
  return internal;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError(`Invalid energy capability entity ID ${entityId}.`);
  }
}

function assertTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError(
      "Energy capability tick must be a non-negative safe integer.",
    );
  }
}
