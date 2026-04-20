# Cursor 改造包

## 目标
把我的原生 HTML/CSS/JS 项目改成霓虹俱乐部风格。**只改视觉，不改结构和逻辑。**

## 资料
- `redesign-preview.png` — 成品视觉参考（4 个 tab 的截图）
- `style-redesign.css` — 已经写好的 CSS 皮肤补丁，直接合并用

## 红线（必须遵守）
- `main.js` 和 `data/*.json` 完全不动
- `index.html` 的 DOM 结构、id、data-* 属性 **不能删**
- 投题回跳、Tab 切换、抽卡、滑动手势逻辑不改
- 不要重写架构、不要引入任何框架

## 改造步骤（请一步一步做，每步做完停下来等确认）

### Step 1 · 引入字体
在 `index.html` 的 `<head>` 里、现有 `<link>` 之后加：
```html
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/cn-fontsource-alimama-shu-hei-ti-bold/font.css" rel="stylesheet">
```

### Step 2 · 把 CSS 补丁接进来
把 `style-redesign.css` 复制到项目根目录（和 `style.css` 同级），然后在 `index.html` 里 `style.css` 之后加：
```html
<link rel="stylesheet" href="style-redesign.css">
```
**先不要合并进 style.css**，用独立文件方便对比和回退。

### Step 3 · 给 body 打 tab 标记
找到 `main.js` 里切 tab 的函数，在**切换完成后**加一行：
```js
document.body.dataset.tab = activeTab; // activeTab ∈ 'grab-finger' | 'truth' | 'dare' | 'other-games'
```
CSS 变量 `--v3-color` 会根据 body 的 data-tab 自动切到对应主色。初始化时也要设置一次。

### Step 4 · 在每个 tab pane 顶部加巨字 Hero
在每个 tab 的内容容器最前面插入：
```html
<div class="v3-hero" data-text="TRUTH"></div>
```
对应关系：
- grab-finger → GRAB
- truth → TRUTH
- dare → DARE
- other-games → EXTRA

Hero 的文字是用 CSS `::before` / `::after` + `attr(data-text)` 画的，改 data-text 就能换字。

### Step 5 · 给已有元素加 class
搜索并追加 class（**不要替换原有 class，追加即可**）：

| 现有元素 | 追加 class |
|---|---|
| 顶部 header | `v3-header` |
| logo 小方块 | `v3-logo` |
| 投题按钮 "+ ADD" | `v3-add-btn` |
| 幼儿园/上高速切换容器 | `v3-mode`（并加 `data-mode="kindergarten"` 或 `"highway"`） |
| 切换里两个按钮 | `v3-mode__btn v3-mode__btn--kindergarten` / `v3-mode__btn v3-mode__btn--highway`，激活态加 `is-on` |
| 切换中间的轨道 | `v3-mode__track`，内部 dash 容器 `v3-mode__dashes`（12 个 `<i>`），校车 `v3-mode__bus`（内部 3 个 `<i>`） |
| 题目卡 | `v3-card`，题目文本 `v3-card__q`，底部区域 `v3-card__foot`，右下印戳 `v3-card__stamp` |
| "换一张" 按钮 | `v3-shuffle` |
| 底部 tab bar | `v3-tabbar`，每个 tab 按钮 `v3-tab`，激活态加 `is-on`，内部结构 `<span class="v3-tab__label"><span class="v3-tab__dot"></span>文字</span><div class="v3-tab__num">01</div>` |

### Step 6 · 玩点别的 Tab 的卡片
如果卡片里是"游戏名 + 描述 + 规则列表"，用：
```html
<div class="v3-card">
  <h2 class="v3-card__title">游戏名</h2>
  <p class="v3-card__desc">描述</p>
  <ol class="v3-card__rules">
    <li data-i="01">规则一</li>
    <li data-i="02">规则二</li>
  </ol>
  <div class="v3-card__foot">
    <span></span>
    <span class="v3-card__stamp">CHEERS</span>
  </div>
</div>
```

### Step 7 · 验收
- 切 tab：整体主色（hero 描边、卡片边框、tab bar 指示条、换一张按钮）会跟着换色
- 幼儿园/上高速切换：校车会从左滑到右，高速模式下虚线变红发光
- 底部 tab bar：激活项顶部有发光色带 + 文字发光 + 小圆点呼吸
- "换一张" 按钮：有扫光动画 + 四角 L 形标记

## 需要我进一步帮忙的
如果你切 tab 时主色没跟着变，说明 Step 3 没生效 —— 检查 body 上的 `data-tab` 是不是每次切 tab 都被正确更新。
