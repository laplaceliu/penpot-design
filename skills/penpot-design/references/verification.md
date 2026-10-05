# Verification Guide: PIL pixel-level comparison (pixel-perfect acceptance)

**The only acceptance criterion: implementation screenshots compared pixel-by-pixel against Penpot exports must meet the bar.** Code-side "looks right" does not count; you must produce images and numbers.

## 1. Principle and tools

- Baseline image: the component-board/whole-page image exported from Penpot via `export_shape({shapeId, format:'png'})` (export the currently active page).
- Measured image: implementation-side screenshot (see §3).
- Tool: Python **PIL/Pillow** (`scripts/pixel_diff.py`), per-channel diff + tolerance + heatmap + metrics.
- Reference-image naming: `design/<component>.png`; measured image `impl/<component>.png`; output `diff/<component>.diff.png` + `.json`.

## 2. Judgment criteria

| Metric | Meaning | Default threshold |
|---|---|---|
| `diff_ratio` | Pixel ratio exceeding tolerance | ≤ 0.5% (whole page) / ≤ 0.2% (single component) |
| `max_channel_delta` | Max single-channel difference | ≤ 12 (anti-aliasing / sub-pixel render tolerance) |
| `diff_bbox` | Difference bounding box | Must be scattered (edge band), no large solid regions |

- Large continuous differences = layout/size/asset error, out of tolerance scope, **must be fixed**.
- Single-pixel edge differences (anti-aliasing) are accepted within tolerance.
- Exit code: 0 pass / 1 over threshold / 2 size mismatch (size mismatch is an immediate reject, no scaled comparison).

## 3. Screenshot method (standardize first, then screenshot)

- **Qt**: QWidget route `widget->grab().save(path)` (hide scrollbars/focus frames); window fixed to **that tier's baseline width** (web 1440 / pad 834 / mobile 375); `QT_SCALE_FACTOR=1`. Qt5 enables AA_UseHighDpiPixmaps but compare at DPR=1.
- **Web**: Playwright `page.screenshot({ clip })` or element `locator.screenshot()`; viewport width = **that tier's baseline width** (web 1440 / pad 834 / mobile 375), `deviceScaleFactor: 1`.
- **Standardize**: before comparing, freeze animations (inject CSS `* { transition: none !important; animation: none !important }`; Qt uses static state), unify background (opaque base color), screenshot after fonts finish loading (`document.fonts.ready`).

## 4. Flow (run after each layer is implemented)

1. Export baseline (PENPOT) → `design/`
2. Screenshot measured → `impl/`
3. Run:
   ```bash
   python3 scripts/pixel_diff.py design/Button.png impl/Button.png \
       --out diff/Button.diff.png --threshold 12 --max-diff-ratio 0.002
   ```
4. Read JSON metrics and heatmap:
   - Size mismatch → check design annotation and implementation fixed size / image export multiplier.
   - Large-block difference → locate by difference type: position offset (spacing/box model), color (token value), font (type-scale mapping), icon (asset reference/scaling).
   - Only edge scatter → pass.
5. After fixing, return to step 2 and loop until it passes.
6. After all component layers pass, do a **whole-page comparison** of page-14 Demo **each tier's screen boards** separately (threshold 0.5%).
7. Summary report: component × metric table (user prefers tabular progress), with diff heatmap paths attached.

## 5. Common differences → root-cause quick ref

| Heatmap shape | Root cause | Fix direction |
|---|---|---|
| Overall uniform offset by a few px | Box model / border / layout spacing | border-box, padding, layout gap aligned to annotation |
| Text-area difference | Font family / weight / line-height / letter-spacing | align to F2 type scale; no synthetic bold |
| Icon-area difference | Wrong asset reference / scaling / coloring | check @2x naming, SVG currentColor |
| Solid image-area difference | Wrong image / wrong size multiplier | check assets manifest and export multiplier |
| Solid color block difference | Wrong token value | trace back to DESIGN.md tokens (single source of truth) |
| Shadow/glow missing or clipped | Container clip / effect not implemented | make clip overflow visible, add shadow effect |

## 6. Use PIL to assist color picking (reuse for Entry B image analysis)

```python
from PIL import Image
im = Image.open("ref.png").convert("RGB")
for xy in [(x, y)]:          # sample key points of the design image
    print(xy, '#%02X%02X%02X' % im.getpixel(xy))
```

After quantifying the main colors, backfill DESIGN.md; mark estimated values in prose as "estimated from image".
