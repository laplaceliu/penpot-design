# Penpot MCP execute_code API 陷阱详解

每条均为实战踩坑验证（93 组件设计系统构建 + 多轮修复）。按主题组织，含机理与修复代码。

## 1. 坐标系

- `child.x / child.y`：**世界坐标**（画布绝对）。`board.x / board.y` 也是世界坐标。
- `child.parentX / child.parentY`：**父内相对坐标**。
- 换算：`parentX = worldX - parent.x`；反向 `worldX = parent.x + parentX`。
- 包含判断、宿主吸附、网格推算必须**全程统一世界坐标**。混用 parentX 会产生跨层级假包含（例：把页级标题误吸进 Modal 组件中心）。
- 修复后的正确写法：`c.parentX = nx - c.parent.x`（nx 为期望世界 x）。

### appendChild 世界坐标规则

`appendChild` **保留世界坐标**。两种正确顺序：

```js
// (a) 先放最终世界坐标，再 append
child.x = finalWorldX; child.y = finalWorldY;
parent.appendChild(child);

// (b) 先 append，再设相对坐标
parent.appendChild(child);
penpotUtils.setParentXY(child, relX, relY);   // 注意：对组件主实例子元素会失败，见 §5
child.parentX = relX; child.parentY = relY;   // 直接赋值兜底
```

错误顺序（先设"相对意图值"再 append 到非原点父板）→ 子元素落在页面原点。
批量修复（幂等、顺序无关）：对每个非根父级的子元素 `setParentXY(child, child.x, child.y)`（相对:=当前世界）；**变体容器的直接子级要跳过**。

### 移动机制优先级

```js
const move = (s, px, py) => {
  try { s.parentX = px; s.parentY = py; return true; } catch(e1) {}   // 首选：处处可用
  try { s.x = px; s.y = py; return true; } catch(e2) {}               // 兜底：世界坐标
  return false;
};
```

`penpotUtils.setParentXY` 存在且对普通形状可用，但对**组件主实例的子元素**会抛错。

## 2. Path 与贝塞尔

- Path 对象**没有 `setPathData` 方法**（调用静默失败于 try/catch 中）。唯一入口：`path.d` 属性。
- `path.d` 的 getter/setter 均为**世界坐标**；写入后 width/height 自动适配包围盒（d 不随对象移动而改变——移动改的是 x/y）。
- 新建 `penpot.createPath()` 默认 `d = "M0,0L100,100"`（对角线）——导出图上出现莫名对角线就是有路径没被赋值。
- SVG arc `A` 命令**不渲染**（静默忽略）。弧线必须转三次贝塞尔：

```js
// 圆弧 → 三次贝塞尔（每段 ≤90°）。返回世界坐标 d。
function bez(cx, cy, r, a0deg, a1deg) {
  const segs = Math.max(1, Math.ceil(Math.abs(a1deg - a0deg) / 90));
  const a0 = a0deg * Math.PI / 180;
  const total = (a1deg - a0deg) * Math.PI / 180;
  let d = 'M ' + (cx + r * Math.cos(a0)).toFixed(2) + ' ' + (cy + r * Math.sin(a0)).toFixed(2);
  let prev = a0;
  for (let i = 1; i <= segs; i++) {
    const next = a0 + total * i / segs;
    const k = 4 / 3 * Math.tan((next - prev) / 4);
    const p0x = cx + r * Math.cos(prev), p0y = cy + r * Math.sin(prev);
    const p1x = cx + r * Math.cos(next), p1y = cy + r * Math.sin(next);
    d += ' C ' + (p0x - k * r * Math.sin(prev)).toFixed(2) + ' ' + (p0y + k * r * Math.cos(prev)).toFixed(2)
       + ' '   + (p1x + k * r * Math.sin(next)).toFixed(2) + ' ' + (p1y - k * r * Math.cos(next)).toFixed(2)
       + ' '   + p1x.toFixed(2) + ' ' + p1y.toFixed(2);
    prev = next;
  }
  return d;
}
```

