# Chrome 网上应用店宣传截图标准作业程序 (Screenshot SOP)

本 SOP 规范了 Starmap 插件在 Chrome Web Store（以及 Edge Add-ons / Firefox Add-ons）发布所需的宣传截图设计标准、自动化生成管线与维护流程。

---

## 1. 规范标准与核心原则

1. **真实呈现原则 (屏幕截图)**：
   - **禁止** 使用虚假的营销卡片外框、悬浮浮夸大阴影或无关的营销标语。
   - **必须** 100% 基于插件真实产品代码的 DOM 结构与 GitHub Primer Light 主题视觉还原。
2. **尺寸与格式规范**：
   - **屏幕截图 (Screenshots)**：严格固定为 **1280 × 800 px**（Chrome 推荐的标准 16:10 比例，24 位 PNG，无透明通道）。
   - **小型宣传图块 (Small promo tile)**：固定为 **440 × 280 px**（24 位 PNG，无透明通道）。
   - **顶部宣传图块 (Marquee promo tile)**：固定为 **1400 × 560 px**（24 位 PNG，无透明通道）。
3. **双语覆盖**：
   - **英文 (en)**：面向全球默认语言（English - United States）。
   - **中文 (zh_CN)**：面向中文市场独立本地化（中文 (简体)）。

---

## 2. 标准化目录与路径结构

所有宣传物料统一归档在 `store-assets/` 目录下：

```text
store-assets/
├── SCREENSHOT_SOP.md        # [本文件] 截图与宣传图块生成规范 SOP
├── README.md                # 商店素材总览与说明
├── LISTING.md               # 商店文案草稿（标题/简短说明/详细描述，双语对照）
│
├── en/                      # 英文版标准素材
│   ├── screenshot-1.png     # 工作台主视图 (1280x800)
│   ├── screenshot-2.png     # 居中清理面板 (1280x800)
│   ├── screenshot-3.png     # GitHub 原位增强 (1280x800)
│   ├── promo-small.png      # 小型宣传图块 (440x280)
│   └── promo-marquee.png    # 顶部宣传图块 (1400x560)
│
├── zh_CN/                   # 中文版标准素材
│   ├── screenshot-1.png     # 中文版主工作台 (1280x800)
│   ├── screenshot-2.png     # 中文版居中清理弹窗 (1280x800)
│   ├── screenshot-3.png     # 中文版 GitHub 原位增强 (1280x800)
│   ├── promo-small.png      # 中文版小型宣传图块 (440x280)
│   └── promo-marquee.png    # 中文版顶部宣传图块 (1400x560)
│
├── screenshot-1.png         # 根目录镜像（同步自 en/，方便单步拖拽上传默认英文）
├── screenshot-2.png
├── screenshot-3.png
├── promo-small.png          # 根目录镜像（小型宣传图块 440x280）
└── promo-marquee.png        # 根目录镜像（顶部宣传图块 1400x560）
```

---

## 3. 一键生成命令 (自动化脚本)

项目内置自动化脚本，依赖本地无头浏览器（Headless Chrome）精准执行离线渲染与快照。

### 1) 生成屏幕截图 (1280×800)
```bash
pnpm screenshots
# 或 npm run screenshots
```

### 2) 生成宣传图块 (440×280 & 1400×560)
```bash
pnpm promos
# 或 npm run promos
```

项目已内置自动化截图脚本 `scripts/generate-screenshots.mjs`，依赖本地无头浏览器（Headless Chrome）精准执行离线无网络依赖的渲染与快照。

### 执行生成

在项目根目录下运行：

```bash
pnpm screenshots
# 或
npm run screenshots
```

### 执行过程
1. 自动读取模板生成英文版 3 张截图到 `store-assets/en/`。
2. 自动同步一份英文截图至根目录 `store-assets/`（作为默认直接上传物料）。
3. 自动生成中文版 3 张截图到 `store-assets/zh_CN/`。
4. 全过程通常在 5~10 秒内完成，无外部网络依赖，无端口冲突风险。

