# Captains and Orders Design Doctrine

## Purpose

Captains should shape unit behaviour without becoming omniscient tactical supercomputers.

A captain generates unit intent. The unit translates intent into posture and movement. Individuals interpret that intent through local conditions, discipline, morale, and pressure.

## Core Rule

Captains choose intent.

Units provide momentum and cohesion.

Individuals provide behaviour.

## Captain Responsibilities

A captain may decide:

- what the unit is trying to do
- where the unit should move
- whether to hold, advance, charge, press, fall back, regroup, or retreat
- which local enemy or objective matters most

A captain should not decide every individual’s action.

## Unit Orders

Early order types should be limited to:

- holdObjective
- advanceToContact
- charge
- pressAdvantage
- fallBackFighting
- regroup
- retreat

Orders should be stable for a short period. Captains should not reconsider the whole battlefield every simulation tick.

## Captain Knowledge

Initial captain knowledge should be local and aggregated.

A captain may know:

- own unit cohesion
- own unit morale
- own unit casualties
- own unit average pressure
- current order
- mission objective
- objective distance
- visible nearby enemy units
- visible nearby allied units
- local advantage estimate
- flank pressure if locally visible
- time since last order change

A captain should not know the whole battlefield by default.

## Captain Traits

Captain traits may later include:

- aggression
- caution
- steadiness
- command clarity
- inspiration
- experience
- reaction delay

These traits should influence when orders change.

Examples:

- aggressive captains charge earlier and press advantage harder
- cautious captains preserve cohesion and fall back earlier
- steady captains follow mission priority and avoid needless order changes
- poor captains react late or change orders too often
- inspiring captains improve morale or cohesion nearby

## Orders Are Not Absolute

A captain order is not a commandment.

Individuals may fail to comply because of:

- fear
- pressure
- isolation
- low discipline
- blocked movement
- fatigue
- poor morale
- unclear formation
- enemy threat

A charge order may produce a clean surge from veterans, a ragged advance from recruits, or a failed hesitation from a shaken unit.

This is intended behaviour.

## Runners and Battlefield Information

Runner-based communication is a future feature, not an early requirement.

Later, runners may carry messages such as:

- enemy position reports
- objective status
- requests for support
- warnings about flank collapse
- orders from higher command

Runner messages may have:

- source
- target
- created tick
- expected arrival tick
- reliability
- urgency
- message type
- stale information

This should create command friction.

Do not implement runners until local captain behaviour is stable.

## Non-Goals for Early Captains

Do not implement:

- global battlefield awareness
- complex tactical planning
- multi-unit coordination
- runners
- signal systems
- personality-heavy command simulation
- detailed command hierarchy

Early captains should only convert local knowledge and mission into simple unit orders.