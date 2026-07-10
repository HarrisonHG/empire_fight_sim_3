import { describe, expect, it } from "vitest";

import { COMBAT_REPLAY_SCENARIOS } from "../../experiments/combat-replay/src/combatReplayScenarios";
import type {
  CombatReplayFrame,
  CombatReplayRecord,
} from "../../experiments/combat-replay/src/combatReplayTypes";
import { recordCombatReplayScenario } from "../../experiments/combat-replay/src/recordCombatReplay";

const FORBIDDEN_REPLAY_TERMS = [
  "death",
  "dead",
  "removed",
  "removal",
  "wound",
  "wounds",
  "healing",
  "morale",
  "routing",
  "routed",
  "specialCall",
  "specialCallResolution",
  "displacement",
  "hitLocation",
] as const;

describe("combat replay scenarios", () => {
  it("records the accepted structural summary for every combat replay scenario", () => {
    const summaries = COMBAT_REPLAY_SCENARIOS.map((scenario) =>
      summariseReplay(recordCombatReplayScenario(scenario)),
    );

    expect(summaries).toEqual([
      {
        id: "no-engagement",
        frames: 5,
        units: 2,
        entities: 2,
        totalOpportunities: 0,
        totalStrikes: 0,
        totalApplications: 0,
        finalSourceStates: ["none"],
        capacityReachedUnits: [],
        finalDamageByUnit: [
          [10, 0],
          [20, 0],
        ],
      },
      {
        id: "threatening-only",
        frames: 5,
        units: 2,
        entities: 2,
        totalOpportunities: 0,
        totalStrikes: 0,
        totalApplications: 0,
        finalSourceStates: ["threatening"],
        capacityReachedUnits: [],
        finalDamageByUnit: [
          [10, 0],
          [20, 0],
        ],
      },
      {
        id: "contacting-not-engaged",
        frames: 5,
        units: 2,
        entities: 2,
        totalOpportunities: 0,
        totalStrikes: 0,
        totalApplications: 0,
        finalSourceStates: ["contacting"],
        capacityReachedUnits: [],
        finalDamageByUnit: [
          [10, 0],
          [20, 0],
        ],
      },
      {
        id: "engage-front-cooldown",
        frames: 12,
        units: 2,
        entities: 2,
        totalOpportunities: 1,
        totalStrikes: 1,
        totalApplications: 1,
        finalSourceStates: ["engaged"],
        capacityReachedUnits: [],
        finalDamageByUnit: [
          [10, 0],
          [20, 1],
        ],
      },
      {
        id: "strike-and-damage",
        frames: 4,
        units: 2,
        entities: 2,
        totalOpportunities: 1,
        totalStrikes: 1,
        totalApplications: 1,
        finalSourceStates: ["engaged"],
        capacityReachedUnits: [],
        finalDamageByUnit: [
          [10, 0],
          [20, 1],
        ],
      },
      {
        id: "armour-shield-absorbs",
        frames: 4,
        units: 2,
        entities: 2,
        totalOpportunities: 1,
        totalStrikes: 1,
        totalApplications: 1,
        finalSourceStates: ["engaged"],
        capacityReachedUnits: [],
        finalDamageByUnit: [
          [10, 0],
          [20, 0],
        ],
      },
      {
        id: "capacity-reached-marker",
        frames: 4,
        units: 2,
        entities: 2,
        totalOpportunities: 1,
        totalStrikes: 1,
        totalApplications: 1,
        finalSourceStates: ["engaged"],
        capacityReachedUnits: [20],
        finalDamageByUnit: [
          [10, 0],
          [20, 1],
        ],
      },
      {
        id: "multi-pair-determinism",
        frames: 4,
        units: 4,
        entities: 4,
        totalOpportunities: 2,
        totalStrikes: 2,
        totalApplications: 2,
        finalSourceStates: ["engaged", "engaged"],
        capacityReachedUnits: [],
        finalDamageByUnit: [
          [10, 0],
          [20, 1],
          [30, 0],
          [40, 1],
        ],
      },
    ]);
  });

  it("records deterministic replay output from repeated scenario construction", () => {
    for (const scenario of COMBAT_REPLAY_SCENARIOS) {
      const first = recordCombatReplayScenario(scenario);
      const second = recordCombatReplayScenario(scenario);

      expect(serialiseReplay(first)).toBe(serialiseReplay(second));
    }
  });

  it("keeps non-engagement, threatening, and contacting scenarios free of combat applications", () => {
    for (const scenarioId of [
      "no-engagement",
      "threatening-only",
      "contacting-not-engaged",
    ]) {
      const replay = recordScenario(scenarioId);

      expect(totalRecords(replay, "opportunities")).toBe(0);
      expect(totalRecords(replay, "strikes")).toBe(0);
      expect(totalRecords(replay, "applications")).toBe(0);
      expect(finalFrame(replay).units.map((unit) => unit.accumulatedDamage)).toEqual([
        0,
        0,
      ]);
    }
  });

  it("shows engagement and cooldown before the first delayed strike fires", () => {
    const replay = recordScenario("engage-front-cooldown");
    const firstOpportunityFrame = replay.frames.find(
      (frame) => frame.opportunities.length > 0,
    );

    expect(firstOpportunityFrame?.tick).toBe(10);
    expect(
      replay.frames
        .slice(1, firstOpportunityFrame?.tick)
        .some((frame) => sourceStates(frame).includes("engaged")),
    ).toBe(true);
    expect(
      replay.frames
        .slice(1, firstOpportunityFrame?.tick)
        .every((frame) => frame.opportunities.length === 0),
    ).toBe(true);
  });

  it("records armour and shield mitigation without adding downstream effects", () => {
    const replay = recordScenario("armour-shield-absorbs");
    const applications = replay.frames.flatMap((frame) => frame.applications);

    expect(applications).toEqual([
      expect.objectContaining({
        incomingDamageValue: 1,
        armourReduction: 1,
        shieldReduction: 1,
        appliedDamageValue: 0,
        accumulatedDamageBefore: 0,
        accumulatedDamageAfter: 0,
        capacityReached: false,
      }),
    ]);
    expect(finalFrame(replay).entities.map((entity) => entity.entityId)).toEqual([
      0,
      1,
    ]);
  });

  it("marks capacity reached without death, removal, or entity-count changes", () => {
    const replay = recordScenario("capacity-reached-marker");
    const frame = finalFrame(replay);

    expect(frame.entities.map((entity) => entity.entityId)).toEqual([0, 1]);
    expect(frame.units.find((unit) => unit.unitId === 20)).toMatchObject({
      accumulatedDamage: 1,
      maxDamageCapacity: 1,
      capacityReached: true,
    });
    expect(serialiseReplay(replay)).not.toMatch(forbiddenReplayTermPattern());
  });

  it("preserves multi-pair record ordering across pipeline stages", () => {
    const replay = recordScenario("multi-pair-determinism");

    expect(
      replay.frames.flatMap((frame) =>
        frame.opportunities.map((record) => record.targetUnitId),
      ),
    ).toEqual([20, 40]);
    expect(
      replay.frames.flatMap((frame) =>
        frame.strikes.map((record) => record.targetUnitId),
      ),
    ).toEqual([20, 40]);
    expect(
      replay.frames.flatMap((frame) =>
        frame.applications.map((record) => record.targetUnitId),
      ),
    ).toEqual([20, 40]);
  });

  it("does not record out-of-scope combat consequences in scenario output", () => {
    for (const scenario of COMBAT_REPLAY_SCENARIOS) {
      const replay = recordCombatReplayScenario(scenario);

      expect(serialiseReplay(replay)).not.toMatch(forbiddenReplayTermPattern());
    }
  });
});

