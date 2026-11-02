#!/usr/bin/env python3
"""Inventory a React component package into a 1:1 design-system library manifest.

Usage:
  python3 inventory-library.py --package refs/codesign-ui/packages/react \
      --name codesign-ui --out assets/libraries/codesign-ui.json \
      [--mapping assets/libraries/codesign-ui.map.json] [--md references/catalog-inventory.md]

  python3 inventory-library.py --package refs/codesign-ui/packages/react \
      --name codesign-ui --out assets/libraries/codesign-ui.json --check \
      [--catalog assets/components/catalog.json]

The parser reads `src/components/<dir>` (primitives), `src/kit/<dir>` (screen kit) and `src/ai/<dir>` (AI
composites). A mapping file pins each directory's designFamily/group/factory/kind/category/states/order; without one
the entry is `custom`. The output is the manifest `assets/components/catalog.json` and the catalog runtime consume.

`--check` verifies source ↔ manifest coverage, unique design families and (with `--catalog`) that the generated
catalog has exactly the same families and visual/non-visual counts. It no longer enforces page numbers.
"""
import argparse
import json
import os
import re
import sys
from datetime import date

# ---------------------------------------------------------------- source parsers

def _export_names(text):
    names = set()
    for m in re.finditer(r'export\s+(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)', text):
        names.add(m.group(1))
    for m in re.finditer(r'export\s*\{([^}]*)\}', text):
        for part in m.group(1).split(','):
            part = part.strip()
            if not part:
                continue
            if ' as ' in part:
                part = part.split(' as ')[-1].strip()
            if re.match(r'^[A-Z][A-Za-z0-9]*$', part):
                names.add(part)
    return names


def _is_public_part(name):
    return not re.search(r'(Props|BaseProps|Return|Details|Event|Definition|Provider|Context|Anatomy)$', name)


def parse_components(pkg):
    """Layer 1: the existing index.ts parser (namespace + exported public parts)."""
    comp_root = os.path.join(pkg, 'src', 'components')
    out = []
    for d in sorted(os.listdir(comp_root)):
        if not os.path.isdir(os.path.join(comp_root, d)):
            continue
        idx = os.path.join(comp_root, d, 'index.ts')
        if not os.path.isfile(idx):
            continue
        txt = open(idx, encoding='utf-8').read()
        names = set()
        for m in re.finditer(r'export\s*\{([^}]*)\}', txt):
            for part in m.group(1).split(','):
                part = part.strip()
                if not part:
                    continue
                if ' as ' in part:
                    part = part.split(' as ')[-1].strip()
                if re.match(r'^[A-Z][A-Za-z0-9]*$', part):
                    names.add(part)
        ns = None
        m = re.search(r"export \* as ([A-Z][A-Za-z0-9]*) from", txt)
        if m:
            ns = m.group(1)
        else:
            direct = sorted(n for n in names if not re.search(r'(Props|BaseProps|Return|Details|Event)$', n))
            if len(direct) == 1:
                ns = direct[0]
        parts = []
        if ns:
            for n in sorted(names):
                if not n.startswith(ns):
                    continue
                if re.search(r'(Context|Provider|Props|Return|Details|Event|Definition)$', n):
                    continue
                parts.append(n)
            if not parts and ns in names:
                parts = [ns]
        out.append({'name': ns or ''.join(w.capitalize() for w in d.split('-')),
                    'dir': d, 'parts': parts,
                    'source': 'packages/react/src/components/' + d, 'layer': 'components'})
    return out


def parse_ai(pkg):
    """Layer 2: AI composites re-export their anatomy through `export * from './x'`, so read every source file.

    The public prefix is the common prefix of the exported names (`Attachments` → `Attachment*`, `Sources` →
    `Source*`, `TestResults` → `Test*`). The manifest's `designFamily` still names the composite itself.
    """
    ai_root = os.path.join(pkg, 'src', 'ai')
    out = []
    for d in sorted(os.listdir(ai_root)):
        folder = os.path.join(ai_root, d)
        if not os.path.isdir(folder):
            continue
        if not os.path.isfile(os.path.join(folder, 'index.ts')):
            continue
        names = set()
        for f in sorted(os.listdir(folder)):
            if not f.endswith(('.tsx', '.ts')):
                continue
            if f.endswith(('.test.tsx', '.test.ts', '.stories.tsx')):
                continue
            try:
                names |= _export_names(open(os.path.join(folder, f), encoding='utf-8').read())
            except OSError:
                continue
        names = {n for n in names if _is_public_part(n) or (d == 'context' and n.startswith('Context'))}
        prefix = os.path.commonprefix(sorted(names)) if names else ''.join(w.capitalize() for w in d.split('-'))
        parts = sorted(n for n in names if n.startswith(prefix))
        ns = ''.join(w.capitalize() for w in d.split('-'))
        out.append({'name': ns, 'dir': d, 'parts': parts,
                    'source': 'packages/react/src/ai/' + d, 'layer': 'ai'})
    return out


