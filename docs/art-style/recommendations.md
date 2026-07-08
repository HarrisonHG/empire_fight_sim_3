# Art Style Exploration Recommendations

## Decision

**Preferred direction: Heraldic tokens.**

Heraldic tokens provide the best overall balance of readability, setting flavour, faction distinction, role signalling, and high-density scanning. The production visual language should simulate units through tasteful heraldic battlefield tokens rather than literal people.

Tactical glyphs are retained as the fallback readability principle, especially at reduced scale and in high-density situations. Their geometry-first treatment should inform how Heraldic tokens simplify when detail no longer reads.

Abstract top-down figures are rejected for now. Human silhouettes are harder to make readable at simulation scale, and their multipart forms and equipment cues risk becoming visually noisy as entity counts rise.

## Scope

This comparison covers static visual readability only. The human decision above selects the preferred visual direction, but it does not define a production implementation and does not provide evidence about PixiJS, GPU load, sprite count, worker messages, garbage collection, or application performance.

The three directions were compared with the same palette roles, marker footprint, example factions, facing changes, role/state requirements, reduced-size steps, overlap cluster, terrain treatment, and density layouts.

## What each direction is trying to prove

### Tactical glyphs

Prove that a geometry-first language can carry the most important information with the fewest marks. Clipped-square versus pentagonal faction silhouettes, an asymmetric facing nose, hard outline, and external selection ring are intended to survive when role detail disappears.

### Heraldic tokens

Prove that setting identity can be added without giving up the structural strengths of a token. Roundel versus heater-shield silhouettes and pale versus bend field divisions duplicate faction colour, while a top pennon carries facing.

### Abstract top-down figures

Prove that units can read as people rather than counters using only body mass, an offset head/plume, shoulder shape, and one external equipment cue. This is the most representational direction and therefore the strongest test of detail loss and overlap.

## Comparison

| Review criterion | Tactical glyphs | Heraldic tokens | Abstract top-down figures |
| --- | --- | --- | --- |
| Faction without hue | Strong: outer geometry changes clearly | Strong: silhouette and field division both change | Moderate: shoulder differences are present but subtle at reduced size |
| Facing at reduced size | Strong: large asymmetric nose | Good: pennon survives, though it competes with shield detail | Good: offset head/plume reads naturally |
| Role cue | Good at normal size; intentionally secondary when reduced | Good at normal size; emblem becomes busy sooner | Strong at normal size because equipment extends outside the body |
| Selection/status | Strong: external ring and geometric status marks remain separate | Strong: external ring is clear against the compact shield | Strong in isolation; projecting equipment can compete with state marks |
| Partial overlap | Strong: hard edges and compact footprint remain separable | Good: silhouettes remain readable, field divisions add noise | Weakest: heads, shoulders, and equipment merge across neighbours |
| Varied terrain | Strong: ink keyline and simple fill resist terrain noise | Good: outline holds, but internal fields compete on woodland | Moderate: the multipart silhouette is most sensitive to textured terrain |
| High-density scanning | Strongest: faction blocks and formation angle read first | Good: faction blocks remain clear, with more internal visual activity | Moderate: reads as a mass of people, but individual facing and faction shape degrade first |
| Character | Functional and deliberately abstract | Strongest connection to a heraldic setting | Strong human presence, but less distinctive faction language |

## Palette and greyscale findings

- Azure `#16697A` and Crimson `#B23A48` become similar mid-values in greyscale. All three concepts therefore require their non-colour faction cue; hue alone is insufficient.
- Tactical outer shapes and heraldic shield/field structures survive greyscale most reliably.
- The abstract figures retain body/head separation, but Azure squared shoulders versus Crimson swept shoulders need more space than the smallest marker affords.
- Selection `#FFD166` remains a bright value cue, with an ink keyline to preserve it on open ground.
- Terrain values are intentionally compressed. Unit ink `#182126` carries the strongest edge, while boundaries use dashes and objectives use a diamond rather than depending on brown/gold hue.

## Recommendation

Proceed with **Heraldic tokens** as the preferred art direction.

1. **Heraldic tokens — preferred.** They offer the best balance across readability, setting flavour, faction distinction, role signalling, and high-density scanning. Future visual work should represent units as tasteful heraldic battlefield tokens, using compact silhouettes and restrained field divisions rather than literal people.
2. **Tactical glyphs — fallback readability principle.** Their hard geometry, compact footprint, and clear facing cues remain the reference when Heraldic tokens must simplify for reduced scale or very high density. Tactical clarity should be incorporated as a constraint on the preferred direction, not developed as a competing production style.
3. **Abstract top-down figures — rejected for now.** Human silhouettes and projecting equipment are harder to keep readable at simulation scale and become noisy under overlap. This direction should not guide the production unit language unless later evidence changes those constraints.

The decision favours the overall balance of Heraldic tokens even though Tactical glyphs remain strongest on pure reduced-scale readability. Later token design should therefore remove or simplify heraldic detail before compromising faction silhouette, facing, or high-density scanning.

## Decision constraints for future work

- Use heraldic field divisions and compact token silhouettes to carry setting flavour and faction identity.
- Simplify toward Tactical glyph principles as on-screen size falls or entity density rises.
- Do not replace tokens with literal human silhouettes without a new review decision supported by readability evidence.

This decision records visual direction only. Production work still requires a separately accepted scope.
