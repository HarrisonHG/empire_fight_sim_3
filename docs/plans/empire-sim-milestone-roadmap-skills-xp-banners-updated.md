# Empire Fight Sim Milestone Roadmap

Status: working roadmap. Updated through the official Combat, Calls, Weapons & Armour, Skills, and Character XP reviews plus project battlefield-behaviour rulings on 2026-07-11.

This file records the current milestone series for the deterministic Empire LARP battle simulation. It includes completed foundation work, the active morale sequence, the individual-combat correction, and the likely future roadmap.

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
- Deliberate simulation simplifications must be documented as project rulings rather than hidden as accidental rules mismatches.
- Prefer coarse state that preserves battlefield consequences over phys-rep-level detail that creates large state and test surfaces without changing meaningful decisions.
- Treat runtime skill qualification, runtime resource use, and character-build legality as separate concerns.
- Until the later character-authoring milestone, scenario/loadout content may assume each entity has the XP and skills required for its assigned equipment and role.
- Hero points, mana, herbs, liao, and Artisan's Oil are individual finite resources even before full XP validation exists.
- Initial population scope remains citizens versus barbarians. Do not add nation, lineage, or Imperial Orc character distinctions until explicitly requested.

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

# Known Combat Fidelity Debt from Official Rules

The accepted Milestone 3 combat pipeline is a deterministic unit-level prototype that successfully supplies combat pressure and morale inputs. It is not the final Empire combat rules model.

Current intentional mismatches:

- attack opportunities are emitted per unit rather than per individual fighter
- survivability is accumulated per unit rather than tracked as individual global hits
- armour and shields currently reduce damage, while official Empire rules use armour to add global hits and shields as active blocking equipment
- Dreadnought is represented as an armour class even though it is an individual conditional skill
- the current attack interval is per unit rather than the official per-attacker/per-target one-second damage cap
- every current attack opportunity becomes a strike without an individual guard, parry, shield-block, or landed-blow decision

These abstractions remain acceptable while Milestone 4 is completed because they provide stable deterministic stimuli for pressure, morale, and routing. They must be migrated in Milestone 5 before the project treats combat survivability, casualties, ranged attacks, or calls as rules-faithful.

The migration should preserve the useful unit-level outputs as derived summaries rather than deleting unit behaviour ownership.


---

# Current and Future Overall Milestones

The order below reflects major dependency boundaries rather than a promise that every milestone will be one implementation slice.

Key placement decisions:

- Complete the current morale milestone against the accepted unit-level combat prototype rather than destabilising Milestone 4 mid-sequence.
- Individual combat state and official Empire hit rules come next because casualties, treatment, energy-in-combat, ranged attacks, and calls all require individual fighter state.
- Casualty and Chirurgeon rules immediately follow individual hits so zero-hit entities never remain active through an unrelated milestone.
- Energy follows the correct individual combat/casualty foundation and feeds movement, engagement willingness, recovery, carrying, egress, and morale over time.
- Core casualty and dying states precede scenarios, while Sentinel Gate geometry, respawn locations, reinforcement waves, and the one-hour battle clock belong to scenario integration.
- Calls and hard effects precede complete projectile combat because every landed arrow or bolt automatically applies IMPALE.
- A call effect, its delivery method, its granting source, its resource cost, and its active target state are separate concepts; the roadmap must not collapse them into one capability flag.
- Safety calls are out-of-character procedures and are excluded from autonomous simulation scope.
- Recoverable projectiles follow perception, individual equipment expansion, calls/effects, and terrain because they require visible world objects, ranged loadouts, ammunition capacity, IMPALE, and local safety reasoning.
- Weapon and armour fidelity uses broad individual categories: no one-handed spears or wands, bow/crossbow is mechanically unified, shields are `buckler` or `shield`, and armour protection is category-wide rather than locational.
- Body consequences use deterministic coarse `body`, `arm`, or `leg` outcomes rather than exact left/right hit locations.
- Battlefield rescue and treatment are behavioural systems: one physick or two fighters may drag specified casualties to safety, fighters hand patients to nearby physicks, and treatment proceeds in sequential uninterrupted actions.
- Citizens seek artisans after `SHATTER`; barbarians seek nearby terrain or the battlefield edge and perform a thirty-second self-repair.
- Official rules extraction should continue page by page. Each extracted rule should be assigned to a milestone, marked as core, behavioural, dependent, scenario/ref-driven, or out of current scope, and linked from the relevant plan.
- Canonical skill definitions and runtime resource pools belong to Milestone 11; active heroic/call/exorcism mechanics belong to Milestone 13; XP purchase validation belongs to a new late character-authoring milestone.
- Starting-character XP defaults to 8, but authored simulation characters may receive an explicit scenario-defined XP budget.
- Simplified battlefield `CURSE` replaces the variable ref-authored effect: the target abandons combat and formation, seeks a perceived friendly Exorcist, and dies after fifteen minutes unless exorcised.
- Default support inventories are 12 generic herbs per Physick, 9 liao per Exorcist, and 6 doses of Artisan's Oil per Artisan; scenarios may explicitly override these defaults.
- Physical unit banners improve morale and reform behaviour while providing an opportunistic enemy target-attraction signal when no better objective or immediate target exists.

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

---

## Milestone 5: Individual Combat State, Defence, and Empire Hit Rules

Status: future.

Purpose:

Replace the accepted unit-level combat prototype with individual fighter combat state that follows the important Empire hit, equipment, defence, and attack-cadence rules while using the project's documented equipment simplifications.

This milestone is deliberately placed immediately after morale. Milestone 4 may continue to consume the existing unit-level combat records while it is completed; Milestone 5 then migrates the production sandbox without reopening every accepted morale slice at once.

Expected direction:

- individual entities become authoritative for weapons, shields, armour, helmet use, combat skills, attack recovery, guard state, and global hits
- unit loadout data remains available as doctrine, scenario shorthand, or a derived summary, but no longer acts as the final source of truth for every member
- attack attempts select individual targets through bounded local spatial queries
- ordinary landed blows remove exactly one global hit
- weapon reach changes threat geometry, preferred distance, opportunity, pressure, and defence rather than ordinary damage value
- a ready fighter facing an obvious simple attack usually blocks, parries, or otherwise prevents the first blow
- repeated pressure, recovery, crowding, flanking, local numbers, poor facing, and degraded guard create openings
- shields are active facing/coverage defences, not passive damage reduction
- weapons cannot parry arrows or bolts
- the one-second rule is enforced per attacker entity and target entity
- separate attackers may each damage the same target normally
- no passive global-hit regeneration occurs during a normal one-hour battle
- zero global hits emits an immediate casualty transition for Milestone 6
- coarse impact vocabulary exists for later calls:

```txt
body
arm
leg
```

## Equipment scope

Mechanical weapon categories:

