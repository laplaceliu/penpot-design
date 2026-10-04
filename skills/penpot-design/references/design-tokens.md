# Penpot Design Tokens —— 权威用法（本机实测，非文档转述）

> **本文所有结论均为在真实 Penpot 文件上用 `execute_code` 实测得到**，凡与官方文档/high-level overview 冲突处，均以本文为准并标注 `[文档有误]`。
> 官方三篇参考文章（design-tokens / what-are-design-tokens / design-tokens-with-penpot）年代较早，**只用来看概念，不要照抄 API**。
>
> 配套可执行引擎：`scripts/token_engine.js`（粘贴即用，含建集/校验/应用/审计）。

## 0. 六条铁律（先记这个，其余都是细节）

1. **`addSet()` 默认 `active: false`；未激活的 set 会造成「静默失败」**——绑定记上了、值不生效、不报错。
   建集必须显式激活：`tokens.addSet({name, active: true})` 或建后 `set.toggleActive()`。
   **这是本技能踩过的头号坑**：曾交付的文件里 3 个 set 全部未激活，38 个 token 全是死的。
2. **应用是异步的**，且**只有当目标形状真能承载该属性时才生效**。
   `applyToShapes()` 对不适用的形状**返回成功但不记录任何东西** → **必须 readback `shape.tokens` 验证**，"没报错"不等于"应用了"。
3. **`properties` 参数尽量省略**。省略 = 用该类型的默认属性（见 §3 表）；
   显式传 `['all']` **在本版本必然报错** `[文档有误]`；传错属性名也报错（如字体族要传 `fontFamily` 而不是文档写的 `fontFamilies`）。
4. **token 按「名字」应用，不按 id**。同名 token 存在于多个激活 set 时，**`sets` 数组里靠后的胜出**；
   停用某个 set 会改变已解析的值。所以 set 顺序 = 优先级，要把「基础层」放前面、「主题层」放后面。
5. **`resolvedValue` 只有在 set 激活后才非 null**。校验 token 是否可用，看 `resolvedValue`/`resolvedValueString` 是否为空。
6. **set 按「要不要一起激活」切，绝不按类型切**。`type` 是 token 自身的属性，UI 在**每个 set 内部**
   自动按类型分组（`tokensByType`），一个 set 能装下全部 17 类。按 `Color`/`Radius`/`Spacing` 拆 set 是
   类别错误：这三类永远同时激活，拆开只会把 1 次开关变成 N 次。详见 §1.1。

## 1. 对象模型

```
penpot.library.local.tokens            // TokenCatalog（注意：不在 penpot.library.tokens）
├── sets: TokenSet[]                   // 数组顺序 = 优先级（后者胜）
├── themes: TokenTheme[]               // 扁平数组；分组靠 group 属性
├── addSet({name, active?}): TokenSet  // active 省略时为 false ⚠️
├── addTheme({group, name}): TokenTheme
├── getSetById(id) / getThemeById(id)
```

| 对象 | 成员 |
|---|---|
| `TokenSet` | `id` `name` `active` `tokens: Token[]` `tokensByType: [string, Token[]][]` `toggleActive()` `getTokenById(id)` `addToken({type,name,value})` `duplicate()` `remove()` |
| `Token`（各具体类型） | `id` `name` `description`(可写) `type` `value` `resolvedValue` `resolvedValueString` `duplicate()` `remove()` `applyToShapes(shapes, props?)` `applyToSelected(props?)` |
| `TokenTheme` | `id` `group` `name` `active` `toggleActive()` `activeSets: TokenSet[]` `addSet(set\|id)` `removeSet(...)` `duplicate()` `remove()` |

**没有 `penpot.tokens`，也没有 `penpotUtils.tokens`** —— 入口只有 `penpot.library.local.tokens`。

### 1.1 Set 到底该怎么切（建模规则）—— 不要按类型切

**先记住一件事：`SET` 不是「类型分区」，`type` 是 token 自身的属性。**

实测（本机）：

- **一个 set 可以同时容纳全部 17 种类型**（实测：往单个 set 里加 17 类 token，全部成功）；
  UI 上的 `Color / Border Radius / Dimensions / …` 分类**是每个 set 内部按 `type` 自动分组**的，
  由 `set.tokensByType: [type, Token[]][]` 提供 —— **不需要为此建 set**。
- **`toggleActive()` 的粒度就是 set**：一次切换影响该 set 内**全部** token（实测 17 个一起变）。
- **`theme.addSet()` 也只接受 set**，不能按类型激活。

