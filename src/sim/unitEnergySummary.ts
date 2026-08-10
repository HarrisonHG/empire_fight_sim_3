import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  type IndividualCasualtyLifecycleStore,
  type IndividualPlayerPresenceStore,
} from "./individualCasualtyLifecycle";
import {
  ENERGY_RATIO_FIXED_POINT_SCALE,
  getIndividualCurrentEnergy,
  getIndividualEnergyBand,
  getIndividualMaximumEnergy,
  type IndividualEnergyStore,
} from "./individualEnergy";
import {
  getIndividualEnergyActivityApplicationTick,
  getIndividualEnergyExpenditureApplied,
  getIndividualEnergyRecoveryApplied,
  type IndividualEnergyActivityStore,
} from "./individualEnergyActivity";
import {
  assertIndividualEnergyCapabilityProjectionTick,
  getIndividualCanInitiateOrdinarySprintOrCharge,
  getIndividualMaximumOrdinaryGait,
  getIndividualMinimumActiveSpecialistWalkAvailable,
  type IndividualEnergyCapabilityStore,
} from "./individualEnergyCapability";
import { physicalGaitRank } from "./individualPhysicalGait";
import {
  isIndividualOrdinaryParticipationEligible,
  type IndividualOrdinaryParticipationSnapshot,
} from "./individualOrdinaryParticipation";
import {
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";

export interface UnitEnergySummaryStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export interface UnitEnergySummary {
  readonly unitId: UnitId;
  readonly memberCount: number;
  collectionTick: number | null;
  activeMemberCount: number;
  totalCurrentEnergy: number;
  averageCurrentEnergy: number | null;
  minimumCurrentEnergy: number | null;
  averageEnergyRatioFixedPoint: number | null;
  minimumEnergyRatioFixedPoint: number | null;
  freshMemberCount: number;
  workingMemberCount: number;
  windedMemberCount: number;
  spentMemberCount: number;
  jogCapableMemberCount: number;
  sprintOrChargeCapableMemberCount: number;
  dragCapableHelperCount: number;
  jogCapableFractionFixedPoint: number | null;
  sprintOrChargeCapableFractionFixedPoint: number | null;
  energySpentThisTick: number;
  energyRecoveredThisTick: number;
}

interface InternalUnitEnergySummaryStore extends UnitEnergySummaryStore {
  readonly summaries: UnitEnergySummary[];
  readonly summaryByUnitId: ReadonlyMap<UnitId, UnitEnergySummary>;
}

const internals = new WeakMap<
  UnitEnergySummaryStore,
  InternalUnitEnergySummaryStore
>();

export function createUnitEnergySummaryStore(
  identity: UnitIdentityStore,
): UnitEnergySummaryStore {
  const summaries: UnitEnergySummary[] = [];
  const summaryByUnitId = new Map<UnitId, UnitEnergySummary>();
  const unitIds = getUnitIds(identity);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const summary = createEmptySummary(
      unitId,
      getUnitMembers(identity, unitId).length,
    );
    summaries.push(summary);
    summaryByUnitId.set(unitId, summary);
  }
  const store = Object.freeze({
    entityCount: identity.entityCount,
    unitCount: identity.unitCount,
  });
  internals.set(store, {
    ...store,
    summaries,
    summaryByUnitId,
  });
  return store;
}

export function collectUnitEnergySummariesOneTick(
  store: UnitEnergySummaryStore,
  identity: UnitIdentityStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  energy: IndividualEnergyStore,
  capabilities: IndividualEnergyCapabilityStore,
  activity: IndividualEnergyActivityStore,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot,
  tick: number,
): readonly UnitEnergySummary[] {
  const internal = requireStore(store);
  validateDependencies(
    internal,
    identity,
    lifecycle,
    presence,
    energy,
    capabilities,
    activity,
    ordinaryParticipation,
    tick,
  );

  const unitIds = getUnitIds(identity);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const summary = internal.summaries[unitIndex]!;
    resetSummary(summary, tick);
    const members = getUnitMembers(identity, unitId);
    let totalRatio = 0;

    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      const entityId = members[memberIndex]!;
      if (
        getIndividualCharacterLifecycleState(lifecycle, entityId) !== "active" ||
        getIndividualPlayerPresenceState(presence, entityId) !== "activePresence"
      ) {
        continue;
      }
      const current = getIndividualCurrentEnergy(energy, entityId);
      const maximum = getIndividualMaximumEnergy(energy, entityId);
      const ratio = Math.floor(
        current * ENERGY_RATIO_FIXED_POINT_SCALE / maximum,
      );
      summary.activeMemberCount += 1;
      summary.totalCurrentEnergy += current;
      totalRatio += ratio;
      summary.minimumCurrentEnergy = summary.minimumCurrentEnergy === null
        ? current
        : Math.min(summary.minimumCurrentEnergy, current);
      summary.minimumEnergyRatioFixedPoint =
        summary.minimumEnergyRatioFixedPoint === null
          ? ratio
          : Math.min(summary.minimumEnergyRatioFixedPoint, ratio);
      incrementBandCount(summary, getIndividualEnergyBand(energy, entityId));
      if (
        physicalGaitRank(getIndividualMaximumOrdinaryGait(capabilities, entityId)) >=
          physicalGaitRank("jogging")
      ) {
        summary.jogCapableMemberCount += 1;
      }
      if (
        getIndividualCanInitiateOrdinarySprintOrCharge(capabilities, entityId)
      ) {
        summary.sprintOrChargeCapableMemberCount += 1;
      }
      if (
        getIndividualMinimumActiveSpecialistWalkAvailable(
          capabilities,
          entityId,
        ) && isIndividualOrdinaryParticipationEligible(
          ordinaryParticipation,
          entityId,
        )
      ) {
        summary.dragCapableHelperCount += 1;
      }
      summary.energySpentThisTick += getIndividualEnergyExpenditureApplied(
        activity,
        entityId,
      );
      summary.energyRecoveredThisTick += getIndividualEnergyRecoveryApplied(
        activity,
        entityId,
      );
    }

    if (summary.activeMemberCount > 0) {
      summary.averageCurrentEnergy = Math.floor(
        summary.totalCurrentEnergy / summary.activeMemberCount,
      );
      summary.averageEnergyRatioFixedPoint = Math.floor(
        totalRatio / summary.activeMemberCount,
      );
      summary.jogCapableFractionFixedPoint = Math.floor(
        summary.jogCapableMemberCount * ENERGY_RATIO_FIXED_POINT_SCALE /
          summary.activeMemberCount,
      );
      summary.sprintOrChargeCapableFractionFixedPoint = Math.floor(
        summary.sprintOrChargeCapableMemberCount *
          ENERGY_RATIO_FIXED_POINT_SCALE / summary.activeMemberCount,
      );
    }
  }
  return internal.summaries;
}

