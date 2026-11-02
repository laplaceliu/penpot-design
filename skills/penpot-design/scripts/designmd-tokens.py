#!/usr/bin/env python3
"""Bidirectional converter: DESIGN.md <-> Penpot design-token JSON.

Penpot's Tokens panel imports/exports W3C DTCG JSON:
  - single JSON: top-level keys are set names, plus "$themes" and "$metadata"
  - multi-file/ZIP: one file per set + "$themes.json" + "$metadata.json"

DESIGN.md stores normative values in YAML frontmatter. This script maps:
  colors.*      <-> color.<name>            ($type: color)
  typography.*  <-> <name> or typography.*  ($type: typography)
  rounded.*     <-> radius.<name>           ($type: borderRadius)
  spacing.*     <-> spacing.<name>          ($type: spacing)
  elevation.*   <-> shadow.<name>           ($type: shadow)

Not representable in DESIGN.md's standard sections (sets, themes, DTCG-only
types, component definitions) are preserved in an optional sidecar file so a
JSON -> MD -> JSON round trip can be lossless while DESIGN.md stays lint-clean.

Requires: Python 3.9+ and PyYAML.
"""

from __future__ import annotations

import argparse
import colorsys
import json
import math
import re
import sys
import zipfile
from collections import OrderedDict
from pathlib import Path
from typing import Any, Iterable

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.stderr.write("This script requires PyYAML: python3 -m pip install pyyaml\n")
    raise SystemExit(2)


# ---------------------------------------------------------------------------
# DTCG <-> Penpot token type names
# ---------------------------------------------------------------------------

PENPOT_TO_DTCG = {
    "borderRadius": "borderRadius",
    "color": "color",
    "dimension": "dimension",
    "fontFamilies": "fontFamilies",
    "fontSizes": "fontSizes",
    "fontWeights": "fontWeights",
    "letterSpacing": "letterSpacing",
    "number": "number",
    "opacity": "opacity",
    "rotation": "rotation",
    "shadow": "shadow",
    "sizing": "sizing",
    "spacing": "spacing",
    "borderWidth": "borderWidth",
    "textCase": "textCase",
    "textDecoration": "textDecoration",
    "typography": "typography",
}

DTCG_TO_PENPOT = {v: k for k, v in PENPOT_TO_DTCG.items()}
DTCG_TO_PENPOT.update({
    # Penpot accepts these singular aliases for backwards compatibility.
    "fontWeight": "fontWeights",
    "fontSize": "fontSizes",
    "fontFamily": "fontFamilies",
    "boxShadow": "shadow",
})

STANDARD_TYPES = {"color", "typography", "borderRadius", "spacing", "shadow"}


# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------

def warn(msg: str) -> None:
    sys.stderr.write(f"warning: {msg}\n")


def fail(msg: str) -> None:
    raise SystemExit(f"error: {msg}")


def slug(value: str, fallback: str = "design-md") -> str:
    value = (value or "").strip()
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-._")
    if not value:
        value = fallback
    return value


def sanitize_token_name(name: str) -> str:
    """Keep letters/digits/_/$/./- and make dotted path segments safe."""
    parts = []
    for part in str(name).split("."):
        part = re.sub(r"[^A-Za-z0-9_$-]+", "-", part)
        part = part.strip("-.$")
        if not part:
            part = "token"
        parts.append(part)
    return ".".join(parts)



def kebab_token_name(name: str) -> str:
    """Normalize a dotted token name to dot + kebab-case (color.surfaceAlt -> color.surface-alt)."""
    parts = str(name).split(".")
    out = []
    for part in parts:
        part = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", part)
        out.append(part.lower())
    return ".".join(out)


def is_kebab_segment(value: str) -> bool:
    return not re.search(r"[A-Z]", str(value))

def fmt_num(n: float | int) -> str:
    if isinstance(n, bool):
        return "1" if n else "0"
    n = float(n)
    if math.isfinite(n) and abs(n - round(n)) < 1e-9:
        return str(int(round(n)))
    return f"{n:.6f}".rstrip("0").rstrip(".")


DIM_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*(px|rem|em|%)?\s*$", re.I)


def dimension_px(value: Any, base_font_size: float = 16.0, em_size: float | None = None,
                 context: str = "") -> float:
    """Convert a DESIGN.md dimension/number to a pixel number."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if not isinstance(value, str):
        fail(f"{context}: expected a dimension/number, got {value!r}")
    m = DIM_RE.match(value)
    if not m:
        fail(f"{context}: invalid dimension {value!r} (allowed: px/em/rem/unitless)")
    number = float(m.group(1))
    unit = (m.group(2) or "").lower()
    if unit == "px":
        return number
    if unit == "rem":
        return number * base_font_size
    if unit == "em":
        return number * (em_size if em_size is not None else base_font_size)
    if unit == "%":
        fail(f"{context}: percentages are not valid Penpot numeric tokens")
    return number


def dimension_str(value: Any, base_font_size: float = 16.0, em_size: float | None = None,
                  context: str = "") -> str:
    return fmt_num(dimension_px(value, base_font_size, em_size, context))


def line_height_value(value: Any, base_font_size: float = 16.0, context: str = "") -> str:
    """DESIGN.md allows unitless or dimension line-height. Penpot stores a string."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return fmt_num(value)
    if not isinstance(value, str):
        fail(f"{context}: invalid lineHeight {value!r}")
    s = value.strip()
    if s.endswith("%"):
        return fmt_num(float(s[:-1].strip()) / 100.0)
    m = DIM_RE.match(s)
    if not m:
        fail(f"{context}: invalid lineHeight {value!r}")
    unit = (m.group(2) or "").lower()
    number = float(m.group(1))
    if unit in ("em", "rem"):
        return fmt_num(number)
    if unit == "px":
        return fmt_num(number)
    return fmt_num(number)


