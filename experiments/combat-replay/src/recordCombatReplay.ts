import {
  computeUnitEngagementSummary,
  type UnitEngagementSummary,
} from "../../../src/sim/combatEngagement";
import {
  advanceCombatPipelineOneTick,
  createCombatPipelineOutput,
} from "../../../src/sim/combatPipeline";
import type { CombatStrikeResolution } from "../../../src/sim/combatResolution";
import type { CombatSurvivabilityApplication } from "../../../src/sim/combatSurvivability";
import {
  getUnitAccumulatedDamage,
  getUnitMaxDamageCapacity,
  isUnitDamageCapacityReached,
} from "../../../src/sim/combatSurvivability";
import type { CombatAttackOpportunity } from "../../../src/sim/combatTempo";
import { getUnitAttackCooldownTicks } from "../../../src/sim/combatTempo";
import {
  advanceFormationOneTick,
  getUnitAnchor,
  getUnitHeading,
  getUnitMovementStyle,
  getUnitOrder,
} from "../../../src/sim/formationBehaviour";
import { getUnitThreatSummary } from "../../../src/sim/threatGeometry";
import { getUnitIdForEntity } from "../../../src/sim/unitIdentity";
import { getUnitLoadoutSummary } from "../../../src/sim/unitLoadout";
import type {
  CombatReplayFrame,
  CombatReplayRecord,
  CombatReplayScenarioDefinition,
  CombatReplaySetup,
} from "./combatReplayTypes";

export function recordCombatReplayScenario(
  scenario: CombatReplayScenarioDefinition,
): CombatReplayRecord {
  const setup = scenario.setup();
  const output = createCombatPipelineOutput();
  const frames: CombatReplayFrame[] = [
    recordFrame(setup, 0, [], [], [], [], []),
  ];

  for (let tick = 1; tick <= scenario.tickCount; tick += 1) {
    const formationResult = advanceFormationOneTick(
      setup.world,
      setup.identity,
      setup.formation,
    );
    const pipelineResult = advanceCombatPipelineOneTick(
      setup.world,
      setup.identity,
      setup.loadout,
      setup.formation,
      setup.tempo,
      setup.survivability,
      output,
    );

    const opportunities = pipelineResult.opportunities.map((record) => ({
      ...record,
    }));
    const strikes = pipelineResult.strikes.map((record) => ({ ...record }));
    const applications = pipelineResult.applications.map((record) => ({
      ...record,
    }));
    frames.push(
      recordFrame(
        setup,
        tick,
        formationResult.events,
        opportunities,
        strikes,
        applications,
        formatLogLines(opportunities, strikes, applications),
      ),
    );
  }

  return {
    scenario,
    worldBounds: setup.world.bounds,
    units: setup.units,
    frames,
  };
}

function recordFrame(
  setup: CombatReplaySetup,
  tick: number,
  formationEvents: CombatReplayFrame["formationEvents"],
  opportunities: readonly CombatAttackOpportunity[],
  strikes: readonly CombatStrikeResolution[],
  applications: readonly CombatSurvivabilityApplication[],
  logLines: readonly string[],
): CombatReplayFrame {
  const engagementSummaries = setup.units.map((unit) =>
    computeUnitEngagementSummary(
      setup.world,
      setup.identity,
      setup.loadout,
      setup.formation,
      unit.unitId,
    ),
  );
  return {
    tick,
    units: setup.units.map((unit) => {
      const anchor = getUnitAnchor(setup.formation, unit.unitId);
      const heading = getUnitHeading(setup.formation, unit.unitId);
      const loadout = getUnitLoadoutSummary(setup.loadout, unit.unitId);
      const threat = getUnitThreatSummary(setup.loadout, unit.unitId);
      const engagement = requireEngagementSummary(
        engagementSummaries,
        unit.unitId,
      );
      return {
        unitId: unit.unitId,
        factionId: unit.factionId,
        label: unit.label,
        side: unit.side,
        anchorX: anchor.x,
        anchorY: anchor.y,
        headingX: heading.x,
        headingY: heading.y,
        order: getUnitOrder(setup.formation, unit.unitId),
        movementStyle: getUnitMovementStyle(setup.formation, unit.unitId),
        weaponReachBand: loadout.weaponReachBand,
        armourClass: loadout.armourClass,
        shieldClass: loadout.shieldClass,
        threatRange: threat.threatRange,
        contactDistance: threat.contactDistance,
        engagementState: engagement.engagementState,
        primaryTargetUnitId: engagement.primaryTarget?.targetUnitId,
        attackCooldownTicks: getUnitAttackCooldownTicks(
          setup.tempo,
          unit.unitId,
        ),
        accumulatedDamage: getUnitAccumulatedDamage(
          setup.survivability,
          unit.unitId,
        ),
        maxDamageCapacity: getUnitMaxDamageCapacity(
          setup.survivability,
          unit.unitId,
        ),
        capacityReached: isUnitDamageCapacityReached(
          setup.survivability,
          unit.unitId,
        ),
      };
    }),
    entities: setup.individuals.map((individual) => ({
      entityId: individual.entityId,
      unitId: getUnitIdForEntity(setup.identity, individual.entityId),
      x: setup.world.positionsX[individual.entityId]!,
      y: setup.world.positionsY[individual.entityId]!,
    })),
    engagementSummaries,
    formationEvents,
    opportunities,
    strikes,
    applications,
    counts: {
      opportunities: opportunities.length,
      strikes: strikes.length,
      applications: applications.length,
    },
    lastApplication:
      applications.length > 0
        ? applications[applications.length - 1]
        : undefined,
    logLines,
  };
}

function requireEngagementSummary(
  summaries: readonly UnitEngagementSummary[],
  unitId: number,
): UnitEngagementSummary {
  const summary = summaries.find(
    (candidate) => candidate.sourceUnitId === unitId,
  );
  if (summary === undefined) {
    throw new RangeError("Replay frame is missing an engagement summary.");
  }
  return summary;
}

function formatLogLines(
  opportunities: readonly CombatAttackOpportunity[],
  strikes: readonly CombatStrikeResolution[],
  applications: readonly CombatSurvivabilityApplication[],
): readonly string[] {
  const lines: string[] = [];
  for (const opportunity of opportunities) {
    lines.push(
      `opportunity U${opportunity.sourceUnitId}->U${opportunity.targetUnitId} ${opportunity.weaponReachBand}`,
    );
  }
  for (const strike of strikes) {
    lines.push(
      `strike U${strike.sourceUnitId}->U${strike.targetUnitId} ${strike.consequenceKind} ${strike.damageValue}`,
    );
  }
  for (const application of applications) {
    lines.push(
      `application U${application.sourceUnitId}->U${application.targetUnitId} incoming ${application.incomingDamageValue} armour ${application.armourReduction} shield ${application.shieldReduction} applied ${application.appliedDamageValue} capacity ${application.capacityReached}`,
    );
  }
  return lines;
}
