# 定位审计：如何在第一次就做对，以及出错后如何主动发现

本文是一份事故复盘 + 预防契约。事故背景：一次 16 页设计系统构建，用户交付验收时报告
「**每一页中都有元素定位不对**」。根因不是某一页写错了坐标，而是**整套坐标/文本 helper 被临时自造**，
绕开了本技能已有的 canonical 引擎，于是同一个系统性偏移被复制到了全部 16 页。

## 一、根因链（按贡献度排序）

### R1 自造 helper，绕开 canonical 引擎（决定性）

`scripts/seed_storage.js` 已提供 `mkAbsBoard` / `absMount` / `mkText` / `mkRect` / `ct` / `mkChip`；
`scripts/repair_engines.js` 已提供 `alignPage` / `vAlignPage` / `fixInner` / `unclip` / `cleanOrphans`。
本次构建**没有读这两个脚本**，改为现场写了一套自己的 helper，造成三处偏离：

| 偏离点 | canonical | 事故中的做法 | 后果 |
|---|---|---|---|
| 板工厂 | `addFlexLayout()` + `flex.dir='column'` + `horizontalSizing/verticalSizing='fixed'`（方案 C） | 裸板 + 世界坐标 append（方案 A） | 方案 A 的已知失效模式是**导出整体偏移 `-board.y`（readback 正确、渲染错位）**，与本事故症状一致 |
| 文本定位 | 实测 `t.width/t.height` → `absMount(parent, t, cx−w/2, cy−h/2)` | 自造 `boxLabel`：`growType='fixed'` + `resize(w,h)` + `verticalAlign='center'` | `verticalAlign` 不是本技能依赖过的机制；残差正是 `vAlignPage` 的触发域（5–15px），全 16 页复制 |
| 标签归属 | 文本 append 进**容器板本身**（`absMount(b, t, …)`） | 大量文本 append 进**父板**（与容器板同级） | 标签与容器解耦：组件注册后是空壳；reparent/移动容器时标签被撇下 |

**结论：`mkAbsBoard`/`absMount`/`mkText` 与 `alignPage`/`vAlignPage` 是"必须原样使用"的契约件，不是参考实现。**

### R2 只跑了「描边/去裁剪」，漏跑「对齐」

SKILL 工作流步骤 5 写的是「**对齐**/描边/去裁剪审查」。本次用手写脚本跑了 `fixInner` 等价物 + 去裁剪，
**`alignPage` / `vAlignPage` 一次都没跑**，于是 R1 留下的残差从未被校正。

### R3 验收抽样，未全覆盖

全部 ~120 个板只导出了 4 个做验收就宣布完成。**没导出过的板，正是错误存活的地方**。

### R4 进度只活在 `storage` 与上下文里

MCP 连接中途断开（`penpot.local:443` connect timeout），构建队列与进度无法续跑，也无人能接手复核。

## 二、四个典型签名：怎么"主动发现"

肉眼看导出图只能发现"感觉歪了"。下面是可机器判定的四个签名，对应 `scripts/audit_layout.js` 的四类 finding。

### S1 `out_of_bounds` —— 子元素跑出父板

- **含义**：子元素矩形未被父板矩形包含（容差 1.5px）。
- **最典型成因**：方案 A 失效，整体偏移 `-board.y`（板 y=240 时内容整体上移 240px，跑到板外甚至页原点）。
`detail` 里的四元组 `(L,T,R,B)` 分别给出相对父板四边的越界量，**按哪一边越界即可判定签名**：

| 越界方向 | 签名 | 修法 |
|---|---|---|
| **L 负值、且同页多板同值** | 常量列偏移（复制粘贴左列坐标填右列板） | `fixColumnOffset` 整块平移 |
| **T/B 负值、且 ≈ `-board.y`** | 方案 A 失效（整体偏移 `-board.y`） | 换方案 C 重建，**不要逐元素挪** |
| B 负值、每板值不同（几十 px） | 板高不足 | `fitBoardHeight` |
| B 负值、且形状是 PageRoot 的直接子板 | PageRoot 高度不足 | `fitRootHeight` |
| R 负值、形状是右对齐文本 | 右侧溢出（文本框超宽） | `fixOverflowRight` |