```txt
unarmed
dagger
oneHanded
greatWeapon
polearm
pike
thrown
ranged
rod
staff
```

Explicit exclusions:

```txt
oneHandedSpear
wand
```

Bow and crossbow are mechanically one `ranged` category. An optional renderer/content field may preserve aesthetic style without changing rules.

Shield categories:

```txt
none
buckler
shield
```

Armour categories:

```txt
none
light
medium
heavy
mageArmour
```

Do not retain `dreadnought` as an armour class.

Official maximum-hit derivation under project simplification:

```txt
maximumGlobalHits =
  2 base
  + enduranceLevels
  + armourExtraHits
  + helmetExtraHit
  + qualifyingDreadnoughtExtraHit
  + temporaryAlwaysOnModifiers
```

Base equipment additions:

```txt
none         +0
light        +2
medium       +3
heavy        +4
mage armour  +2
helmet       +1
```

Additional project rules:

- medium armour later grants one hero point through resource derivation
- all simulated heavy armour is substantial enough to qualify for Dreadnought
- `hasDreadnought && armour == heavy` adds one global hit
- armour increases global hits; it does not reduce landed-blow damage
- shields prevent blows through active defence; they do not reduce landed-blow damage
- armour is not a separately damaged or repaired hit pool
- no physical armour coverage mask is stored
- medium armour later protects the whole simulated individual from `CLEAVE`
- heavy armour later protects the whole simulated individual from `CLEAVE` and `IMPALE`

Suggested individual data:

- weapon category, reach, permitted attack modes, hand requirement, and ready/broken state
- optional backup weapon
- optional bow/crossbow visual style
- shield type and held/slung/broken state
- armour type and helmet qualification
- Weapon Master, Shield, Marksman, Thrown, Ambidexterity, Endurance, Fortitude, Dreadnought, and magical-combat capability hooks
- these are trusted runtime qualifications in Milestone 5; XP purchase/prerequisite validation remains deferred
- current target, attack commitment, recovery, guard readiness, facing, and occupied hands
- current and derived maximum global hits
- coarse arm-combat-disabled and leg-movement-disabled hooks for later call effects

Suggested slices:

```txt
5A individual combat profiles, simplified equipment vocabulary, and validation
5B individual engagement and target selection
5C attack commitment, recovery, guard, parry, and shield defence
5D official global-hit derivation and one-hit ordinary strikes
5E per-attacker/per-target one-second damage gate
5F integration, unit aggregation, migration, performance, and visual replay
```

Performance rule:

Do not introduce a dense attacker-by-target matrix. The one-second relationship gate must retain only active local attacker-target relationships and expire them deterministically.

Boundary:

- no dying timer, terminal state, execution, casualty dragging, or treatment yet beyond the zero-hit transition record
- no exact hit-location or left/right limb model
- no complete heroic or magic calls
- no ballistic projectile flight or recoverable projectile objects
- no random block percentage
- no replacement of unit-level orders, cohesion, morale, or formation ownership

---

## Milestone 6: Casualties, Dying, Battlefield Treatment, Rescue, and Player-Presence State

Status: future.

Purpose:

Consume individual zero-hit and disabling-injury transitions, implement battlefield casualty procedure, model rescue and treatment behaviour, and distinguish fictional character state from the real player's continued physical presence.

Expected direction:

- reaching zero global hits immediately changes the entity from active to dying and unresisting
- dying characters may perceive, talk, or scream but cannot attack, defend, move tactically, use ordinary skills, use ordinary items, provide combat support, block movement as an active fighter, spread positive morale, or contest objectives
- normal Empire dying time is 180 seconds before terminal state
- Fortitude increases the death count according to the official progression
- faction- or scenario-specific procedures may override the normal count, including the shorter barbarian battlefield return procedure
- regaining at least one global hit ends dying state unless the character is terminal
- every Physick in default project content also has Chirurgeon
- Chirurgeon treatment requires thirty uninterrupted seconds, pauses the death count while active, restores one hit on completion, and fails if healer or patient attacks or is hit
- initial battlefield treatment uses a common thirty-second action abstraction for each separately treated issue
- a physick treats every condition on the current patient for which they possess a valid treatment source, one completed action at a time
- treatment priority strongly favours zero hits, immobility, and disabled attacks before persistent non-critical conditions
- after each completed action the physick reassesses the current patient and nearby casualty queue
- execution requires a dying or consenting target and a five-second committed action before the fatal result
- terminal character state and player-presence state remain separate
- terminal Empire player entities may perform non-interactive battlefield egress without making the character combat-active
- barbarian player entities may move toward respawn staging under scenario rules
- casualty, treatment, execution, dragging, handoff, and after-action records remain inspectable after removal

## Casualty urgency

Immediate critical events:

```txt
zero hits
arm disabled by CLEAVE or IMPALE
leg immobilised by CLEAVE or IMPALE
PARALYSE while exposed to immediate hostile threat
```

Persistent-condition behaviour:

- veterans with `VENOM` or `WEAKNESS` normally wait for a peaceful moment before seeking treatment
- veterans become urgent when they have roughly one or two hits remaining
- recruits tend to seek treatment promptly even when otherwise healthy
- experience/confidence should interpolate between those extremes

Transient effects:

```txt
REPEL
STRIKEDOWN
ENTANGLE
PARALYSE
```

Ordinary AI does not seek a healer merely to remove these short effects. It normally lets them expire, although exposed paralysed allies may be rescued.

## Dragging and rescue

Eligible patients:

```txt
PARALYSED
zero hits
leg-disabled
```

Required helpers:

```txt
one physick
or
two ordinary fighters
```

Expected mechanics:

- one physick commits both hands and may drag alone
- two fighters form a cooperative drag group
- carriers suspend ordinary attacks and formation-slot participation
- dragging uses reduced deterministic movement speed
- later energy systems charge additional exertion
- the destination is a local low-threat treatment position, not necessarily the globally nearest healer
- safe-position selection considers hostile threat, allied-line direction, recent combat density, reachable terrain, and known physicks
- fighters hand the patient to a nearby available physick and return to combat
- handoff is explicit state and an inspectable event

Suggested treatment priority:

```txt
1. zero hits / active death count
2. leg immobility
3. arm combat disability
4. VENOM at low hits
5. dangerously low global hits
6. WEAKNESS affecting a critical active role
7. VENOM at comfortable hits
8. WEAKNESS without immediate role pressure
9. other treatable non-critical effects
```

Suggested lifecycle vocabulary:

```txt
Character:
active
→ combat-disabled
→ dying
→ terminal
→ dead

Casualty assistance:
none
→ rescue-requested
→ being-dragged
→ at-treatment-position
→ handed-to-physick
→ under-treatment
→ released

Empire player presence:
active-presence
→ downed-presence
→ terminal-egress
→ removed-from-battlefield

Barbarian player presence:
active-presence
→ downed-presence
→ respawn-egress
→ waiting-at-respawn
→ eligible-for-reformation
```

