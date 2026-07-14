import { describe, expect, it } from "vitest";

import { INDIVIDUAL_COMBAT_VISUAL_SCENARIO } from "../../src/content/individualCombatVisualScenario";
import {
  createInitialSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import type { LiveCombatDebugIndividualSnapshot } from "../../src/sim/types";
import {
  buildIndividualInspectionRows,
  formatRetainedInspectionEvent,
} from "../../src/ui/individualInspectionFormatting";
import {
  createInitialDebugPanelVisibilityState,
  debugPanelAriaExpanded,
  debugPanelToggleLabel,
  describeDebugPanelVisibility,
  toggleDebugPanelVisibility,
} from "../../src/ui/debugPanelVisibility";
import {
  areReachOverlaysVisible,
  createInitialReachOverlayVisibilityState,
  reachOverlayAriaPressed,
  reachOverlayToggleLabel,
  toggleReachOverlayVisibility,
} from "../../src/ui/reachOverlayVisibility";

describe("debug panel visibility UI state", () => {
  it("starts shown for a newly created scenario UI", () => {
    const state = createInitialDebugPanelVisibilityState();

    expect(state).toBe("shown");
    expect(debugPanelToggleLabel(state)).toBe("Hide debug panels");
    expect(debugPanelAriaExpanded(state)).toBe("true");
    expect(describeDebugPanelVisibility(state, true)).toEqual({
      metricsPanelHidden: false,
      visualTestScenarioPanelHidden: false,
      simulationControlsHidden: false,
      canvasHidden: false,
    });
  });

  it("hides both overlay panels while keeping controls and canvas visible", () => {
    const hidden = toggleDebugPanelVisibility("shown");

    expect(hidden).toBe("hidden");
    expect(debugPanelToggleLabel(hidden)).toBe("Show debug panels");
    expect(debugPanelAriaExpanded(hidden)).toBe("false");
    expect(describeDebugPanelVisibility(hidden, true)).toEqual({
      metricsPanelHidden: true,
      visualTestScenarioPanelHidden: true,
      simulationControlsHidden: false,
      canvasHidden: false,
    });
  });

  it("showing panels restores the overlay visibility", () => {
    const shown = toggleDebugPanelVisibility(toggleDebugPanelVisibility("shown"));

    expect(shown).toBe("shown");
    expect(describeDebugPanelVisibility(shown, true)).toEqual({
      metricsPanelHidden: false,
      visualTestScenarioPanelHidden: false,
      simulationControlsHidden: false,
      canvasHidden: false,
    });
  });

  it("does not require a visual-test scenario panel on non-visual routes", () => {
    expect(describeDebugPanelVisibility("hidden", false)).toEqual({
      metricsPanelHidden: true,
      visualTestScenarioPanelHidden: false,
      simulationControlsHidden: false,
      canvasHidden: false,
    });
  });

  it("preserves retained inspection events across hide and show", () => {
    let visibility = createInitialDebugPanelVisibilityState();
    const retained = new Map<number, string>();
    const defender = individualSnapshot({
      entityId: 6,
      unitId: 303,
      thisTickDefenceOutcome: "landed",
      thisTickIncomingParryCount: 1,
      thisTickIncomingLandedCount: 1,
    });
    retained.set(defender.entityId, formatRetainedInspectionEvent(6, defender));

    visibility = toggleDebugPanelVisibility(visibility);
    expect(describeDebugPanelVisibility(visibility, true).metricsPanelHidden)
      .toBe(true);

    visibility = toggleDebugPanelVisibility(visibility);
    const rows = buildIndividualInspectionRows(
      7,
      [
        individualSnapshot({
          entityId: 6,
          unitId: 303,
        }),
      ],
      [{ unitId: 303, label: "Overwhelmed parrier" }],
      retained,
    );

    expect(visibility).toBe("shown");
    expect(rows[0]?.latestEvent).toBe("t5 def:landed in:P1/B0/S0/L1");
  });

  it("does not alter the current tick or simulation snapshot", () => {
    const simulation = createSimulation(INDIVIDUAL_COMBAT_VISUAL_SCENARIO);
    const before = createInitialSnapshot(simulation);
    let visibility = createInitialDebugPanelVisibilityState();

    visibility = toggleDebugPanelVisibility(visibility);
    visibility = toggleDebugPanelVisibility(visibility);

    expect(visibility).toBe("shown");
    expect(simulation.tick).toBe(0);
    expect(createInitialSnapshot(simulation)).toEqual(before);
  });

  it("toggles reach overlay renderer visibility state only", () => {
    let reachState = createInitialReachOverlayVisibilityState();
    const simulation = createSimulation(INDIVIDUAL_COMBAT_VISUAL_SCENARIO);
    const before = createInitialSnapshot(simulation);

    expect(reachState).toBe("shown");
    expect(reachOverlayToggleLabel(reachState)).toBe("Hide reach overlays");
    expect(reachOverlayAriaPressed(reachState)).toBe("true");
    expect(areReachOverlaysVisible(reachState)).toBe(true);

    reachState = toggleReachOverlayVisibility(reachState);
    expect(reachOverlayToggleLabel(reachState)).toBe("Show reach overlays");
    expect(reachOverlayAriaPressed(reachState)).toBe("false");
    expect(areReachOverlaysVisible(reachState)).toBe(false);

    reachState = toggleReachOverlayVisibility(reachState);
    expect(reachState).toBe("shown");
    expect(areReachOverlaysVisible(reachState)).toBe(true);
    expect(simulation.tick).toBe(0);
    expect(createInitialSnapshot(simulation)).toEqual(before);
  });
});

function individualSnapshot(
  overrides: Partial<LiveCombatDebugIndividualSnapshot>,
): LiveCombatDebugIndividualSnapshot {
  return {
    entityId: 0,
    unitId: 101,
    tickStartCombatEligible: true,
    selectedTargetEntityId: null,
    selectedTargetDistanceSquared: null,
    selectedTargetWithinPreferredDistance: null,
    actionState: "ready",
    lockedTargetEntityId: null,
    facing: { x: 1, y: 0 },
    commitmentTicksRemaining: 0,
    attackRecoveryTicksRemaining: 0,
    guardState: "ready",
    defenceRecoveryTicksRemaining: 0,
    activeWeapon: "oneHanded",
    shieldCategory: "none",
    shieldCarriedState: "none",
    currentGlobalHits: 1,
    maximumGlobalHits: 1,
    thisTickAttackOutcome: "none",
    thisTickDefenceOutcome: "none",
    thisTickOutgoingDefenceOutcome: "none",
    thisTickLandedHitGateOutcome: "none",
    thisTickIncomingParryCount: 0,
    thisTickIncomingBucklerBlockCount: 0,
    thisTickIncomingShieldBlockCount: 0,
    thisTickIncomingLandedCount: 0,
    thisTickAppliedHitLoss: 0,
    reachedZeroHitsThisTick: false,
    ...overrides,
  };
}