> **`fitBoardHeight` 的 maxGrow 护栏（关键，务必开启）**
> 这个引擎有个危险特性：**它能"把放错的子元素吞进板里"，从而把错位合法化**。
> 板真的需要长大时，幅度通常是几十 px；**一旦需要长高几百 px，那必是某个子元素被放错位置**，
> 正确修法是挪那个子元素，而不是把板撑大——撑大之后审计看到"子元素就在板内"，反而给出假阴性。
> 所以引擎内置 `maxGrow`（默认 160px）：超限则**拒绝长高**并放进 `suspect` 清单，附上
> `deepestChild`（最深的那个子元素及其 y），直接指出嫌疑对象。
> 实测教训：某 Demo 页两个 Settings 板被撑到 **1336px / 1290px**（行距仅 960px），
> 比其内容应有高度多出约 500px —— 这就是"被吞进去的错位子元素"的指纹。

- **判据（区分 L 偏移与方案 A）**：L 偏移是 **X 轴常量**，且常量 = `board.x − originX`（本例 920 = 1000 − 80）；
  方案 A 失效是 **Y 轴**且常量 = `-board.y`。**先看轴，再看是否同值。**
- **伴随特征**：readback（`child.x/y` 读回）**全对**，只有渲染/导出错位。**readback 对 ≠ 定位对。**

### S2 `text_centre_residue` / `text_centre_info` —— 文本在宿主里没居中

- **含义**：文本世界中心落在某个小宿主（rect/ellipse，边长 ≥24、面积 ≤20000）内，但与宿主中心偏差 > 0.5px。
- **三级判定（关键，否则误报成灾）**：
  - `text_centre_residue` = 偏差 **≤8px 且文本框宽 ≥ 宿主宽 ×0.72** → **本意就是居中**（按钮/胶囊标签），是缺陷。
  - `text_centre_residue`（**stale-center 指纹**）= 偏差 >8px，但**文本左上角恰好落在宿主中心点**
    （`|t.x−hcx|≤2` 或 `|t.y−hcy|≤2`，按轴独立）→ 见下，是缺陷，`detail` 带 `stale-center` 标记。
  - `text_centre_info` = 其余情况（偏大、或文本框明显窄于宿主）→ **刻意内缩**（带尾部 × 的 chip、左对齐的下拉选项行），**不算缺陷**。
- **成因 A（≤8px 残差）**：用固定文本盒 + `verticalAlign/horizontalAlign` 居中，而不是"实测宽高 + 居中放置"。
- **成因 B（stale-center 大偏移）**：**在 `createText()` 创建瞬间就读 `t.width/t.height` 算居中**。
  创建瞬间宽高是 1px 量级瞬态值（`mcp-automation.md` 陷阱表「文本定位」），`(w−1)/2` 的算术后果是
  **文本左上角恰好落在宿主中心**——这就是指纹的来历。实测案例：110×32 药丸里的 37×15 标签右偏 18.5px、
  下偏 7.5px（= `(37−1)/2`、`(15−1)/2`），16 页系统性复制。
  **注意：刻意左对齐的文本只会落在 `host.x+padding`（12/16/18/24…），绝不会贴住中心点（±2px），
  因此指纹判定零误伤**；但**按轴独立**——左对齐字段占位符可能只命中 Y 轴指纹（垂直不居中），只修 Y。
- **修复**：偏差 5–15px → `storage.vAlignPage()`；≤6px → `storage.alignPage()`（宿主吸附，容差 6px / 大宿主 3px）；
  **>6px 且命中 stale-center 指纹 → `storage.fixStaleCenter()`**（只动命中轴的坐标，不碰层级/样式）。
- **注意**：`alignPage`/`fixStaleCenter` 只修指纹命中的元素；刻意非居中的会留在清单里——这是**预期行为**。

