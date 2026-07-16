export interface IndividualOrdinaryParticipationSnapshot {
  readonly entityCount: number;
}

interface InternalIndividualOrdinaryParticipationSnapshot
  extends IndividualOrdinaryParticipationSnapshot {
  readonly eligibleByEntity: Uint8Array;
}

export function createIndividualOrdinaryParticipationSnapshot(
  entityCount: number,
): IndividualOrdinaryParticipationSnapshot {
  if (!Number.isSafeInteger(entityCount) || entityCount <= 0) {
    throw new RangeError("entityCount must be a positive safe integer.");
  }
  const eligibleByEntity = new Uint8Array(entityCount);
  eligibleByEntity.fill(1);
  return { entityCount, eligibleByEntity } as InternalIndividualOrdinaryParticipationSnapshot;
}

export function setIndividualOrdinaryParticipationEligible(
  snapshot: IndividualOrdinaryParticipationSnapshot,
  entityId: number,
  eligible: boolean,
): void {
  const internal = snapshot as InternalIndividualOrdinaryParticipationSnapshot;
  assertEntityId(entityId, internal.entityCount);
  internal.eligibleByEntity[entityId] = eligible ? 1 : 0;
}

export function isIndividualOrdinaryParticipationEligible(
  snapshot: IndividualOrdinaryParticipationSnapshot | undefined,
  entityId: number,
): boolean {
  if (snapshot === undefined) return true;
  const internal = snapshot as InternalIndividualOrdinaryParticipationSnapshot;
  assertEntityId(entityId, internal.entityCount);
  return internal.eligibleByEntity[entityId] !== 0;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Ordinary-participation entity ID is out of bounds.");
  }
}
