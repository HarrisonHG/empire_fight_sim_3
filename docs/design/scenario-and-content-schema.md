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
- explicit casualty-procedure kind (`citizen` or `barbarian`)
- explicit death-count policy
- trusted individual combat and medical qualifications
- starting generic-herb inventory overrides
- optional barbarian respawn destination anchors
- bounded inspection configuration

## Content Should Not Define

- simulation algorithms
- rendering behaviour
- hidden side effects
- bespoke code paths for one scenario
- non-deterministic behaviour

## Design Rule

If a scenario needs special behaviour, prefer adding a general simulation concept rather than hardcoding scenario-specific logic.


## Identity and Procedure Separation

Keep these concepts separate in scenario/content data:

```txt
team hostility
nation/faction flavour
unit identity
casualty procedure
death-count policy
medical qualification
```

A faction, colour, label, equipment profile or behaviour archetype must never imply citizen/barbarian casualty procedure. Scenarios assign that procedure explicitly until richer Milestone 17 content derives it.

## Existing Runtime Authorities

Later content milestones must adopt or migrate existing runtime authorities rather than create competing stores. Current examples include individual combat qualifications, Fortitude, casualty-procedure profiles, medical qualifications, generic herbs, traumatic wounds, limb disabilities and player-presence procedure.
