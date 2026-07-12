# Persistent Visual Test Suite

## Purpose

The visual test suite retains deterministic human-inspection scenarios for
accepted milestones. It exists to reveal visible behavioural regressions that
can be difficult to understand from state assertions alone.

Automated headless tests remain authoritative for correctness, determinism,
membership, and exact simulation rules. Human inspection supplements those
tests by checking battlefield readability, spatial coherence, transitions,
and whether accepted behaviour still looks recognisable.

These scenarios are regression assets. They must not silently drift to
showcase the latest feature. Change an accepted scenario only with an explicit
regression-harness or milestone correction task, and preserve its automated
coverage.

## Routes

Run `npm run dev`, then open:

| URL | Status | Useful ticks | Expected observations |
| --- | --- | ---: | --- |
| `/` | Evolving trunk application | N/A | Current main application, separate from retained visual tests. |
| `/test` | Visual test menu | N/A | Lists every registered visual test and starts no worker or renderer. |
| `/test?scenario=movement-behaviour` | Milestone 2 accepted | 0-120 | Formed march, ordered halt, formed detour, loose flow, halt-and-wait, disruptive push-through, and veteran stability versus recruit instability under equal pressure. |
| `/test?scenario=combat-foundation` | Milestone 3 accepted | 0-420 | Both fronts advance and engage at reach without interpenetrating; combat counters, pressure, and morale update; membership remains unchanged. |
| `/test?scenario=morale-inspection` | Milestone 4 accepted 2026-07-12 | 0-800 | Recruit breaks first, regular degrades faster than veteran, pass-through disrupts the reserve, routers flee before recovery, recovering units halt and reform, and the veteran pursuit subject returns to steady before the regular. |

Unknown scenario IDs show a clear error followed by the full menu. Scenario
pages include a **Back to visual test menu** link and start paused at tick 0;
use Resume or Step after reading the expected observations.

## Registry ownership

The stable registry is `src/content/visualTestRegistry.ts`. Each entry owns:

- stable scenario ID;
- title and milestone;
- short purpose;
- expected observations;
- recommended tick range;
- deterministic `SimulationScenario`.

The `/test` menu is generated directly from this registry. Browser routing is
kept in the small main-thread route-selection module; content files do not use
DOM or browser APIs, and simulation rules do not depend on routes.

## Adding a future visual test

1. Add or reuse deterministic scenario content under `src/content/`.
2. Add headless determinism and behavioural coverage for any new scenario.
3. Add exactly one stable registry entry with expectations and a tick range.
4. Confirm the menu link is generated from the registry; do not add a route
   switch case.
5. Run typecheck, tests, performance checks, build, and a browser inspection.
6. Record acceptance status and date without retuning earlier regression
   scenarios to demonstrate newer mechanics.

Screenshot automation is intentionally deferred. The current suite is a
manual human-inspection surface backed by deterministic headless tests.