# ---------------------------------------------------------------------------
# CSS color handling
# ---------------------------------------------------------------------------

NAMED_COLORS = {
    "black": "#000000", "white": "#FFFFFF", "red": "#FF0000", "green": "#008000",
    "blue": "#0000FF", "transparent": "#00000000",
}


def _hex_expand(s: str) -> str | None:
    s = s.lstrip("#").strip()
    if re.fullmatch(r"[0-9a-fA-F]{3}", s):
        return "#" + "".join(c * 2 for c in s)
    if re.fullmatch(r"[0-9a-fA-F]{4}", s):
        return "#" + "".join(c * 2 for c in s)
    if re.fullmatch(r"[0-9a-fA-F]{6}", s):
        return "#" + s.upper()
    if re.fullmatch(r"[0-9a-fA-F]{8}", s):
        return "#" + s.upper()
    return None


def parse_color(value: Any) -> tuple[int, int, int, float] | None:
    """Return (r, g, b, alpha) or None."""
    if not isinstance(value, str):
        return None
    s = value.strip()
    low = s.lower()
    if low in NAMED_COLORS:
        s = NAMED_COLORS[low]
        low = s.lower()
    if low.startswith("#"):
        h = _hex_expand(s)
        if not h:
            return None
        raw = h[1:]
        if len(raw) == 6:
            return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16), 1.0
        if len(raw) == 8:
            return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16), int(raw[6:8], 16) / 255
    m = re.fullmatch(r"rgba?\(([^)]+)\)", s, re.I)
    if m:
        parts = [p.strip() for p in re.split(r"[,/]", m.group(1)) if p.strip()]
        if len(parts) >= 3:
            try:
                r, g, b = (int(float(p.rstrip("%"))) for p in parts[:3])
                a = float(parts[3].rstrip("%")) if len(parts) > 3 else 1.0
                if len(parts) > 3 and parts[3].strip().endswith("%"):
                    a /= 100.0
                return max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), max(0, min(1, a))
            except ValueError:
                return None
    m = re.fullmatch(r"hsla?\(([^)]+)\)", s, re.I)
    if m:
        parts = [p.strip() for p in re.split(r"[,/]", m.group(1)) if p.strip()]
        if len(parts) >= 3:
            try:
                h = float(parts[0].rstrip("deg")) % 360 / 360.0
                sat = float(parts[1].rstrip("%")) / 100.0
                light = float(parts[2].rstrip("%")) / 100.0
                a = float(parts[3].rstrip("%")) if len(parts) > 3 else 1.0
                if len(parts) > 3 and parts[3].strip().endswith("%"):
                    a /= 100.0
                r, g, b = colorsys.hls_to_rgb(h, light, sat)
                return int(round(r * 255)), int(round(g * 255)), int(round(b * 255)), max(0, min(1, a))
            except ValueError:
                return None
    return None


def normalize_color(value: Any, context: str = "") -> str:
    if not isinstance(value, str):
        fail(f"{context}: color must be a string, got {value!r}")
    rgba = parse_color(value)
    if not rgba:
        # Keep CSS formats we cannot parse; Penpot may still accept them.
        warn(f"{context}: could not normalize color {value!r}; keeping as-is")
        return value.strip()
    r, g, b, a = rgba
    if a >= 0.999:
        return f"#{r:02X}{g:02X}{b:02X}"
    return f"#{r:02X}{g:02X}{b:02X}{int(round(a * 255)):02X}"


def color_with_opacity(color: Any, opacity: float, context: str = "") -> str:
    rgba = parse_color(color)
    if not rgba:
        if float(opacity) >= 0.999:
            return str(color)
        fail(f"{context}: opacity {opacity} needs a parseable color (hex/rgb/hsl), got {color!r}")
    r, g, b, a = rgba
    a = max(0.0, min(1.0, a * float(opacity)))
    if a >= 0.999:
        return f"#{r:02X}{g:02X}{b:02X}"
    return f"#{r:02X}{g:02X}{b:02X}{int(round(a * 255)):02X}"


def split_hex_alpha(value: str) -> tuple[str, float]:
    rgba = parse_color(value)
    if not rgba:
        return value, 1.0
    r, g, b, a = rgba
    return f"#{r:02X}{g:02X}{b:02X}", a


# ---------------------------------------------------------------------------
# Reference translation
# ---------------------------------------------------------------------------

REF_RE = re.compile(r"\{([^{}]+)\}")


def typography_token_name(key: str) -> str:
    key = key.strip()
    if key.startswith("typography.") or re.match(r"^type\.", key, re.I):
        return sanitize_token_name(key)
    return sanitize_token_name("typography." + key)


def typography_key_from_name(name: str) -> str:
    if name.startswith("typography."):
        return name[len("typography."):]
    return name


def md_ref_to_penpot(ref: str) -> str:
    r = ref.strip()
    if r.startswith("colors."):
        return "color." + r[len("colors."):]
    if r.startswith("rounded."):
        return "radius." + r[len("rounded."):]
    if r.startswith("spacing."):
        return "spacing." + r[len("spacing."):]
    if r.startswith("elevation."):
        return "shadow." + r[len("elevation."):]
    if r.startswith("typography."):
        key = r[len("typography."):]
        return typography_token_name(key)
    return sanitize_token_name(r)


def penpot_ref_to_md(ref: str) -> str:
    r = ref.strip()
    if r.startswith("color."):
        return "colors." + r[len("color."):]
    if r.startswith("radius."):
        return "rounded." + r[len("radius."):]
    if r.startswith("borderRadius."):
        return "rounded." + r[len("borderRadius."):]
    if r.startswith("spacing."):
        return "spacing." + r[len("spacing."):]
    if r.startswith("shadow."):
        return "elevation." + r[len("shadow."):]
    if r.startswith("elevation."):
        return "elevation." + r[len("elevation."):]
    if r.startswith("typography."):
        return "typography." + typography_key_from_name(r)
    return r