- M/L/C 命令正常。折线 `toD = pts => 'M ' + pts.map(p => p[0]+' '+p[1]).join(' L ')`。
- 面积图：折线 d 末尾接 `L x_last y_base L x_first y_base Z`。
- **带箭头气泡（Popover/Tooltip）**：把气泡轮廓+箭头凸起合并为**一条连续路径**（圆角用 kappa 近似，箭头为底边 V 形凸起）。不要用"旋转 45° 的方块贴边"当箭头——z 序在面板上方会显 ✕ 交叉线，在下方会被面板底边描边横穿。

## 3. 描边 strokeAlignment

- 属性名是 `strokes[i].strokeAlignment`，取值 `'center' | 'inner' | 'outer'`。**不存在** `strokeWidthAlignment`——赋值被静默丢弃，属性留 `null`。
- `null` 的行为：导出渲染器 ≈ center；**编辑器画布渲染器对圆角会画双线**。
- `center`：线宽向内外各溢半。形状**贴父板边缘**时外半被板裁剪 → 直边只剩内半、圆角弧内收处保留全宽 → "圆角两条线宽/粗细不均"。
- `inner`：线完全画在形状内部，永不裁剪、不被相邻元素盖住。inner 的圆角接缝只在极端值（r60 + w10）出现；设计规格 w1-2 / r≤20 干净。
- **结论：闭合形状（rect/ellipse/board）一律显式 `'inner'`；开放路径（弧线/折线，stroke 即线条本身）用 `'center'`**（inner 对开放路径语义不适用，且路径四周留白无裁剪风险）。
- 验证法：建放大对照板（r60、w10，四种对齐并排），导出肉眼比对 + 全页统计 `strokes.some(st => !st.strokeAlignment)`。
- 批量修复：

```js
c.strokes = c.strokes.map(st => Object.assign({}, st, { strokeAlignment: want }));
```

## 4. 裁剪 clipContent

- 属性名是 board 的 **`clipContent`**（不是 clipsContent——读到 undefined 先怀疑属性名）。默认 `true`。
- 机理：drop-shadow 向形状外辐射（blur+spread）。形状贴父板边缘（如按钮帽与其实例板同尺寸）时辉光全部被裁 → 编辑器里发光不可见，把元素拖出容器才显形。
- 修复：发光元素所在板全部 `clipContent = false`。安全性：辉光半径（blur 20 + spread 1 ≈ 21px）需小于组件间距（38-40px），否则相邻辉光互相污染。
- 全文件批修：walk 所有 `type==='board' && clipContent===true` → false。

## 5. 文本

- `Text.letterSpacing` 只接受**数字字符串**（px）。`t.fontSize = String(size)`。传 `'0.02em'`/`'2%'` 报错。
- **创建瞬间的 `t.width/t.height` 不可信**（可能 1×1 瞬态值）：`penpot.createText()` 返回后立即量宽高算居中，
  会把错误偏移烤进坐标——`(w−1)/2` 的算术后果是**文本左上角恰好落在宿主中心点**（stale-center 指纹，
  实测 37×15 标签在 110×32 药丸里右偏 18.5px、下偏 7.5px，16 页系统性复制）。
  - 预防：居中一律**渲染后实测**——`await storage.ct(...)`（canonical，内部 `sleep(120)`）或
    `storage.centerIn(t, host)`（文本已渲染时同步版）。**不要**在工厂里同步读 `t.width` 算偏移。
  - 事后修复：`storage.fixStaleCenter()`（指纹判定、按轴独立、零误伤），审计以 `text_centre_residue stale-center` 标出。
    详见 `positioning-audit.md` S2 与 `engines.md` §1。
- 阴影颜色必须对象格式 `{color, opacity}`；传字符串 hex 被**静默转为黑色**（渲染 3D 阴影消失的根因）。半透明填充用 `fillOpacity` 字段（不要 rgba 嵌套 color 对象）。
- **CJK 字体回退是系统性问题**：Penpot **没有** CSS 字体栈按字符回退——`font.applyToText(text, variant)` 整段生效。Nunito 等拉丁字体只含拉丁字形，中文渲染为乱码（用户报告"字体渲染不对"的最常见根因）。
  - 预防：mkText 创建时按内容分流 `const cjk = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/.test(str); const font = cjk ? noto : latin;`
  - 存量批修：walk 全部 text，`cjkRe.test(c.characters)` 命中则 `noto.applyToText(c, notoVar(c.fontWeight))`。**`Text.fontWeight` 可直接读**（返回当前字重字符串），同字重替换不破坏排版。实测一次批修 89 处。
