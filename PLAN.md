# Starmap · 星图 — 产品规划与现状

> 把 GitHub 星标从一堆收藏链接，变成一张**能记住你为什么 star、并能按你的记忆方式找回来**的个人仓库地图。

**状态**：MVP 已完成并跑通，可直接 Load Unpacked 使用。三大痛点全部覆盖。

---

## 1. 产品定位

### 要解决的问题（按用户原话）

1. **记不清名字想不起** —— 只记得"一个做动画的 JS 库"，忘了仓库名
2. **star 太多成垃圾堆** —— 几千个 star，不知道哪些还有用
3. **分类找起来太费劲** —— 靠 GitHub 原生 topic 和语言根本分不清

### 核心思路

**不自己造分类、不搬全量数据、不写后端**，而是拿 GitHub 已有的东西做智能层：

- 借 GitHub 自带的 `topics` / `language` / `starred_at` / `pushed_at` 做自动聚类
- 借用户的 secret Gist 做跨设备存储
- 本地只存「注解层」（标签/备注/收藏），repo 元数据走缓存

### 与竞品的差异

竞品：[`izumi0uu/better-github-stars-manager`](https://github.com/izumi0uu/better-github-stars-manager)

| 维度 | 竞品 | 我们 |
|------|------|------|
| 归类 | 手动打 tag | **零手工**：借 topic/语言/作者/时间自动聚类 |
| 数据 | 全量搬进 IndexedDB | 本地只存注解层，元数据走 TTL 缓存 |
| 清理 | 手动 rescan | **自动识别死仓库/从没用过的 star** |
| 登录 | PAT | PAT（同样的坑，见 §5） |
| UI | React + Radix + Tailwind 全家桶 | Preact，产物 19KB |

---

## 2. 已实现功能

### 2.1 五维主题地图

`src/lib/cluster.ts`

一键切换视角，不再是一大坨平铺列表：

| 维度 | 数据来源 | 用途 |
|------|---------|------|
| 主题 | GitHub `topics` | "那个动画库" |
| 语言 | `language` | "那个 Rust 的" |
| 作者 | `full_name` 的 owner 段 | "那个作者的作品集" |
| 年份 | `starred_at` | "去年收藏的" |
| 我的标签 | 用户自己打的标签 + `★ 收藏` 伪标签 | "我归类过的" |

点任意簇 = 加入过滤条件，可叠加多个维度交叉过滤。

### 2.2 检索

`src/lib/search.ts`（MiniSearch）

- 字段权重：`full_name`(3) > `topics`(2) > `description`(1)
- 支持前缀 + 模糊（typo 容错）
- 在**交叉过滤后的集合**里搜，保证结果一致

### 2.3 注解层

`src/lib/annotations.ts` + `src/app/components/RepoCard.tsx`

- 一句话备注（"当初为什么 star"）
- 自定义标签（金色胶囊，与 GitHub 蓝色 topic 区分）
- 收藏（★）
- 按 `repo.id` 存储（repo 改名不丢）

**并发安全**：存储层用 promise 串行队列 + 字段级增量更新（`patchAnnotation`）。
为什么需要：`saveAnnotation` 是「读全量→改一条→写全量」，两个操作并发会互相覆盖。

### 2.4 Gist 跨设备同步（自动 + 手动）

`src/lib/gist.ts` + `src/lib/auto-sync.ts` + `src/lib/merge.ts` + `src/app/components/SettingsPanel.tsx`

**自动同步**（默认开启）：
- 改完注解 → 防抖 5 秒后推送到 Gist（由 **background** 持有定时器，页面关闭不丢）
- 打开工作台 → 从 Gist 拉取并按时间戳合并（60 秒节流）
- **注解级 updatedAt 合并**：两边都有时取更新的那条；时间戳相同或缺失则保留本地
- 同步状态可见：设置面板显示「上次同步 3 分钟前」或失败原因

**手动同步**（保留）：
- Push = 本地覆盖远端；Pull = 远端覆盖本地
- 双端二次确认，用于用户主动控制

**为什么以整条注解为单位而非字段级**：用户改标签和改备注通常一起发生，
字段级合并会产生「标签来自 A 设备、备注来自 B 设备」的四不像。

**已知代价**：A 设备只改备注、B 设备只改标签时，后改的会覆盖另一条。手动同步作为兜底。

### 2.5 星标页原位增强

`src/content/inject-stars.ts` + `src/content/inject-annotations.ts`

| 功能 | 说明 | 可关闭 |
|---|---|---|
| 顶部工具条 | 搜备注/标签 + 标签胶囊筛选 + 工作台入口 | ✅ |
| 悬浮按钮 | 右下角圆形入口 | ✅ |
| 条目内嵌标签/备注 | 显示 + **原地编辑**（与工作台共用 `AnnotationEditor`） | ✅ |

三个开关在设置面板，改动通过 `storage.onChanged` 立即生效。

**不劫持 GitHub 原生搜索框**：那是它的组件，改了会和它的过滤打架。
我们加独立输入框，靠 CSS 隐藏不匹配条目（不删 DOM，避免影响 GitHub 的分页逻辑）。

**repoId 从哪来**：DOM 里只有 full_name。优先用 star-cache；缺失时按需拉取
`GET /repos/{owner}/{repo}`（只拉当前页出现的，结果存独立的 `star-id-map`），
不污染全量缓存。

### 2.5 清理

`src/lib/cleanup.ts` + `src/app/components/CleanupPanel.tsx`

三个信号，纯本地计算：

| 信号 | 判定 |
|------|------|
| `archived` | 仓库已归档 |
| `stale` | ≥ 2 年无 push |
| `untouched` | star 满 1 年且**零注解** |

安全设计：
- **有注解的 repo 一律不进列表**（标注过就是在意）
- 默认不勾选、二次确认、逐条执行、单独捕获失败
- 成功后同步移除内存列表 + 更新缓存

---

## 3. 技术架构

```
MV3 Chrome Extension
├── background/service-worker  点击图标 → 打开整页工作台（复用已开 tab）
├── app/  整页工作台（Preact + Vite + CRXJS）
│   ├── components/ RepoCard / SyncPanel / CleanupPanel
│   └── main.tsx  状态编排
├── lib/  纯逻辑层（不依赖 DOM，可单测）
│   ├── cluster.ts      多维聚类 + 交叉过滤
│   ├── search.ts       MiniSearch 索引
│   ├── cleanup.ts      清理判定
│   ├── annotations.ts  注解存储（串行队列）
│   ├── github.ts       API + 缓存 + unstar
│   └── gist.ts         Gist 同步
└── 存储
    ├── chrome.storage.local  token / 注解 / star 缓存(30min TTL) / gist id
    └── chrome.storage.session 记住工作台 tab id
```

### 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 入口形态 | 整页（非 popup、非星标页劫持） | popup 太窄撑不下大库；不依赖 GitHub DOM |
| UI 框架 | Preact | 组件化又不重，产物 gzip 19KB |
| 检索库 | MiniSearch | 零依赖、支持前缀+模糊 |
| 存储 | chrome.storage | 注解层字段少，不需要 Dexie |
| 权限 | 仅 `storage` | 不用 `tabs`（避免"读取浏览历史"的吓人提示） |

---

## 4. 权限与配置

### manifest 权限

```json
permissions: ["storage"]
host_permissions: ["https://api.github.com/*", "https://github.com/*"]
```

### `key` 字段

`src/manifest.ts` 里写死了一个 RSA public key，用于**固定本地开发时的扩展 id**（`kjidnenhbcdgphlegalhpgfpbeiknaff`）。
目的是早期 OAuth 调试时回调地址稳定。现在用 PAT 了，这个 key 留着无害，可以保留。

### PAT 需要的权限

| 用途 | Classic | Fine-grained |
|------|---------|--------------|
| 读 star + 用户信息 | `read:user` | Public repositories (read) |
| 取消 star | `public_repo` | Starring (read and write) |
| Gist 同步 | `gist` | Gists (read and write) |

---

## 5. 关键技术结论（踩过的坑）

### 5.1 零后端 OAuth 走不通 ← 重要

**实测结论**：GitHub OAuth App 在「授权码换 token」时**强制要求 `client_secret`**。

- PKCE（`code_challenge` / `code_verifier`）在 GitHub 是**额外防护**，不能替代 secret
- GitHub 官方明确"不区分 public client 和 confidential client"
- 纯前端持有 secret = 反编译即泄漏

实测报错：`{"error":"incorrect_client_credentials"}`

**因此**：退回 PAT 方案。若未来想甩掉 PAT 的体验短板，最小代价是加一个 Cloudflare Worker 做换 token 代理（~20 行，免费额度够）。

### 5.2 chrome.tabs 权限

`tabs.query({url})` 需要 `tabs` 权限（触发"读取浏览历史"提示）；
但 `tabs.get(id)` / `tabs.update(id)` **不需要**。
所以用 `chrome.storage.session` 记住 tab id，避免申请重权限。

### 5.3 GitHub App 与 OAuth App 的 Client ID 前缀

- `Iv23li...` = **GitHub App**（鉴权模型不同，不能用）
- `Ov23li...` = **OAuth App** ✓

### 5.4 注解写入并发

`saveAnnotation` 的「读-改-写」模式在并发下会丢字段（点收藏后立刻加标签 → 收藏被覆盖）。
解法：promise 串行队列 + `patchAnnotation` 字段级增量更新。

### 5.5 rate limit

认证后 30 次/分钟。5000 条 star 全量拉取需 50 次请求，所以有 30 分钟 TTL 缓存。

---

## 6. 待办

### 近期
- [ ] 平台覆盖（Firefox / Edge）
- [ ] 清理规则可配置（当前 stale=2年 / untouched=1年 写死）

### 中期
- [ ] 真向量语义搜索（本地 transformers.js embedding，需先验证大库性能）
- [ ] 扩展测试覆盖（目前只测纯函数：merge / cluster / sort / cleanup）

### 商业化（远期）
- [ ] 收藏夹共享 / 团队 star 库
- [ ] 高级功能订阅

---

## 6.5 安全承诺（对用户的明文保证）

登录引导和设置面板里向用户承诺了四条，**这些是产品契约，不是营销话术**：

1. 没有自建服务 —— 所有请求直接发往 `api.github.com`
2. Token 只存在本机 `chrome.storage.local`，不上传
3. 标签/备注只存在本地 + 用户自己的 Secret Gist
4. 无统计、无追踪、无第三方 SDK

> ⚠️ **改动约束**：任何新增后端（哪怕只是一个换 token 的 Cloudflare Worker）
> 都会让第 1 条变成假话，**必须同步修改文案**，不能留着骗用户。

## 7. 开发

```bash
pnpm install
pnpm dev      # Vite 开发（HMR）
pnpm build    # 产物在 dist/，chrome://extensions 加载已解压
pnpm typecheck
pnpm test     # 纯逻辑测试（Node 内置 test runner，零依赖）
```

测试只覆盖纯函数（`merge` / `cluster` / `sort` / `cleanup`）——
这些最容易被"改了 A 影响 B"的回归击中，且不依赖 DOM 和 chrome API。
测试文件里是实现的复刻版本，改源码时记得同步。

技术栈：Vite 5 + CRXJS 2 + TypeScript 5 + Preact 10

---

*最后更新：2026-10-23，对应 MVP 完成状态。*