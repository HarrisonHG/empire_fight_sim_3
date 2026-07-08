# Art Style Exploration Palettes

These palettes are static exploration material, not renderer configuration. The intent is to reserve the strongest contrast for units and state cues while keeping terrain quiet enough for dense formations.

## Core semantic palette

| Role | Colour | Intended use |
| --- | --- | --- |
| Canvas | `#F4F0E6` | Page and empty-map background |
| Surface | `#E8E1D2` | Comparison panels and open ground |
| Ink | `#182126` | Primary outlines, labels, and facing cues |
| Muted ink | `#596268` | Secondary labels and inactive marks |
| Faction Azure | `#16697A` | Cool faction field |
| Faction Crimson | `#B23A48` | Warm faction field |
| Faction Ivory | `#FFF8E7` | Light internal marks and neutral contrast |
| Neutral | `#68737A` | Unaffiliated or unknown units |
| Selection | `#FFD166` | Selected-unit ring; never used as a faction fill |
| Warning | `#D95D39` | Alert or impaired-state corner mark |
| Positive status | `#2F7D57` | Beneficial-state mark |
| Open ground | `#D8D1B8` | Default passable terrain |
| Rough ground | `#B29B72` | Low-contrast rough terrain field |
| Woodland | `#5F7653` | Tree masses and wooded-area edges |
| Woodland shadow | `#354B3B` | Sparse woodland pattern marks |
| Water | `#4C86A8` | Blocked water field |
| Water highlight | `#A9CAD8` | Sparse wave marks |
| Blocked edge | `#424C50` | Impassable edges and rock silhouettes |
| Boundary | `#6D5A43` | Dashed territory or area boundary |
| Objective | `#C88719` | Objective fill, paired with a diamond silhouette |

## Direction-specific use

### Tactical glyphs

- Use `#16697A` and `#B23A48` as solid faction fills with `#182126` outlines.
- Reinforce faction with different outer silhouettes: clipped square for Azure and diamond/hex form for Crimson.
- Keep role marks in `#FFF8E7`; at reduced size, silhouette and facing take priority over the role mark.

### Heraldic tokens

- Use the same faction fields, adding a vertical ivory pale for Azure and a diagonal ivory bend for Crimson.
- Preserve an ink outline around both tokens so pale terrain does not erase their edges.
- Treat heraldic divisions as faction redundancy, not decoration; omit fine emblems below the readable threshold.

### Abstract top-down figures

- Use faction colour on the body/shoulder mass and `#182126` for the offset head, equipment, and outline.
- Add faction redundancy through shoulder shape: squared Azure shoulders and swept Crimson shoulders.
- Keep equipment cues outside the body silhouette so role remains visible when internal detail is lost.

## Greyscale and contrast notes

- Azure and Crimson have deliberately different hues, but their greyscale values are close. They must never be the sole faction distinction. Outer silhouette, field division, or shoulder shape carries the same information.
- Selection uses a bright `#FFD166` ring with an ink keyline. The keyline prevents the ring disappearing on open ground, while the high-value yellow separates it from both faction fills.
- Warning uses both `#D95D39` and a triangular corner/notch. Positive status uses both `#2F7D57` and a circular pip. State must remain interpretable without colour.
- Unit outlines use `#182126` against all proposed terrain fills. Terrain patterns use related mid-tones rather than ink so they do not compete with unit silhouettes.
- Water and woodland are darker than open ground, so units retain their ink keyline plus a thin ivory separation where needed.
- Objective markers use a diamond shape and central dot in addition to `#C88719`. Boundaries use a dash pattern rather than colour alone.

## Colour-vision considerations

- The Azure/Crimson pairing should be checked under protanopia, deuteranopia, and tritanopia simulations before production adoption. The exploration assumes hue will sometimes collapse and therefore duplicates faction in geometry.
- Do not use Warning (`#D95D39`) versus Positive status (`#2F7D57`) as an unlabelled red/green pair. Triangle versus circle is mandatory.
- Keep objective gold distinct from selection by context and geometry: objectives are filled diamonds on terrain; selection is an unfilled ring around a unit.
- Avoid dense alternating colour patterns. They shimmer at reduced size and become especially difficult for low-vision users.

## Readability rule

At the intended high entity counts, information priority is: faction silhouette, position, facing, selection, broad role, then status detail. If a mark cannot survive the reduced-size examples, it should not be relied on in later production work.
