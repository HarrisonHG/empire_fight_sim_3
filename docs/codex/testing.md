# Testing Doctrine

## Goal

The simulation must be testable without rendering.

Most logic bugs should be reproducible in headless tests.

If a bug only appears visually, create a small deterministic scenario that reproduces it.

## Required Test Types

Use Vitest.

Required test categories:

- determinism
- fixed tick behaviour
- seeded RNG
- entity/component storage
- movement
- spatial grid
- worker protocol
- snapshot generation
- performance scenarios
- regression tests

## Determinism Tests

The most important test is deterministic replay.

Given the same:

- seed
- scenario
- command sequence
- tick count

The final simulation summary must be identical.

Use a stable serialisable or byte-comparable summary for determinism tests.

Do not compare renderer state.

## Regression Tests

Every bug fix must include a regression test.

If a bug cannot be tested yet, first build the smallest harness needed to test it.

Do not fix simulation bugs only by visually testing in the browser.

## Performance Tests

Create automated performance scenarios.

They do not need to be perfect benchmarks, but they must catch obvious disasters.

Minimum useful scenarios:

- 100 moving entities
- 500 moving entities
- 1000 moving entities
- 2000 simplified moving entities

Each should record:

- average tick time
- p95 tick time
- maximum tick time
- entity count
- tick count
- seed

Performance thresholds should be structural in CI and stricter on an agreed local/reference machine.

Automated tests should avoid tight timing assertions that make hardware speed a source of flaky failures.

## Worker Tests

Worker protocol should be tested separately from PixiJS rendering.

Test that commands sent to the worker produce expected snapshots, metrics, state messages, and errors.

Do not require the renderer to test simulation correctness.

## Browser Checks

For browser-visible changes, run the app and check:

- no console errors
- expected controls are visible
- expected visual state changes occur
- buttons enable and disable correctly
- no obvious frame drops
- no runaway UI behaviour
- no obvious memory or DOM growth

Browser checks are useful, but they do not replace headless tests.

## Test Commands

Expected project commands:

- npm test
- npm run typecheck
- npm run build
- npm run perf

Use npm run dev for manual browser verification.

## Done Criteria

A simulation feature is not done unless:

- it has headless tests
- it is deterministic
- it can be replayed
- it does not require PixiJS to validate
- it does not break performance scenarios

A UI or renderer feature is not done unless:

- typecheck passes
- tests pass
- build passes
- the browser has been checked manually when behaviour is visible

## Review Principle

Visual confirmation is evidence.

Automated tests are evidence.

Performance metrics are evidence.

A confident Codex summary is not evidence unless backed by checks.