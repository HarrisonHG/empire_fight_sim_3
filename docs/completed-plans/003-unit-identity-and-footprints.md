# Milestone 002: Unit Identity, Factions, and Footprints

Status: proposed; implementation must not start until this plan is accepted.

This plan follows `AGENTS.md`, all `src/*/AGENTS.md` files, `docs/codex/*`,
`specs/simulation-platform/spec.md`, `specs/spatial-grid/spec.md`, and
`docs/completed-plans/002-spatial-grid.md`.

`docs/design/unit-movement.md`, `docs/design/combat-behaviour.md`, and
`docs/design/captains-and-orders.md` are design doctrine for future movement,
combat, pressure, and command systems. They provide context for why units need
stable identity and approximate occupied space, but they do not expand this
milestone.

## Goal

Add deterministic, headless simulation data for grouping existing entities into
units and teams, then derive simple unit summaries from current entity
positions.

The milestone should cover only:

- entity-to-unit membership
- faction/team identity
- deterministic unit membership storage and validation
- unit anchor or centre calculation from current member positions
- unit-level bounds or footprint approximation
- deterministic unit summaries ordered by stable unit ID
- using the existing spatial grid for local entity queries when computing local
  unit-relevant candidate sets
- headless tests
- performance checks if measurement shows the summary pass is non-trivial

This milestone creates infrastructure for later systems. It must not make units
move, fight, choose, receive orders, or affect gameplay outcomes.

## Non-goals

Do not include:

- movement decisions
- pathfinding
- steering
- collision resolution
- combat
- morale
- orders
- captains
- AI
- targeting
- damage
- rendering changes
- UI changes
- worker protocol changes
- gameplay behaviour

Also do not add:

- production dependencies
- tactical intent or behaviour modes
- formation slots
- command influence rules
- pressure calculations
- contact resolution
- faction-specific gameplay effects
- scenario editors or content-heavy faction data

Faction/team identity in this milestone is only stable categorisation data.

## Files Likely To Change

Implementation is expected to touch only simulation, content, and test files:

- `src/sim/types.ts` - add branded or stable `UnitId` and `FactionId` or
  equivalent shared identity types if they are needed across modules.
- `src/sim/unitIdentity.ts` - new pure simulation module for unit membership,
  faction/team ownership, validation, member iteration, and lookup helpers.
- `src/sim/unitSummary.ts` - new pure simulation module for centre, bounds, and
  simple footprint summary derivation.
- `src/sim/simulation.ts` - only if the accepted implementation needs to attach
  unit identity stores to `SimulationState` or expose a headless summary builder.
  Avoid changing tick behaviour unless the accepted implementation explicitly
  places a summary refresh in the simulation order.
- `src/sim/world.ts` - only if deterministic world creation needs to allocate
  unit identity stores from scenario data.
- `src/content/foundationScenario.ts` - only if the foundation scenario needs
  deterministic unit/faction fixture data for tests or browser startup. Content
  may define static input data but must not contain simulation systems.
- `tests/sim/unitIdentity.test.ts` - new headless tests for membership,
  validation, faction/team identity, and deterministic ordering.
- `tests/sim/unitSummary.test.ts` - new headless tests for centre, bounds,
  footprint approximation, summary determinism, and spatial-grid-backed local
  query usage.
- `tests/performance/unitSummary.performance.test.ts` - add only if initial
  measurement or implementation complexity makes a performance guard useful.

Do not modify `src/worker/`, `src/render/`, `src/ui/`, `src/main.ts`, worker
protocol files, renderer files, UI files, package files, config files, docs, or
specs during implementation unless this plan is revised and accepted again.

## Architecture Impact

This milestone remains inside the simulation/content/test boundary.

`src/sim/` owns unit membership, faction/team identity, and derived unit
summaries. The implementation must not import PixiJS, DOM APIs, canvas APIs,
browser APIs, worker APIs, timers, renderer code, or UI code.

`src/content/` may provide deterministic static input for unit definitions, such
as unit IDs, faction IDs, and entity membership ranges. Content must not compute
unit summaries or contain simulation rules.

The existing spatial grid remains the only proximity structure. Unit summary or
unit-local helper code may build the grid from current `WorldState` positions and
query local entity candidates, then filter by unit or faction membership in pure
simulation code. It must not introduce all-entities-against-all-entities checks
for normal local queries.

This milestone should not alter worker messages, render snapshots, UI controls,
or browser-visible behaviour. Unit summaries should be validated headlessly.

### Data Model

Prefer simple data-oriented stores:

- stable sequential or explicitly supplied `UnitId` values
- stable `FactionId` or team IDs
- one authoritative `entityUnitIds` component indexed by entity index
- one unit metadata store containing unit ID, faction ID, and member ranges or
  precomputed member lists
