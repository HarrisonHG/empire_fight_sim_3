# Empire Fight Sim Milestone Roadmap

Status: working roadmap. Updated through the official Combat and Calls rules reviews on 2026-07-11.

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
- Official rules extraction should continue page by page. Each extracted rule should be assigned to a milestone, marked as core, behavioural, dependent, scenario/ref-driven, or out of current scope, and linked from the relevant plan.

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

Replace the accepted unit-level combat prototype with individual fighter combat state that follows the official Empire hit, equipment, defence, and attack-cadence rules.

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

Official maximum-hit derivation:

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

Important corrections to the prototype:

- Dreadnought is a conditional skill, not an armour class.
- Armour increases global hits; it does not reduce ordinary landed-blow damage.
- Shields prevent blows through active defence; they do not reduce landed-blow damage.
- Medium and heavy armour's protection from heroic effects is locational and remains after armour-granted hits are lost. That protection belongs to the later calls/effects milestone.

Suggested slices:

```txt
5A individual combat profiles and validation
5B individual engagement and target selection
5C attack commitment, recovery, guard, parry, and shield defence
5D official global-hit derivation and one-hit ordinary strikes
5E per-attacker/per-target one-second damage gate
5F integration, unit aggregation, migration, performance, and visual replay
```

Suggested individual data:

- weapon category, physical reach, permitted attack modes, and hand requirement
- shield type and held/slung/broken state
- armour type, helmet qualification, and later coverage mask
- Weapon Master, Shield, Marksman, Thrown, Ambidexterity, Endurance, Fortitude, Dreadnought, and magical-combat capability hooks
- current target, attack commitment, recovery, guard readiness, facing, and occupied hands
- current and derived maximum global hits

Performance rule:

Do not introduce a dense attacker-by-target matrix. The one-second relationship gate must retain only active local attacker-target relationships and expire them deterministically.

Boundary:

- no dying timer, terminal state, execution, casualty carrying, or treatment yet beyond the zero-hit transition record
- no full body-location injury model
- no complete heroic or magic calls
- no ballistic projectile flight or recoverable projectile objects
- no random block percentage
- no replacement of unit-level orders, cohesion, morale, or formation ownership

---

## Milestone 6: Casualties, Dying, Battlefield Treatment, and Player-Presence State

Status: future.

Purpose:

Consume individual zero-hit transitions, implement the battlefield dying procedure, and distinguish fictional character state from the real player’s continued physical presence.

Expected direction:

- reaching zero global hits immediately changes the entity from active to dying and unresisting
- dying characters may perceive, talk, or scream but cannot attack, defend, move tactically, use ordinary skills, use ordinary items, provide combat support, block movement as an active fighter, spread positive morale, or contest objectives
- the down position remains within at most two safety steps of the final strike and cannot be used for tactical retreat
- normal Empire dying time is 180 seconds before terminal state
- Fortitude increases the death count according to the official progression
- faction- or scenario-specific procedures may override the normal count, including the shorter barbarian battlefield return procedure
- regaining at least one global hit ends dying state unless the character is terminal
- Chirurgeon treatment requires thirty uninterrupted seconds, pauses the death count while active, restores one hit on completion, and fails if healer or patient attacks or is hit
- execution requires a dying or consenting target and a five-second committed action before the fatal result
- moving an unresisting casualty requires one carrier with both hands free or two carriers with one hand free each
- carrying a casualty consumes hand availability, breaks ordinary formation participation, slows movement, and later consumes additional energy
- terminal character state and player-presence state remain separate
- terminal Empire player entities may perform non-interactive battlefield egress without making the character combat-active
- barbarian player entities may move toward respawn staging under scenario rules
- casualty, treatment, execution, carrying, and after-action records remain inspectable after removal

Suggested lifecycle vocabulary:

```txt
Character:
active
→ dying
→ terminal
→ dead

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
6A zero-hit transition, unresisting state, and interaction filtering
6B death counts, Fortitude, terminal state, and deterministic timers
6C Chirurgeon treatment, pause/resume, interruption, and one-hit recovery
6D execution and fatal-result records
6E casualty carrying, hand occupancy, cooperative movement, and release
6F generic Empire egress and barbarian respawn-staging hooks
6G integration, morale consequences, replay, and performance coverage
```

Important rules:

- Chirurgeon is core battlefield medicine because it directly changes death-count outcomes.
- Full Physick treatment, herbs, traumatic wounds, and long-rest treatment are later systems.
- A terminal character cannot be saved even if the associated player-presence entity is still moving.
- Dying and carried entities do not count as ordinary collision blockers if doing so would create absurd corpse walls; any residual physical obstruction must be narrow, explicit, and safety-oriented.

Dependency boundary:

This milestone owns casualty state, timers, interaction filtering, Chirurgeon intervention, execution, generic carrying, generic egress behaviour, and respawn-staging hooks.

