# Rendering Rules

This directory contains PixiJS rendering code only.

Rendering code may read snapshots from the simulation.

Rendering code must not directly mutate simulation state.

Do not destroy and recreate all sprites every frame.

Use sprite pooling or stable sprite maps keyed by EntityId.

Debug overlays must be possible to disable.

If rendering becomes slow, measure sprite count, update count, debug overlay cost, and GPU load before changing simulation code.