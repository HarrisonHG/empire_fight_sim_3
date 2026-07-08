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
