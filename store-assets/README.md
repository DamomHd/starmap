# 商店素材 (Chrome Web Store Assets)

Chrome Web Store 上架所需的多语言商店素材（屏幕截图 + 宣传图块）。

> 📖 **操作标准与脚本维护**：请参考完整 SOP 文档 [SCREENSHOT_SOP.md](./SCREENSHOT_SOP.md)。  
> ⚡ **一键生成截图**：`pnpm screenshots`  
> ⚡ **一键生成宣传图块**：`pnpm promos`

---

## 宣传图块清单 (Promotional Tiles)

根据 Chrome Web Store 要求，宣传图块用于在应用店首页、分类列表、搜索推荐以及轮播展板中展示。

| 文件 | 尺寸 | 格式 | 位置与说明 |
|---|---|---|---|
| [`promo-small.png`](./promo-small.png) | 440×280 | 24位 PNG (无透明) | **小型宣传图块**（默认英文版，展示于分类与推荐位） |
| [`promo-marquee.png`](./promo-marquee.png) | 1400×560 | 24位 PNG (无透明) | **顶部宣传图块**（默认英文版，展示于商店首页巨型横幅） |
| [`en/promo-small.png`](./en/promo-small.png) | 440×280 | 24位 PNG (无透明) | 英文版小型宣传图块 |
| [`en/promo-marquee.png`](./en/promo-marquee.png) | 1400×560 | 24位 PNG (无透明) | 英文版顶部宣传图块 |
| [`zh_CN/promo-small.png`](./zh_CN/promo-small.png) | 440×280 | 24位 PNG (无透明) | 中文版小型宣传图块 |
| [`zh_CN/promo-marquee.png`](./zh_CN/promo-marquee.png) | 1400×560 | 24位 PNG (无透明) | 中文版顶部宣传图块 |

---

## 屏幕截图清单 (Screenshots)

### 1. 英文默认截图 (Default Language: English)
用于默认语言（English - United States），面向全球用户：

| 文件 | 尺寸 | 说明 |
|---|---|---|
| [`screenshot-1.png`](./screenshot-1.png) | 1280×800 | **主截图**：工作台视图（Auto-Categorization & Deep Search + 维度分类 + 模糊检索 + 笔记卡片） |
| [`screenshot-2.png`](./screenshot-2.png) | 1280×800 | **清理功能**：安全清理面板（Safe Star Cleanup + 分类识别 + 保护笔记） |
| [`screenshot-3.png`](./screenshot-3.png) | 1280×800 | **GitHub 原位增强**：GitHub 星标页注入（In-Place Enhancement + 工具条 + 边看边记） |

### 2. 中文本地化截图 (Additional Language: 中文 (简体))
在商店后台点击「Add language -> 中文 (简体)」时上传：

| 文件 | 尺寸 | 说明 |
|---|---|---|
| [`zh_CN/screenshot-1.png`](./zh_CN/screenshot-1.png) | 1280×800 | 中文版工作台三栏视图 |
| [`zh_CN/screenshot-2.png`](./zh_CN/screenshot-2.png) | 1280×800 | 中文版清理功能弹窗 |
| [`zh_CN/screenshot-3.png`](./zh_CN/screenshot-3.png) | 1280×800 | 中文版 GitHub 星标页注入效果 |

---

## 规格要求

- **格式**：PNG 或 JPEG（推荐 24 位 PNG，无透明度通道）
- **尺寸**：1280×800 或 640×400
- **数量**：每个语言至少 1 张，最多 5 张
- **顺序**：第 1 张为封面主图，建议按 1 -> 2 -> 3 依次上传
