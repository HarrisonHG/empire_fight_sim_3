export type CasualtyProcedureKind = "citizen" | "barbarian";

export type DeathCountPolicy =
  | { readonly kind: "normalFortitude" }
  | { readonly kind: "fixedTicks"; readonly durationTicks: number };

export interface IndividualCasualtyProcedureProfileConfig {
  readonly entityId: number;
  readonly procedureKind: CasualtyProcedureKind;
  readonly deathCountPolicy: DeathCountPolicy;
}

export interface IndividualCasualtyProcedureProfile {
  readonly entityId: number;
  readonly procedureKind: CasualtyProcedureKind;
  readonly deathCountPolicy: DeathCountPolicy;
}

export interface IndividualCasualtyProcedureProfileStore {
  readonly entityCount: number;
}

export interface IndividualCasualtyProcedureProfileStoreConfig {
  readonly entityCount: number;
  readonly profiles: readonly IndividualCasualtyProcedureProfileConfig[];
}

interface InternalIndividualCasualtyProcedureProfileStore
  extends IndividualCasualtyProcedureProfileStore {
  readonly profiles: readonly IndividualCasualtyProcedureProfile[];
}

export function createIndividualCasualtyProcedureProfileStore(
  config: IndividualCasualtyProcedureProfileStoreConfig,
): IndividualCasualtyProcedureProfileStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  if (config.profiles.length !== config.entityCount) {
    throw new RangeError(
      "Individual casualty procedure profiles must contain exactly one profile per entity.",
    );
  }

  const profiles = new Array<IndividualCasualtyProcedureProfile>(
    config.entityCount,
  );
  for (let index = 0; index < config.profiles.length; index += 1) {
    const profile = config.profiles[index]!;
    assertEntityId(profile.entityId, config.entityCount);
    if (profiles[profile.entityId] !== undefined) {
      throw new RangeError(
        "Duplicate individual casualty procedure profile entity ID.",
      );
    }
    assertProcedureKind(profile.procedureKind);
    const deathCountPolicy = normalizeDeathCountPolicy(
      profile.deathCountPolicy,
    );
    profiles[profile.entityId] = Object.freeze({
      entityId: profile.entityId,
      procedureKind: profile.procedureKind,
      deathCountPolicy,
    });
  }

  return Object.freeze({
    entityCount: config.entityCount,
    profiles: Object.freeze(profiles),
  }) as InternalIndividualCasualtyProcedureProfileStore;
}

export function getIndividualCasualtyProcedureProfile(
  store: IndividualCasualtyProcedureProfileStore,
  entityId: number,
): IndividualCasualtyProcedureProfile {
  const internal = store as InternalIndividualCasualtyProcedureProfileStore;
  assertEntityId(entityId, internal.entityCount);
  return internal.profiles[entityId]!;
}

function normalizeDeathCountPolicy(policy: DeathCountPolicy): DeathCountPolicy {
  if (policy === null || typeof policy !== "object") {
    throw new TypeError("Death-count policy must be an object.");
  }
  if (policy.kind === "normalFortitude") {
    return Object.freeze({ kind: "normalFortitude" });
  }
  if (policy.kind === "fixedTicks") {
    assertPositiveSafeInteger(policy.durationTicks, "durationTicks");
    return Object.freeze({
      kind: "fixedTicks",
      durationTicks: policy.durationTicks,
    });
  }
  throw new RangeError("Unknown death-count policy kind.");
}

function assertProcedureKind(value: unknown): asserts value is CasualtyProcedureKind {
  if (value !== "citizen" && value !== "barbarian") {
    throw new RangeError("Unknown casualty procedure kind.");
  }
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Casualty procedure profile entity ID is out of bounds.");
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