### S3 `crash_100x100` / `degenerate_size` —— 尺寸退化

- `crash_100x100`：非文本图元恰好 100×100 = 崩溃损伤（api-pitfalls §8）。
- `degenerate_size`：**只有** `w≤1 且 h≤1`、或**文本**宽/高 ≤1 才算。
  **1px 高的发丝线（分隔线、进度轨道）是刻意设计，不是退化**——早期版本用「宽或高 ≤1」判定，在本系统里误报了 85 条。

### S4 `header_collision` —— 正文压到页头

- **含义**：板上 `rect/ellipse` 与页头**标题文本**重叠 >60%。
- **判定门槛（关键）**：页头 = 顶部 `parentY < 96` 且**字号 ≥20px** 的文本。
  若不设字号门槛，两类背景板会全量假报（本系统实测 31 条里 28 条是假的）：
  - PageRoot 自带的 `NN-Header` 背景板（它本来就该盖在标题下）
  - 演示屏 1440/375 的导航条背景 rect（logo 是 15–18px）
- **成因**：规格板正文起始 y 未让开页头脚手架。**新板首板必查这一条**。

### S5 `root_stray` —— PageRoot 之外的顶层游离图元

- **含义**：`page.root` 的直接子元素里，除 `NN-PageRoot` 之外的形状。
- **成因**：注册库组件 / 建变体容器期间产生的**绑定实例残留**（本例：page 01 的 `Badge·New`、
  page 03 的 `Button` 各一个 0 子元素的游离实例）。`createVariantContainer` 还会把容器放在**页根**而非 PageRoot 内。
- **处置**：先 `isMainComponent()` / `component` 判明身份——**绑定实例可安全 remove**（不影响库），
  主实例要连同组件一起考虑。本例两个都是 0 子元素的绑定实例，直接删。

### S6 字体一致性 —— 同页/同类文字用了非预期字体

- **含义**：`auditPage()` 返回的 `fonts` 直方图里出现了非预期字体，或**应该用 display 字体的标题却是正文体**。
- **成因**：**分批构建时 helper 的签名演进不同步**。本例 page 01 是早期批次建的，
  当时的 `mkText` 还没有 `font` 参数，于是「Type Scale Display」这一板的 display 样例全部回落 Inter；
  而后期批次（Cover / Landing）显式传了 `font:'display'`，正确渲染成 Anton。
- **检测**：`auditPage().fonts` 给出字体直方图；对每页抽查「display 级字号（≥56px）的文字是否为 display 字体」。
- **修复**：`penpot.fonts.findByName('Anton')` → `anton.applyToText(t, anton.variants.find(v => v.fontWeight==='400'))`。
  本例 4 处修正；部分形状会抛 `Value not valid`，需 try/catch 逐个处理。
- **预防**：canonical `mkText` 必须**一开始就带 font 角色参数**（见 `scripts/seed_storage.js` 的 `opts.font`），
  不要在建到一半时才加——中途改 helper 会让前后批次产生不一致，而这类不一致**不会触发几何审计**，只能靠字体直方图发现。

### S7 `board_overlap` —— 兄弟板互相压住

- **含义**：同一个 PageRoot 下的两个顶层板矩形相交（相交面积 >1px）。
- **为什么最阴**：它**是"修复"制造出来的**。流程是
  「审计发现板高不足 → `fitBoardHeight` 把板长高 → 行长超过固定行距 → 压到下一行的板」。
  只查「包含性」的审计对此**完全盲**：长高后的板当然包含了自己的内容，页角色也一切正常。
- **判定**：先看 `detail` 里的重叠宽高；再看是不是**同列**（x 相同）的相邻板 ——
  同列相邻板重叠 = 行距被顶破，这是典型形态。
- **修复**：`reflowRows`（按实际板高重新排行距）。**不要**改板高去迁就网格 ——
  板高由内容决定；要迁就网格的是**行距**。
- **实现要点**：移动板不会带走 `layoutChild.absolute` 的子元素（api-pitfalls §10），
  必须 `moveSubtree` 逐元素按同一 (dx,dy) 平移世界坐标，否则会出现「板动了、内容没动」的二次错位。