Suggested slices:

```txt
6A zero-hit transition, disabling-injury hooks, and interaction filtering
6B death counts, Fortitude, terminal state, and deterministic timers
6C medical urgency and recruit/veteran healer-seeking policy
6D casualty drag groups, safe extraction, and cooperative movement
6E physick handoff, patient ownership, and treatment queue
6F thirty-second Chirurgeon and general battlefield treatment actions
6G execution and fatal-result records
6H generic Empire egress and barbarian respawn-staging hooks
6I integration, morale consequences, replay, and performance coverage
```

Important rules:

- a terminal character cannot be saved even if the associated player-presence entity is still moving
- dying, dragged, and carried entities do not become absurd permanent collision walls
- a mobile arm-disabled patient can self-evacuate; a leg-disabled or paralysed patient normally cannot
- treatment progress is lost on interruption
- patient continuity has weight, but a newly arrived zero-hit casualty may take priority after the current action completes
- treatment source availability is queried; do not grant infinite herbs, mana, liao, or oils before resource content exists
- default Physick content begins with 12 generic herbs and spends one on each successfully completed Physick treatment action
- interrupted herb treatment releases the reserved herb rather than consuming it

Dependency boundary:

This milestone owns casualty state, timers, interaction filtering, medical urgency, rescue groups, generic local safety selection, patient handoff, treatment actions, execution, generic egress behaviour, and respawn-staging hooks.

Milestone 9 owns concrete Sentinel Gate geometry, barbarian respawn locations, reinforcement batching, scenario clocks, re-entry, and battle-end withdrawal.

Milestone 11 owns detailed skill/source inventories and support-role content.

Milestone 12 later enriches safe treatment positions and extraction routes with battlefield terrain.

Deferred:

- traumatic wounds
- detailed herb, potion, spell, and item catalogue
- resurrection
- exact physical dragging animation
- detailed corpse geometry
- named-character persistence between battles

---

## Milestone 7: Energy, Exertion, and Rest

Status: future.

Purpose:

Model the real physical energy limits of individual LARP players and make fatigue visible in movement, morale, combat, casualty handling, and battlefield choices.

Expected direction:

- each individual has an energy capacity and current energy value
- starting energy and capacity are deterministic scenario inputs and vary across the player base
- energy is not derived directly from experience, confidence, or recruit/veteran status
- walking, jogging, sprinting, charging, fighting, repeated defence, carrying equipment, carrying casualties, and recovering consume or restore energy at different rates
- energy affects ordinary movement speed and strongly limits charge/sprint duration
- low energy reduces attack tempo, recovery quality, willingness to engage, and resistance to morale pressure
- units may deliberately disengage, withdraw, or remain inactive for meaningful periods to recover
- citizens normally enter battle energetic and initially confident
- later morale depends on battlefield progress, nearby comrades, casualties, and remaining energy rather than permanent opening enthusiasm
- barbarian post-death return speed and willingness to re-enter can consume or depend on remaining energy
- deterministic unit summaries expose whether a formation can still charge, jog, fight effectively, carry casualties, or needs rest

Important distinction:

Fitness, enthusiasm, experience, confidence, discipline, current hits, and current energy are related but separate. A veteran may be exhausted or physically unfit; a recruit may have abundant energy; an uninjured fighter may still be too tired to charge.

Hit recovery rule:

Energy recovery or ordinary battlefield rest must not restore lost global hits. Natural global-hit recovery requires at least two hours of rest and therefore does not occur during a normal one-hour battle.

Deferred:

- veterans pacing themselves more efficiently
- hydration, heat, nutrition, and injury-specific fatigue
- detailed animation or visual exhaustion cues

Boundary:

Do not turn energy into a second morale or health system. Energy is individual physical state; morale owns morale transitions and global hits own injury capacity.

---

## Milestone 8: Captains, Orders, and Command Behaviour

Status: future.

Purpose:

Make command matter.

Expected direction:

- captains issue and maintain orders
- units obey imperfectly based on pressure, cohesion, role, profile, command presence, casualties, and energy
- command delay/failure becomes visible state
- units can lose, retain, suspend, or reinterpret orders under stress
- captains can support rallying, casualty retrieval, coordinated withdrawal, and controlled re-engagement
- command loss has bounded local consequences rather than magical army-wide knowledge
- captains cannot directly command individuals they cannot perceive or communicate with

This is likely one of the highest-value milestones for Empire battle feel.

---

## Milestone 9: Scenarios, Objectives, Battle Lifecycle, and Victory

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
- hold, breakthrough, escort, ritual, asset, retrieval, capture, and destruction objectives
- timed pressure and objective progress
- citizen deployment through the Sentinel Gate
- barbarian reinforcement waves assembled from players waiting at respawn
- reinforcement units formed only when the scenario’s batching conditions are met
- high-energy barbarians return and reform quickly
- low-energy barbarians return slowly and may eventually decline another re-entry
- late-battle reduction or cessation of barbarian respawns
- citizen withdrawal through the Sentinel Gate at battle end
- withdrawal may be an orderly walk after completed objectives or a pressured rout under barbarian pursuit
- optional named-character capture, searching, or item-retrieval interactions
- scoring, victory conditions, and after-action outcome summaries

Battle shape:

By default, citizens leave the Sentinel Gate, compete with barbarian forces over objectives, and face repeated barbarian reinforcement waves. At the end of the hour, the citizens return through the Sentinel Gate regardless of whether withdrawal is orderly or forced.

Boundary:

Scenario logic coordinates existing systems. It should not duplicate morale, energy, casualty, command, combat, treatment, or effect ownership.

---

## Milestone 10: Perception, Knowledge, and Fog of War

Status: future.

Purpose:

Remove perfect knowledge where it harms battle feel and provide the observation model later behaviours depend on.

Expected direction:

- local perception
- known and unknown hostile positions
- visible allies, casualties, objectives, ground objects, and active treatment
- scouting value
- command uncertainty
- delayed or imperfect response
- bounded memory of recently observed entities
- deterministic visibility and awareness summaries
- dying characters may perceive and communicate locally, but cannot act as omniscient sensors

Dependency note:

Recoverable projectile behaviour later uses this milestone’s visibility/awareness model. An archer should seek an arrow they can perceive, not query every projectile anywhere on the battlefield.

---

## Milestone 11: Roles, Individual Loadouts, Skills, Runtime Resources, Banners, Support Roles, and Content Expansion

Status: future.

Purpose:

Create the canonical runtime skill/content layer after individual combat, casualties, perception, and command exist. Expand individual fighter archetypes, mixed unit compositions, equipment permissions, skill-derived stats, hero/mana pools, support consumables, and physical banners without yet requiring every scenario entity to be authored through an XP-valid character build.

This milestone separates:

```txt
runtime qualification
runtime effect/resource state
future character-build legality
```

