import { describe, expect, it } from "vitest";

import {
  INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS,
  INDIVIDUAL_LOCAL_RIGHT_OF_WAY_SOURCE,
  createIndividualMovementRightOfWayStore,
  selectLocalRightOfWayYielder,
} from "../../src/sim/individualMovementRightOfWay";

describe("Milestone 8G local right-of-way contract", () => {
  it("compares generic projected classes without knowing role names", () => {
    const store = createIndividualMovementRightOfWayStore(2);
    store.classCodes[0] = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.baseline;
    store.classCodes[1] = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.elevated;
    expect(selectLocalRightOfWayYielder(store, 0, 1)).toBe(0);

    store.classCodes[0] = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.high;
    expect(selectLocalRightOfWayYielder(store, 0, 1)).toBe(1);

    store.classCodes[1] = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.high;
    expect(selectLocalRightOfWayYielder(store, 0, 1)).toBe(-1);
  });

  it("orders urgent medical below accepted forced and group authorities", () => {
    expect(INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.baseline).toBeLessThan(
      INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.urgentSupport,
    );
    expect(INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.urgentSupport).toBeLessThan(
      INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.forceful,
    );
    expect(INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.forceful).toBeLessThan(
      INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.urgentGroup,
    );
    expect(INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.urgentGroup).toBeLessThan(
      INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.forced,
    );
    expect(INDIVIDUAL_LOCAL_RIGHT_OF_WAY_SOURCE.urgentMedicalResponse)
      .not.toBe(INDIVIDUAL_LOCAL_RIGHT_OF_WAY_SOURCE.assistedRescue);
  });
});
