# Performance Doctrine

## Goal

The simulation must support large numbers of entities without collapsing into low frame rate or untestable behaviour.

Performance must be measured, not guessed.

## Main Principle

Rendering and simulation are separate bottlenecks.

When performance is bad, identify the cause before changing code.

Classify the bottleneck as one of:

- simulation CPU
- rendering CPU
- GPU/render load
- worker message size
- garbage collection
- pathfinding
- spatial query explosion
- sprite count
- debug overlay cost
- metric/UI overhead

## Entity Count Targets

Performance scenarios should exist for:

- 100 entities
- 500 entities
- 1000 entities
- 2000 entities

The first serious foundation gate is:

- 1000 moving entities with smooth rendering and stable simulation tick time

Do not add complex behaviour until the current performance gate is stable.

## Prohibited Performance Patterns

Do not use all-entity-against-all-entity checks in normal simulation logic.

Avoid this in normal hot-path simulation code:

- for each entity, check every other entity

That creates O(n²) behaviour and will kill the project.

Use a spatial grid for local queries.

## Spatial Grid

Use a uniform spatial grid before considering more complex structures.

The spatial grid should eventually support:

- insert or update entity position
- query nearby entities
- query nearby enemies
- query nearby allies
- query entities in radius

Use the spatial grid for:

- perception
- melee range
- collision or spacing
- morale aura
- area effects
- threat checks
- healing range

## Allocation Rules

Avoid avoidable allocations in hot loops.

Avoid in hot paths:

- map/filter/reduce chains
- creating temporary arrays every tick
- creating temporary objects per entity per tick
- JSON stringify/parse for cloning
- destroying and recreating sprites

Prefer:

- simple loops
- reused arrays
- object pools where justified
- stable sprite maps
- typed arrays where measurement supports them

## Rendering Rules

Rendering must not recreate the world every frame.

Required:

- sprites are keyed by EntityId
- sprites are reused
- position updates should update existing objects
- debug overlays can be disabled

The renderer should be able to show:

- FPS
- number of sprites
- number of visible entities
- simulation tick time
- worker message size when available
- debug overlay cost if available

## Worker Message Rules

Do not casually send huge world objects from the worker to the main thread.

Snapshots should be compact.

A render snapshot should initially contain only what rendering needs:

- tick
- entity id when required
- x
- y
- orientation if needed
- visual type if needed
- flags needed for rendering
- metrics

Do not expose internal simulation component stores directly to the renderer.

## Pathfinding Rules

Do not run pathfinding for every entity every tick.

Pathfinding must be budgeted.

Acceptable approaches include:

- request queue
- path cache
- repath cooldown
- local steering without full pathfinding
- staggered path updates across ticks

Pathfinding should be added only after the spatial grid foundation is stable.

## Pre-Existing Failure Verification

A claimed pre-existing performance failure may be excluded from the current slice only when it is reproduced on unchanged `HEAD`. Prefer recording the exact same structural values, not merely the same test name.

The implementation must still report the failure clearly. A baseline reproduction proves non-regression; it does not silently make the underlying concern disappear.

## Performance Done Criteria

A feature affecting simulation or rendering is not done unless:

- the relevant performance scenario still passes
- tick time has been measured
- render FPS has been checked where browser-visible
- there is no obvious memory growth over a sustained run
- worker message sizes remain reasonable

## Debug Warning

Debug tools can themselves destroy performance.

Every debug overlay must be possible to disable.

Performance measurements should be taken with debug overlays both enabled and disabled when relevant.

## Foundation Baseline

Foundation 000 established a baseline with:

- 1000 moving entities
- deterministic typed-array movement
- worker-owned simulation
- PixiJS rendering
- pause/resume/step controls
- metrics display
- headless performance test

Future milestones should compare against this baseline and explain performance regressions.