- deterministic iteration by ascending unit ID, then ascending entity ID within
  each unit

Membership should be explicit and validated. The implementation should decide
whether every entity must belong to a unit for this milestone, then lock that
rule in tests. If unassigned entities are allowed, represent that with a clear
sentinel value and test it.

### Unit Centre And Footprint

The first footprint approximation should be deliberately simple:

- unit centre or anchor derived from current member positions
- axis-aligned integer bounds around member positions
- optional simple radius derived from the farthest member from the centre or
  from half the bounding extent
- member count

Use integer or deterministic rounding rules and test them. Do not add heading,
formation slots, soft/hard/engagement zones, movement styles, or collision
shape resolution in this milestone.

The word "anchor" in this milestone means a derived centre/reference point, not
a controllable movement target and not an invisible entity.

### Deterministic Summaries

Unit summaries should be reproducible from the same world positions and
membership data. Observable summary order should be ascending unit ID.

A summary should include only stable structural data, such as:

- unit ID
- faction/team ID
- member count
- centre X/Y
- minimum X/Y
- maximum X/Y
- approximate radius or extent values, if included

Do not include tactical state, orders, morale, pressure, combat contact, target
selection, or movement intent.

## Future Support Without Current Scope Expansion

This milestone prepares later systems by giving them stable group identity and
cheap deterministic spatial summaries:

- Formation spacing: later spacing rules can compare current unit bounds or
  footprint approximations before deciding how individuals should maintain
  formation. This milestone does not define spacing rules.
- Units moving around each other: later movement planning can use unit-level
  bounds as broad-phase context before choosing a movement mode. This milestone
  does not choose movement modes or routes.
- Local ally/enemy pressure: later pressure logic can combine faction/team
  identity with spatial-grid local candidates. This milestone does not compute
  pressure.
- Command influence: later command systems can identify which units and entities
  belong to which team or unit. This milestone does not implement captains,
  orders, or influence effects.
- Combat contact checks: later combat systems can use unit footprints and local
  entity candidates as broad-phase input. This milestone does not implement
  targeting, attack range, contact, damage, or combat behaviour.

These notes are compatibility guidance only. They are not implementation tasks
for Milestone 002.

## Implementation Order

1. Define identity types and membership contracts.
   - Add `UnitId` and `FactionId` only where they need to be shared.
   - Define whether unassigned entities are valid.
   - Validate duplicate unit IDs, invalid faction IDs, out-of-range entity
     membership, and missing members.

2. Add a pure unit identity store.
   - Store entity-to-unit membership deterministically.
   - Store unit-to-faction/team ownership.
   - Provide lookup helpers by entity index/entity ID and unit ID.
   - Provide deterministic member iteration by ascending entity ID.

3. Add deterministic unit summary derivation.
   - Compute member count, centre, bounds, and simple footprint approximation
     from current `WorldState` positions.
   - Use explicit integer rounding rules.
   - Return summaries ordered by ascending unit ID.
   - Reuse caller-provided output arrays where practical for hot paths.

4. Use the existing spatial grid for local entity candidate queries.
   - Build or accept a `SpatialGrid` from current world positions.
   - Query nearby entities around a unit centre or footprint radius when local
     candidate data is needed.
   - Filter query results by unit/faction membership deterministically.
   - Do not add new spatial partitioning or all-entities-against-all-entities
     local scans.

5. Add deterministic content fixtures only if needed.
   - Keep content to static scenario inputs such as unit membership and faction
     IDs.
   - Do not put summary computation, rules, or behaviour in content files.

6. Add headless correctness tests.
   - Test identity storage and summary derivation independently.
   - Test spatial-grid-backed local queries with small fixtures.
   - Test replay/determinism of summaries after fixed movement if the
     implementation connects summaries to existing simulation state.

7. Decide whether a performance check is needed.
   - If summary generation is a standalone helper used only in tests, a focused
     non-performance correctness suite may be enough.
   - If summary generation is added to the normal simulation tick or expected to
     run frequently for 1,000 or 2,000 entities, add a headless performance test
     with structural assertions and reported timings.

8. Run verification and review.
   - `npm run typecheck`
   - `npm test`
   - `npm run perf`
   - `npm run build`
   - Search `src/sim/` for forbidden APIs/imports.
   - Confirm no worker, render, UI, protocol, or gameplay files changed.

## Tests To Add

Add `tests/sim/unitIdentity.test.ts` covering:

- valid unit and faction/team definitions are accepted
- invalid unit IDs, faction IDs, duplicate unit IDs, and invalid entity
  membership are rejected
