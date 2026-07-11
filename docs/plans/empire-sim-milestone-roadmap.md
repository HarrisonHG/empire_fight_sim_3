# Empire Fight Sim Milestone Roadmap

Status: working roadmap.

This file records the current milestone series for the deterministic Empire LARP battle simulation. It includes completed foundation work, the active morale sequence, and the likely future roadmap.

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
- Simulate the physical and procedural reality of an Empire LARP battle as well as the fictional battle imagined by the characters.
- Where idealised military behaviour conflicts with what real players must physically or procedurally do, the LARP reality is authoritative.
- Keep character state separate from player-presence state where necessary. A character can be terminal or dead while the player remains a non-interactive moving entity on the battlefield.
- Treat player limitations such as fatigue, ammunition handling, death counts, battlefield egress, and respawn procedures as first-class simulation rules rather than visual oddities.
- Use deterministic scenario inputs for varied human traits and starting conditions; do not collapse experience, confidence, fitness, and energy into one statistic.

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

Status: accepted / implemented.

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

# Final Milestone 3 Slices

## 3I: Combat Pressure and Cohesion Consequences

Status: accepted / implemented.

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

Status: accepted / implemented.

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

Status: accepted / implemented.

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

# Current and Future Overall Milestones

The order below reflects major dependency boundaries rather than a promise that every milestone will be one implementation slice.

Key placement decisions:

- Energy follows morale because it feeds movement, engagement willingness, recovery, and morale over time.
- Core casualty and dying states precede scenarios, while Sentinel Gate geometry, respawn locations, reinforcement waves, and the one-hour battle clock belong to scenario integration.
- Recoverable projectiles follow perception, equipment expansion, and terrain because they require visible world objects, ranged loadouts, ammunition capacity, and local safety reasoning.

---

## Milestone 4: Morale, Pressure, and Routing

Status: in progress.

Purpose:

Turn combat consequences into battlefield behaviour changes.

Current direction:

- units under pressure hesitate, slow, halt, bunch, give way, or rout
- cohesion and confidence affect movement decisions
- sustained combat changes behaviour over time
- routing is a behaviour state, not merely a flag
- local routing contagion is bounded and deterministic
- later slices cover rallying, command interaction, and consolidation

Boundary:

Avoid one giant morale engine. Build and validate the system in slices. Do not pull later energy, death, command, scenario, or equipment systems into Milestone 4 merely because they will eventually influence morale.

---

## Milestone 5: Energy, Exertion, and Rest

Status: future.

Purpose:

Model the real physical energy limits of individual LARP players and make fatigue visible in movement, morale, and battlefield choices.

Expected direction:

- each individual has an energy capacity and current energy value
- starting energy and capacity are deterministic scenario inputs and vary across the player base
- energy is not derived directly from experience, confidence, or recruit/veteran status
- walking, jogging, sprinting, charging, fighting, carrying equipment, and recovering consume or restore energy at different rates
- energy affects ordinary movement speed and strongly limits charge/sprint duration
- low energy reduces willingness to engage and contributes to morale pressure
- units may deliberately disengage, withdraw, or remain inactive for meaningful periods to recover
- citizens normally enter battle energetic and initially confident
- later morale depends on battlefield progress, nearby comrades, losses, and remaining energy rather than permanent opening enthusiasm
- barbarian post-death return speed and willingness to re-enter can consume or depend on remaining energy
- deterministic unit summaries expose whether a formation can still charge, jog, fight effectively, or needs rest

Important distinction:

Fitness, enthusiasm, experience, confidence, discipline, and current energy are related but separate. A veteran may be exhausted or physically unfit; a recruit may have abundant energy.

Deferred:

- veterans pacing themselves more efficiently
- hydration, heat, injury-specific fatigue, nutrition, and medical modelling
- detailed animation or visual exhaustion cues

Boundary:

Do not turn energy into a second morale system. Energy is individual physical state; morale remains the authority for morale transitions.

---

## Milestone 6: Casualties, Dying, and Player-Presence State

Status: future.

Purpose:

Define what happens when survivability is exhausted and distinguish fictional character state from the real player’s continued physical presence.

Expected direction:

