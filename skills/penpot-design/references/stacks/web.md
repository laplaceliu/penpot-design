# 适配器：Web 前端（React / Vue / Angular / Svelte …）

通用纪律见 `references/design-to-code-generic.md`。本文件覆盖所有基于 DOM/CSS 的 Web 框架，共用 CSS/Flex 基线，各框架差异见下；总原则与视口档位约束同 generic §0。

## 1. Token 层（CSS 变量基线）

- `npx @google/design.md export --format css-tailwind DESIGN.md > theme.css`（CSS 自定义属性）或 `--format dtcg` → style-dictionary 生成 CSS 变量 + TS 常量；组件样式只准引 `var(--...)`，禁散落 hex。
- 响应式断点也变量化（见 §4）。

## 2. 资源系统

- 图片：摄影/插画/位图进 `src/assets/images/`，import 进模块（打包器 hash/优化）；响应式 @1x/@2x/@3x 用 `srcSet` + `sizes`；`<img>` 必带 `width/height` 防抖动；纯色块/圆角/阴影用 CSS 实现。
- 图标：SVG 优先，内部 `currentColor` 着色跟 token，禁止单色图标多份导出；命名与 01 F6 一致 `icon-<名称>-<尺寸>.svg`，默认 24px 网格。
  - React：SVGR（`import { ReactComponent as Icon } from './icons/x.svg'`）或 `<img>`。
  - Vue：vite-svg-loader 或 svg-sprite（`<use href="#icon-x">`）。
  - Angular：svg 组件 / inline SVG / svg-sprite。
  - Svelte：`<svg>` 直接内联或 svg-sprite。

## 3. 框架差异

### React（18+，TypeScript，CSS Modules 或 Tailwind）

- **结构**：函数组件 + props 变体（`variant`, `size`, `state`）；变体样式与 DESIGN.md 变体键一一映射，禁止条件样式里写新色值。
- **样式**：CSS Modules（`.module.css` 引 `var(--...)`）或 Tailwind（`export --format json-tailwind` 注入 `theme.extend`）；间距/圆角全部走 token scale。
- **状态**：用 `:hover/:active/:focus-visible/[disabled]` 伪类还原五态；`:focus-visible` 的 focus ring（颜色/宽度/偏移）必须与设计 Focused 一致。
- **示例（Button 原子）**：

```tsx
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};
export function Button({ variant = 'primary', size = 'md', className, ...rest }: ButtonProps) {
  return <button className={cx(styles.button, styles[variant], styles[size], className)} {...rest} />;
}
// button.module.css
.button {
  height: var(--btn-height-md);            /* 设计标注整数值 */
  padding: 0 var(--pad-btn-x);
  border-radius: var(--radius-md);
  font: var(--font-btn);
}
.primary { background: var(--color-primary); color: var(--color-on-primary); }
.primary:hover  { background: var(--color-primary-hover); }
.primary:active { background: var(--color-primary-active); }
.primary:disabled { background: var(--color-primary-disabled); }
```

- **图片/图标组件化**：`<Image>` 封装 `srcSet`/`width`/`height`/`alt`；`<Icon name="x" size={24}/>` 统一图标入口（内部 svg sprite 或 SVGR 映射表）。
- **最佳实践**：Storybook/独立预览页逐组件呈现五态矩阵（对齐规格板）；`prefers-reduced-motion` 尊重；a11y（对比度 AA、focus 可见、语义标签）。

### Vue（3，`<script setup>` + TypeScript，Scoped SCSS 或 Tailwind）

- **结构**：单文件组件，props 定义变体（`variant`/`size`）；`defineProps` + 类名映射同 React 约定；emits 遵循 `update:modelValue` 等惯例。
- **样式**：`<style scoped>` 引 `var(--...)`；或 Tailwind 同上导出注入 `theme.extend`。
- **状态**：伪类 + `:disabled`；Vue 特有用 `:class` 绑定计算类（`{ [styles.isPressed]: pressed }`），样式值仍只来自 token。
- **示例（Button 原子）**：

```vue
<script setup lang="ts">
defineProps<{ variant?: 'primary'|'secondary'|'tertiary'|'ghost'|'danger'; size?: 'sm'|'md'|'lg'; disabled?: boolean }>();
</script>
<template>
  <button class="btn" :class="['btn--' + (variant ?? 'primary'), 'btn--' + (size ?? 'md')]" :disabled="disabled">
    <slot />
  </button>
</template>
<style scoped>
.btn {
  height: var(--btn-height-md);
  padding: 0 var(--pad-btn-x);
  border-radius: var(--radius-md);
  font: var(--font-btn);
}
.btn--primary { background: var(--color-primary); color: var(--color-on-primary); }
.btn--primary:hover  { background: var(--color-primary-hover); }
.btn--primary:active { background: var(--color-primary-active); }
.btn--primary:disabled { background: var(--color-primary-disabled); }
</style>
```

- **图片/图标**：`<img :src="imageUrl" :srcset="imageSrcSet" width height alt>`（`imageUrl` 由 `import img from '@/assets/images/x.png'` 得到）；图标用 `vite-svg-loader` 内联 SVG 组件或 svg-sprite + `<svg><use/></svg>`。
- **最佳实践**：`<component :is>` 做变体分发；Vue DevTools/预览页呈现五态矩阵；a11y 同 React。

### Angular（standalone components，SCSS / Tailwind）

- **结构**：standalone component + 信号 `input()` 定义变体（`variant`/`size`）；变体样式与 DESIGN.md 变体键一一映射。
- **样式**：`styles`/`styleUrl` 引 `var(--...)`；或 Tailwind 注入 `theme.extend`。
- **状态**：`:hover/:active/:focus-visible/:disabled` 伪类还原五态；focus ring 同设计。
- **资源**：`import img from '...'` 进组件；图标用 svg 组件 / inline SVG / svg-sprite。

### Svelte（SvelteKit，scoped CSS / Tailwind）

- **结构**：`.svelte` 组件 + `export let variant/size`（或 `$props()`）；变体映射同 React 约定。
- **样式**：`<style>` 引 `var(--...)`；或 Tailwind。
- **状态**：CSS 伪类 + Svelte 状态；样式值只来自 token。
- **资源**：`import img from '...'`；图标直接内联 `<svg>` 或 svg-sprite。

## 4. pixel-perfect 纪律（Web 特有）

1. **整数像素**：间距/尺寸/圆角取设计整数标注；用 token scale，不写 12.5px。
2. **盒模型统一**：`box-sizing: border-box` 全局声明；边框计入尺寸（描边 inner 语义与 Penpot `strokeAlignment='inner'` 对应）。
3. **字体**：`@font-face` 自托管（同设计字族），`font-weight/line-height/letter-spacing` 逐项对齐 F2 字阶；禁用合成粗体。
4. **状态完备**：五态逐一实现，色值取自 DESIGN.md 变体键。
5. **稳定渲染后再截图比对**：禁动画（`prefers-reduced-motion` 或注入 CSS 冻结 transition）、固定 viewport = **该档基准宽**（web 1440 / pad 834 / mobile 375）、DPR=1。
6. **资源零外链**：所有图片/图标 import 打包，不依赖运行时相对路径。
7. **响应式 / 档位**：`targetProfiles` 含多档时，用 CSS 媒体断点（`@media (max-width: 834px)` 等）实现 pad/mobile 布局，触控目标 ≥44px；单一档位可固定该宽不做断点。逐档分别截图与 Penpot 对应板比对。