def translate_refs(value: Any, mapper, context: str = "") -> Any:
    if isinstance(value, str):
        return REF_RE.sub(lambda m: "{" + mapper(m.group(1)) + "}", value)
    if isinstance(value, list):
        return [translate_refs(v, mapper, context) for v in value]
    if isinstance(value, dict):
        return {k: translate_refs(v, mapper, context) for k, v in value.items()}
    return value


# ---------------------------------------------------------------------------
# Token tree / JSON model
# ---------------------------------------------------------------------------

def make_token(name: str, penpot_type: str, value: Any, description: str | None = None) -> OrderedDict:
    token = OrderedDict()
    token["name"] = sanitize_token_name(name)
    token["type"] = penpot_type
    token["value"] = value
    if description:
        token["description"] = description
    return token


def token_to_dtcg(token: dict) -> OrderedDict:
    node = OrderedDict()
    node["$value"] = token["value"]
    node["$type"] = PENPOT_TO_DTCG.get(token["type"], token["type"])
    if token.get("description"):
        node["$description"] = token["description"]
    return node


def build_token_tree(tokens: Iterable[dict]) -> OrderedDict:
    root: OrderedDict = OrderedDict()
    leaves = set()
    for token in tokens:
        parts = token["name"].split(".")
        node = root
        for part in parts[:-1]:
            if part not in node:
                node[part] = OrderedDict()
            if not isinstance(node[part], dict) or "$value" in node[part]:
                fail(f"token path collision at {token['name']!r}")
            node = node[part]
        leaf = parts[-1]
        if leaf in node and isinstance(node[leaf], dict):
            fail(f"token path collision at {token['name']!r}")
        node[leaf] = token_to_dtcg(token)
        leaves.add(token["name"])
    return root


def flatten_token_tree(node: dict, parent: str = "", inherited_type: str | None = None,
                       default_set: str = "", warnings: list[str] | None = None) -> list[dict]:
    warnings = warnings if warnings is not None else []
    tokens: list[dict] = []
    for key, value in node.items():
        if str(key).startswith("$"):
            continue
        path = f"{parent}.{key}" if parent else str(key)
        if isinstance(value, dict) and not ("$value" in value or "value" in value):
            group_type = value.get("$type", value.get("type", inherited_type))
            tokens.extend(flatten_token_tree(value, path, group_type, default_set, warnings))
            continue
        if not isinstance(value, dict):
            continue
        raw_type = value.get("$type", value.get("type", inherited_type))
        raw_value = value.get("$value", value.get("value"))
        if raw_type is None:
            warnings.append(f"{path}: token has no $type; skipped")
            continue
        penpot_type = DTCG_TO_PENPOT.get(str(raw_type))
        if not penpot_type:
            warnings.append(f"{path}: unsupported DTCG type {raw_type!r}; skipped")
            continue
        tokens.append(make_token(path, penpot_type, normalize_dtcg_value(penpot_type, raw_value),
                                 value.get("$description", value.get("description"))))
    return tokens


def normalize_dtcg_value(penpot_type: str, value: Any) -> Any:
    if penpot_type == "shadow":
        return normalize_shadow_value(value)
    if penpot_type == "typography":
        return normalize_typography_value(value)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return fmt_num(value)
    return value


def normalize_shadow_value(value: Any) -> Any:
    if isinstance(value, str):
        return value
    layers = value if isinstance(value, list) else [value]
    out = []
    for layer in layers:
        if not isinstance(layer, dict):
            continue
        inset = layer.get("inset", layer.get("type") == "innerShadow")
        if isinstance(inset, str):
            inset = inset.lower() == "true"
        out.append(OrderedDict([
            ("offsetX", fmt_num(layer.get("offsetX", layer.get("x", 0)))),
            ("offsetY", fmt_num(layer.get("offsetY", layer.get("y", 0)))),
            ("blur", fmt_num(layer.get("blur", 0))),
            ("spread", fmt_num(layer.get("spread", 0))),
            ("color", normalize_color(layer.get("color", "#000000"), "shadow layer")),
            ("inset", bool(inset)),
        ]))
    return out


def normalize_typography_value(value: Any) -> Any:
    if isinstance(value, str):
        return value
    if not isinstance(value, dict):
        return value
    out = OrderedDict()
    keymap = {
        "fontFamily": "fontFamilies", "fontFamilies": "fontFamilies",
        "fontSize": "fontSizes", "fontSizes": "fontSizes",
        "fontWeight": "fontWeights", "fontWeights": "fontWeights",
        "lineHeight": "lineHeights", "lineHeights": "lineHeights",
        "letterSpacing": "letterSpacing",
        "textCase": "textCase", "textDecoration": "textDecoration",
    }
    for key, val in value.items():
        if key in keymap:
            out[keymap[key]] = val
    return out


def build_sets_json(sets: list[dict]) -> OrderedDict:
    result = OrderedDict()
    for set_obj in sets:
        result[set_obj["name"]] = build_token_tree(set_obj["tokens"])
    return result


def theme_path(theme: dict) -> str:
    group = (theme.get("group") or "").strip()
    name = theme["name"].strip()
    return f"{group}/{name}" if group else name


def build_penpot_json(sets: list[dict], themes: list[dict], token_set_order: list[str],
                      active_sets: list[str], active_themes: list[str]) -> OrderedDict:
    out = build_sets_json(sets)
    theme_nodes = []
    for theme in themes:
        node = OrderedDict()
        if theme.get("id"):
            node["id"] = theme["id"]
        node["name"] = theme["name"]
        if theme.get("group"):
            node["group"] = theme["group"]
        if theme.get("description"):
            node["description"] = theme["description"]
        if theme.get("isSource") is not None:
            node["isSource"] = bool(theme["isSource"])
        node["selectedTokenSets"] = OrderedDict(
            (name, "enabled") for name in theme.get("sets", [])
        )
        theme_nodes.append(node)
    out["$themes"] = theme_nodes
    out["$metadata"] = OrderedDict([
        ("tokenSetOrder", list(token_set_order)),
        ("activeThemes", list(active_themes)),
        ("activeSets", list(active_sets)),
    ])
    return out


