# Spatial Grid Spec

## Overview

Build a simulation-owned uniform spatial grid for efficient proximity queries.

This milestone prepares the simulation for future high-entity-count interactions without adding gameplay behaviour.

## Goal

Add a deterministic spatial index that allows simulation systems to query nearby entities without comparing every entity against every other entity.

The grid must support:

- building from current simulation positions
- querying entities near a point
- querying entities within a radius
- deterministic query results
- headless tests
- performance checks

## Non-Goals

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
- rendering changes
- UI changes
- worker protocol changes
- gameplay behaviour

The grid is infrastructure only.

## Requirements

- The spatial grid must live under `src/sim/`.
- It must not import PixiJS, DOM APIs, browser APIs, worker APIs, timers, or UI code.
- It must work headlessly in Vitest.
- It must use integer simulation coordinates.
- It must be deterministic.
- Given the same entity positions and query, the result order must be stable.
- It must avoid all-entities-against-all-entities checks for proximity lookup.
- It must support at least 1,000 entities.
- It should include a 2,000 entity performance scenario.

## Design

Use a uniform grid.

The grid should be configured with:

- world bounds
- cell size
- entity count capacity

The first implementation may rebuild the grid from world positions when needed. Incremental updates are not required yet.

Each cell should store entity IDs or entity indices that currently occupy the cell.

Queries should examine only the cells that overlap the query area.

Query results must be deterministic. Prefer ascending entity ID order unless there is a measured reason not to.

## Suggested API

The exact API may vary, but should provide equivalent behaviour to:

```ts
createSpatialGrid(config)
clearSpatialGrid(grid)
buildSpatialGrid(grid, world)
queryNearbyEntities(grid, x, y, radius)
queryNearbyEntitiesInto(grid, x, y, radius, out)
```

Prefer an allocation-conscious `queryNearbyEntitiesInto` function for hot paths.

A convenience allocating wrapper is acceptable for tests and non-hot paths.

## Future Use

This milestone does not implement gameplay, but the grid should be suitable for later systems such as:

- unit footprint queries
- local ally and enemy proximity
- pressure or threat checks
- formation spacing
- melee range checks
- morale aura checks
- command influence checks
- local steering and avoidance
- area effects

Those systems must not be implemented in this milestone.

## Tests

Add tests covering:

- entity insertion into expected cells
- clearing and rebuilding the grid
- querying nearby entities
- querying across cell boundaries
- querying at world edges and corners
- radius filtering
- deterministic result ordering
- empty query results
- no duplicate entities in results
- consistency after entity movement and rebuild
- Performance Checks

Add or extend performance tests to measure:

- building the grid with 1,000 entities
- radius queries with 1,000 entities
- building the grid with 2,000 entities
- radius queries with 2,000 entities

Performance tests should report:

- entity count
- cell size
- number of queries
- total build time
- mean build time
- total query time
- mean query time
- p95 query time
- maximum query time

Automated assertions should be structural and avoid tight machine-dependent timing thresholds.

Done Criteria

This milestone is complete when:

- the spatial grid exists under src/sim/
- the grid is deterministic
- proximity queries do not scan every entity
- headless tests cover correctness and edge cases
- performance checks report useful build/query timings
- npm run typecheck passes
- npm test passes
- npm run perf passes
- npm run build passes
- no production rendering, UI, worker, or gameplay behaviour has changed