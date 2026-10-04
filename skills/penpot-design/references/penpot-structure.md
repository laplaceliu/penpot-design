# Penpot 设计系统固定结构（本技能定义的输出契约）

每次 code-to-design 任务**必须**产出同一套固定结构：一个 Penpot 文件 = 16 个编号页面；每页一个根板；组件规格板结构统一。与 DESIGN.md 的关系：DESIGN.md 是 token 与设计依据的**单一事实源**，Penpot 文件是其**可视化实现**，token 名/色值/字阶/圆角/间距刻度一一对应。

## 1. 文件级约定

- 文件名：`<系统名>-<风格关键词>.penpot`（如 `蓝色-科技风-发光.penpot`）
- 版本特性：components/v2、variants/v1、design-tokens/v1、layout/grid
- tokens 全部录入 `penpot.library.local.tokens`，用 `scripts/token_engine.js`（**不要手写 addSet/addToken**）。
  **TokenType 共 17 种**（`color` / `borderRadius` / `dimension` / `fontFamilies` / `fontSizes` / `fontWeights` /
  `letterSpacing` / `number` / `opacity` / `rotation` / `shadow` / `sizing` / `spacing` / `borderWidth` /
  `textCase` / `textDecoration` / `typography`），按 DESIGN.md 章节映射录入。
  **set 怎么切**：**默认只建 1 个 set**（`<系统名> · Core`，内部按 type 自动分组，一个 set 可装全部 17 类）。
  **禁止按类型拆 set**（Color/Radius/Spacing 各一个 = 类别错误：这三类永远同时激活，拆开只把 1 次开关变成 N 次）。
  仅当有主题（暗色/密度/品牌）时才加**覆盖层**，且**基础层必须排在前面**（`sets` 顺序即优先级，后者胜）。
  **三条铁律**：① `addSet()` 默认 `active:false`，**未激活 set 的 token 绑定会「成功但不生效」**，建集必须显式激活；
  ② 应用后**必须 readback `shape.tokens`**，不适用形状会静默 no-op；
  ③ 同一 set 内 token 名按 `.` 视为路径，**叶子和父节点互斥**（有 `t.color` 就不能有 `t.color.x`）。
  详见 `references/design-tokens.md`。
- 含 CJK 文本一律 Noto Sans SC（Penpot 无字体栈回退）
- 组件名分隔符一律 `·`（**禁止 `/`**，赋值静默失败）：`Button·Primary·Default`
- 坐标走 8px 栅格；构建期直接放最终坐标，永不移动已建好的板
- **PageRoot 宽固定 1920 是「规格说明书画布」**（展示组件矩阵 / 规格板），与最终屏幕目标宽度无关。
  目标屏幕宽度由**视口档位**决定（见 §2.1 与 `references/viewport-profiles.md`），体现在
  `12 · 布局模式` 各档网格板与 `14 · Demo` 各档屏幕板。设计系统内核（00–13、15）三档共用，只建一次。

## 2. 页面总表（16 页，固定编号与顺序）

分层原则：01–02 基础（token 可视化）→ 03–07 控件（按任务域：输入→选择→集合→展示，一组件只归一页）→ 08–10 模式（导航/浮层/反馈）→ 11–12 场景（可视化/布局）→ 13–15 交付。

