# Milestone 001: Spatial Grid and Proximity Queries

Status: proposed; implementation must not start until this plan is accepted.

This plan follows `AGENTS.md`, all `src/*/AGENTS.md` files, `docs/codex/*`,
`specs/spatial-grid/spec.md`, and `specs/simulation-platform/spec.md`.
`docs/design/unit-movement.md`, `docs/design/combat-behaviour.md`, and
`docs/design/captains-and-orders.md` are context only for future systems. They do
not expand this milestone.

## Goal

Add a simulation-owned uniform spatial grid that indexes the current integer
world positions and supports deterministic proximity queries without
all-entity-against-all-entity scans.

The accepted implementation should provide:

- grid configuration from world bounds, cell size, and entity capacity
- clearing and rebuilding the grid from existing `WorldState` positions
- querying nearby entities through overlapping grid cells
- querying entities within an exact radius using squared-distance filtering
- deterministic query result ordering
- an allocation-conscious query API for hot paths
- focused headless correctness tests
- performance checks for 1,000 and 2,000 entities

The grid is infrastructure only. It must not create gameplay behaviour.

## Non-goals

This milestone must not include:

- combat
- morale
- factions
- AI
- pathfinding
- collision resolution
- steering
- perception rules
- healing
- area effects
- unit anchors
- unit footprints
- captains
- orders
- individual behaviour traits
- rendering changes
- UI changes
- worker protocol changes
- gameplay behaviour

It must also avoid adding production dependencies.

## Files Likely To Change

This planning task changes only:

- `docs/plans/002-spatial-grid.md`

After this plan is reviewed and accepted, the implementation is expected to touch
only simulation and test files:

- `src/sim/spatialGrid.ts` - new pure simulation module containing grid config,
  storage, build/rebuild helpers, and query functions.
- `src/sim/types.ts` - only if shared exported types are needed for grid config or
  query results. Prefer keeping grid-specific types in `spatialGrid.ts`.
- `tests/sim/spatialGrid.test.ts` - new headless correctness and determinism
  tests.
- `tests/performance/spatialGrid.performance.test.ts` - new headless build/query
  performance checks for 1,000 and 2,000 entities.

No implementation should modify `src/worker/`, `src/render/`, `src/ui/`,
`src/content/`, worker protocol files, renderer files, UI files, or gameplay
systems for this milestone.

## Architecture Impact

The spatial grid belongs entirely to `src/sim/`.

It will read the existing `WorldState` integer position arrays and stable entity
IDs. It will not import PixiJS, DOM APIs, canvas APIs, browser APIs, worker APIs,
timers, UI code, renderer code, or content files.

The grid should be a data structure, not a system with behaviour. The first
implementation should be rebuilt from current world positions when needed.
Incremental position updates are not required for this milestone.

The grid should not change the current simulation tick order. Future simulation
systems may choose where grid rebuilds belong in the explicit tick order, but
this milestone should only provide the infrastructure and tests needed to build
and query the grid headlessly.

The expected data flow is:

```txt
WorldState positions and IDs
        |
        v
src/sim/spatialGrid.ts
        |
        v
deterministic local entity query results
```

### Grid Configuration

Create the grid from:

- `bounds.width`
- `bounds.height`
- positive integer `cellSize`
- entity count capacity

The grid should derive column and row counts with ceiling division so the final
cells cover partial world edges. Configuration validation should reject invalid
bounds, invalid cell sizes, and invalid capacities before hot-path work begins.

### Build And Rebuild

The initial implementation should support:

- clearing all cell occupancy
- rebuilding from a `WorldState` by iterating entity indices in ascending order
- assigning each point entity to exactly one cell based on integer `x` and `y`
- rebuilding after positions change without retaining stale cell contents

Entity positions are points for this milestone. No collision shape, footprint,
radius, faction, or behaviour data should be introduced.

### Query Semantics

Provide two query levels:

- nearby query: returns candidate entities from cells overlapped by the query
  area; it is a deterministic broad-phase lookup
- within-radius query: filters candidates by exact squared distance from the
  query point and includes entities whose distance is less than or equal to the
  radius

