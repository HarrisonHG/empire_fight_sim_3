# Milestone 000: Simulation Foundation

Status: proposed; implementation must not start until this plan is accepted.

## Goal

Establish the smallest complete simulation platform described by
`specs/simulation-platform/spec.md`: a strict TypeScript/Vite browser application
that runs a deterministic, fixed-tick simulation in a Web Worker and renders
1,000 moving entities with PixiJS. The browser must expose pause, resume, and
single-tick controls plus FPS, simulation tick time, entity count, and current
tick. The same simulation must run headlessly for movement, deterministic replay,
and performance tests.

This plan follows AGENTS.md, the layer-specific AGENTS.md files, specs/simulation-platform/spec.md, and all required docs under docs/codex.

## Scope

- TypeScript with all strict compiler checks enabled, Vite, and Vitest.
- PixiJS as the only production dependency beyond the browser platform.
- A pure, data-oriented simulation under `src/sim/`.
- A 20 Hz fixed-tick worker loop; wall-clock time schedules ticks but never
  changes a simulation outcome.
- A documented seeded pseudo-random number generator owned by the simulation.
- A fixed foundation scenario containing 1,000 independently moving entities.
- Basic PixiJS dot rendering from read-only worker snapshots.
- Pause/resume, step exactly one tick while paused, and the four required metrics.
- Headless correctness, replay, worker-command, and performance coverage.

## Non-goals

Do not add combat, factions, morale, pathfinding, AI decision-making, abilities,
inventory, save/load, procedural generation, entity interaction or collision,
spatial grids, interpolation, camera controls, scenario editors, debug overlays,
or advanced UI/visual polish.

## Architecture impact

The milestone creates, but does not blur, these boundaries:

```txt
src/content/foundationScenario.ts
             |
             v
src/ui + src/main -- typed commands --> src/worker -- calls --> src/sim
        ^                                |
        |                                v
        +-- metrics/status + snapshots --+
        |
        +---------------------------> src/render
```

- `src/sim/` is environment-independent. It imports no PixiJS, DOM, browser,
  timer, or worker APIs. It owns entity state, seeded initialization, movement,
  fixed system order, and snapshot data.
- `src/worker/` owns the protocol, simulation instance, fixed-rate scheduling,
  pause state, step semantics, tick timing, and `postMessage` calls.
- `src/render/` owns PixiJS objects. It reads snapshots and updates stable display
  objects keyed by entity ID; it never mutates simulation state and does not
  destroy/recreate all entities per frame.
- `src/ui/` owns only DOM controls and metric text. `src/main.ts` wires UI,
  worker client, and renderer together.
- Tests import `src/sim/` directly for headless execution. They do not require
  PixiJS, a canvas, a DOM, or a live Web Worker.

### Foundation simulation decisions

- Use 20 ticks per second, as recommended by `docs/codex/architecture.md`.
- Give entities stable sequential IDs and store positions and per-tick velocities
  in fixed-size typed arrays. Use integer simulation units so movement and replay
  comparisons are exact and do not depend on render-frame delta or accumulated
  floating-point rounding.
- Define the foundation tick order explicitly as: command state already applied
  by the worker, movement, boundary reflection, increment tick, build snapshot.
  Omitted future systems are not represented by placeholders.
- Implement a small local 32-bit seeded RNG with explicitly documented seed-zero
  handling and unsigned integer operations. No RNG dependency is needed. Scenario
  initialization is the only random operation in this milestone.
- The scenario supplies seed, entity count, integer bounds, and speed range.
  Every generated entity must have a non-zero velocity so all 1,000 entities move.
- Send stable IDs once in the initial snapshot and compact interleaved positions
  after completed ticks. Reuse the simulation-side snapshot buffer and let
  structured clone copy it; do not transfer and detach authoritative state.
  At 1,000 entities this is approximately 8 KB of position data per tick and is
  preferable to a buffer-return protocol in the foundation milestone.
- Render the most recently received snapshot. Do not add render interpolation;
  it would add complexity without proving another foundation requirement.

### Worker and control semantics

- Use discriminated TypeScript unions for `start`, `pause`, `resume`, and `step`
  commands and for `ready`, `state`, `snapshot`, `metrics`, and `error` messages.
- The worker creates and owns the simulation after `start`. A second `start`
  replaces it deterministically with the supplied scenario and seed.
- The scheduler uses a monotonic worker clock only to decide when another fixed
  tick is due. Each simulation call advances exactly one tick with no elapsed-time
  argument. Limit catch-up work per callback so the worker yields; report lag
  rather than changing movement distance or skipping simulation tick numbers.