所以 **set = 激活 / 主题层（同时开、同时关的一组 token）**，切分依据是「**要不要一起激活**」，
而不是「**是什么类型**」。

| 切法 | 评价 |
|---|---|
| 按类型切（`Color` / `Radius` / `Spacing` 各一个 set） | ❌ **类别错误**。语义上这三类永远同时激活，拆开只是把 1 次开关变成 N 次；做主题时要在每个 set 里各放一份覆盖值，极易漏改 |
| 按主题/层切（`Core` / `Dark` / `Density-Compact`） | ✅ **正确**。与 `active` + 优先级（后者胜）机制天然吻合 |

**推荐的两条落地形态：**

1. **无主题（最常见）** → **一个 set 装完**（如 `pix · Core`，内部按类型自动分组，UI 上一样清晰）。
2. **有主题（暗色 / 密度 / 品牌）** → **基础层在前 + 覆盖层在后**：
   ```
   sets: [ 'pix · Core'(基础全部 38 个), 'pix · Dark'(只放要覆盖的 color，同名) ]
   ```
   基础层必须排在前（`sets` 顺序即优先级，**后面的胜出**，见 §5）；
   用 `theme.addSet(core); theme.addSet(dark); theme.toggleActive()` 做成预设。

**另一条实测约束（影响命名方案）**：同一 set 内 token 名**全局唯一，且按 `.` 视为路径**——
`t.color` 存在时报错 `A token already exists at the path: t.color or at a prefix thereof`，
即**不能同时存在 `t.color` 与 `t.color.x`**（叶子和父节点互斥）。
所以命名要统一前缀方案（`color.primary` / `radius.md` / `spacing.xxs` 这种**同级前缀**是安全的），
**不要**用「`md` 下面挂 `md.lg`」这类会与既有 token 撞路径的名字。

## 2. 十七种 TokenType（UI 上的 17 个分类，与 API 一一对应）

```
borderRadius · shadow · color · dimension · fontFamilies · fontSizes · fontWeights ·
letterSpacing · number · opacity · rotation · sizing · spacing · borderWidth ·
textCase · textDecoration · typography
```

> `[文档有误]` high-level overview 的 TokenType 列表**漏了 `number` / `rotation` / `sizing`**，
> 只有 14 个；实际是 **17 个**。写代码时以本表为准。

## 3. 值格式 / 默认应用属性 / 适用形状（实测矩阵）

| type | UI 名 | 传入 `value` | 存储后 `value` | **省略 props 时的默认属性** | 文本 | 图元 |
|---|---|---|---|---|---|---|
| `color` | Color | `'#FF471D'` | `'#FF471D'` | `fill` | ✅ | ✅ |
| `borderRadius` | Border Radius | `'8'` | `'8'` | `borderRadiusTopLeft` +`TopRight` +`BottomRight` +`BottomLeft`（**4 个键**） | ❌ | ✅ |
| `dimension` | Dimensions | `'16'` | `'16'` | `width` **+ `height`** | ✅ | ✅ |
| `fontFamilies` | Font Family | `'Inter'` | **`['Inter']`**（自动转数组） | **`fontFamily`**（单数！） | ✅ | ❌ |
| `fontSizes` | Font Size | `'16'` | `'16'` | `fontSize` | ✅ | ❌ |
| `fontWeights` | Font Weight | `'600'` | `'600'` | `fontWeight` | ✅ | ❌ |
| `letterSpacing` | Letter Spacing | `'0.02'` | `'0.02'` | `letterSpacing` | ✅ | ❌ |
| `number` | Number | `'42'` | `'42'` | `rotation` | ✅ | ✅ |
| `opacity` | Opacity | `'0.6'` | `'0.6'` | `opacity` | ✅ | ✅ |
| `rotation` | Rotation | `'45'` | `'45'` | `rotation` | ✅ | ✅ |
| `shadow` | Shadow | 对象（见下） | **数组**（见下） | `shadow` | ✅ | ✅ |
| `sizing` | Sizing | `'240'` | `'240'` | `width` **+ `height`** | ✅ | ✅ |
| `spacing` | Spacing | `'24'` | `'24'` | **无默认属性（no-op）** | ❌ | ❌ |
| `borderWidth` | Stroke Width | `'1'` | `'1'` | `strokeWidth` | ✅ | ✅ |
| `textCase` | Text Case | `'uppercase'` | `'uppercase'` | `textCase` | ✅ | ❌ |
| `textDecoration` | Text Decoration | `'underline'` | `'underline'` | `textDecoration` | ✅ | ❌ |
| `typography` | Typography | 组合对象（见下） | 组合对象 | `typography` | ✅ | ❌ |

