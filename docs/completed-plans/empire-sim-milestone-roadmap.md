# Empire Fight Sim Milestone Roadmap

Status: working roadmap.

This file records the current milestone series for the Empire-inspired deterministic battle simulation. It includes completed foundation work, the current combat-foundation sequence, and the likely future roadmap.

The guiding rule is still: build deterministic, headless, testable systems first. Renderer, worker, UI, visual replay, screenshots, and richer content should come only when the underlying sim state is worth looking at.

---

## Core Project Principles

- Sim core must remain pure, deterministic, and headless.
- No `Math.random`, wall-clock randomness, DOM, browser APIs, PixiJS, worker APIs, renderer imports, or UI imports in `src/sim`.
- Prefer seeded inputs, explicit stores, out-array reuse, stable deterministic iteration, and structural tests.
- Normal robot pipeline remains:

```txt
npm run typecheck
npm test
npm run perf
npm run build
```

- Visual replay is useful for human inspection only when the milestone has enough visible state to inspect.
- Visual screenshot tests are not part of the normal pipeline unless explicitly scoped.
- Optimisation should happen when a real target scenario is shown to be unacceptable, not merely because a stress case looks ugly.
- Special calls / shouts are deliberately deferred. Many are hard-control or system-crossing effects, not generic combat decoration.

---

## Completed Milestones

## Milestone 1: Foundation / App Skeleton

Status: accepted / implemented.

Purpose:

Create the project foundation: TypeScript, Vite, Pixi renderer shell, worker-owned simulation tick, deterministic sim core, and initial test/build pipeline.

Delivered themes:

- strict TypeScript project setup
- deterministic seeded sim loop
- worker boundary
- Pixi renderer boundary
- controls and metrics
- performance baseline
- architecture and Codex instruction files

Boundary:

Foundation only. No rich unit behaviour or combat logic.

---

## Milestone 2: Movement, Unit Identity, and Loadouts

Status: accepted / implemented.

Purpose:

Create the unit and movement foundation that later combat systems depend on.

Delivered themes:

- unit identity and faction membership
- unit summaries and footprints
- local unit queries
- formation slot following
- unit orders
- blocker arbitration
- movement styles
- formed detour
- loose flow
- push-through disruption
- behaviour profiles
- loadout taxonomy
- reach bands, armour classes, shields, training tags, and special-call capability vocabulary

Important outputs:

- `src/sim/unitIdentity.ts`
- `src/sim/unitSummary.ts`
- `src/sim/unitLocalQueries.ts`
- `src/sim/formationBehaviour.ts`
- `src/sim/unitLoadout.ts`

Boundary:

Movement and taxonomy only. No real attack resolution, survivability, death, healing, morale engine, or special-call effects.

Note:

Special-call capability vocabulary may exist as loadout data, but call effects are not active yet.

---

## Milestone 3: Combat Foundation

Status: in progress.

Purpose:

Move from movement/contact behaviour into deterministic combat foundations without jumping straight to full combat, routing, death, or special-call rules.

Combat should emerge from existing movement, identity, loadout, reach, pressure, and cohesion systems. It must not become a separate arcade layer bolted onto the side.

Special calls / shouts are no longer part of this milestone. They are saved for a later equipment/loadout/effects milestone because many of them have hard, cross-system consequences.

Examples:

- `paralyse` forces a target to stop acting for a duration regardless of confidence, pressure, or morale, while still leaving them vulnerable to death or protection.
- `repel`, `strikedown`, and similar calls can alter movement, positioning, local unit behaviour, and nearby reactions.
- healing/restoration calls need injury/death/state systems before they are meaningful.

### Completed Combat Foundation Slices

## 3A: Threat Range and Contact Geometry

Status: accepted / implemented.

Purpose:

Map weapon reach bands to threat ranges and contact distances.

Delivered:

- `src/sim/threatGeometry.ts`
- `tests/sim/threatGeometry.test.ts`
- deterministic reach/contact mapping
- unit-to-unit threat/contact summaries
- hostile/allied relationship detection

Boundary:

No movement integration, attacks, damage, armour mitigation, or special-call resolution.

---

## 3B: Reach-Aware engageFront Positioning

Status: accepted / implemented.

Purpose:

Make hostile `engageFront` positioning respect weapon reach/contact geometry.

Delivered:

- optional `FormationTickOptions`
- optional `loadoutStore` on `advanceFormationOneTick`
- no-loadout legacy behaviour preserved
- source unit reach affects front-contact spacing

Boundary:

No attacks, damage, armour mitigation, combat events, special calls, or hostile displacement.

---

## 3C: Combat Engagement Detection

Status: accepted / implemented.

Purpose:

Identify which units are actually threatening, contacting, or engaged with hostile units.

Delivered:

- `src/sim/combatEngagement.ts`
- `tests/sim/combatEngagement.test.ts`
- engagement states:
  - `none`
  - `threatening`
  - `contacting`
  - `engaged`