---

## 4. 截图内容规范与设计要点

| 序号 | 文件名 | 页面功能 | 布局与设计要领 |
|---|---|---|---|
| **01** | `screenshot-1.png` | **主工作台 (Workbench)** | • 呈现左侧导航 + 中间分类标签 + 右侧搜索过滤与仓库卡片<br>• 保持一个筛选条件处于激活高亮状态（如 `#animation` 8 个仓库）<br>• 仓库卡片展示私有笔记（Private Note）与彩色标签（Tag），突出 Starmap 的核心卖点。 |
| **02** | `screenshot-2.png` | **清理功能 (Cleanup Modal)** | • **几何居中**：必须使用插件实际的 `.sync-overlay` 与 `.sync-panel.cleanup-panel` 居中弹窗结构（上下左右完美居中）<br>• 背景工作台保留并呈现轻度蒙层弱化背景<br>• 弹窗内展示失效/归档仓库分组、风险提示标签与底部一键清理操作。 |
| **03** | `screenshot-3.png` | **原位增强 (In-Place Enhancement)** | • 模拟真实的 GitHub Stars 个人主页（Header、Tab 栏、筛选栏）<br>• 在 GitHub 页面内注入 Starmap 专属顶部条（`.bs-banner`，含「✦ 工作台」直达与标签筛选行）<br>• 每个仓库行紧密嵌入 `.bs-anno` 笔记编辑与标签卡片，展示原生沉浸式体验。 |

---

## 5. 如何新增或修改截图

未来若插件新增功能（例如：AI 自动打标、离线导出、多设备 WebDAV 同步）需要新增第 4、5 张截图，请按以下步骤扩展：

### 步骤 1：在 `scripts/generate-screenshots.mjs` 中新增模板函数

```javascript
function buildNewFeatureHTML(lang = 'en') {
  const isZh = lang === 'zh_CN'
  return `<!doctype html>
  <html lang="${isZh ? 'zh-CN' : 'en'}">
  <head>
    <style>
      ${BASE_CSS}
      /* 新功能的真实 DOM 样式 */
    </style>
  </head>
  <body>
    <!-- 100% 真实布局代码 -->
  </body>
  </html>`
}
```

### 步骤 2：在 `enShots` 与 `zhShots` 中追加定义

```javascript
enShots.push({
  name: 'screenshot-4.png',
  html: buildNewFeatureHTML('en'),
  desc: 'WebDAV Sync Settings'
})

zhShots.push({
  name: 'screenshot-4.png',
  html: buildNewFeatureHTML('zh_CN'),
  desc: 'WebDAV 同步设置'
})
```

### 步骤 3：运行命令并校验分辨率

```bash
pnpm screenshots
sips -g pixelWidth -g pixelHeight store-assets/en/*.png store-assets/zh_CN/*.png
```

确认控制台输出所有文件均为 `pixelWidth: 1280` 和 `pixelHeight: 800`。

---

## 6. Chrome Web Store 后台上传指南

1. 打开 [Chrome 开发者信息中心 (Developer Dashboard)](https://chrome.google.com/webstore/devconsole/)。
2. 进入 Starmap 扩展项，点击左侧 **「商品详情 (Store listing)」**：
   - **屏幕截图 (Screenshots - 1280×800)**：
     - 默认英文：上传 `store-assets/screenshot-1..3.png`（或 `store-assets/en/`）。
     - 中文语言：切换至「中文 (简体)」，上传 `store-assets/zh_CN/screenshot-1..3.png`。
   - **宣传图块 (Promotional Tiles)**：
     - **小型宣传图块 (Small promo tile - 440×280)**：上传 `store-assets/promo-small.png`（或 `en/` / `zh_CN/` 对应文件）。
     - **顶部宣传图块 (Marquee promo tile - 1400×560)**：上传 `store-assets/promo-marquee.png`（或 `en/` / `zh_CN/` 对应文件）。
3. 检查预览无误后，点击右上角 **「保存草稿」** 或 **「提交审核」**。