Queries should clamp examined cell ranges to world edges and handle corners,
edges, empty cells, empty worlds where valid, and queries that overlap outside
the world bounds.

### Deterministic Ordering

Results must be stable for the same grid contents and query. Prefer ascending
entity ID order.

The implementation should not rely on object key iteration, hash map iteration,
or incidental bucket scan order where that order becomes observable. If cell scan
order is used to gather candidates, the returned result should still be
normalised into deterministic ascending ID order before the caller observes it.

No duplicate entity IDs should appear in one query result.

### Allocation-Conscious API

The hot-path API should let the caller provide reusable output storage, for
example:

```txt
queryNearbyEntitiesInto(grid, x, y, radius, out)
queryEntitiesWithinRadiusInto(grid, x, y, radius, out)
```

The function should clear or overwrite the caller-owned output consistently and
return the same output object or a count. A convenience allocating wrapper is
acceptable for tests and non-hot paths, but future simulation systems should be
able to use the `Into` functions without allocating a fresh result array per
entity per tick.

## Future Support Without Current Scope Expansion

This milestone intentionally stops at point-position indexing and local entity
queries. The value for later systems is that they can ask for a small,
deterministically ordered local candidate set instead of scanning every entity.

Later systems can build on this without changing the current milestone scope:

- Unit footprint queries: future footprint code can use grid cell overlap or
  radius candidates as a broad phase before applying its own footprint math. This
  milestone does not define footprints.
- Local ally/enemy proximity: future faction or side data can filter grid results
  after querying local candidates. This milestone does not define factions.
- Pressure/threat checks: future pressure logic can count or inspect nearby
  candidates returned by the grid. This milestone does not define pressure.
- Formation spacing: future spacing logic can query nearby bodies before applying
  spacing rules. This milestone does not define spacing or collision resolution.
- Future combat and command systems: later melee range, command influence, and
  local unit-contact checks can consume deterministic local query results. This
  milestone does not define combat, captains, orders, morale, perception, or AI.

These are compatibility notes only, not implementation tasks.

## Implementation Order

1. Add `src/sim/spatialGrid.ts` with config validation and derived grid
   dimensions.
   - Keep the module pure and headless.
   - Use integer coordinates and integer cell indices.
   - Avoid any dependency outside `src/sim/`.

2. Add grid storage and clear/build helpers.
   - Store entity indices or IDs per occupied cell.
   - Iterate `WorldState` entities in ascending index order during build.
   - Ensure clearing and rebuilding removes stale occupancy.
   - Keep all storage owned by the grid and reusable across rebuilds.

3. Add nearby candidate queries.
   - Compute the covered cell range from query point and radius.
   - Clamp cell ranges to grid bounds.
   - Gather candidates from only overlapping cells.
   - Return deterministic, duplicate-free results.

4. Add exact within-radius queries.
   - Reuse nearby candidate lookup.
   - Filter by squared integer distance against `radius * radius`.
   - Define the boundary as inclusive.
   - Preserve deterministic result ordering after filtering.

5. Add allocation-conscious `Into` APIs and optional convenience wrappers.
   - Make the reusable output contract explicit in names and tests.
   - Keep wrappers out of hot-path simulation examples.

6. Add headless correctness tests.
   - Cover configuration, build/rebuild, query edges, radius filtering,
     deterministic ordering, duplicate prevention, and movement-plus-rebuild
     consistency.

7. Add headless performance checks.
   - Measure build and query costs at 1,000 and 2,000 entities.
   - Report useful timing distributions without tight machine-dependent
     thresholds.

8. Run verification and review.
   - `npm run typecheck`
   - `npm test`
   - `npm run perf`
   - `npm run build`
   - Search `src/sim/` for forbidden APIs/imports.
   - Confirm no worker, render, UI, content, or gameplay files changed.

## Tests To Add

Add `tests/sim/spatialGrid.test.ts` covering:

- grid configuration rejects invalid bounds, invalid cell size, and invalid
  capacity
- derived column and row counts cover world bounds including partial edge cells
- entities are inserted into expected cells from integer positions
- entities on `0`, edge, and corner coordinates are indexed correctly
- clearing removes all previous occupancy
- rebuilding after position changes reflects the new positions and does not
  retain stale results