| # | 页面名 | 必含内容板 |
|---|--------|-----------|
| 00 | `00 · 封面` | 系统名大标题、版本+日期、风格关键词条、主色带 6 格、页面目录清单 |
| 01 | `01 · 设计基础` | F1 色板、F2 字阶、F3 间距与栅格、F4 圆角、F5 阴影/发光、F6 图标、F7 描边与分割线 |
| 02 | `02 · 颜色系统` | C1 语义色、C2 深浅主题对照、C3 状态色、C4 渐变、C5 WCAG 对比度校验表 |
| 03 | `03 · 基础控件` | Button（Type×State×Size 矩阵）、IconButton、ButtonGroup、Switch、Checkbox、Radio、Segmented |
| 04 | `04 · 文本与输入` | Input、Textarea、InputNumber、SearchBox、Slider、Upload、FileTrigger、DropZone、ColorPicker、Form 容器（label/helper/error 三态） |
| 05 | `05 · 选择器` | Select、AutoComplete、Cascader、TreeSelect、Transfer、DatePicker、TimePicker、DateRangeField、Calendar、RangeCalendar、DateField、TimeField |
| 06 | `06 · 数据集合` | Table（排序/筛选/展开/固定列）、List、Tree、Descriptions、Statistic、Timeline、Pagination |
| 07 | `07 · 展示` | Card（≥3 尺寸）、Tag/Chip、Badge、Avatar、Image、Video、FileCard、Carousel、Collapse、Divider |
| 08 | `08 · 导航` | TopNav、Sidebar/Menu、Tabs、Breadcrumb、Stepper、Dropdown、ContextMenu、CommandMenu、Toolbar、Anchor、BackTop、Keyboard 快捷键表 |
| 09 | `09 · 浮层` | Modal、Dialog、Drawer、Sheet、Popover、Tooltip、Popconfirm + 定位/遮罩规范板 |
| 10 | `10 · 反馈与状态` | Toast、Notification、Alert、Result、Skeleton、Progress、Spinner、Empty、ErrorState |
| 11 | `11 · 数据可视化` | 图例、KPI 卡、折线/柱状/饼图示例、仪表盘部件、图表色彩映射 |
| 12 | `12 · 布局模式` | 每个所选档位一块布局网格板：web 12 栅格 / pad 8 栅格（窄降 4）/ mobile 4 栅格或单列堆叠；各档 PageHeader、Grid/Space、ScrollArea、响应式断点、Empty/404/Error 整页模板（按档位宽） |
| 13 | `13 · 组件索引` | 全部库组件实例缩略网格 + 名称 + 所属页坐标（design-to-code 映射表） |
| 14 | `14 · Demo` | 板阵（全部用库组件实例组装）：对**每个所选档位**分别产出该档基准宽的六板——Dashboard、Landing、Login、List 管理页（搜索+筛选+表格+分页）、Detail 详情页（描述+操作区+Timeline）、Settings 表单页（分组表单+危险操作区）；多档可并排放在 1920 画布内（如 5 块 mobile 375 并排）。原「可选 Mobile 375 应用板」升级为各档必备板 |
| 15 | `15 · 参考仿写` | 可选：仿写对象对照分析；无对象则省略并在 DESIGN.md `omitted` 声明 |

## 2.1 视口档位（profile）—— 决定 12/14 页形态

任务开始前由技能用 `ask_followup_question` 询问用户目标档位（web/pad/mobile，可多选），
结果写入 DESIGN.md `targetProfiles`。档位定义、基准宽、栅格、触控目标与对产物的完整影响
见 `references/viewport-profiles.md`。要点：

- `web`：基准宽 1440（设计画布 1920），12 栅格，触控目标 ≥36px（鼠标）。
- `pad`：基准宽 834，8 栅格（窄降 4），触控目标 ≥44px。
- `mobile`：基准宽 375，4 栅格或单列堆叠，触控目标 ≥44px。
- 设计系统内核（00–13、15）三档共用，只建一次；仅 `12` 栅格板与 `14` 屏幕板按档位分别建。
- `14` 页每块屏幕板宽 = 对应档位基准宽，可多块并排置于 1920 画布。

## 3. 每页必含元素（页面解剖契约）

每页（00 可简化）必须有且仅有一个顶层根板，所有元素挂入：

```
NN-PageRoot（1920 × 可变高，clipContent = false）
├── NN-Header  页头区 1920×160
│   ├── 页码 + 中文名 + 英文名（32px 标题，左对齐）
│   ├── 一句话页面说明（16px，secondary 色）
│   ├── token chips 条（本页 token 名 + 色块）
│   └── 版本 + 日期（右上角，label-sm）
├── <内容区：规格板阵列>
└── NN-Footer  页脚 1920×80
    ├── 本页 token 引用清单
    └── 「← NN-上页名   NN-下页名 →」导航条
```

