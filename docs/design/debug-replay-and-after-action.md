# Debug, Replay, and After-Action Design Doctrine

## Purpose

The simulation must be inspectable.

A result is only useful if the user can understand why it happened.

## Replay

Given the same seed, scenario, command sequence, and tick count, the simulation must produce the same result.

Replay should support:

- pause
- step tick
- inspect entity
- inspect unit
- inspect captain order history
- inspect morale/cohesion changes
- inspect combat events

## Debug Views

Useful debug overlays include:

- entity IDs
- unit IDs
- unit anchors
- unit footprints
- formation slots
- current movement modes
- current unit orders
- pressure/confidence/morale
- stuck states
- target enemy/ally
- spatial grid cells
- character lifecycle and player presence
- death-count duration, remaining ticks and pause owner
- assistance/drag-group phase, helpers and destination
- current medical claim, treatment action and progress
- herb current/reserved values
- traumatic-wound and limb-disability state
- execution commitment and terminal cause

## Event Logs

Significant events should be optionally loggable.

Examples:

- unit order changed
- unit cohesion changed sharply
- entity became stuck
- entity recovered from stuck state
- entity routed
- unit entered looseFlow
- unit pushed through another unit
- captain changed order
- objective became contested
- morale dropped due to nearby rout
- individual reached zero hits or became terminal
- death count paused, resumed, expired, or restarted for a later dying episode
- rescue group requested, formed, promoted, cancelled, handed off, or reached safety
- medical claim created, updated, cleared, or reassigned
- treatment started, interrupted, completed, or reassessed
- herb reserved, released, or consumed
- traumatic wound triggered or treated
- limb disability applied or cleared
- execution started, interrupted, or completed
- player presence entered terminal comfort, respawn egress, or waiting state

## After-Action Reports

Reports should explain:

- who won
- why they won
- when major changes happened
- which units held or collapsed
- which roles performed well or poorly
- where cohesion failed
- how morale changed
- whether objectives were achieved

## Design Rule

If the simulation cannot explain an outcome, the outcome is not yet useful.
