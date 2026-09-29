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

If scope is ambiguous, do not broaden the implementation. For a small Codex slice, prefer the narrow interpretation recorded by the active plan. Ask only when the missing decision prevents safe progress.

If a referenced file in `docs/plans/` is missing, check `docs/completed-plans/`.

If a referenced file is missing:

* if required for the current slice, report the missing file and stop before making changes;
* if not required, report it as a documentation issue and continue using the task prompt, active plan, and current repository state.

## Current Project Phase

Milestone 7 is accepted.

Milestone 8 — personal space, collision, and crowd flow — is in progress.

Accepted slices:

```txt
8A through 8F
```

Milestone 8G is partially implemented and has been re-sliced. Follow:

```txt
docs/plans/milestone-8-personal-space-collision-and-crowd-flow.md
```

The remaining cadence is:

```txt
8G-1  simulation contract stabilization
8G-2  initial placement legality
8G-3  debug evidence / retained route
8H    system integration gate
8I    performance + deterministic soak gate
8J    human visual acceptance
```

Do not implement later slices early.

## Required Reading and Context Budget

Before any code change, read:

```txt
docs/codex/work-slicing.md
the exact active milestone plan and exact slice being implemented
```

Do not recursively read the whole `docs/` tree.

Do not read `docs/progress/`, `docs/completed-plans/`, or old milestone plans by default.

Accepted previous milestones are contracts, not mandatory startup reading. Use targeted search/grep/read only when the current slice needs a specific inherited rule.

Read additional doctrine only when relevant to the named slice:

```txt
docs/codex/architecture.md     architecture or layer-boundary changes
docs/codex/testing.md          system/integration test work
docs/codex/performance.md      performance/soak work or hot-path investigation
docs/codex/review.md           formal review/self-review work
docs/codex/task-planning.md    new milestone/system planning or major refactor
```

For design doctrine, read only the specific design file(s) named by the active plan/slice or needed to resolve a concrete inherited invariant.

Do not preload broad design context merely because the changed code happens to be simulation code.

## Reference Map for Design Doctrine

Use this only when the current slice actually needs the topic.

Movement / formation / collision / stuck handling:

```txt
docs/design/unit-movement.md
docs/design/combat-behaviour.md
docs/design/morale-pressure-and-cohesion.md
docs/design/behaviour-priorities-and-battlefield-feel.md
```

Combat / defence / attack timing / role behaviour:

```txt
docs/design/combat-behaviour.md
docs/design/combat-tempo-and-defence.md
docs/design/roles-and-loadouts.md
docs/design/morale-pressure-and-cohesion.md
docs/design/behaviour-priorities-and-battlefield-feel.md
```

Captains / orders / battlefield decision-making:

```txt
docs/design/captains-and-orders.md
docs/design/perception-and-knowledge.md
docs/design/objectives-and-victory.md
docs/design/morale-pressure-and-cohesion.md
docs/design/behaviour-priorities-and-battlefield-feel.md
```

Objectives / victory / configurable content:

```txt
docs/design/objectives-and-victory.md
docs/design/scenario-and-content-schema.md
docs/design/behaviour-priorities-and-battlefield-feel.md
```

Replay / debug / event logs / after-action:

```txt
docs/design/debug-replay-and-after-action.md
```

Do not read all files in a category unless the slice genuinely spans all of them.

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

A narrow feature slice is complete when:

* its named contract is deterministic;
* its focused tests pass;
* it works headlessly where applicable;
* it respects architecture boundaries;
* it passes any focused performance check explicitly required by the slice;
* relevant debug/event evidence exists where the slice requires it.

A milestone is not complete merely because its feature slices pass locally.

Full cross-system, performance/soak, and human acceptance evidence belongs to the explicit gates defined by the active plan and `docs/codex/work-slicing.md`.

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

Implement only the exact named slice.

Do not rewrite multiple architectural layers in one step unless the active slice explicitly requires it.

Do not add new production dependencies without explaining why they are necessary and receiving permission.

Do not add visual polish before debug and performance tooling exists.

Do not introduce complex tactical AI, global battlefield awareness, runner communication, individual A* pathing around allies, detailed combat modelling, magic, or content-heavy Empire-specific rules unless the active milestone explicitly calls for them.

Do not opportunistically repair unrelated broad regressions during a feature slice. Record them for the named integration gate unless they prove the slice contract itself is wrong.

Do not silently rebaseline unrelated tests.

Do not append long implementation diaries, full test logs, or historical evidence to active plans. Put detailed history in `docs/progress/` when it is worth retaining.

## Scope Control

When implementing a plan:

* follow the exact slice;
* update active-plan status concisely if requested;
* do not implement later slices early;
* do not expand scope silently;
* report deviations;
* report remaining risks or integration work.

When a design file describes future behaviour, implement only the part required by the current task or slice.

If a small slice intentionally leaves broader reconciliation to a named system gate, that is not incomplete work as long as the active plan explicitly records the gate and the slice has not knowingly corrupted unrelated production behaviour.

## Verification Cadence

`docs/codex/work-slicing.md` owns the detailed verification cadence.

### Feature or correction slice

Normally run only:

```txt
focused tests named by the slice
npm run typecheck     # when production TypeScript changed
git diff --check
```

Run one focused structural/performance case only when the slice changes a hot path and the active plan requests it.

Run `npm run build` only when the slice changes bundling/startup/worker/render/UI boundaries or explicitly requests it.

Do **not** run full `npm test` or `npm run perf` after every small slice.

### System integration gate

Normally run:

```txt
npm run typecheck
npm test
npm run build
git diff --check
```

No new feature work belongs in the integration gate.

### Performance / soak gate

Normally run:

```txt
npm run perf
milestone-specific representative measurements
required deterministic soak/replay
```

Do not raise timeout limits merely to pass.

If optimisation changes production behaviour or authority code, rerun focused affected regressions and then repeat the latest required system integration gate.

### Human visual acceptance gate

Run the browser-visible retained/main scenarios named by the plan.

If visual inspection finds a defect, open a narrow correction slice with a regression rather than modifying the milestone ad hoc inside the acceptance gate.

## Test and Log Economy

Successful commands should report concise status/counts.

Do not paste hundreds of passing test names or full successful logs into the Codex conversation.

On failure, include only the relevant failing tests and concise diagnostics.

Normal feature/correction completion reports should be short — roughly 350 words or less unless unusual evidence is required.

## Final Report Requirements

When reporting a narrow slice, include:

* slice implemented;
* files/layers changed;
* focused tests/checks run;
* performance impact if relevant;
* scope deviations;
* remaining concern / next named gate;
* changed-file archive path/hash when requested.

Do not claim broader milestone health from focused tests.

For an integration/performance gate, include the broader evidence required by that gate.

Create the recently changed-file archive using:

```txt
scripts/zip-working-changes.ps1
```

when PowerShell and the script are available.

If PowerShell is unavailable, create an equivalent archive containing the intended changed files with an available ZIP tool and run an integrity check. Report that substitution explicitly.

Do not claim success unless the checks required for the current slice/gate have passed.

If required checks were not run, say so clearly.