硬性规则：
1. 一切元素挂进 PageRoot（导出页头才不会丢组件）。
2. `clipContent = false`，发光/阴影不被裁剪。
3. Header/Footer/内容板坐标固定（§5），禁止自由摆放。
4. 页头板退化（崩溃损伤 100×100）会导致整页导出全黑——每批构建后核对 Header 尺寸。

## 4. 组件规格板（Spec Board）契约

板名 = 组件英文名（如 `Button`），内部结构固定：

```
Button（880 × N，表面底，rounded.md）
├── 标题行：中文名 + 英文名
├── Anatomy 解剖板：引线标注 padding / gap / 圆角 / 图标位 / 文字位
├── 变体矩阵（行=State，列=Type 或 Size）
│   ├── 行：Default / Hover / Pressed / Focused / Disabled（交互件全五态；展示件 Default/Disabled）
│   ├── 列：Type（Primary/Secondary/Tertiary/Ghost/Danger…）或 Size（S/M/L）
│   └── 每格 = 变体板 `Button·Primary·Default`，格下 caption：`W×H · padding · {tokens}`
├── 使用规范条：Do 一行 + Don't 一行（各配 48px 小示意）
└── 库组件主实例（母版形状放 'AI Component Masters' 母版板）
```

注册纪律（详见 references/mcp-automation.md §4）：
- 注册一律用 `AI Component Masters` 母版板的形状执行 `createComponent([shape])`；`comp.remove()` 连主实例一起删，绝不在展示板形状上注册/重注册。
- 变体容器用 `penpotUtils.createVariantContainer`（输入必须是已注册主实例）；reparent 后重置 `parentX/parentY`。

## 5. 坐标与栅格规范

| 项 | 值 |
|---|---|
| PageRoot 宽 | 1920 |
| 内容区 | x ∈ [80, 1840] |
| 标准规格板 | 560 宽，3 列 x = 80 / 680 / 1280，列间距 40 |
| 大型规格板 | 880 宽，2 列 x = 80 / 1000 |
| 板垂直间距 / 板内区块 / 元素 | 48 / 24 / 8–16 |
| Header / Footer 高 | 160 / 80，内容从 y=240 起 |
| Demo 屏幕板宽（web） | 1440（landscape）或 1920；置于 14 页 1920 画布 |
| Demo 屏幕板宽（pad） | 834（portrait）或 1194（landscape） |
| Demo 屏幕板宽（mobile） | 375（portrait）或 812（landscape）；多块可并排（1920÷375≈5） |
| 触控目标下限（pad/mobile） | ≥44px（用 token `touchMin`）；web ≥36px |

## 6. 与 DESIGN.md 的映射（design-to-code 依据）

| DESIGN.md | Penpot | 代码实现 |
|---|---|---|
| `colors.*` | 01-F1 色板 + tokens 集 | 主题变量（QSS var / CSS custom properties） |
| `typography.*` | 01-F2 字阶 | 字体 token / TextStyles |
| `spacing.*` | 01-F3 间距栅格 | 布局常量 |
| `rounded.*` | 01-F4 圆角 | radius 常量 |
| `components.<name>` | 03–12 页规格板 + 库组件 | 代码组件（同名映射，见 13 索引页） |
| Do's and Don'ts | 各规格板使用规范条 | 代码评审检查项 |

## 7. 交付自检清单

- [ ] 16 页齐全（15 可选）且命名/顺序正确
- [ ] 每页唯一 PageRoot，Header/Footer 就位，clipContent=false
- [ ] 组件规格板符合 §4 契约，变体命名 `组件·属性·属性`
- [ ] 全部 token 录入 library tokens，与 DESIGN.md 同名同值；**`storage.TK.audit().ok === true`**
      （所有 set `active:true` + 所有 token `resolvedValueString` 非空，即无失效/断链）
- [ ] 组件全部注册为库组件（母版在 AI Component Masters），13 索引页信息完整
- [ ] 14 Demo 各所选档位的屏幕板全部由库组件实例组装（每档六板：Dashboard/Landing/Login/List/Detail/Settings）
- [ ] 每页 `export_shape` 导出 PNG 验收通过（无 100×100 退化、无裁剪、无偏移）
