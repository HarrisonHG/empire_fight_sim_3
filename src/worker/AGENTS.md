# Worker Boundary Rules

This directory manages communication between the main thread and simulation worker.

The worker owns the simulation.

The main thread sends commands.

The worker returns snapshots, events, and metrics.

Keep messages compact.

Do not send the full world every frame if a smaller snapshot or delta is sufficient.

Track worker tick time and message size as performance metrics.