# ---------------------------------------------------------------------------
# DESIGN.md reading/writing
# ---------------------------------------------------------------------------

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.S)


def read_designmd(path: Path) -> tuple[dict, str, str]:
    text = path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        fail(f"{path}: no YAML frontmatter delimited by ---")
    fm = yaml.safe_load(m.group(1)) or {}
    if not isinstance(fm, dict):
        fail(f"{path}: frontmatter is not a mapping")
    return fm, m.group(2), text


class _YamlDumper(yaml.SafeDumper):
    pass


def _represent_ordereddict(dumper, data):
    return dumper.represent_dict(data.items())


_YamlDumper.add_representer(OrderedDict, _represent_ordereddict)


def yaml_dump(frontmatter: dict) -> str:
    return yaml.dump(
        frontmatter, Dumper=_YamlDumper, sort_keys=False, allow_unicode=True,
        default_flow_style=False, width=120,
    )


def write_designmd(path: Path, frontmatter: dict, body: str) -> None:
    text = "---\n" + yaml_dump(frontmatter).rstrip() + "\n---\n\n" + body.strip() + "\n"
    path.write_text(text, encoding="utf-8")


def designmd_tokens(fm: dict, base_font_size: float, components_as_tokens: bool = False,
                    kebab_names: bool = False) -> tuple[list[dict], list[str], dict]:
    tokens: list[dict] = []
    warnings: list[str] = []
    extras: dict = {}
    nm = kebab_token_name if kebab_names else (lambda x: x)

    def name_warning(section: str, key: Any) -> None:
        if not is_kebab_segment(str(key)):
            warnings.append(f"{section}.{key}: camelCase key; use kebab-case for new token names")

    colors = fm.get("colors") or {}
    for key, value in colors.items():
        name_warning("colors", key)
        name = sanitize_token_name(nm("color." + str(key)))
        val = normalize_color(translate_refs(value, md_ref_to_penpot, f"colors.{key}"), f"colors.{key}")
        tokens.append(make_token(name, "color", val))

    typography = fm.get("typography") or {}
    for key, t in typography.items():
        name_warning("typography", key)
        if not isinstance(t, dict):
            fail(f"typography.{key}: expected a mapping")
        name = nm(typography_token_name(str(key)))
        family = t.get("fontFamily", t.get("fontFamilies"))
        if family is None:
            fail(f"typography.{key}: missing fontFamily")
        if isinstance(family, str) and "," in family:
            families: Any = [p.strip() for p in family.split(",") if p.strip()]
        else:
            families = family
        size = dimension_str(t.get("fontSize"), base_font_size, context=f"typography.{key}.fontSize")
        size_num = float(size)
        weight = t.get("fontWeight")
        if weight is None:
            fail(f"typography.{key}: missing fontWeight")
        line = line_height_value(t.get("lineHeight", 1.2), base_font_size, context=f"typography.{key}.lineHeight")
        ls_value = t.get("letterSpacing", "0")
        ls = dimension_str(ls_value, base_font_size, em_size=size_num, context=f"typography.{key}.letterSpacing")
        if t.get("fontFeature") or t.get("fontVariation"):
            warnings.append(f"typography.{key}: fontFeature/fontVariation has no Penpot token field; dropped")
        value = OrderedDict([
            ("fontFamilies", families),
            ("fontSizes", size),
            ("fontWeights", fmt_num(weight) if isinstance(weight, (int, float)) else str(weight)),
            ("lineHeights", line),
            ("letterSpacing", ls),
            ("textCase", "none"),
            ("textDecoration", "none"),
        ])
        tokens.append(make_token(name, "typography", value))

    rounded = fm.get("rounded") or {}
    for key, value in rounded.items():
        name_warning("rounded", key)
        tokens.append(make_token(
            nm("radius." + str(key)), "borderRadius",
            dimension_str(value, base_font_size, context=f"rounded.{key}"),
        ))

    spacing = fm.get("spacing") or {}
    for key, value in spacing.items():
        name_warning("spacing", key)
        tokens.append(make_token(
            nm("spacing." + str(key)), "spacing",
            dimension_str(value, base_font_size, context=f"spacing.{key}"),
        ))

    elevation = fm.get("elevation") or {}
    elevation_extras = {}
    for key, recipe in elevation.items():
        if key == "roles":
            extras.setdefault("elevation", {})["roles"] = recipe
            continue
        if not isinstance(recipe, dict):
            continue
        layers = []
        for section, inset in (("drop", False), ("inner", True)):
            for idx, layer in enumerate(recipe.get(section) or []):
                if not isinstance(layer, dict):
                    continue
                color = color_with_opacity(
                    layer.get("color", "#000000"), layer.get("opacity", 1),
                    f"elevation.{key}.{section}[{idx}]",
                )
                layers.append(OrderedDict([
                    ("offsetX", fmt_num(layer.get("x", 0))),
                    ("offsetY", fmt_num(layer.get("y", 0))),
                    ("blur", fmt_num(layer.get("blur", 0))),
                    ("spread", fmt_num(layer.get("spread", 0))),
                    ("color", color),
                    ("inset", inset),
                ]))
        if recipe.get("sheen") is not None:
            elevation_extras.setdefault("sheen", {})[key] = recipe["sheen"]
            warnings.append(f"elevation.{key}.sheen: no Penpot shadow-token equivalent; dropped from the JSON")
        if not layers:
            warnings.append(f"elevation.{key}: no drop/inner layers; skipped")
            continue
        name_warning("elevation", key)
        tokens.append(make_token(nm("shadow." + str(key)), "shadow", layers))
    if elevation_extras:
        extras["elevation"] = elevation_extras

    if components_as_tokens:
        for comp_name, comp in (fm.get("components") or {}).items():
            if not isinstance(comp, dict):
                continue
            for attr, value in comp.items():
                token_name = sanitize_token_name(nm(f"component.{comp_name}.{attr}"))
                if attr in ("backgroundColor", "textColor", "borderColor"):
                    if isinstance(value, str) and REF_RE.fullmatch(value.strip()):
                        val = translate_refs(value, md_ref_to_penpot, f"components.{comp_name}.{attr}")
                    else:
                        val = normalize_color(value, f"components.{comp_name}.{attr}")
                    tokens.append(make_token(token_name, "color", val))
                elif attr == "rounded":
                    if isinstance(value, str) and REF_RE.fullmatch(value.strip()):
                        val = translate_refs(value, md_ref_to_penpot)
                    else:
                        val = dimension_str(value, base_font_size, context=f"components.{comp_name}.{attr}")
                    tokens.append(make_token(token_name, "borderRadius", val))
                elif attr in ("height", "width", "size"):
                    if isinstance(value, str) and REF_RE.fullmatch(value.strip()):
                        val = translate_refs(value, md_ref_to_penpot)
                    else:
                        try:
                            val = dimension_str(value, base_font_size, context=f"components.{comp_name}.{attr}")
                        except SystemExit:
                            warnings.append(f"components.{comp_name}.{attr}: not a single dimension; skipped")
                            continue
                    tokens.append(make_token(token_name, "sizing", val))
                elif attr == "padding":
                    if isinstance(value, str) and REF_RE.fullmatch(value.strip()):
                        tokens.append(make_token(token_name, "spacing", translate_refs(value, md_ref_to_penpot)))
                    else:
                        warnings.append(f"components.{comp_name}.padding: shorthand padding is not a single token; skipped")
                else:
                    warnings.append(f"components.{comp_name}.{attr}: no token mapping; skipped")
        if "components" in fm:
            extras["components"] = fm["components"]

    # Detect duplicates after sanitization.
    seen: dict[str, str] = {}
    for token in tokens:
        if token["name"] in seen:
            fail(f"duplicate token name after sanitization: {token['name']} "
                 f"({seen[token['name']]} vs {token['type']})")
        seen[token["name"]] = token["type"]
    return tokens, warnings, extras