「文本/图元」列 = 该类型能否作用到该形状；❌ 表示应用会**静默 no-op**（返回成功、`tokens` 为空）。

### 3.1 shadow 的值形状

传入单个对象即可，存储时**自动包成数组**，且 `inset` 被强转为**布尔**：

```js
set.addToken({ type: 'shadow', name: 'elevation.md', value: {
  color: '#1C1D20', inset: 'false', offsetX: '0', offsetY: '4', spread: '0', blur: '12'
}});
// 读回 value: [{ offsetX:'0', offsetY:'4', blur:'12', spread:'0', color:'#1C1D20', inset:false }]
```

### 3.2 typography 的值形状（**注意键名会被重命名**）

```js
set.addToken({ type: 'typography', name: 'type.body', value: {
  letterSpacing: '0', fontFamilies: 'Inter', fontSizes: '16',
  fontWeight: '400', lineHeight: '1.5', textCase: 'none', textDecoration: 'none'
}});
// 读回 value: { fontFamily:['Inter'], fontSize:'16', fontWeight:'400',
//               letterSpacing:'0', lineHeight:'1.5', textCase:'none', textDecoration:'none' }
//                        ↑ fontFamilies→fontFamily      ↑ fontSizes→fontSize
```

- **`lineHeight` 没有独立 token 类型**，只作为 Typography 的组成部分存在。
- 组合值里的每一项都可以写成**引用**（见 §4），如 `fontSizes: '{fontSize.md}'`；
  但注意重命名后要引用对应类型的 token。

### 3.3 数值一律存成字符串

`spacing` / `dimension` / `borderRadius` / `borderWidth` / `sizing` / `number` / `opacity` / `rotation`
**存储形态都是字符串**（`'16'`、`'0.6'`），但**也接受 JS number 输入**，会被强制转成字符串。
写代码时统一传字符串，避免读回时类型不一致。

## 4. 引用（token → token）

`value` 写 `'{set层级之外的token名}'`（**只写 token 名，不带 set 名**）即成为引用：

```js
set.addToken({ type: 'color', name: 'color.link', value: '{color.primary}' });
// value: '{color.primary}'   resolvedValue: '#FF471D'   resolvedValueString: '#FF471D'
```

- 引用**跨 set 解析**（本 set 或任何激活 set 里的同名 token 均可被引用）。
- 未激活时 `resolvedValue` 仍是 `null` —— 引用链只在激活状态下解析。

## 5. 激活 / set 与 theme 的区别 / 优先级

### 5.1 Set 与 Theme 的本质区别

| | **TokenSet** | **TokenTheme** |
|---|---|---|
| 是什么 | **token 的容器**（真正的数据） | **「哪些 set 应该开着」的预设**（只是一组引用） |
| 存 token 吗 | **存**（`tokens` / `tokensByType`） | **不存**，只有 `activeSets`（引用其他 set） |
| 必需吗 | **必需**，没有 set 就无处放 token | **可选**，纯 UI 便利 |
| 能否单独开关 | 能（`set.toggleActive()`），**但会清空所有 theme 的激活状态** | 能（`theme.toggleActive()`），连带切换其 `activeSets` |
| 互斥性 | 不互斥，可任意多开 | **同 `group` 内互斥**（激活一个自动停用同组另一个）；**不同 group 可同时激活** |
| 命名唯一域 | **是**（set 内 name 唯一，且 `.` 是路径） | 不是 |
| 影响优先级吗 | **是**（`sets` 数组顺序） | 否，只决定"谁开着" |

**一句话：set 是"数据"，theme 是"开关组合"。**

### 5.2 核心规则（实测，比官方文档更明确）

> **`set.active` 是「所有已激活 theme 的并集」的派生值 —— 某 set 处于激活，当且仅当至少有一个激活的 theme 包含它。**

实测逐步核对（3 个 set，2 个 group）：

| 步骤 | 观测到的 set 状态 | 观测到的 theme 状态 |
|---|---|---|
| 初始 | 全 off | 全未激活（`activeSets` 仍显示**声明成员**，与激活状态无关） |
| 激活 `Density/compact` | `dense=ON` | compact=ACTIVE |
| 激活 `Scheme/dark`（含 base+dark） | `base=ON dark=ON`，**`dense` 保持 ON** | dark 与 compact **同时 ACTIVE** |
| 激活 `Scheme/light`（同组） | `base=ON`，**`dark` 变 off**，`dense` 保持 ON | dark **被自动停用**，light=ACTIVE |
| 直接 `base.toggleActive()` | `base=off`，`dense` 保持 ON | **三个 theme 全部被清空** |