- actual formation heading used rather than fixed placeholder direction

Boundary:

No attacks, damage, wounds, death, armour mitigation, healing, special-call resolution, morale cascades, routing, or displacement.

---

## 3D: Attack Opportunity / Combat Tempo

Status: accepted / implemented.

Purpose:

Introduce deterministic attack opportunity timing once engagements exist.

Delivered:

- `src/sim/combatTempo.ts`
- `tests/sim/combatTempo.test.ts`
- per-unit attack cooldowns
- attack opportunity records
- opportunities only from `engaged` targets
- cooldown reset when engagement breaks

Boundary:

No damage, wounds, death, healing, special calls, morale, routing, or displacement.

---

## 3E: Basic Strike Resolution and Damage Records

Status: accepted / implemented.

Purpose:

Resolve attack opportunities into deterministic strike/damage records.

Delivered:

- `src/sim/combatResolution.ts`
- `tests/sim/combatResolution.test.ts`
- `CombatStrikeResolution` records
- deterministic damage mapping:
  - `none`: 0
  - all other current reach bands: 1
- optional target armour/shield labels, with no mitigation at this stage

Boundary:

No persistent health, death, healing, special-call resolution, morale, routing, or displacement.

---

## 3F: Armour and Survivability State

Status: accepted / implemented.

Purpose:

Make armour and shield matter through simple deterministic survivability state.

Delivered:

- `src/sim/combatSurvivability.ts`
- `tests/sim/combatSurvivability.test.ts`
- per-unit accumulated damage
- per-unit max damage capacity
- deterministic armour/shield mitigation
- `capacityReached` marker only

Current mitigation abstraction:

```txt
Armour:
none/light/mageArmour = 0
medium/heavy = 1
dreadnought = 2

Shield:
none/buckler = 0
shield = 1

Applied damage:
max(0, strike.damageValue - armourReduction - shieldReduction)
```

Boundary:

Reaching capacity does not kill, wound, remove, route, heal, or alter morale.

---

## 3G: Integrated Combat Pipeline

Status: accepted / implemented.

Purpose:

Wire the accepted headless combat modules together.

Delivered:

- `src/sim/combatPipeline.ts`
- `tests/sim/combatPipeline.test.ts`
- integrated order:

```txt
combat tempo opportunities
→ combat resolution strike records
→ combat survivability applications
```

Expected tick order:

```txt
advanceFormationOneTick(...)
advanceCombatPipelineOneTick(...)
```

Boundary:

No new combat rules. No death, removal, healing, special calls, morale, routing, displacement, renderer, UI, or worker integration.

---

## 3H: Combat Pipeline Performance Coverage

Status: accepted / implemented.

Purpose:

Add structural performance coverage for the integrated combat pipeline.

Delivered:

- `tests/performance/combatPipeline.performance.test.ts`
- 100, 500, 1000, and 2000 entity scenarios
- deterministic structural summaries
- output reuse/stale clearing checks
- mean/max/p95 timing reports
- no strict machine-dependent timing thresholds

Observed concern:

The 2000-entity one-member-unit stress case is expensive. This likely reflects broad engagement scanning. This is useful evidence, but not an automatic blocker unless the real target scenario becomes unacceptable.

Boundary:

Performance tests only. No production optimisation or rule changes.

---

# Remaining Milestone 3 Work

## 3I: Combat Pressure and Cohesion Consequences

Status: proposed next mechanics slice.

Purpose:

Feed combat outcomes back into pressure and cohesion so fighting affects behaviour.

Possible concepts:

- pressure from being threatened
- pressure from being contacted
- pressure from being engaged
- pressure from taking applied damage
- cohesion loss from sustained engagement
- confidence effects from local advantage/disadvantage
- explicit consequence records before larger morale/routing systems

Likely inputs:

- combat engagement summaries
- combat pipeline applications
- formation behaviour store pressure/cohesion APIs
- unit identity and loadout stores where needed

Boundary:

No complex morale engine yet. No full routing engine yet. No death, entity removal, healing, special calls, hard-control effects, renderer/UI/worker integration, or pathfinding.

---

## 3J: Routing Hooks / Morale-Like Transition Points

Status: proposed.

Purpose:

Introduce explicit hooks for future routing without building a full morale engine in one go.

Possible concepts:

- `routingRisk`
- `moralePressure`
- `cohesionBroken`
- `isRoutingCandidate`
- transition-only routing markers
- behaviour-profile handoff points for later routing movement

Boundary:

Do not create uncontrolled morale cascades. Do not remove entities. Do not make routing visually or physically complex yet. Do not add call/shout effects.

---

## 3K: Combat Foundation Consolidation

Status: proposed final Milestone 3 slice.

Purpose:

Review and tighten the combat foundation before moving to larger battlefield behaviour.

Likely tasks:

- review module boundaries
- review naming drift from inserted slices
- verify deterministic tests cover the whole combat chain
- verify performance tests still provide useful signals
- document intended tick order
- document which systems are data-only versus mechanically active
- decide whether combat query optimisation is needed before larger milestones
- confirm calls/shouts remain deferred

Boundary:

Refactor/clarify only unless a bug is found. No new combat mechanics.

---

# Future Overall Milestones

## Milestone 4: Morale, Pressure, and Routing

Status: future.

Purpose:

Turn combat consequences into battlefield behaviour changes.

Expected direction:

- units under pressure hesitate, slow, halt, bunch, give way, or rout
- cohesion and confidence affect movement decisions
- sustained combat changes behaviour over time
- routing becomes a behaviour state, not just a flag

Boundary:

Avoid giant morale engine. Build in slices.

---

## Milestone 5: Captains, Orders, and Command Behaviour

Status: future.

Purpose:

Make command matter.

Expected direction:

- captains issue and maintain orders
- units obey imperfectly based on pressure, cohesion, role, profile, and command presence
- command delay/failure becomes visible state
- units can lose, retain, or reinterpret orders under stress

This is likely one of the highest-value milestones for Empire battle feel.

---

## Milestone 6: Scenarios, Objectives, and Victory

Status: future.

Purpose:

Turn the sandbox into repeatable simulations.

Expected direction:

- scenario definitions
- deployment zones
- objective areas
- hold/breakthrough/escort/ritual/asset objectives
- timed pressure
- scoring and victory conditions

---

## Milestone 7: Perception, Knowledge, and Fog of War

Status: future.

Purpose:

Remove perfect knowledge where it hurts battle feel.

Expected direction:

- local perception
- known/unknown hostile positions
- scouting value
- command uncertainty
- delayed or imperfect response

---

## Milestone 8: Roles, Loadouts, Equipment, and Content Expansion

Status: future.

Purpose:

Expand unit archetypes, battlefield roles, and equipment through data.

Expected direction:

- pikes
- shields
- bows
- dual wielders
- rods/staves
- banners
- healers
- mages
- dreadnoughts
- skirmishers
- heavy lines
- routing mobs
- equipment capabilities
- call/shout capability as loadout/equipment affordance data only

Boundary:

Prefer data and taxonomy over hard-coded bespoke logic. Call/shout effects still remain inactive until the later calls/shouts milestone.

---

## Milestone 9: Calls / Shouts and Hard Effects

Status: future.

Purpose:

Implement special calls/shouts only after enough surrounding systems exist for their consequences to make sense.

Rationale:

Calls are not merely combat modifiers. Many are hard effects with cross-system consequences.

Examples:

- `paralyse` ignores morale/confidence and prevents action for a fixed duration while still allowing the target to be killed or protected.
- `repel` and `strikedown` affect position, formation stability, nearby reactions, and combat engagement.
- `entangle` affects movement and engagement.
- `weakness` affects offensive capability.
- `venom`, `heal`, and `restore` require injury, survivability, death/downed-state, or recovery systems to already exist.
- `fixWeapon` requires weapon-damaged/broken state first.

Expected direction:

- generic effect records where possible
- explicit hard-coded handling where the rule is genuinely hard-control
- durations and expiry
- resistance/immunity hooks if needed
- interaction with equipment/loadouts
- interaction with morale/routing/command after those systems exist

Boundary:

Do not attempt every call at once. Implement in narrow, testable slices.

---

## Milestone 10: Terrain and Battlefield Constraints

Status: future.

Purpose:

Make the battlefield matter.

Expected direction:

- chokepoints
- rough ground
- soft blockers
- impassable areas
- objective zones
- formation disruption from terrain

Boundary:

Avoid full A* until necessary. Start with simple deterministic constraints.

---

## Milestone 11: Renderer, Replay, and Debug Tools

Status: future.

Purpose:

Build visual inspection once there is enough meaningful state to inspect.

Expected direction:

- useful replay/debug views
- state overlays
- pressure/cohesion/routing display
- combat/effect logs
- scenario playback
- after-action summaries

Boundary:

Do not mistake visuals for validation. Headless deterministic tests remain the source of truth.

---

## Milestone 12: Performance and Scale Hardening

Status: future, unless earlier pain forces it.

Purpose:

Make large battle simulation robust.

Expected direction:

- combat query optimisation
- spatial grid reuse
- hot-path memory reuse
- stable 2000-entity target checks
- profiling and regression detection
- fewer broad scans where possible

Boundary:

Optimise against realistic target scenarios, not abstract anxiety.

---

## Milestone 13: Content Authoring and Scenario Schema

Status: future.

Purpose:

Make battles authorable and repeatable without editing code.

Expected direction:

- JSON/data-driven scenario files
- army definitions
- unit archetypes
- faction templates
- replay exports
- after-action summaries

---
