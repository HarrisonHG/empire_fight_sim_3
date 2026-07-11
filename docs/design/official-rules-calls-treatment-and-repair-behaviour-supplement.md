# Project Behaviour Plan: Calls, Casualty Rescue, Battlefield Treatment, and SHATTER Repair

Status: authoritative project behaviour supplement.

This document supplements:

- `official-rules-calls-simulation-extraction.md`
- `official-rules-weapons-and-armour-simulation-extraction.md`
- the current milestone roadmap

It records observed Empire-player behaviour and deliberate simulation rulings supplied by the project owner. These are not all literal rules-text requirements; they define what believable autonomous battlefield behaviour should look like.

Recorded: 2026-07-11.

---

# 1. Core behavioural model

Combat effects create two separate questions:

```txt
What is mechanically wrong with this individual?
What does this individual or their nearby allies choose to do about it?
```

The call/effect system owns the first question.

Morale, experience, support roles, local threat, and orders own the second.

Do not hard-code every condition to immediately seek a healer.

---

# 2. Perceived urgency of effects

## Immediate critical events

These are the battlefield “oh shit” events:

```txt
zero global hits
CLEAVE or IMPALE causing arm disability
CLEAVE or IMPALE causing leg immobility
PARALYSE while exposed to immediate hostile threat
```

Behaviour:

- nearby allies strongly consider rescue or protection
- physicks prioritise these patients
- an arm-disabled individual attempts to withdraw or reach treatment because they cannot attack
- a leg-immobile or paralysed individual cannot self-evacuate and may require dragging
- zero-hit characters require immediate Chirurgeon intervention to avoid terminal state

`body` results from `CLEAVE` or `IMPALE` are represented by the zero-hit path.

## Persistent but usually non-panicking conditions

```txt
VENOM
WEAKNESS
```

Veteran behaviour:

- does not immediately abandon an active fight merely because the condition exists
- waits for a peaceful or low-pressure moment to seek a physick
- increases urgency sharply when current hits are low
- at roughly one or two remaining hits, treats the condition as urgent because the next landed blow may create a severe casualty outcome
- may continue obeying an important order if local support is strong

Recruit behaviour:

- treats either condition as urgent even at comfortable hit levels
- is likely to disengage and seek a healer quickly
- may spread local concern or create minor unit disruption through abrupt withdrawal

Intermediate experience should interpolate between these policies rather than use only a binary recruit/veteran flag.

## Temporary calls normally allowed to expire

```txt
REPEL
STRIKEDOWN
ENTANGLE
PARALYSE
```

Normal behaviour:

- do not seek a cure merely because one of these short effects is active
- endure the effect and resume action when it expires
- nearby allies may protect, exploit, or rescue the target based on danger
- `PARALYSE` may trigger dragging if the victim is exposed
- `ENTANGLE` does not normally trigger dragging because the target can still defend and the effect is brief
- `STRIKEDOWN` causes a fall/get-up response, not healer-seeking
- `REPEL` runs its course, subject to the precedence rules below

Purify or other cures may exist as mechanical options later, but autonomous ordinary fighters should not route themselves to a healer for these transient effects.

---

# 3. Effect precedence

Project ruling:

```txt
PARALYSE > REPEL movement
ENTANGLE > REPEL movement
```

Meaning:

- while `PARALYSE` is active, the target does not move under `REPEL`
- while `ENTANGLE` is active, the target's feet do not move under `REPEL`
- all effect timers continue to advance normally
- if the movement lock expires while `REPEL` still has remaining duration, `REPEL` resumes for the remaining time
- if `REPEL` expires first, no deferred movement occurs

This precedence is explicit and must not depend on system insertion order.

Still unresolved for later implementation:

```txt
PARALYSE + STRIKEDOWN
multiple simultaneous REPEL sources
VENOM cure during an active death count
```

---

# 4. Coarse injury state

Do not model exact body locations.

Use:

```txt
body
arm
leg
```

When an unprotected `CLEAVE` or `IMPALE` applies:

- `body` reduces the target to zero hits
- `arm` disables ordinary attacks
- `leg` prevents voluntary translation

Do not store left/right sides.

This simplification means an arm injury broadly removes meaningful offensive weapon use. It intentionally sacrifices fine-grained weapon switching and ambidexterity edge cases.

---

# 5. Physick assumptions

Project content assumption:

```txt
every Physick is also a Chirurgeon
```

The reverse is not necessarily true.

A physick therefore has:

- the ability to stabilise a zero-hit dying patient
- the ability to treat relevant persistent conditions and ruined limbs when a valid treatment source is available
- the behavioural knowledge to drag a casualty alone
- priority over ordinary fighters as the final owner of a casualty

Skills, herbs, potions, mana, and other treatment sources will be defined later. The behaviour model should query available treatment actions rather than assume infinite free cures.

---

