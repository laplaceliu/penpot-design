# Catalog pack — 131 codesign-ui families

> The catalog is an optional **component inventory**, not a page standard. It gives a 1:1 recreation of the
> codesign-ui family set; it does not dictate pages, page order or block-page builds.

## 1. Inventory

`assets/components/catalog.json` is generated from `assets/libraries/codesign-ui.json`:

| Kind | Count | Renderer |
|---|---|---|
| Factory-backed visual | 69 | `storage.CF` factory |
| Source-anatomy visual | 56 | `storage.AN` + `LM.anatomyBoard` |
| Behaviour-only | 6 | `renderer:"none"` (indexed, never built) |
| **Visual total** | **125** | |
| **All families** | **131** | |

Chapters:

| Chapter | Families |
|---|---|
| Actions | Button, IconButton, ButtonGroup, SplitButton, FAB, Link, Clipboard, DownloadTrigger, Toggle, ToggleGroup |
| Text fields | Input, Textarea, Search, MaskedInput, Transfer, AngleSlider, DateInput, Editable, Field, Fieldset, FileUpload, NumberInput, PasswordInput, PinInput, SignaturePad, TagsInput |
| Selection & pickers | Checkbox, ColorPicker, Combobox, DatePicker, TimePicker, RadioGroup, RatingGroup, SegmentGroup, Select, Slider, Switch |
| Data & lists | TableHeader, TableRow, TableState, ListItem, Descriptions, Timeline, MiniCalendar, Carousel, JsonTreeView, Listbox, TreeView |
| Display & media | Badge, StatusText, Chip, AvatarGroup, Card, KPI, Skeleton, EmptyState, Avatar, Frame, Highlight, ImageCropper, Marquee, Progress, QrCode, ScrollArea, Splitter, Swap, Timer |
| Navigation | NavItem, TabBand, Breadcrumb, CommandPalette, Accordion, Collapsible, Menu, NavigationMenu, Pagination, Steps, Tabs, Toc |
| Overlays & feedback | Alert, Notification, Popconfirm, Spin, Sheet, Dialog, Drawer, FloatingPanel, HoverCard, Popover, Toast, Tooltip, Tour |
| AI & agents | Conversation, Message, PromptInput, ModelSelector, Attachments, Suggestion, Sources, InlineCitation, Reasoning, ChainOfThought, Plan, Tool, Task, Queue, Confirmation, Question, Agent, Artifact, CodeBlock, Snippet, Terminal, Sandbox, WebPreview, JSXPreview, SchemaDisplay, EnvironmentVariables, PackageInfo, Commit, Checkpoint, Context, StackTrace, TestResults, Shimmer |

The 6 behaviour-only families (ClientOnly, Collection, FocusTrap, Format, Portal, Presence) are index entries; they have
no visual master.

## 2. Loading the catalog

```js
// anatomy support first (only needed for the 56 source-anatomy families)
for (const f of ['anatomy-engine.js','catalog-engine.js']) {
  const src = await (await fetch('http://127.0.0.1:8777/scripts/' + f)).text();
  new Function('storage','penpot','penpotUtils', src)(storage, penpot, penpotUtils);
}
const manifest = await (await fetch('http://127.0.0.1:8777/assets/libraries/codesign-ui.json')).json();
const anatomy  = await (await fetch('http://127.0.0.1:8777/assets/libraries/codesign-ui.anatomy.json')).json();
storage.LM.load(manifest, anatomy);

const catalog = await (await fetch('http://127.0.0.1:8777/assets/components/catalog.json')).json();
storage.CK.load(catalog, {pack:'catalog', keep:true});
```

`keep:true` preserves the richer core definition when a catalog id is shared (`Button`, `Input`, `Card`…). The catalog
pack still lists every id; only the shared definitions come from core.

Build a catalog family exactly like a core one:

```js
await CK.master('AngleSlider', {}, {x:80, y:80}); // custom → LM.anatomyBoard
await CK.master('Tabs', {}, {x:80, y:400});        // factory renderer
CK.audit({pack:'catalog'});                       // only after the intended masters exist
```

`CK.buildPack('catalog', …)` is possible but builds all 131 masters in one grid; it is not a page contract. Prefer a
small spec/catalog page and build the families you need, in batches.

## 3. Source anatomy

`assets/libraries/codesign-ui.anatomy.json` is a resolved JSX/CSS tree per custom family, produced by
`scripts/extract-anatomy.js` from the host repo examples and styles. `anatomy-engine.js` renders it as a wireframe
board; `catalog-engine.js` wraps it in a `Family·Spec` frame.

- Missing anatomy → `LM.anatomyBoard` falls back to a part-tree board; the component still exists and is token-bound.
- The extractor and `inventory-library.py` are maintenance tools; they need the host repo's `node_modules/typescript`
  and the `.storybook/modules` CSS. They are not needed at runtime.
- The catalog manifest is the 1:1 inventory; a project may change material/geometry inside a family, but may not add,
  remove or reorder a family.

## 4. Regeneration and validation

```bash
python3 scripts/build-component-catalog.py        # assets/libraries/codesign-ui.json -> assets/components/catalog.json
python3 scripts/validate-components.py            # definitions, factories, roles, 131 inventory
```

`build-component-catalog.py` preserves the manifest's page/order/parts/states and assigns the renderer:

- `factory` when the manifest factory exists in `CF`;
- `anatomy` for `custom`;
- `none` for `kind:"nonVisual"`.

`validate-components.py` fails on a missing family, duplicate id, unknown factory/role, a pack id that does not resolve,
or an inventory count other than 125 visual / 6 non-visual.
