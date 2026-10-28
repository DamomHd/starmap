#!/usr/bin/env node
/**
 * Chrome 网上应用店宣传图块生成脚本 (Chrome Web Store Promo Tiles Generator)
 *
 * 规格规范：
 * 1. 小型宣传图块 (Small promo tile):
 *    - 尺寸：440 × 280 px
 *    - 格式：24 位 PNG / JPEG (无 alpha 透明通道)
 * 2. 顶部宣传图块 (Marquee / Large promo tile):
 *    - 尺寸：1400 × 560 px
 *    - 格式：24 位 PNG / JPEG (无 alpha 透明通道)
 *
 * 输出文件：
 * - store-assets/promo-small.png (440x280, 默认英文镜像)
 * - store-assets/promo-marquee.png (1400x560, 默认英文镜像)
 * - store-assets/en/promo-small.png
 * - store-assets/en/promo-marquee.png
 * - store-assets/zh_CN/promo-small.png
 * - store-assets/zh_CN/promo-marquee.png
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const ASSETS_DIR = path.join(ROOT_DIR, 'store-assets')
const EN_DIR = path.join(ASSETS_DIR, 'en')
const ZH_DIR = path.join(ASSETS_DIR, 'zh_CN')
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

fs.mkdirSync(EN_DIR, { recursive: true })
fs.mkdirSync(ZH_DIR, { recursive: true })

// 品牌 SVG 图标 (128x128 矢量)
const STARMAP_ICON_SVG = `
<svg viewBox="0 0 128 128" width="100%" height="100%" style="display:block;">
  <defs>
    <linearGradient id="promo-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e2c4f"/>
      <stop offset="100%" stop-color="#0c1220"/>
    </linearGradient>
    <radialGradient id="promo-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f5c84c" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#f5c84c" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#promo-bg)"/>
  <circle cx="64" cy="60" r="46" fill="url(#promo-glow)"/>
  <polyline points="30,84 52,50 78,68 100,34" fill="none" stroke="#f5c84c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <g>
    <circle cx="52" cy="50" r="9" fill="#f5c84c"/>
    <circle cx="30" cy="84" r="6" fill="#ffffff"/>
    <circle cx="78" cy="68" r="6.5" fill="#ffffff"/>
    <circle cx="100" cy="34" r="5.5" fill="#ffffff"/>
  </g>
  <g fill="#8fa8d4" opacity="0.6">
    <circle cx="88" cy="92" r="2.5"/>
    <circle cx="40" cy="24" r="2"/>
    <circle cx="106" cy="78" r="1.8"/>
    <circle cx="22" cy="52" r="1.8"/>
  </g>
</svg>
`

// ─────────────────────────────────────────────────────────────────────────────
// 1. 小型宣传图块 (440 × 280) HTML 模板
// ─────────────────────────────────────────────────────────────────────────────
function buildSmallPromoHTML(lang = 'en') {
  const isZh = lang === 'zh_CN'

  const subtitle = isZh ? 'GitHub 星标知识地图' : 'Personal GitHub Stars Map'
  const tag1 = isZh ? '✦ 多维聚类' : '✦ Auto-Cluster'
  const tag2 = isZh ? '✦ 私有笔记' : '✦ Private Notes'
  const tag3 = isZh ? '✦ 毫秒检索' : '✦ Deep Search'
  const footerNote = isZh ? '免 Token 开箱即用 · 100% 本地优先' : 'Zero Token Setup · 100% Local-First'

  return `<!doctype html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    body {
      width: 440px;
      height: 280px;
      overflow: hidden;
      background: #080c14;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #ffffff;
      position: relative;
    }

    /* 宇宙深空背景光晕 */
    .bg {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 50% -10%, rgba(37, 99, 235, 0.35) 0%, transparent 60%),
        radial-gradient(circle at 50% 50%, rgba(245, 200, 76, 0.12) 0%, transparent 55%),
        radial-gradient(circle at 90% 90%, rgba(99, 102, 241, 0.18) 0%, transparent 50%),
        #080c14;
      z-index: 1;
    }

    /* 背景星轨微点 */
    .stars-layer {
      position: absolute;
      inset: 0;
      background-image:
        radial-gradient(1.5px 1.5px at 30px 40px, #ffffff 100%, transparent),
        radial-gradient(1px 1px at 110px 180px, #93c5fd 100%, transparent),
        radial-gradient(1.5px 1.5px at 390px 60px, #fde047 100%, transparent),
        radial-gradient(1px 1px at 340px 220px, #ffffff 100%, transparent),
        radial-gradient(1px 1px at 70px 240px, #93c5fd 100%, transparent),
        radial-gradient(1.2px 1.2px at 280px 30px, #ffffff 100%, transparent);
      opacity: 0.6;
      z-index: 2;
    }

    /* 外层容器 */
    .container {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 20px 20px;
      text-align: center;
    }

    /* 品牌图标 */
    .icon-wrapper {
      width: 72px;
      height: 72px;
      border-radius: 18px;
      box-shadow:
        0 12px 28px -4px rgba(245, 200, 76, 0.3),
        0 4px 12px rgba(0, 0, 0, 0.6),
        0 0 0 1px rgba(255, 255, 255, 0.15);
      margin-bottom: 14px;
      overflow: hidden;
      flex-shrink: 0;
    }

    /* 标题与标语 */
    .brand-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.15;
      background: linear-gradient(180deg, #ffffff 30%, #e2e8f0 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-subtitle {
      font-size: 13.5px;
      font-weight: 500;
      color: #94a3b8;
      margin-top: 5px;
      letter-spacing: -0.01em;
    }

    /* 胶囊特性标签 */
    .pills {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 15px;
      flex-wrap: wrap;
    }

    .pill {
      font-size: 11px;
      font-weight: 600;
      color: #e2e8f0;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      padding: 3.5px 10px;
      border-radius: 999px;
      letter-spacing: 0.01em;
      backdrop-filter: blur(8px);
    }
    .pill:first-child {
      background: rgba(245, 200, 76, 0.14);
      border-color: rgba(245, 200, 76, 0.35);
      color: #fde047;
    }

    /* 底部信任标签 */
    .footer-note {
      font-size: 11px;
      color: #64748b;
      margin-top: 14px;
      font-weight: 500;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="stars-layer"></div>
  <div class="container">
    <div class="icon-wrapper">
      ${STARMAP_ICON_SVG}
    </div>
    <div class="brand-title">Starmap</div>
    <div class="brand-subtitle">${subtitle}</div>
    <div class="pills">
      <span class="pill">${tag1}</span>
      <span class="pill">${tag2}</span>
      <span class="pill">${tag3}</span>
    </div>
    <div class="footer-note">${footerNote}</div>
  </div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 顶部宣传图块 (1400 × 560) HTML 模板
// ─────────────────────────────────────────────────────────────────────────────
function buildMarqueePromoHTML(lang = 'en') {
  const isZh = lang === 'zh_CN'

  const eyebrow = isZh
    ? '✦ GitHub 开发者生产力工具 · 100% 本地优先'
    : '✦ GitHub Developer Productivity Tool · 100% Local-First'

  const headline = isZh
    ? `让每一次 Star，<br/><span class="glow-text">都能真正为你所用</span>`
    : `Turn Cluttered Stars into<br/><span class="glow-text">Your Personal Repo Map</span>`

  const desc = isZh
    ? `告别收藏即遗忘。按语言、作者、年份与自定义标签多维聚类，原位嵌入私有笔记，毫秒级模糊检索，一键智能清理失活与归档仓库。`
    : `Never lose a starred repository again. Multi-dimensional clustering, in-place private annotations, instant full-text search, and safe cleanup for inactive repos.`

  const check1 = isZh ? '✓ GitHub 原位无缝注入' : '✓ Native GitHub In-Place Tagging'
  const check2 = isZh ? '✓ 免 Token 开箱即用' : '✓ Zero Token Setup'
  const check3 = isZh ? '✓ 纯本地离线隐私存储' : '✓ 100% Local-First & Private'

  const searchPlaceholder = isZh ? '搜索 348 个星标仓库...' : 'Search 348 starred repos...'
  const repo1Desc = isZh
    ? '美观设计的复制即用组件库。兼具无障碍、高自定义度与开源特性。'
    : 'Beautifully designed components that you can copy and paste into your apps. Accessible. Customizable.'
  const noteContent = isZh
    ? '后台仪表盘 v2 重构核心组件库参考，已选定为主要 UI 规范。'
    : 'Design system primitives for upcoming v2 dashboard redesign.'
  const cleanupBadge = isZh
    ? '🧹 智能清理建议: 发现 3 个已失效/长期未维护仓库'
    : '🧹 Star Cleanup: 3 inactive or archived repos detected'

  return `<!doctype html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    body {
      width: 1400px;
      height: 560px;
      overflow: hidden;
      background: #080c14;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #ffffff;
      position: relative;
    }

    /* 宇宙深空背景光效 */
    .bg {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 20% 40%, rgba(37, 99, 235, 0.22) 0%, transparent 55%),
        radial-gradient(circle at 75% 45%, rgba(245, 200, 76, 0.16) 0%, transparent 50%),
        radial-gradient(circle at 50% 90%, rgba(99, 102, 241, 0.18) 0%, transparent 60%),
        #080c14;
      z-index: 1;
    }

    /* 背景细微网格 & 星点 */
    .grid-layer {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: radial-gradient(circle at 60% 50%, black 40%, transparent 80%);
      -webkit-mask-image: radial-gradient(circle at 60% 50%, black 40%, transparent 80%);
      z-index: 2;
    }

    .stars-layer {
      position: absolute;
      inset: 0;
      background-image:
        radial-gradient(2px 2px at 120px 80px, #ffffff 100%, transparent),
        radial-gradient(1.5px 1.5px at 320px 460px, #93c5fd 100%, transparent),
        radial-gradient(2px 2px at 850px 70px, #fde047 100%, transparent),
        radial-gradient(1.5px 1.5px at 1280px 140px, #ffffff 100%, transparent),
        radial-gradient(1.2px 1.2px at 1150px 490px, #93c5fd 100%, transparent),
        radial-gradient(1.8px 1.8px at 640px 510px, #ffffff 100%, transparent);
      opacity: 0.7;
      z-index: 2;
    }

    /* 左右两栏主容器 */
    .container {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 72px;
      gap: 48px;
    }

    /* ── 左侧内容区 ── */
    .left-hero {
      flex: 1;
      max-width: 650px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .brand-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: rgba(245, 200, 76, 0.12);
      border: 1px solid rgba(245, 200, 76, 0.32);
      border-radius: 999px;
      color: #f5c84c;
      font-size: 12.5px;
      font-weight: 600;
      letter-spacing: 0.02em;
      margin-bottom: 20px;
    }

    .brand-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 14px;
    }
    .brand-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      box-shadow: 0 8px 20px rgba(245, 200, 76, 0.28);
      overflow: hidden;
      flex-shrink: 0;
    }
    .brand-title-text {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
    }

    .main-headline {
      font-size: 44px;
      font-weight: 800;
      line-height: 1.18;
      letter-spacing: -0.03em;
      color: #ffffff;
      margin-bottom: 16px;
    }
    .glow-text {
      background: linear-gradient(135deg, #f5c84c 0%, #ffffff 40%, #93c5fd 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .main-desc {
      font-size: 15.5px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 28px;
      letter-spacing: -0.01em;
    }

    .trust-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .trust-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 6px 14px;
      font-size: 12.5px;
      color: #e2e8f0;
      font-weight: 500;
      backdrop-filter: blur(8px);
    }
    .trust-badge span.check {
      color: #4ade80;
      font-weight: bold;
    }

    /* ── 右侧拟真高精卡片展示区 ── */
    .right-showcase {
      flex-shrink: 0;
      width: 540px;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* 搜索栏卡片 */
    .search-mock-card {
      background: rgba(22, 27, 34, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 12px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(12px);
    }
    .search-left {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #64748b;
      font-size: 13px;
    }
    .search-active-pill {
      background: rgba(245, 200, 76, 0.16);
      border: 1px solid rgba(245, 200, 76, 0.4);
      color: #fde047;
      font-size: 11.5px;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: 999px;
    }

    /* 主仓库展示卡片 (GitHub Primer Dark 质感) */
    .main-repo-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 14px;
      padding: 20px 22px;
      box-shadow:
        0 20px 40px -10px rgba(0, 0, 0, 0.6),
        0 0 35px rgba(59, 130, 246, 0.15);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .repo-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .repo-title {
      font-size: 16.5px;
      font-weight: 600;
      color: #58a6ff;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .star-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: #21262d;
      border: 1px solid #363b42;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #f0f6fc;
    }
    .repo-desc-text {
      font-size: 13px;
      color: #8b949e;
      line-height: 1.45;
    }

    /* Starmap 原位专属注释框 (突出核心卖点) */
    .starmap-anno-box {
      background: rgba(56, 139, 253, 0.08);
      border: 1px solid rgba(56, 139, 253, 0.3);
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 2px;
    }
    .anno-tags-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tag-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(56, 139, 253, 0.18);
      color: #79c0ff;
      border: 1px solid rgba(56, 139, 253, 0.35);
    }
    .tag-badge.fav {
      background: rgba(245, 200, 76, 0.18);
      color: #fde047;
      border-color: rgba(245, 200, 76, 0.4);
    }
    .anno-note-line {
      font-size: 12px;
      color: #c9d1d9;
      line-height: 1.4;
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .note-icon {
      color: #f5c84c;
      flex-shrink: 0;
    }

    .repo-meta-row {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 12px;
      color: #8b949e;
      margin-top: 4px;
    }
    .lang-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 5px;
    }

    /* 浮动清理徽章 (体现清理功能) */
    .cleanup-floating-pill {
      align-self: flex-end;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #18140c;
      border: 1px solid rgba(217, 119, 6, 0.45);
      border-radius: 999px;
      padding: 6px 14px;
      font-size: 11.5px;
      font-weight: 600;
      color: #fcd34d;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
      margin-right: 10px;
    }
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="grid-layer"></div>
  <div class="stars-layer"></div>

  <div class="container">
    <!-- 左侧文案与亮点 -->
    <div class="left-hero">
      <div class="brand-eyebrow">${eyebrow}</div>
      <div class="brand-header">
        <div class="brand-icon">${STARMAP_ICON_SVG}</div>
        <div class="brand-title-text">Starmap</div>
      </div>
      <div class="main-headline">${headline}</div>
      <div class="main-desc">${desc}</div>
      <div class="trust-badges">
        <div class="trust-badge"><span class="check">✓</span> ${check1}</div>
        <div class="trust-badge"><span class="check">✓</span> ${check2}</div>
        <div class="trust-badge"><span class="check">✓</span> ${check3}</div>
      </div>
    </div>

    <!-- 右侧高精产品卡片 -->
    <div class="right-showcase">
      <!-- 搜索卡片 -->
      <div class="search-mock-card">
        <div class="search-left">
          <span>🔍</span>
          <span>${searchPlaceholder}</span>
        </div>
        <div class="search-active-pill">#animation ×</div>
      </div>

      <!-- 核心仓库增强卡片 -->
      <div class="main-repo-card">
        <div class="repo-head">
          <span class="repo-title">
            <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h6.5a.25.25 0 0 1 .25.25v2.5a.25.25 0 0 1-.25.25h-6.5a.25.25 0 0 1-.25-.25Z"/></svg>
            shadcn / ui
          </span>
          <div class="star-btn">★ Starred</div>
        </div>
        <div class="repo-desc-text">${repo1Desc}</div>

        <!-- Starmap 注释 -->
        <div class="starmap-anno-box">
          <div class="anno-tags-row">
            <span class="tag-badge fav">${isZh ? '常用' : 'favorite'}</span>
            <span class="tag-badge">${isZh ? '界面' : 'ui'}</span>
            <span class="tag-badge">tailwind</span>
          </div>
          <div class="anno-note-line">
            <span class="note-icon">✎</span>
            <span>${noteContent}</span>
          </div>
        </div>

        <div class="repo-meta-row">
          <span><span class="lang-dot" style="background:#3178c6"></span>TypeScript</span>
          <span>⭐ 74.2k</span>
          <span>${isZh ? '更新于 2 小时前' : 'Updated 2h ago'}</span>
        </div>
      </div>

      <!-- 智能清理浮动徽章 -->
      <div class="cleanup-floating-pill">
        ${cleanupBadge}
      </div>
    </div>
  </div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// 执行生成
// ─────────────────────────────────────────────────────────────────────────────
function capture(htmlContent, outPath, width, height) {
  const tmpFile = path.join('/tmp', `starmap-promo-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  const tmpUserDataDir = fs.mkdtempSync(path.join('/tmp', 'chrome-promo-ud-'))
  fs.writeFileSync(tmpFile, htmlContent)
  try {
    const cmd = `"${CHROME_PATH}" --headless=new --hide-scrollbars --window-size=${width},${height} --no-first-run --no-default-browser-check --disable-background-networking --user-data-dir="${tmpUserDataDir}" --screenshot="${outPath}" "file://${tmpFile}"`
    execSync(cmd, { stdio: 'pipe', timeout: 20000 })
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
    try { fs.rmSync(tmpUserDataDir, { recursive: true, force: true }) } catch {}
  }
}

console.log('🚀 开始生成 Chrome 网上应用店宣传图块 (Promo Tiles)...\n')

// 1. 小型宣传图块 (440x280)
console.log('📸 [1/2] 生成小型宣传图块 (440 × 280 px)...')
// 英文
process.stdout.write('   → 英文版 (store-assets/en/promo-small.png)... ')
capture(buildSmallPromoHTML('en'), path.join(EN_DIR, 'promo-small.png'), 440, 280)
fs.copyFileSync(path.join(EN_DIR, 'promo-small.png'), path.join(ASSETS_DIR, 'promo-small.png'))
console.log('✓ 完成')

// 中文
process.stdout.write('   → 中文版 (store-assets/zh_CN/promo-small.png)... ')
capture(buildSmallPromoHTML('zh_CN'), path.join(ZH_DIR, 'promo-small.png'), 440, 280)
console.log('✓ 完成')

// 2. 顶部宣传图块 (1400x560)
console.log('\n📸 [2/2] 生成顶部宣传图块 (1400 × 560 px)...')
// 英文
process.stdout.write('   → 英文版 (store-assets/en/promo-marquee.png)... ')
capture(buildMarqueePromoHTML('en'), path.join(EN_DIR, 'promo-marquee.png'), 1400, 560)
fs.copyFileSync(path.join(EN_DIR, 'promo-marquee.png'), path.join(ASSETS_DIR, 'promo-marquee.png'))
console.log('✓ 完成')

// 中文
process.stdout.write('   → 中文版 (store-assets/zh_CN/promo-marquee.png)... ')
capture(buildMarqueePromoHTML('zh_CN'), path.join(ZH_DIR, 'promo-marquee.png'), 1400, 560)
console.log('✓ 完成')

console.log('\n🎉 全部宣传图块生成完毕！')
console.log('   • 小型宣传图块 (440x280)：')
console.log('     - store-assets/promo-small.png')
console.log('     - store-assets/en/promo-small.png')
console.log('     - store-assets/zh_CN/promo-small.png')
console.log('   • 顶部宣传图块 (1400x560)：')
console.log('     - store-assets/promo-marquee.png')
console.log('     - store-assets/en/promo-marquee.png')
console.log('     - store-assets/zh_CN/promo-marquee.png')
