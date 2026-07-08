# Content Rules

This directory contains static scenario and configuration content.

Content files may define:

- scenario constants
- entity counts
- world bounds
- default seeds
- speed ranges
- data tables used by the simulation

Content files must not contain simulation systems.

Content files must not import PixiJS, DOM APIs, browser APIs, timers, or UI code.

Content should be deterministic and safe to import from tests, workers, and main-thread setup code.
