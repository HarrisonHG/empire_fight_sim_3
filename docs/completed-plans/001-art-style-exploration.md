# Art Style Exploration Plan

## Goal

Produce a small, static comparison of three candidate art directions for a top-down 2D simulation. The exploration will use simple SVG sketches, palette notes, and—only if it materially improves comparison—a standalone HTML/CSS page. It will test top-down unit markers, terrain markers, and visual readability at high entity counts, then recommend two or three directions for further review.

This is an exploration spike. It will not select a final production style or change the application.

## Non-goals

- Production-ready art, sprites, animation, textures, asset pipelines, or rendering systems.
- Changes to production code or anything under `src/sim/`, `src/worker/`, `src/render/`, or `src/ui/`.
- App wiring, PixiJS experiments, JavaScript behaviour, build configuration, or new dependencies.
- Simulation, worker protocol, entity storage, gameplay, or performance-critical changes.
- UI, HUD, menu, camera, or interaction design.
- Runtime performance conclusions; static mockups assess visual readability only.
- A final art-direction decision.

## Candidate Art Directions to Explore

1. **Tactical glyphs**: flat geometric shapes with strong silhouettes, minimal internal detail, and explicit facing cues. This is the high-density readability baseline.
2. **Heraldic tokens**: compact shield or roundel forms with restrained role emblems, faction fields, and clear outlines. This tests setting character without relying on small illustrative detail.
3. **Abstract top-down figures**: simplified head/body or equipment silhouettes viewed from above, using one strong role cue and a clear facing direction. This tests a more representational option at simulation scale.

The final recommendation will retain the strongest two or three candidates. It will record trade-offs rather than declare a production choice.

## Files to Create

Implementation may create only these exploration files:

```txt
docs/art-style/
  palettes.md
  recommendations.md

experiments/art-style/
  tactical-glyphs.svg
  heraldic-tokens.svg
  abstract-top-down-figures.svg
  terrain-markers.svg
  density-comparison.svg
  index.html       # optional; create only if side-by-side review needs it
  styles.css       # optional; create only with index.html
```

Responsibilities:

- `palettes.md`: exact colour suggestions and semantic roles for background, terrain, factions, neutral units, selection, and warnings; include contrast, greyscale, and colour-vision considerations.
- `recommendations.md`: compare all three directions against the same criteria and recommend two or three for further review.
- Candidate SVGs: show comparable unit markers with faction, facing, role, selection/status, reduced-size, and partial-overlap examples.
- `terrain-markers.svg`: show restrained concepts for open/passable ground, rough ground, woodland, water/blocked terrain, boundaries, and objectives.
- `density-comparison.svg`: place each candidate in equivalent low-, medium-, and high-density scenes over the same terrain treatment.
- Optional `index.html` and `styles.css`: provide a dependency-free, script-free comparison surface. They must remain standalone and must not import application code.

No other exploration files may be added without revising and re-accepting this plan. Other than this plan, all output must remain under `docs/art-style/` or `experiments/art-style/`.

## Architecture Impact

None. The work consists only of static documentation and standalone visual experiments. It does not cross the simulation, worker, renderer, or UI boundaries described in `docs/codex/architecture.md`. It makes no runtime-performance claim under `docs/codex/performance.md` and introduces no behaviour requiring the headless test rules in `docs/codex/testing.md`.

## Implementation Order

1. Create `docs/art-style/palettes.md` with a small set of semantic palette roles and exact values. Establish up front that faction and state distinctions must also use shape, outline, or emblem cues.
2. Create the three candidate unit-marker SVGs against one comparison brief: identical canvas dimensions, marker footprints, example factions, roles, facing, states, backgrounds, reduced sizes, and overlap cases.
3. Create `terrain-markers.svg`, keeping terrain contrast and detail subordinate to units.
4. Create `density-comparison.svg` with equivalent formations and terrain at low, medium, and high entity counts. Include clustering and partial overlap so failure modes are visible.
5. Create `index.html` and `styles.css` only if reviewing the SVGs independently does not provide a clear side-by-side comparison. If created, use no scripts, external resources, or application imports.
6. Review the SVGs at normal and reduced display sizes, in colour and greyscale, and on representative terrain. Record failures rather than hiding them through direction-specific presentation changes.
7. Create `docs/art-style/recommendations.md`, rank the three candidates using the review criteria below, and recommend the strongest two or three for human review.
8. Perform the scope checks from `docs/codex/review.md`; confirm that no files outside the accepted plan paths changed and stop for human review.

