# Unit Movement Design Doctrine

## Purpose

Unit movement exists to make groups behave like groups without forcing every individual to solve a full tactical pathfinding problem.

The simulation should avoid the failure mode where every entity has many competing reasons to move in different directions and becomes stuck, jittery, or computationally expensive.

## Core Model

A unit is represented by:

- an invisible anchor
- a heading
- a footprint
- formation slots
- cohesion
- current order
- current movement style

The anchor is not a real fighter. It is a coded reference point representing the unit’s intended organisation.

The footprint is the approximate space occupied by the unit.

The formation slots are preferred individual positions relative to the anchor.

Individuals are real entities. Anchors and footprints are organisational tools.

## Unit Footprints

A unit should not be treated as a point.

A unit footprint should describe approximate occupied space using a simple shape, such as a circle, oval, rectangle, or capsule.

The footprint should include:

- centre position
- heading
- width
- depth
- hard occupied area
- soft buffer area
- engagement or threat area where relevant

Other units use this footprint for high-level movement decisions.

Individuals still use local avoidance and spacing against actual nearby bodies.

## Zones

Use three conceptual zones.

### Hard Zone

The area occupied by actual bodies.

Entering this zone means physical crowding, collision, melee contact, or push-through.

### Soft Zone

The area around the unit that represents formation buffer, personal space, and manoeuvre room.

Formed units should normally avoid entering another unit’s soft zone unless ordered otherwise.

### Engagement Zone

The area where weapons, pressure, and threat matter.

Enemy engagement zones may discourage approach, trigger combat behaviour, or cause morale/pressure changes.

## Movement Styles

A unit chooses one movement style when another unit footprint affects its route.

### formedDetour

The unit preserves formation and moves around the blocking footprint.

### looseFlow

The unit loosens formation and allows individuals to pass around the blocker while retaining shared direction and identity.

### pushThrough

The unit violates occupied space and accepts cohesion damage, confusion, and pressure.

### haltAndWait

The unit stops because movement through or around the blocker is not sensible.

### engageFront

The unit treats the hostile footprint as the target and enters combat contact.

## Static vs Dynamic Obstacles

Static terrain may be used in A* pathfinding.

Living entities must not be treated as A* obstacles.

Allies and enemies are dynamic bodies. They move too frequently, and pathing around them causes stale routes, oscillation, and deadlock.

Use local avoidance, spacing, yielding, and unit-level footprint decisions instead.

## Individual Movement Modes

Each individual has exactly one primary movement mode at a time.

Allowed modes should remain small and explicit:

- holdPosition
- moveToFormationSlot
- advanceWithUnit
- closeToAttack
- maintainReach
- fallBackWithUnit
- regroup
- rout
- sidestepUnstuck

Local avoidance may adjust movement, but it must not replace the selected mode’s goal.

## Collision and Spacing

Collision and spacing resolution must be separate from intent selection.

Intent decides where an entity wants to go.

Movement applies the desired movement.

Spacing prevents illegal overlap.

Stuck handling responds when movement repeatedly fails.

Do not combine these into one movement AI system.

## Stuckness

Stuckness is expected and must be visible.

Entities should track failed progress. If blocked for too long, they may:

- slow down
- hold position
- sidestep
- yield
- request slot reassignment
- regroup
- rout if morale is broken

A stuck entity should produce debug information explaining the cause and chosen recovery behaviour.

## Priority and Yielding

Not all movement has equal priority.

Example priorities:

- routing fighter: high disruption priority
- charging front-rank fighter: high priority
- captain or banner: high priority
- formed front-rank fighter: medium priority
- rear-rank recruit: low priority
- idle or regrouping fighter: low priority

Priority determines who yields first. It must not allow entities to pass illegally through each other without cost.

## Design Rule

Movement is not the sum of unlimited competing desires.

Movement is:

1. one selected mode
2. one desired movement
3. local adjustment
4. spacing resolution
5. stuck recovery