- explicit combat lifecycle states rather than immediate entity deletion
- faction- or scenario-specific death-count durations
- Empire citizens normally use an approximately 180-second dying period
- barbarian characters normally use an approximately 30-second dying period
- dying entities follow only the interactions explicitly allowed during their death count
- after the death count, the character becomes terminal/dead while the player remains physically present
- terminal players become non-interactive movement-only entities
- terminal entities cannot attack, block, provide support, spread morale, receive healing, contest objectives, or otherwise affect living combatants
- Empire terminal entities move toward a generic citizen egress destination and are removed after leaving
- barbarian terminal entities move toward a generic respawn-staging destination
- egress movement attempts to get out of active combat rather than behaving like tactical withdrawal
- remaining energy may affect egress speed, especially for barbarian returns
- unit identity, casualty records, and after-action accounting remain available after combat removal

Suggested lifecycle vocabulary:

```txt
Empire:
active
→ incapacitated/dying
→ terminal-egress
→ removed

Barbarian:
active
→ incapacitated/dying
→ respawn-egress
→ waiting-at-respawn
→ eligible-for-reformation
```

Dependency boundary:

This milestone owns casualty state, timers, interaction filtering, generic egress behaviour, and respawn-staging hooks.

Milestone 8 owns concrete Sentinel Gate geometry, barbarian respawn locations, reinforcement batching, scenario clocks, re-entry, and battle-end withdrawal.

Deferred:

- detailed wounds
- physick treatment and death-count intervention
- resurrection or restoration calls
- named-character persistence between battles
- cinematic corpse behaviour

---

## Milestone 7: Captains, Orders, and Command Behaviour

Status: future.

Purpose:

Make command matter.

Expected direction:

- captains issue and maintain orders
- units obey imperfectly based on pressure, cohesion, role, profile, command presence, and energy
- command delay/failure becomes visible state
- units can lose, retain, suspend, or reinterpret orders under stress
- captains can support rallying and coordinated withdrawal
- command loss has bounded local consequences rather than magical army-wide knowledge

This is likely one of the highest-value milestones for Empire battle feel.

---

## Milestone 8: Scenarios, Objectives, Battle Lifecycle, and Victory

Status: future.

Purpose:

Turn the sandbox into repeatable one-hour Empire battle simulations.

Expected direction:

- scenario definitions
- a fixed one-hour battle clock unless an explicit test scenario overrides it
- deployment zones
- the Sentinel Gate as the citizen entry and exit structure
- one or more barbarian respawn points
- objective areas
- hold, breakthrough, escort, ritual, asset, retrieval, and destruction objectives
- timed pressure and objective progress
- citizen deployment through the Sentinel Gate
- barbarian reinforcement waves assembled from players waiting at respawn
- reinforcement units formed only when the scenario’s batching conditions are met
- high-energy barbarians return and reform quickly
- low-energy barbarians return slowly and may eventually decline another re-entry
- late-battle reduction or cessation of barbarian respawns
- citizen withdrawal through the Sentinel Gate at battle end
- withdrawal may be an orderly walk after completed objectives or a pressured rout under barbarian pursuit
- scoring, victory conditions, and after-action outcome summaries

Battle shape:

By default, citizens leave the Sentinel Gate, compete with barbarian forces over objectives, and face repeated barbarian reinforcement waves. At the end of the hour, the citizens return through the Sentinel Gate regardless of whether withdrawal is orderly or forced.

Boundary:

Scenario logic coordinates existing systems. It should not duplicate morale, energy, casualty, command, or combat ownership.

---

## Milestone 9: Perception, Knowledge, and Fog of War

Status: future.

Purpose:

Remove perfect knowledge where it harms battle feel and provide the observation model later behaviours depend on.

Expected direction:

- local perception
- known and unknown hostile positions
- visible allies, casualties, objectives, and ground objects
- scouting value
- command uncertainty
- delayed or imperfect response
- bounded memory of recently observed entities
- deterministic visibility and awareness summaries

Dependency note:

Recoverable projectile behaviour later uses this milestone’s visibility/awareness model. An archer should seek an arrow they can perceive, not query every projectile anywhere on the battlefield.

---

## Milestone 10: Roles, Loadouts, Equipment, and Content Expansion

Status: future.

Purpose:

Expand unit archetypes, battlefield roles, equipment, and mechanically relevant capability data.

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
- thrown-weapon loadouts
- ranged ammunition capacities
- recoverable-projectile capability tags
- equipment capabilities
- call/shout capability as loadout/equipment affordance data only