三条推论：

1. **激活 theme 不会关掉 theme 之外的 set**（`dense` 一直没被关）——但**停用 theme 会关掉它的 set**（步骤 3 的 `dark`）。
   所以精确表述是「并集」而不是「只增不减」。
2. **同组互斥是自动的**，不需要手写停用逻辑 —— 这就是 theme 存在的最大价值：用 axis 表达"只能选一个"的约束。
3. **直接 toggle set 会清空所有 theme** —— 一旦这么做，就进入了"手动自定义"状态，theme 的 `active` 全部变 false。

### 5.3 优先级（与 theme 无关）

两个**激活** set 定义同名 token → **`sets` 数组中靠后的那个胜出**；停用它则回退到靠前者。
theme 只决定"谁开着"，**不改变 `sets` 的顺序**。

所以约定：**基础层放前、主题覆盖层放后**：

```
sets: [ 'pix · Core'(全部基础 token), 'pix · Dark'(只放要覆盖的同名 token) ]

ensureTheme('Scheme', 'Light', ['pix · Core'])
ensureTheme('Scheme', 'Dark',  ['pix · Core', 'pix · Dark'])   // Dark 在后 → 激活时覆盖 Core
activateTheme('Scheme', 'Dark')                                 // → color.primary 解析为覆盖值
```

### 5.4 API 与引擎

```js
// 原生
const t = tokens.addTheme({ group: 'Scheme', name: 'Dark' });  // 默认 active:false
t.addSet(coreSet); t.addSet(darkSet);                          // 接受 TokenSet 或 id
t.toggleActive();                                              // 激活（同组另一个会被自动停用）

// 引擎（推荐，已封装上述规则）
TK.ensureTheme('Scheme', 'Dark', ['pix · Core', 'pix · Dark']);
TK.activateTheme('Scheme', 'Dark');     // 返回 { active, activeSetsNow }
TK.activeSets();                        // 当前实际激活的 set 名单
```

> ⚠️ **有 theme 时不要直接 `set.toggleActive()`** —— 会清空全部 theme。
> `TK.ensureSet()` 已自带保护：检测到存在 theme 时默认不再直接 toggle（可用第三个参数 `force` 强制）。
> `TK.audit()` 也会自动切换判据：无 theme → 未激活 set 算故障；有 theme → 未激活属正常态，
> 改判「无同组多激活 + 已激活 set 内 token 全部可解析」。

## 6. 应用 token

```js
token.applyToShapes([shapeA, shapeB]);          // ✅ 省略 properties → 用默认属性
token.applyToShapes([shape], ['fill']);         // ✅ 显式指定（属性名要写对）
shape.applyToken(token, ['strokeColor']);       // ✅ 等价写法
token.applyToSelected(['fontSize']);            // 作用于当前选中
await nap(500);                                 // ⏳ 异步，读回前必须等待
```

**六个必须知道的坑：**

1. **省略 `properties`**。实测传 `['all']` 一律报
   `Value not valid: Field 1 is invalid: should be a set of strings` —— `[文档有误]`，本版本 `'all'` 不可用。
2. **字体族的属性名是 `fontFamily`（单数）**，而 `TokenFontFamiliesProps` 文档写的是 `"fontFamilies"`。
   传 `['fontFamilies']` → 报同样的 `should be a set of strings`；传 `['fontFamily']` → 成功。`[文档有误]`
3. **不适用 = 静默成功**。给矩形应用 `fontSizes` 返回 OK，但 `rect.tokens` 仍是 `{}`。
   **判据只有 readback**：
   ```js
   token.applyToShapes([sh]);
   await nap(500);
   if (!sh.tokens || !Object.keys(sh.tokens).length) throw new Error('token 未生效：检查 set 是否 active / 形状是否支持该属性');
   ```
4. **typography 会覆盖单项绑定**。先应用 `fontSize`+`fontWeight`+…，再应用 `typography`，
   则 `shape.tokens` 只剩 `{typography:'…'}`，单项绑定丢失。二者**不要混用**。