- **顺序铁律**：`fitBoardHeight` → `reflowRows` → `fitRootHeight`。
  行距重排必须用**长高后的真实高度**，根板收高必须用**重排后的真实底边**。反过来做就要跑两轮。

### S8 `text_overlap` —— 两段文本压在一起

- **含义**：同一父级下两段文本的可视矩形重叠 >60%。几乎必然意味着错位、重复或残留。
- **为什么只查 text-vs-text**：形状重叠噪声太大——scrim 压面板、色板垫底、背景条托标题都是刻意的。
  文本互相重叠则极少是设计意图。

### S9 `malformed_text` —— helper 参数错位留下的畸形文本

- **形态**：`characters` 是**纯数字**（`/^\d{1,4}$/`）**且 `height ≥ 200`**。
  > 阈值取 200，不是 36。实测教训：用 36 会把**正常的数字标签**全误报——
  > 分页 `1/2/3`、年份 `2026` 这些盒高只有 **40–44**（它们就住在 40px 高的胶囊里）；
  > 而真正畸形的盒高是 **400 / 500 / 600**（那其实是被错位当作高度的**字重值**）。两者量级差一个数量级。
  > 若还要更严，可叠加「`height` 与同级矩形高度不一致」。
- **成因**：同一次构建里两个 helper 签名不同（`R(b,x,y,w,h,fill,…)` vs `X(b,x,y,w,label,…)`），
  把文本 helper 当矩形 helper 调用 → 整串参数错位：`label`←高度、`fontSize`←标签、`h`←字重、颜色全黑。
  详见 `api-pitfalls.md` §13。
- **为什么危害大**：它同时制造**两种**可见故障——屏上出现垃圾数字，且这些畸形文本的 `h`（400/500/600）
  把 `fitBoardHeight` 抬高数百 px，**顶破行距压住下一行板**。所以"板莫名其妙高了几百 px"时，
  第一件事就是扫 S9；这类板的高度异常不是布局问题，是内容问题。
- **检测精度**：实测精确命中 23/23，零误报（真实 KPI 数值 `120` 的高度只有 44，远低于 36 阈值之上的异常区间；
  可再叠加「`height` 与同级矩形不一致」收紧）。
- **修复**：把参数按错位关系逆推还原即可，**不必重建**：
  `characters` = 本应的高度；`fontSize` = 本应的标签（仅数字型存活）；
  `fill` 无效说明本应字号落进了 `fills`；`h` = 本应字重。配合「同级同 x/w 矩形的高度」可反查本应高度。
  ⚠️ 还原后**必须重新设 `align`**（见 S10），且写入后 readback 验证。

### S10 `align_not_applied` —— 对齐属性写入静默失败

- **含义**：代码里给文本设了居中/右对齐，但渲染出来是左对齐（标签贴住容器左边缘）。
- **成因**：属性名写错。文本水平对齐是 **`align`**，**不存在 `horizontalAlign`**；
  错名赋值在 `try/catch` 下**静默失败**，代码"看起来跑了"。详见 `api-pitfalls.md` §12.1。
- **判定**：**写入后立刻 readback**——`if (t.align !== want) throw`。
  readback 为 `undefined` ⇒ 属性名错；读回旧值 ⇒ 取值/类型非法。

### S11 `loose_assembly` —— 装配散件（成套图元未收进 group/component）

- **含义**：同父级下，宿主（rect/ellipse/board ≥24）与「中心落在其内、最小宿主就是它」的兄弟图元
  构成一个装配（底板+标签/图标/子件），但它们没有收进同一个 **group** 或 **组件**——散件同级堆叠。
- **成因**：构建时逐件 `absMount` 进板，从不收拢；后果是**选择/移动/复用全面退化**：
  拖动底板标签被撇下、组件注册出空壳、design-to-code 无法把装配映射成一个组件。
