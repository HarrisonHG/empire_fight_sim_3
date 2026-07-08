# Art Style Exploration Spec

## Overview

Explore simple visual styles for the top-down 2D simulation.

This is an exploration spike only. It must not affect simulation architecture, worker protocol, entity storage, or renderer performance.

## Goal

Create a small set of simple static visual concepts that could later inform the game's art direction.

Codex may produce:

- simple SVG sketches
- simple HTML/CSS mockups
- simple PixiJS drawing experiments
- palette suggestions
- visual language notes
- rough top-down unit markers
- rough terrain markers
- UI mood examples

## Non-Goals

This spike must not include:

- sprite handling systems
- animation systems
- asset pipelines
- production rendering architecture
- gameplay logic
- simulation changes
- worker changes
- performance-critical code

## Constraints

The visuals should support a top-down 2D simulation with many entities.

The style should remain readable at high entity counts.

Prefer simple shapes, strong silhouettes, clear faction/team distinction, and low visual noise.

## Output

The spike should produce files under:

```txt
docs/art-style/
experiments/art-style/