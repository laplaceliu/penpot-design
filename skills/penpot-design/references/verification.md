# Verification — penetration and pixel acceptance

> Code-side “looks right” does not count. Produce an image and a number. The component-layer gate is `CK.audit`; this
> file covers visual fidelity and theme proof.

## 1. Artifacts

- **Baseline**: `export_shape({shapeId, format:'png'})` for a component master, a screen board, or the current page.
- **Measured**: implementation screenshot at the tier baseline width (web 1440 / pad 834 / mobile 375), DPR=1.
- **Tool**: `scripts/pixel-diff.py` (PIL/Pillow): per-channel diff, tolerance, heatmap, JSON metrics.
- Naming: `design/<name>.png` · `impl/<name>.png` · `diff/<name>.diff.png` + `.json`.

## 2. Thresholds

| Metric | Meaning | Threshold |
|---|---|---|
| `diff_ratio` | pixels over tolerance | ≤0.5 % whole page / ≤0.2 % component |
| `max_channel_delta` | max single-channel delta | ≤12 (anti-aliasing) |
| `diff_bbox` | difference region | scattered edge band; no large solid block |

A size mismatch exits 2 and is an immediate reject; never scale one image to fit the other.

## 3. Screenshot standardization

- Freeze animations: inject `* { transition:none !important; animation:none !important }`.
- Wait for fonts (`document.fonts.ready`), use an opaque background, hide scrollbars/focus frames.
- Viewport/window equals the design board width; DPR=1 (`QT_SCALE_FACTOR=1` for Qt).
- Take an element/screen screenshot, not a desktop crop.

## 4. Loop

```bash
python3 scripts/pixel-diff.py design/Button.png impl/Button.png \
    --out diff/Button.diff.png --threshold 12 --max-diff-ratio 0.002
```

1. Export baseline → screenshot measured → compare.
2. Read JSON + heatmap:
   - size mismatch → box model / export multiplier;
   - large solid block → position/spacing, token color, font mapping, or wrong asset;
   - edge scatter only → pass.
3. Fix the source (token, component definition, layout), re-export, repeat.
4. After atoms/composites pass, compare whole screens per accepted recipe × tier and per color scheme.
5. Output a component × metric table with heatmap paths.

## 5. Root-cause quick reference

| Heatmap shape | Likely cause | Fix |
|---|---|---|
| uniform offset | box model / border / layout gap | align to spacing token / flow |
| text-area difference | family/weight/leading/tracking | use the declared typography token |
| icon-area difference | wrong asset / scale / color | check @2x naming and currentColor |
| solid image-area difference | wrong asset or multiplier | fix the asset manifest / export size |
| solid color block | wrong token value | trace to DESIGN.md → token → role |
| shadow missing/clipped | clip or missing elevation recipe | release clip / apply `EL` recipe |

## 6. Component and theme acceptance

- Export each core master (or a contact sheet); check fill, border, type, corner and shadow.
- `CK.theme(group,name).changed > 0` for a switchable theme; export after the switch and judge the **paint**, not the
  binding map.
- A board/screen never exported is not “verified”.
- For a source recreation, compare against the source screenshot at the same width × scheme; report the diff ratio per
  component and per screen.

## 7. Color sampling

```python
from PIL import Image
im = Image.open("ref.png").convert("RGB")
print('#%02X%02X%02X' % im.getpixel((x, y)))
```

Quantized colors from an image are estimates; write them into DESIGN.md as measured values and mark inferred values in
prose.