# 6. Treatment action model

Initial battlefield abstraction:

```txt
one treatment action = 30 uninterrupted seconds
```

This is deliberately simpler than modelling every official treatment duration separately.

A physick treats one issue at a time.

At the start of each treatment action:

1. inspect the current patient
2. identify every condition the physick can currently treat
3. rank them by medical priority
4. select one treatment
5. commit for 30 seconds
6. on completion, apply exactly that treatment
7. reassess the patient and nearby casualty queue

The physick normally continues until every currently treatable problem on that patient is fixed.

A treatment fails and restarts if:

- the physick is hit
- the patient is hit
- the physick attacks
- the patient attacks
- either participant is forced away or becomes unable to continue

No partial progress is retained.

## Suggested treatment priority

Highest first:

```txt
1. zero hits / active death count
2. leg immobility preventing self-evacuation
3. arm disability preventing combat
4. VENOM when current hits are low
5. restore dangerously low global hits
6. WEAKNESS when the patient's active role is important
7. VENOM at comfortable hits
8. WEAKNESS without immediate role pressure
9. other treatable non-critical effects
```

Patient continuity matters. A physick should not constantly abandon a nearly completed patient for minor arrivals.

After each completed 30-second action, the physick may switch to a newly arrived higher-priority casualty, especially a zero-hit patient.

---

# 7. Casualty rescue and dragging

## Eligible patients

An allied individual can be dragged when they are:

```txt
PARALYSED
at zero hits
leg-disabled by CLEAVE or IMPALE
```

Normal `ENTANGLE`, `STRIKEDOWN`, and `REPEL` do not create a drag request.

## Required helpers

Project rule:

```txt
one physick
or
two ordinary fighters
```

A lone ordinary fighter does not drag a casualty.

Implementation interpretation:

- one physick uses both hands and suspends treatment/other actions while dragging
- two fighters cooperate, each committing one hand and movement intent
- the casualty becomes attached to the drag group
- the drag group moves at a reduced deterministic speed
- carriers cannot make normal attacks while the drag is active
- ordinary formation slots are suspended until release
- later energy systems charge meaningful exertion to the carriers

## Rescue destination

The goal is not “nearest healer at any cost.” It is first to leave immediate combat danger.

Choose a local safe destination using:

- distance from hostile threat
- movement behind the nearby allied line
- low recent strike/contact density
- reachable cover or terrain
- known physick position
- objective/order constraints
- a bounded search rather than global pathfinding

A casualty is safe enough when treatment is unlikely to be immediately interrupted, not only when all enemies are far away.

## Fighter-to-physick handoff

When fighter carriers reach a nearby available physick:

1. release the casualty into the physick's patient ownership
2. emit an explicit handoff event
3. fighters clear the treatment space
4. fighters return to their unit or nearest valid combat order
5. the physick may reposition the casualty slightly farther if needed
6. the physick begins triage

Fighters strongly prefer handoff over remaining as guards unless local threat makes abandonment obviously unsafe.

---

# 8. Healer-seeking behaviour

A mobile affected individual may seek treatment themselves.

## Veteran policy

For `VENOM` or `WEAKNESS`:

```txt
if current hits are comfortable and combat pressure is high:
    continue current role
else if a peaceful window appears:
    seek a physick
else if current hits are low:
    disengage and seek treatment urgently
```

For arm disability:

- disengage immediately if possible
- seek a physick
- avoid pretending to remain combat-capable

For low ordinary hits without another condition:

- seek healing based on confidence, role importance, order pressure, and proximity to support
- do not automatically abandon the line at the first lost hit

## Recruit policy

For `VENOM`, `WEAKNESS`, arm disability, or very low hits:

- strongly prefer immediate healer-seeking
- tolerate less combat pressure before breaking away
- may choose a farther known healer rather than waiting for a safe opening
- can create secondary morale/cohesion consequences by leaving formation abruptly

---

# 9. SHATTER behaviour

`SHATTER` is operationally severe because it removes the use of the struck weapon, implement, or shield.

## Immediate response

1. mark the item broken and unusable
2. cancel attacks or defences that require it
3. use a valid backup item if one is carried and can be readied
4. otherwise enter faction-specific repair behaviour

A broken primary weapon often removes ordinary offensive capability. It should not merely apply a mild attack-speed penalty.

## Citizen repair behaviour

Citizens:

- seek the closest known or visible allied artisan who is plausibly reachable
- avoid crossing an active hostile line solely to reach an artisan
- leave ordinary formation participation while seeking repair
- present the broken item for repair
- use the official Artisan's Oil action duration of 10 uninterrupted seconds when that resource is available
- return to their unit/order after repair
- if no artisan or repair resource is available, remain behind the line, adopt a support/withdrawal role, or use a backup item

Project default:

```txt
ordinary citizen AI does not independently jerry-rig a shattered item
```

