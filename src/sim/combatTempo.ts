import {
  collectUnitEngagements,
  type UnitEngagementState,
  type UnitEngagementTarget,
} from "./combatEngagement";
import type {
  FormationBehaviourStore,
  UnitMovementStyle,
} from "./formationBehaviour";
import {
  getUnitIds,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import {
  getUnitWeaponReachBand,
  type UnitLoadoutStore,
  type WeaponReachBand,
} from "./unitLoadout";
import type { WorldState } from "./types";

export interface CombatTempoConfig {
  readonly entityCount: number;
  readonly baseAttackIntervalTicks?: number;
  readonly units?: readonly CombatTempoUnitConfig[];
}

export interface CombatTempoUnitConfig {
  readonly unitId: UnitId;
  readonly attackIntervalTicks?: number;
  readonly initialCooldownTicks?: number;
}

export interface CombatTempoStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export interface CombatAttackOpportunity {
  readonly sourceUnitId: UnitId;
  readonly targetUnitId: UnitId;
  readonly sourceMovementStyle: UnitMovementStyle;
  readonly engagementState: Extract<UnitEngagementState, "engaged">;
  readonly weaponReachBand: WeaponReachBand;
}

export interface CombatTempoTickResult {
  readonly opportunities: readonly CombatAttackOpportunity[];
}

interface InternalCombatTempoStore extends CombatTempoStore {
  readonly unitIndexById: ReadonlyMap<UnitId, number>;
  readonly attackIntervalTicks: Int32Array;
  readonly cooldownTicks: Int32Array;
  readonly scratchEngagementTargets: UnitEngagementTarget[];
}

const DEFAULT_ATTACK_INTERVAL_TICKS = 10;

export function createCombatTempoStore(
  identityStore: UnitIdentityStore,
  config: CombatTempoConfig,
): CombatTempoStore {
  assertPositiveInteger(config.entityCount, "entityCount");
  if (identityStore.entityCount !== config.entityCount) {
    throw new RangeError(
      "Combat tempo entity count must match identity store entity count.",
    );
  }

  const unitIds = getUnitIds(identityStore);
  const unitIndexById = new Map<UnitId, number>();
  for (let index = 0; index < unitIds.length; index += 1) {
    unitIndexById.set(unitIds[index]!, index);
  }

  const baseAttackIntervalTicks =
    config.baseAttackIntervalTicks ?? DEFAULT_ATTACK_INTERVAL_TICKS;
  assertPositiveInteger(baseAttackIntervalTicks, "baseAttackIntervalTicks");

  const attackIntervalTicks = new Int32Array(unitIds.length);
  const cooldownTicks = new Int32Array(unitIds.length);
  attackIntervalTicks.fill(baseAttackIntervalTicks);
  cooldownTicks.fill(baseAttackIntervalTicks);

  const seenConfiguredUnitIds = new Set<UnitId>();
  const configuredUnits = config.units ?? [];
  for (let index = 0; index < configuredUnits.length; index += 1) {
    const unitConfig = configuredUnits[index]!;
    if (seenConfiguredUnitIds.has(unitConfig.unitId)) {
      throw new RangeError("Duplicate combat tempo unit config.");
    }
    seenConfiguredUnitIds.add(unitConfig.unitId);

    const unitIndex = unitIndexById.get(unitConfig.unitId);
    if (unitIndex === undefined) {
      throw new RangeError("Unknown unit ID in combat tempo config.");
    }

    const attackInterval =
      unitConfig.attackIntervalTicks ?? baseAttackIntervalTicks;
    assertPositiveInteger(attackInterval, "attackIntervalTicks");
    attackIntervalTicks[unitIndex] = attackInterval;

    const initialCooldown =
      unitConfig.initialCooldownTicks ?? attackInterval;
    assertNonNegativeInteger(initialCooldown, "initialCooldownTicks");
    cooldownTicks[unitIndex] = initialCooldown;
  }

  return {
    entityCount: config.entityCount,
    unitCount: unitIds.length,
    unitIndexById,
    attackIntervalTicks,
    cooldownTicks,
    scratchEngagementTargets: [],
  } as InternalCombatTempoStore;
}

export function getUnitAttackCooldownTicks(
  store: CombatTempoStore,
  unitId: UnitId,
): number {
  const internal = asInternal(store);
  return internal.cooldownTicks[requireUnitIndex(internal, unitId)]!;
}

export function advanceCombatTempoOneTick(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  tempoStore: CombatTempoStore,
  out: CombatAttackOpportunity[] = [],
): CombatTempoTickResult {
  return {
    opportunities: collectAttackOpportunities(
      world,
      identityStore,
      loadoutStore,
      formationStore,
      tempoStore,
      out,
    ),
  };
}

export function collectAttackOpportunities(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  tempoStore: CombatTempoStore,
  out: CombatAttackOpportunity[],
): CombatAttackOpportunity[] {
  const internal = asInternal(tempoStore);
  validateCombatTempoInputs(
    world,
    identityStore,
    loadoutStore,
    formationStore,
    internal,
  );

  out.length = 0;
  const unitIds = getUnitIds(identityStore);
  for (let index = 0; index < unitIds.length; index += 1) {
    const sourceUnitId = unitIds[index]!;
    const unitIndex = requireUnitIndex(internal, sourceUnitId);
    const engagedTarget = getPrimaryEngagedTarget(
      world,
      identityStore,
      loadoutStore,
      formationStore,
      internal,
      sourceUnitId,
    );

    if (engagedTarget === undefined) {
      internal.cooldownTicks[unitIndex] =
        internal.attackIntervalTicks[unitIndex]!;
      continue;
    }

    const cooldownTicks = internal.cooldownTicks[unitIndex]!;
    if (cooldownTicks <= 1) {
      out.push({
        sourceUnitId,
        targetUnitId: engagedTarget.targetUnitId,
        sourceMovementStyle: engagedTarget.sourceMovementStyle,
        engagementState: "engaged",
        weaponReachBand: getUnitWeaponReachBand(loadoutStore, sourceUnitId),
      });
      internal.cooldownTicks[unitIndex] =
        internal.attackIntervalTicks[unitIndex]!;
    } else {
      internal.cooldownTicks[unitIndex] = cooldownTicks - 1;
    }
  }

  return out;
}

function getPrimaryEngagedTarget(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  store: InternalCombatTempoStore,
  sourceUnitId: UnitId,
): UnitEngagementTarget | undefined {
  const targets = collectUnitEngagements(
    world,
    identityStore,
    loadoutStore,
    formationStore,
    sourceUnitId,
    store.scratchEngagementTargets,
  );

  let selected: UnitEngagementTarget | undefined;
  for (let index = 0; index < targets.length; index += 1) {
    const candidate = targets[index]!;
    if (candidate.engagementState !== "engaged") {
      continue;
    }
    if (isBetterEngagedTarget(candidate, selected)) {
      selected = candidate;
    }
  }
  return selected;
}

function isBetterEngagedTarget(
  candidate: UnitEngagementTarget,
  selected: UnitEngagementTarget | undefined,
): boolean {
  if (selected === undefined) {
    return true;
  }
  if (candidate.distance !== selected.distance) {
    return candidate.distance < selected.distance;
  }
  return candidate.targetUnitId < selected.targetUnitId;
}

function validateCombatTempoInputs(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  tempoStore: CombatTempoStore,
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
  if (formationStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Formation behaviour entity count must match unit identity entity count.",
    );
  }
  if (tempoStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Combat tempo entity count must match unit identity entity count.",
    );
  }
  if (loadoutStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Unit loadout unit count must match unit identity unit count.",
    );
  }
  if (formationStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Formation behaviour unit count must match unit identity unit count.",
    );
  }
  if (tempoStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Combat tempo unit count must match unit identity unit count.",
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

function requireUnitIndex(
  store: InternalCombatTempoStore,
  unitId: UnitId,
): number {
  const index = store.unitIndexById.get(unitId);
  if (index === undefined) {
    throw new RangeError("Unknown unit ID for combat tempo store.");
  }
  return index;
}

function asInternal(store: CombatTempoStore): InternalCombatTempoStore {
  return store as InternalCombatTempoStore;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}
