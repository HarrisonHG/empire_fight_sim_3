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

export interface EnergyVisualGlyphSpec {
  readonly visible: boolean;
  readonly ratio: number;
  readonly band: IndividualEnergyBand;
  readonly color: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly change: EnergyVisualChange;
  readonly changeColor: number;
}

export function createEnergyVisualGlyphSpec(
  individual: Pick<
    LiveCombatDebugIndividualSnapshot,
    | "currentEnergy"
    | "maximumEnergy"
    | "energyBand"
    | "energyExpenditureAppliedThisTick"
    | "energyRecoveryAppliedThisTick"
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
  });
}
