import type { LiveCombatDebugIndividualSnapshot } from "../sim/types";

export type CasualtyLifecycleGlyph =
  | "active"
  | "dying"
  | "terminalAwaitingComfort"
  | "terminalComforted"
  | "respawnEgress"
  | "waitingAtRespawn"
  | "terminal";

export interface CasualtyVisualGlyphSpec {
  readonly entityId: number;
  readonly lifecycleGlyph: CasualtyLifecycleGlyph;
  readonly freshZeroHit: boolean;
  readonly deathCountProgress: number;
  readonly deathCountPaused: boolean;
  readonly assistanceState: LiveCombatDebugIndividualSnapshot["casualtyAssistanceState"];
  readonly dragPhase: LiveCombatDebugIndividualSnapshot["casualtyDragGroupPhase"];
  readonly committedDragHands: 0 | 1 | 2;
  readonly hasMedicalClaim: boolean;
  readonly isApproachingClaimedPatient: boolean;
  readonly treatmentKind: LiveCombatDebugIndividualSnapshot["treatmentKind"];
  readonly treatmentProgress: number;
  readonly currentHerbs: number;
  readonly reservedHerbs: number;
  readonly consumedHerbs: number;
  readonly traumaticWound: boolean;
  readonly traumaWithdrawal: boolean;
  readonly disabledArm: boolean;
  readonly disabledLeg: boolean;
  readonly executionProgress: number;
  readonly executionCompleted: boolean;
  readonly treatmentInterrupted: boolean;
  readonly restoredHit: boolean;
  readonly comfortCompleted: boolean;
}

export function createCasualtyVisualGlyphSpec(
  individual: LiveCombatDebugIndividualSnapshot,
): CasualtyVisualGlyphSpec {
  const duration = individual.deathCountDurationTicks ?? 0;
  const remaining = individual.deathCountRemainingTicks ?? 0;
  const treatmentRequired = individual.treatmentRequiredProgressTicks ?? 0;
  const executionRequired = 100;
  return {
    entityId: individual.entityId,
    lifecycleGlyph: lifecycleGlyph(individual),
    freshZeroHit: individual.reachedZeroHitsThisTick,
    deathCountProgress: duration <= 0 ? 0 : clamp01((duration - remaining) / duration),
    deathCountPaused: individual.deathCountPaused === true,
    assistanceState: individual.casualtyAssistanceState,
    dragPhase: individual.casualtyDragGroupPhase,
    committedDragHands: committedDragHands(individual.casualtyDragFreeHands),
    hasMedicalClaim:
      (individual.claimedMedicalPatientEntityId ?? -1) >= 0 ||
      (individual.claimedMedicalPhysickEntityId ?? -1) >= 0,
    isApproachingClaimedPatient:
      (individual.claimedMedicalPatientEntityId ?? -1) >= 0 &&
      individual.treatmentActionId === undefined,
    treatmentKind: individual.treatmentKind,
    treatmentProgress: treatmentRequired <= 0
      ? 0
      : clamp01((individual.treatmentProgressTicks ?? 0) / treatmentRequired),
    currentHerbs: individual.currentGenericHerbs ?? 0,
    reservedHerbs: individual.reservedGenericHerbs ?? 0,
    consumedHerbs: individual.genericHerbsConsumedHistoryCount ?? 0,
    traumaticWound: individual.traumaticWoundState === "active",
    traumaWithdrawal: individual.traumaWithdrawalActive === true,
    disabledArm: individual.disabledArm === true,
    disabledLeg: individual.disabledLeg === true,
    executionProgress: individual.executionActionId === undefined
      ? 0
      : clamp01((individual.executionProgressTicks ?? 0) / executionRequired),
    executionCompleted: individual.terminalCause === "execution",
    treatmentInterrupted:
      (individual.treatmentInterruptedHistoryCount ?? 0) > 0 ||
      (individual.treatmentPerformedInterruptedHistoryCount ?? 0) > 0,
    restoredHit: (individual.hitRestorationHistoryCount ?? 0) > 0,
    comfortCompleted: (individual.comfortCompletedTick ?? -1) >= 0,
  };
}

function committedDragHands(freeHands: number | undefined): 0 | 1 | 2 {
  if (freeHands === undefined) return 0;
  const committed = 2 - freeHands;
  if (committed <= 0) return 0;
  return committed === 1 ? 1 : 2;
}

function lifecycleGlyph(
  individual: LiveCombatDebugIndividualSnapshot,
): CasualtyLifecycleGlyph {
  switch (individual.playerPresenceState) {
    case "terminalAwaitingComfort":
      return "terminalAwaitingComfort";
    case "terminalComforted":
      return "terminalComforted";
    case "respawnEgress":
      return "respawnEgress";
    case "waitingAtRespawn":
      return "waitingAtRespawn";
    default:
      break;
  }
  switch (individual.characterLifecycleState) {
    case "dying":
      return "dying";
    case "terminal":
      return "terminal";
    default:
      return "active";
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
