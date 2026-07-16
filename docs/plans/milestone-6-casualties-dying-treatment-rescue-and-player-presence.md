# Milestone 6: Casualties, Dying, Battlefield Treatment, Rescue, and Player-Presence State

Status: accepted for implementation.

Milestone 5, including its defence-readiness and pressure/visual-regression spike, was accepted on 2026-07-15. Milestone 6 may now begin.

Before the first implementation slice, update the stale root `AGENTS.md` Current Project Phase section so it names Milestone 6 and no longer describes the project as a Milestone 3 visual spike. Do not weaken any architecture, determinism, testing, or scope rules.

## Product goal

Milestone 6 turns zero global hits from a combat statistic into a believable Empire battlefield casualty procedure.

After Milestone 6:

- an individual reduced to zero hits immediately becomes dying and unresisting;
- the individual stops attacking, defending, following formation movement, supporting combat, and contesting future objectives;
- normal and scenario-specific death counts advance deterministically;
- Fortitude derives the normal Empire death-count duration;
- valid Chirurgeon treatment pauses the count and restores one hit after thirty uninterrupted seconds;
- nearby allies may request rescue, form a drag group, move a casualty toward local safety, and hand them to a Physick;
- Physicks claim patients, triage local needs, and complete one treatment action at a time;
- execution is a committed five-second action rather than an instant state change;
- terminal character state is kept separate from the physical player-presence entity that may later get up and leave;
- citizen egress and barbarian respawn-staging hooks exist without prematurely implementing the Sentinel Gate, reinforcement waves, or scenario clock;
- casualty history remains inspectable even after the player-presence entity leaves the battlefield.

The milestone must model both realities at once:

> The character is dying on the ground.

and later:

> The character is terminal, but the real player still has to stand up and walk somewhere without becoming a combatant again.

---

## Authoritative design inputs

This plan follows the current project roadmap and the reviewed combat, surgical-skill, and casualty-behaviour rulings.

Important inherited rules:

- ordinary zero-hit state begins dying immediately;
- normal Empire death count is three minutes;
- Fortitude extends the normal count;
- Chirurgeon treatment takes thirty uninterrupted seconds, pauses the count while valid, and restores one hit;
- execution takes five committed seconds;
- one Physick or two ordinary fighters may move an eligible casualty under the project behaviour ruling;
- treatment issues are resolved sequentially;
- interrupted herb treatment releases the reserved herb rather than consuming it;
- citizen traumatic wounds are non-stacking withdrawal conditions, not alternate death protection;
- any attack that causes a fresh zero-hit transition, or later causes a limb-cleave consequence, gives an eligible citizen a deterministic 10% traumatic-wound opportunity;
- barbarians never receive traumatic wounds;
- traumatic wounds do not cause death, pause dying, prevent execution, or override terminal state;
- terminal citizen characters remain terminal and still until a Physick completes a two-minute no-herb comfort action;
- terminal character state and player-presence procedure are separate;
- terrain, perception, concrete Gate geometry, respawn batching, calls, active limb-injury sources, VENOM, WEAKNESS, and energy remain later dependencies.

---

# Core design decisions

## Character lifecycle is not player presence

Use a small authoritative character lifecycle:

```ts
type CharacterLifecycleState =
  | "active"
  | "dying"
  | "terminal";
```

Do not add a separate runtime `dead` state in the first implementation.

For simulation rules, `terminal` means:

- the current battlefield life cannot be saved or restored by ordinary treatment;
- the character cannot act;
- the associated player presence is non-combatant;
- no ordinary system may reactivate the character.

For citizens, terminal state is permanent for the remainder of the battle. For barbarians, a later Milestone 9 respawn procedure may explicitly begin a new active battlefield life from `waitingAtRespawn`; that future scenario-owned reset is not healing and is not implemented in Milestone 6.

“Dead” may appear as an after-action label or terminal cause, but it does not need a second mechanically identical hot-path state.

Track the physical player-presence procedure separately:

```ts
type PlayerPresenceState =
  | "activePresence"
  | "downedPresence"
  | "terminalAwaitingComfort"
  | "terminalComforted"
  | "respawnEgress"
  | "waitingAtRespawn"
  | "removedFromBattlefield";
```

The same entity ID may continue to own a physical position while its character is terminal. Combat, morale, targeting, support, and objective systems must consult character/presence eligibility rather than assuming that a position or later moving player presence is an active character.

For citizens:

```text
dying expiry or execution
→ character terminal
→ player presence terminalAwaitingComfort
```

The citizen remains still indefinitely during Milestone 6. A completed Physick comfort action changes only the player-presence procedure:

```text
terminalAwaitingComfort
→ terminalComforted
```

`terminalComforted` means the player may later begin the slow Sentinel Gate egress owned by Milestone 9. It does not restore, revive, or otherwise alter the terminal character.

Barbarian player-presence procedure remains separately scenario-configurable and may progress toward respawn staging. Barbarians do not use citizen comfort state.


## Trusted casualty-procedure profiles

Current production scenarios identify factions, but faction ID must not be used to guess whether an entity follows citizen or barbarian casualty procedure.

Add immutable trusted runtime content:

```ts
type CasualtyProcedureKind =
  | "citizen"
  | "barbarian";

interface IndividualCasualtyProcedureProfile {
  entityId: number;
  procedureKind: CasualtyProcedureKind;
  deathCountPolicy: DeathCountPolicy;
}
```

The profile is scenario content, not XP validation and not national identity.

Rules:

- ordinary live-combat scenario shorthand may assign one profile template per unit and expand it deterministically to members;
- individual profiles remain the runtime authority;
- citizen profiles are traumatic-wound eligible and use terminal comfort;
- barbarian profiles are traumatic-wound ineligible and use respawn-staging procedure;
- do not infer procedure kind from faction number, colour, unit label, equipment, or behaviour profile;
- Milestone 9 and Milestone 17 may later derive these trusted profiles from richer scenario/team/nation content.

## Assistance is a separate state machine

