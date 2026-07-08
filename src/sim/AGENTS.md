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
