# UI Rules

This directory contains browser UI code only.

UI code may:

- create and update DOM controls
- display worker state
- display metrics
- send typed commands through the worker client

UI code must not contain simulation rules.

UI code must not directly mutate simulation state.

UI state is not authoritative. Worker state messages are authoritative.

Keep UI minimal and functional until the simulation foundation is stable.