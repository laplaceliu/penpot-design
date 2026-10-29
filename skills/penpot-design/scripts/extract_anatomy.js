#!/usr/bin/env node
/*
 * extract_anatomy.js — derive a component anatomy from a host library's SOURCE, not from a part-name list.
 *
 * Why: the paired `custom` fallback used to be a flat list of part names, so every custom page looked identical
 * (measured 2026-10-27: 44 anatomy pages, one layout). The host repo ships an example per component and a reference
 * stylesheet for it (the components are headless, so the example + CSS IS the anatomy). This extractor reads:
 *   · the manifest entry's `source` dir,
 *   · the first example in `<source>/examples/`,
 *   · every `styles/<file>.module.css` the example imports (resolved in `.storybook/modules/`),
 * and emits `codesign-ui.anatomy.json` — a resolved JSX tree per component with layout/style declarations and the
 * data-scope/data-part styles that headless components expose.
 *
 * Usage:
 *   node scripts/extract_anatomy.js --src <host-repo> --manifest assets/libraries/codesign-ui.json \
 *        --out assets/libraries/codesign-ui.anatomy.json [--only Conversation,AngleSlider]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = {};
process.argv.slice(2).forEach((a, i, arr) => { if (a.startsWith('--')) args[a.slice(2)] = arr[i + 1]; });
const SRC = path.resolve(args.src || '.');
const MANIFEST = path.resolve(args.manifest || 'assets/libraries/codesign-ui.json');
const OUT = path.resolve(args.out || 'assets/libraries/codesign-ui.anatomy.json');
const ONLY = args.only ? String(args.only).split(',').map((s) => s.trim()).filter(Boolean) : null;
const ts = require(path.join(SRC, 'node_modules', 'typescript'));
const CSSDIR = path.join(SRC, '.storybook', 'modules');

const THEME = {
  '--demo-bg-popover': 'surface', '--demo-bg-checkbox': 'surface', '--demo-bg-thumb': 'surface',
  '--demo-neutral-subtle': 'surfaceAlt', '--demo-neutral-muted': 'neutralSoft',
  '--demo-border': 'border', '--demo-border-muted': 'borderSubtle', '--demo-border-emphasized': 'borderStrong',
  '--demo-neutral-fg': 'ink', '--demo-neutral-emphasized': 'ink', '--demo-neutral-contrast': 'onInverse',
  '--demo-neutral-fg-muted': 'muted', '--demo-neutral-focus-ring': 'primary',
  '--demo-coral-solid': 'primary', '--demo-coral-emphasized': 'primaryInk', '--demo-coral-fg': 'onInverse',
  '--demo-coral-contrast': 'onInverse', '--demo-coral-subtle': 'primarySoft', '--demo-coral-muted': 'primarySoft',
  '--demo-coral-focus-ring': 'primary', '--demo-error': 'error', '--demo-json-key': 'violet', '--demo-json-string': 'success',
  '--demo-json-number': 'info', '--demo-json-boolean': 'warning', '--demo-json-accent': 'rose'
};

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- CSS module parser (nested rules, base declarations)
function parseCss(text) {
  const out = { byClass: {}, byPart: {}, byTag: {}, vars: {} };
  if (!text) return out;
  let i = 0;
  const readBlock = (parent) => {
    while (i < text.length) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text[i] === '}') { i++; return; }
      const selStart = i;
      while (i < text.length && text[i] !== '{' && text[i] !== '}') i++;
      const selRaw = text.slice(selStart, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (text[i] === '}') { i++; continue; }
      if (!selRaw) { i++; continue; }
      i++; // {
      const bodyStart = i;
      let depth = 1;
      while (i < text.length && depth) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++; }
      const body = text.slice(bodyStart, i - 1);
      // declarations are what precedes the first nested rule; state/child variants are not base style.
      let firstBrace = -1, d = 0;
      for (let k = 0; k < body.length; k++) { if (body[k] === '{') { firstBrace = k; break; } }
      const declText = firstBrace >= 0 ? (body.lastIndexOf(';', firstBrace) >= 0 ? body.slice(0, body.lastIndexOf(';', firstBrace) + 1) : '') : body;
      const decl = {};
      declText.split(';').forEach((d2) => {
        const c = d2.indexOf(':');
        if (c < 0) return;
        const p = norm(d2.slice(0, c)).toLowerCase(), v = norm(d2.slice(c + 1));
        if (p && v) decl[p] = v;
      });
      const sels = selRaw.split(',').map((s) => norm(s).replace(/\s+/g, ' '));
      sels.forEach((sel) => {
        const base = parent ? sel.replace(/&/g, parent) : sel;
        if (!parent && Object.keys(decl).length) {
          const cls = base.match(/^\.([A-Za-z0-9_-]+)$/);
          if (cls) Object.assign((out.byClass[cls[1]] = out.byClass[cls[1]] || {}), decl);
          // EXACT scope+part only: a selector with an extra state/role attribute ([data-state], [data-role], :hover)
          // is a variant, and merging it into the base made the scroll-to-bottom button `display:none`.
          const exact = base.replace(/\s+/g, '').match(/^\[data-scope=['"]?([A-Za-z0-9_-]+)['"]?\]\[data-part=['"]?([A-Za-z0-9_-]+)['"]?\]$/);
          if (exact) Object.assign((out.byPart[exact[1] + '|' + exact[2]] = out.byPart[exact[1] + '|' + exact[2]] || {}), decl);
          const tag = base.match(/^([a-z][a-z0-9]*)$/);
          if (tag) Object.assign((out.byTag[tag[1]] = out.byTag[tag[1]] || {}), decl);
        }
        if (base.startsWith(':root') && decl['--demo']) Object.assign(out.vars, decl);
      });
    }
  };
  readBlock(undefined);
  return out;
}

// ---------------------------------------------------------------- AI scope/part map (component function -> data attrs)
function buildScopeMap(root) {
  const map = {};
  const files = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (f !== 'examples' && f !== 'node_modules') walk(p); }
      else if (/\.tsx?$/.test(f) && !/\.(test|stories)\./.test(f)) files.push(p);
    }
  };
  try { walk(path.join(root, 'packages', 'react', 'src', 'ai')); } catch (e) {}
  files.forEach((f) => {
    const s = read(f); if (!s) return;
    const re = /export (?:function|const) ([A-Z][A-Za-z0-9_]*)/g;
    let m;
    while ((m = re.exec(s))) {
      const name = m[1];
      const rest = s.slice(m.index, Math.min(s.length, m.index + 12000));
      const scope = rest.match(/data-scope=["']([a-z0-9-]+)["']/);
      const part = rest.match(/data-part=["']([a-z0-9-]+)["']/);
      if (scope && part) map[name] = { scope: scope[1], part: part[1] };
      else if (scope) map[name] = { scope: scope[1], part: null };
    }
  });
  return map;
}

// ---------------------------------------------------------------- JSX -> tree
function jsxName(n) {
  if (!n) return null;
  if (ts.isIdentifier(n)) return { name: n.text };
  if (ts.isPropertyAccessExpression(n)) {
    const owner = ts.isIdentifier(n.expression) ? n.expression.text : (n.expression.getText ? n.expression.getText() : '');
    return { owner, part: n.name.text, name: owner + '.' + n.name.text };
  }
  return { name: n.getText ? n.getText() : null };
}
function tagNameOf(n) { return (n && (n.tagName || (n.openingElement && n.openingElement.tagName))) || null; }
function attrsOf(n) { return (n && (n.attributes || (n.openingElement && n.openingElement.attributes))) || null; }
function attr(node, names) {
  const attrs = attrsOf(node);
  for (const p of (attrs && attrs.properties) || []) {
    if (!ts.isJsxAttribute(p)) continue;
    const n = p.name.getText();
    if (names.indexOf(n) < 0) continue;
    const init = p.initializer;
    if (!init) return true;
    if (ts.isStringLiteral(init)) return init.text;
    if (ts.isJsxExpression(init) && init.expression) {
      if (ts.isStringLiteral(init.expression)) return init.expression.text;
      if (ts.isObjectLiteralExpression(init.expression)) {
        const o = {};
        init.expression.properties.forEach((q) => { if (ts.isPropertyAssignment(q)) o[q.name.getText()] = q.initializer.getText().replace(/['"]/g, ''); });
        return o;
      }
      return init.expression.getText();
    }
  }
  return null;
}
function classNames(node) {
  const raw = attr(node, ['className']);
  if (!raw || raw === true) return [];
  const s = String(raw);
  const out = [];
  const re = /([A-Za-z0-9_$]+)\.([A-Za-z0-9_$]+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[2]);
  const lit = s.match(/(?:^|\s)([A-Za-z][A-Za-z0-9_-]*)(?:\s|$)/g);
  if (lit) lit.forEach((x) => { const t = x.trim(); if (t && !/^(styles|classNames|cn)$/.test(t) && !/[.=]/.test(t)) out.push(t); });
  return out;
}
function textOf(node) {
  const parts = [];
  const walk = (n) => {
    if (ts.isJsxText(n)) { const t = norm(n.text); if (t) parts.push(t); return; }
    if (ts.isJsxExpression(n) && n.expression) {
      const e = n.expression;
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) parts.push(e.text);
      else if (ts.isConditionalExpression(e)) walk(e.whenTrue);
      else if (ts.isParenthesizedExpression(e)) walk(e.expression);
      return;
    }
    // a nested element's text belongs to that element
  };
  (node.children || []).forEach(walk);
  return norm(parts.join(' '));
}
function elementTree(node, parts, scopeMap, depth) {
  if (depth > 9) return null;
  const nm = jsxName(tagNameOf(node));
  if (!nm) return null;
  let part = null;
  if (nm.part) { const cand = nm.owner + nm.part; if (parts.indexOf(cand) >= 0) part = cand; }
  if (!part && parts.indexOf(nm.name) >= 0) part = nm.name;
  const scope = attr(node, ['data-scope']) || (scopeMap[nm.name] && scopeMap[nm.name].scope) || null;
  const dataPart = attr(node, ['data-part']) || (scopeMap[nm.name] && scopeMap[nm.name].part) || null;
  const cls = classNames(node);
  const t = { t: 'el', tag: nm.name, part: part || dataPart || null, dataPart: dataPart || null, scope: scope, cls: cls, style: {} };
  const kids = [];
  let repeat = 1;
  (node.children || []).forEach((ch) => {
    if (ts.isJsxText(ch)) { const tx = norm(ch.text); if (tx) kids.push({ t: 'text', text: tx }); return; }
    if (ts.isJsxExpression(ch) && ch.expression) {
      const e = ch.expression;
      const addExpr = (x) => {
        if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x)) { const k = elementTree(x, parts, scopeMap, depth + 1); if (k) kids.push(k); }
        else if (ts.isConditionalExpression(x)) addExpr(x.whenTrue);
        else if (ts.isParenthesizedExpression(x)) addExpr(x.expression);
        else if (ts.isStringLiteral(x)) kids.push({ t: 'text', text: x.text });
      };
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'map') {
        repeat = 2;
        const cb = e.arguments[0];
        if (cb && ts.isArrowFunction(cb)) { const body = cb.body; if (ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body) || ts.isParenthesizedExpression(body)) addExpr(ts.isParenthesizedExpression(body) ? body.expression : body); }
      } else if (ts.isArrayLiteralExpression(e)) { if (e.elements.length) addExpr(e.elements[0]); }
      else addExpr(e);
      return;
    }
    if (ts.isJsxElement(ch) || ts.isJsxSelfClosingElement(ch)) { const k = elementTree(ch, parts, scopeMap, depth + 1); if (k) kids.push(k); }
    else if (ts.isJsxFragment(ch)) { ch.children.forEach((c2) => { if (ts.isJsxElement(c2) || ts.isJsxSelfClosingElement(c2)) { const k = elementTree(c2, parts, scopeMap, depth + 1); if (k) kids.push(k); } }); }
  });
  if (nm.name === 'svg' || /Icon$/.test(nm.name) || (kids.length === 0 && /icon/i.test(nm.name))) t.t = 'icon';
  else if (nm.name === 'img') t.t = 'media';
  else if (nm.name === 'input' || nm.name === 'textarea') t.t = 'input';
  else if (nm.name === 'button' || /(Trigger|Button|Action)$/.test(nm.name)) t.t = 'button';
  t.kids = kids;
  if (repeat > 1) t.repeat = repeat;
  const label = attr(node, ['placeholder', 'aria-label', 'title']);
  if (label && typeof label === 'string') t.label = label;
  const txt = textOf(node);
  if (txt) t.text = txt;
  return t;
}

function findJsx(node) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) { found = n; return; }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}
function exportedExamples(sf) {
  const out = [];
  const visit = (n) => {
    const mods = ts.canHaveModifiers && ts.canHaveModifiers(n) ? ts.getModifiers(n) || [] : (n.modifiers || []);
    const ex = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ex && (ts.isFunctionDeclaration(n) || ts.isVariableStatement(n))) {
      let name = null;
      if (ts.isFunctionDeclaration(n)) name = n.name && n.name.text;
      else if (n.declarationList) { const d = n.declarationList.declarations[0]; name = d && d.name && d.name.text; }
      if (name) {
        let jsx = null;
        if (ts.isFunctionDeclaration(n) && n.body) jsx = findJsx(n.body);
        else if (ts.isVariableStatement(n)) {
          const d = n.declarationList.declarations[0];
          if (d && d.initializer) jsx = findJsx(d.initializer);
        }
        if (jsx) out.push({ name: name, jsx: jsx });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// ---------------------------------------------------------------- style resolution
let CURRENT_VARS = {};
function resolveVars(v) {
  let s = String(v || '').trim();
  for (let k = 0; k < 4; k++) {
    const m = s.match(/^var\((--[a-z0-9-]+)\)$/i) || s.match(/^var\((--[a-z0-9-]+),\s*([^\)]+)\)$/i);
    if (!m) break;
    s = CURRENT_VARS[m[1]] !== undefined ? CURRENT_VARS[m[1]] : (m[2] || '');
  }
  return s;
}
function len(v, fs) {
  if (v == null) return null;
  let s = String(v).trim();
  if (/^var\(/i.test(s)) s = resolveVars(s);
  if (/^-?\d+(\.\d+)?px$/.test(s)) return Math.round(parseFloat(s));
  if (/^-?\d+(\.\d+)?rem$/.test(s)) return Math.round(parseFloat(s) * 16);
  if (/^\d+(\.\d+)?%$/.test(s)) return { pct: parseFloat(s) / 100 };
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  return null;
}
function color(v) {
  if (!v) return null;
  const s = String(v).trim();
  const t = s.match(/var\((--demo-[a-z-]+)/);
  if (t) return THEME[t[1]] || null;
  const h = s.match(/^#([0-9a-f]{3,8})$/i);
  if (h) return '#' + h[1];
  return null;
}
function box4(v) {
  if (!v) return null;
  const ps = String(v).trim().split(/\s+/).map((x) => len(x));
  if (ps.some((x) => x === null)) return null;
  if (ps.length === 1) return [ps[0], ps[0], ps[0], ps[0]];
  if (ps.length === 2) return [ps[0], ps[1], ps[0], ps[1]];
  if (ps.length === 3) return [ps[0], ps[1], ps[2], ps[1]];
  return [ps[0], ps[1], ps[2], ps[3]];
}
function resolveStyle(decl, out) {
  out = out || {};
  if (!decl) return out;
  CURRENT_VARS = {};
  Object.keys(decl).forEach((k) => { if (k.indexOf('--') === 0) CURRENT_VARS[k] = decl[k]; });
  const fs = len(decl['font-size']);
  if (fs) out.fs = fs;
  if (decl['font-weight']) out.fw = parseInt(decl['font-weight'], 10) || null;
  if (decl['line-height']) {
    const lh = len(decl['line-height']);
    if (typeof lh === 'number') out.lh = lh; else if (/^\d+(\.\d+)?$/.test(decl['line-height'])) out.lh = Math.round(parseFloat(decl['line-height']) * (fs || 13));
  }
  const c = color(decl.color); if (c) out.color = c;
  if (decl['text-align']) out.align = decl['text-align'];
  if (decl['text-transform']) out.tt = decl['text-transform'];
  const bg = color(decl.background || decl['background-color']); if (bg) out.bg = bg;
  if (decl.border && !/none/.test(decl.border)) {
    const m = decl.border.match(/(\d+(?:\.\d+)?px)\s+\w+\s+(.+)$/);
    if (m) { out.bw = len(m[1]); out.bc = color(m[2]) || 'border'; }
  }
  if (decl['border-width']) out.bw = len(decl['border-width']);
  if (decl['border-color']) out.bc = color(decl['border-color']) || 'border';
  if (decl['border-radius']) { const r = box4(decl['border-radius']); if (r) out.radius = r[0]; }
  if (decl.padding) { const p = box4(decl.padding); if (p) out.pad = p; }
  if (decl.gap) { const g = box4(decl.gap); if (g) out.gap = g[0]; }
  if (decl.display) out.display = decl.display;
  if (decl['flex-direction']) out.dir = decl['flex-direction'];
  if (decl['align-items']) out.alignItems = decl['align-items'];
  if (decl['justify-content']) out.justify = decl['justify-content'];
  if (decl.position) out.pos = decl.position;
  ['top', 'right', 'bottom', 'left'].forEach((k) => { if (decl[k] != null) out[k] = len(decl[k]); });
  if (decl.width) out.w = len(decl.width);
  if (decl.height) out.h = len(decl.height);
  if (decl['min-height']) out.minH = len(decl['min-height']);
  if (decl['max-width']) out.maxW = len(decl['max-width']);
  if (decl['aspect-ratio']) out.aspect = decl['aspect-ratio'];
  if (decl['letter-spacing']) out.ls = len(decl['letter-spacing']);
  if (decl.opacity) out.op = parseFloat(decl.opacity);
  if (decl.overflow === 'hidden') out.clip = true;
  return out;
}

const cssCache = {};
function cssFor(files) {
  const key = files.join('|');
  if (cssCache[key]) return cssCache[key];
  const acc = { byClass: {}, byPart: {}, byTag: {} };
  files.forEach((f) => {
    const p = path.join(CSSDIR, path.basename(f));
    const c = parseCss(read(p));
    ['byClass', 'byPart', 'byTag'].forEach((k) => Object.keys(c[k]).forEach((s) => { acc[k][s] = Object.assign(acc[k][s] || {}, c[k][s]); }));
  });
  cssCache[key] = acc;
  return acc;
}
function styleFor(node, css, scopeMap) {
  const decl = {};
  const merge = (d) => { if (d) Object.keys(d).forEach((k) => { decl[k] = d[k]; }); };
  ['stack', 'row', 'column', 'wrap'].forEach((u) => merge(css.byClass[u]));
  (node.cls || []).forEach((c) => merge(css.byClass[c]));
  const map = scopeMap[node.tag] || {};
  const sc = node.scope || map.scope;
  const pt = map.part || node.part;
  if (sc && pt) merge(css.byPart[sc + '|' + pt]);
  if (css.byTag[node.tag]) merge(css.byTag[node.tag]);
  const st = resolveStyle(decl, {});
  if (node.t === 'text' && !st.fs) st.fs = 13;
  return st;
}
function annotate(node, css, scopeMap, inherited) {
  const own = styleFor(node, css, scopeMap);
  // only inherit type properties, not layout
  ['fs', 'fw', 'lh', 'color', 'align', 'tt', 'ls'].forEach((k) => { if (inherited && inherited[k] !== undefined && own[k] === undefined) own[k] = inherited[k]; });
  node.style = own;
  if (node.kids) node.kids.forEach((k) => annotate(k, css, scopeMap, { fs: own.fs, fw: own.fw, lh: own.lh, color: own.color }));
}

// ---------------------------------------------------------------- main
function main() {
  const man = JSON.parse(read(MANIFEST));
  const scopeMap = buildScopeMap(SRC);
  const out = { version: 1, source: 'codesign-ui examples + .storybook/modules', components: {} };
  let done = 0, skipped = [];
  man.components.forEach((c) => {
    if (c.factory !== 'custom' || c.kind !== 'visual') return;
    if (ONLY && ONLY.indexOf(c.name) < 0) return;
    const dir = path.join(SRC, c.source);
    const exDir = path.join(dir, 'examples');
    if (!fs.existsSync(exDir)) { skipped.push(c.name + ':no-examples'); return; }
    const files = fs.readdirSync(exDir).filter((f) => /\.tsx$/.test(f) && !/\.(test|stories)\./.test(f));
    if (!files.length) { skipped.push(c.name + ':empty-examples'); return; }
    const exFile = files.indexOf('basic.tsx') >= 0 ? 'basic.tsx' : files[0];
    const exPath = path.join(exDir, exFile);
    const src = read(exPath); if (!src) { skipped.push(c.name + ':unreadable'); return; }
    const sf = ts.createSourceFile(exPath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const examples = exportedExamples(sf);
    if (!examples.length) { skipped.push(c.name + ':no-export'); return; }
    const parts = c.parts || [];
    // Root selection: prefer `FamilyRoot`, then the family name, then any `*Root`, then the SHALLOWEST part element.
    // The old scan took the first part in depth-first order (AngleSlider.Thumb, Clipboard.Input, ...), so the anatomy
    // was a single leaf. The root is the outermost element that owns the family.
    const rootName = c.name + 'Root';
    const visitJsx = (n, depth, fn) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
        fn(n, depth);
        if (ts.isJsxElement(n)) n.children.forEach((ch) => visitJsx(ch, depth + 1, fn));
        return;
      }
      if (ts.isJsxExpression(n) && n.expression) {
        const e = n.expression;
        if (ts.isParenthesizedExpression(e)) return visitJsx(e.expression, depth, fn);
        if (ts.isConditionalExpression(e)) { visitJsx(e.whenTrue, depth, fn); visitJsx(e.whenFalse, depth, fn); return; }
        if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'map') {
          const cb = e.arguments[0];
          if (cb && ts.isArrowFunction(cb)) visitJsx(cb.body, depth, fn);
          return;
        }
      }
      ts.forEachChild(n, (ch) => visitJsx(ch, depth, fn));
    };
    let best = null;
    examples.forEach((ex) => {
      visitJsx(ex.jsx, 0, (n, depth) => {
        const nm = jsxName(tagNameOf(n)); if (!nm) return;
        const cand = nm.part ? nm.owner + nm.part : nm.name;
        if (parts.indexOf(cand) < 0 && nm.name !== c.name) return;
        const prio = cand === rootName ? 3 : (cand === c.name ? 2 : (cand.endsWith('Root') ? 1 : 0));
        if (!best || prio > best.prio || (prio === best.prio && depth < best.depth)) best = { node: n, depth: depth, prio: prio, ex: ex };
      });
    });
    if (!best) { skipped.push(c.name + ':no-root'); return; }
    const picked = best.ex;
    const src2 = read(path.join(exDir, exFile)); // keep the original source for import scanning
    // imports: styles/*.module.css
    const imports = [];
    const exSrc = picked && picked.srcFile ? read(picked.srcFile) : src;
    const impRe = /from\s+['"]styles\/([A-Za-z0-9_-]+\.module\.css)['"]/g;
    let m;
    while ((m = impRe.exec(exSrc || src))) imports.push(m[1]);
    if (!imports.length) imports.push(c.dir + '.module.css');
    if (c.group === 'ai' && imports.indexOf('ai.module.css') < 0) imports.push('ai.module.css');
    const css = cssFor(imports);
    const rootNode = best.node;
    const tree = elementTree(rootNode, parts, scopeMap, 0);
    if (!tree) { skipped.push(c.name + ':no-tree'); return; }
    annotate(tree, css, scopeMap);
    out.components[c.name] = { name: c.name, example: path.relative(SRC, exPath), styles: imports, root: tree };
    done++;
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(JSON.stringify({ written: OUT, components: done, skipped, bytes: fs.statSync(OUT).size }));
}
main();
