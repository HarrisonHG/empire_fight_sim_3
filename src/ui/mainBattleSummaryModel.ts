import type { LiveCombatDebugUnitSnapshot } from "../sim/types";

export interface MainBattleSideSummaryValue {
  readonly factionId: number;
  readonly label: string;
  readonly active: number;
  readonly dying: number;
  readonly terminal: number;
  readonly routing: number;
  readonly beingDragged: number;
  readonly underTreatment: number;
  readonly comforted: number;
  readonly respawnEgress: number;
  readonly waitingAtRespawn: number;
  readonly currentHerbs: number;
  readonly reservedHerbs: number;
  readonly energyActive: number;
  readonly energyAverageRatioFixedPoint: number | null;
  readonly energyMinimumRatioFixedPoint: number | null;
  readonly energyFresh: number;
  readonly energyWorking: number;
  readonly energyWinded: number;
  readonly energySpent: number;
  readonly energySpentThisTick: number;
  readonly energyRecoveredThisTick: number;
  readonly energyResting: number;
  readonly units: readonly MainBattleUnitEnergySummaryValue[];
}

export interface MainBattleUnitEnergySummaryValue {
  readonly unitId: number;
  readonly label: string;
  readonly active: number;
  readonly averageRatioFixedPoint: number | null;
  readonly minimumRatioFixedPoint: number | null;
  readonly fresh: number;
  readonly working: number;
  readonly winded: number;
  readonly spent: number;
  readonly jogCapable: number;
  readonly sprintOrChargeCapable: number;
  readonly dragCapable: number;
  readonly spentThisTick: number;
  readonly recoveredThisTick: number;
  readonly recommendation: import("../sim/unitEnergyBehaviour").UnitEnergyBehaviourRecommendation;
  readonly resting: number;
}

export function deriveMainBattleSideSummaries(
  units: readonly LiveCombatDebugUnitSnapshot[],
  labels: ReadonlyMap<number, string>,
): readonly MainBattleSideSummaryValue[] {
  const summaries = new Map<number, MutableSideSummary>();
  for (const unit of units) {
    const casualty = unit.casualty;
    if (casualty === undefined) continue;
    let side = summaries.get(unit.factionId);
    if (side === undefined) {
      side = {
        factionId: unit.factionId,
        label: labels.get(unit.factionId) ?? `Faction ${unit.factionId}`,
        active: 0,
        dying: 0,
        terminal: 0,
        routing: 0,
        beingDragged: 0,
        underTreatment: 0,
        comforted: 0,
        respawnEgress: 0,
        waitingAtRespawn: 0,
        currentHerbs: 0,
        reservedHerbs: 0,
        energyActive: 0,
        energyRatioTotal: 0,
        energyAverageRatioFixedPoint: null,
        energyMinimumRatioFixedPoint: null,
        energyFresh: 0,
        energyWorking: 0,
        energyWinded: 0,
        energySpent: 0,
        energySpentThisTick: 0,
        energyRecoveredThisTick: 0,
        energyResting: 0,
        units: [],
      };
      summaries.set(unit.factionId, side);
    }
    side.active += casualty.activeCharacterCount;
    side.dying += casualty.dyingCharacterCount;
    side.terminal += casualty.terminalCharacterCount;
    side.routing += unit.persistentMoraleState === "routing"
      ? casualty.activeCharacterCount
      : 0;
    side.beingDragged += casualty.draggedPatientCount;
    side.underTreatment += casualty.patientsUnderTreatmentCount;
    side.comforted += casualty.terminalComfortedCount;
    side.respawnEgress += casualty.respawnEgressCount;
    side.waitingAtRespawn += casualty.waitingAtRespawnCount;
    side.currentHerbs += casualty.currentGenericHerbCount;
    side.reservedHerbs += casualty.reservedGenericHerbCount;
    const activeEnergyMembers = unit.energyActiveMemberCount ?? 0;
    side.energyActive += activeEnergyMembers;
    side.energyRatioTotal +=
      (unit.energyAverageRatioFixedPoint ?? 0) * activeEnergyMembers;
    if (unit.energyMinimumRatioFixedPoint !== null &&
        unit.energyMinimumRatioFixedPoint !== undefined) {
      side.energyMinimumRatioFixedPoint =
        side.energyMinimumRatioFixedPoint === null
          ? unit.energyMinimumRatioFixedPoint
          : Math.min(
              side.energyMinimumRatioFixedPoint,
              unit.energyMinimumRatioFixedPoint,
            );
    }
    side.energyFresh += unit.energyFreshMemberCount ?? 0;
    side.energyWorking += unit.energyWorkingMemberCount ?? 0;
    side.energyWinded += unit.energyWindedMemberCount ?? 0;
    side.energySpent += unit.energySpentMemberCount ?? 0;
    side.energySpentThisTick += unit.energySpentThisTick ?? 0;
    side.energyRecoveredThisTick += unit.energyRecoveredThisTick ?? 0;
    side.energyResting += unit.energyCurrentlyRestingMemberCount ?? 0;
    side.units.push(Object.freeze({
      unitId: unit.unitId,
      label: unit.label,
      active: activeEnergyMembers,
      averageRatioFixedPoint: unit.energyAverageRatioFixedPoint ?? null,
      minimumRatioFixedPoint: unit.energyMinimumRatioFixedPoint ?? null,
      fresh: unit.energyFreshMemberCount ?? 0,
      working: unit.energyWorkingMemberCount ?? 0,
      winded: unit.energyWindedMemberCount ?? 0,
      spent: unit.energySpentMemberCount ?? 0,
      jogCapable: unit.energyJogCapableMemberCount ?? 0,
      sprintOrChargeCapable:
        unit.energySprintOrChargeCapableMemberCount ?? 0,
      dragCapable: unit.energyDragCapableHelperCount ?? 0,
      spentThisTick: unit.energySpentThisTick ?? 0,
      recoveredThisTick: unit.energyRecoveredThisTick ?? 0,
      recommendation: unit.energyBehaviourRecommendation ?? "normal",
      resting: unit.energyCurrentlyRestingMemberCount ?? 0,
    }));
  }
  return Object.freeze(
    [...summaries.values()]
      .sort((left, right) => left.factionId - right.factionId)
      .map(({ energyRatioTotal, ...summary }) => Object.freeze({
        ...summary,
        energyAverageRatioFixedPoint: summary.energyActive === 0
          ? null
          : Math.floor(energyRatioTotal / summary.energyActive),
        units: Object.freeze(summary.units.slice()),
      })),
  );
}

type MutableSideSummary = {
  -readonly [Key in keyof MainBattleSideSummaryValue]: MainBattleSideSummaryValue[Key];
} & { energyRatioTotal: number; units: MainBattleUnitEnergySummaryValue[] };
