# Milestone 3: Combat Foundation

Status: accepted / implemented through 3K.

## Purpose

Milestone 3 introduces combat-adjacent systems in controlled slices.

The goal is to move from movement and contact behaviour into deterministic combat foundations without jumping into full routing, death/removal, calls/shouts, or Empire-specific special effects.

Milestone 3 should answer, in order:

- what units can threaten each other
- how weapon reach changes hostile contact spacing
- which units are actually engaged
- when a unit has an attack opportunity
- how basic damage is represented
- how armour changes damage outcomes
- how combat resolution can flow through a reusable pipeline
- how combat consequences can feed pressure/cohesion records
- how morale/routing-risk hooks can be assessed without changing movement

The governing rule is: combat must emerge from existing movement, identity, loadout, reach, pressure, and cohesion systems. It must not become a separate arcade layer bolted onto the side.

Milestone 3 ends with combat foundation records and hooks. It does not implement full routing movement, death/removal, healing, calls/shouts, or special-effect resolution.

## Existing Foundation

Milestone 2 delivered movement and behaviour foundations:

- unit identity and footprints
- formation slot following
- blocker arbitration
- formed detour
- loose flow
- push-through disruption
- unit behaviour profiles
- loadout taxonomy
- threat/contact geometry
- reach-aware engageFront positioning

Milestone 3 should build on those systems rather than replace them.

## Design Principles

### Deterministic first

Every combat foundation system must be deterministic with seeded inputs.

No `Math.random`, wall-clock time, timers, browser APIs, worker APIs, PixiJS, DOM APIs, or renderer dependencies may enter `src/sim`.

### No hidden combat magic

Combat should be explainable through visible state:

- position
- facing/front relation
- reach
- formation state
- pressure
- cohesion
- confidence
- role/loadout
- engagement state

### Damage is not the first combat system

Before a unit can hurt another unit, the sim must know:

- who is in range
- who is in front
- who is engaged
- whether contact is stable enough to allow a strike
- whether a weapon can plausibly contribute

Damage comes after engagement and tempo.

### Empire-inspired, not full rules clone yet

The taxonomy may use Empire-like terms, but this milestone should not attempt to fully reproduce every live game rule.

Use simple abstractions first. Add fidelity only when the simulation needs it.

## Non-Goals For The Whole Milestone

Do not implement all of these at once.

Do not add:

- full combat resolution in one slice
- full Empire rules replication
- player skill trees
- spell lists
- ritual effects
- item enchantments
- global battle AI
- captain AI
- terrain routing
- A* pathfinding
- renderer/UI rewrites
- worker protocol rewrites unless explicitly scheduled
- visual screenshot tests
- calls/shouts before equipment/loadout expansion
- visual replay before there are more visible systems to inspect
- full routing/death/calls as part of Milestone 3 closeout

## Milestone 3 Slices

## 3A: Threat Range and Contact Geometry

Status: accepted / implemented.

Purpose:

Create a pure sim geometry layer that maps weapon reach bands to threat ranges and contact distances.

Key outputs:

- `src/sim/threatGeometry.ts`
- `tests/sim/threatGeometry.test.ts`
- deterministic reach/contact mapping
- unit-to-unit threat/contact summaries
- hostile/allied relationship detection

Boundary:

No movement integration, attacks, damage, armour mitigation, or special-call resolution.

Important caveat:

The first 3A geometry used a simple deterministic forward reference where formation heading was not available. Later movement/contact integration must use actual formation heading where it exists.

## 3B: Reach-Aware engageFront Positioning

Status: accepted / implemented after merge fix.

Purpose:

Use loadout reach/contact mapping to make hostile `engageFront` positioning respect weapon reach.

Key outputs:

- optional `FormationTickOptions`
- optional `loadoutStore` on `advanceFormationOneTick`
- no-loadout legacy behaviour preserved
- source unit reach band affects `engageFront` front-row spacing

Boundary:

No attacks, damage, armour mitigation, combat events, special calls, or hostile displacement.

Important rule:

This slice uses reach/contact distance only. It does not decide whether an attack happens.

## 3C: Combat Engagement Detection

Status: accepted / implemented.

Purpose:

Create deterministic engagement summaries describing which units are actually engaged with hostile units.

This is still not damage.

It should answer:

- is this unit engaged with a hostile unit?
- which hostile unit is it engaged with?
- is the hostile unit in front?
- is the hostile unit within contact range?
- is the hostile unit within threat range?
- is this engagement stable enough to become a future attack opportunity?

Suggested module:

```txt
src/sim/combatEngagement.ts
```

Suggested tests:

```txt
tests/sim/combatEngagement.test.ts
```

Suggested concepts:

- `UnitEngagementState`
- `UnitEngagementSummary`
- `collectUnitEngagements`
- `isUnitEngaged`
- `getPrimaryEngagement`

Possible engagement states:

```txt
none
threatening
contacting
engaged
```

Suggested meaning:

- `none`: no hostile unit in relevant threat/contact geometry
- `threatening`: hostile unit is in front and in threat range, but not contact range
- `contacting`: hostile unit is in contact range, but engagement has not been stable long enough
- `engaged`: hostile unit is in contact range and stable enough for later combat tempo

For 3C, stability can be simple and instantaneous if persistent tracking would overcomplicate the slice. If tracking is added, it must be explicit and deterministic.

Inputs:

- `WorldState`
- `UnitIdentityStore`
- `UnitLoadoutStore`
- `FormationBehaviourStore` if needed for anchors/headings/styles
- `threatGeometry` reach/contact mapping

Boundary:

