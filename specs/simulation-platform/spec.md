# Simulation Platform Spec

## Overview

Build the foundation for a top-down 2D simulation with many entities and complex interactions.

This milestone exists to prove that the architecture is deterministic, testable, inspectable, and performant before gameplay features are added.

## Requirements

- The project MUST use TypeScript strict mode.
- The project MUST use Vite.
- The project MUST use PixiJS for rendering.
- The simulation MUST run in a Web Worker.
- The simulation MUST be runnable headlessly in tests.
- The simulation MUST use a fixed tick rate.
- The simulation MUST use seeded RNG.
- The same seed, scenario, commands, and tick count MUST produce the same result.
- The renderer MUST NOT contain simulation rules.
- The simulation MUST NOT import PixiJS, DOM APIs, or browser rendering APIs.
- The first visible demo MUST support 1000 moving entities.
- The demo MUST show FPS, simulation tick time, entity count, and current tick.
- The demo MUST support pause/resume.
- The demo MUST support stepping one simulation tick at a time.
- Tests MUST cover deterministic replay.
- Tests MUST cover basic movement.
- Tests MUST include at least one performance scenario.

## Non-Goals

This milestone MUST NOT include:

- combat
- morale
- factions
- inventory
- pathfinding
- complex AI
- abilities
- save/load
- procedural generation
- advanced UI
- visual polish beyond basic entity rendering

## Design

The project should be organised as:

```txt
src/sim/
src/worker/
src/render/
src/ui/
src/content/
```

The simulation owns entity state.

The worker owns simulation execution.

The renderer owns PixiJS display objects.

The main thread owns user input and UI controls.

Data should flow like this:

```txt
UI/input -> command -> worker -> simulation tick -> snapshot/events/metrics -> renderer/UI
Done Criteria
```

This spec is complete when:

- npm test passes
- npm run typecheck passes
- the browser demo renders 1000 moving entities
- simulation runs inside a worker
- pause/resume works
- step-one-tick works
- deterministic replay test passes
- a performance scenario reports tick timing
- no simulation logic exists in rendering code
