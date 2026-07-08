const UINT32_RANGE = 0x1_0000_0000;
const MAX_UINT32 = 0xffff_ffff;
const ZERO_SEED_FALLBACK = 0x9e37_79b9;

/**
 * Deterministic xorshift32 generator. A zero seed is normalized to a fixed,
 * non-zero state because zero is an absorbing state for xorshift32.
 */
export class SeededRng {
  private currentState: number;

  public constructor(seed: number) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_UINT32) {
      throw new RangeError("RNG seed must be an unsigned 32-bit integer.");
    }

    this.currentState = seed === 0 ? ZERO_SEED_FALLBACK : seed;
  }

  public get state(): number {
    return this.currentState;
  }

  public nextUint32(): number {
    let value = this.currentState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.currentState = value >>> 0;
    return this.currentState;
  }

  public nextIntInclusive(minimum: number, maximum: number): number {
    if (
      !Number.isSafeInteger(minimum) ||
      !Number.isSafeInteger(maximum) ||
      maximum < minimum
    ) {
      throw new RangeError("RNG integer bounds must be ordered safe integers.");
    }

    const range = maximum - minimum + 1;
    if (range > UINT32_RANGE) {
      throw new RangeError("RNG integer range cannot exceed 2^32 values.");
    }

    const rejectionLimit = UINT32_RANGE - (UINT32_RANGE % range);
    let value: number;

    do {
      value = this.nextUint32();
    } while (value >= rejectionLimit);

    return minimum + (value % range);
  }
}