- `pause` stops automatic ticks and clears accumulated wall time. `resume` starts
  timing from a fresh clock sample so paused time is never caught up.
- `step` is valid only while paused. It advances exactly one tick, publishes one
  snapshot/metric update, and remains paused. Invalid lifecycle commands return a
  typed error instead of silently changing state.
- Measure tick execution with the worker clock around the simulation call. Timing
  remains worker metadata and never enters `src/sim/`.

### Rendering and metrics decisions

- Create one reusable dot texture and 1,000 stable PixiJS sprites. Update sprite
  positions by stable snapshot index/ID; do not recreate sprites per snapshot.
- Compute FPS on the main thread from `requestAnimationFrame`, using a short
  rolling window. Display the latest worker tick duration, snapshot entity count,
  and snapshot tick number. Metrics are observation-only.
- Keep the UI to one metrics panel and pause/resume/step buttons. Disable or hide
  invalid actions based on worker-reported state; do not add styling beyond clear,
  functional layout.

## Files to create

### Tooling and entry point

- `package.json` - scripts for `dev`, `build`, `typecheck`, `test`, and `perf`;
  declare PixiJS as the justified runtime dependency and
  TypeScript, Vite, and Vitest as development dependencies.
- `package-lock.json` - pin the accepted dependency graph.
- `tsconfig.base.json` - shared strict, no-emit TypeScript options.
- `tsconfig.app.json` - DOM/main-thread and renderer compilation boundary.
- `tsconfig.worker.json` - Web Worker plus pure simulation compilation boundary.
- `tsconfig.test.json` - Node/Vitest plus pure simulation compilation boundary.
- `tsconfig.node.json` - Vite configuration compilation boundary.
- `vite.config.ts` - Vite and Vitest configuration without application logic.
- `index.html` - application mount points only.
- `.gitignore` - generated dependencies, build output, coverage, and local Vite
  artifacts.
- `src/vite-env.d.ts` - Vite type declarations.
- `src/main.ts` - composition root for worker client, renderer, controls, and
  metrics.
- `src/style.css` - minimal full-page canvas and readable controls/metrics layout.

### Simulation and content

- `src/sim/types.ts` - branded/stable entity IDs, scenario input, world state,
  and read-only snapshot contracts that are safe in headless tests.
- `src/sim/rng.ts` - deterministic 32-bit RNG implementation.
- `src/sim/world.ts` - typed-array world allocation and deterministic seeded
  entity initialization.
- `src/sim/movement.ts` - one fixed-tick integer movement/boundary-reflection
  system with no time or rendering dependencies.
- `src/sim/simulation.ts` - simulation creation, explicit tick order, tick count,
  state access for tests, and compact snapshot creation.
- `src/content/foundationScenario.ts` - the browser demo's constant 1,000-entity
  scenario and explicit default seed.

### Worker boundary

- `src/worker/protocol.ts` - exhaustive command/message unions and compact
  snapshot/metric payload definitions.
- `src/worker/SimulationRunner.ts` - testable lifecycle and command semantics
  around one owned simulation, with no DOM or PixiJS dependency.
- `src/worker/simulation.worker.ts` - worker entry, 20 Hz scheduling, bounded
  catch-up, tick timing, message publication, and error containment.
- `src/worker/SimulationWorkerClient.ts` - main-thread typed worker creation,
  command API, and message dispatch.

### Renderer and UI

- `src/render/PixiEntityRenderer.ts` - PixiJS application setup, reusable dot
  texture, stable sprite storage, resize handling, and snapshot application.
- `src/ui/Controls.ts` - pause/resume/step controls and worker-state-driven enabled
  states.
- `src/ui/MetricsPanel.ts` - FPS sampling and display of FPS, tick duration,
  entity count, and current tick.

### Tests

- `tests/sim/rng.test.ts` - known RNG sequence and seed-zero behavior, preventing
  accidental algorithm drift.
- `tests/sim/movement.test.ts` - exact one-tick movement and deterministic boundary
  reflection without browser APIs.
- `tests/sim/replay.test.ts` - two independent runs with the same seed, scenario,
  and tick count produce byte-for-byte equal ticks, IDs, positions, velocities,
  and RNG state; a different seed produces a different initialized/final state.
- `tests/worker/SimulationRunner.test.ts` - start/pause/resume lifecycle and proof
  that stepping while paused advances exactly one tick, publishes one result, and
  remains paused.