Milestone 9 owns concrete Sentinel Gate geometry, barbarian respawn locations, reinforcement batching, scenario clocks, re-entry, and battle-end withdrawal.

Deferred:

- Physick treatment of ruined limbs and traumatic wounds
- herb and potion inventories
- resurrection, healing magic, and restoration effects
- detailed corpse geometry
- searching and capturing except as future scenario interactions
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

## Milestone 11: Roles, Individual Loadouts, Equipment, Skills, and Content Expansion

Status: future.

Purpose:

Expand individual fighter archetypes, unit compositions, battlefield roles, equipment, skills, finite resources, and mechanically relevant capability data.

Expected direction:

- mixed individual loadouts inside one unit
- daggers and ordinary one-handed weapons
- great weapons
- polearms
- pikes
- one-handed spears
- shields and bucklers
- bows and crossbows
- thrown weapons
- dual wielders
- wands, rods, and staves
- banners
- chirurgeons and physicks
- mages and battle mages
- Endurance, Fortitude, Dreadnought, Weapon Master, Shield, Marksman, Thrown, and Ambidexterity profile data
- armour, helmet, hand-use, grip, thrust-only, and locational coverage metadata
- skirmishers
- heavy lines
- routing mobs
- ranged ammunition capacities
- recoverable-projectile capability tags
- individual hero-point, mana, herb, potion, daily-use, and prepared-effect resource pools
- active ability versus passive always-on classification
- creature category and explicit call-effect immunity data
- individual call-source affordances without yet activating all call effects

Call-source correction:

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
resource pool and cost
compatible equipment
use/consumption policy
active versus always-on ability classification
```

The complete official call effect vocabulary is:

```txt
CLEAVE
IMPALE
STRIKEDOWN
EXECUTE
CURSE
ENTANGLE
PARALYSE
REPEL
SHATTER
VENOM
WEAKNESS
```

`heal`, `restore`, and `fixWeapon` are not official calls. Keep them as general ability/effect hooks such as healing, limb restoration, and item repair.

Important placement rule:

Milestone 5 establishes the minimal individual combat profile required for correct ordinary combat. This milestone expands that profile into richer mixed units and content. It must not reintroduce unit-level equipment as the authority for every member.

This milestone defines bows, thrown weapons, carried ammunition limits, and relevant capability data. It does not yet create arrows or thrown weapons as recoverable battlefield objects. Those mechanics belong to Milestone 14.

This milestone may define that an individual owns a source capable of producing a call, but it must not implement call application, hard-control behaviour, body damage, equipment breakage, or MASS queries. Those mechanics belong to Milestone 13.

Boundary:

Prefer data and taxonomy over hard-coded bespoke logic. Do not implement every official spell, heroic skill, magic item, potion, monster ability, or ritual source in this milestone. Establish source-compatible data that later content can populate.

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

Dependency note:

Recoverable projectile retrieval uses terrain and local threat information when deciding whether an arrow is safely reachable. Hard-effect movement also needs obstacle and safety handling.

Boundary:

Avoid full A* until necessary. Start with simple deterministic constraints and local steering.

---

## Milestone 13: Calls, Hard Effects, Body State, and Limited Resources

Status: future.

Purpose:

Implement the official combat-call effect framework after individual hits, casualty state, expanded equipment/resources, perception, movement, and terrain exist.

Rationale:

Calls are not generic damage modifiers or videogame cooldown powers. They can:

- zero global hits
- ruin limbs
- force item drops
- knock a target down
- prevent foot movement
- prevent nearly every voluntary action
- force movement away from a source
- break equipment
- shorten a future or active death count
- suppress active heroic, magical, and religious abilities
- begin an execution action
- apply scenario/ref-defined persistent state
- affect everyone in an area without inflicting an ordinary hit

Every ordinary strike-delivered call also carries the ordinary one-global-hit result when the blow actually lands on the character. A weapon or shield contact may prevent that hit while still allowing `ENTANGLE`, `REPEL`, `STRIKEDOWN`, or item-targeted `SHATTER` to apply. MASS calls are ranged area effects and do not cause ordinary hit loss.

Safety calls are excluded from this milestone and from autonomous simulation vocabulary.

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
```