- 中文字形：Noto Sans SC 全字重可用。等宽数字 JetBrains Mono、科技标题 Orbitron 均可用。`penpot.fonts.findByName(name)` + `font.applyToText(text, variant)`，variant 按 fontWeight 匹配。
- **Emoji 渲染为像素风图形**（编辑器与导出 PNG 一致）：对游戏风/像素风是加分项，可直接当图标占位（Image 相框、app 图标、BackTop 气球）；对严肃商务风慎用。
- growType：'auto-width'（默认理想）/ 'fixed' / 'auto-height'。固定宽居中文本用 fixed + align。
- **陈旧测量陷阱**：创建瞬间读 `t.width/t.height` 可能是 1×1（布局未完成）。用它们算居中 → 偏移数像素到数十像素（实测案例：箭头文字偏 13px、状态条偏 45.5px、日历选中数字偏 5.5px）。
- **居中必须在渲染后做**：`t.parentX = cx - t.width / 2`（此时 width 是渲染实宽）。构建时可先粗放，最后跑一轮对齐引擎统一校正。方案 C（absolute）下同理：`absMount` 里的居中写在文本创建后（此时 width 通常已就绪，但保险起见构建完成后跑一轮校正）。

## 6. 变体与组件

- `createVariantContainer(items)` 的 items 必须是**已注册库组件的主实例**：`{ shape: comp.mainInstance(), properties: { Prop: value } }`。直接传 ShapeProxy 报 "ShapeProxy invalid"。
- 注册：`penpot.library.local.createComponent([realShape])`——原形状就地变主实例；**`comp.remove()` 连主实例一起删**。事故链：批量去重时删除重名组件 → 散落在各展示板的主实例被删 → 展示板被掏空（实测 6 个板被清空，用户视角"组件都消失了"）。铁律：
  1. **注册一律用专用母版板**（'AI Component Masters'）里的形状，母版被注册消耗后重建母版再注册；
  2. 展示板被掏空后按配方整体重建（板级重建比逐个补形状可靠）；
  3. 组件名赋值 `comp.name = ...` 后立即 readback 验证——不允许 `/` 时赋值静默失败，readback 还是旧名。
- 变体容器 reparent 后，**实例内部子元素偏移**（实测 +30,30）→ 按设计相对坐标重置。已知配方：
  - Button（160×52）：cap(0,0)，text(80−w/2, 26−h/2)
  - Toggle（76×44）：track(12,8)，dot On(39,11)/Off(15,11)
  - Checkbox（120×32）：box(0,4)，✓(11−w/2, 15−h/2)，label(32, 15−h/2)
  - Switch（76×44）：track(12,7)，dot On(37,10)/Off(15,10)
- 组件对象无 `makeInstance`，无法脚本化生成实例。
- 组件板要收编进页头板（`head.appendChild(compBoard)`，同页 reparent 世界坐标不变），否则导出头板时组件缺失。判定头板用 `root.children.find(c => c.type === 'board')`（root 里可能混有孤儿文本，别用 children[0]）。

### 6.1 group 语义与装配归属（契约：penpot-structure.md §4.1）

- **API**：`penpot.group(shapes)` 就地成组（同父级内，**无 parent 参数**），返回 `Group`；`penpot.ungroup(g)` 解组。
- **⚠️ `penpot.group` 有破坏性副作用（实测，必须补偿）**：成组后
  1. 新组的 `layoutChild.absolute` 为 **false**（组成为 flex 流子元素）→ flex 父板把组**流式重排**到列首堆叠；
  2. 成员整体平移：组被放到父原点，成员相对布局保留但**绝对位置偏移 −(成员 bbox 的 minParentXY)**；
  3. 父板若是 hug，流子元素计入后**板尺寸被撑大**。
  `penpot.ungroup(g)` **不还原坐标**（成员按组内相对坐标落回，越修越乱）——group/ungroup 往返不可用于回滚！
  **补偿式成组（canonical，零位移）**：
  ```js
  const minPX = Math.min(...shapes.map(s => s.parentX)), minPY = Math.min(...shapes.map(s => s.parentY));
  const g = penpot.group(shapes);
  g.layoutChild.absolute = true;          // 逃出 flex 流
  g.parentX = minPX; g.parentY = minPY;   // 恢复 bbox 原位（写后必须 readback 校验）
  ```
  修复引擎 `groupAssemblies()` 已内置此补偿；裸调 `penpot.group` 后必须做同样的三步。