- **契约**（`penpot-structure.md` §4.1）：复用装配 → **component**（`createComponent([group])`，
  页面用 `comp.instance()`）；单次成套 → **group**（`penpot.group([host, ...members])`）；
  纯装饰单件可散件。无标签成套图元（滑轨+滑块）审计识别不了，手工成组。
- **修复**：`storage.groupAssemblies()`（由内而外按面积升序、最小宿主归属、嵌套组、幂等、只动层级不动坐标）。
  已合规的装配（同组/组件内）不报；修后复算 `loose_assembly = 0`。
- **注意**：`groupAssemblies` 之后新增图元若直接散挂，签名会再次报出——**每轮 G4 链末尾都跑一次**。
- **注意**：审计脚本里读对齐要写成 `s.align`；若历史代码写成 `s.horizontalAlign || s.align`，
  **取的是后者**（前者恒为 undefined），所以审计结果是可信的——但写入端必须用对名字。
- **修复范围要克制**：不要用"盒宽匹配底座矩形"这类宽判据全文件刷——实测它会误伤
  「卡片里放着一块与文本盒同宽的媒体矩形」这类结构（一次误伤 9 处）。
  收紧为**盒宽 + 盒高都与底座矩形一致**（完整叠加）才判为居中，实测该判据零误报。

## 二·补、元教训：审计必须覆盖「修复动作的输出空间」

这一条比任何单个签名都重要，是两次事故的共同点：

> **每一轮修复都会把缺陷空间"搬"到别处。审计的覆盖面必须包含修复动作可能产生的输出，
> 否则"修好了"只是"把错误挪到了我看不见的地方"。**

对照实例：

| 轮次 | 修的动作 | 新缺陷 | 当时的审计能否发现 |
|---|---|---|---|
| 第一轮 | `fitBoardHeight` 把板长高 | 行长顶破行距、压到下一行板 | ❌ 只查包含性 → 报 CLEAN，用户却看到大量错位 |
| 第一轮 | `fixOverflowRight` 左移文本 | 可能与左侧元素相撞 | ❌ 无重叠检查 |
| 第一轮 | `fixColumnOffset` 平移整块内容 | 目标位置可能已占用 | ❌ 无重叠检查 |
| 第二轮 | `createVariantContainer` 重挂母版 | 标签被撇在板外（S5） | ❌ 当时无 root_stray 检查 |
| 第三轮 | 中途给 `mkText` 加字体参数 | 前后批次字体不一致（S6） | ❌ 几何审计原理上查不出 |
| **建板第一天** | 两列版式：W 列 `x=80 w=1440`（→1520），M 列 `x=1400` | **两列重叠 120px（每一屏都叠）** | ❌ 从无重叠检查；且这**不是修复引入的，是"原生"错误** |
| 第二轮 | `R`/`X` 两个 helper 签名混用 | 23 个畸形文本（S9）+ 板被撑高 400–570px 顶破行距 | ❌ 当时无 S9、无 S7 |
| 第四轮 | 手工修复时把属性写成 `horizontalAlign` | 23 处对齐修复全部未生效（S10） | ❌ 不 readback 就发现不了 |

> **注意"原生错误"这一行**：不是所有错位都来自修复动作。
> 两列版式的重叠从建板第一天就存在，前面的每一轮审计都报它 CLEAN。
> 所以审计维度不全时，**"一直 CLEAN"不等于"一直正确"**，只等于"这个维度一直没被检查过"。

**落地规则**：
1. **改完必查"相邻关系"**：任何「移动 / 长高 / 重挂」的修复，都要跑一次 S7 + S8。
2. **每个修复引擎都要在 SKILL 里写明"它会引入哪类缺陷、由哪个检查兜底"**，否则就是给下一轮埋雷。
3. **审计的判定维度要正交**：包含（in）／重叠（overlap）／尺寸（size）／字体（font）／结构（stray）。
   只有"包含"是不够的——本系统两次事故里，用户的观感问题一次来自**包含**，一次来自**重叠**。
