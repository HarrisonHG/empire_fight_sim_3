# Art Style Exploration Plan

## Goal

Create a small, static art-style exploration for the top-down 2D simulation. The exploration will compare three candidate visual directions using simple SVG sketches and, where useful, a standalone HTML/CSS comparison page. It will cover palette suggestions, top-down unit markers, terrain markers, and readability under high entity counts, then document which two or three directions are credible candidates for later review.

This is a docs/experiment milestone only. It does not select or implement a production art system.

## Source and Scope Constraints

- Follow `AGENTS.md`, `docs/codex/architecture.md`, `docs/codex/performance.md`, `docs/codex/review.md`, and `docs/codex/task-planning.md`.
- `docs/codex/performance.md`, `docs/codex/testing.md`, and `specs/art-style-exploration/spec.md` are currently empty. The explicit scope in the task request is therefore the controlling specification; no additional requirements should be inferred from those files.
- Apart from this plan, all later exploration output must be created only under `docs/art-style/` and `experiments/art-style/`.
- No production code, app wiring, dependencies, build configuration, or source-layer changes are permitted.

## Candidate Art Directions

The exploration will compare these three candidates:

1. **Tactical glyphs** — flat geometric markers with strong silhouettes, restrained detail, and status conveyed through shape, outline, and small directional cues. This is the baseline for maximum readability at high density.
2. **Heraldic tokens** — compact roundel or shield-like markers using faction fields, simple role emblems, and clear facing indicators. This tests whether more setting character can be retained without losing scanability.
3. **Minimal top-down figures** — abstract head/shoulder/body silhouettes with a single role or equipment cue. This tests a more representational direction while keeping forms simple enough for large formations.

The final comparison will recommend retaining two or three of these for further review. It will not declare a final production style.

## Non-goals

- Creating final art, polished illustrations, animation, sprite sheets, textures, or production-ready assets.
- Modifying anything under `src/sim/`, `src/worker/`, `src/render/`, or `src/ui/`.
- Wiring experiments into the application or importing application code into the experiments.
- Changing simulation state, snapshots, worker messages, entity data, camera behaviour, or rendering architecture.
- Adding JavaScript, build steps, packages, fonts, image libraries, or other dependencies.
- Measuring application rendering performance. Static density mockups can expose visual crowding but cannot establish runtime cost.
- Designing menus, HUDs, controls, debug overlays, or other general UI.
- Expanding the work into a complete terrain art system, map editor, faction identity system, or asset pipeline.

## Files to Create

Only the following files are planned for the exploration:

```txt
docs/art-style/
  palettes.md
  candidate-directions.md

experiments/art-style/
  index.html
  styles.css
  tactical-glyphs.svg
  heraldic-tokens.svg
  minimal-top-down-figures.svg
  terrain-markers.svg
  density-comparison.svg
```

File responsibilities:

- `docs/art-style/palettes.md`: propose a small set of palette roles and exact colour values for faction identity, selection, warning/status, neutral units, terrain, and background. Include colour-vision and greyscale considerations; colour must not be the only distinguishing signal.
- `docs/art-style/candidate-directions.md`: describe the three directions, record their trade-offs against the review criteria, and recommend the two or three candidates worth carrying forward.
- `experiments/art-style/index.html`: provide a standalone comparison surface that embeds or links the SVGs at consistent sizes and backgrounds. It must work without the application and without JavaScript.
- `experiments/art-style/styles.css`: provide only the layout, neutral comparison surfaces, captions, and responsive behaviour needed by `index.html`.
- The three candidate SVGs: show a small consistent marker set for each direction, including facing, faction distinction, a role distinction, selection, and a reduced-scale example.
- `experiments/art-style/terrain-markers.svg`: compare simple concepts for passable ground, rough ground, woodland, water or blocked terrain, and boundaries/objectives without attempting a full map style.
- `experiments/art-style/density-comparison.svg`: place the candidate markers over the same representative terrain and formation layouts at low, medium, and high density. Reuse SVG symbols with `<use>` where practical so the file remains simple and reviewable.

No additional files should be created without updating and re-accepting this plan.

## Architecture Impact

None. The work is isolated static documentation and experiments. It must not import, call, or modify simulation, worker, renderer, or UI code. The HTML/CSS mockup is an inspection aid, not an application prototype.

## Implementation Order

1. Create `docs/art-style/palettes.md` with palette roles, candidate colour values, contrast notes, and a check that faction/status distinctions also have shape or outline cues.
2. Create the three candidate SVGs using a shared comparison brief: identical canvas size, comparable marker footprint, the same example roles/states, and both light and dark or terrain-backed contexts where needed.
3. Create `terrain-markers.svg` with restrained terrain fills, patterns, edges, and objective/boundary concepts that remain subordinate to units.
4. Create `density-comparison.svg` using the same formations, scale, terrain, and palette roles for all three candidates. Include representative low-, medium-, and high-count scenes and overlap/clustering cases.
5. Create the standalone `index.html` and `styles.css` to present every SVG side by side at consistent scales. Keep the page static, responsive, and independent of project production code.
6. Review the artifacts in a browser and as standalone SVGs at normal size and reduced display size. Check colour and greyscale presentation and record any failures rather than polishing around them.
7. Create `docs/art-style/candidate-directions.md`, compare the candidates using the same criteria, and recommend the two or three strongest directions for human review. Preserve unresolved trade-offs and avoid selecting a final production style.
8. Perform a scope self-review against `docs/codex/review.md`, confirm that only the accepted paths changed, and stop for human review.