- **⚠️ 成组会打乱前后顺序（z-order）**：`parentIndex` **越大越靠前（0=最底）**，`bringToFront()` 落到最后一个 index；
  `penpot.group` 对成员 z 序不透明——实测会把**底板排到标签上面**（标签被盖住，导出纯色块）。
  成组后必须修 z：组内按**面积降序** `setParentIndex(i)`（大底在下、文字/图标在上），
  组本身 `setParentIndex(顶层成员原 parentIndex)` 保住层槽；实例替换同理（`inst.setParentIndex(原组 index)`）。
  验证注意：**小形状组的 export 可能命中导出缓存假象**（看起来没文字），以**整板导出**为准。
  批修引擎 `storage.fixZOrder()`（groupAssemblies 已内置同逻辑）。
- **组与板的差别**：对含 absolute 子元素的**板**赋 x/y 是"壳动内容不动"（子元素世界坐标不跟随）；
  **组不同——移动组壳会带动子元素**（组是边界包装器），所以装配收组后整体拖动/复用是安全的。
- **归属三级**：复用装配 → component（`createComponent([group])`，页面 `comp.instance()`）；
  单次成套 → group；分区容器 → board。**成套图元禁止散件同级堆叠**（审计签名 `loose_assembly`，
  修复 `groupAssemblies()`，门禁 G10）。
- **组名** = 宿主名 / `组件名·变体`；组件名禁 `/`（赋值静默失败）。
- **嵌套是常态**：按钮组收进导航条组——由内而外逐层 `penpot.group`；`createComponent` 可以吃嵌套组。
- **注册顺序**：先 group 收拢 → 再 `createComponent([group])`；散件直接注册会得到残缺组件。

## 7. 沙箱与代理

- execute_code 沙箱注入的 `penpotUtils` / `storage` **不是真全局**：`new Function` / `eval` 序列化的函数体内访问不到（报 "reading 'xxx' of undefined"）。闭包字面量函数可跨调用存活（存 storage）。
- 引擎更新不要用字符串替换 + `new Function('return ' + src)()`——会丢作用域；直接整函数字面量重写。
- `shape.children` 每次访问生成**新代理对象**：`Array.from(children)` 之前做 filter/indexOf 全是 -1。正确：先快照 `const kids = Array.from(node.children)` 再操作。
- 返回值只含原始值；返回带函数的对象（如 makeMask）structuredClone 失败。
- `penpotUtils.findShapeById(id)` 全文件有效（跨页）；修改前仍需激活所属页。

## 8. 崩溃损伤诊断

- 症状：某页组件"散架"（板内容溢出）或整页导出全黑（头板 100×100 裁剪一切）。
- 检测：walk 全页，非文本图元 `Math.round(w)===100 && Math.round(h)===100` 即损伤。
- 修复：按设计规格 resize（板 + 贴边矩形/圆形子元素）。文本不用动。
- 预防：控制单调用批量、避免高频切页、大辉光场景建议用户禁用 WebGL。

## 9. 导出 export_shape

- 只能导出**当前激活页**上的形状（render URL 绑定当前 page-id）——传了别页的 ID 会渲染出错误内容或空图。
- 大板（3000px+）可能超时：重试即可（实测 3140px 整页第 3 次成功）。偶发陈旧缓存黑图：重试。
- **板重建后 id 变化**：`remove` + 重建同名板后旧 id 失效，导出报 "Cannot read properties of null"——重新收集 `board.id`。
- **布局过渡态**：数据 readback 全对但渲染错乱/按钮塌陷——布局引擎异步重排未完成，等待 1s+ 重新导出再判断。
- 导出图与编辑器渲染有差异（见 §3/§4）——最终以编辑器为准。