```ts
type CasualtyAssistanceState =
  | "none"
  | "rescueRequested"
  | "beingDragged"
  | "atTreatmentPosition"
  | "handedToPhysick"
  | "underTreatment"
  | "released";
```

Character lifecycle answers what is mechanically wrong.

Assistance state answers what allies are currently doing about it.

Do not collapse these into a single giant casualty enum.

## Zero hits remains the source of ordinary dying

Milestone 5 global hits remain authoritative.

A canonical zero-hit transition record causes:

```text
active → dying
activePresence → downedPresence
```

The transition occurs during the same simulation tick after global-hit application.

Later same-tick combat records may still exist because Milestone 5 uses a stable tick-start eligibility snapshot. No further post-combat system may treat the newly dying individual as an active fighter.

A hit against an already-zero entity:

- does not restart the death count;
- does not emit another dying transition;
- may still count as a landed hit for treatment interruption where relevant.

## Traumatic wounds

Traumatic wounds are a separate non-stacking citizen condition.

```ts
type TraumaticWoundState =
  | "none"
  | "active";
```

A traumatic wound:

- does not remove hits;
- does not create or pause a death count;
- does not protect against reaching zero hits;
- does not prevent dying, execution, or terminal state;
- does not stack;
- may occur again after the previous wound has been treated;
- has no behavioural effect while the character is dying or terminal;
- becomes behaviourally active whenever the character is active and independently mobile.

Trigger opportunities occur only when an attack produces one of:

```text
fresh zero-hit transition
limb-cleave consequence
```

Any attack may be the attack that produces one of those consequences, but ordinary non-zero, non-cleaving hits do not roll separately.

Only citizen characters are eligible. Barbarian characters never receive traumatic wounds and should not consume a deterministic roll.

Use a stable keyed deterministic 10% test rather than consuming a shared random stream. The key should include enough canonical event identity to remain replay- and processing-order-independent, for example:

```text
battle seed
target entity ID
attacker entity ID where available
trigger tick
trigger kind: zeroHit | limbCleave
```

A suitable integer rule is:

```text
keyed roll in [0, 999]
roll < 100 → traumatic wound
```

If a traumatic wound is already active, ignore later opportunities until it is treated.

The zero-hit trigger is implemented in Milestone 6. Milestone 13 must call the same resolver when a citizen receives a limb-cleave consequence.

When an active, mobile citizen has a traumatic wound:

- abandon ordinary combat;
- stop active defence and formation-slot following;
- do not contest objectives;
- seek a nearby known/visible friendly Physick with at least one available, unreserved herb;
- if none is currently available, move toward low-threat friendly/rear space and continue searching;
- avoid active fighting rather than moving through it;
- remain a valid hostile target and may still be reduced to zero normally.

A traumatic wound alone does not make the patient drag-eligible. Dying, paralysis, or limb immobility may do so independently.

If a citizen receives trauma while reaching zero:

- the normal dying transition still occurs;
- the death count proceeds normally;
- valid Chirurgeon treatment may restore one hit;
- once active again, the unresolved trauma immediately drives withdrawal until separately treated.

Completing trauma treatment clears the condition. The character then reacquires ordinary unit/order behaviour through existing reform/rejoin systems.

Track a bounded per-entity traumatic-wound episode count for future after-action reporting, but do not build an end-game statistics UI in Milestone 6.

## Dying interaction rules

A dying or terminal character:

- cannot select or retain ordinary combat targets;
- cannot begin or complete attacks;
- cannot actively defend;
- cannot follow a formation slot;
- cannot make tactical movement;
- cannot provide active combat support;
- cannot count as an active blocker;
- cannot contribute positive combat capability;
- cannot contest a future objective;
- cannot be selected as an ordinary melee target;
- may be selected by rescue, treatment, or explicit execution systems;
- remains spatially queryable as a casualty until player-presence egress begins.

Centralise these decisions through lifecycle/interaction query helpers. Do not scatter direct string comparisons through every system.

## Casualty bodies are not permanent walls

A downed casualty remains a physical position for:

- rescue queries;
- treatment range;
- dragging;
- execution;
- debug and after-action records.

It is excluded from ordinary formation blockers, hostile-contact blockers, same-unit overtaking, and combat targeting.

Detailed body collision and corpse geometry remain deferred. This milestone must not create piles of zero-hit entities that permanently freeze formation movement.

## Safe down-position policy

The official safety rule permits at most two non-tactical steps before falling.

Before terrain exists, the down position is exactly the current world position at the zero-hit transition. Record it without moving the entity.

Do not introduce a speculative two-step adjustment API in 6A. Milestone 12 may add a deterministic safe-position selector when terrain and unsafe-ground data actually exist.

Do not invent a free retreat on reaching zero hits.

## Death-count policies are explicit scenario data

Use a small policy model:

```ts
type DeathCountPolicy =
  | { kind: "normalFortitude" }
  | { kind: "fixedTicks"; durationTicks: number };
```

Defaults:

```text
citizen-style normal death count:
derive from Fortitude

barbarian test/default return procedure:
fixed 30 seconds when explicitly assigned
```

Do not infer a full citizen/barbarian nation model in Milestone 6. The trusted casualty-procedure profile explicitly assigns procedure kind and death-count policy. Milestone 9 and Milestone 17 may later derive those values from scenario/team/nation content.

## Fortitude normal-count derivation

At 20 ticks per second:

```text
normal minutes =
3 + triangular(Fortitude rank)

triangular(rank) =
rank × (rank + 1) / 2
```

Accepted examples:

```text
rank 0:  3 minutes
rank 1:  4 minutes
rank 2:  6 minutes
rank 3:  9 minutes
rank 4: 13 minutes
rank 5: 18 minutes
```

Store durations and remaining counts as validated integer ticks. Reject values that exceed the chosen integer storage rather than wrapping.

VENOM death counts remain Milestone 13 work.

## Death-count tick semantics

On entering dying:

- initialise the full derived duration;
- record `enteredDyingTick`;
- do not decrement on the transition tick.

On later ticks:

- valid active Chirurgeon treatment pauses the count immediately;
- an interruption resumes the count on that tick;
- treatment completion resolves before death-count advancement;
- reaching zero remaining ticks causes `dying → terminal` exactly once;
- regaining at least one global hit causes `dying → active` unless already terminal;
- every later fresh zero-hit transition starts a new full death count;
- already-zero landed records do not reset it.

## Minimal medical runtime data belongs here

Milestone 11 will later provide the canonical skill catalogue and expanded support resources. Milestone 6 still needs trusted runtime medical capability now.

Add a minimal per-entity medical profile:

```ts
interface TrustedMedicalProfile {
  hasChirurgeon: boolean;
  hasPhysick: boolean;
  startingGenericHerbs: number;
}
```

Validation:

- `hasPhysick` requires `hasChirurgeon`;
- default Physick profiles begin with 12 generic herbs;
- Chirurgeon-only profiles may have zero herbs;
- profiles are trusted scenario runtime data, not XP-validated character builds.

Add an individual generic-herb resource store:

```text
maximum herbs
current herbs
reserved herbs
```

Milestone 11 should adopt or migrate this runtime store rather than creating a competing source of truth.

## Treatment actions

Initial supported treatment needs:

```ts
type TreatmentNeedId =
  | "dyingZeroHits"
  | "restoreGlobalHit"
  | "traumaticWound"
  | "disabledArm"
  | "disabledLeg"
  | "terminalComfort";
```

`disabledArm` and `disabledLeg` are treatment hooks in Milestone 6. Their ordinary battlefield sources arrive with CLEAVE/IMPALE in Milestone 13.

Initial actions:

```text
Chirurgeon restore from zero:
30 seconds
no herb
citizen or barbarian
restores exactly 1 hit

Physick restore missing global hit:
30 seconds
reserves 1 generic herb
consumes it only on completion
citizen or barbarian
restores exactly 1 hit
cannot target self

Physick treat traumatic wound:
30 seconds
requires and consumes 1 generic herb on completion
citizen only
clears the traumatic-wound condition
cannot target self

Physick restore disabled arm or leg with herb:
30 seconds
requires and consumes 1 generic herb on completion
citizen or barbarian
clears exactly one selected limb disability
cannot target self

Physick restore disabled arm or leg without herb:
2 minutes
no herb
citizen or barbarian
clears exactly one selected limb disability
cannot target self

Physick make terminal citizen comfortable:
2 minutes
no herb
citizen only
does not restore hits or change terminal character state
changes terminalAwaitingComfort to terminalComforted
```

When a Physick has herbs, the 30-second herb-backed limb action is preferred over the two-minute no-herb action.

Traumatic wounds cannot be treated without a herb.

A Physick with no herbs may still:

- drag an eligible immobile patient;
- perform the Chirurgeon zero-hit treatment;
- perform a two-minute no-herb limb treatment;
- perform a two-minute terminal-comfort action on a citizen;
- hand a patient to another Physick who still has herbs.

Every treatment action:

- has one healer;
- has one patient;
- treats one issue;
- requires touch range;
- has explicit started/completes-at timing;
- loses all progress on interruption;
- emits transition-only records.

Interruption evidence:

- healer or patient makes a valid attack attempt;
- healer or patient receives a gate-accepted landed hit;
- either participant becomes unable to continue;
- either participant leaves treatment range;
- patient lifecycle becomes incompatible with the selected action;
- patient no longer has the selected need.

A parried or blocked attack does not count as being hit.

A landed hit against an already-zero patient still interrupts treatment if it passed the relationship gate.

## Patient continuity and triage

A Physick owns at most one current patient.

A patient is claimed by at most one Physick.

While an action is active, a newly arriving patient does not pre-empt it unless the current action becomes invalid.

After each completed or interrupted action, the Physick reassesses:

- current patient’s remaining treatable needs;
- nearby unclaimed patients;
- urgency;
- distance;
- local threat;
- patient continuity;
- deterministic entity-ID tie-breaks.

Initial triage priority is:

```text
1. dying at zero hits
2. disabled leg
3. disabled arm
4. traumatic wound
5. dangerously low living hits
6. ordinary missing-hit treatment
7. terminal citizen comfort
```

Terminal comfort is always the lowest-priority valid medical action. A terminal citizen may therefore wait indefinitely while living patients require attention.

A traumatic-wound patient is below immediate immobility and dying work, but above ordinary comfort/healing because they have withdrawn from battle until treated.

## Dragging and hand commitment

Eligible patients in Milestone 6:

```text
dying at zero hits
terminal citizen awaiting comfort
terminal barbarian awaiting its scenario-defined respawn procedure
```

Future call effects may add paralysed and leg-disabled patients.

Required helpers under the project behaviour ruling:

```text
one Physick
or
two ordinary active allies
```

A lone non-Physick does not begin a drag.

Hand commitment:

```text
one Physick:
2 hands committed

two ordinary helpers:
1 hand committed each
```

All drag helpers:

- suspend normal attacks;
- suspend formation-slot following;
- use reduced deterministic group movement;
- may defend only when their remaining uncommitted hands and currently available equipment permit it;
- are still valid ordinary hostile targets;
- may be hit and may cause the drag to fail.

Do not model left/right hands. Track only total hands required, committed, and available.

## Rescue destination

The first implementation chooses a bounded local extraction point. It does not use global pathfinding or omniscient support-role locations.

Candidate scoring may use:

- distance from local hostile threat;
- direction behind the casualty’s allied unit;
- recent local landed-hit/contact density;
- distance to a nearby available Physick;
- world bounds;
- maximum extraction distance;
- deterministic tie-breaking.

Without terrain or perception:

- use actual local positions as temporary perfect local awareness;
- do not query every Physick or hostile on the battlefield;
- use existing spatial-grid/local-query infrastructure;
- clearly document that Milestone 10 and Milestone 12 enrich the query inputs later.