# ---------------------------------------------------------------------------
# Parsing Penpot JSON (single file, directory, or ZIP)
# ---------------------------------------------------------------------------

def read_penpot_source(path: Path) -> tuple[dict, str]:
    if path.is_dir():
        merged: OrderedDict = OrderedDict()
        for child in sorted(path.rglob("*.json")):
            rel = child.relative_to(path)
            key = rel.as_posix()[:-5]
            try:
                merged[key] = json.loads(child.read_text(encoding="utf-8"))
            except Exception as exc:
                warn(f"{child}: {exc}; skipped")
        return merged, path.name
    if path.suffix.lower() == ".zip":
        merged = OrderedDict()
        with zipfile.ZipFile(path) as zf:
            for info in zf.infolist():
                if info.is_dir() or not info.filename.lower().endswith(".json"):
                    continue
                key = info.filename[:-5]
                try:
                    merged[key] = json.loads(zf.read(info).decode("utf-8"))
                except Exception as exc:
                    warn(f"{info.filename}: {exc}; skipped")
        return merged, path.stem
    return json.loads(path.read_text(encoding="utf-8")), path.stem


def parse_penpot_document(data: Any, source_name: str) -> dict:
    if not isinstance(data, dict):
        fail("Penpot token JSON must be an object")
    metadata = data.get("$metadata") if isinstance(data.get("$metadata"), dict) else {}
    themes_raw = data.get("$themes")
    reserved = {"$themes", "$metadata"}
    set_keys = [k for k in data.keys() if k not in reserved and not str(k).startswith("$")]
    warnings: list[str] = []

    # Single-set DTCG file: no $metadata and no $themes.
    if "$metadata" not in data and "$themes" not in data:
        sets = [{
            "name": source_name,
            "active": True,
            "tokens": flatten_token_tree(data, default_set=source_name, warnings=warnings),
        }]
        themes = []
        token_set_order = [source_name]
        active_sets = [source_name]
        active_themes = []
        base_set = source_name
        return {
            "sets": sets, "themes": themes, "tokenSetOrder": token_set_order,
            "activeSets": active_sets, "activeThemes": active_themes,
            "baseSet": base_set, "warnings": warnings,
        }

    set_objs = {}
    for name in set_keys:
        node = data.get(name)
        if not isinstance(node, dict):
            warnings.append(f"set {name!r} is not a token tree; skipped")
            continue
        set_objs[name] = {
            "name": name,
            "tokens": flatten_token_tree(node, default_set=name, warnings=warnings),
        }

    order = metadata.get("tokenSetOrder") or list(set_objs.keys())
    order = [name for name in order if name in set_objs]
    order += [name for name in set_objs if name not in order]
    if not order and not themes_raw:
        fail("no token sets or themes found")

    themes = []
    for theme in themes_raw or []:
        if not isinstance(theme, dict):
            continue
        selected = theme.get("selectedTokenSets") or {}
        selected_sets = []
        for set_name, status in selected.items():
            if str(status).lower() == "disabled":
                warnings.append(f"theme {theme.get('name')}: disabled set {set_name!r} ignored")
                continue
            selected_sets.append(set_name)
        themes.append({
            "id": theme.get("id"),
            "group": theme.get("group") or "",
            "name": theme.get("name") or "Theme",
            "description": theme.get("description"),
            "isSource": theme.get("isSource"),
            "sets": selected_sets,
            "active": False,
        })

    active_theme_paths = [str(x) for x in (metadata.get("activeThemes") or [])]
    for theme in themes:
        theme["active"] = theme_path(theme) in active_theme_paths

    active_sets = [str(x) for x in (metadata.get("activeSets") or []) if str(x) in set_objs]
    if not active_sets and active_theme_paths:
        for theme in themes:
            if theme["active"]:
                for name in theme["sets"]:
                    if name in set_objs and name not in active_sets:
                        active_sets.append(name)
    if not active_sets:
        active_sets = list(order)
        warnings.append("no $metadata.activeSets; treating all sets as active for conversion")

    for name, set_obj in set_objs.items():
        set_obj["active"] = name in active_sets
    sets = [set_objs[name] for name in order] + [s for n, s in set_objs.items() if n not in order]
    base_set = order[0] if order else ""
    return {
        "sets": sets, "themes": themes, "tokenSetOrder": order,
        "activeSets": active_sets, "activeThemes": active_theme_paths,
        "baseSet": base_set, "warnings": warnings,
    }


