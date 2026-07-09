# Milestone 2D: Formation Visual Replay Harness

Status: proposed; implementation must not start until this plan is accepted.

## Purpose

Create a lightweight developer-only visual replay harness for formation behaviour.

The purpose is human inspection, not automated correctness.

Vitest remains the authority for simulation correctness. The replay harness exists so a developer can see what a deterministic scenario is doing: anchors, units, individual positions, formation slots, current movement styles, pressure/cohesion changes, and event logs.

This is especially useful now that Milestone 2 movement behaviour includes:

- formedMarch
- orderedHalt
- haltAndWait
- engageFront
- formedDetour
- looseFlow
- pushThrough

The harness should help answer:

> Does this behaviour look like the design intent, or merely satisfy the maths?

## Non-Goals

Do not add:

- Cypress
- Playwright
- Storybook
- screenshot testing
- visual snapshot diffing
- large new dependencies
- new simulation rules
- renderer integration
- worker protocol changes
- UI product features
- combat systems
- pathfinding
- morale cascades
- collision/displacement systems

Do not make visual replay a replacement for headless tests.

Do not make visual replay part of simulation correctness.

Do not import browser APIs, DOM APIs, Canvas, SVG, PixiJS, or UI code into `src/sim`.

## Architecture Boundaries

### Simulation

`src/sim/` remains pure simulation code.

The replay harness may import simulation APIs, but simulation code must not import replay code.

Allowed imports from replay code include pure sim/content helpers such as:

- `src/sim/formationBehaviour.ts`
- `src/sim/unitIdentity.ts`
- `src/sim/types.ts`

The replay harness must not mutate simulation state except by calling existing sim tick/setup APIs in the same way tests do.

### Replay Harness

The replay harness should live outside production application code.

Preferred location:

```txt
experiments/formation-replay/
```

This keeps it separate from:

```txt
src/sim/
src/render/
src/ui/
src/worker/
```

The harness can use browser APIs because it is browser debug tooling, but those APIs must remain outside simulation code.

### Renderer

Do not reuse or alter the Pixi renderer for this milestone.

Use simple browser-native rendering:

- SVG preferred for clarity
- Canvas acceptable if SVG becomes awkward
- plain HTML/CSS for controls and event logs

Do not add Pixi-specific debug dependencies.

### Worker

Do not use the worker protocol for this milestone.

The replay harness can run deterministic simulation scenarios directly in the browser. This keeps the harness small and avoids worker-message expansion before it is needed.

A later milestone may create worker-backed replay if useful.

## Proposed Files

Likely files:

```txt
experiments/formation-replay/index.html
experiments/formation-replay/src/main.ts
experiments/formation-replay/src/styles.css
experiments/formation-replay/src/replayTypes.ts
experiments/formation-replay/src/replayRecorder.ts
experiments/formation-replay/src/scenarios.ts
experiments/formation-replay/src/renderReplay.ts
```

Optional typecheck support:

```txt
tsconfig.replay.json
```

Optional package script changes:

```txt
package.json
```

No dependency changes should be needed.

## Proposed Commands

Replay commands should remain separate from the normal robot test pipeline.

Normal validation remains:

```txt
npm run typecheck
npm test
npm run perf
npm run build
```

The replay harness should have its own explicit commands:

```json
{
  "replay:formation": "vite experiments/formation-replay --host 127.0.0.1 --port 5174",
  "replay:formation:build": "vite build experiments/formation-replay --outDir ../../dist/formation-replay",
  "typecheck:replay": "tsc -p tsconfig.replay.json"
}
```

Do not append `typecheck:replay` to the existing root `typecheck` command during the first implementation.

Reason:

- normal tests are for automated correctness
- visual replay is for human inspection
- CI and routine robot checks should not depend on browser/debug tooling
- replay typechecking can be run deliberately when editing the replay harness

No new npm packages should be added.

## Replay Data Shape

The replay should record deterministic frames from a scenario.

Suggested shape:

