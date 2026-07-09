# Design Decision Record: Behaviour Priorities and Battlefield Feel

## Purpose

This simulation should model recognisable fighting-force behaviour first, then use that behaviour to support prediction and tactical experimentation.

The highest priorities are:

1. recognisable individual fighter behaviour
2. approximate outcome prediction
3. testing tactics and orders

The simulation should not primarily be a hit-point exchange model. Combat should mainly be about positioning, blocking, pressure, morale, role behaviour, and unit cohesion.

## Citizens and Barbarians

Empire citizens and barbarians should behave differently.

Citizens should normally break and flee as a unit before dying.

Barbarians should normally become increasingly reckless and are more likely to die before fleeing.

This distinction should affect morale, aggression, routing, and captain/order behaviour.

## Movement Around Friendly Units

When a formed unit is blocked by another friendly unit, behaviour depends on discipline and captain aggression.

Default preference order:

1. detour around as a whole unit
2. loosen formation and flow around
3. halt and wait
4. push through and disrupt both units
5. give up and choose a new task

Push-through should be rare and costly.

Friendly push-through is acceptable mainly when:

* the unit is routing
* there is an emergency reinforcement need
* the captain explicitly orders it
* the unit is reckless or low-discipline

Skirmishers should not push through friendly units. They should route around, spread out, and blob.

## Formation Behaviour

Formation strictness depends heavily on unit discipline, pressure, and troop type.

When there is no enemy pressure, units tend to organise themselves while static. More disciplined individuals help the unit settle into better shape.

When moving, most Empire citizens tend to blob unless they are exceptionally disciplined.

When contact is met, whole-unit discipline matters more. Low-discipline units should deform, hesitate, compress, or blob more readily.

Heavy troops prefer formed lines when static or in contact.

Skirmishers prefer loose blobs, flanking movement, and hit-and-run behaviour.

## Overtaking and Yielding

Less confident fighters tend to give way to more confident fighters and higher-ranking individuals.

Normal movement rules:

* rear-rank fighters should almost never overtake
* veterans may step into gaps
* captains may move through their unit slowly
* routing fighters may force through and disrupt others
* skirmishers should spread and route around rather than push through

Confidence, rank, discipline, and current movement state should affect who yields.

## Recruit and Veteran Behaviour

The most important recruit/veteran differences are:

* recruits avoid being first forward
* recruits panic, back off, or degrade when isolated
* recruits overreact to pressure
* veterans recover from pressure faster
* veterans hold formation under threat better

Recruits should copy nearby allies more than veterans.

Veterans should pay more attention to the broader local fight and push advantages more readily.

## Defence and Combat Feel

Most first attacks should be blocked if seen.

Defence should fail mainly because of:

* repeated pressure
* being flanked
* being outnumbered
* being unable to recover
* being badly positioned

Tiredness should affect movement and aggression more than basic defensive instinct. Adrenaline should make basic defence fairly reliable, especially against the first clear attack.

Combat should involve fighters standing just outside enemy weapon range, lunging in to attack, then recovering or stepping out again.

A captain-ordered charge is a distinct exception: it should cause more direct closing behaviour.

## Attack Behaviour

There are two separate behaviours:

1. moving into attack position
2. actually swinging or committing to an attack

Fighters usually hover just outside enemy weapon range unless ordered to charge or given a strong opportunity.

Attacking is encouraged by:

* captain or unit order
* enemy being in range
* nearby allies also attacking
* visible enemy vulnerability, especially for veterans
* reckless/panicked behaviour in reckless fighters

Veterans should exploit openings better than recruits.

Reckless fighters may attack when they should not.

## Morale Collapse

Morale collapse should happen in stages.

From least scared to most scared:

1. clings closer to allies
2. hesitates
3. breaks formation
4. spreads fear or morale damage nearby
5. ignores captain order
6. routs

People should show fear and failure before outright fleeing or refusing orders.

Morale is recoverable.

Given several minutes with little or no pressure, most fighters except the freshest recruits should recover morale.

Morale recovery is helped by:

* nearby non-routing banners
* nearby captains
* nearby allies
* reduced enemy pressure
* time to regroup

## Objectives

Citizens and barbarians treat objectives differently.

Barbarians are more likely to hold objectives almost to destruction.

Citizens are more likely to fall back if casualties, pressure, or cohesion loss become too severe.

Captain personality should modify this. Aggressive or stubborn captains hold longer. Cautious captains preserve the unit earlier.

## Knowledge and Perception

Knowledge depends on experience and role.

Recruits know only immediate nearby threats and allies. They mostly follow along.

Normal fighters know local information and current unit order.

Veterans know local information, unit order, and visible nearby unit state because they pay better attention.

Captains know more than individuals but are still not omniscient.

No one gets broad battlefield awareness until runners, scouts, or explicit communication systems exist.

## After-Action Report Priority

After-action reporting should prioritise:

1. objective control timeline
2. casualties by unit
3. morale and cohesion timeline
4. captain order history
5. role performance
6. which unit broke first
7. why a unit broke
8. what changed the battle
9. suggestions for different composition or tactics
10. notable individual moments

Individual stories are useful flavour, but objective control, casualties, morale, cohesion, and orders are more important for learning.

## Truth Tests

The simulation should satisfy these qualitative expectations:

* a disciplined veteran unit should outperform an equally sized, well-equipped recruit unit
* citizens should normally break and flee as a unit before dying
* barbarians should normally become more reckless and die before fleeing
* veterans should recover from pressure and push advantages more readily than recruits
* recruits should copy nearby allies more than veterans
* captains should guide units either to objectives directly or to support units pursuing objectives
* heavy infantry should prefer formed lines, disciplined marches, and being stuck in combat
* skirmishers should prefer loose blobs, flanking manoeuvres, and hit-and-run behaviour
* rangers should maintain significant distance from enemies and prefer low-armour targets
* physicks and banner bearers should hover near the unit centre while backing away from allies and enemies to create space
* combat should primarily be about positioning, blocking, morale, and pressure rather than hit points
