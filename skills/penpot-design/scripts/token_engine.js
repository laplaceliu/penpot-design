// token_engine.js —— Penpot Design Tokens 可执行引擎（建集 / 应用 / 体检）
// 用法：整份粘贴进 execute_code 执行一次（字面量函数入 storage 跨调用复用）。
// 依据：references/design-tokens.md（全部结论为本机实测，含 5 条铁律与 6 个应用坑）。
//
// 为什么需要它：seed_storage.js 里的 storage.T 只是 JS 侧的颜色镜像，**不创建任何 Penpot token**。
// 真正录入 library tokens 走本引擎。
//
// 三件事的顺序（不可颠倒）：
//   tokenSeed(spec)          建 set + 录 token（**自动 active:true**）
//   await tokenApply(...)    应用（自带 readback 校验，静默失败会抛错）
//   tokenAudit()             体检（未激活 / 引用断裂 / 缺项）

return (function () {
  const cat = () => penpot.library.local.tokens;
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));

  const TK = {};
  storage.TK = TK;

  // ---------- 查询 ----------
  TK.set = (name) => Array.from(cat().sets).find((s) => s.name === name) || null;

  // 按名字找 token：**从后往前找第一个定义它的「激活」set**，与 Penpot 的解析优先级一致
  TK.find = function (name) {
    const sets = Array.from(cat().sets);
    for (let i = sets.length - 1; i >= 0; i--) {
      if (!sets[i].active) continue;
      const t = Array.from(sets[i].tokens).find((x) => x.name === name);
      if (t) return t;
    }
    return null;
  };

  // ---------- 建集 ----------
  // 铁律 1：addSet 默认 active:false，未激活 = 绑定记上了但值不生效（静默失败）。
  TK.ensureSet = function (name, active) {
    let s = TK.set(name);
    if (!s) s = cat().addSet({ name: name, active: active === false ? false : true });
    const want = active === false ? false : true;
    if (s.active !== want) { try { s.toggleActive(); } catch (e) {} }
    return s;
  };

  // ---------- 录 token（幂等：同值跳过，异值重建） ----------
  TK.put = function (setName, type, name, value) {
    const s = TK.ensureSet(setName);
    const old = Array.from(s.tokens).find((t) => t.name === name);
    if (old) {
      let same = false;
      try { same = JSON.stringify(old.value) === JSON.stringify(value); } catch (e) {}
      if (same) return { name: name, type: old.type, action: 'kept' };
      try { old.remove(); } catch (e) { return { name: name, err: 'remove failed: ' + String(e).slice(0, 80) }; }
    }
    try {
      const t = s.addToken({ type: type, name: name, value: value });
      return { name: name, type: t.type, action: old ? 'replaced' : 'added' };
    } catch (e) {
      return { name: name, err: String(e).slice(0, 140) };
    }
  };

  // ---------- 批量播种 ----------
  // spec = [{ set:'pix · Core', active:true, tokens:[ ['color','color.primary','#FF471D'], ... ] }]
  // 注意：set 按「是否一起激活」切，**不是按类型切**——一个 set 可以装下全部 17 类（见 references/design-tokens.md §1.1）
  // 也接受 { set, tokens: { name: {type, value} } } 写法（再宽松一点）
  TK.seed = function (spec) {
    const log = [];
    (spec || []).forEach((grp) => {
      const set = TK.ensureSet(grp.set, grp.active);
      const list = Array.isArray(grp.tokens)
        ? grp.tokens.map((row) => ({ type: row[0], name: row[1], value: row[2] }))
        : Object.keys(grp.tokens || {}).map((k) => ({ name: k, type: grp.tokens[k].type, value: grp.tokens[k].value }));
      list.forEach((t) => log.push(Object.assign({ set: set.name }, TK.put(grp.set, t.type, t.name, t.value))));
    });
    return { sets: Array.from(cat().sets).map((s) => s.name + (s.active ? '' : '(INACTIVE!)')), log: log };
  };

  // ---------- 应用（带 readback 校验） ----------
  // 铁律 2/3：省略 properties 用默认属性；`'all'` 不可用；不适用=静默成功，故必须回读。
  TK.apply = async function (tokenName, shapes, props) {
    const arr = Array.isArray(shapes) ? shapes : [shapes];
    const t = TK.find(tokenName);
    if (!t) return { ok: false, err: 'token 不存在或所在 set 未激活: ' + tokenName };
    let apiOk = true, apiErr = null;
    try { props && props.length ? t.applyToShapes(arr, props) : t.applyToShapes(arr); }
    catch (e) { apiOk = false; apiErr = String(e).slice(0, 160); }
    await nap(500);
    const report = arr.map((sh) => {
      let map = {};
      try { map = sh.tokens || {}; } catch (e) {}
      const keys = Object.keys(map).filter((k) => map[k] === tokenName);
      return { shape: sh.name, bound: keys.length > 0, keys: keys };
    });
    const allBound = report.every((r) => r.bound);
    return {
      ok: apiOk && allBound,
      token: tokenName,
      type: t.type,
      apiOk: apiOk, apiErr: apiErr,
      note: (apiOk && !allBound) ? 'API 未报错但未记录绑定 → 形状不支持该属性，或 set 未激活' : (allBound ? null : null),
      shapes: report
    };
  };

  // ---------- 解除绑定 ----------
  // 没有 removeToken API：直接写属性。**细则：写相同值不解绑，必须先写一个不同的值**。
  TK.unbindFill = async function (shape) {
    const keep = (() => { try { return shape.fills[0].fillColor; } catch (e) { return null; } })();
    const op = (() => { try { return shape.fills[0].fillOpacity; } catch (e) { return 1; } })();
    shape.fills = [{ fillColor: '#000001', fillOpacity: op == null ? 1 : op }];
    await nap(400);
    shape.fills = [{ fillColor: keep, fillOpacity: op == null ? 1 : op }];
    await nap(400);
    return { shape: shape.name, fill: keep, tokens: JSON.stringify(shape.tokens) };
  };

  TK.unbindStroke = async function (shape) {
    const st = (() => { try { return shape.strokes[0]; } catch (e) { return null; } })();
    if (!st) return { shape: shape.name, note: 'no stroke' };
    const keep = { strokeColor: st.strokeColor, strokeOpacity: st.strokeOpacity, strokeWidth: st.strokeWidth, strokeAlignment: st.strokeAlignment };
    shape.strokes = [Object.assign({}, keep, { strokeColor: '#000001' })];
    await nap(400);
    shape.strokes = [keep];
    await nap(400);
    return { shape: shape.name, tokens: JSON.stringify(shape.tokens) };
  };

  // ---------- 体检 ----------
  TK.audit = function () {
    const sets = Array.from(cat().sets);
    const inactiveSets = [], unresolved = [], dupNames = {};
    const detail = sets.map((s) => {
      const toks = Array.from(s.tokens);
      if (!s.active) inactiveSets.push(s.name);
      toks.forEach((t) => {
        if (!t.resolvedValueString) unresolved.push(s.name + ' / ' + t.name + ' (' + t.type + ')');
        dupNames[t.name] = dupNames[t.name] || [];
        dupNames[t.name].push(s.name);
      });
      return { name: s.name, active: s.active, tokens: toks.length, types: toks.reduce((a, t) => { a[t.type] = (a[t.type] || 0) + 1; return a; }, {}) };
    });
    const conflicts = Object.keys(dupNames).filter((k) => dupNames[k].length > 1).map((k) => k + ' ← ' + dupNames[k].join(', '));
    return {
      ok: inactiveSets.length === 0 && unresolved.length === 0,
      setOrder: sets.map((s) => s.name),
      sets: detail,
      inactiveSets: inactiveSets,
      unresolved: unresolved,
      sameNameAcrossSets: conflicts,
      themes: Array.from(cat().themes).map((t) => ({ group: t.group, name: t.name, active: t.active, sets: Array.from(t.activeSets).map((x) => x.name) })),
      hint: inactiveSets.length ? '存在未激活 set：其中的 token 绑定会「成功但不生效」，请 ensureSet 激活' :
            (unresolved.length ? '存在无法解析的 token：多为引用断链（被引用者不在激活 set 中）' : '全部 token 可解析')
    };
  };

  // 便捷：一句话体检并抛错（用于门禁）
  TK.assert = function () {
    const a = TK.audit();
    if (!a.ok) throw new Error('token 体检未通过：' + JSON.stringify({ inactive: a.inactiveSets, unresolved: a.unresolved }));
    return a;
  };

  return { seeded: true, fns: ['TK.seed', 'TK.ensureSet', 'TK.put', 'TK.find', 'TK.apply', 'TK.unbindFill', 'TK.unbindStroke', 'TK.audit', 'TK.assert'] };
})();
