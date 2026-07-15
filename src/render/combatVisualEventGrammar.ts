import type {
  InspectedCombatVisualEvent,
  InspectedCombatVisualEventKind,
} from "../sim/types";

export const COMBAT_VISUAL_EVENT_LIFETIME_TICKS = 10;
export const MAX_RETAINED_COMBAT_VISUAL_EVENTS = 96;

export interface CombatVisualEventGlyphSpec {
  readonly kind: InspectedCombatVisualEventKind;
  readonly shape:
    | "line"
    | "cross"
    | "smallCircle"
    | "broadArc"
    | "hollowCross"
    | "burst"
    | "filledPulse"
    | "brokenRing"
    | "hitLossText"
    | "downPulse";
  readonly color: number;
}

export interface RetainedCombatVisualEvent {
  readonly event: InspectedCombatVisualEvent;
  readonly attackerX: number;
  readonly attackerY: number;
  readonly targetX: number;
  readonly targetY: number;
}

export const COMBAT_VISUAL_EVENT_GLYPHS: Readonly<
  Record<InspectedCombatVisualEventKind, CombatVisualEventGlyphSpec>
> = Object.freeze({
  attackAttempt: Object.freeze({
    kind: "attackAttempt",
    shape: "line",
    color: 0xff_f3_a3,
  }),
  parry: Object.freeze({ kind: "parry", shape: "cross", color: 0x7d_ff_c7 }),
  bucklerBlock: Object.freeze({
    kind: "bucklerBlock",
    shape: "smallCircle",
    color: 0x93_c5_fd,
  }),
  shieldBlock: Object.freeze({
    kind: "shieldBlock",
    shape: "broadArc",
    color: 0x60_a5_fa,
  }),
  failedDefence: Object.freeze({
    kind: "failedDefence",
    shape: "hollowCross",
    color: 0xff_b8_6b,
  }),
  landed: Object.freeze({ kind: "landed", shape: "burst", color: 0xfb_71_85 }),
  gateAccepted: Object.freeze({
    kind: "gateAccepted",
    shape: "filledPulse",
    color: 0x22_c5_5e,
  }),
  gateRejected: Object.freeze({
    kind: "gateRejected",
    shape: "brokenRing",
    color: 0xf9_73_16,
  }),
  hitApplied: Object.freeze({
    kind: "hitApplied",
    shape: "hitLossText",
    color: 0xff_ff_ff,
  }),
  zeroHit: Object.freeze({
    kind: "zeroHit",
    shape: "downPulse",
    color: 0xef_44_44,
  }),
});

export function getCombatVisualEventGlyphSpec(
  kind: InspectedCombatVisualEventKind,
): CombatVisualEventGlyphSpec {
  return COMBAT_VISUAL_EVENT_GLYPHS[kind];
}

export function retainedCombatVisualEventKey(
  event: InspectedCombatVisualEvent,
): string {
  return (
    `${event.tick}:${event.kind}:` +
    `${event.attackerEntityId}:${event.targetEntityId}:${event.appliedHitLoss}`
  );
}

export function isRetainedCombatVisualEventExpired(
  currentSnapshotTick: number,
  eventTick: number,
): boolean {
  return currentSnapshotTick - eventTick > COMBAT_VISUAL_EVENT_LIFETIME_TICKS;
}

export function pruneRetainedCombatVisualEvents(
  retainedEvents: RetainedCombatVisualEvent[],
  currentSnapshotTick: number,
): void {
  let writeIndex = 0;
  for (let index = 0; index < retainedEvents.length; index += 1) {
    const retained = retainedEvents[index]!;
    if (
      isRetainedCombatVisualEventExpired(
        currentSnapshotTick,
        retained.event.tick,
      )
    ) {
      continue;
    }
    retainedEvents[writeIndex] = retained;
    writeIndex += 1;
  }
  retainedEvents.length = writeIndex;
  if (retainedEvents.length > MAX_RETAINED_COMBAT_VISUAL_EVENTS) {
    retainedEvents.splice(
      0,
      retainedEvents.length - MAX_RETAINED_COMBAT_VISUAL_EVENTS,
    );
  }
}