## 10. 布局引擎（flex / layoutChild）

### 三种方案的实测行为

| 方案 | 构建 | 渲染 | 实测结论 |
|---|---|---|---|
| A. 裸板 + 世界坐标 append | 简单 | 多数环境正常；部分文件/版本导出整体偏移 `-board.y`（readback 正确、渲染错位） | 环境相关，首板导出验收后再批量用 |
| B. flex 自动布局 | 引擎排版 | 嵌套 board 子元素被强制 hug（160×45 按钮塌成文字大小）；`layoutChild.horizontalSizing='fix'` 声明后仍被异步重置；`minWidth/minHeight` 同样被覆盖；无 `removeFlexLayout()` API | 嵌套板场景不可控 |
| **C. flex 容器 + 全员 absolute + 世界坐标** | 手动坐标 | 33 组件 + 3 整页（Landing 1440×3140 等）0 渲染失败 | **推荐兜底**；absolute 子元素位置绝对化，彻底绕开 flex 重排 |

### 方案 C 的关键细节

- `child.layoutChild.absolute = true` **必须在 appendChild 之后**设置（之前设置无效）。
- absolute 模式下 `child.x/y` 读写均为世界坐标（与普通形状一致）。
- 容器自身 `horizontalSizing/verticalSizing = 'fixed'` 防引擎改尺寸；`addFlexLayout()` 后 `flex.dir` 必须赋值（只 add 不设 dir 有默认行为差异）。
- **板 resize 不影响 absolute 子元素**——安全扩容画框（Dashboard 底部组件重叠时下移子元素 + resize 板加高，一步完成）。
- **移动板（赋 x/y）absolute 子元素不跟随**——构建时直接放最终坐标；确需移动时逐元素补偿（walk 子树按同一 dy 平移）。
- 诊断口诀：**readback 对、渲染错 → 方案 A 失效换 C；数据对、渲染塌 → flex hug，全员 absolute 重排**。

### 压塌修复引擎

见 `scripts/fix_layout.js`（getDesignSize 按名称恢复设计尺寸 + absRow 手动重排 + fixCol 容器修正，两轮收敛；用法与顺序陷阱见 engines.md §3）。

## 11. openPage 超时落错页（数据安全事故）

execute_code 30s 超时被杀时，调用内的 `penpot.openPage` 可能**未提交**。下一条命令若以"假设已在目标页"开头直接执行 remove/创建，会落在**旧页**上——实测教训：超时后下一条的 `for (c of root.children) c.remove()` 清空了 Foundations 整页。

防御链：
1. 超时后的第一条命令**只做** `openPage(pg) + sleep(400) + return currentPage.name`；
2. 页名匹配才执行操作；
3. 全页 remove 前先 `return` 顶层板清单人工确认（或限定 `name.startsWith('xxx')` 条件删除，绝不裸 remove 全部）。

## 12. 属性名必须核对 API，写错会静默失败（最贵的一类坑）

**铁律：给形状写属性前，用 `penpot_api_info`（如 `{"type":"Text"}`）核对属性名；写入后立刻 readback。**
Penpot 的形状代理对**不存在的属性名不报错**——在 `try/catch` 下就是静默失败，代码"看起来跑了"。

### 12.1 实例：`align` 不是 `horizontalAlign`

文本水平对齐的正确属性是 **`align`**（`"center" | "left" | "right" | "mixed" | "justify" | null`）；
垂直对齐是 `verticalAlign`。**不存在 `horizontalAlign`**。

```js
t.horizontalAlign = 'center';   // ✗ 静默失败，属性仍是原值
t.align = 'center';             // ✓
// 必须 readback：
if (t.align !== 'center') throw new Error('align 未生效');   // readback 是唯一判据
```

实测后果：23 处修复全部未生效，居中/右对齐文本退化为左对齐，导出图上"标签贴左边缘"。
**诊断口诀：读回 `undefined` ⇒ 属性名错；读回旧值 ⇒ 赋值被拒（类型/取值非法）。**

同类需注意的属性名差异：`strokes[i].strokeAlignment`（不是 `strokeWidthAlignment`）、
board 的 `clipContent`（不是 `clipsContent`）、椭圆用 `penpot.createEllipse()`。

