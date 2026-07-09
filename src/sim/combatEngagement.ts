import {
  getUnitHeading,
  getUnitMovementStyle,
  type FormationBehaviourStore,
  type UnitMovementStyle,
} from "./formationBehaviour";
import {
  getFactionIdForUnit,
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import {
  getUnitThreatSummary,
  type UnitThreatRelationship,
} from "./threatGeometry";
import type { UnitLoadoutStore } from "./unitLoadout";
import type { WorldState } from "./types";

export type UnitEngagementState =
  | "none"
  | "threatening"
  | "contacting"
  | "engaged";

export interface UnitEngagementTarget {
  readonly sourceUnitId: UnitId;
  readonly targetUnitId: UnitId;
  readonly relationship: Extract<UnitThreatRelationship, "hostile">;
  readonly distance: number;
  readonly forwardDistance: number;
  readonly lateralDistance: number;
  readonly inFront: boolean;
  readonly inThreatRange: boolean;
  readonly inContactRange: boolean;
  readonly sourceMovementStyle: UnitMovementStyle;
  readonly engagementState: UnitEngagementState;
}

export interface UnitEngagementSummary {
  readonly sourceUnitId: UnitId;
  readonly engagementState: UnitEngagementState;
  readonly primaryTarget: UnitEngagementTarget | undefined;
  readonly targets: readonly UnitEngagementTarget[];
}

interface UnitCentre {
  readonly x: number;
  readonly y: number;
}

interface SourceEngagementContext {
  readonly sourceUnitId: UnitId;
  readonly sourceFactionId: number;
  readonly sourceCentre: UnitCentre;
  readonly headingX: number;
  readonly headingY: number;
  readonly threatRange: number;
  readonly contactDistance: number;
  readonly sourceMovementStyle: UnitMovementStyle;
}

export function computeUnitEngagementTarget(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  sourceUnitId: UnitId,
  targetUnitId: UnitId,
): UnitEngagementTarget {
  validateEngagementInputs(
    world,
    identityStore,
    loadoutStore,
    formationStore,
  );
  const context = createSourceEngagementContext(
    world,
    identityStore,
    loadoutStore,
    formationStore,
    sourceUnitId,
  );

  return computeHostileEngagementTarget(
    world,
    identityStore,
    context,
    targetUnitId,
  );
}

export function collectUnitEngagements(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  sourceUnitId: UnitId,
  out: UnitEngagementTarget[],
): UnitEngagementTarget[] {
  validateEngagementInputs(
    world,
    identityStore,
    loadoutStore,
    formationStore,
  );
  const context = createSourceEngagementContext(
    world,
    identityStore,
    loadoutStore,
    formationStore,
    sourceUnitId,
  );

  out.length = 0;
  const unitIds = getUnitIds(identityStore);
  for (let index = 0; index < unitIds.length; index += 1) {
    const targetUnitId = unitIds[index]!;
    if (targetUnitId === sourceUnitId) {
      continue;
    }
    if (getFactionIdForUnit(identityStore, targetUnitId) === context.sourceFactionId) {
      continue;
    }

    const target = computeHostileEngagementTarget(
      world,
      identityStore,
      context,
      targetUnitId,
    );
    if (target.engagementState !== "none") {
      out.push(target);
    }
  }

  return out;
}

export function computeUnitEngagementSummary(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  sourceUnitId: UnitId,
): UnitEngagementSummary {
  const targets = collectUnitEngagements(
    world,
    identityStore,
    loadoutStore,
    formationStore,
    sourceUnitId,
    [],
  );
  const primaryTarget = selectPrimaryEngagement(targets);

  return {
    sourceUnitId,
    engagementState: primaryTarget?.engagementState ?? "none",
    primaryTarget,
    targets,
  };
}

export function getPrimaryEngagement(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  sourceUnitId: UnitId,
): UnitEngagementTarget | undefined {
  return computeUnitEngagementSummary(
    world,
    identityStore,
    loadoutStore,
    formationStore,
    sourceUnitId,
  ).primaryTarget;
}

export function getUnitEngagementState(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  sourceUnitId: UnitId,
): UnitEngagementState {
  return computeUnitEngagementSummary(
    world,
    identityStore,
    loadoutStore,
    formationStore,
    sourceUnitId,
  ).engagementState;
}

export function isUnitEngaged(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  sourceUnitId: UnitId,
): boolean {
  return (
    getUnitEngagementState(
      world,
      identityStore,
      loadoutStore,
      formationStore,
      sourceUnitId,
    ) === "engaged"
  );
}

function createSourceEngagementContext(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  sourceUnitId: UnitId,
): SourceEngagementContext {
  const sourceSummary = getUnitThreatSummary(loadoutStore, sourceUnitId);
  const sourceFactionId = getFactionIdForUnit(identityStore, sourceUnitId);
  const sourceCentre = computeUnitCentre(world, identityStore, sourceUnitId);
  const heading = getUnitHeading(formationStore, sourceUnitId);

  return {
    sourceUnitId,
    sourceFactionId,
    sourceCentre,
    headingX: heading.x,
    headingY: heading.y,
    threatRange: sourceSummary.threatRange,
    contactDistance: sourceSummary.contactDistance,
    sourceMovementStyle: getUnitMovementStyle(formationStore, sourceUnitId),
  };
}

function computeHostileEngagementTarget(
  world: WorldState,
  identityStore: UnitIdentityStore,
  context: SourceEngagementContext,
  targetUnitId: UnitId,
): UnitEngagementTarget {
  const targetFactionId = getFactionIdForUnit(identityStore, targetUnitId);
  if (targetFactionId === context.sourceFactionId) {
    throw new RangeError("Combat engagement target must be hostile.");
  }

  const targetCentre = computeUnitCentre(world, identityStore, targetUnitId);
  const deltaX = targetCentre.x - context.sourceCentre.x;
  const deltaY = targetCentre.y - context.sourceCentre.y;
  const forwardDistance =
    deltaX * context.headingX + deltaY * context.headingY;
  const lateralProjection =
    deltaX * -context.headingY + deltaY * context.headingX;
  const lateralDistance = Math.abs(lateralProjection);
  const distance = Math.hypot(deltaX, deltaY);
  const inFront = forwardDistance > 0;
  const inThreatRange = inFront && distance <= context.threatRange;
  const inContactRange = inFront && distance <= context.contactDistance;

  return {
    sourceUnitId: context.sourceUnitId,
    targetUnitId,
    relationship: "hostile",
    distance,
    forwardDistance,
    lateralDistance,
    inFront,
    inThreatRange,
    inContactRange,
    sourceMovementStyle: context.sourceMovementStyle,
    engagementState: computeEngagementState(
      inThreatRange,
      inContactRange,
      context.sourceMovementStyle,
    ),
  };
}

function computeEngagementState(
  inThreatRange: boolean,
  inContactRange: boolean,
  sourceMovementStyle: UnitMovementStyle,
): UnitEngagementState {
  if (inContactRange) {
    return sourceMovementStyle === "engageFront" ? "engaged" : "contacting";
  }
  if (inThreatRange) {
    return "threatening";
  }
  return "none";
}

function selectPrimaryEngagement(
  targets: readonly UnitEngagementTarget[],
): UnitEngagementTarget | undefined {
  let selected: UnitEngagementTarget | undefined;
  for (let index = 0; index < targets.length; index += 1) {
    const candidate = targets[index]!;
    if (isBetterPrimaryEngagement(candidate, selected)) {
      selected = candidate;
    }
  }
  return selected;
}

function isBetterPrimaryEngagement(
  candidate: UnitEngagementTarget,
  selected: UnitEngagementTarget | undefined,
): boolean {
  if (selected === undefined) {
    return true;
  }

  const candidateRank = getEngagementStateRank(candidate.engagementState);
  const selectedRank = getEngagementStateRank(selected.engagementState);
  if (candidateRank !== selectedRank) {
    return candidateRank > selectedRank;
  }
  if (candidate.distance !== selected.distance) {
    return candidate.distance < selected.distance;
  }
  return candidate.targetUnitId < selected.targetUnitId;
}

function getEngagementStateRank(state: UnitEngagementState): number {
  switch (state) {
    case "engaged":
      return 3;
    case "contacting":
      return 2;
    case "threatening":
      return 1;
    case "none":
      return 0;
  }
}

function computeUnitCentre(
  world: WorldState,
  identityStore: UnitIdentityStore,
  unitId: UnitId,
): UnitCentre {
  const members = getUnitMembers(identityStore, unitId);
  let sumX = 0;
  let sumY = 0;

  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    sumX += world.positionsX[entityId]!;
    sumY += world.positionsY[entityId]!;
  }

  return {
    x: Math.trunc(sumX / members.length),
    y: Math.trunc(sumY / members.length),
  };
}

function validateEngagementInputs(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
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
  if (
    world.positionsX.length < world.entityCount ||
    world.positionsY.length < world.entityCount
  ) {
    throw new RangeError(
      "World position arrays must cover the world entity count.",
    );
  }
}