```ts
interface FormationReplayScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tickCount: number;
  readonly worldBounds: {
    readonly width: number;
    readonly height: number;
  };
  readonly setup: () => FormationReplaySetup;
}

interface FormationReplaySetup {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly store: FormationBehaviourStore;
  readonly units: readonly FormationReplayUnitDefinition[];
  readonly individuals: readonly FormationReplayIndividualDefinition[];
}

interface FormationReplayFrame {
  readonly tick: number;
  readonly units: readonly FormationReplayUnitFrame[];
  readonly entities: readonly FormationReplayEntityFrame[];
  readonly slots: readonly FormationReplaySlotFrame[];
  readonly events: readonly FormationEvent[];
}

interface FormationReplayUnitFrame {
  readonly unitId: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly headingX: number;
  readonly headingY: number;
  readonly order: UnitOrder;
  readonly style: UnitMovementStyle;
  readonly cohesion: number;
}

interface FormationReplayEntityFrame {
  readonly entityId: number;
  readonly unitId: number;
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly movementMode: MovementMode;
}

interface FormationReplaySlotFrame {
  readonly unitId: number;
  readonly entityId: number;
  readonly slotX: number;
  readonly slotY: number;
}
```

Frame `0` should show the initial state before any ticks are applied.

Frames `1..tickCount` should show state after each simulation tick.

The recorder should be deterministic: same scenario, same seed, same tick count, same frames.

## Visual Display

The page should show:

- scenario selector
- play/pause
- step forward
- step backward if frames are precomputed
- reset
- tick slider
- speed control
- current tick number
- simple viewport of the world
- event log for the selected tick or all ticks up to current tick
- selected unit/entity details if practical

The visual layer should show:

- unit anchors
- unit IDs
- entity positions
- entity IDs, optionally toggleable
- formation slots
- current movement style
- current movement mode
- pressure, at least in the side panel
- cohesion, at least in the side panel
- event markers/log entries

Nice-to-have toggles:

- show/hide formation slots
- show/hide entity IDs
- show/hide anchors
- show/hide trails
- show/hide event log
- show/hide approximate unit footprint

Keep visuals crude. This is a debug harness, not product rendering.

## Initial Scenarios

### formedMarch-column

Purpose: show normal unit anchor advance and members following formation slots.

Expected visual behaviour:

- anchor advances forward
- members stay in formation
- style remains `formedMarch`

### orderedHalt

Purpose: show explicit hold order.

Expected visual behaviour:

- anchor does not advance
- members remain near slots
- style is `orderedHalt`
- movement-style event emits once, not every tick

### haltAndWait-allied-blocker

Purpose: show low-confidence allied blocker response.

Expected visual behaviour:

- source unit detects allied blocker
- style becomes `haltAndWait`
- anchor stops
- members do not drift through the blocker

### engageFront-hostile-blocker

Purpose: show hostile blocker contact positioning without combat.

Expected visual behaviour:

- source unit detects hostile blocker
- style becomes `engageFront`
- anchor stops
- front member settles near contact line
- no combat/damage event appears

### formedDetour-centred-blocker

Purpose: show disciplined whole-unit lateral sidestep.

Expected visual behaviour:

- style becomes `formedDetour`
- anchor sidesteps laterally
- members follow shifted formation slots
- blocker is not displaced
- after clearing/release, unit returns to `formedMarch`

### formedDetour-edge-fallback

Purpose: show deterministic side fallback near world bounds.

Expected visual behaviour:

- preferred side would leave bounds
- unit chooses valid side
- no entity/anchor leaves world bounds

### looseFlow-low-cohesion-bypass

Purpose: show low-cohesion individual bypass.

Expected visual behaviour:

- style becomes `looseFlow`
- anchor continues advancing
- members loosen laterally around the blocker
- unit identity remains unchanged
- blocker is not displaced

### pushThrough-disruption

Purpose: show push-through disruption without displacement.

Expected visual behaviour:

- style becomes `pushThrough`
- source anchor continues advancing
- blocker is not physically displaced
- source cohesion decreases
- blocker cohesion decreases
- source pressure increases
- blocker pressure increases
- no combat/damage event appears

## Relationship To Vitest

Vitest tests remain mandatory.

The visual replay harness should not weaken or replace tests.

The harness should use scenarios that correspond closely to important Vitest cases, but it should not import from `tests/`.