A patient already in a sufficiently safe location near an available Physick may be treated in place.

## Execution is explicit, not default AI behaviour

Execution requires:

- an active eligible executor;
- a dying target, or a separately explicit consenting-target hook;
- valid range;
- a five-second committed action;
- stable target identity;
- no attack by the executor;
- no gate-accepted landed hit on executor or target;
- no forced separation;
- target remaining dying and non-terminal.

Completion causes immediate terminal state with cause `execution`.

Ordinary AI does not automatically execute every enemy casualty.

Execution intent must come from:

- an explicit scenario instruction;
- a future order/command policy;
- a future tactical behaviour explicitly approved for a faction or profile.

Milestone 6 implements the mechanic and records, not autonomous battlefield murder enthusiasm.

## Bounded casualty history

Keep per-tick transition outputs reusable and allocation-conscious.

Also retain one bounded per-entity lifecycle summary for after-action/debugging, for example:

```ts
interface IndividualCasualtyHistory {
  entityId: EntityId;
  firstZeroHitTick: number;
  latestZeroHitTick: number;
  dyingTransitionCount: number;
  treatmentStartedCount: number;
  treatmentCompletedCount: number;
  treatmentInterruptedCount: number;
  wasDragged: boolean;
  firstDragTick: number;
  handoffCount: number;
  traumaticWoundEpisodeCount: number;
  latestTraumaticWoundTick: number;
  traumaticWoundTreatmentCount: number;
  terminalTick: number;
  terminalCause: "none" | "deathCountExpired" | "execution";
  comfortStartedCount: number;
  comfortCompletedTick: number;
  respawnEgressStartedTick: number;
  battlefieldExitTick: number;
  terminalX: number;
  terminalY: number;
}
```

Do not create an unbounded append-only object log for every tick of a one-hour battle.

---

# State ownership

## IndividualGlobalHitStore

Continues to own:

- maximum hits;
- current hits;
- hit derivation;
- ordinary hit applications;
- zero-hit transition memory.

Add a canonical restoration API rather than mutating current hits from medical code.

Suggested records:

```text
requested restoration
applied restoration
before
after
maximum
source
rejected reason
```

Restoration must clamp at maximum and reject terminal characters at the caller/lifecycle boundary.

## IndividualCasualtyProcedureProfileStore

Owns immutable trusted runtime procedure kind and death-count policy for each entity. It does not own lifecycle, timers, team hostility, nation, or respawn execution.

## IndividualCasualtyLifecycleStore

Owns:

- character lifecycle;
- entered-dying tick;
- terminal tick and cause;
- down position;
- transition memory.

## IndividualDeathCountStore

Owns:

- configured policy;
- derived duration;
- remaining ticks;
- pause state and pause source;
- last advancement tick.

## IndividualPlayerPresenceStore

Owns:

- player-presence state;
- egress/respawn-staging procedure;
- optional scenario destination;
- procedure transition ticks.

## IndividualCasualtyAssistanceStore

Owns:

- assistance state;
- drag group ID;
- destination;
- claimed Physick;
- relevant transition ticks.

## IndividualMedicalProfileStore

Owns trusted runtime medical qualifications and starting generic-herb configuration.

## IndividualMedicalResourceStore

Owns current, maximum, and reserved generic herbs.

## IndividualTraumaticWoundStore

Owns:

- current traumatic-wound state;
- latest trigger kind and tick;
- bounded episode count;
- deterministic opportunity application memory.

It does not own lifecycle, hits, death count, treatment progress, or movement.

## IndividualTreatmentActionStore

Owns:

- healer-to-patient relationship;
- selected treatment;
- started tick;
- progress/remaining ticks;
- reservation;
- interruption state;
- reusable events.

## CasualtyDragGroupStore

Sparse store owning only active drag groups:

- group ID;
- patient;
- one Physick or two helpers;
- committed hands;
- destination;
- group state;
- started/completed/cancelled ticks.

Do not allocate a group record for every entity.

## IndividualCasualtyHistoryStore

Owns bounded lifetime/after-action summaries.

---

# Production pipeline boundary

The accepted Milestone 5 pipeline currently performs:

```text
eligibility
→ targeting
→ action
→ defence
→ gate
→ global hits
→ unit aggregation
→ consequence projection
```

Milestone 6 must place casualty transitions after global-hit application but before final aggregation and pressure/morale consequence projection.

Split orchestration into reusable boundaries rather than running combat twice:

```text
combat exchange:
eligibility → targeting → action → defence → gate → global hits

post-combat read models:
unit aggregation → consequence projection
```

The split must preserve the existing public production result where practical and must not duplicate combat records, hit application, aggregation, or pressure.

The tick-start combat eligibility projection must also become lifecycle-aware. Hits remain necessary but no longer sufficient:

```text
combat eligible = currentHits > 0 && lifecycle == active
```

Later withdrawal/assistance states may further suppress participation through explicit policy. Do not infer lifecycle only from hits once Milestone 6 state exists.

# Production tick order

Milestone 6 requires this deliberate split between combat resolution and post-combat aggregation.

Recommended production order:

```text
1. command/scenario input already accepted by the sandbox
2. formation and morale movement for active formation participants
3. active drag-group movement
4. terminal-egress and respawn-egress movement
5. individual combat eligibility snapshot
6. individual target selection
7. attack lifecycle
8. defence arbitration
9. landed-hit relationship gate
10. global-hit application
11. zero-hit casualty lifecycle transitions
12. citizen traumatic-wound opportunity resolution
13. drag-group validation, handoff, patient claims, and treatment start/interruption
14. treatment action advancement, hit restoration, trauma/limb treatment, and terminal comfort
15. death-count advancement and terminal transitions
16. final end-of-tick activity/capability projection
17. individual unit aggregation
18. individual consequence projection
19. medical urgency, trauma withdrawal, and rescue/triage decisions for next-tick movement
20. individual-authoritative pressure and cohesion
21. routing contagion
22. recovery threat
23. morale assessment and persistent morale arbitration
24. counters, casualty history, debug snapshots, and tick increment
```