- `tests/performance/foundation.performance.test.ts` - headless 1,000-entity
  warm-up and measured run that reports total, mean, p95, maximum tick time, and
  effective ticks per second.

## Files to modify

There are no existing production, package, or test files to modify; the repository
currently contains only instruction and specification files. During implementation,
update this plan's checklist/status only to record accepted deviations and completed
steps. Do not modify `AGENTS.md`, `docs/codex/*`, or the source specification as
part of this milestone.

## Implementation order

1. **Scaffold and type boundaries**
   - Create package metadata, lockfile, strict TypeScript configurations, Vite
     entry files, and empty layer directories/modules.
   - Configure `npm run typecheck` to check app, worker, test, and Vite contexts
     independently, preventing accidental reliance on DOM types in worker/sim code.
   - Run dependency audit, typecheck, and an empty Vitest run before adding logic.

2. **Seeded, headless simulation**
   - Define scenario/world/snapshot contracts and stable typed-array layout.
   - Implement and lock the seeded RNG behavior with known-sequence tests.
   - Implement deterministic world initialization, fixed-tick movement, boundary
     reflection, explicit system order, and tick counting.
   - Add movement and deterministic replay tests and run them headlessly before
     creating the worker or renderer.

3. **Worker ownership and protocol**
   - Define exhaustive command/message types first.
   - Implement `SimulationRunner` lifecycle semantics and its unit tests.
   - Add the worker scheduler, ensuring its elapsed time is not passed into the
     simulation; add bounded catch-up and observable error handling.
   - Add the typed main-thread client. Manually verify message payload sizes and
     that automatic ticks stop while paused.

4. **PixiJS renderer**
   - Initialize PixiJS and create the dot texture and stable sprites once after the
     initial snapshot.
   - Apply later position snapshots without simulation mutation, per-frame sprite
     creation, or simulation imports that expose mutable state.
   - Wire the 1,000-entity foundation scenario through the worker from `main.ts`.

5. **Controls and metrics**
   - Add worker-state-driven pause/resume and paused-only step controls.
   - Add FPS sampling on the main thread and display worker tick time, entity count,
     and current tick from messages.
   - Verify step advances the displayed tick by one and does not resume automatic
     ticking.

6. **Performance scenario and final verification**
   - Add the isolated headless performance scenario after correctness tests pass.
   - Record measured tick statistics, browser FPS, sprite count, update count, and
     worker snapshot byte rate on the agreed reference machine/browser.
   - Run all automated and manual done-criteria checks. Review imports and search
     `src/sim/` for forbidden randomness, clocks, timers, browser APIs, and PixiJS.

## Tests to add

Automated acceptance commands:

```txt
npm run typecheck
npm test
npm run perf
npm run build
```

Required assertions:

- Strict compilation passes separately for main thread, worker, simulation/tests,
  and Vite configuration.
- RNG output is repeatable and protected by a known sequence.
- One movement tick changes position by exactly the stored per-tick velocity;
  boundary contact reflects velocity and leaves the entity within bounds.
- Replaying the same scenario for a fixed tick count produces byte-equal complete
  simulation state, not merely visually similar snapshots.
- Worker runner pause freezes automatic advancement; resume permits it; step while
  paused advances exactly once and leaves the runner paused.
- The performance scenario really initializes 1,000 moving entities, runs the
  configured warm-up and measured tick counts, reports timings, and ends at the
  exact expected tick.

Manual browser checks:

- The application visibly renders exactly 1,000 moving dots.
- FPS, last simulation tick time, entity count, and current tick are visible and
  update from their correct owning layers.
- Pause freezes tick count and positions; resume continues; each step click while
  paused advances exactly one tick.
- Resizing does not recreate the 1,000 sprites or change simulation state.
- Browser inspection confirms simulation execution is in the Web Worker and the
  main thread remains responsive.

## Performance checks

1. Run a headless warm-up followed by at least 2,000 measured ticks with 1,000
   entities. Use the test harness clock around `simulation.tick()`; never add a
   clock to the simulation itself.
2. Report total, mean, p95, maximum milliseconds per tick, and effective ticks per
   second in a stable summary. Retain the raw sample count so invalid/empty results
   cannot pass.
3. Automated tests must assert correctness and finite measurements, not tight
   machine-time thresholds that make CI hardware speed a source of flaky failures.
4. The manual/reference-machine acceptance target is p95 simulation tick time
   below 10 ms for the 1000-entity foundation scenario.