Milestone 11 owns the first two. Milestone 18 owns the third.

Until Milestone 18, scenario/loadout content may directly assign a valid skill profile and is trusted to have sufficient XP.

Expected equipment scope:

```txt
Weapons:
unarmed
dagger
oneHanded
greatWeapon
polearm
pike
thrown
ranged
rod
staff

Shields:
none
buckler
shield

Armour:
none
light
medium
heavy
mageArmour
```

Explicitly omit:

```txt
oneHandedSpear
wand
```

Bow and crossbow are aesthetic variants of `ranged`, not separate mechanical loadouts.

## Canonical relevant skill catalogue

Combat:

```txt
Thrown
Ambidexterity
Weapon Master
Marksman
Shield
Endurance
Fortitude
Dreadnought
```

Magic:

```txt
Magician
Extra Mana
Extra Spell
Battle Mage
```

Surgical:

```txt
Chirurgeon
Physick
```

Religious:

```txt
Dedication
Exorcism
```

Crafting:

```txt
Artisan
```

Heroic:

```txt
Hero
Extra Hero Points
Cleaving Strike
Mortal Blow
Mighty Strikedown
Relentless
Unstoppable
Stay With Me
Get It Together
```

All other skills remain absent until explicitly added.

## Skill definition data

Definitions must be data-driven and reusable by runtime content, headless validation, future scenario imports, and the later character builder.

Required definition fields:

```txt
skill id
category
first cost
repeat-cost rule
prerequisite skill ids
runtime classification
equipment compatibility tags
active versus always-on classification
```

Repeat-cost rules:

```txt
not repeatable
flat cost per rank
increasing cost per rank
```

Prerequisite graph:

```txt
Magician -> Extra Mana, Extra Spell, Battle Mage
Chirurgeon -> Physick
Dedication -> Exorcism
Hero -> every other heroic skill
Weapon Master -> Mortal Blow, Mighty Strikedown
```

## Relevant XP costs

```txt
Thrown              1
Ambidexterity        1
Weapon Master        2
Marksman             4
Shield               2
Endurance             2, then +1 cost per later rank
Fortitude             1, then +1 cost per later rank
Dreadnought          1

Magician             2
Extra Mana            1, then +1 cost per later rank
Extra Spell           1 per rank, flat
Battle Mage          2

Chirurgeon           1
Physick              3

Dedication           2
Exorcism             1

Artisan              4

Hero                 2
Extra Hero Points     1, then +1 cost per later rank
Cleaving Strike      1
Mortal Blow          1
Mighty Strikedown    1
Relentless           2
Unstoppable          2
Stay With Me         1
Get It Together      1
```

These costs are stored now for future reuse, but Milestone 11 does not reject a trusted scenario profile merely because no XP build record is attached.

## Runtime qualification effects

- `Thrown` permits the `thrown` weapon category.
- `Ambidexterity` permits a compatible dual-wield profile and does not bypass the one-second rule.
- `Weapon Master` permits `greatWeapon`, `polearm`, and `pike`; one-handed spears remain omitted.
- `Marksman` permits unified `ranged`; every landed ranged projectile later applies automatic `IMPALE`.
- any individual may use `buckler`; `Shield` permits `shield`.
- each Endurance rank adds one maximum global hit.
- Fortitude supplies normal and venom death-count progression.
- `hasDreadnought && armour == heavy` adds one maximum global hit.
- all simulated heavy armour qualifies for Dreadnought.
- `Battle Mage` permits `staff` and `mageArmour` but grants no mana by itself.
- mage armour remains vulnerable to `CLEAVE` and `IMPALE`.
- every Physick default profile also includes Chirurgeon.

These equipment permissions and passive modifiers remain active under `WEAKNESS`.

## Runtime resource derivation

Every pool belongs to an individual:

```txt
currentHeroPoints / maximumHeroPoints
currentMana / maximumMana
currentHerbs / maximumHerbs
currentLiao / maximumLiao
currentArtisanOil / maximumArtisanOil
```

Suggested maximum derivations:

```txt
maximumHeroPoints =
  (hasHero ? 2 : 0)
  + extraHeroPointRanks
  + mediumArmourHeroPointBonus
  + temporaryAlwaysOnHeroPointModifiers

maximumMana =
  (hasMagician ? 4 : 0)
  + (2 * extraManaRanks)
  + temporaryAlwaysOnManaModifiers
```

`Extra Spell` adds selected spell capacity, not mana.

Default battle inventories:

```txt
Physick generic herbs: 12
Exorcist liao: 9
Artisan's Oil: 6 doses per Artisan by default; scenario-overridable
```

No ordinary runtime resource replenishes during a normal one-hour battle unless a later explicit effect says otherwise.

Unit-level resource summaries may be derived for command/debugging, but they cannot spend resources.

## Active versus always-on classification

Always-on examples:

```txt
equipment permissions
Endurance
Fortitude
Dreadnought
Battle Mage equipment qualification
```

Active examples:

```txt
spellcasting
Exorcism
Cleaving Strike
Mortal Blow
Mighty Strikedown
Relentless
Unstoppable
Stay With Me
Get It Together
```

`WEAKNESS` suppresses active heroic, magical, and religious use while preserving always-on permissions and modifiers. Mundane Chirurgeon/Physick treatment remains available unless a later official rule explicitly says otherwise.

## Selected spell data

- Magician grants four personal mana and the basic spell-capability set.
- Extra Mana grants two additional mana per rank.
- Extra Spell records one selected spell ID per rank.
- Battle Mage permits staff delivery and mage armour.
- exact spell effects and spell costs remain deferred to the dedicated Magic/Spellcasting rules review.

Milestone 11 must not invent the spell catalogue merely to make the mana field look busy.

## Support-role data

Physick/Chirurgeon:

- trusted Chirurgeon and Physick qualifications
- 12 generic herbs by default
- current patient
- treatment queue
- reserved/available herb state
- treatment-role priority
- ability to drag a casualty alone

Exorcist:

- Dedication and Exorcism qualifications
- 9 liao by default
- current curse patient
- uninterrupted ceremony action
- known/visible cursed-character query

Artisan:

- Artisan qualification
- available Artisan's Oil doses
- current repair patient/item
- uninterrupted oil application
- known repair location or mobile support behaviour

Equipment owner:

- primary item
- optional backup item
- broken/ready/slung/dropped state
- repair-seeking policy
- known support-role locations

## Heroic capability data

Milestone 11 defines capability and equipment compatibility but does not yet resolve the active skills.

Required tags:

```txt
supportsCleavingStrike
supportsMortalBlow
supportsMightyStrikedown
```

This avoids reconstructing exact inch lengths and weapon shapes from broad runtime categories.

Hero points are one shared individual budget across offensive, recovery, survival, and ally-support abilities.

## Banners

Some units possess a physical banner.

