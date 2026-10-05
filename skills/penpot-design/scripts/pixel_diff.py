#!/usr/bin/env python3
"""pixel_diff.py —— PIL pixel-level comparison (pixel-perfect acceptance tool).

Usage:
    python3 pixel_diff.py design.png impl.png [--out diff.png] [--threshold 12] [--max-diff-ratio 0.005]

Exit codes: 0 pass / 1 over threshold / 2 size mismatch
"""
import argparse
import json
import sys

from PIL import Image, ImageChops


def pixel_diff(design_path: str, impl_path: str, out_path: str,
               threshold: int, max_diff_ratio: float) -> dict:
    design = Image.open(design_path).convert("RGB")
    impl = Image.open(impl_path).convert("RGB")

    if design.size != impl.size:
        print(json.dumps({"error": "size_mismatch",
                          "design": design.size, "impl": impl.size}))
        sys.exit(2)

    w, h = design.size
    total = w * h

    # Per-channel absolute difference; take the max channel delta as the pixel-difference magnitude (anti-aliasing tolerance handled by threshold)
    diff = ImageChops.difference(design, impl).convert("L")
    mask = diff.point(lambda p: 255 if p > threshold else 0)
    pixels = getattr(mask, "get_flattened_data", mask.getdata)()
    diff_pixels = sum(1 for p in pixels if p)
    diff_ratio = diff_pixels / total
    diff_pixels_data = getattr(diff, "get_flattened_data", diff.getdata)()
    max_delta = max(diff_pixels_data)
    bbox = mask.getbbox()

    # Diff heatmap: tint differing pixels red and overlay on the implementation image for easy locating
    heat = impl.copy()
    red = Image.new("RGB", (w, h), (255, 0, 0))
    heat.paste(red, (0, 0), mask)
    heat.save(out_path)

    metrics = {
        "size": [w, h],
        "diff_pixels": diff_pixels,
        "diff_ratio": round(diff_ratio, 6),
        "max_channel_delta": max_delta,
        "diff_bbox": bbox,  # None = perfectly identical
        "threshold": threshold,
        "max_diff_ratio": max_diff_ratio,
        "pass": diff_ratio <= max_diff_ratio and max_delta <= threshold * 3,
    }
    print(json.dumps(metrics, ensure_ascii=False))
    sys.exit(0 if metrics["pass"] else 1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="PIL pixel-perfect diff")
    ap.add_argument("design")
    ap.add_argument("impl")
    ap.add_argument("--out", default="diff.png")
    ap.add_argument("--threshold", type=int, default=12,
                    help="Per-channel tolerance (anti-aliasing / sub-pixel, default 12)")
    ap.add_argument("--max-diff-ratio", type=float, default=0.005,
                    help="Allowed fraction of differing pixels (default 0.5%)")
    args = ap.parse_args()
    pixel_diff(args.design, args.impl, args.out,
               args.threshold, args.max_diff_ratio)
