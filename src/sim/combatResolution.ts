import type { CombatAttackOpportunity } from "./combatTempo";
import {
  getFactionIdForUnit,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import {
  getUnitArmourClass,
  getUnitShieldClass,
  getUnitWeaponReachBand,
  type ArmourClass,
  type ShieldClass,
  type UnitLoadoutStore,
  type WeaponReachBand,
} from "./unitLoadout";

export interface CombatResolutionConfig {
  readonly includeTargetProtectionLabels?: boolean;
}

export type CombatConsequenceKind = "none" | "damage";

export interface CombatStrikeResolution {
  readonly sourceUnitId: UnitId;
  readonly targetUnitId: UnitId;
  readonly sourceMovementStyle: CombatAttackOpportunity["sourceMovementStyle"];
  readonly engagementState: CombatAttackOpportunity["engagementState"];
  readonly weaponReachBand: WeaponReachBand;
  readonly consequenceKind: CombatConsequenceKind;
  readonly damageValue: number;
  readonly targetArmourClass?: ArmourClass;
  readonly targetShieldClass?: ShieldClass;
}

export interface CombatResolutionResult {
  readonly strikes: readonly CombatStrikeResolution[];
}

const DAMAGE_VALUE_BY_REACH_BAND: Readonly<Record<WeaponReachBand, number>> = {
  none: 0,
  close: 1,
  short: 1,
  medium: 1,
  long: 1,
  veryLong: 1,
  ranged: 1,
};

export function resolveCombatOpportunity(
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  opportunity: CombatAttackOpportunity,
  config: CombatResolutionConfig = {},
): CombatStrikeResolution {
  validateResolutionInputs(identityStore, loadoutStore);
  return resolveValidatedCombatOpportunity(
    identityStore,
    loadoutStore,
    opportunity,
    config,
  );
}

export function resolveCombatOpportunities(
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  opportunities: readonly CombatAttackOpportunity[],
  out: CombatStrikeResolution[] = [],
  config: CombatResolutionConfig = {},
): CombatResolutionResult {
  validateResolutionInputs(identityStore, loadoutStore);

  out.length = 0;
  for (let index = 0; index < opportunities.length; index += 1) {
    out.push(
      resolveValidatedCombatOpportunity(
        identityStore,
        loadoutStore,
        opportunities[index]!,
        config,
      ),
    );
  }

  return { strikes: out };
}

function resolveValidatedCombatOpportunity(
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  opportunity: CombatAttackOpportunity,
  config: CombatResolutionConfig,
): CombatStrikeResolution {
  validateOpportunity(identityStore, loadoutStore, opportunity);

  const damageValue = getDamageValueForReachBand(opportunity.weaponReachBand);
  const targetArmourClass = getUnitArmourClass(
    loadoutStore,
    opportunity.targetUnitId,
  );
  const targetShieldClass = getUnitShieldClass(
    loadoutStore,
    opportunity.targetUnitId,
  );
  const strike: CombatStrikeResolution = {
    sourceUnitId: opportunity.sourceUnitId,
    targetUnitId: opportunity.targetUnitId,
    sourceMovementStyle: opportunity.sourceMovementStyle,
    engagementState: opportunity.engagementState,
    weaponReachBand: opportunity.weaponReachBand,
    consequenceKind: damageValue > 0 ? "damage" : "none",
    damageValue,
  };

  if (config.includeTargetProtectionLabels === false) {
    return strike;
  }

  return {
    ...strike,
    targetArmourClass,
    targetShieldClass,
  };
}

function getDamageValueForReachBand(reachBand: WeaponReachBand): number {
  const damageValue = DAMAGE_VALUE_BY_REACH_BAND[reachBand];
  if (damageValue === undefined) {
    throw new RangeError("Unknown weapon reach band for combat resolution.");
  }
  return damageValue;
}

function validateResolutionInputs(
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
): void {
  if (loadoutStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Unit loadout entity count must match unit identity entity count.",
    );
  }
  if (loadoutStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Unit loadout unit count must match unit identity unit count.",
    );
  }
}

function validateOpportunity(
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  opportunity: CombatAttackOpportunity,
): void {
  if (opportunity.engagementState !== "engaged") {
    throw new RangeError(
      "Combat resolution requires an engaged attack opportunity.",
    );
  }

  getFactionIdForUnit(identityStore, opportunity.sourceUnitId);
  getFactionIdForUnit(identityStore, opportunity.targetUnitId);
  getUnitWeaponReachBand(loadoutStore, opportunity.sourceUnitId);
  getUnitArmourClass(loadoutStore, opportunity.targetUnitId);
  getUnitShieldClass(loadoutStore, opportunity.targetUnitId);
}