4. **不要过早宣布 CLEAN**：`verdict: CLEAN` 只代表"当前这套检查没命中"。
   交付话术必须是「**按 N 项检查通过**」，而不是「没有问题」。

### 判定规则的两次迭代（务必用修正后的规则）

| 检查 | 第一版（噪声大） | 修正版（可用） |
|---|---|---|
| 包含性 | 用形状外框 | **文本用视觉矩形**（按对齐估算字宽），否则宽文本框假越界 |
| 退化尺寸 | 宽或高 ≤1 | `1×1` 或文本 ≤1；**排除 1px 发丝线** |
| 页头碰撞 | 高 ≥16 的顶部文本 | 顶部**字号 ≥20** 的文本；排除背景板 |
| 居中残差 | 偏差 >0.5 全报 | ≤8px **且** 文本框宽 ≥ 宿主×0.72 才报，其余转 `info` |

## 三、预防契约（写进流程的硬门禁）

### G1 【门禁】动手前必须读 canonical 脚本，禁止自造坐标/文本 helper

`code-to-design` 和 `design-to-code` 的**第 0.5 步**（在播种之前）：

1. 读 `scripts/seed_storage.js`，**原样粘贴执行**；需要新工厂时**新增**函数，不改写 `mkAbsBoard`/`absMount`/`mkText`。
2. 读 `scripts/repair_engines.js`，原样粘贴执行，作为收尾必跑项。
3. 若确需自定义文本盒（如固定尺寸字段），**必须**在构建后由 `audit_layout.js` 的 S2 检查兜底，
   不允许"设了 `verticalAlign` 就当居中完成"。

> 判据：任何一次构建的 execute_code 里出现自己写的 `mkAbsBoard` / `absMount` / 文本盒函数体，即为违规。

### G2 【门禁】方案 C 是默认，方案 A 必须先过首板导出

裸板 + 世界坐标（方案 A）在部分文件/版本上会整体偏移 `-board.y`。
**只有在对本环境跑过"首板建成 → 立即导出 → 肉眼确认无偏移"之后**，才允许批量用方案 A；
否则一律 `addFlexLayout()` + `flex.dir` + sizing fixed（方案 C）。

### G3 【门禁】每建完一个板，立刻跑单板审计

不要等整页建完。**每个板建成后立即 `storage.auditPage()` 并只看新板那几条 finding**。
S1/S4 在第一个板上就会暴露，避免把同一个偏移复制到 120 个板。

### G4 【门禁】收尾必跑对齐引擎，顺序固定

```
cleanOrphans() → fixStaleCenter() → alignPage() → vAlignPage() → fixInner() → unclip()
```

`fixStaleCenter` 必须排在 `alignPage` **之前**：它修的是 >6px 的 stale-center 大偏移（指纹判定），
修完后残余微差才归 `alignPage` 的 ≤6px 吸附管；反过来跑则大偏移永远修不到。

每页一次；**必须记录返回的修复日志**（`[位置, 内容, 轴, 偏移]`）并人工复核，再做误伤还原。
`vAlignPage` 的已知误伤面（刻意非居中：步进钮 ＋/－、Progress 顶标签）按 `engines.md` §1 的已知坐标还原。

### G5 【门禁】验收必须全覆盖，禁止抽样宣布完成

- 每个板**至少导出一次**；页数多时按页做 contact sheet（整页一图）先过一眼，再对可疑板单独导出。
- 交付话术纪律：**未导出过的板不得表述为"已验证"**。未验证就写"未验证"。

### G6 会话可续跑：进度落盘

连接是易失的（本次 `penpot.local:443` connect timeout 中断）。
- 构建开始前先探测端点在不在（`assets/penpot-server/scripts/status.*`）；
- **构建队列 + 已完成页清单写入工作区文件**（如 `build-progress.json`），不要只放 `storage`；
- 断了重连后按文件续跑，并用 `audit_layout.js` 复算已建页，确认没有半成品页。

### G7 代理必须放行 `penpot.local`