Important placement rule:

This milestone defines bows, thrown weapons, carried ammunition limits, and relevant capability data. It does not yet create arrows or thrown weapons as recoverable battlefield objects. Those mechanics belong to Milestone 12.

Boundary:

Prefer data and taxonomy over hard-coded bespoke logic. Call/shout effects remain inactive until the later calls/shouts milestone.

---

## Milestone 11: Terrain and Battlefield Constraints

Status: future.

Purpose:

Make battlefield geometry and local safety matter.

Expected direction:

- chokepoints
- rough ground
- soft blockers
- impassable areas
- objective zones
- gate and respawn approach zones
- formation disruption from terrain
- bounded local assessments of safe, threatened, and hostile-controlled space

Dependency note:

Recoverable projectile retrieval uses terrain and local threat information when deciding whether an arrow is safely reachable.

Boundary:

Avoid full A* until necessary. Start with simple deterministic constraints and local steering.

---

## Milestone 12: Ammunition and Recoverable Battlefield Projectiles

Status: future.

Purpose:

Model the real Empire requirement to count, fire, drop, see, and recover physical arrows and thrown weapons.

Dependencies:

- perception and visible ground-object queries
- bow and thrown-weapon loadouts
- carried ammunition capacities
- terrain and local hostile-safety assessment
- ranged attack opportunity/resolution support

Expected direction:

- archers begin with a scenario/loadout-defined arrow count up to the Empire limit of 10
- carried arrows are explicit finite inventory
- firing removes an arrow from the archer’s inventory
- every fired arrow becomes a neutral physical ground object near its target, whether the attack hits or misses
- arrows have no faction ownership once on the ground
- any eligible archer may collect any reachable arrow
- collection transfers the arrow from the ground into carried inventory
- arrow-seeking priority depends on current ammunition, distance, visibility, local hostile threat, current orders, and separation from the unit
- the fewer arrows an archer carries, the farther they are willing to search
- an archer with zero arrows may travel a substantial distance toward a visible arrow because they cannot perform their ranged role without ammunition
- even at zero arrows, archers avoid arrows in immediate enemy danger or hostile-controlled space
- archers with ammunition should normally prefer their current combat role over unnecessary scavenging
- multiple archers competing for one arrow resolve deterministically
- projectile queries remain local and avoid global all-projectile scans

Thrown weapons:

- thrown weapons also become neutral recoverable ground objects after use
- users normally retain a melee weapon and therefore remain combat-capable
- thrown-weapon users opportunistically recover nearby safe weapons
- they do not normally abandon their unit or objective to conduct long-range searches
- the same physical-object system should support arrows and thrown weapons while allowing different retrieval policies

Boundary:

Do not build detailed ballistic physics. The simulation needs deterministic firing, landing, visibility, pickup, inventory, and behaviour—not a projectile-flight game.

---

## Milestone 13: Calls / Shouts and Hard Effects

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
- interaction with morale, routing, energy, casualties, and command

Boundary:

Do not attempt every call at once. Implement in narrow, testable slices.

---

## Milestone 14: Renderer, Replay, and Debug Tools

Status: future.

Purpose:

Build visual inspection once there is enough meaningful state to inspect.

Expected direction:

- useful replay/debug views
- state overlays
- pressure/cohesion/routing display
- energy and rest display
- casualty, dying, egress, and respawn display
- ammunition and ground-projectile display
- combat/effect logs
- scenario playback
- after-action summaries

Boundary:

Do not mistake visuals for validation. Headless deterministic tests remain the source of truth.

---

## Milestone 15: Performance and Scale Hardening

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
- bounded ground-object and casualty-egress queries
- realistic one-hour scenario soak tests

Boundary:

Optimise against realistic target scenarios, not abstract anxiety.

---

## Milestone 16: Content Authoring and Scenario Schema

Status: future.

Purpose:

Make battles authorable and repeatable without editing code.

Expected direction:

- JSON/data-driven scenario files
- army definitions
- unit archetypes
- faction templates
- player-energy distributions
- casualty and respawn timings
- Sentinel Gate and respawn-point definitions
- objective definitions
- equipment and starting-ammunition definitions
- replay exports
- after-action summaries

---
