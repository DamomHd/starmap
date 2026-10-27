# Starmap · 星图

把 GitHub 星标变成一张能记住你为什么 star 的个人仓库地图。

## 解决什么

- **记不清名字** —— 只记得"那个做动画的 JS 库"？五维过滤 + 模糊搜索帮你找回来
- **分类太费劲** —— 不用手动打标签，借 GitHub 自带的 topic/语言/作者/时间自动归类
- **star 成垃圾堆** —— 自动识别已归档、镜像、Fork、长期不更新的仓库，按类别批量清理

## 快速开始

```bash
pnpm install
pnpm build
```

1. 打开 `chrome://extensions`，开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选 `dist/` 目录
3. 点击工具栏的 Starmap 图标，打开工作台
4. 按引导创建一个 GitHub Token 并粘贴（创建链接已预设好权限）

## Token 需要的权限

| 功能 | Classic | Fine-grained |
|------|---------|--------------|
| 读取 star（必需） | `read:user` | Public repositories (read) |
| 取消 star（清理功能） | `public_repo` | Starring (read and write) |
| 跨设备同步（推荐） | `gist` | Gists (read and write) |

登录后扩展会自动探测 Token 实际具备哪些权限，缺什么会明确告诉你。

## 功能

### 工作台（点图标打开）

- **五维主题地图** —— 按主题 / 语言 / 作者 / 年份 / 我的标签切换视角，点簇即过滤
- **交叉过滤** —— 多条件叠加，例如「react」+「动画」只留同时满足的
- **模糊检索** —— 名字、描述、topic，以及**你自己的标签和备注**（权重最高）
- **类型筛选** —— 对齐 GitHub 原生 Type：全部 / 公开 / 私有 / 原创 / Fork / 镜像 / 模板
- **注解层** —— 给每个仓库写备注、打自己的标签
- **多排序** —— 收藏时间（默认）/ Star 数 / 最后更新 / 名称
- **智能清理** —— 见下

### 清理

自动找出可能不再需要的 star，**按原因分组**，每组可独立勾选：

| 分组 | 判定 | 标记 |
|---|---|---|
| 已归档 | 作者明确不再维护 | 较安全 |
| 镜像仓库 | 原仓库已在 GitHub 上，副本冗余 | 较安全 |
| Fork 的仓库 | 通常是当时想改点什么，之后没碰过 | 较安全 |
| 长期不更新 | 两年以上无提交 | 请留意 |
| 从没用过 | 收藏很久但从未标注 | 请留意 |

一个仓库只归入一个组（按确定性最高的原因）。**有备注或标签的仓库绝不会出现在列表里。**
所有取消操作都要手动勾选 + 二次确认，不会自动删除任何东西。

### GitHub 星标页（原位增强）

打开 `github.com/{你}?tab=stars` 会多出：

- **顶部工具条** —— 搜你的备注/标签 + 标签胶囊筛选（默认收起，不占地方）
- **条目内嵌注解** —— 标签和备注直接显示在仓库下方
- **原地编辑** —— 点「✎ 编辑」当场修改，不用跳转
- **悬浮入口** —— 右下角按钮，快速打开工作台

三项都可以在设置里单独关掉。

### 跨设备同步

注解存到你自己的 **Secret Gist**，不经过任何第三方服务器。

- **自动**（默认）：改完 5 秒后自动推送；打开时自动拉取并按修改时间合并
- **手动**：设置里保留 Push/Pull，用于主动覆盖

合并按注解的 `updatedAt` 取新——不会因为换个设备就把你刚写的弄丢。

### 外观

工作台支持跟随系统 / 亮色 / 暗色三档切换。星标页注入的内容跟随 GitHub 自己的主题。

## 设计原则

- **零后端**：所有数据在浏览器本地 + 你自己的 Gist，不经过任何第三方服务器
- **不自动删**：清理只给建议，取消 star 必须你勾选 + 二次确认
- **不覆盖你的修改**：自动同步是合并不是覆盖，本地更新的内容优先保留
- **借现成数据**：分类靠 GitHub 自带的 topic/语言，不自己造分类体系
- **最小权限**：只申请 `storage`，不用 `tabs`（避免"读取浏览历史"的授权提示）
- **融合而非外挂**：注入 UI 全部使用 GitHub 的 Primer 设计 token，明暗主题自动跟随

## 项目结构

```
src/
├── manifest.ts        扩展清单
├── background/        点击图标打开工作台；持有自动同步的定时器
├── app/               整页工作台（Preact）
│   └── components/    RepoCard / SettingsPanel / CleanupPanel / LoginGuide ...
├── content/           星标页注入：工具条 + 条目注解
├── components/        两处共用的 UI（AnnotationEditor）
└── lib/               纯逻辑层（可单测，不依赖 DOM）
    ├── cluster.ts     多维聚类 + 交叉过滤
    ├── search.ts      MiniSearch 索引
    ├── repo-type.ts   仓库类型筛选
    ├── cleanup.ts     清理判定 + 分组
    ├── merge.ts       跨设备合并（时间戳）
    ├── annotations.ts 注解存储（串行队列）
    ├── github.ts      GitHub API + 缓存
    ├── gist.ts        Gist 同步
    ├── permissions.ts Token 能力探测（登录时告诉用户缺什么权限）
    └── settings.ts    用户设置 + 主题应用

skill/                 对话式管理 star，与插件共用同一份 Gist 注解
├── SKILL.md           命令用法 + agent 决策规则
├── scripts/           starmap.py（6 个命令，纯 Python 标准库）
└── references/        数据模型 + 与插件的一致性约束
```

## 开发

```bash
pnpm dev        # HMR 开发
pnpm build      # 产物到 dist/
pnpm typecheck
pnpm test       # 纯逻辑测试，36 个用例，零依赖
```

技术栈：Vite 5 + CRXJS + TypeScript + Preact（工作台 gzip 约 19KB）

## 相关文档

| 文档 | 内容 |
|---|---|
| [PLAN.md](./PLAN.md) | 产品规划、架构决策、踩过的坑 |
| [PRIVACY.md](./PRIVACY.md) | 隐私政策（Markdown 版） |
| [docs/index.html](./docs/index.html) | 隐私政策在线页（GitHub Pages） |
| [store-assets/](./store-assets/) | Chrome 商店截图与上架文案 |
| [skill/SKILL.md](./skill/SKILL.md) | 配套的 Claude Code skill：对话式批量管理 star |

## 反馈与支持

如果你在使用过程中遇到任何问题、Bug，或有新功能建议，欢迎通过以下方式联系开发者：
- **反馈邮箱**：[sneaker@agent.qq.com](mailto:sneaker@agent.qq.com)
- **GitHub Issues**：提交 Issue 讨论与追踪

## 发布

```bash
pnpm build
cd dist && zip -r ../starmap-<version>-chrome.zip . -x "*.DS_Store"
```

隐私政策页通过 GitHub Pages 托管：把仓库推到 GitHub，在 Settings → Pages 里
把 Source 设为「GitHub Actions」，`docs/` 会自动部署。

## 已知限制

- 仅支持 Chrome（Firefox / Edge 未适配）
- 注解不会写进 GitHub —— GitHub 没有给 star 附加元数据的 API，
  星标页的标签/备注是本地数据渲染出来的，GitHub 服务器上并不存在
- 扩展代码可被反编译查看（Chrome 平台特性）。因此设计上不依赖代码保密：
  没有硬编码密钥，数据只存在用户本机