本机配了 HTTP/SOCKS 代理（`http://localhost:8118` / `socks5://localhost:30000`）时，
`penpot.local` 会被送去代理解析而超时。把 `penpot.local`、`localhost`、`*.local` 加入 `NO_PROXY`，
或对 MCP 客户端进程禁用代理。

### G8 【门禁】审计维度必须正交；每个修复引擎必须写明"它引入什么缺陷、由谁兜底"

这是两次事故最贵的教训：**审计只覆盖一个维度时，修复会把缺陷搬到那个维度的盲区里。**

- **维度清单（缺一不可）**：包含（in）／重叠（overlap）／尺寸（size）／字体（font）／结构（stray）。
- **修复动作 → 可能引入的缺陷 → 兜底检查** 必须成对登记：

| 修复动作 | 可能引入 | 兜底检查 |
|---|---|---|
| `fixColumnOffset` 平移整块内容 | 目标位置已占用 → 相撞 | S7 + S8 |
| `fitBoardHeight` 把板长高 | 行长顶破行距 → 压住下一行板；**或吞掉错位子元素使其合法化** | S7 + `maxGrow` 护栏 |
| `reflowRows` 重排行距 | 子树漏平移 → 板动了内容没动 | S1 包含性复算 |
| `createVariantContainer` 重挂母版 | 标签被撇在容器外 | S5 `root_stray` |
| 中途给 helper 加参数 | 前后批次不一致 | S6 字体直方图 |

- **修复后必须重跑"相邻关系"检查（S7/S8）**，不能只复算包含性。
- **交付话术纪律**：`verdict: CLEAN` 只代表"这套检查没命中"。对外表述用
  「**已按 N 项检查通过（列出检查项）**」，而不是「没有问题」。
  本系统出过一次真实的交付事故：报了「14/16 页 CLEAN」，但用户打开 Demo 页仍看到大量错位 ——
  因为当时检查项里没有"重叠"这一维。

### G10 【门禁】装配必须成组（group）或成组件（component），禁止散件同级堆叠

契约全文见 `penpot-structure.md` §4.1，三句话版本：

1. **成套图元（底板+标签+图标+子件）必须收进一种容器**：复用/进 13 索引 → **component**
   （`createComponent([group])`，页面一律 `comp.instance()`）；单次使用 → **group**（`penpot.group([host, ...members])`）。
2. **机器强制**：审计签名 `loose_assembly`（S11）查散件装配；修复引擎 `groupAssemblies()` 收编；
   每页 G4 链末尾必跑（幂等），复算 `loose_assembly = 0` 才算该页通过。
3. **不确定先 group**：`createComponent([group])` 可整组升级为组件，零返工；反向（散件→组件）则要重建。

**引入缺陷与兜底（G8 登记）**：`groupAssemblies` 只改变层级（同父级收进新 group），不动坐标/样式；
可能的误伤是「把刻意叠放的两件收进一组」——由最小宿主归属 + 嵌套语义排除，误组可用 `penpot.ungroup(g)` 还原
（组名=宿主名，日志可查）。后续 `alignPage`/`fixStaleCenter` 都按树遍历，穿过 group 边界照常工作。

## 四、标准作业顺序（替换掉"凭感觉建完再导出"）

```
0.5 读并粘贴 seed_storage.js + repair_engines.js + audit_layout.js + fix_geometry.js   ← G1
1   首板（页 01 第一块）建成 → auditPage() → 通过 → 直接导出肉眼确认                      ← G2/G3
2   批量建板：每板建成即跑单板审计（只看本板 finding）                                   ← G3
3   阶段一「几何」：逐页 fixGeometryAll({apply:false}) 出清单 → 复核 → {apply:true}
    （内部顺序已固定：fixColumnOffset → fitBoardHeight → fixOverflowRight → reflowRows → fitRootHeight）
4   阶段二「对齐」：cleanOrphans → fixStaleCenter → alignPage → vAlignPage → fixInner → unclip ← G4
    → groupAssemblies（装配成组，幂等；loose_assembly=0）                                 ← G10
    → fixZOrder（组内前后序：大底在下标签在上；组占顶层成员层槽）                         ← G10
5   复算：auditPage() 必须 CLEAN，且**必须包含 S7 重叠 / S8 文本重叠**两项
    （剩余项须逐条人工确认为刻意内缩 = text_centre_info）
6   验收：逐页导出（大板需重试），记录 per-board 是否真的导出过                             ← G5
7   进度与清单落盘                                                                        ← G6
```