- entity-to-unit lookup is deterministic
- unit-to-faction/team lookup is deterministic
- unit member iteration is ascending by entity ID
- observable unit ordering is ascending by unit ID
- unassigned-entity behaviour, if allowed, is explicit and tested
- repeated construction from the same inputs produces identical identity stores

Add `tests/sim/unitSummary.test.ts` covering:

- centre calculation for one-member and multi-member units
- explicit integer rounding behaviour for centres
- min/max bounds for positive positions, edge positions, and moved positions
- simple footprint radius or extent calculation, if included
- empty units are rejected or represented by a clearly tested rule
- summaries are ordered by ascending unit ID
- repeated summary generation from the same world and membership data is
  byte-equivalent or structurally equal
- rebuilding summaries after movement reflects new positions and removes stale
  values
- local entity candidate queries use the existing spatial grid and return
  deterministic entity IDs
- local candidate filtering by same unit, other unit, same faction/team, and
  other faction/team works as categorisation only, with no pressure or behaviour
  effects

All tests must be headless. They must not import PixiJS, DOM, workers, renderer
snapshots, browser clocks, UI state, or worker protocol code.

## Performance Checks

Performance checks are conditional for this milestone.

Do not add timing tests just because the milestone has a new data type. Add a
performance test only if summary generation or local unit candidate queries are
part of a normal or frequent simulation path, or if measurement during
implementation shows the work is large enough to justify a guard.

If needed, add `tests/performance/unitSummary.performance.test.ts` covering:

- summary generation with 1,000 entities grouped into deterministic units
- summary generation with 2,000 entities grouped into deterministic units
- local candidate queries using the existing spatial grid for the same entity
  counts
- total time, mean time, p95 time, maximum time, entity count, unit count, query
  count, and structural result counts

Assertions should be structural:

- finite non-negative timings
- expected entity and unit counts
- expected number of summaries and queries
- deterministic repeated summaries/query results

Avoid tight machine-dependent thresholds. If a broad red-flag threshold is used,
it must be loose enough to catch obvious disasters only.

## Risks

- **Scope creep into behaviour:** unit identity naturally leads to movement,
  pressure, combat, and orders. Keep this milestone limited to identity and
  derived summaries.
- **Ambiguous "anchor" meaning:** future doctrine uses anchors for movement, but
  this milestone should only derive a centre/reference point from current member
  positions. Do not add movement targets or anchor entities.
- **Faction data becoming rules:** faction/team identity must not imply hostility,
  targeting, morale, damage, or command behaviour yet.
- **Nondeterministic ordering:** unit summaries and member iteration must not rely
  on insertion order from mutable maps where that order could become accidental.
  Sort or store by stable IDs.
- **All-entity local scans:** local ally/enemy-style categorisation should consume
  spatial-grid candidates and then filter by membership, not compare every unit
  or entity against every other one in normal paths.
- **Allocation pressure:** summary and local-query helpers may become hot paths.
  Prefer reusable output arrays where practical and add performance coverage if
  they run frequently.
- **Overfitted footprint:** a too-rich footprint model would pull in future
  movement/combat concepts. Keep the first approximation to centre, bounds, and
  optionally radius or extents.
- **Layer leakage:** worker, renderer, UI, and protocol changes would make this
  visible gameplay/application behaviour. Keep validation headless.

## Done Criteria

Milestone 002 is complete only when all of the following are true:

- The plan has been reviewed and accepted before production implementation
  begins.
- Entity-to-unit membership exists in pure simulation code.
- Faction/team identity exists as stable categorisation data only.
- Unit identity data validates invalid IDs, duplicate IDs, invalid membership,
  and empty or unassigned cases according to explicit rules.
- Unit centre or anchor/reference point is deterministically derived from member
  positions.
- Unit-level bounds or footprint approximation is deterministically derived from
  member positions.
- Unit summaries are ordered by stable unit ID and are repeatable for the same
  world and membership inputs.
- Local entity candidate queries use the existing spatial grid when proximity is
  needed.
- No movement decisions, pathfinding, steering, collision resolution, combat,
  morale, orders, captains, AI, targeting, damage, rendering changes, UI changes,
  worker protocol changes, or gameplay behaviour have been implemented.
- Headless tests cover identity, faction/team categorisation, summary
  calculation, deterministic ordering, stale-summary prevention, and
  spatial-grid-backed local candidate filtering.
- Performance checks are added if summary/local-query work is frequent or
  measured as non-trivial; otherwise the implementation report explains why no
  new performance test was needed.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run perf` passes.
- `npm run build` passes.
- Review confirms no forbidden APIs or imports were introduced in `src/sim/`.
- Review confirms no production rendering, UI, worker protocol, or gameplay
  behaviour changed.
