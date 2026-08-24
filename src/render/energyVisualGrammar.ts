import type {
  IndividualEnergyBand,
} from "../sim/individualEnergy";
import type { LiveCombatDebugIndividualSnapshot } from "../sim/types";

export const ENERGY_VISUAL_RING_RADIUS = 18;
export const ENERGY_VISUAL_RING_START_ANGLE = -Math.PI / 2;

export const ENERGY_VISUAL_COLOR_BY_BAND = Object.freeze({
  fresh: 0x73_e8_ff,
  working: 0x62_e6_8b,
  winded: 0xff_c8_57,
  spent: 0xff_6b_78,
} satisfies Readonly<Record<IndividualEnergyBand, number>>);

export type EnergyVisualChange = "expenditure" | "recovery" | "stationary";
export type EnergyVisualActivity =
  | "sprinting"
  | "jogging"
  | "walking"
  | "recovery"
  | "exertion"
  | "stationary";

export const ENERGY_VISUAL_ACTIVITY_COLOR = Object.freeze({
  sprinting: 0xf4_72_b6,
  jogging: 0xf8_fa_fc,
  walking: 0x93_c5_fd,
  recovery: 0x60_a5_fa,
  exertion: 0xff_c8_57,
  stationary: 0x64_74_8b,
} satisfies Readonly<Record<EnergyVisualActivity, number>>);

export interface EnergyVisualGlyphSpec {
  readonly visible: boolean;
  readonly ratio: number;
  readonly band: IndividualEnergyBand;
  readonly color: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly change: EnergyVisualChange;
  readonly changeColor: number;
  readonly activity: EnergyVisualActivity;
  readonly activityColor: number;
}

export function createEnergyVisualGlyphSpec(
  individual: Pick<
    LiveCombatDebugIndividualSnapshot,
    | "currentEnergy"
    | "maximumEnergy"
    | "energyBand"
    | "energyExpenditureAppliedThisTick"
    | "energyRecoveryAppliedThisTick"
    | "energyActualPhysicalGait"
  >,
): EnergyVisualGlyphSpec {
  const maximum = individual.maximumEnergy;
  const current = individual.currentEnergy;
  const band = individual.energyBand;
  if (
    maximum === undefined || current === undefined || band === undefined ||
    !Number.isSafeInteger(maximum) || maximum <= 0 ||
    !Number.isSafeInteger(current) || current < 0 || current > maximum
  ) {
    return hiddenSpec();
  }
  const ratio = current / maximum;
  const expenditure = individual.energyExpenditureAppliedThisTick ?? 0;
  const recovery = individual.energyRecoveryAppliedThisTick ?? 0;
  const change: EnergyVisualChange = expenditure > 0
    ? "expenditure"
    : recovery > 0
      ? "recovery"
      : "stationary";
  const actualGait = individual.energyActualPhysicalGait;
  const activity: EnergyVisualActivity = actualGait === "sprinting" ||
      actualGait === "jogging" || actualGait === "walking"
    ? actualGait
    : recovery > 0
      ? "recovery"
      : expenditure > 0
        ? "exertion"
        : "stationary";
  return Object.freeze({
    visible: true,
    ratio,
    band,
    color: ENERGY_VISUAL_COLOR_BY_BAND[band],
    startAngle: ENERGY_VISUAL_RING_START_ANGLE,
    endAngle: ENERGY_VISUAL_RING_START_ANGLE + Math.PI * 2 * ratio,
    change,
    changeColor: change === "expenditure"
      ? 0xf8_fa_fc
      : change === "recovery"
        ? 0x60_a5_fa
        : 0x64_74_8b,
    activity,
    activityColor: ENERGY_VISUAL_ACTIVITY_COLOR[activity],
  });
}

function hiddenSpec(): EnergyVisualGlyphSpec {
  return Object.freeze({
    visible: false,
    ratio: 0,
    band: "spent" as const,
    color: ENERGY_VISUAL_COLOR_BY_BAND.spent,
    startAngle: ENERGY_VISUAL_RING_START_ANGLE,
    endAngle: ENERGY_VISUAL_RING_START_ANGLE,
    change: "stationary" as const,
    changeColor: 0x64_74_8b,
    activity: "stationary" as const,
    activityColor: ENERGY_VISUAL_ACTIVITY_COLOR.stationary,
  });
}
