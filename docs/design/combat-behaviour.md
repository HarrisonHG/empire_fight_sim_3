# Combat Behaviour Design Doctrine

## Purpose

The simulation should represent recognisable field behaviour, not video game combat abstractions.

The goal is to model why a fighting group behaves well or badly under pressure.

The simulation does not need to perfectly predict real combat. It should support useful theoretical learning between events by making behaviour inspectable, deterministic, and plausible.

## Core Principle

Individuals make decisions.

Units shape those decisions.

Captains set intent.

The battlefield applies pressure.

Do not model fighters as hit point sponges with random block chances.

## Recognisable Individuals

The first acceptance target for behaviour is recognisability.

A recruit should look like a recruit.

A veteran should look like a veteran.

A reckless fighter should look reckless.

A disciplined fighter should look disciplined.

This does not require complex intelligence. It requires simple traits that affect action selection under pressure.

## Core Traits

Useful individual traits include:

- bravery
- discipline
- aggression
- patience
- combat skill
- confidence
- fatigue
- current pressure
- isolation

These traits should affect behaviour, not just numeric success chances.

For example:

- bravery affects willingness to close or hold while threatened
- discipline affects obedience to unit posture and formation
- aggression affects likelihood of overcommitting or pressing
- patience affects whether a fighter waits for openings
- combat skill affects recovery, reading threats, and chaining actions
- pressure affects hesitation, mistakes, backing up, or routing

## Group Influence

A fighter’s behaviour should change depending on group context.

A recruit in a stable line may behave sensibly most of the time.

The same recruit isolated from allies may hesitate, retreat, panic, or make a foolish charge depending on bravery and pressure.

Group influence should depend on:

- unit cohesion
- nearby ally support
- command clarity
- personal discipline
- isolation
- morale
- pressure

Cohesion determines how strongly group behaviour suppresses individual chaos.

## Blocking and Parrying

Avoid modelling defence as simple random block chance.

Most fighters can block or parry the first obvious incoming attack if:

- they are facing the attacker
- they are not recovering
- they are not flanked
- they have guard available
- the attack is inside their defended arc

The interesting behaviour happens after the first defence.

The simulation should care about:

- recovery
- pressure
- tempo
- confidence
- repeated attacks
- being flanked
- being crowded
- reading attacks
- ability to answer after defending

## Pressure

Pressure is a key behavioural state.

Pressure should increase when a fighter is:

- attacked repeatedly
- outnumbered locally
- isolated
- flanked
- pushed back
- near routing allies
- unable to maintain role distance
- unable to obey unit order

Pressure should affect:

- hesitation
- movement choice
- attack timing
- defence reliability after repeated exchanges
- morale loss
- chance of backing up or routing

## Role Behaviour

Roles should shape preferred distance and movement.

Examples:

- spear fighters prefer maintaining reach
- shield fighters may close distance when confidence and order allow
- recruits avoid being first forward
- veterans can step into gaps
- reckless fighters overcommit more often
- disciplined fighters maintain formation better

Role behaviour must still be affected by fear, pressure, cohesion, and captain order.

A shield fighter should not automatically rush a spear just because theory says it is correct. Hesitation, fear, confidence, local ally support, and personal aggression matter.

## Behaviour Rule

Do not make behaviour globally smart too early.

Individuals should act on local perception and unit intent, not omniscient battlefield knowledge.

A fighter should not know the battle is going well elsewhere unless that information is represented through nearby allies, captain orders, or later battlefield communication systems.

## First Behaviour Target

The first useful behaviour target is:

- a recruit holds position in a group
- a recruit does not step forward first when holding
- a recruit degrades when isolated
- a veteran holds formation under pressure longer
- a reckless fighter is more likely to overcommit
- a spear tries to maintain reach
- a shield closes only when confidence/order allows it

This is enough to start producing recognisable behaviour without building the whole war.