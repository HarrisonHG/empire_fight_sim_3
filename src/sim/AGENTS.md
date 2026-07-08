# Simulation Rules

This directory contains pure simulation code.

Forbidden here:

- PixiJS imports
- DOM APIs
- canvas APIs
- direct UI state
- browser event handlers
- frame-rate-dependent logic

All simulation logic must be deterministic and testable in Vitest.

Prefer simple data structures, explicit system order, stable entity IDs, and seeded RNG.

Hot paths should avoid unnecessary allocations.

## Behaviour and Movement Doctrine

Before adding or changing simulation behaviour, movement, morale, combat, perception, unit orders, or role logic, read the relevant files in `docs/design/`.

Simulation systems must remain explicit, deterministic, and testable.

Movement must not be produced by blending unlimited competing desires. Select one primary movement mode, then apply local avoidance, spacing, and stuck recovery.

Living entities must not be treated as A* obstacles.

Captains, units, and individuals must not use global battlefield knowledge unless that knowledge is explicitly represented by the simulation.