def parse_kit(pkg):
    """Screen kit (`src/kit`): the missing product families that the paired catalog needs.

The kit has React, Solid, Vue and Svelte bindings; the inventory reads the React reference source.

    The kit is deliberately separate from `src/components` so the core Zag.js primitives keep their own
    anatomy contract; the skill inventories it as its own layer and maps each family to a `CF` factory.
    """
    root = os.path.join(pkg, 'src', 'kit')
    out = []
    if not os.path.isdir(root):
        return out
    for d in sorted(os.listdir(root)):
        folder = os.path.join(root, d)
        if not os.path.isdir(folder) or not os.path.isfile(os.path.join(folder, 'index.ts')):
            continue
        names = set()
        for f in sorted(os.listdir(folder)):
            if not f.endswith(('.tsx', '.ts')):
                continue
            if f.endswith(('.test.tsx', '.test.ts', '.stories.tsx')):
                continue
            try:
                names |= _export_names(open(os.path.join(folder, f), encoding='utf-8').read())
            except OSError:
                continue
        names = {n for n in names if _is_public_part(n)}
        prefix = os.path.commonprefix(sorted(names)) if names else ''.join(w.capitalize() for w in d.split('-'))
        parts = sorted(n for n in names if n.startswith(prefix))
        out.append({'name': ''.join(w.capitalize() for w in d.split('-')), 'dir': d, 'parts': parts,
                    'source': 'packages/react/src/kit/' + d, 'layer': 'kit'})
    return out


def parse_all(pkg, include_ai=True, include_kit=True):
    comps = parse_components(pkg)
    if include_ai:
        comps += parse_ai(pkg)
    if include_kit:
        comps += parse_kit(pkg)
    return comps


# ---------------------------------------------------------------- manifest builder

def build_manifest(pkg, name, mapping, include_ai=True, include_kit=True):
    comps = parse_all(pkg, include_ai=include_ai, include_kit=include_kit)
    for c in comps:
        m = mapping.get(c['dir'], {})
        c.update({
            'designFamily': m.get('designFamily', c['name']),
            'category': m.get('category', 'Uncategorized'),
            'group': m.get('group', 'utility'),
            'page': m.get('page', '13'),
            'factory': m.get('factory', 'custom'),
            'kind': m.get('kind', 'visual' if c['parts'] else 'nonVisual'),
            'states': m.get('states', []),
            'order': m.get('order', 99),
            'layer': c.get('layer', 'components'),
        })
    pkg_ref = pkg
    m = re.search(r'(refs/[^/]+/.+)$', pkg)
    if m:
        pkg_ref = m.group(1)
    manifest = {
        'name': name,
        'mode': 'headless',
        'granularity': 'namespace',
        'source': 'https://github.com/codesign-chat/codesign-ui',
        'package': pkg_ref,
        'generated': str(date.today()),
        'components': comps,
        'summary': {
            'components': len(comps),
            'parts': sum(len(c['parts']) for c in comps),
            'visual': sum(1 for c in comps if c['kind'] == 'visual'),
            'nonVisual': sum(1 for c in comps if c['kind'] != 'visual'),
            'primitives': sum(1 for c in comps if c['layer'] == 'components'),
            'ai': sum(1 for c in comps if c['layer'] == 'ai'),
            'kit': sum(1 for c in comps if c['layer'] == 'kit'),
            'pages': sum(1 for c in comps if c['kind'] == 'visual'),
        },
    }
    return manifest