def token_map(tokens: Iterable[dict]) -> dict[str, dict]:
    return {t["name"]: t for t in tokens}


def resolve_value(value: Any, lookup: dict[str, dict], seen: tuple[str, ...], warnings: list[str]) -> Any:
    if isinstance(value, str):
        whole = REF_RE.fullmatch(value.strip())
        if whole:
            name = whole.group(1)
            if name in seen:
                warnings.append(f"circular token reference: {' -> '.join(seen + (name,))}")
                return value
            target = lookup.get(name)
            if not target:
                warnings.append(f"unresolved token reference: {name}")
                return value
            return resolve_value(target["value"], lookup, seen + (name,), warnings)
        return REF_RE.sub(
            lambda m: str(resolve_value("{" + m.group(1) + "}", lookup, seen, warnings)),
            value,
        )
    if isinstance(value, list):
        return [resolve_value(v, lookup, seen, warnings) for v in value]
    if isinstance(value, dict):
        return OrderedDict((k, resolve_value(v, lookup, seen, warnings)) for k, v in value.items())
    return value


# ---------------------------------------------------------------------------
# Penpot JSON -> DESIGN.md
# ---------------------------------------------------------------------------

def float_from_token(value: Any, context: str = "") -> float:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        m = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*(?:px)?\s*", value)
        if m:
            return float(m.group(1))
    fail(f"{context}: expected a number, got {value!r}")


def designmd_sections_from_tokens(source: dict, effective: bool, base_font_size: float) -> tuple[dict, dict]:
    """Return (frontmatter token sections, extras)."""
    if effective:
        lookup = OrderedDict()
        for set_obj in source["sets"]:
            if set_obj.get("active", True):
                for token in set_obj["tokens"]:
                    lookup[token["name"]] = token
    else:
        base = next((s for s in source["sets"] if s["name"] == source.get("baseSet")), None)
        if base is None:
            base = source["sets"][0] if source["sets"] else {"tokens": []}
        lookup = OrderedDict((t["name"], t) for t in base["tokens"])

    warnings: list[str] = []
    resolved = OrderedDict()
    for name, token in lookup.items():
        resolved[name] = OrderedDict(token)
        resolved[name]["value"] = resolve_value(token["value"], lookup, (name,), warnings)

    sections: dict = {}
    colors = OrderedDict()
    typography = OrderedDict()
    rounded = OrderedDict()
    spacing = OrderedDict()
    elevation = OrderedDict()
    extra_tokens = []

    for name, token in resolved.items():
        typ = token["type"]
        val = token["value"]
        if typ == "color":
            if isinstance(val, str):
                colors[name[6:] if name.startswith("color.") else name] = val
            else:
                warnings.append(f"{name}: color value is not a string; skipped")
        elif typ == "typography":
            if isinstance(val, str):
                warnings.append(f"{name}: typography is a reference ({val}); not expanded into DESIGN.md")
                extra_tokens.append(token)
                continue
            font_family = val.get("fontFamilies", val.get("fontFamily"))
            if isinstance(font_family, list):
                font_family = ", ".join(str(x) for x in font_family)
            font_size = val.get("fontSizes", val.get("fontSize"))
            font_weight = val.get("fontWeights", val.get("fontWeight"))
            line_height = val.get("lineHeights", val.get("lineHeight", 1.2))
            letter_spacing = val.get("letterSpacing", "0")
            t = OrderedDict()
            if font_family is not None:
                t["fontFamily"] = font_family
            if font_size is not None:
                try:
                    t["fontSize"] = fmt_num(float_from_token(font_size, name)) + "px"
                except SystemExit:
                    t["fontSize"] = font_size
            if font_weight is not None:
                try:
                    t["fontWeight"] = int(float_from_token(font_weight, name))
                except SystemExit:
                    t["fontWeight"] = font_weight
            try:
                t["lineHeight"] = float_from_token(line_height, name)
            except SystemExit:
                t["lineHeight"] = line_height
            try:
                t["letterSpacing"] = fmt_num(float_from_token(letter_spacing, name)) + "px"
            except SystemExit:
                t["letterSpacing"] = letter_spacing
            typography[typography_key_from_name(name)] = t
            if val.get("textCase") not in (None, "none") or val.get("textDecoration") not in (None, "none"):
                extra_tokens.append(token)
        elif typ == "borderRadius":
            key = re.sub(r"^(radius|borderRadius)\.", "", name)
            try:
                rounded[key] = fmt_num(float_from_token(val, name)) + "px"
            except SystemExit:
                warnings.append(f"{name}: non-numeric borderRadius {val!r}; skipped")
        elif typ == "spacing":
            key = re.sub(r"^spacing\.", "", name)
            try:
                spacing[key] = fmt_num(float_from_token(val, name)) + "px"
            except SystemExit:
                warnings.append(f"{name}: non-numeric spacing {val!r}; skipped")
        elif typ == "shadow":
            key = re.sub(r"^(shadow|elevation)\.", "", name)
            if isinstance(val, str):
                warnings.append(f"{name}: shadow is a reference ({val}); not expanded into DESIGN.md")
                extra_tokens.append(token)
                continue
            if not isinstance(val, list):
                val = [val]
            drop, inner = [], []
            for layer in val:
                if not isinstance(layer, dict):
                    continue
                color, alpha = split_hex_alpha(str(layer.get("color", "#000000")))
                row = OrderedDict([
                    ("x", float_from_token(layer.get("offsetX", layer.get("x", 0)), name)),
                    ("y", float_from_token(layer.get("offsetY", layer.get("y", 0)), name)),
                    ("blur", float_from_token(layer.get("blur", 0), name)),
                    ("spread", float_from_token(layer.get("spread", 0), name)),
                    ("color", color),
                    ("opacity", round(alpha, 4)),
                ])
                row["x"] = int(row["x"]) if row["x"].is_integer() else row["x"]
                row["y"] = int(row["y"]) if row["y"].is_integer() else row["y"]
                row["blur"] = int(row["blur"]) if row["blur"].is_integer() else row["blur"]
                row["spread"] = int(row["spread"]) if row["spread"].is_integer() else row["spread"]
                (inner if layer.get("inset") else drop).append(row)
            recipe = OrderedDict()
            if drop:
                recipe["drop"] = drop
            if inner:
                recipe["inner"] = inner
            if recipe:
                elevation[key] = recipe
        else:
            extra_tokens.append(token)

    if colors:
        sections["colors"] = colors
    if typography:
        sections["typography"] = typography
    if rounded:
        sections["rounded"] = rounded
    if spacing:
        sections["spacing"] = spacing
    if elevation:
        sections["elevation"] = elevation
    return sections, {"warnings": warnings, "extraTokens": extra_tokens, "lookup": resolved}