Do not add attacks, damage, wounds, death, armour mitigation, healing, special-call resolution, morale cascades, routing logic, displacement, pathfinding, renderer changes, UI changes, worker changes, or dependencies.

## 3D: Attack Opportunity / Combat Tempo

Status: accepted / implemented.

Purpose:

Introduce deterministic attack-opportunity timing once engagements exist.

This milestone should answer:

- which engaged units are ready to attempt an attack?
- how often can different loadouts produce attack opportunities?
- how do pressure/cohesion affect attack opportunity?
- how does reach affect contribution?

Possible concepts:

- attack readiness
- attack cooldown
- pressure delay
- cohesion disruption delay
- second-rank support eligibility

Boundary:

This slice may produce “attack opportunity” events or summaries, but should still avoid damage if possible.

If damage is introduced here, the slice is too large and should be split.

## 3E: Basic Strike Resolution and Damage

Status: accepted / implemented.

Purpose:

Resolve basic attack opportunities into simple damage/pressure/consequence outputs.

This should be the first slice where something can actually hurt something.

Possible concepts:

- basic strike event
- target selection from engagement
- hit/impact abstraction
- damage or casualty pressure
- simple disruption

Boundary:

Keep armour simple or defer armour to 3F if needed.

Do not implement special calls yet.

Do not add full death/routing cascades unless explicitly scoped.

## 3F: Armour and Survivability

Status: accepted / implemented.

Purpose:

Make armour class and shield class matter to damage/survivability.

Possible concepts:

- armour mitigation
- shield protection
- dreadnought resilience
- mage armour special handling as data only unless effects are explicitly scoped

Boundary:

Do not implement every Empire armour rule at once.

Start with a deterministic abstraction.

## 3G: Integrated Combat Pipeline

Status: accepted / implemented.

Purpose:

Connect engagement, tempo, strike resolution, and survivability into one deterministic headless combat pipeline.

Boundary:

No consequences, morale/routing movement, death/removal, calls/shouts, healing, or special-effect handling.

## 3H: Performance Coverage

Status: accepted / implemented.

Purpose:

Extend combat performance coverage, including the 2000-entity case as the current largest-battlefield scale reference for Empire.

Boundary:

This slice adds coverage rather than optimisation. The 2000-entity combat case is intentionally recorded as a known future optimisation risk.

## 3I: Combat Pressure and Cohesion Consequence Records

Status: accepted / implemented.

Purpose:

Convert survivability applications into deterministic consequence records and apply accepted pressure changes to target unit members.

Boundary:

Cohesion remains record-only. No death/removal, wounds, healing, routing movement, calls/shouts, or special-effect pipeline.

## 3J: Combat Morale / Routing Transition Hooks

Status: accepted / implemented.

Purpose:

Read pressure/cohesion state plus recent consequence records and produce deterministic per-unit morale/routing-risk assessment records.

Boundary:

Assessment only. No routing movement, order changes, displacement, death/removal, healing, calls/shouts, or special-effect pipeline.

## 3K: Combat Foundation Consolidation and Hardening

Status: accepted / implemented.

Purpose:

Close Milestone 3 with integration coverage for the accepted chain and document hardening boundaries.

Boundary:

No new mechanics. Calls/shouts are deferred until after equipment/loadout expansion, visual replay is postponed until more visible systems exist, and Milestone 3 closes on records/hooks rather than full routing/death/calls.

## Preferred Implementation Order

Recommended order:

```txt
3A: threat/contact geometry ✅
3B: reach-aware engageFront positioning ✅
3C: combat engagement detection ✅
3D: attack opportunity / combat tempo ✅
3E: basic strike resolution and damage ✅
3F: armour and survivability ✅
3G: integrated combat pipeline ✅
3H: performance coverage, including 2000 entities ✅
3I: pressure/cohesion consequence records ✅
3J: morale/routing-risk assessment hooks ✅
3K: foundation consolidation and hardening ✅
```

Special calls/effects were intentionally removed from Milestone 3 and deferred until after equipment/loadout expansion.

## Testing Expectations

Every slice must include headless deterministic tests.

Expected checks:

- typecheck
- unit tests
- performance suite
- build
- deterministic replay-style comparisons where relevant
- no forbidden imports/APIs in sim code

Normal robot pipeline:

```txt
npm run typecheck
npm test
npm run perf
npm run build
```

Visual replay is postponed until more visible systems exist. Visual validation is not part of the Milestone 3 robot pipeline.

## Performance Expectations

Combat systems must avoid naive all-vs-all scans where possible.

Early small-scope tests may use simple scans, but hot-path systems should move toward:

- unit-level summaries
- spatial grid reuse
- out-array reuse
- stable deterministic iteration order

No benchmark thresholds are required yet unless a performance milestone explicitly adds them.

The 2000-entity combat performance case is the current scale reference. It is expensive enough to remain a known future optimisation risk, but optimisation is outside the 3K consolidation slice.

## Done Criteria For Milestone 3 Overall

Milestone 3 is done when the simulation can:

- determine unit threat/contact ranges from loadout reach
- position hostile contact according to reach
- identify engaged units
- create deterministic attack opportunities
- resolve basic damage/consequence outputs
- apply basic armour/survivability logic
- run the accepted engagement-to-survivability pipeline deterministically
- cover the 2000-entity combat performance reference case
- feed combat consequences into pressure/cohesion records
- produce morale/routing-risk assessment hooks

All of that must remain deterministic, headless, and testable without renderer/UI/worker involvement. Milestone 3 is complete when those foundations are covered; full routing movement, death/removal, healing, calls/shouts, visual replay, and special-effect resolution remain future work.