Required state:

```txt
unit id
carrier entity id or world-object id
held / displayed / dropped / absent
position
visibility/awareness
```

While a banner is present and available to the unit:

- unit morale/confidence receives bounded positive support
- scattered or routing members become more willing to reform
- reform attraction and persistence increase
- the banner acts as a visible local rally reference, not global magical knowledge

Enemy behaviour:

- a visible hostile banner increases opportunistic target score
- this applies only when there is no more appropriate objective, immediate threat, assigned target, or locally valuable engagement
- enemy AI does not abandon urgent objectives or take absurd risks solely to chase cloth on a stick, however magnificently embroidered

Exact hand occupation, capture, formal band membership, and gonfalon magic remain deferred until the relevant official documentation is reviewed.

## Call-source correction

The current unit-level `SpecialCallCapability` list is inactive prototype vocabulary. It conflates:

```txt
call effect
source skill/item/spell
resource cost
compatible equipment
general healing or repair ability
```

Replace it with separate individual data concepts before Milestone 13:

```txt
CallId
CallSourceDefinition
CallDeliveryMode
source SkillId or content id
resource pool and cost
compatible equipment
use/consumption policy
active versus always-on classification
```

`heal`, `restore`, `exorcise`, and `fixWeapon` are treatment/restoration/ceremony/repair actions, not official calls.

## Suggested slices

```txt
11A canonical skill IDs, definitions, prerequisites, and repeat-cost metadata
11B trusted individual skill profiles and equipment permissions
11C hero-point and mana maximum/current resource stores
11D support consumables: herbs, liao, and Artisan's Oil
11E Endurance, Fortitude, Dreadnought, and derived survivability integration
11F Magician, Extra Mana, Extra Spell, and Battle Mage profiles
11G Chirurgeon, Physick, Dedication, Exorcism, and Artisan profiles
11H heroic capability and compatible-equipment tags
11I banner state, morale/reform integration, and opportunistic target attraction
11J mixed roles, scenario defaults, replay, tests, and consolidation
```

Important placement rules:

- Milestone 5 establishes the minimum trusted individual qualifications required for ordinary combat.
- Milestone 6 owns Chirurgeon/Physick action mechanics and casualty treatment.
- Milestone 11 establishes canonical skill/content data and finite runtime resources.
- Milestone 13 activates heroic skills, simplified CURSE, Exorcism, and call delivery.
- Milestone 18 validates that a named authored character could legally buy the assigned skills with XP.
- ranged loadouts and ammunition capacity are defined here, but recoverable projectile objects remain later.

Boundary:

Prefer data, derivation, and reusable validators over hard-coded bespoke logic. Do not implement every official spell, ritual, magic item, potion, monster ability, priest ceremony, or artisan recipe in this milestone.

---

## Milestone 12: Terrain and Battlefield Constraints

Status: future.

Purpose:

Make battlefield geometry, physical safety, and local tactical constraints matter.

Expected direction:

- chokepoints
- rough ground
- soft blockers
- impassable and unsafe areas
- objective zones
- gate and respawn approach zones
- formation disruption from terrain
- bounded local assessments of safe, threatened, and hostile-controlled space
- safe down-position adjustment for dying or struck-down entities
- controlled shield pushing at slow movement only
- no grappling, tripping, tackles, body-contact charges, or shield barges
- long-weapon clearance and crowding constraints
- obstacles that interact with forced movement such as REPEL
- local low-threat treatment positions and casualty extraction routes
- terrain features usable as barbarian SHATTER repair refuges
- battlefield-edge fallback destinations for barbarian repair

Dependency note:

Recoverable projectile retrieval uses terrain and local threat information when deciding whether an arrow is safely reachable. Hard-effect movement also needs obstacle and safety handling.

Boundary:

Avoid full A* until necessary. Start with simple deterministic constraints and local steering.

---

## Milestone 13: Calls, Heroic Active Skills, Simplified Curse/Exorcism, Hard Effects, Treatment Pressure, and Equipment Repair

Status: future.

Purpose:

Implement official call semantics, relevant active heroic skills, the project simplified CURSE/Exorcism loop, and their believable battlefield consequences after individual combat, casualties, perception, skill/resource profiles, support roles, equipment resources, and terrain exist.

Calls are not generic damage modifiers or videogame cooldown powers. They can:

- zero global hits
- disable attacks
- prevent movement
- force item drops
- knock a target down
- prevent foot movement
- prevent nearly every voluntary action
- force movement away from a source
- break equipment
- shorten a future or active death count
- suppress active heroic, magical, and religious abilities
- begin an execution action
- create urgent rescue or treatment behaviour
- affect everyone in an area without inflicting an ordinary hit

Every ordinary strike-delivered call also carries the ordinary one-global-hit result when the blow actually lands on the character. A weapon or shield contact may prevent that hit while still allowing `ENTANGLE`, `REPEL`, `STRIKEDOWN`, or item-targeted `SHATTER` to apply. MASS calls are ranged area effects and do not cause ordinary hit loss.

Safety calls remain excluded.

Expected official effect set:

```txt
Heroic:
CLEAVE
IMPALE
STRIKEDOWN
EXECUTE

Magic:
CURSE
ENTANGLE
PARALYSE
REPEL
SHATTER
VENOM
WEAKNESS

Area modifier:
MASS
```

Core architecture:

Keep these concepts separate:

```txt
call effect
call delivery mode
call source
compatible equipment
resource pool and cost
caller-observable acceptance
target active-effect state
behavioural consequence
source skill qualification
shared individual hero/mana/consumable pool
committed action state and interruption policy
```

Suggested delivery modes:

```txt
strike
automaticProjectile
massCone
timedExecution
```

Common resolution order:

```txt
source eligibility
→ resource availability
→ delivery attempt
→ physical contact result
→ ordinary-hit result
→ call-effect eligibility
→ call-effect application
→ caller-observable acceptance
→ resource consumption
→ consequence/urgency emission
→ event emission
```

Expected common rules:

- one call at most per blow
- no general resistance roll
- ordinary-hit and special-effect outcomes remain separate
- hidden `VENOM` and `WEAKNESS` are assumed accepted after valid unblocked delivery
- oversized monstrous creatures are immune to call effects
- stable deterministic ordering for multi-target results
- no per-tick allocation-heavy status-object churn

Defence/contact matrix:

- `CLEAVE`, `IMPALE`, `CURSE`, `PARALYSE`, `VENOM`, and `WEAKNESS` are prevented by a normal weapon parry or shield block
- `ENTANGLE`, `REPEL`, and `STRIKEDOWN` affect the character through weapon parry or shield block, but no ordinary hit is lost
- `SHATTER` affects the eligible weapon, implement, or shield struck
- medium armour negates the `CLEAVE` special effect for the whole simulated individual
- heavy armour negates `CLEAVE` and `IMPALE` special effects for the whole simulated individual
- negated `CLEAVE`/`IMPALE` still cause the ordinary hit when the strike lands
- arrows and bolts use the unified ranged pipeline, automatically deliver `IMPALE`, and cannot be weapon-parried