Important timing rules:

- movement uses state established by the previous tick;
- a new drag group begins moving next tick;
- a new treatment action pauses a death count immediately but receives no free progress on its start tick;
- combat interruption evidence is resolved before treatment progress;
- treatment completion resolves before death-count advancement;
- terminal comfort never affects character lifecycle or global hits;
- trauma treatment clears withdrawal only on successful herb-backed completion;
- final aggregation sees any hit restoration completed this tick;
- zero-hit shock records remain events even when that individual is restored much later.

Refactor the Milestone 5 orchestration only enough to establish this order. Do not duplicate combat aggregation or consequence rules.

---

# Numbered implementation slices

## 6A-1 — Casualty procedure profiles and standalone lifecycle transitions

### Purpose

Create the authoritative casualty vocabulary and consume canonical Milestone 5 zero-hit events without changing production behaviour yet.

### Deliver

- `IndividualCasualtyProcedureProfileStore`;
- `IndividualCasualtyLifecycleStore`;
- `IndividualPlayerPresenceStore` with the Milestone 6 state vocabulary;
- immutable per-entity citizen/barbarian procedure profiles;
- standalone zero-hit transition application;
- `active → dying` and `activePresence → downedPresence`;
- recorded current-position down coordinates;
- canonical transition records and reusable output arrays;
- getters only, with no exposed mutable backing arrays.

### Tests

- all entities initialise `active` and `activePresence`;
- trusted procedure profiles validate entity coverage, uniqueness, kind, and death-count policy shape;
- faction ID is not used to infer procedure kind;
- one fresh zero-hit event produces one dying and downed-presence transition;
- duplicate same-tick or later already-zero events do not repeat transitions;
- transition records preserve attacker, target, tick, previous hits, procedure kind, and down position;
- reversed input order produces canonical entity-ID order;
- output arrays are reused and stale records clear;
- invalid IDs and mismatched entity counts fail clearly;
- replay is deterministic;
- no production simulation, formation, pressure, morale, renderer, UI, or worker behaviour changes.

### Boundary

Standalone sim state only. No production integration, timers, terminal transition, restoration, trauma, targeting/formation filtering, dragging, treatment, execution, or debug UI.

---

## 6A-2 — Production lifecycle integration and interaction filtering

### Purpose

Insert lifecycle transitions into the real tick and make dying entities cease ordinary battlefield participation.

### Deliver

- split the individual pipeline at global hits versus aggregation/consequence projection;
- run zero-hit lifecycle transitions between those boundaries;
- lifecycle-aware tick-start combat eligibility;
- cancellation/clearing of stale targets and active attacks through existing action eligibility semantics;
- formation participation filtering;
- blocker-grid and hostile-contact filtering;
- ordinary target and active-defence filtering;
- downed entities remain spatially queryable through explicit casualty queries;
- minimal lifecycle counters/debug inspection for configured entities.

### Timing

- a fighter reduced to zero may complete only the already accepted same-tick combat records produced by the Milestone 5 tick-start snapshot;
- lifecycle changes during that tick after hit application;
- post-combat aggregation sees the new lifecycle state;
- formation and ordinary combat exclusion take effect on the next tick;
- the entity does not move to a safer position when becoming downed.

### Tests

- the exact production pipeline applies global hits once and aggregates once;
- a fresh zero transition becomes dying before post-combat aggregation;
- dying entities cannot select, retain, begin, or complete later ordinary attacks;
- dying entities cannot actively defend on later ticks;
- dying entities stop formation-slot movement on the next tick;
- dying entities are absent from ordinary blocker and hostile-contact candidates;
- other formation members may move past them rather than freezing permanently;
- dying entities remain queryable by dedicated casualty-local queries;
- pressure/morale receive the original zero-hit shock exactly once;
- Milestone 5 attack, defence, hit, pressure, morale, and visual-regression traces remain unchanged before the first zero transition;
- no timer, treatment, rescue, execution, or egress behaviour appears;
- representative performance remains structurally covered.

### Boundary

No death count, terminal state, restoration, trauma, medical profiles, dragging, treatment, execution, egress, or casualty visual suite.

---

## 6B — Death counts, Fortitude, terminal state, and policy overrides

### Purpose

Advance deterministic dying timers and make terminal state authoritative.

### Deliver

- `IndividualDeathCountStore`;
- consume immutable policy from `IndividualCasualtyProcedureProfileStore`;
- normal Fortitude formula;
- fixed-duration policy;
- full tick semantics;
- pause API, without treatment integration yet;
- terminal transition and cause;
- character-only terminalisation; player presence remains `downedPresence`
  until the explicit post-terminal procedure integration in 6H;
- terminal interaction filtering;
- bounded casualty-history fields for zero/terminal transitions.

### Tests

- exact Fortitude ranks 0–5;
- full duration preserved on transition tick;
- count decrements exactly once per eligible tick;
- pause stops advancement;
- resumed count continues rather than resetting;
- fixed 30-second procedure works;
- expiry emits one terminal transition;
- no 6B API can return a terminal character to active;
- citizen terminal remains unavailable for the battle;
- citizen comfort, barbarian respawn egress, and `waitingAtRespawn` remain 6H work;
- every later fresh zero-hit transition starts a new full death count;
- integer bounds are validated.

### Boundary

No player-presence terminal transition, autonomous egress, treatment, rescue,
execution, VENOM, or faction inference.

---

## 6C — Trusted medical profiles, traumatic wounds, generic herbs, urgency, and local discovery

### Purpose

Create the minimum runtime medical content, deterministic citizen traumatic-wound condition, and casualty/low-hit prioritisation.

### Deliver

