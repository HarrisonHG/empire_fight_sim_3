# Milestone 2: Unit Movement, Footprints, and Behaviour Arbitration

## Goal

Create the first simulation slice where units move like units while individuals still show recognisable differences.

The purpose is not full tactical combat. The purpose is to prove that units can move, maintain or lose loose formation, respond to other unit footprints, and resolve competing movement pressures without freezing, jittering, or relying on all-to-all pathfinding.

This milestone should create visible behaviour that earns buy-in:

- a recruit avoids being first forward
- a veteran holds formation better
- heavy infantry preserve formation more strongly
- skirmishers blob, spread, and route around rather than pushing through
- routing fighters disrupt allies
- units choose one clear movement response when blocked

The main design risk is arbitration: when several movement behaviours are plausible, the simulation must choose one clear answer and stick with it long enough to avoid oscillation.

## Core Principles

- Units have invisible anchors.
- Units have spatial footprints.
- Individuals move toward loose formation slots.
- Living entities are not A* obstacles.
- A* is only for static terrain or high-level anchor routes.
- Each individual has one primary movement mode at a time.
- Local avoidance modifies movement but does not choose the goal.
- Collision and spacing resolution are separate from intent selection.
- Stuckness is a visible state, not an invisible bug.
- Unit behaviour should emerge from simple individual decisions shaped by group influence.

## Behaviour Arbitration Rules

When several movement behaviours are possible, choose based on:

1. current unit order
2. blocker allegiance
3. troop category
4. unit role or formation type
5. unit discipline
6. captain aggression or caution
7. unit cohesion
8. individual confidence
9. individual pressure
10. local ally movement

Do not blend multiple high-level movement styles together.

A unit must choose one current movement style:

* formedDetour
* looseFlow
* pushThrough
* haltAndWait
* engageFront

A unit should not change movement style every tick. Use a short commitment period or other hysteresis so that a unit does not oscillate between detouring, waiting, and flowing.

Individuals must also choose one primary movement mode at a time. Local avoidance may adjust that movement, but it must not replace the selected mode’s goal.

## Troop Behaviour Defaults

### Heavy Infantry

Heavy infantry should prefer:

* formed lines
* disciplined marches
* holding contact
* preserving front/rear structure
* avoiding unnecessary flow movement

Heavy infantry may detour as a formed unit or halt and wait if blocked by allies.

### Skirmishers

Skirmishers should prefer:

* loose blobs
* spreading out
* routing around blockers
* flanking movement
* avoiding push-through behaviour

Skirmishers should almost never push through friendly units.

### Recruits

Recruits should:

* avoid being first forward
* copy nearby allies more than veterans
* overreact to pressure
* degrade when isolated
* give way to more confident or higher-ranking allies

### Veterans

Veterans should:

* hold formation under pressure better
* recover from pressure faster
* step into gaps when appropriate
* exploit movement opportunities more readily
* depend less on copying nearby allies

### Routing Fighters

Routing fighters may disrupt allied units while escaping.

Routing movement has high disruption priority but should damage cohesion and increase confusion or pressure in affected units.

## Required Unit Concepts

Each unit should have:

- an invisible anchor position
- a heading
- a formation type
- a width/depth or approximate footprint
- a current movement style
- a current order
- a cohesion value
- a morale value

The unit anchor represents the unit’s intended organisation point. It is not an entity, cannot fight, cannot be killed, and does not directly block movement.

The unit footprint represents the approximate space occupied by the group. Other units reason about this footprint at a high level before individual movement and spacing are resolved.

## Required Individual Concepts

Each individual should have:

- position
- role
- unit membership
- current movement mode
- assigned or approximate formation slot
- discipline
- bravery
- aggression
- pressure
- confidence
- stuck state

The individual should not make global tactical decisions. It should react to its local situation, current unit order, nearby allies, nearby enemies, and personal traits.

## Required Movement Modes

Implement the smallest useful set first:

- holdPosition
- moveToFormationSlot
- advanceWithUnit
- closeToAttack
- maintainReach
- fallBackWithUnit
- regroup
- rout
- sidestepUnstuck

Each entity must have only one primary movement mode at a time.

Do not blend unlimited competing movement desires together. Movement should be selected as a mode, then modified by local avoidance and spacing.

For this milestone, `closeToAttack` and `maintainReach` are movement/range-positioning behaviours only. They must not introduce full attack resolution, parry modelling, damage systems, or combat tempo.