Required target state:

- coarse impact category: `body`, `arm`, or `leg`
- arm-combat-disabled state
- leg-movement-disabled state
- held item and forced dropping
- standing, forced-fall, grounded, getting-up, and immobile states
- forced movement source, travelled distance, duration, and obstacle-pinned state
- ready/broken/dropped/slung equipment state
- venom, weakness, paralysis, entangle, curse, and other effect markers
- active ability versus passive always-on permission
- Fortitude-aware death-count state
- hero-point, mana, per-day, prepared-use, and source-specific finite resources
- medical urgency and repair-seeking consequence hooks

## Effect direction

### CLEAVE and IMPALE

Use deterministic coarse impact selection:

```txt
body
arm
leg
```

When armour does not negate the special effect:

- `body` reduces the target to zero global hits
- `arm` disables ordinary attacks and creates urgent treatment-seeking
- `leg` prevents voluntary translation and creates rescue eligibility
- no left/right limb state is stored
- melee and automatic projectile `IMPALE` share the effect resolver but not delivery rules

Manual use policy:

- competent finite-source users avoid `CLEAVE` against medium/heavy armour
- competent finite-source users avoid `IMPALE` against heavy armour
- automatic projectile `IMPALE` is exempt because the ordinary hit remains relevant

### STRIKEDOWN

- force a safe fall within at most two non-tactical steps
- cancel current attack, movement, and active defence
- require explicit get-up action
- ordinary AI lets the effect run its course rather than seeking a cure

### ENTANGLE

- lock foot translation for ten seconds
- permit upper-body combat and otherwise legal actions
- ordinary AI lets it expire
- `ENTANGLE` movement restriction takes precedence over `REPEL`
- both timers continue; `REPEL` resumes only if duration remains after `ENTANGLE` ends

### PARALYSE

- lock voluntary actions and movement for ten seconds
- permit speech and externally supplied treatment/potion where legal
- preserve passive always-on effects
- ordinary AI does not seek a cure
- exposed allies may drag the target to safety
- `PARALYSE` takes precedence over `REPEL`
- both timers continue; `REPEL` resumes only if duration remains

### REPEL

- force movement away from the source at brisk-walk speed or faster
- end after ten seconds or more than 6 metres
- obey explicit suppression by active `ENTANGLE` or `PARALYSE`
- if an obstacle prevents movement, pin the target under the official restriction
- ordinary AI lets the effect expire rather than seeking treatment

### SHATTER

Mechanical effect:

- break the struck weapon, implement, or shield
- cancel attacks/defences requiring it
- use a backup item if available
- broken equipment remains unusable until repaired

Citizen behaviour:

- seek the closest known/visible reachable allied artisan
- leave formation while seeking repair
- use a ten-second uninterrupted Artisan's Oil repair when a valid dose exists
- return to the prior unit/order after repair
- do not perform generic self-repair

Barbarian behaviour:

- seek the nearest reachable terrain feature, or nearest battlefield edge if none exists
- perform a thirty-second uninterrupted jerry-rig repair
- restart on interruption
- return to a compatible unit/order after repair

### VENOM

- persist until cured
- use the Fortitude-dependent venom death count
- applying while dying clamps remaining time downward but never increases a shorter count
- veteran at comfortable hits normally waits for a peaceful treatment window
- veteran at one or two hits treats it as urgent
- recruit normally seeks a physick promptly
- preserve hidden-condition resource-spending behaviour

### WEAKNESS

- suppress active calls, heroic skills, religious skills, spells, rituals, and similar abilities
- preserve always-on qualifications and hit modifiers
- permit ordinary movement, fighting, blocking, and weapon use
- veteran normally waits for a peaceful treatment window
- recruit normally seeks a physick promptly
- urgency increases if the affected active role is crucial to the current situation

### EXECUTE

- require valid target state
- require a five-second committed fatal action
- complete as immediate character death while preserving player-presence procedure
- define interruption conditions explicitly

### CURSE and Exorcism

This is a deliberate deterministic replacement for the official variable/ref-authored CURSE payload.

On CURSE application:

- begin a fifteen-minute fatal timer
- stop attacking, active defence, casualty rescue, treatment, repair, spellcasting, heroic actions, objective contesting, and formation-slot following
- abandon ordinary unit/order priorities while the curse is active
- slowly seek the nearest known or visible friendly Exorcist
- avoid enemies, hostile-controlled space, and active combat where possible
- if no friendly Exorcist is known, move toward low-threat friendly/rear space and continue searching
- remain physically able to walk and navigate
- become terminal/dead if the timer expires

Exorcism:

- requires Dedication + Exorcism qualification
- requires touch range and ten uninterrupted seconds
- uses one liao on successful completion
- default Exorcist inventory is nine liao
- fails/restarts if priest or target attacks or is hit
- clears the curse and fatal timer
- returns the character to ordinary AI; normal reform/order systems must reacquire them

Only Exorcism cures this project CURSE. Generic hero-point resistance does not resist or cure it.

### MASS

- pair MASS with a content-defined call effect
- query a ninety-degree cone up to 6 metres in front of the source
- affect every eligible character, including allies unless a source says otherwise
- do not inflict an ordinary hit
- use stable deterministic target ordering and spatial queries


## Relevant active heroic skills

All heroic abilities spend from one shared individual hero-point pool. Hero grants two points; Extra Hero Points adds one per rank; medium armour may add the existing equipment-derived point.

### Cleaving Strike

- spend one hero point to deliver `CLEAVE` through a compatible landed strike
- requires Hero and the relevant capability tag
- ordinary one-handed compatibility may exist without Weapon Master
- larger compatible weapons require Weapon Master
- mage implements are excluded

### Mortal Blow

- requires Hero + Weapon Master
- spend one hero point to deliver `IMPALE`
- requires a `supportsMortalBlow` great weapon
- polearms, pikes, rods, staves, and ranged weapons are excluded

### Mighty Strikedown

- requires Hero + Weapon Master
- spend one hero point to deliver `STRIKEDOWN`
- requires a `supportsMightyStrikedown` polearm

For all offensive heroic calls, spend the point only when the effect visibly applies under the existing caller-observable acceptance rule.

### Relentless

- spend one hero point
- perform a five-second committed self-recovery action
- restore one arm or leg disabled by `CLEAVE` or `IMPALE`
- making an attack interrupts and restarts without spending the point
- use is urgent when leg disability prevents movement or arm disability removes the primary role

### Unstoppable

