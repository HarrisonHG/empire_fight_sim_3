# AGENTS.md

## Project Goal

This project is a top-down 2D simulation with many entities and complex interactions.

Prioritise:

1. correctness
2. determinism
3. debuggability
4. performance
5. visual polish

Do not optimise for rapid feature creation if it damages the architecture.

## Required Reading

Before making architectural changes, read:

* `docs/codex/architecture.md`
* `docs/codex/performance.md`
* `docs/codex/testing.md`

Before reviewing changes, read:

* `docs/codex/review.md`

Before starting a large feature or refactor, create or update a task plan using:

* `docs/codex/task-planning.md`

## Architecture Rules

The simulation, renderer, and worker boundary must remain separate.

Simulation code lives in:

```txt
src/sim/
```

Rendering code lives in:

```txt
src/render/
```

Worker orchestration lives in:

```txt
src/worker/
```

The simulation must not import PixiJS, DOM APIs, canvas APIs, browser APIs, or UI code.

The renderer may display simulation snapshots but must not directly mutate simulation state.

## Determinism Rules

The simulation must be deterministic.

Given the same seed, scenario, commands, and tick count, the final state must be identical.

Do not use:

* `Math.random()` in simulation code
* wall-clock time in simulation rules
* render frame delta for simulation outcomes
* unordered iteration where order affects outcomes

Use the project’s seeded RNG.

## Performance Rules

Never use all-entities-against-all-entities checks in normal simulation logic.

Use the spatial grid for proximity queries.

Do not run pathfinding for every entity every tick.

Do not create avoidable temporary objects or arrays inside hot loops.

Measure before optimising.

When investigating slowness, classify the bottleneck as one of:

* simulation CPU
* rendering CPU
* GPU/render load
* worker message size
* garbage collection
* pathfinding
* spatial query explosion
* sprite count
* debug overlay cost

## Testing Rules

Every simulation rule must have headless tests.

Every bug fix must include a regression test.

A feature is not complete unless:

* it is deterministic
* it has tests
* it works headlessly
* it does not put simulation logic in rendering code
* it passes the relevant performance scenario

## Codex Working Rules

Before implementing, state which layer is being changed:

* sim
* render
* worker
* ui
* content
* test
* docs

Prefer small, reviewable changes.

Do not rewrite multiple architectural layers in one step.

Do not add new production dependencies without explaining why they are necessary.

Do not add visual polish before debug and performance tooling exists.

## Required Project Docs

Before making architectural changes, read:

* `docs/codex/architecture.md`
* `docs/codex/performance.md`
* `docs/codex/testing.md`

Before reviewing changes, read:

* `docs/codex/review.md`

Before planning large or multi-step work, read:

* `docs/codex/task-planning.md`

For complex work, create or update a plan in:

* `docs/plans/`

Do not implement complex features until the relevant plan exists and has been accepted.
