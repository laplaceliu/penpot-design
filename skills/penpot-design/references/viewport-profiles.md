# 视口档位（Viewport Profiles）

本技能把"界面宽度"抽象成三个标准视口档位（profile）。任何 code-to-design 或
design-to-code 任务**开始前，必须先确认目标档位**：技能用 `ask_followup_question`
向用户确认（multiSelect，可多选）。未确认不得开始构建。

## 1. 三档定义

| 档位 key | 别名 | 设计基准宽（portrait） | 常见设备宽 | 栅格列数 | 内容边距 | 最小触控目标 |
|---|---|---|---|---|---|---|
| `web`    | 宽屏 / 桌面 | 1440（设计画布 1920） | 1280 / 1440 / 1920 | 12 | 24–32 | ≥36px（鼠标指针） |
| `pad`    | 平板 | 834（iPad Air 竖屏）   | 768 / 834 / 1024 / 1194 | 8（窄时降 4） | 16–24 | ≥44px |
| `mobile` | 手机 | 375（iPhone 基准）     | 360 / 390 / 412 / 414 | 4（或单列堆叠） | 12–16 | ≥44px |

- 高度仅作 Demo 板初始高参考；组件页 / 规格板不受高度限制。
- 一档可同时产出 portrait 与 landscape 板（web/pad 常用 landscape，mobile 常用 portrait）。
- 档位之间**共享同一套 design tokens 与组件库**，差异只在布局栅格、边距、触控目标下限与 Demo 屏幕宽度。

## 2. 档位如何影响产物

### 设计系统内核（共享、与档位无关）
`00` 封面、`01–02` 基础、`03–13` 组件规格与索引、`15` 参考：这些是 token 与组件库，
**只建一次，所有所选档位共用**。PageRoot / 页头 / 页脚固定 1920（这是"规格说明书
画布"，不是屏幕 mockup，宽度恒定）。组件规格板照常展示全部状态 / 尺寸，并应为
touch 档位补充合适的 Size（如 `Button·S` 在 pad/mobile 下取 44px 高以满足触控目标）。

### 档位相关页
- **`12 · 布局模式`**：每个所选档位都要有独立布局网格板（web 12 列 / pad 8 列 /
  mobile 4 列或单列堆叠）+ 该档响应式断点说明 + 该档 Empty/404 整页模板。
- **`14 · Demo`**：对每个所选档位，分别产出该档基准宽的 Demo 六板
  （Dashboard / Landing / Login / List / Detail / Settings），板宽 = 档位基准宽。
  多档可并排放在 14 页的 1920 画布中（如 5 块 mobile 375 并排）。
  原"可选 Mobile 375 应用板"升级为：所选档位各自的**必备**板。

### DESIGN.md
Layout 章节必须记录 `targetProfiles: [web|pad|mobile]`，并据此调整：
- spacing 刻度（mobile 用更紧凑的 4 / 8 / 12；web 可 8 / 16 / 24 / 32）。
- 触控目标下限（pad / mobile ≥44px → 用 token `touchMin`）。
- 栅格描述按档位分别写，禁止只写一种宽度的布局假设。

### Design → Code
- 代码按所选档位实现响应式（CSS 媒体断点 / Qt 布局自适应）；验收时 viewport / 窗口
  宽 = 该档基准宽，逐档截图比对。
- 单一档位时直接固定该宽；多档位时分档产出与比对。

## 3. 运行时询问（技能行为）

任务开头（拿到入口素材后、开始写 DESIGN.md 之前）调用 `ask_followup_question`：

- `header`: `"目标宽度"`
- `question`: `"本次要生成 / 复刻哪类宽度的 UI？（可多选）"`
- `options`（multiSelect: true）:
  - `Web 宽屏（桌面 1920）`
  - `平板 Pad（834 等）`
  - `手机 Mobile（375 等）`
- 拿到结果后写入 DESIGN.md `targetProfiles`，并作为后续所有构建与验收的硬约束。
- 若用户已明确指定（如"做个手机端"），可直接采用，不必重复询问，但仍须落库到
  `targetProfiles`。