- trusted medical profile store;
- Physick-implies-Chirurgeon validation;
- individual generic-herb store;
- `IndividualTraumaticWoundStore`;
- deterministic keyed 10% zero-hit trauma opportunity for citizens;
- explicit future `limbCleave` opportunity adapter;
- trauma-withdrawal behaviour intent for active mobile citizens;
- medical urgency/read-model store;
- local allied patient query;
- local available-Physick query;
- urgency for dying and missing-hit patients;
- recruit/regular/veteran or existing behaviour-profile influence where already available;
- no global support-role scan.

### First active urgency rules

```text
dying:
critical

living at 1 hit:
urgent

living below half maximum:
moderate, increased for recruits and reduced during high-pressure veteran duty

active traumatic wound:
moderate-high withdrawal need, below immediate dying/immobility

comfortable missing hits:
low

terminal citizen awaiting comfort:
lowest
```

These values are behavioural inputs, not direct morale state.

### Tests

- Physick without Chirurgeon fails validation;
- default Physick herbs are 12;
- citizen zero-hit opportunities use a stable deterministic 10% rule based on the trusted casualty-procedure profile;
- barbarian profiles never receive traumatic wounds and consume no trauma roll;
- traumatic wounds do not alter hits, death counts, dying, execution, or terminal transitions;
- active mobile trauma patients abandon combat and seek a herb-capable Physick;
- trauma received on a zero-hit transition remains dormant while dying and drives withdrawal after revival;
- active trauma does not stack;
- a later trauma may occur after successful treatment;
- urgency ordering is deterministic;
- dying outranks all living missing-hit cases;
- recruit and veteran low-hit policy differs without changing combat stats;
- only allied local patients/support roles are considered;
- omitted medical profiles produce no medical activity.

### Boundary

No treatment action, drag group, physical drag movement, later call-effect source, XP validation, full perception, or end-game trauma statistics UI.

---

## 6D — Local safety selection and drag-group formation

### Purpose

Decide when and where rescue should occur without moving anyone yet.

### Deliver

- sparse `CasualtyDragGroupStore`;
- eligible patient query;
- helper eligibility and scoring;
- one-Physick/two-fighter group formation;
- deterministic helper reservation;
- bounded local safe-destination selection;
- rescue-requested and drag-start events;
- no global pathfinding.

### Selection rules

Priority tuple should include:

```text
patient urgency
local exposure/threat
same-unit or local responsibility
Physick rescue advantage
helper distance
helper current engagement/pressure
helper lifecycle and assistance availability
entity ID
```

Only one group may own a patient. One helper may belong to only one active group.

### Tests

- one available Physick can form a group alone;
- one ordinary fighter cannot;
- two ordinary fighters can;
- busy, dying, terminal, routing, treating, or already reserved helpers are excluded;
- group construction is input-order independent;
- safe destination is bounded and behind/away from local danger;
- no candidate produces no group;
- cross-team rescue does not occur.

### Boundary

No drag movement, handoff, treatment, terrain, perception memory, or energy cost.

---

## 6E — Cooperative drag movement and hand occupancy

### Purpose

Make rescue produce real tactical movement and opportunity cost.

### Deliver

- hand-commitment store or compatible shared occupancy abstraction;
- group movement;
- patient attachment to group;
- reduced deterministic drag speed;
- formation-slot suspension for helpers;
- combat attack suppression;
- defence availability based on remaining hands/equipment;
- interruption/cancellation rules;
- reached-safety event.

### Tests

- one Physick commits two hands;
- two fighters commit one hand each;
- incompatible two-handed equipment cannot defend with insufficient free hands;
- drag helpers cannot attack;
- the patient follows group movement deterministically;
- losing a required helper stops a two-fighter drag;
- a hit or terminal transition cancels/updates the group correctly;
- groups do not teleport or exceed configured speed;
- ordinary formation movement remains unchanged for non-participants.

### Boundary

No energy consumption yet. No detailed carrying animation. No pathfinding.

---

## 6F — Patient ownership, handoff, and triage

### Purpose

Prevent healer pile-ups and connect rescue movement to actual medical work.

### Deliver

- one-patient-per-Physick and one-Physick-per-patient claim store;
- explicit handoff;
- safe-position release when no Physick is available;
- current-patient continuity;
- local triage at action boundaries;
- deterministic reassessment;
- helper return-to-unit intent after handoff/release.

### Tests

- two Physicks cannot claim the same patient;
- one Physick cannot treat two patients simultaneously;
- fighter carriers hand off to an available Physick;
- busy Physicks do not accept a false handoff;
- helpers return to normal unit intent after release;
- a current valid patient retains ownership through minor arrivals;
- a newly arrived dying patient may win after the current action ends;
- stale claims clear when either participant becomes invalid.

### Boundary

No treatment progress or hit restoration yet.

---

## 6G — Battlefield treatment actions, finite herbs, trauma, and limb restoration

### Purpose

Implement actual Chirurgeon and Physick work, including herb-backed trauma treatment and slower no-herb limb care.

### Deliver

- canonical global-hit restoration API;
- `IndividualTreatmentActionStore`;
- Chirurgeon zero-hit treatment;
- Physick missing-hit treatment;
- Physick traumatic-wound treatment;
- herb-backed 30-second arm/leg treatment hooks;
- no-herb two-minute arm/leg treatment hooks;
- immediate death-count pause on valid Chirurgeon start;
- progress only on later valid ticks;
- interruption/restart;
- herb reservation/release/consumption;
- one-hit restoration;
- traumatic-wound clearing;
- disabled-limb clearing through generic hooks;
- dying-to-active transition;
- patient reassessment;
- treatment records and casualty-history counts.

### Tests