### 两阶段修复为什么分开（第二次事故的实测数据）

一次 16 页系统的实测分布：`out_of_bounds` 121、`header_collision` 31、`degenerate_size` 85、`text_centre_residue` 29。
按签名拆分后：

| 阶段 | 引擎 | 实际命中 | 修后 |
|---|---|---|---|
| 几何 | `fixColumnOffset` | 6 个右列板、**77 个子元素**、dx 恒为 +920 | 页 01/02 立刻 CLEAN |
| 几何 | `fitBoardHeight` | 16 个板长高 4–140px | 页 03/04/06/07/10/12/13/15 CLEAN |
| 几何 | `fitRootHeight` | 6 个 PageRoot 长高 | 页 05/09/11/14 CLEAN |
| 几何 | `fixOverflowRight` | 3 个右对齐文本框左移 84px | 页 11 CLEAN |
| — | 清理 `root_stray` | 2 个游离绑定实例 | 页 01/03 CLEAN |
| 阶段二 | `alignPage`/`vAlignPage` | **未跑**（命中域为 0） | — |
| **回归** | **`fitBoardHeight` 长高的板顶破行距** | **Demo 页仍大量错位** | ❌ 当时审计无重叠检查 → 漏报 |

**当时报出「14/16 页 CLEAN」，但 Demo 页（14）用户仍看到大量错位 —— 这个 CLEAN 是假阴性。**
原因是 `fitBoardHeight` 把 6 个 Demo 板长高后越过了 960px 的固定行距，压到了下一行的板；
而审计当时只有「包含性」维度，对「重叠」完全盲。补上 S7 后才发现。

三条结论：
1. **先修几何，再看要不要跑对齐引擎**。这次 121 条越界全部由几何引擎解决，
   若一上来就跑 `alignPage`/`vAlignPage`，既修不掉越界，还会在错误的基准上吸附、引入新的误伤。
2. **`vAlignPage` 不是必需品**。它的触发域（5–15px、小板单行文本）在本次事故里命中数为 0；
   真正的病灶是「内容整块贴错原点」。**先诊断签名，再决定用哪个引擎**，不要按清单盲跑。
3. **几何修复的收尾必须是「重排行距 + 收根高」**，且顺序为
   `fitBoardHeight → reflowRows → fitRootHeight`。只做长高不做重排，等于把缺陷从
   「内容溢出板底」搬成「板压住邻板」——**两者用户都看得见，而后者审计更容易漏**。

### 验收：导出超时是"页面级"的

同一页上多块板连续导出失败（本例 page 01，PageRoot 高 2960px，`page.goto: Timeout 20000ms exceeded`，
卡在 `waiting until "networkidle"`），而同文件其它页正常 → 属已知的「大板导出超时」，**按页分批 + 重试**。
若**所有页**都超时且 exporter 日志显示 `networkidle` 超时，即使 `penpot-frontend:8080` 可达（实测 200），
也先 `docker restart penpot-server-penpot-exporter-1` —— 这是 exporter 侧状态卡死，重启即恢复。

## 五、审计输出的解读纪律

- `verdict: CLEAN` 只代表**四类签名未命中**，不等于像素级正确；仍须走 `verification.md` 的 PIL 比对。
- `text_centre_residue_*` 命中量大且集中在同一类宿主（如全是 52px 高的字段）时，
  那是**helper 的系统性缺陷**，应改 helper 重跑，**不要**指望 `vAlignPage` 逐个救。
- 审计只读。**先出清单人工复核，再进修复**——期望模型写错会把全部元素改错（`engines.md` §1 gridSnap 教训）。
