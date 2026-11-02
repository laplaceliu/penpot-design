#!/usr/bin/env python3
"""Build assets/components/catalog.json from the paired codesign-ui manifest.

The catalog pack is the 1:1 component inventory, expressed in the same definition schema as the hand-authored
core pack. It does not replace the manifest: page order, parts and states still come from
assets/libraries/codesign-ui.json. The catalog adds the component-first fields CK needs (renderer, requires,
defaults) so the 125 visual families can be resolved and audited through the same token contract.

Usage:
  python3 scripts/build-component-catalog.py
  python3 scripts/build-component-catalog.py --manifest assets/libraries/codesign-ui.json \
      --out assets/components/catalog.json
"""
import argparse
import json
from pathlib import Path

REQUIRES = {
    "actions": ["color.brand", "color.on-brand", "color.surface", "color.text", "color.border",
                "color.focus", "radius.control", "type.label", "stroke.focus"],
    "forms": ["color.surface", "color.text", "color.text-muted", "color.border", "color.focus",
              "radius.field", "type.body", "stroke.focus"],
    "selection": ["color.brand", "color.on-brand", "color.surface", "color.border-strong",
                  "color.focus", "radius.control", "type.label"],
    "data": ["color.surface-raised", "color.surface-alt", "color.text", "color.text-muted",
             "color.border", "radius.card", "type.body"],
    "navigation": ["color.surface", "color.text", "color.text-muted", "color.brand",
                   "color.border", "radius.control", "type.label"],
    "feedback": ["color.surface-raised", "color.inverse", "color.text", "color.text-muted",
                 "color.border", "radius.card", "type.body", "shadow.card"],
    "ai": ["color.surface-alt", "color.text", "color.text-muted", "color.border",
           "radius.card", "type.body"],
    "utility": ["color.surface", "color.text", "type.body"],
}


def build(manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    components = []
    ids = []
    for c in manifest.get("components", []):
        family = c.get("designFamily") or c.get("name")
        kind = c.get("kind", "visual")
        factory = c.get("factory") or "custom"
        if kind != "visual":
            renderer = "none"
        elif factory == "custom":
            renderer = "anatomy"
        else:
            renderer = "factory"
        entry = {
            "id": family,
            "name": c.get("name") or family,
            "group": c.get("group") or "utility",
            "factory": factory,
            "renderer": renderer,
            "kind": kind,
            "page": c.get("page"),
            "order": c.get("order"),
            "layer": c.get("layer"),
            "category": c.get("category"),
            "source": c.get("source"),
            "parts": c.get("parts", []),
            "states": c.get("states", []),
            "slots": [],
            "defaults": {},
            "requires": REQUIRES.get(c.get("group") or "utility", REQUIRES["utility"]),
            "bindings": [],
        }
        components.append(entry)
        ids.append(family)
    return {
        "version": 1,
        "name": "codesign-ui catalog components",
        "kind": "catalog",
        "contract": "token-contract.json",
        "source": manifest.get("source"),
        "packs": {"catalog": ids},
        "components": components,
    }


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default=str(root / "assets/libraries/codesign-ui.json"))
    ap.add_argument("--out", default=str(root / "assets/components/catalog.json"))
    args = ap.parse_args()
    data = build(Path(args.manifest))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} · {len(data['components'])} components · {len(data['packs']['catalog'])} ids")
    for kind in ("factory", "anatomy", "none"):
        print(f"  {kind}: {sum(1 for c in data['components'] if c['renderer'] == kind)}")


if __name__ == "__main__":
    main()
