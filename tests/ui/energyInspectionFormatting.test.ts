import { describe, expect, it } from "vitest";

import type { LiveCombatDebugIndividualSnapshot } from "../../src/sim/types";
import { formatEnergyInspection } from "../../src/ui/individualInspectionFormatting";

describe("energy inspection formatting", () => {
  it("keeps activity, gait, costs, recovery, burden, multipliers and rest separable", () => {
    expect(formatEnergyInspection({
      currentEnergy: 20,
      maximumEnergy: 100,
      energyRatioFixedPoint: 2_000,
      energyBand: "winded",
      energyActivityContext: "dragHelperMovement",
      energyRequestedPhysicalGait: "jogging",
      energyEffectivePhysicalGait: "walking",
      energyActualPhysicalGait: "walking",
      energyMaximumOrdinaryGait: "walking",
      energyMovementBaseExpenditureThisTick: 1,
      energyDragSurchargeThisTick: 12,
      energyAttackBaseExpenditureThisTick: 4,
      energyDefenceBaseExpenditureThisTick: 3,
      energyExpenditureAppliedThisTick: 20,
      energyRecoveryRequestedThisTick: 5,
      energyRecoveryAppliedThisTick: 0,
      energyArmourBurdenPoints: 4,
      energyHeldShieldBurdenPoints: 2,
      energyPrimaryWeaponBurdenPoints: 2,
      energyTotalBurdenPoints: 8,
      energyBurdenExertionMultiplierPercent: 180,
      energyAttackRecoveryDurationMultiplierPercent: 135,
      energyGuardReadinessRecoveryMultiplierPercent: 70,
      energyPressureRecoveryMultiplierPercent: 70,
      energyBehaviourRecommendation: "restWhenSafe",
      unitEnergyResting: true,
    } as unknown as LiveCombatDebugIndividualSnapshot)).toMatch(
      /20\/100.*winded.*dragHelperMovement.*jogging>walking>walking.*cost move 1\+drag 12.*recovery 0\/5.*burden 4\+2\+2=8 ×180%.*attack 135%.*guard 70%.*pressure 70%.*restWhenSafe.*resting yes/,
    );
  });

  it("does not invent energy state when bounded evidence is absent", () => {
    expect(formatEnergyInspection({} as unknown as LiveCombatDebugIndividualSnapshot))
      .toBe("--");
  });
});
