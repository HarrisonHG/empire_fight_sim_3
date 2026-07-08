# Scenario and Content Schema Design Doctrine

## Purpose

Scenarios should be configurable data, not hardcoded simulation logic.

Content files should define starting conditions, not special-case rules buried inside systems.

## Scenario Data Should Define

- seed
- map dimensions
- terrain
- objectives
- factions
- units
- unit roles/loadouts
- captain traits
- starting positions
- initial orders
- victory conditions
- optional scripted events

## Content Should Not Define

- simulation algorithms
- rendering behaviour
- hidden side effects
- bespoke code paths for one scenario
- non-deterministic behaviour

## Design Rule

If a scenario needs special behaviour, prefer adding a general simulation concept rather than hardcoding scenario-specific logic.