export function getUnitEnergySummaries(
  store: UnitEnergySummaryStore,
): readonly UnitEnergySummary[] {
  return requireStore(store).summaries;
}

export function getUnitEnergySummary(
  store: UnitEnergySummaryStore,
  unitId: UnitId,
): UnitEnergySummary {
  const summary = requireStore(store).summaryByUnitId.get(unitId);
  if (summary === undefined) {
    throw new RangeError(`Unknown unit ID ${unitId} for energy summary.`);
  }
  return summary;
}

function validateDependencies(
  store: InternalUnitEnergySummaryStore,
  identity: UnitIdentityStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  energy: IndividualEnergyStore,
  capabilities: IndividualEnergyCapabilityStore,
  activity: IndividualEnergyActivityStore,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot,
  tick: number,
): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError("Unit energy summary tick must be non-negative.");
  }
  if (
    identity.entityCount !== store.entityCount ||
    identity.unitCount !== store.unitCount ||
    lifecycle.entityCount !== store.entityCount ||
    presence.entityCount !== store.entityCount ||
    energy.entityCount !== store.entityCount ||
    capabilities.entityCount !== store.entityCount ||
    activity.entityCount !== store.entityCount ||
    ordinaryParticipation.entityCount !== store.entityCount
  ) {
    throw new RangeError("Unit energy summary dependencies must match store counts.");
  }
  assertIndividualEnergyCapabilityProjectionTick(capabilities, tick);
  if (getIndividualEnergyActivityApplicationTick(activity) !== tick) {
    throw new Error("Unit energy summaries require current-tick energy application.");
  }
}

function createEmptySummary(unitId: UnitId, memberCount: number): UnitEnergySummary {
  return {
    unitId,
    memberCount,
    collectionTick: null,
    activeMemberCount: 0,
    totalCurrentEnergy: 0,
    averageCurrentEnergy: null,
    minimumCurrentEnergy: null,
    averageEnergyRatioFixedPoint: null,
    minimumEnergyRatioFixedPoint: null,
    freshMemberCount: 0,
    workingMemberCount: 0,
    windedMemberCount: 0,
    spentMemberCount: 0,
    jogCapableMemberCount: 0,
    sprintOrChargeCapableMemberCount: 0,
    dragCapableHelperCount: 0,
    jogCapableFractionFixedPoint: null,
    sprintOrChargeCapableFractionFixedPoint: null,
    energySpentThisTick: 0,
    energyRecoveredThisTick: 0,
  };
}

function resetSummary(summary: UnitEnergySummary, tick: number): void {
  summary.collectionTick = tick;
  summary.activeMemberCount = 0;
  summary.totalCurrentEnergy = 0;
  summary.averageCurrentEnergy = null;
  summary.minimumCurrentEnergy = null;
  summary.averageEnergyRatioFixedPoint = null;
  summary.minimumEnergyRatioFixedPoint = null;
  summary.freshMemberCount = 0;
  summary.workingMemberCount = 0;
  summary.windedMemberCount = 0;
  summary.spentMemberCount = 0;
  summary.jogCapableMemberCount = 0;
  summary.sprintOrChargeCapableMemberCount = 0;
  summary.dragCapableHelperCount = 0;
  summary.jogCapableFractionFixedPoint = null;
  summary.sprintOrChargeCapableFractionFixedPoint = null;
  summary.energySpentThisTick = 0;
  summary.energyRecoveredThisTick = 0;
}

function incrementBandCount(
  summary: UnitEnergySummary,
  band: "fresh" | "working" | "winded" | "spent",
): void {
  if (band === "fresh") summary.freshMemberCount += 1;
  else if (band === "working") summary.workingMemberCount += 1;
  else if (band === "winded") summary.windedMemberCount += 1;
  else summary.spentMemberCount += 1;
}

function requireStore(
  store: UnitEnergySummaryStore,
): InternalUnitEnergySummaryStore {
  const internal = internals.get(store);
  if (internal === undefined) {
    throw new TypeError("Unknown unit energy summary store.");
  }
  return internal;
}