Recommended approach:

- duplicate small scenario setup in `experiments/formation-replay/src/scenarios.ts`
- keep scenario names aligned with test intent
- do not make tests depend on the replay harness
- do not make the replay harness depend on test files

A later consolidation pass may extract shared scenario builders if duplication becomes painful.

For now, avoid that abstraction. Duplication is cheaper than tangling debug tooling into tests or sim.

## Implementation Order

### Step 1: Skeleton page

Create the experiment directory with:

- `index.html`
- `src/main.ts`
- `src/styles.css`

Render a static page with a scenario selector and empty viewport.

### Step 2: Replay types and recorder

Create replay type definitions.

Create a recorder that:

- accepts a scenario
- builds fresh world/identity/store state
- records frame 0
- advances N ticks
- records each frame
- preserves events per tick

### Step 3: Initial scenarios

Add the seven core scenarios:

- formedMarch-column
- orderedHalt
- haltAndWait-allied-blocker
- engageFront-hostile-blocker
- formedDetour-centred-blocker
- formedDetour-edge-fallback
- looseFlow-low-cohesion-bypass
- pushThrough-disruption

Keep scenario sizes tiny.

### Step 4: SVG rendering

Render:

- world bounds
- anchors
- entities
- formation slots
- simple labels

Use plain SVG elements.

Do not add a rendering library.

### Step 5: Controls

Add:

- scenario selection
- play/pause
- reset
- step forward
- tick slider
- speed selector

Step backward is easy if all frames are precomputed. Add it if it stays small.

### Step 6: Inspection panel

Add a side panel showing:

- selected scenario description
- current tick
- unit style/order/cohesion
- entity movement mode/pressure
- events for current tick

Selection by clicking entities/units is optional for first implementation.

### Step 7: Commands and typecheck

Add separate package scripts:

- `replay:formation`
- `replay:formation:build`
- `typecheck:replay`

Do not wire replay typechecking or replay build into the normal robot pipeline.

No dependency changes.

## Risks

### Visual replay becomes fake proof

Risk: a scenario looks right, so bugs are accepted.

Mitigation: keep saying this is inspection only. Vitest remains correctness.

### Debug code leaks into simulation

Risk: browser/visual concerns creep into `src/sim`.

Mitigation: all replay files stay under `experiments/formation-replay/`.

### Scenario drift

Risk: replay scenarios no longer match test scenarios.

Mitigation: use scenario names that mirror behaviour tests. Review them during consolidation.

### Overbuilding controls

Risk: this turns into a mini application.

Mitigation: plain controls only. No framework. No routing. No persistence.

### Performance confusion

Risk: visual replay performance is mistaken for sim performance.

Mitigation: replay scenario sizes stay tiny. Real performance remains under `tests/performance`.

### Generated artifact noise

Risk: replay output JSON or build output gets committed accidentally.

Mitigation: do not generate committed replay JSON in first implementation. If build output is created, ensure it is ignored unless deliberately published.

## Done Criteria

This milestone is done when:

- the replay harness runs in a browser using existing tooling
- no new large dependency is added
- no Cypress, Playwright, Storybook, or screenshot testing is added
- simulation code remains pure
- no browser/DOM/render/UI code enters `src/sim`
- the harness can select and play each initial scenario
- frame stepping is deterministic
- visual output shows anchors, entities, formation slots, styles, and events
- pushThrough replay shows pressure/cohesion disruption without displacement
- formedDetour replay shows anchor sidestep
- looseFlow replay shows individual lateral bypass
- engageFront replay shows contact/no combat
- haltAndWait replay shows stopped anchor/no drift-through
- `npm run typecheck` passes
- `npm test` passes
- `npm run perf` passes
- `npm run build` passes
- `npm run typecheck:replay` passes when replay files are changed
- `npm run replay:formation:build` passes when replay files are changed
- replay commands are not required by the normal automated test pipeline

## Explicit Non-Done Items

This milestone does not add:

- visual assertions
- screenshot diffs
- replay file export/import
- worker-backed replay
- Pixi debug overlays
- combat visualisation
- morale visualisation beyond current cohesion/pressure values
- after-action reports

Those can come later if they are still useful.