5. **`dimension` 与 `sizing` 默认同时设宽和高**（不是只设一个）；只想设宽就显式传 `['width']`。
6. **`spacing` 没有默认属性**，省略 props 等于什么都没做。要作用于 flex 容器，需显式指定：
   ```js
   spacingToken.applyToShapes([flexBoard], ['rowGap', 'columnGap']);
   // 也可 'paddingLeft' / 'marginTop' / 'layoutItemMinW' …（见 TokenSpacingProps）
   ```

`shape.tokens` 是 `{ 属性名: token名字 }` 的映射（注意**没有** `x`/`y`/`height` 之外的坑；
`fontFamilies` 在这里同样以 **`fontFamily`** 出现）。

## 7. 解除绑定

**没有 removeToken API** —— 直接写形状属性即可解绑：

```js
shape.fills = [{ fillColor: '#FF471D', fillOpacity: 1 }];   // tokens.fill 随之清空
```

**关键细则（实测）**：写**相同的值**属于 no-op，**绑定不会被清除**；
必须写入一个**不同的值**才会解绑。所以「先记录原值、再写回原值」**无法**用来解绑，
需要中间写一个临时值：

```js
const keep = shape.fills[0].fillColor;
shape.fills = [{ fillColor: '#000001', fillOpacity: 1 }];  // 不同的值 → 解绑
shape.fills = [{ fillColor: keep,      fillOpacity: 1 }];  // 再写回真值
```

## 8. 与 DESIGN.md 章节的映射

| DESIGN.md 章节 | 应录入的 token 类型 |
|---|---|
| Colors | `color` |
| Typography | `typography`（主）+ `fontFamilies` / `fontSizes` / `fontWeights` / `letterSpacing`（供引用与单独应用）+ `textCase` / `textDecoration`（按需） |
| Layout | `spacing` / `dimension` / `sizing` |
| Elevation & Depth | `shadow` / `opacity` |
| Shapes | `borderRadius` / `borderWidth` |
| （其他） | `number` / `rotation`（用于角标、旋转装饰等） |

**可选的机械化桥梁**：`design.md` CLI 能把 DESIGN.md 导出成 W3C Design Tokens（DTCG）与 Tailwind 主题：

```bash
npx @google/design.md export --format dtcg DESIGN.md > tokens.json   # 机器可读，可作为 TK.seed 的 spec 来源
```

用它可以避免手抄数值；但 **DTCG 的类型名与 Penpot 的 17 种 TokenType 并不一一对应**
（如 DTCG 无 `sizing`/`rotation`，Penpot 无 `duration`/`cubicBezier`），仍需一层显式映射。

## 9. 验收配方【门禁 G9】（必须跑）

粘贴 `scripts/token_engine.js` 后：

```js
return storage.TK.audit();    // 全量体检
storage.TK.assert();          // 不合格直接抛错，可直接当门禁用
// 端到端：至少在 1 个真实形状上应用并回读
await storage.TK.apply('color.primary', [someRealShape]);   // 必须返回 ok:true
```

体检项（任一不过即为不合格）：

1. 每个 set 的 `active === true`（**未激活 = 全部 token 失效**）；
2. 每个 token 的 `resolvedValueString` 非空（引用链断裂会在这里暴露）；
3. set 顺序符合「基础在前、覆盖在后」；
4. name 与 DESIGN.md 一一对应、无重名跨 set 冲突（除非是有意的主题覆盖）；
5. `themes` 若存在，其 `activeSets` 与 `active` 状态符合预期。

## 10. 文档与实现的差异清单（照文档写会踩雷）

| 项 | 文档说 | 实测 |
|---|---|---|
| TokenType 数量 | 14（列了 14 个） | **17**（多 `number` / `rotation` / `sizing`） |
| `addSet` 默认 | 未说明 | **`active: false`**（静默失败之源） |
| `properties: ['all']` | 是合法 TokenProperty | **报错，不可用** |
| 字体族属性名 | `fontFamilies` | 传入须用 **`fontFamily`**；`shape.tokens` 键也是 `fontFamily` |
| `spacing` 默认属性 | 未说明 | **无**（省略 props = no-op） |
| `dimension`/`sizing` 默认 | 未说明 | 同时作用 `width` 与 `height` |
| token 入口 | `penpot.library.local.tokens` | ✅ 一致（但**不存在** `penpot.tokens`） |
| 应用同步性 | 说明是异步 | ✅ 一致（实测需 ~500ms 才稳定） |
| 解绑方式 | 「直接设属性即可」 | ✅ 但**写相同值不解绑** |
