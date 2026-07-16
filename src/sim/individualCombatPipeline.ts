import {
  advanceIndividualCombatActions,
  createIndividualCombatActionStore,
  type IndividualCombatActionStateEvent,
  type IndividualCombatActionStore,
  type IndividualCombatActionTickResult,
  type IndividualMeleeAttackAttemptRecord,
} from "./individualCombatAction";
import {
  collectIndividualCombatUnitSummaries,
  createIndividualCombatUnitAggregationStore,
  type IndividualCombatUnitAggregationStore,
  type IndividualCombatUnitSummary,
} from "./individualCombatAggregation";
import {
  createIndividualCombatConsequenceProjectionStore,
  projectIndividualCombatConsequences,
  type IndividualCombatConsequenceProjectionStore,
  type IndividualCombatUnitConsequenceSummary,
} from "./individualCombatConsequences";
import {
  createIndividualCombatEligibilitySnapshot,
  projectIndividualCombatEligibilityFromHits,
  type IndividualCombatEligibilitySnapshot,
  type IndividualCombatEligibilityProjectionResult,
} from "./individualCombatEligibility";
import {
  createIndividualCombatProfileStore,
  type IndividualArmourCategory,
  type IndividualCombatProfileConfig,
  type IndividualCombatProfileStore,
  type IndividualShieldCarriedState,
  type IndividualShieldCategory,
  type IndividualWeaponCategory,
} from "./individualCombatProfile";
import {
  applyIndividualLandedHits,
  createIndividualGlobalHitStore,
  type IndividualGlobalHitStore,
  type IndividualGlobalHitTickResult,
  type IndividualLandedHitApplicationRecord,
  type IndividualZeroHitEvent,
} from "./individualGlobalHits";
import {
  createIndividualLandedHitGateStore,
  filterIndividualLandedHitsThroughGate,
  type IndividualLandedHitGateDecisionRecord,
  type IndividualLandedHitGateStore,
  type IndividualLandedHitGateTickResult,
} from "./individualLandedHitGate";
import {
  createIndividualMeleeDefenceStore,
  resolveIndividualMeleeDefences,
  type IndividualGuardStateEvent,
  type IndividualMeleeDefenceRecord,
  type IndividualMeleeDefenceStore,
  type IndividualMeleeDefenceTickResult,
  type IndividualDefenceHandAvailabilitySource,
} from "./individualMeleeDefence";
import {
  advanceIndividualMeleeTargetSelection,
  createIndividualMeleeTargetSelectionStore,
  type IndividualMeleeTargetSelectionStore,
  type IndividualMeleeTargetSelectionTickResult,
  type IndividualSelectedTargetRecord,
} from "./individualMeleeTargetSelection";
import type { FormationBehaviourStore } from "./formationBehaviour";
import type { IndividualCasualtyLifecycleStore } from "./individualCasualtyLifecycle";
import type { IndividualOrdinaryParticipationSnapshot } from "./individualOrdinaryParticipation";
import type { WorldState } from "./types";
import {
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import {
  getUnitLoadoutSummary,
  type ArmourClass,
  type ShieldClass,
  type UnitLoadoutStore,
  type WeaponCategory,
} from "./unitLoadout";

export interface IndividualCombatPipelineStores {
  readonly profileStore: IndividualCombatProfileStore;
  readonly eligibilitySnapshot: IndividualCombatEligibilitySnapshot;
  readonly targetSelectionStore: IndividualMeleeTargetSelectionStore;
  readonly actionStore: IndividualCombatActionStore;
  readonly defenceStore: IndividualMeleeDefenceStore;
  readonly landedHitGateStore: IndividualLandedHitGateStore;
  readonly globalHitStore: IndividualGlobalHitStore;
  readonly unitAggregationStore: IndividualCombatUnitAggregationStore;
  readonly consequenceProjectionStore: IndividualCombatConsequenceProjectionStore;
}

export interface IndividualCombatPipelineBuffers {
  readonly selectedTargetRecords: IndividualSelectedTargetRecord[];
  readonly actionStateEvents: IndividualCombatActionStateEvent[];
  readonly attackAttempts: IndividualMeleeAttackAttemptRecord[];
  readonly guardStateEvents: IndividualGuardStateEvent[];
  readonly defenceRecords: IndividualMeleeDefenceRecord[];
  readonly gateDecisions: IndividualLandedHitGateDecisionRecord[];
  readonly acceptedLandedRecords: IndividualMeleeDefenceRecord[];
  readonly hitApplications: IndividualLandedHitApplicationRecord[];
  readonly zeroHitEvents: IndividualZeroHitEvent[];
}

export interface IndividualCombatPipelineStageResult {
  readonly eligibleMeleeSourceCount: number;
  readonly selectedTargetCount: number;
  readonly activeCommitmentCount: number;
  readonly attackAttemptCount: number;
  readonly invalidatedAttackCount: number;
  readonly parryCount: number;
  readonly bucklerBlockCount: number;
  readonly shieldBlockCount: number;
  readonly landedDefenceOutcomeCount: number;
  readonly gateAcceptedHitCount: number;
  readonly gateRejectedHitCount: number;
  readonly appliedHitLoss: number;
  readonly zeroHitTransitionCount: number;
  readonly activeGateRelationshipCount: number;
  readonly tickStartCombatEligibleMemberCount: number;
  readonly tickStartCombatIneligibleMemberCount: number;
  readonly endOfTickCombatEligibleMemberCount: number;
  readonly endOfTickZeroHitMemberCount: number;
  readonly newlyZeroHitMemberCount: number;
}

export interface IndividualCombatPipelineTickResult
  extends IndividualCombatPipelineStageResult {
  readonly selectedTargetRecords: readonly IndividualSelectedTargetRecord[];
  readonly actionStateEvents: readonly IndividualCombatActionStateEvent[];
  readonly attackAttempts: readonly IndividualMeleeAttackAttemptRecord[];
  readonly guardStateEvents: readonly IndividualGuardStateEvent[];
  readonly defenceRecords: readonly IndividualMeleeDefenceRecord[];
  readonly gateDecisions: readonly IndividualLandedHitGateDecisionRecord[];
  readonly acceptedLandedRecords: readonly IndividualMeleeDefenceRecord[];
  readonly hitApplications: readonly IndividualLandedHitApplicationRecord[];
  readonly zeroHitEvents: readonly IndividualZeroHitEvent[];
  readonly unitSummaries: readonly IndividualCombatUnitSummary[];
  readonly consequenceSummaries: readonly IndividualCombatUnitConsequenceSummary[];
}

export type IndividualCombatPipelineStage =
  | "eligibility"
  | "targetSelection"
  | "action"
  | "defence"
  | "gate"
  | "globalHits"
  | "aggregation"
  | "consequenceProjection";

export type IndividualCombatPipelineStageRunner = <T>(
  stage: IndividualCombatPipelineStage,
  run: () => T,
) => T;

export interface IndividualCombatPipelineAdvanceOptions {
  readonly runStage?: IndividualCombatPipelineStageRunner;
  readonly lifecycleStore?: IndividualCasualtyLifecycleStore;
  readonly ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot;
  readonly defenceHandAvailability?: IndividualDefenceHandAvailabilitySource;
}

export interface IndividualCombatExchangeTickResult {
  readonly eligibility: IndividualCombatEligibilityProjectionResult;
  readonly targeting: IndividualMeleeTargetSelectionTickResult;
  readonly actions: IndividualCombatActionTickResult;
  readonly defences: IndividualMeleeDefenceTickResult;
  readonly gate: IndividualLandedHitGateTickResult;
  readonly hits: IndividualGlobalHitTickResult;
}

export function createIndividualCombatPipelineStores(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  profileStore: IndividualCombatProfileStore,
  battleSeed = 0,
): IndividualCombatPipelineStores {
  return {
    profileStore,
    eligibilitySnapshot: createIndividualCombatEligibilitySnapshot({
      entityCount: world.entityCount,
    }),
    targetSelectionStore: createIndividualMeleeTargetSelectionStore({
      entityCount: world.entityCount,
      bounds: world.bounds,
    }),
    actionStore: createIndividualCombatActionStore(
      identityStore,
      formationStore,
      profileStore,
      { entityCount: world.entityCount },
    ),
    defenceStore: createIndividualMeleeDefenceStore({
      entityCount: world.entityCount,
      battleSeed,
    }),
    landedHitGateStore: createIndividualLandedHitGateStore({
      entityCount: world.entityCount,
    }),
    globalHitStore: createIndividualGlobalHitStore(profileStore, {
      entityCount: world.entityCount,
    }),
    unitAggregationStore:
      createIndividualCombatUnitAggregationStore(identityStore),
    consequenceProjectionStore:
      createIndividualCombatConsequenceProjectionStore(identityStore),
  };
}

export function createIndividualCombatPipelineBuffers(): IndividualCombatPipelineBuffers {
  return {
    selectedTargetRecords: [],
    actionStateEvents: [],
    attackAttempts: [],
    guardStateEvents: [],
    defenceRecords: [],
    gateDecisions: [],
    acceptedLandedRecords: [],
    hitApplications: [],
    zeroHitEvents: [],
  };
}

export function advanceIndividualCombatPipelineOneTick(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  stores: IndividualCombatPipelineStores,
  buffers: IndividualCombatPipelineBuffers,
  currentTick: number,
  options: IndividualCombatPipelineAdvanceOptions = {},
): IndividualCombatPipelineTickResult {
  const exchange = advanceIndividualCombatExchangeOneTick(
    world,
    identityStore,
    formationStore,
    stores,
    buffers,
    currentTick,
    options,
  );
  return completeIndividualCombatPipelineOneTick(
    identityStore,
    stores,
    exchange,
    options,
  );
}

/** Runs the accepted tick-start combat exchange through global-hit mutation. */
export function advanceIndividualCombatExchangeOneTick(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  stores: IndividualCombatPipelineStores,
  buffers: IndividualCombatPipelineBuffers,
  currentTick: number,
  options: IndividualCombatPipelineAdvanceOptions = {},
): IndividualCombatExchangeTickResult {
  const runStage = options.runStage ?? runStageDirectly;
  const eligibilityResult = runStage("eligibility", () =>
    projectIndividualCombatEligibilityFromHits(
      stores.globalHitStore,
      stores.eligibilitySnapshot,
      options.lifecycleStore,
      options.ordinaryParticipation,
    ),
  );
  const targetResult = runStage("targetSelection", () =>
    advanceIndividualMeleeTargetSelection(
      world,
      identityStore,
      formationStore,
      stores.profileStore,
      stores.targetSelectionStore,
      buffers.selectedTargetRecords,
      undefined,
      stores.eligibilitySnapshot,
    ),
  );
  const actionResult = runStage("action", () =>
    advanceIndividualCombatActions(
      world,
      identityStore,
      formationStore,
      stores.profileStore,
      targetResult.records,
      stores.actionStore,
      buffers.attackAttempts,
      buffers.actionStateEvents,
      stores.eligibilitySnapshot,
    ),
  );
  const defenceResult = runStage("defence", () =>
    resolveIndividualMeleeDefences(
      world,
      identityStore,
      formationStore,
      stores.actionStore,
      stores.profileStore,
      stores.defenceStore,
      actionResult.attackAttempts,
      buffers.defenceRecords,
      buffers.guardStateEvents,
      stores.eligibilitySnapshot,
      currentTick,
      options.defenceHandAvailability,
    ),
  );
  const gateResult = runStage("gate", () =>
    filterIndividualLandedHitsThroughGate(
      stores.landedHitGateStore,
      currentTick,
      defenceResult.records,
      buffers.gateDecisions,
      buffers.acceptedLandedRecords,
    ),
  );
  const hitResult = runStage("globalHits", () =>
    applyIndividualLandedHits(
      stores.globalHitStore,
      gateResult.acceptedRecords,
      buffers.hitApplications,
      buffers.zeroHitEvents,
    ),
  );

  return {
    eligibility: eligibilityResult,
    targeting: targetResult,
    actions: actionResult,
    defences: defenceResult,
    gate: gateResult,
    hits: hitResult,
  };
}

/** Projects final per-unit read models after post-hit lifecycle transitions. */
export function completeIndividualCombatPipelineOneTick(
  identityStore: UnitIdentityStore,
  stores: IndividualCombatPipelineStores,
  exchange: IndividualCombatExchangeTickResult,
  options: IndividualCombatPipelineAdvanceOptions = {},
): IndividualCombatPipelineTickResult {
  const runStage = options.runStage ?? runStageDirectly;
  const targetResult = exchange.targeting;
  const actionResult = exchange.actions;
  const defenceResult = exchange.defences;
  const gateResult = exchange.gate;
  const hitResult = exchange.hits;
  const eligibilityResult = exchange.eligibility;
  const aggregationResult = runStage("aggregation", () =>
    collectIndividualCombatUnitSummaries(
      identityStore,
      stores.eligibilitySnapshot,
      stores.globalHitStore,
      stores.actionStore,
      stores.defenceStore,
      targetResult.records,
      actionResult.attackAttempts,
      defenceResult.records,
      gateResult.decisions,
      hitResult.applications,
      hitResult.zeroHitEvents,
      stores.unitAggregationStore,
      options.lifecycleStore,
    ),
  );
  const consequenceProjectionResult = runStage("consequenceProjection", () =>
    projectIndividualCombatConsequences(
      identityStore,
      aggregationResult.summaries,
      targetResult.records,
      actionResult.attackAttempts,
      defenceResult.records,
      gateResult.decisions,
      hitResult.applications,
      hitResult.zeroHitEvents,
      stores.consequenceProjectionStore,
    ),
  );

  return {
    selectedTargetRecords: targetResult.records,
    actionStateEvents: actionResult.actionStateEvents,
    attackAttempts: actionResult.attackAttempts,
    guardStateEvents: defenceResult.guardStateEvents,
    defenceRecords: defenceResult.records,
    gateDecisions: gateResult.decisions,
    acceptedLandedRecords: gateResult.acceptedRecords,
    hitApplications: hitResult.applications,
    zeroHitEvents: hitResult.zeroHitEvents,
    unitSummaries: aggregationResult.summaries,
    consequenceSummaries: consequenceProjectionResult.summaries,
    eligibleMeleeSourceCount: targetResult.queryCount,
    selectedTargetCount: targetResult.activeTargetCount,
    activeCommitmentCount: actionResult.activeCommitmentCount,
    attackAttemptCount: actionResult.attackAttempts.length,
    invalidatedAttackCount: actionResult.invalidatedAttemptCount,
    parryCount: defenceResult.parryCount,
    bucklerBlockCount: defenceResult.bucklerBlockCount,
    shieldBlockCount: defenceResult.shieldBlockCount,
    landedDefenceOutcomeCount: defenceResult.landedCount,
    gateAcceptedHitCount: gateResult.acceptedCount,
    gateRejectedHitCount: gateResult.rejectedCount,
    appliedHitLoss: hitResult.totalAppliedHitLoss,
    zeroHitTransitionCount: hitResult.zeroHitEvents.length,
    activeGateRelationshipCount: gateResult.activeRelationshipCount,
    tickStartCombatEligibleMemberCount: eligibilityResult.eligibleCount,
    tickStartCombatIneligibleMemberCount: eligibilityResult.ineligibleCount,
    endOfTickCombatEligibleMemberCount: countEndOfTickEligibleMembers(
      aggregationResult.summaries,
    ),
    endOfTickZeroHitMemberCount: countEndOfTickZeroHitMembers(
      aggregationResult.summaries,
    ),
    newlyZeroHitMemberCount: hitResult.zeroHitEvents.length,
  };
}

function countEndOfTickEligibleMembers(
  summaries: readonly IndividualCombatUnitSummary[],
): number {
  let count = 0;
  for (let index = 0; index < summaries.length; index += 1) {
    count += summaries[index]!.endOfTickCombatEligibleMemberCount;
  }
  return count;
}

function countEndOfTickZeroHitMembers(
  summaries: readonly IndividualCombatUnitSummary[],
): number {
  let count = 0;
  for (let index = 0; index < summaries.length; index += 1) {
    count += summaries[index]!.endOfTickZeroHitMemberCount;
  }
  return count;
}

export function createIndividualCombatProfileStoreFromUnitLoadouts(
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  fortitudeLevelsByUnit: ReadonlyMap<UnitId, number> = new Map(),
): IndividualCombatProfileStore {
  if (identityStore.entityCount !== loadoutStore.entityCount) {
    throw new RangeError(
      "Individual combat profile mapping requires matching identity and loadout entity counts.",
    );
  }
  const profiles = new Array<IndividualCombatProfileConfig>(
    identityStore.entityCount,
  );
  const unitIds = getUnitIds(identityStore);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const loadout = getUnitLoadoutSummary(loadoutStore, unitId);
    const weapon = mapLegacyWeaponCategory(loadout.weaponCategory);
    const armour = mapLegacyArmourClass(loadout.armourClass);
    const shield = mapLegacyShieldClass(loadout.shieldClass);
    const shieldCarriedState = getMappedShieldCarriedState(shield, weapon);
    const hasDreadnought = loadout.armourClass === "dreadnought";
    const members = getUnitMembers(identityStore, unitId);
    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      const entityId = members[memberIndex]!;
      profiles[entityId] = {
        entityId,
        primaryWeapon: weapon,
        shieldCategory: shield,
        shieldCarriedState,
        armourCategory: armour,
        hasQualifyingHelmet: false,
        qualifications: {
          hasWeaponMaster: true,
          hasShield: true,
          hasMarksman: true,
          hasThrown: true,
          hasAmbidexterity: true,
          enduranceLevels: 0,
          fortitudeLevels: fortitudeLevelsByUnit.get(unitId) ?? 0,
          hasDreadnought,
        },
        magicalCapabilities: {
          canUseRod: true,
          canUseStaff: true,
          canWearMageArmour: true,
          canDeliverCombatMagic: true,
        },
      };
    }
  }
  return createIndividualCombatProfileStore({
    entityCount: identityStore.entityCount,
    profiles,
  });
}

