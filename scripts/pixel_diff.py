#!/usr/bin/env python3
"""pixel_diff.py —— PIL 像素级比对（pixel-perfect 验收工具）。

用法:
    python3 pixel_diff.py design.png impl.png [--out diff.png] [--threshold 12] [--max-diff-ratio 0.005]

退出码: 0 达标 / 1 超阈值 / 2 尺寸不一致
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

    # 逐通道绝对差，取最大通道差作为像素差异量（抗锯齿容差交给 threshold）
    diff = ImageChops.difference(design, impl).convert("L")
    mask = diff.point(lambda p: 255 if p > threshold else 0)
    pixels = getattr(mask, "get_flattened_data", mask.getdata)()
    diff_pixels = sum(1 for p in pixels if p)
    diff_ratio = diff_pixels / total
    diff_pixels_data = getattr(diff, "get_flattened_data", diff.getdata)()
    max_delta = max(diff_pixels_data)
    bbox = mask.getbbox()

    # diff 热图：差异像素染红，叠加到实现图上便于定位
    heat = impl.copy()
    red = Image.new("RGB", (w, h), (255, 0, 0))
    heat.paste(red, (0, 0), mask)
    heat.save(out_path)

    metrics = {
        "size": [w, h],
        "diff_pixels": diff_pixels,
        "diff_ratio": round(diff_ratio, 6),
        "max_channel_delta": max_delta,
        "diff_bbox": bbox,  # None = 完全一致
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
                    help="单通道容差（抗锯齿/亚像素，默认 12）")
    ap.add_argument("--max-diff-ratio", type=float, default=0.005,
                    help="允许的差异像素占比（默认 0.5%%）")
    args = ap.parse_args()
    pixel_diff(args.design, args.impl, args.out,
               args.threshold, args.max_diff_ratio)
