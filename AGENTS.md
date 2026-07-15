# AGENTS.md

## Project Goal

This project is a top-down 2D simulation with many entities and complex interactions.

The simulation exists to model fighting-force behaviour for theoretical learning, not to become a conventional game.

Prioritise:

1. correctness
2. determinism
3. debuggability
4. performance
5. visual polish

Do not optimise for rapid feature creation if it damages the architecture.

## Instruction Priority

When instructions overlap, follow this priority:

1. this root `AGENTS.md`
2. the nearest directory-level `AGENTS.md`
3. `docs/codex/` process doctrine
4. the active accepted plan in `docs/plans/`
5. relevant files in `docs/design/`
6. existing implementation patterns

Design doctrine explains intent and boundaries. It is not permission to implement every described feature.

If scope is ambiguous, stop and ask rather than broadening the implementation.

If a referenced file in the plans folder is missing, check the completed-plans folder.

If a referenced file is missing, first determine whether it is required for the requested task.

* If required, report the missing file and stop before making changes.
* If not required, report it as a documentation issue and continue using the task prompt, active plan, and current repository state.

## Current Project Phase

Milestone 5, including its visual integration spike, is accepted.

The project is implementing Milestone 6: casualties, dying, battlefield treatment,
rescue, and player-presence state. Follow the accepted numbered slices in
`docs/plans/milestone-6-casualties-dying-treatment-rescue-and-player-presence.md`
without implementing later slices early.

## Required Reading

Before making code changes, read:

* `docs/codex/architecture.md`
* `docs/codex/testing.md`
* `docs/codex/performance.md`

Before reviewing changes, read:

* `docs/codex/review.md`

Before starting a large feature, refactor, architecture change, or new simulation system, read:

* `docs/codex/task-planning.md`

For complex work, create or update a plan in:

* `docs/plans/`

Do not implement complex features until the relevant plan exists and has been accepted.

## Design Doctrine Reading

Before implementing any simulation behaviour, read:

* `docs/design/simulation-purpose.md`
* `docs/design/anti-goals.md`
* `docs/design/perception-and-knowledge.md`

Before implementing unit movement, formation behaviour, collision, spacing, or stuck handling, read:

* `docs/design/unit-movement.md`
* `docs/design/combat-behaviour.md`
* `docs/design/morale-pressure-and-cohesion.md`
* `docs/completed-plans/milestone-2-unit-movement-and-behaviour.md`
* `docs/design/behaviour-priorities-and-battlefield-feel.md`

Before implementing combat exchanges, pressure, defence, parrying, attack timing, or role behaviour, read:

* `docs/design/combat-behaviour.md`
* `docs/design/combat-tempo-and-defence.md`
* `docs/design/roles-and-loadouts.md`
* `docs/design/morale-pressure-and-cohesion.md`
* `docs/design/behaviour-priorities-and-battlefield-feel.md`

Before implementing captains, unit orders, command behaviour, or battlefield decision-making, read:

* `docs/design/captains-and-orders.md`
* `docs/design/perception-and-knowledge.md`
* `docs/design/objectives-and-victory.md`
* `docs/design/morale-pressure-and-cohesion.md`
* `docs/design/behaviour-priorities-and-battlefield-feel.md`

Before implementing objectives, victory conditions, scenario data, or configurable content, read:

* `docs/design/objectives-and-victory.md`
* `docs/design/scenario-and-content-schema.md`
* `docs/design/behaviour-priorities-and-battlefield-feel.md`

Before implementing replay, debug tooling, event logs, metrics, or after-action reports, read:

* `docs/design/debug-replay-and-after-action.md`
* `docs/codex/testing.md`
* `docs/codex/performance.md`

Before implementing simulation behaviour, troop archetypes, morale, combat, objectives, after-action reporting, or role logic, read:

* `docs/design/behaviour-priorities-and-battlefield-feel.md`

## Architecture Rules

The simulation, renderer, worker boundary, UI, and content layers must remain separate.

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

UI code lives in:

```txt
src/ui/
```

Static scenario/configuration content lives in:

```txt
src/content/
```

The simulation must not import:

* PixiJS
* DOM APIs
* canvas APIs
* browser APIs
* UI code
* renderer code

The renderer may display simulation snapshots but must not directly mutate simulation state.

The worker owns the simulation. The main thread sends commands and receives snapshots, events, and metrics.

## Determinism Rules

The simulation must be deterministic.

Given the same seed, scenario, command sequence, and tick count, the final simulation state must be identical.

Do not use these inside simulation rules:

* `Math.random()`
* `Date.now()`
* `performance.now()`
* wall-clock time
* render frame delta
* unordered iteration where order affects outcomes

Use the project’s seeded RNG.

Simulation outcomes must happen only on fixed simulation ticks.

## Performance Rules

Never use all-entities-against-all-entities checks in normal simulation logic.

Use spatial partitioning for proximity queries.

Do not run pathfinding for every entity every tick.

Do not treat living entities as A* obstacles.

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
* metric/UI overhead

## Testing Rules

Every simulation rule must have headless tests.

Every bug fix must include a regression test.

A feature is not complete unless:

* it is deterministic
* it has tests
* it works headlessly
* it does not put simulation logic in rendering, UI, worker scheduling, or content files
* it passes relevant performance scenarios
* it can be inspected through debug or event output where appropriate

Visual confirmation is useful evidence. It is not a replacement for automated tests.

## Codex Working Rules

Before implementing, state which layer is being changed:

* sim
* worker
* render
* ui
* content
* test
* docs

Prefer small, reviewable changes.

Do not rewrite multiple architectural layers in one step unless the accepted plan explicitly requires it.

Do not add new production dependencies without explaining why they are necessary and receiving permission.

Do not add visual polish before debug and performance tooling exists.

Do not introduce complex tactical AI, global battlefield awareness, runner communication, individual A* pathing around allies, detailed combat modelling, magic, or content-heavy Empire-specific rules unless the active milestone explicitly calls for them.

## Scope Control

When implementing a plan:

* follow the accepted plan step by step
* update the plan as steps complete if requested
* do not expand scope silently
* report any deviations
* report any remaining risks or incomplete work

When a design file describes future behaviour, implement only the part required by the current task or active milestone.

## Required Checks

For normal code changes, run:

```txt
npm run typecheck
npm test
npm run build
```

When performance-sensitive code changes, also run:

```txt
npm run perf
```

For browser-visible changes, also run the app manually with:

```txt
npm run dev
```

Check the browser for:

* console errors
* visible control behaviour
* obvious frame drops
* runaway UI updates
* broken rendering

## Final Report Requirements

When reporting completion, include:

* files changed
* layer or layers changed
* tests/checks run
* whether performance was affected
* any scope deviations
* remaining risks or follow-up work
* A zip of recently changed files in the root directory, created by running scrips/zip-working-changes.ps1

Do not claim success unless the stated checks have passed.

If checks were not run, say so clearly.
