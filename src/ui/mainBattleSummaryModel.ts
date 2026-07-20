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
  }
  return Object.freeze(
    [...summaries.values()]
      .sort((left, right) => left.factionId - right.factionId)
      .map((summary) => Object.freeze({ ...summary })),
  );
}

type MutableSideSummary = {
  -readonly [Key in keyof MainBattleSideSummaryValue]: MainBattleSideSummaryValue[Key];
};
