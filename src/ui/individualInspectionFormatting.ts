import type {
  LiveCombatDebugIndividualSnapshot,
  LiveCombatDebugUnitSnapshot,
} from "../sim/types";

export interface IndividualInspectionRow {
  readonly identity: string;
  readonly latestEvent: string;
}

export function combatRecordTickForSnapshot(snapshotTick: number): number {
  return Math.max(0, snapshotTick - 1);
}

export function shouldClearRetainedInspectionEvents(
  snapshotTick: number,
  inspectedIndividualCount: number,
): boolean {
  return snapshotTick === 0 || inspectedIndividualCount === 0;
}

export function formatIndividualInspectionIdentity(
  individual: LiveCombatDebugIndividualSnapshot,
  units: readonly Pick<LiveCombatDebugUnitSnapshot, "unitId" | "label">[],
): string {
  const unit = units.find((entry) => entry.unitId === individual.unitId);
  const label = unit === undefined ? "" : ` ${unit.label}`;
  return `E${individual.entityId}/U${individual.unitId}${label}`;
}

export function formatRetainedInspectionEvent(
  snapshotTick: number,
  individual: LiveCombatDebugIndividualSnapshot,
): string {
  const event = formatInspectionEvent(individual);
  if (event === "") {
    return "";
  }
  return `t${combatRecordTickForSnapshot(snapshotTick)} ${event}`;
}

export function buildIndividualInspectionRows(
  snapshotTick: number,
  individuals: readonly LiveCombatDebugIndividualSnapshot[],
  units: readonly Pick<LiveCombatDebugUnitSnapshot, "unitId" | "label">[],
  retainedEvents: ReadonlyMap<number, string>,
): readonly IndividualInspectionRow[] {
  if (individuals.length === 0) {
    return [];
  }

  return individuals.map((individual) => {
    const currentEvent = formatRetainedInspectionEvent(snapshotTick, individual);
    return {
      identity: formatIndividualInspectionIdentity(individual, units),
      latestEvent:
        currentEvent === ""
          ? retainedEvents.get(individual.entityId) ?? ""
          : currentEvent,
    };
  });
}

export function formatInspectionEvent(
  individual: LiveCombatDebugIndividualSnapshot,
): string {
  const parts: string[] = [];
  if (individual.thisTickAttackOutcome !== "none") {
    parts.push(`atk:${individual.thisTickAttackOutcome}`);
  }
  if (individual.thisTickOutgoingDefenceOutcome !== "none") {
    parts.push(`out:${individual.thisTickOutgoingDefenceOutcome}`);
  }
  if (individual.thisTickDefenceOutcome !== "none") {
    parts.push(`def:${individual.thisTickDefenceOutcome}`);
  }
  if (individual.defenceResolution !== "none") {
    parts.push(
      `dc:${individual.defenceCoverageTier}/${individual.chosenDefenceSource}` +
        ` Stored readiness ${Math.round(individual.storedGuardReadinessFixedPoint / 100)}%` +
        ` Effective readiness ${Math.round(individual.effectiveGuardReadinessFixedPoint / 100)}%` +
        ` Recovery +${individual.guardReadinessRecoveredThisTick}` +
        ` Spend -${individual.guardReadinessSpentThisTick}` +
        (individual.guardReadinessOffensivelySuppressed
          ? " offensive suppression"
          : "") +
        (individual.rearDesperateDefenceApplied ? " rear desperate" : "") +
        ` c${individual.calculatedDefenceChanceFixedPoint}` +
        ` roll${individual.deterministicDefenceRollFixedPoint}` +
        ` ${individual.defenceResolution}`,
    );
  }
  if (individual.thisTickLandedHitGateOutcome !== "none") {
    parts.push(`gate:${individual.thisTickLandedHitGateOutcome}`);
  }
  const incomingCounts = formatNonZeroIncomingCounts(individual);
  if (incomingCounts !== "") {
    parts.push(`in:${incomingCounts}`);
  }
  if (individual.thisTickAppliedHitLoss > 0) {
    parts.push(`loss:${individual.thisTickAppliedHitLoss}`);
  }
  if (individual.reachedZeroHitsThisTick) {
    parts.push("zero");
  }
  if (
    individual.currentPressure > 0 ||
    individual.proximityPressureFloor > 0 ||
    individual.incomingAttackPressureImpulse > 0 ||
    individual.incomingHitPressureImpulse > 0 ||
    individual.blockedStrikePressureImpulse > 0 ||
    individual.pressureRecoveryPauseTicksRemaining > 0 ||
    individual.recoveredPressureAmount > 0
  ) {
    parts.push(
      `pr:${individual.currentPressure}` +
        `/floor${individual.proximityPressureFloor}` +
        `/outcome${individual.selectedDefenceOutcomePressureContribution}` +
        `/h${individual.nearbyHostileCount}` +
        `/a${individual.nearbyAllyCount}` +
        `/atk${individual.incomingAttackPressureImpulse}` +
        `/hit${individual.incomingHitPressureImpulse}` +
        `/blk${individual.blockedStrikePressureImpulse}` +
        `/pause${individual.pressureRecoveryPauseTicksRemaining}` +
        `/rec${individual.pressureRecoveryContext}` +
        `:${individual.pressureRecoveryCreditApplied}` +
        `:${individual.recoveredPressureAmount}`,
    );
  }
  return parts.join(" ");
}

export function formatIncomingCounts(
  individual: LiveCombatDebugIndividualSnapshot,
): string {
  return (
    `P${individual.thisTickIncomingParryCount}/` +
    `B${individual.thisTickIncomingBucklerBlockCount}/` +
    `S${individual.thisTickIncomingShieldBlockCount}/` +
    `L${individual.thisTickIncomingLandedCount}`
  );
}

function formatNonZeroIncomingCounts(
  individual: LiveCombatDebugIndividualSnapshot,
): string {
  const incomingTotal =
    individual.thisTickIncomingParryCount +
    individual.thisTickIncomingBucklerBlockCount +
    individual.thisTickIncomingShieldBlockCount +
    individual.thisTickIncomingLandedCount;
  return incomingTotal === 0 ? "" : formatIncomingCounts(individual);
}
