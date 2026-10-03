# 验证指南：PIL 像素级比对（pixel-perfect 验收）

**验收唯一标准：实现截图与 Penpot 导出图逐像素比对达标。** 代码层"看起来对"不算数，必须出图出数。

## 1. 原理与工具

- 基准图：Penpot `export_shape({shapeId, format:'png'})` 导出的组件板/整页图（当前激活页导出）。
- 实测图：实现端截图（见 §3）。
- 工具：Python **PIL/Pillow**（`scripts/pixel_diff.py`），逐通道差分 + 容差 + 热图 + 指标。
- 参考图命名：`design/<组件名>.png`；实测图 `impl/<组件名>.png`；输出 `diff/<组件名>.diff.png` + `.json`。

## 2. 判定标准

| 指标 | 含义 | 默认阈值 |
|---|---|---|
| `diff_ratio` | 超出容差的像素占比 | ≤ 0.5%（整页）/ ≤ 0.2%（单组件） |
| `max_channel_delta` | 最大单通道差 | ≤ 12（抗锯齿/亚像素渲染容差） |
| `diff_bbox` | 差异包围盒 | 必须零散（边缘带），不得出现大块实心区域 |

- 大块连续差异 = 布局/尺寸/资源错误，不属容差范围，**必须修**。
- 边缘单像素差异（抗锯齿）在容差内接受。
- 退出码：0 达标 / 1 超阈值 / 2 尺寸不一致（尺寸不一致直接打回，不做缩放比对）。

## 3. 截图方法（先标准化再截图）

- **Qt**：QWidget 路线 `widget->grab().save(path)`（隐藏滚动条/焦点框）；窗口固定为**该档基准宽**（web 1440 / pad 834 / mobile 375）；`QT_SCALE_FACTOR=1`。Qt5 开 AA_UseHighDpiPixmaps 但比对时 DPR=1。
- **Web**：Playwright `page.screenshot({ clip })` 或元素 `locator.screenshot()`；viewport 宽 = **该档基准宽**（web 1440 / pad 834 / mobile 375），`deviceScaleFactor: 1`。
- **标准化**：比对前冻结动画（注入 CSS `* { transition: none !important; animation: none !important }`；Qt 用静态状态）、统一背景（不透明底色）、字体加载完成后截图（`document.fonts.ready`）。

## 4. 流程（每层实现完执行）

1. 导出基准图（PENPOT）→ `design/`
2. 截实测图 → `impl/`
3. 运行：
   ```bash
   python3 scripts/pixel_diff.py design/Button.png impl/Button.png \
       --out diff/Button.diff.png --threshold 12 --max-diff-ratio 0.002
   ```
4. 读 JSON 指标与热图：
   - 尺寸不一致 → 核对设计标注与实现固定尺寸/图片导出倍率。
   - 大块差异 → 按差异类型定位：位置偏移（间距/盒模型）、颜色（token 取值）、字体（字阶映射）、图标（资源引用/缩放）。
   - 仅边缘散点 → 通过。
5. 修复后回到第 2 步循环，直到达标。
6. 组件层全部达标后，对 14 页 Demo **各所选档位的屏幕板**分别做**整页比对**（阈值 0.5%）。
7. 汇总报告：组件 × 指标表（用户偏好表格化进度），附 diff 热图路径。

## 5. 常见差异 → 根因速查

| 热图形态 | 根因 | 修复方向 |
|---|---|---|
| 整体均匀偏移几像素 | 盒模型/边框/布局间距 | border-box、padding、layout gap 对齐标注 |
| 文字区域差异 | 字族/字重/行高/字距 | 对齐 F2 字阶；禁合成粗体 |
| 图标区域差异 | 资源引用错/缩放/着色 | 检查 @2x 命名、SVG currentColor |
| 图片区域实心差异 | 用错图/尺寸倍率错 | 核对 assets 清单与导出倍率 |
| 颜色整块差异 | token 取值错 | 回查 DESIGN.md tokens（唯一真源） |
| 阴影/发光缺失或被裁 | 容器 clip/效果未实现 | clip overflow 可见、补阴影效果 |

## 6. 用 PIL 辅助取色（入口 B 图片分析复用）

```python
from PIL import Image
im = Image.open("ref.png").convert("RGB")
for xy in [(x, y)]:          # 对设计图关键点取样
    print(xy, '#%02X%02X%02X' % im.getpixel(xy))
```

量化主色后回填 DESIGN.md；估计值在 prose 标注「自图片估计」。
