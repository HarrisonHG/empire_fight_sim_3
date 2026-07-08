export type UnitId = number;
export type FactionId = number;

export interface UnitIdentityConfig {
  readonly entityCount: number;
  readonly units: readonly UnitIdentityDefinition[];
}

export interface UnitIdentityDefinition {
  readonly unitId: UnitId;
  readonly factionId: FactionId;
  readonly memberEntityIds: readonly number[];
}

export interface UnitIdentityStore {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly unassignedEntitiesAllowed: false;
}

interface UnitRecord {
  readonly unitId: UnitId;
  readonly factionId: FactionId;
  readonly memberEntityIds: readonly number[];
}

interface InternalUnitIdentityStore extends UnitIdentityStore {
  readonly unitIds: readonly UnitId[];
  readonly entityUnitIds: readonly UnitId[];
  readonly unitsById: ReadonlyMap<UnitId, UnitRecord>;
}

export function createUnitIdentityStore(
  config: UnitIdentityConfig,
): UnitIdentityStore {
  assertPositiveInteger(config.entityCount, "entityCount");

  if (config.units.length === 0) {
    throw new RangeError("At least one unit must be defined.");
  }

  const entityUnitIds = new Array<UnitId>(config.entityCount).fill(-1);
  const mutableRecords: UnitRecord[] = [];
  const seenUnitIds = new Set<UnitId>();

  for (let index = 0; index < config.units.length; index += 1) {
    const definition = config.units[index]!;
    validateUnitDefinition(definition);

    if (seenUnitIds.has(definition.unitId)) {
      throw new RangeError("Unit IDs must be unique.");
    }
    seenUnitIds.add(definition.unitId);

    const memberEntityIds = copySortedMembers(definition.memberEntityIds);
    if (memberEntityIds.length === 0) {
      throw new RangeError("Units must contain at least one entity.");
    }

    for (let memberIndex = 0; memberIndex < memberEntityIds.length; memberIndex += 1) {
      const entityId = memberEntityIds[memberIndex]!;
      assertValidEntityId(entityId, config.entityCount);

      if (memberIndex > 0 && entityId === memberEntityIds[memberIndex - 1]) {
        throw new RangeError("An entity must not appear twice in one unit.");
      }

      if (entityUnitIds[entityId] !== -1) {
        throw new RangeError("An entity must not belong to more than one unit.");
      }

      entityUnitIds[entityId] = definition.unitId;
    }

    mutableRecords.push(
      Object.freeze({
        unitId: definition.unitId,
        factionId: definition.factionId,
        memberEntityIds: Object.freeze(memberEntityIds),
      }),
    );
  }

  for (let entityId = 0; entityId < entityUnitIds.length; entityId += 1) {
    if (entityUnitIds[entityId] === -1) {
      throw new RangeError(
        "Unassigned entities are not allowed in unit identity data.",
      );
    }
  }

  mutableRecords.sort((left, right) => left.unitId - right.unitId);

  const unitIds = Object.freeze(
    mutableRecords.map((record) => record.unitId),
  );
  const unitsById = new Map<UnitId, UnitRecord>();

  for (let index = 0; index < mutableRecords.length; index += 1) {
    const record = mutableRecords[index]!;
    unitsById.set(record.unitId, record);
  }

  const store: InternalUnitIdentityStore = {
    entityCount: config.entityCount,
    unitCount: mutableRecords.length,
    unassignedEntitiesAllowed: false,
    unitIds,
    entityUnitIds: Object.freeze(entityUnitIds.slice()),
    unitsById,
  };

  return Object.freeze(store);
}

export function getUnitIdForEntity(
  store: UnitIdentityStore,
  entityId: number,
): UnitId {
  const internalStore = asInternalStore(store);
  assertValidEntityId(entityId, internalStore.entityCount);

  return internalStore.entityUnitIds[entityId]!;
}

export function getFactionIdForUnit(
  store: UnitIdentityStore,
  unitId: UnitId,
): FactionId {
  return getUnitRecord(store, unitId).factionId;
}

export function getUnitMembers(
  store: UnitIdentityStore,
  unitId: UnitId,
): readonly number[] {
  return getUnitRecord(store, unitId).memberEntityIds;
}

export function getUnitIds(store: UnitIdentityStore): readonly UnitId[] {
  return asInternalStore(store).unitIds;
}

function getUnitRecord(
  store: UnitIdentityStore,
  unitId: UnitId,
): UnitRecord {
  assertValidIdentity(unitId, "unitId");

  const record = asInternalStore(store).unitsById.get(unitId);
  if (record === undefined) {
    throw new RangeError("Unknown unit ID.");
  }

  return record;
}

function validateUnitDefinition(definition: UnitIdentityDefinition): void {
  assertValidIdentity(definition.unitId, "unitId");
  assertValidIdentity(definition.factionId, "factionId");
}

function copySortedMembers(memberEntityIds: readonly number[]): number[] {
  const members = memberEntityIds.slice();

  for (let index = 0; index < members.length; index += 1) {
    assertSafeInteger(members[index]!, "memberEntityId");
  }

  members.sort((left, right) => left - right);
  return members;
}

function assertValidEntityId(entityId: number, entityCount: number): void {
  assertSafeInteger(entityId, "entityId");

  if (entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Entity ID must be within the configured entity count.");
  }
}

function assertValidIdentity(value: number, name: string): void {
  assertSafeInteger(value, name);

  if (value < 0) {
    throw new RangeError(`${name} must be non-negative.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer.`);
  }
}

function asInternalStore(store: UnitIdentityStore): InternalUnitIdentityStore {
  return store as InternalUnitIdentityStore;
}

