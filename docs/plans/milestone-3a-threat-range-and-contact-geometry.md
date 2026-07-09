# Milestone 3A: Threat Range and Contact Geometry

Status: proposed.

## Purpose

Introduce deterministic threat/contact geometry using existing unit positions, unit identity, formation behaviour, and unit loadout taxonomy.

This milestone does not resolve attacks.

It answers:

- which units are close enough to threaten each other
- which hostile units are in front of a unit
- what contact distance should be used based on weapon reach
- whether a unit is in contact range, threat range, or outside range

The goal is to prepare for combat without implementing combat.

## Non-Goals

Do not implement:

- attack rolls
- attack timing
- damage
- armour mitigation
- hit points
- wounds
- death
- healing
- special-call resolution
- morale cascades
- routing logic
- physical collision displacement
- pathfinding
- A*
- terrain routing
- renderer changes
- UI changes
- worker protocol changes

Do not alter movement arbitration unless explicitly required by this milestone.

## Architecture Boundary

Create a new pure simulation module:

```txt
src/sim/threatGeometry.ts
```

Add tests:

```txt
tests/sim/threatGeometry.test.ts
```

The module may read:

- `WorldState`
- `UnitIdentityStore`
- `UnitLoadoutStore`
- unit members/factions
- unit loadout reach/category data

The module must not import:

- renderer code
- UI code
- worker code
- browser APIs
- PixiJS
- DOM APIs
- timers
- wall-clock time
- randomness

The module should be deterministic and headless.

## Concepts

### Threat range

Threat range is the distance at which a unit can plausibly affect or threaten an enemy based on weapon reach.

Suggested first mapping:

```txt
none: 0
close: 4
short: 8
medium: 12
long: 18
veryLong: 24
ranged: 80
```

Exact values can be tuned later.

### Contact distance

Contact distance is the preferred front distance when a unit with a given reach meets a hostile unit.

Suggested first mapping:

```txt
none: 1
close: 2
short: 4
medium: 6
long: 10
veryLong: 14
ranged: 24
```

For `ranged`, this does not mean “melee contact.” It means preferred threat spacing.

### Facing/front arc

This milestone should stay simple.

A target is “in front” if the projection from source anchor/entity to target is positive along the source heading.

No angular cone is required yet unless it stays trivial.

### Hostility

Use faction IDs from `UnitIdentityStore`.

Same faction = allied.

Different faction = hostile.

## Suggested Public API

```ts
export interface ThreatGeometryConfig {
  readonly defaultBodyRadius?: number;
}

export interface UnitThreatSummary {
  readonly unitId: UnitId;
  readonly weaponReachBand: WeaponReachBand;
  readonly threatRange: number;
  readonly contactDistance: number;
}

export interface UnitThreatContact {
  readonly sourceUnitId: UnitId;
  readonly targetUnitId: UnitId;
  readonly relationship: "allied" | "hostile";
  readonly distance: number;
  readonly forwardDistance: number;
  readonly lateralDistance: number;
  readonly inFront: boolean;
  readonly inThreatRange: boolean;
  readonly inContactRange: boolean;
}

export function getThreatRangeForReachBand(
  reachBand: WeaponReachBand,
): number;

export function getContactDistanceForReachBand(
  reachBand: WeaponReachBand,
): number;

export function getUnitThreatSummary(
  loadoutStore: UnitLoadoutStore,
  unitId: UnitId,
): UnitThreatSummary;

export function computeUnitThreatContact(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  sourceUnitId: UnitId,
  targetUnitId: UnitId,
): UnitThreatContact;

export function collectHostileThreatContacts(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  sourceUnitId: UnitId,
  out: UnitThreatContact[],
): UnitThreatContact[];
```

Exact names can change if Codex finds a cleaner naming scheme.

## Behavioural Requirements

- Reach bands map deterministically to threat range.
- Reach bands map deterministically to contact distance.
- Unknown unit IDs throw.
- Same-faction units are reported as allied.
- Different-faction units are reported as hostile.
- Forward/lateral distance should be computed using source heading where available.
- If source heading is not available in this module, use simple anchor/member centre-to-centre distance for this milestone.
- Prefer unit anchor or average member position, but be explicit and tested.
- Use `out` arrays for collection APIs to avoid unnecessary hot-path allocation.
- Do not scan all entities repeatedly where unit-level data is enough.
- Do not use spatial grid yet unless needed.
- Do not mutate world, identity, loadout, or formation state.

## Tests

Add tests for:

- each reach band maps to stable threat range.
- each reach band maps to stable contact distance.
- default/unarmed loadout has zero or near-zero threat.
- long/veryLong weapons produce larger threat/contact ranges than short weapons.
- ranged produces largest threat range.
- same-faction contact is allied.
- different-faction contact is hostile.
- hostile unit in front and within range is marked `inThreatRange`.
- hostile unit outside range is not marked `inThreatRange`.
- hostile unit within contact distance is marked `inContactRange`.
- target behind source is not marked `inFront`.
- lateral offset is computed deterministically.
- collection API reuses and clears the provided output array.
- repeated identical runs produce identical contact summaries.
- no world/loadout/identity state is mutated.

## Relationship To Existing Systems

This milestone prepares future combat.

It should not change `formationBehaviour.ts`.

Later milestones may use this module to adjust:

- `engageFront` contact distance
- attack opportunity
- second-rank polearm contribution
- ranged spacing
- combat tempo

But this milestone only creates the geometry layer.

## Done Criteria

Done when:

- `src/sim/threatGeometry.ts` exists.
- `tests/sim/threatGeometry.test.ts` exists.
- Unit loadout reach bands are used for threat/contact ranges.
- Hostile/allied contact summaries are deterministic.
- No combat/damage/effect resolution exists.
- Existing formation behaviour tests still pass.
- Existing loadout tests still pass.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run perf` passes.
- `npm run build` passes.