- spend one hero point
- remain stationary and take no offensive action for five seconds
- restore up to three global hits
- may begin immediately after falling to zero hits, but not after waiting on the ground
- track the immediate zero-hit eligibility window explicitly
- does not repair limbs or remove `VENOM`
- cannot be used under `WEAKNESS` or `PARALYSE`
- if legally begun at zero hits, complete according to the official three-hit result despite ordinary damage taken during the action

### Stay With Me

- spend one hero point
- touch-range five-second uninterrupted action on a companion at zero hits
- restore one hit and end the ordinary dying state
- does not restore disabled limbs
- if user or target attacks, or either is hit, restart without spending the point
- use as a fast local rescue option when physick capacity is absent, delayed, or overwhelmed

### Get It Together

- spend one hero point
- touch-range five-second uninterrupted action on a companion who still has at least one hit
- restore up to three lost hits
- does not restore disabled limbs
- if user or target attacks, or either is hit, restart without spending the point
- normally use during a lull or behind a line rather than in direct contact

Hero-point behaviour considers current hits, disabled limbs, nearby casualties, physick availability, target armour/role, call landing chance, current order, local threat, remaining points, experience, and battle time. Veterans should use points better, not perfectly.

## Treatment and rescue integration

Effects emit explicit consequence records rather than directly commandeering AI.

Examples:

```txt
armDisabled
legImmobilised
zeroHitCasualty
persistentConditionDetected
transientActionLock
repairNeeded
```

Milestone 6 consumes these records for:

- medical urgency
- self-evacuation
- casualty drag requests
- physick handoff
- sequential thirty-second treatment
- recruit/veteran healer-seeking

## Suggested slices

```txt
13A call/active-skill vocabulary, source data, shared resources, and migration
13B common delivery/contact/effect/resource/action pipeline
13C ENTANGLE, PARALYSE, and explicit REPEL precedence
13D REPEL and STRIKEDOWN movement/fall/terrain interaction
13E CLEAVE and IMPALE coarse body/arm/leg consequences and broad armour protection
13F SHATTER, backup items, citizen artisan-seeking, and barbarian self-repair
13G VENOM, WEAKNESS, Fortitude, medical urgency, and treatment-seeking policy
13H Cleaving Strike, Mortal Blow, and Mighty Strikedown source integration
13I Relentless and Unstoppable self-recovery actions
13J Stay With Me and Get It Together ally-support actions
13K simplified CURSE, Exorcist-seeking, liao, and cure/death lifecycle
13L EXECUTE timed casualty action
13M MASS cone delivery and dense-target performance
13N tactical use behaviour, integration, replay, performance, and consolidation
```

Behaviour direction:

- finite calls are chosen tactically rather than spammed
- call-use policy considers remaining resources, contact likelihood, visible broad armour, target role, local follow-up, current order, and risk
- fighters act on perceived capability rather than hidden omniscient state
- manual users normally avoid visibly ineffective armour targets
- recruits and veterans respond differently to persistent conditions
- hard effects feed cohesion, pressure, confidence, routing, command, casualty, treatment, and repair behaviour through explicit records
- hero points are one shared budget across offensive calls, self-recovery, survival, and ally rescue
- cursed characters use a dedicated non-combat behaviour state rather than morale routing
- exorcists and cursed characters act on perceived/known positions rather than omniscient support-role locations

Resolved interaction rules:

```txt
ENTANGLE suppresses REPEL translation while active
PARALYSE suppresses REPEL translation while active
effect timers continue concurrently
```

Remaining explicit decisions:

```txt
PARALYSE + STRIKEDOWN
multiple REPEL sources
VENOM cured during an active death count
EXECUTE interruption details
```

Testing requirements:

- separate ordinary-hit and special-effect assertions
- complete block/parry/shield/item contact matrix
- broad armour class protection for all coarse impact categories
- deterministic body/arm/leg selection
- arm attack disable, leg immobility, and zero-hit transition
- transient calls do not trigger ordinary healer-seeking
- recruit/veteran VENOM and WEAKNESS policies
- effect precedence independent of system insertion order
- casualty drag eligibility from PARALYSE and leg injury
- SHATTER backup-item, citizen repair, and barbarian repair scenarios
- finite repair resources and interruption/restart
- active/passive ability filtering under WEAKNESS
- hero-point maximum/current derivation and shared spending across skills
- offensive heroic points spend only on accepted effects
- Relentless and Unstoppable timing, interruption, and zero-hit eligibility
- Stay With Me versus zero-hit targets and Get It Together versus living low-hit targets
- simplified CURSE abandons combat/formation and seeks only perceived friendly Exorcists
- CURSE fatal timer and successful ten-second Exorcism using one liao
- interrupted Exorcism restarts without a false cure
- hidden duplicate VENOM/WEAKNESS resource spending
- EXECUTE eligibility and completion
- MASS geometry and performance
- monstrous immunity
- replay determinism
- one-hour soak coverage

Vocabulary correction:

The existing `SpecialCallCapability` list is an early inactive affordance vocabulary, not a production type to extend. `heal`, `restore`, and `fixWeapon` remain broader treatment/restoration/repair effects, not calls.

Boundary:

Do not implement every spell, priest ceremony, magic item, potion, enchantment, ritual, or monster source in one milestone. Implement the official call semantics, the listed relevant heroic skills, and the simplified CURSE/Exorcism loop in narrow, testable groups. Safety calls remain out of scope.

---

## Milestone 14: Ammunition and Recoverable Battlefield Projectiles

Status: future.

Purpose:

Model the real Empire requirement to count, fire, drop, see, and recover physical ranged projectiles and thrown weapons using a mechanically unified bow/crossbow model.

Dependencies:

- perception and visible ground-object queries
- individual unified-ranged and thrown-weapon loadouts
- carried ammunition capacities
- terrain and local hostile-safety assessment
- ranged attack opportunity and defence support
- automatic-projectile delivery and IMPALE effect support from Milestone 13

Expected direction:

- archers begin with a scenario/loadout-defined arrow count up to the Empire battle limit
- carried ranged projectiles are explicit finite inventory; arrow/bolt appearance is optional content only
- the unified ranged weapon requires both hands to shoot
- do not add crossbow-specific loading rules in the initial model
- firing removes ammunition from carried inventory
- every fired ranged projectile becomes a neutral physical ground object near its resolved landing point
- every landed ranged projectile applies IMPALE automatically without a shouted call
- weapons cannot parry arrows or bolts
- eligible shields can intercept projectiles through active coverage
- ranged projectiles have no faction ownership once on the ground
- any eligible archer may collect any reachable compatible projectile
- collection transfers the projectile from the ground into carried inventory
- arrow-seeking priority depends on current ammunition, distance, visibility, local hostile threat, current orders, and separation from the unit
- the fewer arrows an archer carries, the farther they are willing to search
- an archer with zero arrows may travel a substantial distance toward a visible safe arrow because they cannot perform their ranged role without ammunition
- archers with ammunition normally prefer their current combat role over unnecessary scavenging
- multiple archers competing for one projectile resolve deterministically
- projectile queries remain local and avoid global all-projectile scans