A call may come from a heroic skill, spell, magic item, prepared coating, monster ability, or scenario source. The call definition must not assume one resource type.

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
→ event emission
```

Expected common rules:

- one call at most per blow
- the per-attacker/per-target one-second rule still applies to the accompanying ordinary hit
- attempted, missed, blocked, parried, item-contact, visibly ineffective, accepted-without-change, applied, cured, and expired records
- ordinary-hit and call-effect outcomes remain separate
- no general resistance roll; confidence, experience, morale, and armour score do not negate an applicable call
- resource consumption follows the source's rules and caller-observable acceptance rather than merely checking whether target state mutated
- hidden `VENOM` and `WEAKNESS` conditions are assumed to have been taken after a valid unblocked delivery, even if the target was already affected
- explicit monstrous-creature call-effect immunity without inventing general damage immunity
- stable deterministic ordering for every multi-target result
- no per-tick allocation-heavy generic status-object churn in hot paths

Defence/contact matrix:

- `CLEAVE`, `IMPALE`, `CURSE`, `PARALYSE`, `VENOM`, and `WEAKNESS` are prevented by a normal weapon parry or shield block
- `ENTANGLE`, `REPEL`, and `STRIKEDOWN` affect the character through weapon parry or shield block, but no ordinary hit is lost on the blocked/parried contact
- `SHATTER` affects the eligible weapon, implement, or shield that was struck
- medium or heavy armour physically struck by `CLEAVE` reduces it to an ordinary one-hit result
- only heavy armour physically struck by `IMPALE` reduces it to an ordinary one-hit result
- arrows and bolts automatically deliver `IMPALE` and cannot be weapon-parried

Required target state:

- legal body contact location and actual armour coverage
- left/right arm usability
- left/right leg usability
- held item by hand and forced dropping
- standing, forced-fall, grounded, getting-up, and immobile states
- forced movement source, travelled distance, duration, and obstacle-pinned state
- ready/broken/dropped/slung equipment state
- venom, weakness, paralysis, entangle, curse, and other effect markers
- active ability versus passive always-on permission
- Fortitude-aware death-count state
- hero-point, mana, per-day, prepared-use, and source-specific finite resources

Official effect direction:

### CLEAVE and IMPALE

- torso contact reduces the target to zero global hits
- limb contact ruins the limb
- ruined arm drops and disables held equipment
- ruined leg prevents translational movement
- intentional head/neck targeting is prohibited; the initial autonomous model should use legal torso/limb targets only
- locational armour protection depends on the actual struck coverage, not the character's broad armour class
- melee and automatic projectile `IMPALE` share the effect resolver but not delivery rules

### STRIKEDOWN

- force a safe fall within at most two non-tactical steps
- cancel current attack, movement, and active defence
- require backside or torso to reach the ground before another action
- model an explicit deterministic get-up action rather than instant recovery
- physical get-up time may later depend on energy, equipment, crowding, and mobility profile

### ENTANGLE

- lock foot translation for ten seconds
- permit facing, upper-body combat, blocking, parrying, speech, item use, and otherwise legal actions
- allow cure/removal hooks

### PARALYSE

- lock voluntary actions and movement for ten seconds
- permit speech and an externally fed potion
- preserve passive always-on effects
- leave the target vulnerable to attack
- allow cure/removal hooks

### REPEL

- force movement away from the source at brisk-walk speed or faster
- end after ten seconds or more than 6 metres of retreat
- override orders, normal movement, and morale movement while active
- if an immovable obstacle prevents movement, pin the target and permit speech only
- allow the target to hold a nearby solid immovable object, creating the same pinned/no-action state
- allies cannot act as anchors and should attempt to give way

### SHATTER

- break the struck weapon, implement, or shield
- broken equipment is unusable until repaired
- a retained shattered shield provides no defence; later blows striking it count as arm hits
- support generic repair hooks such as mend or artisan's oil without inventing a `FIXWEAPON` call

### VENOM

- persist until cured
- do not remove hits directly
- use the Fortitude-dependent venom death count when the target reaches zero hits
- applying venom while dying clamps remaining time downward but never increases a shorter count
- preserve hidden-condition resource-spending behaviour
- resolve the exact timer recalculation after cure as an explicit ruling before implementation

### WEAKNESS

- suppress calls, heroic skills, religious skills, spells, rituals, and other active abilities
- include `EXECUTE` in suppressed calls
- preserve always-on skills, equipment permissions, additional hits, and passive modifiers
- permit ordinary movement, fighting, blocking, and weapon use
- persist until cured

### EXECUTE

- require a dying or terminal target unless consent is scripted
- require a five-second committed fatal action
- complete as immediate character death while preserving player-presence procedure
- define interruption conditions explicitly as a project timed-action rule

### CURSE

- add a persistent curse marker and event
- permit an optional scenario/ref-authored payload
- do not invent random generic curse effects

### MASS

- pair MASS with a content-defined call effect
- query a ninety-degree cone up to 6 metres in front of the source
- affect every eligible character in the area, including allies unless a specific source says otherwise
- do not inflict an ordinary global hit
- do not apply a shield-block result because there is no strike
- do not invent line-of-sight, cover, or obstacle occlusion without an official or scenario-specific rule
- use stable deterministic target ordering and spatial queries

Known recovery hooks:

- `Purify` removes `VENOM` and `WEAKNESS`
- swift-cast `Purify` also removes `ENTANGLE` and `PARALYSE`
- `Relentless` can restore a ruined limb through a timed heroic action
- broken equipment can be repaired by effects such as mend and artisan's oil

These are generic effect-removal and repair hooks. Do not hard-code each cure into the call that created the state.

Suggested slices:

```txt
13A call vocabulary, source data, finite-resource interfaces, and migration
13B common delivery/contact/effect/resource resolution pipeline
13C ENTANGLE and PARALYSE timed action restrictions
13D REPEL and STRIKEDOWN forced movement, falling, and terrain interaction
13E CLEAVE and IMPALE locational body/armour consequences
13F SHATTER and equipment-condition state
13G VENOM, WEAKNESS, Fortitude, and cure hooks
13H EXECUTE timed casualty action
13I MASS cone delivery and dense-target performance
13J CURSE, tactical use behaviour, integration, replay, and consolidation
```

Behaviour direction:

- finite calls are chosen tactically rather than spammed whenever cooldown permits
- call-use policy considers remaining resources, likelihood of valid contact, target role/equipment, local follow-up, current order, risk, and unit doctrine
- fighters act on perceived target capability rather than hidden omniscient state
- calls that create an opening should only produce full tactical value when allies can exploit it
- hard effects feed unit cohesion, pressure, confidence, routing, command, and casualty behaviour through explicit consequence records

Required unresolved interaction matrix:

Before the relevant slice is implemented, explicitly decide how simultaneous contradictory effects combine, including:

```txt
ENTANGLE + REPEL
PARALYSE + REPEL
PARALYSE + STRIKEDOWN
multiple REPEL sources
VENOM cured during an active death count
```

Do not silently use insertion order or whichever system runs last.

Testing requirements:

- separate ordinary-hit and special-effect assertions
- complete block/parry/shield/item contact matrix
- locational armour coverage for CLEAVE and IMPALE
- limb loss, item drop, leg immobility, and zero-hit transition
- deterministic timed expiry and cure
- forced movement distance, duration, and obstacle pinning
- active/passive ability filtering under WEAKNESS
- hidden duplicate VENOM/WEAKNESS resource spending
- EXECUTE eligibility and completion
- MASS geometry, faction-blind targeting, stable ordering, and no ordinary hit
- monstrous immunity
- replay determinism
- dense 100/500/1000/2000-target performance cases
- one-hour finite-resource and persistent-effect soak coverage

Vocabulary correction:

The existing `SpecialCallCapability` list is an early inactive affordance vocabulary, not a production type to extend. Replace it rather than adding more strings to it indefinitely. `heal`, `restore`, and `fixWeapon` remain broader healing/restoration/repair effects, not calls.

Boundary:

Do not implement every healing spell, heroic skill, religious skill, magic item, potion, enchantment, ritual, or monster source in one milestone. Implement the official call semantics and generic source/effect hooks in narrow, testable groups. Safety calls remain out of scope.

---

## Milestone 14: Ammunition and Recoverable Battlefield Projectiles

Status: future.

Purpose:

Model the real Empire requirement to count, fire, drop, see, and recover physical arrows, bolts, and thrown weapons.

Dependencies:

- perception and visible ground-object queries
- individual bow, crossbow, and thrown-weapon loadouts
- carried ammunition capacities
- terrain and local hostile-safety assessment
- ranged attack opportunity and defence support
- automatic-projectile delivery and IMPALE effect support from Milestone 13

Expected direction:

- archers begin with a scenario/loadout-defined arrow count up to the Empire battle limit
- carried arrows and bolts are explicit finite inventory
- bows and crossbows require both hands to shoot
- crossbows load and fire one bolt at a time
- firing removes ammunition from carried inventory
- every fired arrow or bolt becomes a neutral physical ground object near its resolved landing point
- every landed arrow or bolt applies IMPALE automatically without a shouted call
- weapons cannot parry arrows or bolts
- eligible shields can intercept projectiles through active coverage
- arrows have no faction ownership once on the ground
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
- equipment, hero-point, mana, herb, potion, and starting-ammunition definitions
- terrain and safety-zone definitions
- deterministic scenario/ref events such as traumatic wounds or curses
- replay exports
- after-action summaries

Validation requirements:

- reject impossible weapon/skill combinations
- reject invalid shield, grip, hand-use, or armour-profile combinations
- preserve explicit seeds for all generated individual profiles
- expose generated distributions in after-action/debug data

---

---

## Official Rules Review Index

Reviewed source extracts that inform this roadmap:

- `official-rules-combat-simulation-extraction.md` — individual hits, defence, armour, dying, treatment, and physical combat procedure
- `official-rules-calls-simulation-extraction.md` — call delivery, effects, body/item state, finite resources, MASS geometry, and call-specific dependencies

Further official pages should be extracted separately and then assigned to existing milestones or used to justify targeted new plans.