- nearby queries inspect overlapping cells and return expected candidates
- nearby queries at world edges and corners do not read invalid cells
- within-radius queries include entities on the radius boundary
- within-radius queries exclude entities outside the radius but inside an
  overlapping cell
- empty queries return no results
- one query result contains no duplicate IDs
- result ordering is deterministic, preferably ascending entity ID
- repeated identical builds and queries produce identical results
- `Into` queries reuse caller-owned output storage and do not require a fresh
  result array

The tests should construct small `WorldState` fixtures directly. They should not
use PixiJS, DOM, workers, renderer snapshots, browser clocks, or UI state.

## Performance Checks

Add `tests/performance/spatialGrid.performance.test.ts` covering:

- building the grid with 1,000 entities
- radius queries with 1,000 entities
- building the grid with 2,000 entities
- radius queries with 2,000 entities

Use deterministic scenarios and deterministic query points. The performance test
may use the Node test clock to measure elapsed time, but measured time must stay
outside `src/sim/` and must never affect simulation state or query results.

Each performance report should include:

- entity count
- world bounds
- cell size
- number of measured rebuilds
- number of measured queries
- query radius
- total build time
- mean build time
- total query time
- mean query time
- p95 query time
- maximum query time
- total result count or another structural sanity value

Automated assertions should verify structural correctness:

- finite non-negative timings
- expected entity count
- expected number of measured builds and queries
- deterministic repeated query results for the same setup
- no all-entity scan path exposed through the query implementation contract

Avoid strict reference-machine timing thresholds in CI. A broad red-flag check is
acceptable only to catch obvious disasters, and any local target should be
reported as guidance rather than treated as portable proof.

## Risks

- **Scope creep:** the grid is useful for many later systems, but this milestone
  must not add those systems. Keep all future-system discussion as compatibility
  notes.
- **Hidden O(n^2) behaviour:** a query implementation that scans every entity
  would pass small tests while violating the purpose of the milestone. Tests and
  review should verify queries inspect cells, not all entities.
- **Nondeterministic ordering:** returning candidates in incidental cell or object
  iteration order could make later systems unstable. Normalise observable results
  into ascending entity ID order unless a measured later milestone changes this.
- **Duplicate results:** if future entity shapes ever occupy multiple cells, query
  code could return duplicates. Even though this milestone uses point positions,
  tests should lock duplicate-free results now.
- **Allocation pressure:** allocating a result array for every entity query would
  undermine future high-count systems. The `Into` API and tests should make reuse
  the default hot-path option.
- **Cell size mismatch:** very small cells can increase bookkeeping and very large
  cells can produce too many candidates. The implementation should accept an
  explicit cell size and the performance report should show the chosen value.
- **Boundary errors:** integer coordinates on the right and bottom edges can
  produce out-of-range cell indices if ceiling-derived grid dimensions are not
  handled carefully.
- **Integration temptation:** attaching the grid to worker messages, rendering,
  UI, or gameplay before a consumer exists would cross milestone boundaries.

## Done Criteria

The milestone implementation is done only when all of the following are true:

- The accepted implementation changes only simulation and test files listed in
  this plan, except for explicitly accepted plan updates.
- The spatial grid exists under `src/sim/`.
- The grid is configured from world bounds, cell size, and capacity.
- The grid can be cleared and rebuilt from existing `WorldState` positions.
- Nearby queries inspect only relevant grid cells.
- Exact radius queries filter by squared distance.
- Query results are deterministic and duplicate-free.
- Hot-path query APIs support caller-owned reusable output storage.
- Headless tests cover configuration, build/rebuild, edge cases, radius
  filtering, deterministic ordering, no duplicates, and output reuse.
- Performance checks report build and query timings for 1,000 and 2,000
  entities.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run perf` passes.
- `npm run build` passes.
- Review confirms no forbidden APIs or imports were introduced in `src/sim/`.
- Review confirms no production rendering, UI, worker protocol, content, or
  gameplay behaviour changed.
- No combat, morale, factions, AI, pathfinding, collision resolution, steering,
  perception rules, healing, area effects, unit anchors, unit footprints,
  captains, orders, individual behaviour traits, or gameplay behaviour were
  implemented.