No art files will be created until this plan is accepted.

## Review Criteria

### Unit markers

- Faction is distinguishable quickly and does not depend on hue alone.
- Facing is clear at reduced size.
- Role and selection/status cues survive reduction without excessive internal detail.
- Silhouettes remain distinguishable when markers touch or partially overlap.
- Markers remain readable on both quiet and patterned terrain.

### Terrain markers

- Open ground, rough ground, woodland, water/blocked terrain, boundaries, and objectives are distinguishable.
- Terrain remains visually subordinate to units.
- Patterns and edges do not become noise at reduced scale or high density.
- Meanings do not rely on details that disappear when zoomed out.

### High entity counts

- All directions are compared with the same scale, formations, density bands, and backgrounds.
- Faction grouping, formation shape, facing, and selected-unit emphasis remain scannable in the high-density case.
- Dense scenes do not collapse into a field of outlines, emblems, or saturated colour.
- Findings are explicitly described as visual-readability results, not runtime performance measurements.

### Palettes and recommendation

- Each colour has a documented semantic role.
- Critical distinctions remain understandable in greyscale and under a basic colour-vision check.
- Strengths, weaknesses, and failure modes are recorded for every candidate.
- The recommendation names two or three candidates and explains why they merit further review, weighting high-count readability above decorative detail.

## Checks

- Open each SVG independently and inspect it at normal and reduced size.
- If the optional HTML/CSS mockup exists, open it locally and confirm all assets load without scripts, network requests, or console errors.
- Compare all density panels for faction, formation, facing, overlap, and selection readability.
- Inspect palette samples in colour and greyscale; use a basic colour-vision simulation only if it requires no project dependency.
- Run `git diff --check` and inspect `git status --short`.
- Confirm no files under `src/`, dependency manifests, build configuration, or app integration changed.

Project typecheck, test, build, and performance commands are not required for static documentation and SVG/HTML/CSS artifacts because no executable project files may change.

## Risks

- **Detail loss at simulation scale:** heraldic or figurative details may disappear. Mitigation: test reduced-size and overlap cases from the first sketches.
- **Colour dependence:** attractive palettes may fail in greyscale or for colour-vision deficiencies. Mitigation: pair colour with silhouette, border, pattern, or emblem differences.
- **Terrain competition:** terrain texture can obscure units. Mitigation: reserve the strongest contrast and saturation for units and state cues.
- **Biased comparison:** different scales or layouts can make one direction appear stronger. Mitigation: use identical canvases, marker footprints, formations, terrain, and density bands.
- **False performance conclusions:** SVG density mockups do not measure rendering CPU, GPU load, sprite count, garbage collection, or worker message size. Mitigation: report only visual-readability findings.
- **Prototype leakage:** a standalone HTML page could be mistaken for application UI. Mitigation: create it only if useful, label it as a comparison page, and keep it disconnected from production code.
- **Scope expansion:** exploration can drift into polished art or production architecture. Mitigation: restrict creation to the enumerated files and require a new accepted plan for any expansion.

## Done Criteria

- All accepted exploration artifacts exist only under `docs/art-style/` and `experiments/art-style/`.
- Three simple, directly comparable unit-marker directions have been explored in SVG.
- Terrain-marker concepts cover only the agreed terrain and map-marker categories.
- Palette suggestions include exact values, semantic roles, and accessibility/readability notes.
- The density comparison covers low, medium, and high entity counts using equivalent scenes.
- Unit concepts demonstrate faction, facing, role, selection/status, reduced scale, and overlap.
- `recommendations.md` recommends two or three candidates and documents the evidence and trade-offs.
- Any optional HTML/CSS mockup works standalone without JavaScript, external resources, dependencies, or app wiring.
- No production code, `src/` layer, dependency manifest, build configuration, or application integration has changed.
- Static visual checks and the scope self-review pass.
- The user has reviewed the completed exploration; no production implementation is implied.