interface ReplaySummary {
  readonly id: string;
  readonly frames: number;
  readonly units: number;
  readonly entities: number;
  readonly totalOpportunities: number;
  readonly totalStrikes: number;
  readonly totalApplications: number;
  readonly finalSourceStates: readonly string[];
  readonly capacityReachedUnits: readonly number[];
  readonly finalDamageByUnit: ReadonlyArray<readonly [number, number]>;
}

function recordScenario(scenarioId: string): CombatReplayRecord {
  const scenario = COMBAT_REPLAY_SCENARIOS.find(
    (candidate) => candidate.id === scenarioId,
  );
  if (scenario === undefined) {
    throw new Error(`Missing replay scenario ${scenarioId}.`);
  }
  return recordCombatReplayScenario(scenario);
}

function summariseReplay(replay: CombatReplayRecord): ReplaySummary {
  const frame = finalFrame(replay);
  return {
    id: replay.scenario.id,
    frames: replay.frames.length,
    units: frame.units.length,
    entities: frame.entities.length,
    totalOpportunities: totalRecords(replay, "opportunities"),
    totalStrikes: totalRecords(replay, "strikes"),
    totalApplications: totalRecords(replay, "applications"),
    finalSourceStates: sourceStates(frame),
    capacityReachedUnits: frame.units
      .filter((unit) => unit.capacityReached)
      .map((unit) => unit.unitId),
    finalDamageByUnit: frame.units.map((unit) => [
      unit.unitId,
      unit.accumulatedDamage,
    ]),
  };
}

function sourceStates(frame: CombatReplayFrame): readonly string[] {
  return frame.units
    .filter((unit) => unit.side === "source")
    .map((unit) => unit.engagementState);
}

function totalRecords(
  replay: CombatReplayRecord,
  key: "opportunities" | "strikes" | "applications",
): number {
  return replay.frames.reduce((total, frame) => total + frame[key].length, 0);
}

function finalFrame(replay: CombatReplayRecord): CombatReplayFrame {
  return replay.frames[replay.frames.length - 1]!;
}

function serialiseReplay(replay: CombatReplayRecord): string {
  return JSON.stringify(replay);
}

function forbiddenReplayTermPattern(): RegExp {
  return new RegExp(FORBIDDEN_REPLAY_TERMS.join("|"), "i");
}
