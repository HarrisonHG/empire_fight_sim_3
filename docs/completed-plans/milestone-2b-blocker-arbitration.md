# Milestone 2B: Unit Footprint Blocker Arbitration

Status: proposed; implementation must not start until this plan is accepted.

## Goal

Add deterministic unit-level blocker arbitration for movement.

Milestone 2A proved that units can use anchors, formation slots, cautious advance, troop discipline differences, pressure jitter, stuck state, ordered halt, and transition-only movement events.

Milestone 2B answers the next question:

> When another unit footprint blocks this unit, what high-level movement style does this unit choose?

This milestone must choose one current unit movement style from a small set, without implementing full pathfinding, combat, morale, or rich collision.

## Current 2A Baseline

Existing 2A behaviour includes:

- unit anchors
- formation-slot following
- cautious advance
- ordered halt
- recruit/veteran discipline differences
- pressure effects
- stuck state
- transition-only movement events
- `formedMarch` as the pre-arbitration advancing baseline
- `orderedHalt` as the hold-order style

2B must preserve those behaviours.

## Movement Styles

2B should support these unit movement styles:

- `formedMarch`
- `orderedHalt`
- `formedDetour`
- `looseFlow`
- `pushThrough`
- `haltAndWait`
- `engageFront`

Definitions for this slice:

### formedMarch

The unit is advancing in formation and no meaningful unit-level blocker has changed its style.

### orderedHalt

The unit has been explicitly ordered to hold or halt.

This is not blocker arbitration.

### formedDetour

The unit has detected an allied or neutral blocker and chooses to preserve formation while attempting to avoid the blocker later.

This milestone may choose the style but does not need to implement real detour pathfinding.

### looseFlow

The unit has detected an allied or neutral blocker and chooses a looser movement style where individuals may later flow around the obstacle.

This milestone may choose the style but does not need to implement individual flow.

### pushThrough

The unit has detected an allied blocker and chooses to push through because its discipline/confidence/aggression is high enough relative to the blocker.

This milestone may choose the style but does not need to implement full disruption, displacement, or collision consequences.

### haltAndWait

The unit has detected an allied or neutral blocker and chooses to stop rather than detour, flow, or push.

This is a blocker-arbitration result, distinct from `orderedHalt`.

### engageFront

The unit has detected a hostile blocker in front and chooses to engage the front.

This milestone must not implement attacks, damage, parries, combat tempo, morale shock, or weapon modelling.

`engageFront` means style selection only.

## Non-Goals

Do not implement:

- full combat
- attack resolution
- parry modelling
- damage systems
- combat tempo
- morale cascades
- captain AI
- command influence
- magic
- complex weapon modelling
- individual A* pathing around living entities
- terrain pathfinding
- renderer changes
- UI changes
- worker protocol changes
- full collision resolution
- full pressure/threat scoring
- detailed routing behaviour
- actual detour routes
- actual loose-flow individual bypass
- actual push-through displacement
- actual engage-front combat

## Architecture

Changes should stay mostly in:

- `src/sim/`
- `tests/sim/`
- `tests/performance/` only if justified

Do not modify:

- `src/render/`
- `src/ui/`
- `src/worker/`
- renderer snapshots
- worker protocol
- browser UI
- package/config files

unless a tiny type-only change is absolutely required and explicitly justified.

The simulation must remain deterministic and headless-testable.

## Data Additions

Add only the minimum data needed for blocker arbitration.

Likely additions:

- unit movement style
- previous movement style
- style commitment ticks remaining
- blocker kind
- blocker unit ID if known
- blocker faction relationship
- blocker distance or broad front/near classification
- last emitted movement style for transition-only events, if not already present

Avoid adding rich concepts such as:

- threat scores
- morale effects
- combat contact state
- captain command state
- full path routes
- collision impulses
- displacement state

## Blocker Detection

Use existing infrastructure where possible:

- unit identity
- faction identity
- unit summaries / footprints
- unit local queries
- spatial grid

Do not use all-units-against-all-units or all-entities-against-all-entities scans in normal movement paths.

Blocker detection should be deterministic.

A first safe implementation can use simple unit summary/footprint checks:

- unit centre
- unit bounds or extents
- movement heading
- forward search distance
- approximate overlap or near-front check

The detection does not need to be perfect. It needs to be deterministic, testable, and structurally ready for refinement.

## Faction Relationship

For this milestone:

- same faction = allied
- different faction = hostile

No diplomacy system.

No hostility effects beyond movement style choice.

## Arbitration Rules

Arbitration should choose exactly one movement style per unit.

Suggested first-pass priority:

1. If unit has an explicit hold/halt order, choose `orderedHalt`.
2. If hostile blocker is in the forward path, choose `engageFront`.
3. If allied/neutral blocker is in the forward path:
   - high confidence/aggression/discipline may choose `pushThrough`
   - high discipline/cohesion but lower aggression may choose `formedDetour`
   - low discipline/cohesion may choose `looseFlow`
   - cautious/low confidence may choose `haltAndWait`
