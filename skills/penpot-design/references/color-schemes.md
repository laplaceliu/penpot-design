# 配色模式（Color schemes）—— 运行时询问 + 产物映射

与「视口档位」`references/viewport-profiles.md` **对等**的第二个启动期档位：同样在写 DESIGN.md 之前
问一次，同样写入 DESIGN.md 作为后续所有构建与验收的硬约束。

## 0. 先分清：「分节表面极性」≠「可切换配色」

**这是最容易答错的地方，必须在提问时就把两个选项描述清楚。**

| | **分节表面极性**（多数系统天然就有） | **可切换配色 / 主题**（本档位要问的） |
|---|---|---|
| 表现 | **同一页内**深浅区域交替（如 hero 用 ink、正文用 canvas） | **整页翻转**：背景、文字、描边一起变 |
| 例子 | pix 系统的 hero/services/footer 是深色，其余是浅色 | 用户点"深色模式"，整个界面变暗 |
| 是否可选 | 不是选项，是视觉语言的一部分 | 是用户可切换的状态 |
| 需要 theme 吗 | **不需要** | **需要**（见 `design-tokens.md` §5） |

> 只做「分节极性」→ **不建 theme**，一个 token set 即可（这正是 pix 当前的状态）。
> 做「可切换配色」→ 才建第二个 set + theme 组。

## 1. 何时问

**写 DESIGN.md 之前**，与视口档位问题**放在同一批 `ask_followup_question` 里**（一次往返问完，不要分两轮）。
用户已明说（如"要有深色模式"）可免问，但仍须落库到 DESIGN.md。

## 2. 问什么

- **header**：`配色模式`
- **question**：是否需要**可切换的**明暗两套配色（整页翻转），而不只是同一页里深浅区域交替？
- **multiSelect**：否（默认单选）
- **options**：
  - `只要浅色（默认）` — 单一配色。token 建 **1 个 set**（`<系统名> · Core`），**不建 theme**。交付物最省。
  - `浅色 + 深色两套` — 交付可切换的明暗两套。token 建 `· Core` + `· Dark`，并建 Scheme 组两个 theme。
  - `跟随系统（自动 light/dark）` — 交付物与上一项**完全相同**（两套都得有）；差别只在交互约定，
    写进 DESIGN.md 的 Colors / Do's and Don'ts 即可。

## 3. 答案落在哪

**DESIGN.md 的 `## Colors` 章节正文**，与 `targetProfiles` 写在 `## Layout` 章节正文是同一机制：

```markdown
## Colors

**Color schemes: `light` and `dark`.** Both must be delivered; `dark` is a first-class scheme,
not an inversion of `light`.
```

- **不要**塞进 frontmatter 当自定义键。实测：自定义顶层键 `colorSchemes:` **不会**触发 lint 告警
  （0 error / 0 warning），但会被 linter 与 `designmd export` **忽略** —— 即"能过但无效"，
  所以以正文声明为准（`targetProfiles` 同理）。
- 选了「两套」时，Colors 章节**必须给出两套色值**，并显式写出**语义角色映射**
  （同一个 `on-surface` 在 light 下是什么、在 dark 下是什么），不能只给一堆裸色值。

## 4. 产物映射（回答 = 两套时）

| 位置 | 变化 |
|---|---|
| **token 结构** | `sets: [ '<系统名> · Core'(全部), '<系统名> · Dark'(只放要覆盖的同名 token) ]` + `Scheme` 组两个 theme（Light = {Core}，Dark = {Core, Dark}）。**Core 必须排在前**（`sets` 顺序即优先级，后者胜）。用 `TK.ensureTheme` / `TK.activateTheme`。 |
| **00 封面** | 注明配色模式与两套方案的名称 |
| **01 设计基础 F1** | 色板板需**双极性**并排（light 一列、dark 一列 + 角色对应关系） |
| **02 颜色系统** | C1 语义色 / C2 表面配对 / C3 文本层级 / **C5 对比度审计 全部双份**（可并排或上下叠放） |
| **03–12 组件规格板** | 每个交互组件至少给出 dark 极性的一组状态；展示件至少给极性说明 |
| **12 布局模式** | 不变（布局与配色正交） |
| **14 Demo** | 每个档位 × **每套配色**各出六板 → 板数**翻倍**（2 档位 × 2 配色 = 24 板）。可并排但务必标注清楚。 |
| **DESIGN.md `## Elevation & Depth`** | 需说明「分节极性」与「主题极性」的关系：翻转后 `ink` / `canvas` 的角色如何互换或保持 |

## 5. 验收（强制）

- **WCAG 对比度必须对两套分别审计**。dark **不是** light 的取反：
  简单反色通常会让中间调灰阶失效（`on-surface-muted` 之类最容易不达标）。
- 02 页的 C5 对比度审计表要有 **light 表 + dark 表**两张。
- `TK.audit()` 在 theme 模式下会切到 `mode: 'theme-driven'` 判据
  （未激活 set 属正常态，改判「无同组多激活 + 已激活 set 内 token 全部可解析」）。
- 导出验收：两套配色各跑一遍，**未导出过的组合不得表述为"已验证"**。

## 6. Design → Code 侧

- 两套配色必须走**同一套语义 token**（CSS custom properties / 主题对象 / QSS 调色板），
  禁止在组件里硬编码第二套色值。
- 切换机制与持久化（跟随系统 `prefers-color-scheme` / 手动切换 / 是否记忆）写进 DESIGN.md
  的 Do's and Don'ts，代码据此外实现。
- 验收：每个档位 × 每套配色分别截图比对（验收组合数 = 档位数 × 配色数）。

## 7. 为什么必须在启动时问

- 事后加第二套配色的成本远高于开始时决定：**色板要重新推导、02 页对比度审计要重做、
  组件规格板要补极性、Demo 板数翻倍**。
- 反过来，一开始就明确了「只要浅色」，就能省掉整套 theme 结构与第二份板 —— 这正是
  pix 当前 1 个 set / 0 个 theme 的依据。