## Review Criteria

### Unit markers

- Faction/allegiance is readable quickly and is not communicated by hue alone.
- Facing remains identifiable at reduced size.
- At least one role distinction and selection/status state remains visible without excessive internal detail.
- Silhouettes remain distinct when units touch or partially overlap.
- The candidate remains recognisable on both quiet and visually varied terrain samples.

### Terrain markers

- Passable, rough, wooded, water/blocked, boundary, and objective concepts are distinguishable.
- Terrain establishes context without competing with unit markers for the strongest contrast.
- Patterns and edges do not become noise at reduced scale or under dense formations.
- Meaning does not depend on texture detail that disappears when zoomed out.

### High entity counts

- Each candidate is judged using the same marker footprint, layouts, backgrounds, and density bands.
- Formation shape, faction grouping, facing, and selected-unit emphasis remain scannable in the high-density panel.
- Dense scenes do not turn into an indistinguishable field of outlines, emblems, or high-saturation colour.
- The review explicitly distinguishes visual readability from runtime performance; no performance claim is made from static SVGs.

### Palette and presentation

- Suggested colours have documented semantic roles rather than being decorative swatches only.
- Critical distinctions survive a greyscale check and a basic colour-vision check.
- The HTML comparison loads locally with no missing assets, scripts, external fonts, or network requests.
- Every SVG opens independently and uses a suitable `viewBox` for consistent comparison.

### Recommendation

- The comparison records strengths, weaknesses, and failure modes for every candidate.
- The recommendation names two or three candidates and explains why they merit further review, with high-count readability weighted above decorative detail.
- Any recommendation remains provisional until human review; no production implementation is implied.

## Tests and Checks

No production or simulation tests are required because no production behaviour changes. Perform these checks instead:

- Open `experiments/art-style/index.html` locally and verify all comparison artifacts render without console or missing-file errors.
- Open each SVG independently and inspect normal and reduced display sizes.
- Inspect the density comparison for formation, allegiance, facing, overlap, and selected-unit readability.
- Inspect palette samples in colour and greyscale; use a basic colour-vision simulation if available without adding a project dependency.
- Run `git diff --check` and inspect `git status --short` to verify path and whitespace scope.
- Confirm no file under `src/` and no dependency or configuration file changed.

Running the project's typecheck, test, build, or performance commands is not necessary for this isolated static-art plan unless later implementation unexpectedly touches executable project files, which this plan forbids.

## Risks

- **Empty specification:** the spec currently supplies no detail beyond the task request. Mitigation: keep the milestone strictly within the enumerated scope and require human review before creating artifacts.
- **False performance conclusions:** a static SVG density scene does not model PixiJS sprite count, GPU load, worker messages, or garbage collection. Mitigation: label findings as visual-readability results only.
- **Over-detailed concepts:** heraldic or figurative detail may disappear at simulation scale. Mitigation: include reduced-size and overlap cases early, and prefer silhouette over internal decoration.
- **Colour dependence:** attractive faction palettes may fail for colour-vision deficiencies or greyscale viewing. Mitigation: pair colour with shape, border, pattern, or emblem differences and document checks.
- **Terrain competition:** texture and contrast can obscure units in dense scenes. Mitigation: reserve the highest contrast and saturation for units and selected/status cues.
- **Unfair comparison:** different marker sizes or scene layouts could bias the result. Mitigation: use consistent canvases, footprints, formation layouts, terrain, and density bands.
- **Prototype leakage:** an HTML mockup could be mistaken for proposed UI or app architecture. Mitigation: keep it static, dependency-free, clearly labelled as an inspection page, and disconnected from `src/`.
- **SVG portability:** browser rendering can vary slightly. Mitigation: use basic SVG primitives, local/system fonts only if text is unavoidable, and verify standalone display in the project’s normal browser environment.

## Done Criteria

This exploration milestone is done only when:

- All planned artifacts exist, and no unplanned artifact has been added.
- All exploration output is confined to `docs/art-style/` and `experiments/art-style/`.
- The three candidate directions have comparable simple SVG sketches.
- Palette suggestions include semantic roles, exact values, and accessibility/readability notes.
- Unit-marker concepts cover faction, facing, role, selection/status, reduced scale, and overlap.
- Terrain-marker concepts cover the agreed small set without expanding into a full terrain system.
- A consistent density comparison documents readability at low, medium, and high entity counts.
- `candidate-directions.md` recommends two or three candidates for human review and explains the trade-offs.
- The standalone HTML/CSS comparison, if retained, works locally without JavaScript, external resources, application wiring, or dependencies.
- No production code, source layer, dependency manifest, build configuration, or app integration has changed.
- The scope self-review and static checks pass.
- The user has reviewed the artifacts; no further implementation is implied by completion of this plan.