def generated_body(sections: dict, name: str, description: str, omitted: list) -> str:
    lines = ["## Overview", description or f"{name} design tokens.", ""]
    if "colors" in sections:
        lines += ["## Colors", "Colors are defined as `color.*` tokens in Penpot.", ""]
    if "typography" in sections:
        lines += ["## Typography", "Typography steps are defined as `typography`/`type.*` composite tokens.", ""]
    if "spacing" in sections:
        lines += ["## Layout", "Spacing steps are defined as `spacing.*` tokens.", ""]
    if "elevation" in sections:
        lines += ["## Elevation & Depth", "Elevation recipes are defined as `shadow.*` tokens; `drop` and `inner` layers are preserved.", ""]
    if "rounded" in sections:
        lines += ["## Shapes", "Corner steps are defined as `radius.*` tokens.", ""]
    if "components" in sections:
        lines += ["## Components", "Component styling guidance.", ""]
    lines += ["## Do's and Don'ts", "- Do use the token references from this file.", "- Don't hand-write values that already have a token.", ""]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def command_designmd2penpot(args: argparse.Namespace) -> None:
    md_path = Path(args.input)
    fm, _body, _ = read_designmd(md_path)
    tokens, warnings, extras = designmd_tokens(fm, args.base_font_size, args.components_as_tokens, args.kebab_names)
    for w in warnings:
        warn(w)

    meta = None
    if args.meta_in:
        meta_path = Path(args.meta_in)
        if not meta_path.exists():
            fail(f"metadata file not found: {meta_path}")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if not isinstance(meta, dict) or "sets" not in meta:
            fail(f"{meta_path}: not a designmd_tokens sidecar")

    if meta:
        sets = json.loads(json.dumps(meta["sets"]))  # deep copy
        themes = json.loads(json.dumps(meta.get("themes", [])))
        token_set_order = list(meta.get("tokenSetOrder") or [s["name"] for s in sets])
        active_sets = list(meta.get("activeSets") or [])
        active_themes = list(meta.get("activeThemes") or [])
        base_set_name = meta.get("baseSet") or (token_set_order[0] if token_set_order else "")
        base_set = next((s for s in sets if s["name"] == base_set_name), None)
        if base_set is None:
            base_set = {"name": base_set_name or (args.set_name or slug(fm.get("name", ""))), "active": True, "tokens": []}
            sets.insert(0, base_set)
            token_set_order.insert(0, base_set["name"])
        base_tokens = token_map(base_set["tokens"])
        for token in tokens:
            if token["name"] in base_tokens:
                existing = base_tokens[token["name"]]
                if isinstance(existing.get("value"), str) and REF_RE.fullmatch(existing["value"].strip()):
                    warn(f"{token['name']}: sidecar value is a token reference; keeping it "
                         f"(DESIGN.md standard sections cannot express aliases)")
                    continue
                if existing["type"] != token["type"]:
                    warn(f"type changed for {token['name']}: "
                         f"{existing['type']} -> {token['type']}")
                existing.update(token)
            else:
                base_set["tokens"].append(token)
        if not active_sets:
            active_sets = [base_set["name"]]
        if not token_set_order:
            token_set_order = [s["name"] for s in sets]
        # Remove active names that don't exist.
        existing = {s["name"] for s in sets}
        active_sets = [name for name in active_sets if name in existing]
        active_themes = [path for path in active_themes if any(theme_path(t) == path for t in themes)]
    else:
        set_name = args.set_name or slug(fm.get("name", ""), "design-md")
        sets = [{"name": set_name, "active": True, "tokens": tokens}]
        themes = []
        token_set_order = [set_name]
        active_sets = [set_name]
        active_themes = []

    data = build_penpot_json(sets, themes, token_set_order, active_sets, active_themes)
    out = json.dumps(data, ensure_ascii=False, indent=2)
    Path(args.output).write_text(out + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for set_obj in sets:
        for token in set_obj["tokens"]:
            counts[token["type"]] = counts.get(token["type"], 0) + 1
    print(f"wrote {args.output}")
    print(f"sets: {len(sets)} ({', '.join(s['name'] for s in sets)})")
    print("token types: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    if not meta:
        print("note: no sidecar metadata; all tokens are in one set with no themes")
    if args.components_as_tokens:
        print("note: component.* semantic tokens were generated (opt-in)")


def command_penpot2design(args: argparse.Namespace) -> None:
    data, source_name = read_penpot_source(Path(args.input))
    parsed = parse_penpot_document(data, source_name)
    for w in parsed["warnings"]:
        warn(w)
    sections, extras = designmd_sections_from_tokens(parsed, args.effective, args.base_font_size)
    for w in extras["warnings"]:
        warn(w)

    base_fm = {}
    base_body = ""
    if args.base:
        base_fm, base_body, _ = read_designmd(Path(args.base))

    name = args.name or base_fm.get("name") or source_name or "Penpot Tokens"
    description = args.description or base_fm.get("description") or "Design tokens converted from Penpot."
    fm: OrderedDict = OrderedDict()
    fm["version"] = base_fm.get("version", "alpha")
    fm["name"] = name
    fm["description"] = description
    for key in ("colors", "typography", "rounded", "spacing", "elevation"):
        if key in sections:
            fm[key] = sections[key]
    if base_fm.get("components") is not None:
        fm["components"] = base_fm["components"]
    # Keep base elevation extras (roles/sheen) and attach sheens to recipes.
    base_elevation = base_fm.get("elevation") or {}
    elevation = fm.get("elevation")
    if elevation is None and base_elevation:
        elevation = OrderedDict()
        fm["elevation"] = elevation
    if isinstance(elevation, dict):
        for key, val in base_elevation.items():
            if key == "roles" and "roles" not in elevation:
                elevation["roles"] = val
            elif isinstance(val, dict) and val.get("sheen") is not None and key in elevation:
                elevation[key]["sheen"] = val["sheen"]
    omitted = list(base_fm.get("omitted") or [])
    missing = []
    for key in ("colors", "typography", "spacing", "elevation", "rounded", "components"):
        if key not in fm and key not in omitted:
            missing.append(key)
    if missing and args.add_omitted:
        omitted.extend(missing)
    if omitted:
        fm["omitted"] = omitted
    if "colors" in fm and "primary" not in fm["colors"]:
        warn("DESIGN.md has no colors.primary; the design.md linter's missing-primary rule will fail")

    body = base_body if base_body.strip() else generated_body(fm, name, description, omitted)
    write_designmd(Path(args.output), fm, body)

    meta_path = Path(args.meta_out) if args.meta_out else Path(args.output).with_name(Path(args.output).stem + ".penpot.json")
    if not args.no_meta:
        sidecar = OrderedDict([
            ("version", 1),
            ("source", str(args.input)),
            ("baseSet", parsed.get("baseSet")),
            ("sets", parsed["sets"]),
            ("themes", parsed["themes"]),
            ("tokenSetOrder", parsed["tokenSetOrder"]),
            ("activeSets", parsed["activeSets"]),
            ("activeThemes", parsed["activeThemes"]),
            ("designmd", {
                "components": base_fm.get("components"),
                "omitted": base_fm.get("omitted"),
                "description": base_fm.get("description"),
                "elevation": base_fm.get("elevation"),
                "extraTokens": extras.get("extraTokens", []),
            }),
        ])
        meta_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote metadata: {meta_path}")
    print(f"wrote {args.output}")
    print(f"sets: {len(parsed['sets'])}, themes: {len(parsed['themes'])}, mode: {'effective' if args.effective else 'base set'}")
    print(f"standard sections: {', '.join(k for k in ('colors','typography','rounded','spacing','elevation') if k in sections) or 'none'}")
    if extras.get("extraTokens"):
        print(f"extra tokens not in standard DESIGN.md sections: {len(extras['extraTokens'])} (see metadata)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="DESIGN.md <-> Penpot design-token JSON converter")
    sub = parser.add_subparsers(dest="command", required=True)

    p1 = sub.add_parser("to-penpot", help="DESIGN.md -> Penpot DTCG JSON")
    p1.add_argument("input", help="DESIGN.md path")
    p1.add_argument("-o", "--output", required=True, help="output tokens JSON")
    p1.add_argument("--set-name", help="Penpot set name (default: slug of name)")
    p1.add_argument("--meta-in", help="sidecar .penpot.json to preserve sets/themes/extra tokens")
    p1.add_argument("--base-font-size", type=float, default=16.0, help="px per rem/em (default 16)")
    p1.add_argument("--components-as-tokens", action="store_true",
                    help="generate component.<name>.* semantic tokens from the components block")
    p1.add_argument("--kebab-names", action="store_true",
                    help="normalize emitted token names to dot + kebab-case (recommended for new files)")
    p1.set_defaults(func=command_designmd2penpot)

    p2 = sub.add_parser("to-design", help="Penpot DTCG JSON -> DESIGN.md")
    p2.add_argument("input", help="tokens JSON, directory, or ZIP")
    p2.add_argument("-o", "--output", required=True, help="output DESIGN.md")
    p2.add_argument("--base", help="existing DESIGN.md whose body/components/description are preserved")
    p2.add_argument("--name", help="DESIGN.md system name")
    p2.add_argument("--description", help="DESIGN.md description")
    p2.add_argument("--meta-out", help="sidecar metadata path (default: <output stem>.penpot.json)")
    p2.add_argument("--no-meta", action="store_true", help="do not write the sidecar")
    p2.add_argument("--effective", action="store_true",
                    help="use active-set resolved values instead of the base set for standard sections")
    p2.add_argument("--base-font-size", type=float, default=16.0, help="px per rem/em (default 16)")
    p2.add_argument("--no-add-omitted", dest="add_omitted", action="store_false",
                    help="do not add omitted section names for missing standard sections")
    p2.set_defaults(func=command_penpot2design, add_omitted=True)
    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