Thrown weapons:

- thrown weapons become neutral recoverable ground objects after use
- thrown-weapon users normally retain a melee weapon and remain combat-capable
- users opportunistically recover nearby safe weapons
- they do not normally abandon their unit or objective for long-range searches
- the same physical-object system supports arrows, bolts, and thrown weapons while allowing different compatibility and retrieval policies

Boundary:

Do not build detailed ballistic physics. The simulation needs deterministic firing, hit/miss resolution, landing, visibility, pickup, inventory, and behaviour—not a projectile-flight game.

---

## Milestone 15: Renderer, Replay, and Debug Tools

Status: future.

Purpose:

Build richer visual inspection once there is enough meaningful state to inspect.

Expected direction:

- useful replay/debug views
- entity profile, target, guard, recovery, hit, and defence overlays
- unit pressure/cohesion/routing display
- energy and rest display
- casualty, dying, treatment, carrying, egress, and respawn display
- equipment, broken-item, ruined-limb, effect-duration, ammunition, and ground-projectile display
- combat/effect logs
- scenario playback
- after-action summaries

Boundary:

Do not mistake visuals for validation. Headless deterministic tests remain the source of truth.

---

## Milestone 16: Performance and Scale Hardening

Status: future, unless earlier pain forces it.

Purpose:

Make large battle simulation robust after individual combat and casualty systems exist.

Expected direction:

- individual engagement and defence query optimisation
- sparse attacker-target one-second relationship storage
- spatial grid reuse
- hot-path memory reuse
- stable 2000-entity target checks
- profiling and regression detection
- fewer broad scans where possible
- bounded body, treatment, carrying, effect-area, ground-object, and casualty-egress queries
- realistic one-hour scenario soak tests
- representative mixed units rather than only one-member-unit stress cases

Boundary:

Optimise against realistic target scenarios, not abstract anxiety.

---

## Milestone 17: Content Authoring and Scenario Schema

Status: future.

Purpose:

Make battles authorable and repeatable without editing code.

Expected direction:

- JSON/data-driven scenario files
- army definitions
- unit archetypes and mixed-member composition templates
- faction templates
- individual combat-skill, armour, helmet, fitness, confidence, and energy distributions
- casualty, Fortitude, treatment, and respawn timings
- Sentinel Gate and respawn-point definitions
- objective definitions
- equipment, canonical skill IDs, trusted runtime skill profiles, hero-point, mana, herb, liao, Artisan's Oil, and starting-ammunition definitions
- optional authored character-build references without yet requiring all scenarios to use them
- terrain and safety-zone definitions
- deterministic scenario/ref events such as traumatic wounds or curses
- replay exports
- after-action summaries

Validation requirements:

- reject impossible weapon/skill combinations when validation is requested
- permit explicitly trusted generated profiles before Milestone 18, but mark them as bypassing XP-build validation
- reject invalid shield, grip, hand-use, or armour-profile combinations
- preserve explicit seeds for all generated individual profiles
- expose generated distributions in after-action/debug data


---

## Milestone 18: Character Creation, XP Validation, Rosters, and Unit Deployment

Status: future.

Purpose:

Allow users to create named individual characters, assign an XP budget, purchase legal skills, equip them, and deploy them as members of a specific unit on the citizen or barbarian team.

This is deliberately late. The runtime simulation should first know what skills and resources do. The authoring milestone then proves that a named character could legally possess the chosen combination.

Expected direction:

- stable character ID and user-facing name
- team selection: `citizen` or `barbarian`
- unit assignment
- explicit XP budget, defaulting to 8 for a normal starting character
- skill purchases with ranks
- unspent XP display
- prerequisite validation
- increasing and flat repeat-cost validation
- equipment permission validation
- role validation for physick, exorcist, artisan, mage, battle mage, archer, shield user, dual wielder, and heroic profiles
- derived maximum hits, hero points, mana, death counts, spell slots, and support inventories
- scenario-configurable herbs, liao, Artisan's Oil, ammunition, equipment, energy, experience, confidence, and behaviour profile
- deterministic roster import/export
- deployment of authored characters into a selected scenario/unit/team
- example builds and reusable templates

Explicit exclusions:

```txt
nation
lineage
Imperial Orc character rules
personal resource economics
background approval
bands as character-creation legality
```

The simulation continues to use only citizens and barbarians until explicitly expanded.

Suggested headless model:

```txt
CharacterBuildDraft
SkillPurchase
CharacterBuildValidation
DerivedCharacterRuntimeProfile
RosterDefinition
RosterDeployment
```

Suggested slices:

```txt
18A reuse canonical skill catalogue and XP-cost evaluator
18B character draft, name, team, unit, and stable ID
18C purchase, prerequisite, and repeat-cost validation
18D equipment and role legality validation
18E derived hits, hero points, mana, death counts, and support inventories
18F roster templates, JSON import/export, and deterministic deployment
18G simple authoring UI and actionable validation feedback
18H example builds, regression tests, replay metadata, and consolidation
```

Important rules:

- the headless validator is authoritative; UI validation is only a presentation of it
- scenario authors may choose arbitrary XP budgets for veterans or special combatants
- a build may leave XP unspent
- an invalid build cannot be deployed as an authored character
- legacy/generated trusted profiles remain importable but are explicitly marked as bypassing XP validation
- names need only be unique within the authored roster/scenario unless a later persistence system requires more

Testing requirements:

- all official relevant costs and prerequisites
- increasing repeat costs
- flat Extra Spell repeat cost
- invalid Physick, Exorcism, heroic, Mortal Blow, and Mighty Strikedown purchases
- equipment legality matrix
- deterministic derived resources
- deterministic roster serialization and deployment
- citizen/barbarian and unit assignment
- backward compatibility for trusted generated profiles

Boundary:

Do not turn this into a campaign account simulator. It authors battle participants, not the entire Empire character website.

---

## Official Rules Review Index

Reviewed source extracts that inform this roadmap:

- `official-rules-combat-simulation-extraction.md` — individual hits, defence, dying, treatment, and physical combat procedure
- `official-rules-calls-simulation-extraction.md` — call delivery, effects, finite resources, MASS geometry, and call-specific dependencies
- `official-rules-weapons-and-armour-simulation-extraction.md` — simplified weapon categories, armour hits/protection, shields, and equipment permissions
- `official-rules-calls-treatment-and-repair-behaviour-supplement.md` — medical urgency, casualty dragging, healer handoff, and SHATTER repair behaviour
- `official-rules-skills-character-xp-and-banners-simulation-extraction.md` — relevant skills, prerequisites, XP, hero/mana pools, support consumables, simplified CURSE/Exorcism, banners, and the later character builder

Further official pages should be extracted separately and then assigned to existing milestones or used to justify targeted new plans.
