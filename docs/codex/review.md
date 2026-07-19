# Review Doctrine

## Purpose

Use this checklist before accepting Codex changes.

The previous project failed through complexity, bugs, and slow frame rate. Reviews must guard against those failure modes.

Codex must review its own changes before reporting completion. Human review still remains required for milestone acceptance.

## Required Self-Review Before Completion

Before reporting completion, Codex must review its own changes against the requested scope.

Check:

```txt
Did I modify only the allowed files?
Did I avoid all explicitly forbidden files?
Did I add any out-of-scope features?
Did I preserve the sim / worker / render / UI / content boundaries?
Did I introduce forbidden APIs or imports?
Did I update or add tests where required?
Did all requested commands pass?
Did I leave any ambiguity, risk, or partial implementation unreported?
```

If Codex finds any discrepancy, it must fix it before reporting completion.

The final report must include a `Self-review` section containing:

```txt
scope compliance
files changed
forbidden API/import check
tests/checks run
deviations from the requested scope
remaining concerns
```

Do not claim completion unless the implementation exactly matches the accepted step scope.

If something is ambiguous, stop and ask rather than broadening the implementation.

## Architecture Review

Check:

```txt
simulation code remains in src/sim
rendering code remains in src/render
worker boundary remains in src/worker
UI code remains in src/ui
content/config remains in src/content
simulation does not import PixiJS
simulation does not import DOM/browser APIs
renderer does not mutate simulation state directly
worker timing does not enter simulation rules
```

Reject changes that mix simulation rules into rendering, UI, worker scheduling, or content files.

## Determinism Review

Check:

```txt
no Math.random() in src/sim
no Date.now() in simulation rules
no performance.now() in simulation rules
no timers in simulation rules
no frame delta time used for simulation outcomes
same seed replay remains stable
system order remains explicit
```

Simulation outcomes must depend only on seed, starting scenario, command sequence, and tick count.

## Performance Review

Check for:

```txt
nested all-entity comparisons
pathfinding every entity every tick
sprite destruction/recreation every frame
large worker messages
temporary object/array creation in hot loops
debug overlays always-on with no disable option
metrics affecting simulation behaviour
```

If performance-sensitive code changed, require measurement.

Do not optimise by guessing. First identify the bottleneck as one of:

```txt
simulation CPU
rendering CPU
GPU/render load
worker message size
garbage collection
pathfinding
spatial query explosion
sprite count
debug overlay cost
metric/UI overhead
```

## Testing Review

Check:

```txt
new simulation rules have tests
bug fixes have regression tests
determinism tests still pass
worker lifecycle tests still pass
performance scenarios still run when relevant
typecheck passes
build passes
```

Do not accept visual-only validation for simulation rules.

A visual browser check is useful, but it does not replace headless tests.

## Scope Review

Prefer small changes.

Be suspicious of changes that touch many layers at once:

```txt
sim + worker + render + UI + content
```

That may be valid, but Codex must explain why.

Reject out-of-scope feature creep, especially:

```txt
combat
factions
morale
pathfinding
abilities
inventory
save/load
procedural generation
collision
advanced UI
debug overlays
camera controls
art pipeline work
```

Unless the current accepted step explicitly allows one of those things, it should not appear.

## Dependency Review

Codex must justify new production dependencies.

Reject dependencies that are added merely for convenience when a small local implementation would be clearer.

No new production dependency should be added without explicit permission.

## Archive and Repository-State Review

Use the smallest archive that still makes the requested review trustworthy.

- A changed-file archive is sufficient for a narrow isolated correction when all surrounding authorities are already known.
- Use a full current-repository archive for milestone integration acceptance, production-order review, or any change that crosses several existing systems.
- When a submission appears identical to the previous one, compare archive hashes before spending time re-reviewing it.
- An archive may contain uncommitted files from an earlier slice. Identify which files are actually new rather than assuming every included file belongs to the latest request.
- Do not infer current repository state from a Codex summary alone; inspect the supplied files.

## Manual Review Ritual

After each Codex implementation step, run:

```txt
npm run typecheck
npm test
npm run build
```

When the performance harness exists, also run:

```txt
npm run perf
```

For browser-visible steps, also run:

```txt
npm run dev
```

Then manually check the browser console for errors and inspect the visible behaviour.

## Acceptable Foundation Milestone

The foundation milestone is boring by design:

```txt
1000 moving dots
worker simulation
Pixi rendering
pause/resume
step tick
seeded replay
basic metrics
headless tests
performance report
```

Do not accept combat, morale, factions, pathfinding, or complex AI before this foundation works.