- Chirurgeon treatment completes after exactly 600 progress ticks;
- death count pauses throughout valid treatment;
- completion restores exactly one hit and ends dying;
- Chirurgeon treatment uses no herb;
- Physick hit, trauma, and fast limb treatment reserve then consume one herb;
- trauma treatment cannot begin without an available herb;
- a zero-herb Physick may still perform Chirurgeon treatment;
- a zero-herb Physick may perform a two-minute limb treatment;
- interruption releases a reserved herb;
- no partial treatment progress survives interruption;
- Physick cannot treat self;
- terminal patients cannot be restored;
- traumatic-wound treatment completes after exactly 600 progress ticks and clears only trauma;
- traumatic-wound treatment never revives a dying or terminal patient;
- limb treatment with a herb completes after exactly 600 progress ticks;
- limb treatment without a herb completes after exactly 2,400 progress ticks;
- one selected limb issue is cleared per action;
- gate-accepted landed hits interrupt;
- parried/blocked attacks do not;
- valid attack attempts by healer/patient interrupt;
- completion before death-count advancement can save a patient on the boundary tick;
- restored fighters become combat eligible according to the documented next eligibility snapshot.

### Boundary

No active CLEAVE/IMPALE source, VENOM, WEAKNESS, potions, mana healing, heroic healing, traumatic-wound hospital simulation, or end-game medical report UI.

---

## 6H — Execution, terminal citizen comfort, and player-presence procedure hooks

### Purpose

Implement deliberate fatal action, terminal citizen comfort, and separate post-terminal procedure state without prematurely moving citizens to the Sentinel Gate.

### Deliver

- sparse execution-action store;
- explicit execution intent input;
- five-second commitment;
- interruption and completion;
- terminal cause `execution`;
- `IndividualPlayerPresenceStore`;
- citizen `terminalAwaitingComfort` state after death-count expiry or execution;
- two-minute no-herb Physick comfort action;
- citizen `terminalComforted` state on completion;
- barbarian-style respawn egress and waiting state where explicitly scenario-configured;
- optional barbarian respawn destination anchors;
- no-combat/no-morale/no-collision barbarian presence movement;
- respawn-staging events.

Citizen Sentinel Gate movement is not implemented here. Milestone 9 consumes `terminalComforted`.

### Tests

- execution cannot target an active non-consenting character;
- a dying target is eligible;
- completion takes exactly 100 valid progress ticks;
- range loss, executor attack, or accepted landed hit interrupts;
- completion produces terminal exactly once;
- ordinary AI never starts execution without explicit intent;
- a citizen made terminal by expiry or execution enters `terminalAwaitingComfort`;
- terminal citizen comfort takes exactly 2,400 uninterrupted progress ticks;
- comfort consumes no herb even when herbs are available;
- comfort is lower priority than every living/dying treatment;
- completion changes only player presence to `terminalComforted`;
- the character remains terminal and cannot be restored;
- terminalComforted citizens remain still during Milestone 6;
- barbarian presence may reach waiting-at-respawn and does not re-enter during Milestone 6;
- waiting-at-respawn does not heal or reactivate the terminal battlefield life;
- missing barbarian destination leaves a clear waiting-for-scenario state rather than guessing a respawn point.

### Boundary

No Sentinel Gate movement or geometry, citizen battlefield exit, reinforcement batching, one-hour clock, capture, searching, or corpse objects.

---

## 6I — Production integration, unit consequences, history, and performance

### Purpose

Consolidate casualty systems into the authority-live simulation without adding new medical mechanics.

### Deliver

- final production tick order;
- final end-of-tick unit casualty/active/helper/treatment summaries;
- no duplicate zero-hit morale shock;
- casualty-history snapshots;
- bounded debug inspection fields;
- representative and stress performance coverage;
- one-hour deterministic timer/treatment soak test;
- documentation of deferred terrain/perception/content integrations.

### Unit summary additions

At minimum:

```text
active character members
dying members
terminal members
downed player presences
active drag helpers
patients being dragged
patients under treatment
active traumatic wounds
trauma-withdrawal characters
treatment completions this tick
trauma treatments this tick
limb treatments this tick
terminal transitions this tick
terminal citizens awaiting comfort
terminal comfort actions
terminal comforted citizens
respawn-egress presences
waiting-at-respawn presences
```

### Morale/consequence policy

- retain Milestone 5 zero-hit shock and proportional cohesion loss;
- do not apply a second identical shock when the same casualty becomes terminal;
- execution and terminal records are available for later local perception/morale work;
- successful treatment changes combat-capable counts naturally;
- no magical morale bonus is granted merely because treatment completed;
- helper formation departure affects formation through real participation/movement, not an extra arbitrary cohesion penalty.

### Performance cases

#### Representative ordinary battle

```text
2,000 entities
100 units × 20
5% currently dying
small citizen traumatic-wound population
small number of active drag groups and Physicks
```

#### Casualty-heavy representative case

```text
2,000 entities
20% dying/terminal
bounded local rescue and triage
```

#### Dense collapse stress case

```text
many casualties and helpers in overlapping local space
explicitly labelled stress geometry
```

Report:

- casualty transition;
- death timers;
- medical queries;
- helper candidate count;
- drag-group selection;
- drag movement;
- triage/claims;
- treatment;
- presence egress;
- full exact production tick;
- mean, maximum, and p95;
- output reuse and allocation observations where already measurable.

Use structural assertions only. Do not optimise from the dense stress case unless representative performance is unacceptable.

---

## 6J — Retained casualty visual suite and milestone acceptance

### Purpose

Make the milestone inspectable and retain the evidence.

Add:

```text
/test?scenario=casualty-lifecycle
```

Start paused at tick 0.

Use spatially isolated labelled chambers:

1. zero-hit transition and interaction filtering;
2. normal versus Fortitude death count;
3. Chirurgeon pause and successful save;
4. interrupted treatment and herb reservation;
5. two-fighter drag to safety and handoff;
6. lone Physick drag and treatment;
7. citizen traumatic wound, withdrawal, herb treatment, and return eligibility;
8. explicit execution and terminal citizen comfort;
9. barbarian trauma immunity and respawn staging.

Headless tests use official durations.

The visual fixture may use explicit shortened scenario overrides so a human can inspect the whole lifecycle without waiting eighteen real minutes for a heroic Fortitude enthusiast to finish counting.

Expose bounded inspected-entity state:

```text
character lifecycle
player presence
death-count duration/remaining/paused
medical urgency
assistance state
drag group/helpers/destination
claimed Physick/current patient
treatment action/progress/reservation
current/maximum hits
terminal cause
traumatic-wound state/trigger/episode count
trauma-withdrawal target
terminal-comfort progress/state
respawn destination/state
```

Keep overlays hideable using the existing visual-test control.

Human acceptance questions:

- do zero-hit fighters visibly stop being combatants;
- do formations move around casualties rather than freezing;
- do rescue helpers leave the line believably;
- is drag movement slow and coherent;
- is the Physick handoff readable;
- does treatment pause and interruption make sense;
- does a saved fighter rejoin naturally;
- does a traumatised citizen leave combat without becoming magically death-proof;
- does trauma treatment require a herb and clear the withdrawal state;
- do barbarians remain trauma-immune;
- does terminal comfort remain visibly separate from revival;
- are citizen and barbarian procedures clearly distinct;
- is any AI over-eager to rescue, heal, or execute?

Milestone 6 is accepted only after headless regression, performance, and human visual inspection.

---

# Integration invariants

These must remain true throughout the milestone:

- the same entity ID represents the individual character and associated physical player presence;
- character lifecycle, assistance, treatment, and presence state have separate ownership;
- current hits remain owned by `IndividualGlobalHitStore`;
- terminal battlefield lives cannot be restored by ordinary treatment;
- only a later explicit scenario respawn boundary may create a new active barbarian life;
- terminal comfort changes player-presence procedure only;
- zero-hit transitions occur once per fresh fall to zero;
- traumatic wounds never override zero hits, dying, execution, or terminal state;
- barbarians never receive traumatic wounds;
- trauma is non-stacking but may recur after treatment;
- ordinary targeting never selects dying/terminal characters;
- execution is the only Milestone 6 hostile action intentionally targeting a dying character;
- death counts use simulation ticks, never wall time;
- active valid Chirurgeon treatment is the only Milestone 6 death-count pause;
- traumatic-wound treatment always requires one herb;
- terminal comfort and slow limb treatment require no herb;
- no herb is consumed on an interrupted action;
- no unit-level resource pool spends herbs;
- no dense entity-pair casualty matrix exists;
- no global nearest-Physick scan exists;
- no renderer or browser API enters `src/sim`;
- no terrain, perception, calls, energy, command, or scenario system is duplicated inside medicine.

---

# Explicit deferrals

## Milestone 7

Energy cost and fatigue from:

- fighting while injured;
- dragging;
- carrying equipment;
- long casualty extraction;
- repeated treatment movement;
- egress and barbarian return.

## Milestone 9

Concrete:

- Sentinel Gate geometry;
- movement of terminalComforted citizens to the Gate;
- citizen deployment/withdrawal;
- barbarian respawn locations;
- waiting-group batching;
- reinforcement re-entry and explicit new-life/reset semantics for waiting barbarians;
- one-hour battle clock;
- late-battle respawn cessation.

## Milestone 10

Perceived and remembered:

- casualty visibility;
- known Physick locations;
- support-role memory;
- non-omniscient patient seeking;
- screams/calls for help.

## Milestone 11

Canonical:

- skill definitions;
- XP-independent trusted runtime role profiles;
- expanded support-role resources;
- detailed runtime inventory content.

Milestone 11 must consolidate the minimal medical profile/resource data rather than replace it with competing state.

## Milestone 12

Terrain-aware:

- cover;
- unsafe ground;
- extraction routes;
- safe down-position adjustment;
- treatment refuges;
- obstacle-aware casualty movement.

## Milestone 13

Additional condition sources and rescue triggers:

- CLEAVE/IMPALE creation of arm disability;
- CLEAVE/IMPALE creation of leg disability;
- limb-cleave traumatic-wound opportunity via the Milestone 6 resolver;
- PARALYSE rescue;
- VENOM;
- WEAKNESS;
- heroic recovery;
- EXECUTE call/source integration;
- effect-specific treatment.

## Later/out of scope

- detailed traumatic-wound hospital outcomes and end-game presentation;
- spiritual wounds;
- searching and looting;
- capture/restraint;
- resurrection;
- exact carrying animation;
- detailed corpse geometry;
- left/right limbs or hands;
- named-character persistence between battles.

---

# Milestone 6 definition of done

Milestone 6 is complete when:

- fresh zero-hit events immediately create dying/unresisting characters;
- dying and terminal characters are excluded from ordinary combat, formation participation, blockers, support, and future objective control;
- normal Fortitude death counts and explicit fixed overrides are deterministic;
- terminal state occurs exactly once per battlefield life and cannot be healed;
- Chirurgeon treatment correctly pauses, interrupts, completes, and restores one hit;
- generic Physick treatment has finite individual herbs and safe reservation semantics;
- citizen traumatic wounds use a stable deterministic 10% zero-hit opportunity, do not stack, never protect from dying, and drive withdrawal only while active/mobile;
- barbarians never receive traumatic wounds;
- trauma treatment requires a herb and permits later recurrence;
- no-herb Physicks can still save dying patients, slowly restore one disabled limb, drag eligible patients, and comfort terminal citizens;
- local medical urgency and patient claims are deterministic;
- one Physick or two fighters can form a bounded rescue group;
- dragging creates real movement and hand/formation costs;
- handoff, treatment ownership, and triage are explicit;
- execution is timed, interruptible, and never automatic by default;
- terminal citizen comfort cannot reactivate the character;
- terminalComforted is available for later Sentinel Gate egress without implementing that movement;
- barbarian respawn-staging hooks exist without premature re-entry logic;
- casualty history remains inspectable after battlefield exit;
- representative 2,000-entity performance remains viable;
- a human can inspect and understand the complete casualty lifecycle in the retained visual scenario.

## Milestone boundary

> Milestone 5 decides who was hit and who reached zero. Milestone 6 decides what being down means, how trauma changes a surviving citizen's behaviour, who tries to save or comfort them, and which later player-presence procedure becomes available when the character can no longer be saved.