def check_manifest(manifest, pkg, catalog_path=None, include_ai=True, include_kit=True):
    source = parse_all(pkg, include_ai=include_ai, include_kit=include_kit)
    src_dirs = {c['dir']: c for c in source}
    man = {c['dir']: c for c in manifest.get('components', [])}
    missing = sorted(set(src_dirs) - set(man))
    extra = sorted(set(man) - set(src_dirs))
    dup = []
    seen = {}
    for c in manifest.get('components', []):
        fam = c.get('designFamily')
        if fam in seen:
            dup.append(fam)
        seen[fam] = 1
    catalog = None
    cat_err = []
    if catalog_path and os.path.isfile(catalog_path):
        try:
            catalog = json.load(open(catalog_path, encoding='utf-8')).get('components', [])
        except Exception as e:
            cat_err.append({'detail': 'catalog is not valid JSON: ' + str(e)})
        if catalog is not None:
            cat_fams = {c.get('id') or c.get('designFamily') for c in catalog}
            man_fams = {c.get('designFamily') for c in manifest.get('components', [])}
            for f in sorted(man_fams - cat_fams):
                cat_err.append({'detail': 'component missing from catalog: ' + str(f)})
            for f in sorted(cat_fams - man_fams):
                cat_err.append({'detail': 'catalog family not in the manifest: ' + str(f)})
            cat_visual = sum(1 for c in catalog if (c.get('kind') or 'visual') == 'visual')
            man_visual = sum(1 for c in manifest.get('components', []) if c.get('kind') == 'visual')
            if cat_visual != man_visual:
                cat_err.append({'detail': 'catalog visual=' + str(cat_visual) + ', manifest visual=' + str(man_visual)})
    ok = not (missing or extra or dup or cat_err)
    return {
        'ok': ok,
        'source': {'components': len(source), 'primitives': sum(1 for c in source if c['layer'] == 'components'),
                   'ai': sum(1 for c in source if c['layer'] == 'ai'), 'kit': sum(1 for c in source if c['layer'] == 'kit')},
        'manifest': manifest.get('summary'),
        'missing_from_manifest': missing,
        'extra_in_manifest': extra,
        'duplicate_designFamily': sorted(set(dup)),
        'catalog_errors': cat_err,
        'catalog_families': len(catalog) if catalog is not None else None,
    }


# ---------------------------------------------------------------- CLI

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--package', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--mapping')
    ap.add_argument('--md')
    ap.add_argument('--no-ai', action='store_true', help='inventory only src/components (legacy mode)')
    ap.add_argument('--check', action='store_true', help='verify source ↔ manifest (and optional catalog) coverage')
    ap.add_argument('--catalog', help='assets/components/catalog.json to compare families against')
    ap.add_argument('--json', action='store_true', help='print the full check report as JSON')
    a = ap.parse_args()
    mapping = json.load(open(a.mapping, encoding='utf-8')) if a.mapping else {}
    manifest = build_manifest(a.package, a.name, mapping, include_ai=not a.no_ai)
    if a.check:
        report = check_manifest(manifest, a.package, a.catalog, include_ai=not a.no_ai)
        if a.out and os.path.isdir(os.path.dirname(a.out) or '.'):
            os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
        print(json.dumps(report, ensure_ascii=False, indent=1) if a.json else
              ('COVERAGE ' + ('CLEAN' if report['ok'] else 'FAILED') + '\n' + json.dumps(report, ensure_ascii=False, indent=1)))
        sys.exit(0 if report['ok'] else 1)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(manifest, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if a.md:
        os.makedirs(os.path.dirname(a.md), exist_ok=True)
        lines = ['# codesign-ui · component inventory', '',
                 'Generated by `scripts/inventory-library.py`. Every namespace below must exist 1:1 in the Penpot',
                 'component registry (`assets/components/catalog.json`); `custom` means a source-anatomy renderer, `nonVisual`',
                 'means index-only. Layer 1 = `src/components`, screen kit = `src/kit`, Layer 2 = `src/ai`.', '',
                 f"**{manifest['summary']['components']} components · {manifest['summary']['parts']} anatomy parts · "
                 f"{manifest['summary']['visual']} visual · {manifest['summary']['nonVisual']} non-visual · "
                 f"{manifest['summary']['primitives']} primitives · {manifest['summary']['kit']} screen kit · {manifest['summary']['ai']} AI**", '',
                 '| # | Component | Layer | Page | Group | Factory | Kind | Parts | Category |',
                 '|---|---|---|---|---|---|---|---|---|']
        for i, c in enumerate(sorted(manifest['components'], key=lambda x: (str(x['page']), int(x['order']), x['designFamily'])), 1):
            lines.append('| %d | **%s** | %s | %s | %s | %s | %s | %s | %s |' % (
                i, c['designFamily'], c['layer'], c['page'], c['group'], c['factory'], c['kind'],
                ', '.join(p.replace(c['designFamily'], '') or 'Root' for p in c['parts']) or '—', c['category']))
        open(a.md, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(json.dumps(manifest['summary']))


if __name__ == '__main__':
    main()