4. If no blocker is relevant, choose `formedMarch`.

If existing 2A data does not have confidence/aggression/cohesion, use the smallest already-existing equivalent. If none exists, add simple deterministic numeric fields with conservative defaults.

Do not invent a large personality system.

## Style Commitment / Hysteresis

To avoid flickering between styles every tick, add a short style commitment.

Suggested rule:

- when a unit changes into a blocker-arbitration style, commit for a small fixed number of ticks
- while committed, keep the style unless:
  - the unit receives an explicit ordered halt
  - the hostile/allied relationship changes in a way that invalidates the style
  - the blocker disappears for a defined release window

Use simple integer tick counters.

No wall-clock time.

No render frame time.

## Events

Movement-style events should be transition-only.

Do not emit the same style every tick.

Event payload should be minimal:

- tick
- unit ID
- previous style
- new style
- reason
- blocker unit ID if available
- blocker kind if available

If the existing event system is narrower, adapt to it rather than expanding into a giant event architecture.

## Implementation Order

### 2B-1: Blocker detection and style choice

- Add or extend movement style types.
- Add simple blocker result type.
- Detect forward blockers using existing unit summaries/local queries/spatial grid.
- Distinguish allied vs hostile blockers.
- Choose a single style.
- Add tests for style choice only.

No movement consequences yet beyond selected style.

### 2B-2: Commitment and transition events

- Add style commitment tick state.
- Prevent oscillation between styles.
- Emit style events only on transition.
- Add tests for no repeated events and no style flicker.

### 2B-3: Minimal anchor effect, only if already safe

Only if 2B-1 and 2B-2 are stable:

- `haltAndWait` prevents anchor advance.
- `engageFront` prevents pushing past the hostile front.
- `formedMarch` remains unchanged.
- Other styles may be selected but not deeply executed yet.

Do not implement real detour, loose flow, or push-through displacement in this milestone unless already trivial and tested.

### 2B-4: Performance check

Add or extend performance tests only if blocker arbitration runs as part of normal formation ticks.

Measure:

- 100 units if available
- 1,000 entities
- 2,000 entities if supported
- tick time
- event count
- style transition count

Assertions should be structural and avoid tight machine-dependent thresholds.

## Tests To Add

Headless tests should cover:

- no blocker chooses `formedMarch`
- explicit hold chooses `orderedHalt`
- allied blocker can choose `haltAndWait`
- allied blocker can choose `formedDetour`
- allied blocker can choose `looseFlow`
- allied blocker can choose `pushThrough`
- hostile blocker chooses `engageFront`
- `engageFront` does not deal damage or trigger combat
- blocker arbitration chooses one style, not multiple
- style does not oscillate every tick
- style transition event emits once on change
- same style does not emit every tick
- disappearing blocker eventually releases the blocker style
- deterministic replay gives identical style sequence and events

Where exact style depends on discipline/confidence/cohesion, tests should set those values explicitly.

## Performance Checks

If arbitration is integrated into formation ticks, add a performance scenario.

It should record:

- entity count
- unit count
- tick count
- mean tick time
- p95 tick time if already used by existing perf style
- max tick time
- movement style transition count
- event count

Do not add strict timing thresholds unless they are very loose red-flag guards.

## Risks

### Scope creep into combat

`engageFront` is the largest risk. It must remain style selection only.

### Fake pathfinding

`formedDetour` sounds like pathfinding. It is not pathfinding yet.

### Hidden all-to-all checks

Blocker detection must use existing local query/spatial infrastructure.

### Style flicker

Without commitment/hysteresis, units may swap styles every tick.

### Behaviour soup

Do not combine detour, flow, push, and engage effects in one implementation pass.

### Naming collision

`orderedHalt` means explicit hold order.

`haltAndWait` means blocker-arbitration halt.

Keep both.

## Done Criteria

Milestone 2B is done when:

- unit blocker detection exists in pure simulation code
- blocker relationship can distinguish allied vs hostile using existing faction identity
- each unit chooses one movement style from the accepted style set
- `formedMarch` and `orderedHalt` from 2A remain valid
- `haltAndWait` is used only for blocker-arbitration halt
- `engageFront` is style-only and does not implement combat
- style commitment prevents obvious oscillation
- movement style events are transition-only
- deterministic replay of style choices passes
- headless tests cover the core blocker/style cases
- relevant performance checks pass or are explicitly not needed
- `npm run typecheck` passes
- `npm test` passes
- `npm run perf` passes
- `npm run build` passes
- no renderer, UI, worker protocol, full combat, pathfinding, or gameplay expansion has been introduced

## Remains For Milestone 2C

- actual detour path shaping
- loose individual flow around blockers
- push-through disruption and consequences
- better front/contact positioning
- richer pressure/cohesion consequences
- integration with combat range and attack systems
- command/captain influence