#!/usr/bin/env python3
"""Validate the component-first assets without a Penpot connection.

Checks:
  · token-contract.json: every role has a type/token; required roles exist
  · core.json: unique ids, pack ids resolve, every requires/binding role exists, every factory exists
  · catalog.json: matches the paired manifest inventory (131 components / 125 visual / 6 non-visual), unique ids,
    every factory exists, every role exists
  · component-factory.js: a `CF.<factory>` assignment exists for every non-custom factory

Usage:
  python3 scripts/validate-components.py
  python3 scripts/validate-components.py --root .
"""
import argparse
import json
import re
import sys
from pathlib import Path


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"FAIL {path}: {exc}")


def factory_names(js: str):
    return set(re.findall(r"CF\.([A-Za-z0-9_]+)\s*=\s*(?:async\s+)?function", js))


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    contract = read_json(root / "assets/components/token-contract.json")
    core = read_json(root / "assets/components/core.json")
    catalog = read_json(root / "assets/components/catalog.json")
    manifest = read_json(root / "assets/libraries/codesign-ui.json")
    js = (root / "scripts/component-factory.js").read_text(encoding="utf-8")
    factories = factory_names(js)
    roles = set(contract.get("roles", {}))

    for role in contract.get("required", []):
        if role not in roles:
            errors.append(f"contract.required: unknown role {role}")
    for role, spec in contract.get("roles", {}).items():
        if not spec.get("type") or not spec.get("token"):
            errors.append(f"contract.roles.{role}: type/token required")
        for alias in spec.get("aliases", []):
            if not isinstance(alias, str):
                errors.append(f"contract.roles.{role}: alias must be a string")

    for name, data in (("core", core), ("catalog", catalog)):
        ids = []
        for comp in data.get("components", []):
            cid = comp.get("id")
            if not cid:
                errors.append(f"{name}: component missing id")
                continue
            ids.append(cid)
            factory = comp.get("factory")
            renderer = comp.get("renderer")
            if renderer is None:
                renderer = ("none" if comp.get("kind") == "nonVisual"
                            else "anatomy" if factory == "custom" else "factory")
            if renderer not in ("factory", "anatomy", "none"):
                errors.append(f"{name}.{cid}: bad renderer {renderer!r}")
            if factory and factory != "custom" and factory not in factories:
                errors.append(f"{name}.{cid}: factory {factory!r} not found in component-factory.js")
            for role in comp.get("requires", []):
                if role not in roles:
                    errors.append(f"{name}.{cid}: unknown requires role {role!r}")
            for binding in comp.get("bindings", []):
                role = binding.get("role")
                if role not in roles:
                    errors.append(f"{name}.{cid}: unknown binding role {role!r}")
                if not binding.get("part") or not binding.get("prop"):
                    errors.append(f"{name}.{cid}: binding needs part + prop")
        if len(ids) != len(set(ids)):
            errors.append(f"{name}: duplicate component ids")
        for pack, pack_ids in data.get("packs", {}).items():
            for cid in pack_ids:
                if cid not in set(ids):
                    errors.append(f"{name}.packs.{pack}: unknown id {cid}")

    manifest_components = manifest.get("components", [])
    catalog_components = catalog.get("components", [])
    if len(catalog_components) != len(manifest_components):
        errors.append(f"catalog: {len(catalog_components)} components vs manifest {len(manifest_components)}")
    manifest_ids = {c.get("designFamily") for c in manifest_components}
    catalog_ids = {c.get("id") for c in catalog_components}
    missing = sorted(manifest_ids - catalog_ids)
    extra = sorted(catalog_ids - manifest_ids)
    if missing:
        errors.append(f"catalog: missing families {missing[:5]}")
    if extra:
        errors.append(f"catalog: extra families {extra[:5]}")
    visual = sum(1 for c in catalog_components if c.get("kind") == "visual")
    non_visual = len(catalog_components) - visual
    if visual != 125 or non_visual != 6:
        errors.append(f"catalog: expected 125 visual / 6 non-visual, got {visual}/{non_visual}")

    print(f"contract roles: {len(roles)}")
    print(f"core: {len(core.get('components', []))} components · packs {core.get('packs')}")
    print(f"catalog: {len(catalog_components)} components · {visual} visual / {non_visual} non-visual")
    print(f"factories found in CF: {len(factories)}")
    if errors:
        print(f"\nFAILURES ({len(errors)}):")
        for err in errors:
            print(f"  - {err}")
    else:
        print("\nOK: component assets are internally consistent")
    return errors


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(root))
    args = ap.parse_args()
    errors = validate(Path(args.root))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
