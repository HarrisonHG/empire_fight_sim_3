# Architecture Doctrine

## Goal

This project is a top-down 2D simulation with many entities and complex interactions.

The architecture must prioritise:

1. deterministic simulation
2. headless testability
3. performance under high entity counts
4. debuggability
5. visual polish last

The previous attempt failed because complexity, rendering, and simulation became too tangled. Do not repeat that.

## Core Separation

The project has three major layers:

```txt
src/sim/
src/worker/
src/render/
```

`src/sim/` contains pure simulation code.
`src/worker/` owns the Web Worker boundary and message protocol.
`src/render/` contains PixiJS rendering and user-facing visualisation.

Simulation code must not import PixiJS, DOM APIs, canvas APIs, browser event APIs, or UI code.

Rendering code may display simulation snapshots but must not directly mutate simulation state.

The worker owns the simulation. The main thread sends commands and receives snapshots, events, and metrics.

## Simulation Model

Use an ECS-lite or data-oriented architecture.

Prefer:

```txt
EntityId
Component stores
Explicit systems
Fixed tick order
Stable arrays/maps
Seeded RNG
```

Avoid:

```txt
deep inheritance trees
large mutable classes with hidden side effects
game rules inside render objects
frame-rate-dependent rule outcomes
```

Entity state should be stored in simple component structures. Systems should operate over those structures in a deliberate order.

## Required System Order

The simulation tick should run in an explicit documented order.

Initial order:

1. command ingestion
2. perception update
3. AI intent selection
4. pathfinding request/update
5. movement
6. collision / spacing
7. combat targeting
8. attack resolution
9. damage / healing
10. morale / status effects
11. death / removal
12. event logging
13. snapshot generation

Do not add new systems without placing them deliberately in the tick order.

## Determinism

The simulation must be deterministic.

Same seed + same starting scenario + same command sequence + same tick count must produce the same final state.

Forbidden inside `src/sim/`:

```txt
Math.random()
Date.now()
performance.now()
setTimeout()
setInterval()
requestAnimationFrame()
frame delta time for rule outcomes
unordered iteration where order affects outcomes
```

Use a seeded RNG owned by the simulation.

## Tick Model

Use a fixed simulation tick rate.

Recommended initial rate:

```txt
20 ticks per second
```

Rendering may run at any frame rate.

Simulation outcomes must only happen during fixed simulation ticks.

## Worker Boundary

The worker receives:

```txt
start scenario
pause/resume
step tick
set speed
player commands
debug toggles
```

The worker sends:

```txt
render snapshots
simulation events
performance metrics
errors
```

Keep worker messages compact. Do not send the entire world every render frame if a smaller snapshot or delta is sufficient.

## Initial Milestone Architecture

Milestone 0 should prove the architecture before game features exist.

It should include:

```txt
Vite + TypeScript scaffold
PixiJS renderer
Web Worker simulation loop
fixed tick simulation
seeded RNG
1000 moving entities
pause/resume
single tick step
FPS display
simulation tick time display
entity count display
deterministic replay test
basic performance test
```

No combat. No factions. No clever AI. No pathfinding yet.

First prove that the skeleton is fast, deterministic, and inspectable.