Magic `mend` and other repair sources may later use the same generic repair-action interface, but the first citizen behaviour target is artisan-seeking.

## Barbarian repair behaviour

Barbarians:

1. choose the closest reachable terrain feature suitable for cover or roleplay
2. if none exists, choose the nearest battlefield edge
3. move there without attempting ordinary attacks with the broken item
4. spend 30 uninterrupted seconds jerry-rigging the item
5. restore the item to usable state
6. return to their unit, nearest compatible group, or current objective

The repair fails and restarts if the barbarian is hit or forced to abandon the action.

The terrain feature is a behavioural destination, not a consumable repair object.

---

# 10. Manual call-use intelligence

Visible armour should filter finite manual calls.

```txt
CLEAVE:
  avoid medium and heavy armour

IMPALE:
  avoid heavy armour
```

Call users are assumed competent enough to recognise broad armour classes.

Do not require exact hidden armour-coverage knowledge because the simulation uses full category coverage.

Exceptions:

- automatic projectile `IMPALE`
- panic or very low discipline
- scripted NPC behaviour
- mistaken perception if a future perception model explicitly supports it
- unlimited/non-finite sources where wasting the effect has no material cost

---

# 11. Suggested state and events

## State

```txt
medicalUrgency
treatmentNeedMask
currentPatientId
currentTreatmentAction
treatmentTicksRemaining
casualtyAssistanceState
dragGroupId
handoffTargetPhysickId
knownSupportRoleLocations
repairSeekingState
repairDestination
itemCondition
coarseImpactArea
armCombatDisabled
legMovementDisabled
```

## Events

```txt
medicalNeedDetected
medicalPriorityChanged
patientClaimed
treatmentStarted
treatmentInterrupted
treatmentCompleted
casualtyDragRequested
casualtyDragStarted
casualtyReachedSafety
casualtyHandedToPhysick
casualtyReleased
repairNeedDetected
artisanSearchStarted
barbarianRepairRefugeSelected
repairStarted
repairInterrupted
repairCompleted
effectMovementSuppressedByPriority
```

Events should be transition-only where possible.

---

# 12. Milestone placement

## Milestone 6

Add:

- medical urgency
- casualty drag eligibility
- one-physick/two-fighter rescue groups
- safe extraction
- fighter-to-physick handoff
- sequential 30-second treatment abstraction
- patient continuity and triage
- recruit/veteran treatment-seeking policy hooks

## Milestone 10 or perception layer

Add:

- known/visible physick and artisan locations
- local support-role memory
- local safe-treatment assessment

## Milestone 11

Add:

- Physick implies Chirurgeon in default content
- Artisan role and repair resources
- treatment source inventory
- backup weapon data
- experience profile inputs for healer-seeking

## Milestone 12

Add:

- safe treatment spaces
- terrain features usable as barbarian repair refuges
- battlefield-edge repair destinations
- threat-aware extraction routes

## Milestone 13

Add:

- `PARALYSE`/`ENTANGLE` precedence over `REPEL`
- coarse arm/leg/body outcomes
- effect-triggered medical urgency
- no ordinary cure-seeking for transient calls
- `VENOM`/`WEAKNESS` experience-sensitive healer-seeking
- `SHATTER` repair-seeking and faction-specific repair actions

---

# 13. Acceptance scenarios

## Veteran with WEAKNESS

- veteran has comfortable hits
- unit is actively engaged
- nearby physick exists behind the line
- veteran remains with the unit
- when pressure drops, veteran withdraws for treatment

## Recruit with VENOM

- recruit is otherwise healthy
- recruit receives `VENOM`
- recruit urgently seeks the nearest known physick
- departure produces formation/cohesion consequences

## Low-hit veteran with VENOM

- veteran has one or two hits remaining
- veteran disengages quickly
- medical urgency is comparable to a critical injury

## Drag and handoff

- ally reaches zero hits in contact
- no physick is adjacent
- two fighters form a drag group
- they move the casualty behind the line
- an available physick becomes reachable
- handoff occurs
- fighters return to their combat order
- physick begins a 30-second Chirurgeon action

## Lone physick rescue

- leg-disabled ally is exposed
- one physick reaches them
- physick drags them alone
- physick chooses a safe treatment point
- physick begins treatment after release

## Effect precedence

- target is both entangled and repelled
- target does not translate while entangled
- both timers continue
- repel resumes only if time remains after entangle expires

## Citizen SHATTER

- citizen weapon is broken
- no backup exists
- citizen finds a reachable artisan
- artisan spends 10 uninterrupted seconds and one valid repair resource
- weapon returns to ready state
- citizen rejoins the unit

## Barbarian SHATTER

- barbarian weapon is broken
- closest terrain feature is selected
- barbarian moves there
- thirty-second repair is interrupted by a hit and restarts
- completed repair restores the item