function mapLegacyWeaponCategory(
  weaponCategory: WeaponCategory,
): IndividualWeaponCategory {
  switch (weaponCategory) {
    case "unarmed":
      return "unarmed";
    case "oneHanded":
      return "oneHanded";
    case "twoHanded":
      return "greatWeapon";
    case "polearm":
      return "polearm";
    case "pike":
      return "pike";
    case "bow":
      return "ranged";
    case "thrown":
      return "thrown";
    case "rod":
      return "rod";
    case "staff":
      return "staff";
    case "dualWield":
      throw new RangeError(
        "Legacy dualWield loadout cannot map to an individual combat profile until dual wielding is implemented.",
      );
    default:
      return assertNever(weaponCategory);
  }
}

function mapLegacyArmourClass(armourClass: ArmourClass): IndividualArmourCategory {
  switch (armourClass) {
    case "none":
      return "none";
    case "light":
      return "light";
    case "medium":
      return "medium";
    case "heavy":
      return "heavy";
    case "mageArmour":
      return "mageArmour";
    case "dreadnought":
      return "heavy";
    default:
      return assertNever(armourClass);
  }
}

function mapLegacyShieldClass(shieldClass: ShieldClass): IndividualShieldCategory {
  switch (shieldClass) {
    case "none":
      return "none";
    case "buckler":
      return "buckler";
    case "shield":
      return "shield";
    default:
      return assertNever(shieldClass);
  }
}

function getMappedShieldCarriedState(
  shield: IndividualShieldCategory,
  weapon: IndividualWeaponCategory,
): IndividualShieldCarriedState {
  if (shield === "none") return "none";
  return weapon === "greatWeapon" || weapon === "polearm" || weapon === "pike"
    ? "slung"
    : "held";
}

function runStageDirectly<T>(
  _stage: IndividualCombatPipelineStage,
  run: () => T,
): T {
  return run();
}

function assertNever(value: never): never {
  throw new RangeError(`Unsupported legacy combat loadout value: ${String(value)}.`);
}