5. The 20 Hz fixed rate gives each tick a 50 ms budget. A p95 at or above 50 ms is
   an absolute red flag because the simulation cannot reliably meet that budget.
6. In the browser, run the demo for at least 60 seconds and record average FPS,
   worker tick timing, stable entity/sprite count, and approximate worker payload
   rate. Verify there is no growing tick backlog, steadily increasing memory, or
   periodic sprite recreation.
7. If the browser misses the 20 Hz budget or loses responsiveness, classify the
   evidence first as simulation CPU, rendering CPU, GPU/render load, worker message
   size, garbage collection, sprite count, or metric/UI overhead. Do not optimize
   or add architectural complexity without a measurement identifying the cause.

The specification gives no reference hardware or numeric performance target.
The proposed 10 ms p95 local/reference-machine target leaves substantial headroom
inside the 50 ms fixed-tick budget without pretending to define a portable CI
benchmark. Acceptance of this plan also accepts that target; otherwise establish
a reference machine and replacement threshold before implementation.

## Risks

- **Wall-clock leakage:** Passing scheduler elapsed time into movement would make
  outcomes frame/load dependent. Prevent this structurally by exposing only
  parameterless one-tick simulation advancement.
- **Worker backlog:** Browser throttling or a slow tick can create a catch-up loop.
  Bound work per callback, yield, expose lag, and never compensate with larger
  movement steps or skipped tick numbers.
- **Pause/resume races:** UI-local state can disagree with queued worker commands.
  Treat worker state messages as authoritative and test the runner transition
  rules.
- **Replay test weakness:** Comparing only positions can miss divergent velocity,
  RNG, or tick state. Compare all authoritative state byte-for-byte.
- **Snapshot ownership/allocation:** Transferable buffers can detach data still in
  use; allocating new arrays each tick can create garbage. Reuse a compact snapshot
  view and structured-clone it for this milestone, then measure message/GC cost.
- **Renderer churn:** Rebuilding PixiJS sprites on every snapshot can hide a render
  bottleneck. Create stable sprites/texture once and update positions only.
- **Type-environment contamination:** A single DOM-heavy TypeScript config can let
  browser APIs leak into simulation code. Separate app, worker, and test configs
  and include `src/sim/` in non-DOM checks.
- **Performance-test flakiness:** Absolute timings vary by machine and concurrent
  load. Keep automated assertions structural, report distributions, and use the
  agreed reference-machine p95 gate for milestone acceptance.
- **Dependency/API drift:** Vite, TypeScript, Vitest, and PixiJS versions must be
  pinned together in the lockfile. Do not add convenience runtime dependencies;
  adapt the small local modules to the pinned public APIs.

## Done criteria

The foundation milestone is done only when all of the following are true:

- [ ] The plan has been accepted before production implementation begins.
- [ ] `npm run typecheck`, `npm test`, `npm run perf`, and
      `npm run build` pass from a clean install.
- [ ] TypeScript strict mode is enabled; Vite serves/builds the application; PixiJS
      is the renderer.
- [ ] The authoritative simulation runs in a Web Worker in the browser and also
      runs headlessly without DOM, PixiJS, canvas, or worker APIs.
- [ ] Simulation advancement is fixed at 20 ticks per second, and rules receive no
      render delta or wall-clock input.
- [ ] The RNG and 1,000-entity scenario are seeded and repeatable; same seed,
      scenario, command sequence, and tick count produce byte-equal complete state.
- [ ] Exactly 1,000 stable PixiJS dots move from worker snapshots without the
      renderer mutating simulation state or recreating every sprite per frame.
- [ ] Pause/resume works, and one step while paused advances exactly one tick and
      remains paused.
- [ ] FPS, simulation tick time, entity count, and current tick are visible and
      sourced from the appropriate main-thread/worker data.
- [ ] Movement, RNG stability, deterministic replay, and worker step semantics have
      passing automated tests.
- [ ] The performance scenario reports its timing distribution, completes the
      expected ticks with 1,000 entities, and meets the accepted reference-machine
      tick-budget check.
- [ ] A 60-second browser run shows no growing tick backlog, sprite-count growth,
      or obvious memory growth, and records worker payload/timing observations.
- [ ] Review confirms no `Math.random()` or time/browser/rendering APIs in
      `src/sim/`, no simulation rules in `src/render/`, and no direct renderer
      mutation of simulation state.
- [ ] No excluded gameplay, persistence, generation, pathfinding, or advanced UI
      feature has been introduced.