## Required Unit Movement Styles

Implement:

- formedDetour
- looseFlow
- pushThrough
- haltAndWait
- engageFront

### formedDetour

The unit attempts to preserve formation while moving around another unit footprint.

Use when:

- cohesion is high
- the unit is formed
- the blocker is allied
- the unit has enough room to go around
- the unit is not routing or charging

### looseFlow

The unit temporarily loosens formation and allows individuals to flow around a blocking footprint while still sharing a common destination.

Use when:

- the unit is loose
- cohesion is moderate or low
- the unit is skirmishing
- the unit needs to move around a friendly obstruction
- formation preservation is less important than reaching the destination

### pushThrough

The unit continues through occupied space and accepts disruption.

Use rarely.

Use when:

- the unit is routing
- the unit is charging
- the unit has explicit high-priority movement
- the unit is deliberately attempting to break into an enemy unit
- the scenario accepts cohesion damage

Push-through should reduce cohesion and increase pressure or confusion for affected units.

### haltAndWait

The unit stops rather than trying to path through another formed unit.

Use when:

- the blocker is allied
- there is no good detour
- cohesion preservation matters
- the unit is waiting for space to open

### engageFront

The unit treats the blocking enemy footprint as the target and forms contact along the front.

Use when:

- the blocker is hostile
- the current order allows combat contact
- the unit is advancing, pressing, or charging

## Movement System Boundaries

Do not use A* around allies or enemies.

Use A* only for:

- static terrain
- impassable obstacles
- high-level anchor routes where needed

Use local avoidance and spacing for:

- allies
- enemies
- moving units
- temporary crowding
- melee contact

The movement pipeline should be:

1. Unit order selects intent.
2. Unit anchor determines high-level movement.
3. Unit footprint detects nearby unit-level blockers.
4. Unit chooses movement style.
5. Individuals choose one movement mode.
6. Individuals generate desired movement.
7. Local avoidance modifies desired movement.
8. Collision and spacing resolve overlaps.
9. Stuck detection updates stuck state.
10. Debug/logging records meaningful failures or transitions.

## Stuck Handling

Stuckness must be represented explicitly.

If an entity fails to make meaningful progress for a short period:

1. keep current mode briefly
2. slow or hold if blocked by an ally
3. sidestep perpendicular to desired movement
4. yield to higher-priority movement
5. request or perform slot reassignment
6. regroup if the previous target is no longer sensible

Do not silently let entities jitter forever.

## Acceptance Tests

Create headless tests for:

- A formed unit advances without members overtaking each other.
- A rear fighter blocked by an ally slows or sidesteps instead of pushing through.
- A unit detours around another allied formed unit.
- A loose unit can flow around another unit and regroup afterward.
- A routing unit disrupts nearby allies while escaping.
- A unit can halt and wait when an allied unit blocks its path.
- A unit can engage the front of a hostile unit footprint.
- A push-through movement reduces cohesion.
- A spear-role fighter attempts to maintain effective range.
- A shield-role fighter closes range only when confidence/order allows it.
- A recruit does not step forward first when the unit is holding.
- A veteran maintains formation under pressure better than a recruit.
- Stuck entities enter a visible stuck state and recover or change mode.
- A skirmisher unit blocked by an allied unit flows/routes around rather than pushing through.
- A heavy infantry unit blocked by an allied unit prefers formed detour or halt over loose flow.
- A unit does not oscillate between detour, flow, halt, and push every tick.
- A routing fighter can disrupt allied spacing without causing permanent deadlock.
- A less confident fighter yields to a more confident or higher-ranking ally.

## Non-Goals

Do not implement:

- full captain AI
- runner-based battlefield communication
- detailed morale cascades
- complex weapon technique modelling
- magic
- objectives beyond simple hold/move/engage anchors
- individual A* pathing around living entities
- global battlefield awareness
- complex terrain effects
- full attack/parry/damage resolution
- detailed citizen vs barbarian morale modelling
- full role/loadout system
- tactical captain decision-making beyond simple existing orders

## Definition of Done

This milestone is done when:

- unit anchors exist
- unit footprints exist
- individuals can follow loose formation slots
- units can detour, flow, halt, push, or engage at a basic level
- movement does not freeze or jitter in simple crowding scenarios
- recognisable recruit/veteran movement differences exist
- all movement behaviour is deterministic
- all core cases have headless tests
- debug output can explain why a unit or individual chose a movement style or mode