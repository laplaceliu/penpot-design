# Adapter: Web frontend (React / Vue / Angular / Svelte …)

The generic discipline is in `references/design-to-code-generic.md`. This file covers all DOM/CSS-based Web frameworks, sharing a CSS/Flex baseline; framework differences are below; the general principles and viewport-tier constraints are the same as generic §0.

## 1. Token layer (CSS variable baseline)

- `npx @google/design.md export --format css-tailwind DESIGN.md > theme.css` (CSS custom properties) or `--format dtcg` → style-dictionary generates CSS variables + TS constants; component styles may only reference `var(--...)`, no scattered hex.
- Responsive breakpoints are also variable-ized (see §4).

## 2. Asset system

- Images: photos/illustrations/bitmaps go into `src/assets/images/`, imported into modules (bundler hash/optimize); responsive @1x/@2x/@3x use `srcSet` + `sizes`; `<img>` must carry `width/height` to prevent layout shift; solid blocks/radii/shadows done with CSS.
- Icons: SVG preferred, internal `currentColor` coloring follows tokens, never export multiple copies of a monochrome icon; naming consistent with 01 F6 `icon-<name>-<size>.svg`, default 24px grid.
  - React: SVGR (`import { ReactComponent as Icon } from './icons/x.svg'`) or `<img>`.
  - Vue: vite-svg-loader or svg-sprite (`<use href="#icon-x">`).
  - Angular: svg component / inline SVG / svg-sprite.
  - Svelte: `<svg>` directly inlined or svg-sprite.

## 3. Framework differences

### React (18+, TypeScript, CSS Modules or Tailwind)

- **Structure**: function components + props variants (`variant`, `size`, `state`); variant styles map 1:1 to DESIGN.md variant keys, never write new color values inside conditional styles.
- **Styling**: CSS Modules (`.module.css` referencing `var(--...)`) or Tailwind (`export --format json-tailwind` injected into `theme.extend`); spacing/radii all go through the token scale.
- **States**: use `:hover/:active/:focus-visible/[disabled]` pseudo-classes to restore the five states; the `:focus-visible` focus ring (color/width/offset) must match the design's Focused state.
- **Example (Button atom)**:

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
  height: var(--btn-height-md);            /* design annotation integer value */
  padding: 0 var(--pad-btn-x);
  border-radius: var(--radius-md);
  font: var(--font-btn);
}
.primary { background: var(--color-primary); color: var(--color-on-primary); }
.primary:hover  { background: var(--color-primary-hover); }
.primary:active { background: var(--color-primary-active); }
.primary:disabled { background: var(--color-primary-disabled); }
```

- **Image/icon componentization**: `<Image>` wraps `srcSet`/`width`/`height`/`alt`; `<Icon name="x" size={24}/>` unifies the icon entry (internal svg sprite or SVGR mapping table).
- **Best practices**: Storybook/standalone preview page shows the five-state matrix per component (aligned to spec boards); respect `prefers-reduced-motion`; a11y (contrast AA, visible focus, semantic tags).

### Vue (3, `<script setup>` + TypeScript, Scoped SCSS or Tailwind)

- **Structure**: single-file component, props define variants (`variant`/`size`); `defineProps` + class-name mapping same as React convention; emits follow `update:modelValue` etc. conventions.
- **Styling**: `<style scoped>` references `var(--...)`; or Tailwind injected into `theme.extend` as above.
- **States**: pseudo-classes + `:disabled`; Vue-specific use `:class` to bind computed classes (`{ [styles.isPressed]: pressed }`), style values still only come from tokens.
- **Example (Button atom)**:

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

- **Images/icons**: `<img :src="imageUrl" :srcset="imageSrcSet" width height alt>` (`imageUrl` obtained from `import img from '@/assets/images/x.png'`); icons use `vite-svg-loader` inline SVG component or svg-sprite + `<svg><use/></svg>`.
- **Best practices**: `<component :is>` for variant dispatch; Vue DevTools/preview page shows the five-state matrix; a11y same as React.

### Angular (standalone components, SCSS / Tailwind)

- **Structure**: standalone component + signal `input()` defines variants (`variant`/`size`); variant styles map 1:1 to DESIGN.md variant keys.
- **Styling**: `styles`/`styleUrl` reference `var(--...)`; or Tailwind injected into `theme.extend`.
- **States**: `:hover/:active/:focus-visible/:disabled` pseudo-classes restore the five states; focus ring matches the design.
- **Assets**: `import img from '...'` into the component; icons use svg component / inline SVG / svg-sprite.

### Svelte (SvelteKit, scoped CSS / Tailwind)

- **Structure**: `.svelte` component + `export let variant/size` (or `$props()`); variant mapping same as React convention.
- **Styling**: `<style>` references `var(--...)`; or Tailwind.
- **States**: CSS pseudo-classes + Svelte state; style values only come from tokens.
- **Assets**: `import img from '...'`; icons directly inlined `<svg>` or svg-sprite.

## 4. pixel-perfect discipline (Web-specific)

1. **Integer pixels**: spacing/size/radius take integer design annotations; use the token scale, never write 12.5px.
2. **Unified box model**: `box-sizing: border-box` declared globally; borders counted into size (inner stroke semantics correspond to Penpot `strokeAlignment='inner'`).
3. **Font**: `@font-face` self-hosted (same design font family), `font-weight/line-height/letter-spacing` aligned item-by-item to the F2 type scale; synthetic bold disabled.
4. **State completeness**: implement the five states one-by-one, color values from DESIGN.md variant keys.
5. **Screenshot after stable render**: animations off (`prefers-reduced-motion` or inject CSS to freeze transitions), fixed viewport = **that tier's baseline width** (web 1440 / pad 834 / mobile 375), DPR=1.
6. **Zero external asset links**: all images/icons imported and bundled, no runtime-relative paths.
7. **Responsive / tiers**: when `targetProfiles` contains multiple tiers, use CSS media breakpoints (`@media (max-width: 834px)` etc.) to implement pad/mobile layouts, touch targets ≥44px; a single tier can fix that width without breakpoints. Screenshot each tier separately and compare against the corresponding Penpot board.