### 12.2 修正 §10：`layoutChild.absolute = true` **不保证**「移动板子元素不跟随」

§10 曾记「移动板（赋 x/y）absolute 子元素不跟随」。**实测在 Penpot 2.17 上不成立**：

- 某 Demo 板的子元素 `c.layoutChild.absolute` 读回 **`true`**；
- 把板整体移动 +180px 后，**子元素跟着移动了**（对这些子元素而言 `parentX` 是相对坐标）；
- 我按"不跟随"多补了一次子树平移 → 子元素总共走了 **+360**，内容整体偏出板 180px。

**正确做法：不要靠推断，先探测。**

```js
// 移动语义探测：把一块板移 N px，量一个子元素的世界 x 变化
const probeMoveSemantics = (board, child, dx) => {
  const before = child.x;
  try { board.parentX = board.parentX + dx; } catch (e) { board.x = board.x + dx; }
  const after = child.x;
  try { board.parentX = board.parentX - dx; } catch (e) { board.x = board.x - dx; }   // 还原
  return { childFollows: Math.abs((after - before) - dx) < 1, childDelta: after - before };
};
// childFollows === true  → 只移板，不要补偿子树
// childFollows === false → 逐元素平移子树（moveSubtree）
```

判定后再选策略：跟随 ⇒ 只动板；不跟随 ⇒ `moveSubtree`（先动子孙再动壳）。

### 12.3 exporter 导出随机失败：把 Playwright 的 `networkidle` 改成 `load`

**症状**：`page.goto: Timeout 20000ms exceeded ... waiting until "networkidle"`，
同一页多块板连续失败、别页偶发成功；exporter 容器资源正常（CPU 0%、内存几百 MB）；
从 exporter 里 `fetch('http://penpot-frontend:8080/')` 返回 **200**（网络没问题）。

**机理**：`render.html` 会保持长连接（实时同步用），`networkidle`（要求 500ms 内无连接）**永不达成** → 必然 20s 超时。
所以它和板大小、页大小只是弱相关，表现为"时好时坏"。

**修复**（幂等、可回滚）：

```powershell
# 容器内 app.js 只有 1 处 networkidle，且必在 wait_until 语境
$d = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
# 先备份 /opt/penpot/exporter/app.js -> app.js.orig，再把 "networkidle" 替换为 "load"，最后：
& $d restart penpot-server-penpot-exporter-1
```

实测：同一块板改前连续 3 次失败，改后**一次成功**。还原：`app.js.orig` 覆盖回去后重启。
> 提醒：这是容器层补丁，`docker compose up -d --force-recreate` 会重置它；`restart` 保留。

## 13. 同一次构建里所有 cell helper 必须同签名

**事故**：同一次构建脚本里并存两套 helper：

```js
R(b, x, y, w, h, fill, radius, stroke)              // 矩形：label 前有 h
X(b, x, y, w, label, size, color, weight, h, align) // 文本：label 前没有 h
```

把 `X` 当 `R` 用时整串参数错位：`label`←高度、`fontSize`←标签、`h`←字重、颜色全黑。
一次产生 **23 个畸形文本**（屏上显示垃圾数字、板被撑高 400–570px、顶破行距压住下一行）。

**预防**：① 同段代码内 helper 签名统一；② 或统一改用对象字面量 `{kind:'text', x, y, w, label, size, ...}`
（本技能 01/02 页用字面量写法，同批零事故）；③ helper 内部**加参数个数/类型断言**，错位立即抛错而不是画歪。

**检测（一击命中）**：扫全体文本，`characters` 为**纯数字**（`/^\d{1,4}$/`）**且 `height ≥ 200`**。
实测此规则精确命中全部 23 个、零误报。**阈值必须是 200 而不是 36** ——
正常的数字标签（分页 `1/2/3`、年份 `2026`）盒高只有 **40–44**（住在 40px 胶囊里），
而畸形文本的盒高是 **400/500/600**（那其实是被错位当作高度的**字重值**），两者差一个数量级。
可再叠加「`height` 与同级矩形高度不一致」进一步收紧。
