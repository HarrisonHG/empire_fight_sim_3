import {
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
import type { IndividualPhysicalGait } from "./individualEnergyActivity";

export interface IndividualEnergyCapabilityStore {
  readonly entityCount: number;
}

export interface IndividualEnergyCapabilityInspection {
  readonly projectionTick: number | null;
  readonly sourceEnergy: number;
  readonly sourceEnergyBand: IndividualEnergyBand;
  readonly maximumOrdinaryGait: IndividualPhysicalGait;
  readonly maximumRoutingGait: IndividualPhysicalGait;
  readonly canInitiateOrdinarySprintOrCharge: boolean;
  readonly minimumSafeWalkAvailable: boolean;
}

interface InternalIndividualEnergyCapabilityStore
  extends IndividualEnergyCapabilityStore {
  readonly sourceEnergyByEntity: Uint32Array;
  readonly sourceBandByEntity: Uint8Array;
  readonly ordinaryMaximumGaitByEntity: Uint8Array;
  readonly routingMaximumGaitByEntity: Uint8Array;
  readonly canInitiateSprintByEntity: Uint8Array;
  readonly minimumSafeWalkByEntity: Uint8Array;
  projectionTick: number | null;
}

const BANDS: readonly IndividualEnergyBand[] = Object.freeze([
  "fresh", "working", "winded", "spent",
]);
const GAITS: readonly IndividualPhysicalGait[] = Object.freeze([
  "stationary", "walking", "jogging", "sprinting",
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
    canInitiateSprintByEntity: new Uint8Array(entityCount),
    minimumSafeWalkByEntity: new Uint8Array(entityCount),
    projectionTick: null,
  });
  populateCapabilities(store, energy, lifecycle, presence);
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

  populateCapabilities(store, energy, lifecycle, presence);
  internal.projectionTick = tick;
  return store;
}

function populateCapabilities(
  store: IndividualEnergyCapabilityStore,
  energy: IndividualEnergyStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
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
    internal.sourceEnergyByEntity[entityId] = currentEnergy;
    internal.sourceBandByEntity[entityId] = BANDS.indexOf(band);
    internal.ordinaryMaximumGaitByEntity[entityId] = GAITS.indexOf(maximumGait);
    internal.routingMaximumGaitByEntity[entityId] = GAITS.indexOf(maximumGait);
    internal.canInitiateSprintByEntity[entityId] =
      mobile && (band === "fresh" || band === "working") ? 1 : 0;
    internal.minimumSafeWalkByEntity[entityId] = mobile ? 1 : 0;
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
      GAITS[internal.ordinaryMaximumGaitByEntity[entityId]!]!,
    maximumRoutingGait:
      GAITS[internal.routingMaximumGaitByEntity[entityId]!]!,
    canInitiateOrdinarySprintOrCharge:
      internal.canInitiateSprintByEntity[entityId] !== 0,
    minimumSafeWalkAvailable:
      internal.minimumSafeWalkByEntity[entityId] !== 0,
  };
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
