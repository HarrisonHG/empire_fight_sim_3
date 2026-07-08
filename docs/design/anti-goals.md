# Anti-Goals

This project should not become:

- a Phaser game
- a general-purpose game engine
- a visual-first battle toy
- an RTS clone
- an animation project
- a physics simulation
- an omniscient tactical AI sandbox
- a content-heavy rules encyclopedia
- a pile of special cases
- a random-number-driven combat viewer

## Forbidden Design Directions

Do not:
- model living entities as A* obstacles
- use frame delta time for simulation outcomes
- make individuals globally smart
- allow captains global battlefield awareness by default
- make combat primarily random attack/block rolls
- implement every Empire rule before the core behaviour works
- use visual success as proof of simulation correctness
- add detailed magic before mundane movement and morale work
- add complex terrain before basic unit movement is stable
- allow systems to silently fight over movement direction

## Design Rule

The project should remain boring, deterministic, inspectable, and fast.