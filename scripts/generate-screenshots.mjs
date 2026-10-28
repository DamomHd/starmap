#!/usr/bin/env node
/**
 * 商店宣传截图自动化生成脚本 (Chrome Web Store Screenshots Generator)
 *
 * 规范：
 * - 尺寸：1280 × 800 (标准 Chrome Web Store 比例)
 * - 主题：GitHub Primer Light Theme (纯净亮色，与插件实际运行视觉 100% 一致)
 * - 语言：支持 en (默认) 与 zh_CN (中文简体)
 *
 * 输出路径：
 * - store-assets/en/screenshot-[1|2|3].png
 * - store-assets/zh_CN/screenshot-[1|2|3].png
 * - store-assets/screenshot-[1|2|3].png (软链接/副本，指向默认 en)
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

// 确保目录存在
fs.mkdirSync(EN_DIR, { recursive: true })
fs.mkdirSync(ZH_DIR, { recursive: true })

// 通用 SVG 图标
const TOPIC_ICON = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 1.75A.75.75 0 0 1 .75 1h4.253a.75.75 0 0 1 .53.22l8.75 8.75a1.75 1.75 0 0 1 0 2.475l-2.253 2.253a1.75 1.75 0 0 1-2.475 0l-8.75-8.75a.75.75 0 0 1-.22-.53Zm.75.75v3.72l8.22 8.22c.27.27.71.27.98 0l2.25-2.25a.69.69 0 0 0 0-.98L3.98 3H.75Z"/><path d="M4.5 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>`
const LANG_ICON = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25Z"/></svg>`
const AUTHOR_ICON = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/></svg>`
const YEAR_ICON = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z"/></svg>`
const TAG_ICON = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>`
const GH_LOGO = `<svg height="28" viewBox="0 0 16 16" width="28" fill="currentColor"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path></svg>`

const BASE_CSS = `
  :root {
    --bgColor-default: #ffffff;
    --bgColor-muted: #f6f8fa;
    --bgColor-emphasis-hover: #eff2f5;
    --fgColor-default: #1f2328;
    --fgColor-muted: #59636e;
    --fgColor-accent: #0969da;
    --fgColor-success: #1a7f37;
    --fgColor-attention: #9a6700;
    --fgColor-danger: #d1242f;
    --borderColor-default: #d1d9e0;
    --borderColor-muted: #d1d9e0b3;
    --borderColor-emphasis: #818b98;
    --borderRadius-medium: 6px;
    --borderRadius-large: 12px;
    --fontStack-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
    --surface: #ffffff;
    --surface-2: #f6f8fa;
    --border: #d1d9e0;
    --fg: #1f2328;
    --muted: #59636e;
    --accent: #0969da;
    --tag-bg: #ddf4ff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
  body {
    width: 1280px;
    height: 800px;
    overflow: hidden;
    background: var(--bgColor-default);
    color: var(--fgColor-default);
    font-family: var(--fontStack-system);
    font-size: 14px;
    line-height: 1.5;
  }
`

// ─────────────────────────────────────────────────────────────────────────────
// 页面 1：工作台主视图 (Workbench View)
// ─────────────────────────────────────────────────────────────────────────────
function buildWorkbenchHTML(lang = 'en') {
  const isZh = lang === 'zh_CN'
  return `<!doctype html>
<html lang="${isZh ? 'zh-CN' : 'en'}" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <title>Starmap</title>
  <style>
    ${BASE_CSS}
    .shell { height: 100%; display: flex; flex-direction: column; }
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 20px; height: 48px; border-bottom: 1px solid var(--borderColor-default);
      background: var(--bgColor-default);
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .logo { color: #d4a72c; font-size: 16px; line-height: 1; }
    .brand-name { font-weight: 600; font-size: 14px; letter-spacing: -0.01em; }
    .brand-cn { color: var(--fgColor-muted); font-size: 12px; }
    .user { color: var(--fgColor-muted); font-size: 12px; padding-left: 8px; border-left: 1px solid var(--borderColor-muted); }
    .topbar-actions { display: flex; align-items: center; gap: 10px; }
    .stat { color: var(--muted); font-size: 13px; }
    button.ghost {
      background: var(--bgColor-muted); border: 1px solid var(--borderColor-default);
      color: var(--fgColor-default); border-radius: var(--borderRadius-medium);
      padding: 5px 12px; font-size: 12px; font-weight: 500; cursor: pointer;
    }
    .badge-dot {
      display: inline-block; margin-left: 5px; background: #db6d28; color: #fff;
      font-size: 10px; padding: 0 5px; border-radius: 999px; line-height: 15px;
    }
    .content { flex: 1; display: flex; min-height: 0; }
    .sidebar { width: 240px; border-right: 1px solid var(--border); display: flex; flex-direction: column; }
    .dim-tabs { display: flex; flex-direction: column; gap: 1px; padding: 8px; border-bottom: 1px solid var(--borderColor-default); }
    .tab {
      display: flex; align-items: center; gap: 8px; width: 100%; background: transparent;
      color: var(--fgColor-default); border: none; padding: 6px 10px; font-size: 12px;
      border-radius: var(--borderRadius-medium); text-align: left; cursor: pointer;
    }
    .tab.active { background: var(--bgColor-muted); font-weight: 600; }
    .tab-icon { width: 14px; height: 14px; opacity: 0.65; }
    .tab.active .tab-icon { opacity: 1; color: var(--fgColor-accent); }
    .cluster-list { flex: 1; overflow-y: auto; padding: 4px 8px 12px; }
    .cluster-row {
      width: 100%; display: flex; align-items: center; justify-content: space-between;
      gap: 8px; background: transparent; border: none; color: var(--fgColor-default);
      padding: 5px 10px; border-radius: var(--borderRadius-medium); font-size: 12px;
      cursor: pointer; line-height: 1.5;
    }
    .cluster-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cluster-count { color: var(--muted); font-size: 12px; }
    .main { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
    .search-row { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-bottom: 1px solid var(--borderColor-default); }
    .type-select {
      height: 34px; background: var(--bgColor-muted); border: 1px solid var(--borderColor-default);
      border-radius: var(--borderRadius-medium); color: var(--fgColor-default); padding: 0 8px;
      font-size: 12px; cursor: pointer;
    }
    .search {
      width: 100%; background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px; color: var(--fg); padding: 8px 12px; font-size: 13.5px;
    }
    .filter-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 20px 0; }
    .filter-stat { font-size: 12px; color: var(--muted); margin-right: 4px; }
    .chip {
      background: var(--tag-bg); color: #0969da; padding: 3px 10px; border-radius: 999px;
      font-size: 12px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid #54aeff44;
    }
    .chip-dim { opacity: 0.65; font-size: 11px; }
    .chip-x { opacity: 0.7; }
    .chip.clear { background: transparent; color: var(--muted); border: 1px solid var(--border); cursor: pointer; }
    .result-head {
      padding: 14px 20px 8px; font-size: 13px; font-weight: 600; color: var(--fg);
      display: flex; align-items: center; justify-content: space-between;
    }
    .sort-control { display: flex; align-items: center; gap: 6px; font-weight: 400; font-size: 12px; color: var(--muted); }
    .sort-control select {
      background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
      color: var(--fg); padding: 3px 8px; font-size: 12px; cursor: pointer;
    }
    .grid {
      flex: 1; overflow-y: auto; padding: 0 20px 20px; display: grid;
      grid-template-columns: repeat(2, 1fr); gap: 12px; align-content: start;
    }
    .repo-card {
      background: transparent; border: 1px solid transparent; border-radius: var(--borderRadius-medium);
      padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
      outline: 1px solid var(--borderColor-muted); outline-offset: -1px;
    }
    .repo-card:hover { background: var(--bgColor-muted); outline-color: var(--borderColor-default); }
    .repo-head { display: flex; align-items: center; gap: 8px; }
    .repo-name { color: var(--fgColor-accent); text-decoration: none; font-size: 13.5px; font-weight: 600; }
    .repo-desc { color: var(--fgColor-muted); font-size: 12px; margin: 0; line-height: 1.45; }
    .repo-meta { display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--fgColor-muted); }
    .meta-btn.lang { background: transparent; border: none; font-size: 11px; padding: 0; color: var(--fgColor-muted); }
    .meta-btn.lang::before { content: '●'; margin-right: 4px; color: #3178c6; }
    .stars { color: var(--fgColor-muted); font-size: 11px; }
    .repo-topics { display: flex; flex-wrap: wrap; gap: 4px; }
    .repo-topics .chip { background: var(--bgColor-muted); color: var(--fgColor-muted); border-color: var(--borderColor-default); font-size: 11px; padding: 1px 8px; }
    .my-note {
      color: var(--fgColor-default); border-left: 2px solid #d4a72c;
      font-size: 12px; line-height: 1.45; padding: 1px 0 1px 8px; background: #fffcf0;
    }
    .note-icon { margin-right: 4px; }
    .my-tags { display: flex; flex-wrap: wrap; gap: 5px; }
    .my-tag {
      display: inline-flex; align-items: center; gap: 4px; background: var(--bgColor-default);
      border: 1px solid var(--borderColor-default); color: var(--fgColor-default); font-size: 11px;
      padding: 0 8px; height: 20px; border-radius: 999px; line-height: 1;
    }
    .my-tag::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #d4a72c; }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="logo">★</span>
        <span class="brand-name">Starmap</span>
        ${isZh ? '<span class="brand-cn">星图</span>' : ''}
        <span class="user">@DamomHd</span>
      </div>
      <div class="topbar-actions">
        <span class="stat">${isZh ? '348 个星标' : '348 stars'}</span>
        <button class="ghost">${isZh ? '刷新' : 'Refresh'}</button>
        <button class="ghost">${isZh ? '设置' : 'Settings'}</button>
        <button class="ghost">
          ${isZh ? '清理' : 'Clean up'}
          <span class="badge-dot">3</span>
        </button>
        <button class="ghost">${isZh ? '断开' : 'Disconnect'}</button>
      </div>
    </header>

    <div class="content">
      <aside class="sidebar">
        <div class="dim-tabs">
          <button class="tab active"><span class="tab-icon">${TOPIC_ICON}</span> ${isZh ? '主题' : 'By Topic'}</button>
          <button class="tab"><span class="tab-icon">${LANG_ICON}</span> ${isZh ? '语言' : 'By Language'}</button>
          <button class="tab"><span class="tab-icon">${AUTHOR_ICON}</span> ${isZh ? '作者' : 'By Author'}</button>
          <button class="tab"><span class="tab-icon">${YEAR_ICON}</span> ${isZh ? '年份' : 'By Year'}</button>
          <button class="tab"><span class="tab-icon">${TAG_ICON}</span> ${isZh ? '我的标签' : 'By My Tags'}</button>
        </div>

        <div class="cluster-list">
          <button class="cluster-row"><span class="cluster-label">react</span><span class="cluster-count">28</span></button>
          <button class="cluster-row"><span class="cluster-label">typescript</span><span class="cluster-count">24</span></button>
          <button class="cluster-row" style="background:var(--bgColor-muted); font-weight:600;"><span class="cluster-label">animation</span><span class="cluster-count" style="color:var(--fgColor-accent);">8</span></button>
          <button class="cluster-row"><span class="cluster-label">devtools</span><span class="cluster-count">19</span></button>
          <button class="cluster-row"><span class="cluster-label">tailwind</span><span class="cluster-count">14</span></button>
          <button class="cluster-row"><span class="cluster-label">ai-agent</span><span class="cluster-count">15</span></button>
          <button class="cluster-row"><span class="cluster-label">rust</span><span class="cluster-count">11</span></button>
          <button class="cluster-row"><span class="cluster-label">state-management</span><span class="cluster-count">9</span></button>
          <button class="cluster-row"><span class="cluster-label">cli</span><span class="cluster-count">8</span></button>
          <button class="cluster-row"><span class="cluster-label">ui-components</span><span class="cluster-count">7</span></button>
        </div>
      </aside>

      <main class="main">
        <div class="search-row">
          <input class="search" placeholder="${isZh ? '搜索仓库、主题、备注或 #标签… (按 / 聚焦)' : 'Search repos, topics, notes, or #tags... (Press / to focus)'}" />
          <select class="type-select">
            <option>${isZh ? '全部类型（348）' : 'All Types（348）'}</option>
            <option>${isZh ? '原创（312）' : 'Sources（312）'}</option>
            <option>Fork（24）</option>
            <option>${isZh ? '镜像（8）' : 'Mirrors（8）'}</option>
            <option>${isZh ? '已归档（4）' : 'Archived（4）'}</option>
          </select>
        </div>

        <div class="filter-bar">
          <span class="filter-stat">4 / 348</span>
          <button class="chip">
            <span class="chip-dim">${isZh ? '主题' : 'By Topic'}</span> animation <span class="chip-x">×</span>
          </button>
          <button class="chip clear">${isZh ? '清空筛选' : 'Clear all'}</button>
        </div>

        <div class="result-head">
          <span>${isZh ? '仓库列表' : 'Repositories'} <span style="color:var(--muted); font-weight:400;">(4)</span></span>
          <label class="sort-control">
            ${isZh ? '排序：' : 'Sort by:'}
            <select>
              <option>${isZh ? '按收藏时间倒序' : 'Starred Date (Newest)'}</option>
              <option>${isZh ? '按 Star 数降序' : 'Most Stars'}</option>
              <option>${isZh ? '最后更新时间' : 'Recently Updated'}</option>
            </select>
          </label>
        </div>

        <div class="grid">
          <!-- Card 1 -->
          <div class="repo-card">
            <div class="repo-head"><a class="repo-name" href="#">framer/motion</a></div>
            <p class="repo-desc">${isZh ? '适用于 Web React 的开源生产级动画和手势库。' : 'Open source, production-ready animation and gesture library for React on the web.'}</p>
            <div class="repo-meta">
              <button class="meta-btn lang">TypeScript</button>
              <span class="stars">⭐ 26.5k</span>
              <span style="color:var(--muted);">${isZh ? '收藏于 10 天前' : 'Starred 10 days ago'}</span>
            </div>
            <div class="repo-topics">
              <span class="chip">react</span>
              <span class="chip" style="background:#ddf4ff; color:#0969da; font-weight:600;">animation</span>
              <span class="chip">ui</span>
            </div>
            <div class="my-note"><span class="note-icon">📌</span>${isZh ? '主要动画参考，用于后台弹窗弹跳与页面进出场过渡' : 'Primary animation reference for fluid UI spring gestures & modal exits'}</div>
            <div class="my-tags">
              <span class="my-tag">${isZh ? '常用' : 'favorite'}</span>
              <span class="my-tag">${isZh ? '界面' : 'ui'}</span>
              <span class="my-tag">${isZh ? '动画' : 'animation'}</span>
            </div>
          </div>

          <!-- Card 2 -->
          <div class="repo-card">
            <div class="repo-head"><a class="repo-name" href="#">pmndrs/react-spring</a></div>
            <p class="repo-desc">${isZh ? '基于弹簧物理定律的 React 动画库，驱动大多数现代流畅交互。' : 'A spring-physics first animation library that powers most UI-related animation in React.'}</p>
            <div class="repo-meta">
              <button class="meta-btn lang">TypeScript</button>
              <span class="stars">⭐ 27.1k</span>
              <span style="color:var(--muted);">${isZh ? '收藏于 25 天前' : 'Starred 25 days ago'}</span>
            </div>
            <div class="repo-topics">
              <span class="chip">react</span>
              <span class="chip" style="background:#ddf4ff; color:#0969da; font-weight:600;">animation</span>
              <span class="chip">physics</span>
            </div>
            <div class="my-note"><span class="note-icon">📌</span>${isZh ? '极轻量的弹簧物理曲线，适合拖拽跟手交互' : 'Lightweight physics-based spring curves for drag interactions'}</div>
            <div class="my-tags">
              <span class="my-tag">${isZh ? '动画' : 'animation'}</span>
              <span class="my-tag">${isZh ? '物理' : 'physics'}</span>
            </div>
          </div>

          <!-- Card 3 -->
          <div class="repo-card">
            <div class="repo-head"><a class="repo-name" href="#">remotion-dev/remotion</a></div>
            <p class="repo-desc">${isZh ? '使用 React 和 Web 标准以编程方式制作 MP4 视频与动态图形。' : 'Make programmatic MP4 videos and motion graphics with React and web standards.'}</p>
            <div class="repo-meta">
              <button class="meta-btn lang">TypeScript</button>
              <span class="stars">⭐ 20.8k</span>
              <span style="color:var(--muted);">${isZh ? '收藏于 1 个月前' : 'Starred 1 month ago'}</span>
            </div>
            <div class="repo-topics">
              <span class="chip">react</span>
              <span class="chip">video</span>
              <span class="chip" style="background:#ddf4ff; color:#0969da; font-weight:600;">animation</span>
            </div>
            <div class="my-note"><span class="note-icon">📌</span>${isZh ? '用代码批量渲染视频，计划用于产品发版自动化剪辑' : 'Programmatic motion graphics with React and web canvas'}</div>
            <div class="my-tags">
              <span class="my-tag">${isZh ? '视频' : 'video'}</span>
              <span class="my-tag">${isZh ? '动画' : 'animation'}</span>
            </div>
          </div>

          <!-- Card 4 -->
          <div class="repo-card">
            <div class="repo-head"><a class="repo-name" href="#">atlassian/react-beautiful-dnd</a></div>
            <p class="repo-desc">${isZh ? '美观且具有无障碍支持的 React 列表拖拽库。' : 'Beautiful and accessible drag and drop for lists with React.'}</p>
            <div class="repo-meta">
              <button class="meta-btn lang" style="color:#d4a72c;"><span style="color:#f1e05a">●</span> JavaScript</button>
              <span class="stars">⭐ 32.4k</span>
              <span style="color:var(--muted);">${isZh ? '收藏于 3 个月前' : 'Starred 3 months ago'}</span>
            </div>
            <div class="repo-topics">
              <span class="chip">react</span>
              <span class="chip">dnd</span>
              <span class="chip">accessible</span>
            </div>
            <div class="my-note"><span class="note-icon">📌</span>${isZh ? '支持键盘无障碍操作的看板列拖拽原型参考' : 'Accessible drag and drop for lists and kanban prototypes'}</div>
            <div class="my-tags">
              <span class="my-tag">dnd</span>
              <span class="my-tag">react</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// 页面 2：清理功能居中弹窗 (Centered Cleanup Modal)
// ─────────────────────────────────────────────────────────────────────────────
function buildCleanupHTML(lang = 'en') {
  const isZh = lang === 'zh_CN'
  return `<!doctype html>
<html lang="${isZh ? 'zh-CN' : 'en'}" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <title>Starmap - Clean up</title>
  <style>
    ${BASE_CSS}
    .shell {
      height: 100%; display: flex; flex-direction: column;
      filter: blur(2px) grayscale(20%); opacity: 0.4; pointer-events: none;
    }
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 20px; height: 48px; border-bottom: 1px solid var(--borderColor-default);
      background: var(--bgColor-default);
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .logo { color: #d4a72c; font-size: 16px; }
    .brand-name { font-weight: 600; font-size: 14px; }
    .user { color: var(--fgColor-muted); font-size: 12px; padding-left: 8px; border-left: 1px solid var(--borderColor-muted); }
    button.ghost {
      background: var(--bgColor-muted); border: 1px solid var(--borderColor-default);
      color: var(--fgColor-default); border-radius: var(--borderRadius-medium);
      padding: 5px 12px; font-size: 12px; font-weight: 500;
    }
    .badge-dot {
      display: inline-block; margin-left: 5px; background: #db6d28; color: #fff;
      font-size: 10px; padding: 0 5px; border-radius: 999px; line-height: 15px;
    }

    /* ── DEAD-CENTER POPUP OVERLAY & MODAL ── */
    .sync-overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
      display: flex; align-items: center; justify-content: center;
      z-index: 100; padding: 24px;
    }
    .sync-panel.cleanup-panel {
      width: 100%; max-width: 620px; background: #ffffff;
      border: 1px solid var(--border); border-radius: 12px;
      padding: 20px 24px; display: flex; flex-direction: column; gap: 14px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.16), 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    .sync-head { display: flex; align-items: center; justify-content: space-between; }
    .sync-head h2 { font-size: 17px; font-weight: 600; color: var(--fg); }
    .sync-close {
      background: transparent; border: none; color: var(--muted); font-size: 20px;
      cursor: pointer; line-height: 1; padding: 2px 6px;
    }
    .hint.small { font-size: 12.5px; color: var(--muted); line-height: 1.5; margin-top: -4px; }
    .cleanup-groups { display: flex; flex-direction: column; gap: 12px; max-height: 480px; overflow-y: auto; }
    .cleanup-group { border: 1px solid var(--borderColor-default); border-radius: 8px; overflow: hidden; background: #ffffff; }
    .cleanup-group-head {
      display: flex; align-items: center; gap: 12px; padding: 10px 14px;
      background: var(--bgColor-muted); cursor: pointer; user-select: none;
    }
    .cleanup-group-head input[type='checkbox'] {
      flex-shrink: 0; accent-color: var(--fgColor-danger); cursor: pointer; width: 16px; height: 16px;
    }
    .cleanup-group-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .cleanup-group-name { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--fgColor-default); }
    .cleanup-group-count {
      display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 18px;
      padding: 0 6px; background: #ffffff; border: 1px solid var(--borderColor-default); border-radius: 999px;
      font-size: 11px; font-weight: 600; color: var(--fgColor-muted); font-variant-numeric: tabular-nums;
    }
    .cleanup-group-desc { font-size: 12px; color: var(--fgColor-muted); line-height: 1.4; }
    .cleanup-tone { flex-shrink: 0; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px; border: 1px solid; }
    .cleanup-tone.safe { color: var(--fgColor-success); border-color: currentColor; background: #dafbe140; }
    .cleanup-tone.caution { color: var(--fgColor-attention); border-color: currentColor; background: #fff8c566; }
    .cleanup-group-body > summary {
      padding: 6px 14px; font-size: 11.5px; color: var(--fgColor-accent);
      cursor: pointer; list-style: none; user-select: none; background: #ffffff;
      border-top: 1px solid var(--borderColor-default);
    }
    .cleanup-group-body > summary::-webkit-details-marker { display: none; }
    .cleanup-group-body > summary::before { content: '▾ '; display: inline-block; font-weight: bold; color: var(--fgColor-muted); }
    .cleanup-list { border-top: 1px solid var(--borderColor-muted); background: #ffffff; }
    .cleanup-row {
      display: flex; align-items: center; gap: 12px; padding: 9px 14px;
      border-bottom: 1px solid var(--borderColor-muted); cursor: pointer; background: #ffffff;
    }
    .cleanup-row:last-child { border-bottom: none; }
    .cleanup-row:hover { background: var(--bgColor-muted); }
    .cleanup-row input[type='checkbox'] { accent-color: var(--fgColor-danger); cursor: pointer; width: 15px; height: 15px; }
    .cleanup-info { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; }
    .cleanup-info a { color: var(--fgColor-accent); text-decoration: none; font-size: 13px; font-weight: 600; }
    .cleanup-explain { font-size: 11.5px; color: var(--fgColor-muted); }
    .cleanup-row .stars { color: var(--fgColor-muted); font-size: 11.5px; font-variant-numeric: tabular-nums; flex-shrink: 0; }
    .cleanup-footer {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding-top: 12px; border-top: 1px solid var(--borderColor-default); margin-top: 4px;
    }
    .cleanup-selected { font-size: 13px; color: var(--fgColor-default); font-weight: 500; }
    button.primary.danger {
      background: #cf222e; color: #ffffff; border: 1px solid rgba(31, 35, 40, 0.15);
      border-radius: var(--borderRadius-medium); padding: 7px 18px; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    button.primary.danger:hover { background: #b62324; }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="logo">★</span>
        <span class="brand-name">Starmap</span>
        ${isZh ? '<span class="brand-cn" style="font-size:12px; color:#59636e;">星图</span>' : ''}
        <span class="user">@DamomHd</span>
      </div>
      <div class="topbar-actions">
        <span style="font-size:13px; color:#59636e;">${isZh ? '348 个星标' : '348 stars'}</span>
        <button class="ghost">${isZh ? '刷新' : 'Refresh'}</button>
        <button class="ghost">${isZh ? '设置' : 'Settings'}</button>
        <button class="ghost">${isZh ? '清理' : 'Clean up'} <span class="badge-dot">3</span></button>
        <button class="ghost">${isZh ? '断开' : 'Disconnect'}</button>
      </div>
    </header>
    <div style="flex:1;"></div>
  </div>

  <div class="sync-overlay">
    <div class="sync-panel cleanup-panel">
      <div class="sync-head">
        <h2>${isZh ? '清理建议' : 'Clean up stars'}</h2>
        <button class="sync-close" title="Close">×</button>
      </div>

      <p class="hint small">
        ${isZh ? '帮你找出可能不再需要的 star。已添加过备注或标签的仓库绝不会出现在这里。' : 'Identify repositories you may no longer need. Repositories with personal notes or tags are protected and will never appear here.'}
      </p>

      <div class="cleanup-groups">
        <!-- Group 1: Archived -->
        <section class="cleanup-group">
          <label class="cleanup-group-head">
            <input type="checkbox" checked />
            <div class="cleanup-group-title">
              <span class="cleanup-group-name">
                ${isZh ? '已归档仓库' : 'Archived Repositories'}
                <span class="cleanup-group-count">2</span>
              </span>
              <span class="cleanup-group-desc">${isZh ? '作者已将仓库设为只读/归档，明确不再维护' : 'Officially archived by the repository owner (read-only)'}</span>
            </div>
            <span class="cleanup-tone safe">${isZh ? '安全' : 'Safe'}</span>
          </label>

          <details class="cleanup-group-body" open>
            <summary>${isZh ? '取消全选当前组 (2)' : 'Deselect all (2)'}</summary>
            <div class="cleanup-list">
              <label class="cleanup-row">
                <input type="checkbox" checked />
                <div class="cleanup-info">
                  <a href="#">zeit/hyper</a>
                  <span class="cleanup-explain">${isZh ? '已归档于 2022年11月 · JavaScript' : 'Archived Nov 2022 · JavaScript'}</span>
                </div>
                <span class="stars">★ 41,200</span>
              </label>

              <label class="cleanup-row">
                <input type="checkbox" checked />
                <div class="cleanup-info">
                  <a href="#">atom/atom</a>
                  <span class="cleanup-explain">${isZh ? '已归档于 2022年12月 · C++ / Electron' : 'Archived Dec 2022 · C++ / Electron'}</span>
                </div>
                <span class="stars">★ 59,800</span>
              </label>
            </div>
          </details>
        </section>

        <!-- Group 2: Stale -->
        <section class="cleanup-group">
          <label class="cleanup-group-head">
            <input type="checkbox" checked />
            <div class="cleanup-group-title">
              <span class="cleanup-group-name">
                ${isZh ? '长期不更新' : 'Inactive for >2 Years'}
                <span class="cleanup-group-count">1</span>
              </span>
              <span class="cleanup-group-desc">${isZh ? '两年以上无提交，可能已停止维护' : 'No updates, commits, or releases in years'}</span>
            </div>
            <span class="cleanup-tone caution">${isZh ? '谨慎' : 'Caution'}</span>
          </label>

          <details class="cleanup-group-body" open>
            <summary>${isZh ? '取消全选当前组 (1)' : 'Deselect all (1)'}</summary>
            <div class="cleanup-list">
              <label class="cleanup-row">
                <input type="checkbox" checked />
                <div class="cleanup-info">
                  <a href="#">legacy/webpack-custom-loader-poc</a>
                  <span class="cleanup-explain">${isZh ? '最后提交于 3.5 年前 · JavaScript' : 'Last commit 3.5 years ago · JavaScript'}</span>
                </div>
                <span class="stars">★ 140</span>
              </label>
            </div>
          </details>
        </section>
      </div>

      <div class="cleanup-footer">
        <span class="cleanup-selected">
          ${isZh ? '已勾选 3 个仓库' : 'Selected 3 repos'}
        </span>
        <button class="primary danger">
          ${isZh ? '取消 Star (3)' : 'Clean up (3)'}
        </button>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// 页面 3：GitHub 原位注入实景 (GitHub In-Place Enhancement)
// ─────────────────────────────────────────────────────────────────────────────
function buildGithubStarsHTML(lang = 'en') {
  const isZh = lang === 'zh_CN'
  return `<!doctype html>
<html lang="${isZh ? 'zh-CN' : 'en'}" data-color-mode="light" data-light-theme="light">
<head>
  <meta charset="UTF-8">
  <title>DamomHd / Stars - GitHub</title>
  <style>
    ${BASE_CSS}
    .gh-header {
      height: 52px; background: var(--bgColor-muted); border-bottom: 1px solid var(--borderColor-default);
      display: flex; align-items: center; padding: 0 28px; justify-content: space-between;
    }
    .gh-header-brand { display: flex; align-items: center; gap: 14px; }
    .gh-logo { fill: var(--fgColor-default); display: block; }
    .gh-global-search {
      background: var(--bgColor-default); border: 1px solid var(--borderColor-default);
      border-radius: var(--borderRadius-medium); padding: 5px 12px; font-size: 13px;
      color: var(--fgColor-muted); width: 270px;
    }
    .gh-nav-items { display: flex; align-items: center; gap: 16px; font-size: 13px; color: var(--fgColor-muted); }
    .gh-user-badge {
      width: 28px; height: 28px; border-radius: 50%; background: var(--fgColor-accent);
      color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;
    }
    .gh-subnav {
      background: var(--bgColor-default); border-bottom: 1px solid var(--borderColor-default);
      padding: 0 40px; display: flex; gap: 24px;
    }
    .gh-subnav-item {
      padding: 12px 4px; font-size: 14px; color: var(--fgColor-default); border-bottom: 2px solid transparent;
      display: flex; align-items: center; gap: 6px; cursor: pointer;
    }
    .gh-subnav-item.active { font-weight: 600; border-bottom-color: #fd8c73; }
    .gh-counter { background: #eff1f3; color: var(--fgColor-muted); font-size: 12px; padding: 1px 6px; border-radius: 10px; }
    .gh-container { max-width: 1040px; margin: 0 auto; padding: 18px 20px 0; }
    .gh-native-filter-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .gh-stars-search {
      flex: 1; height: 32px; background: var(--bgColor-default); border: 1px solid var(--borderColor-default);
      border-radius: var(--borderRadius-medium); padding: 0 10px; font-size: 13px; color: var(--fgColor-default);
    }
    .gh-native-select {
      height: 32px; background: var(--bgColor-muted); border: 1px solid var(--borderColor-default);
      border-radius: var(--borderRadius-medium); padding: 0 8px; font-size: 12px; color: var(--fgColor-default);
    }

    /* ── EXACT Starmap Banner (.bs-banner) from inject-stars.ts ── */
    .bs-banner {
      display: flex; flex-direction: column; gap: 6px; margin: 8px 0 12px;
      padding: 8px 12px; background: var(--bgColor-muted); border: 1px solid var(--borderColor-muted);
      border-radius: var(--borderRadius-medium); font-size: 12px; color: var(--fgColor-default);
    }
    .bs-filter-row { display: flex; align-items: center; gap: 6px; }
    .bs-search-toggle {
      display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
      flex-shrink: 0; background: var(--bgColor-default); border: 1px solid var(--borderColor-default);
      border-radius: var(--borderRadius-medium); color: var(--fgColor-accent); cursor: pointer; padding: 0;
    }
    .bs-search {
      height: 28px; background: var(--bgColor-default); border: 1px solid var(--borderColor-default);
      border-radius: var(--borderRadius-medium); padding: 0 8px; font-size: 12px;
      color: var(--fgColor-default); width: 200px; outline: none;
    }
    .bs-filter-count { color: var(--fgColor-muted); font-size: 12px; margin: 0 4px; white-space: nowrap; }
    .bs-tags-toggle {
      display: inline-flex; align-items: center; gap: 4px; height: 28px; flex-shrink: 0;
      background: var(--bgColor-default); border: 1px solid var(--borderColor-default);
      border-radius: var(--borderRadius-medium); color: var(--fgColor-default); font-size: 11.5px;
      padding: 0 8px; cursor: pointer;
    }
    .bs-open-btn {
      margin-left: auto; display: inline-flex; align-items: center; gap: 5px; height: 28px;
      padding: 0 12px; background: var(--bgColor-default); border: 1px solid var(--borderColor-default);
      border-radius: var(--borderRadius-medium); color: var(--fgColor-accent); font-size: 12px;
      font-weight: 500; cursor: pointer; white-space: nowrap;
    }
    .bs-open-btn:hover { background: var(--bgColor-emphasis-hover); border-color: var(--borderColor-emphasis); }
    .bs-tag-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-top: 4px; border-top: 1px dashed var(--borderColor-muted); }
    .bs-chip {
      display: inline-flex; align-items: center; gap: 4px; height: 22px; background: var(--bgColor-default);
      border: 1px solid var(--borderColor-default); border-radius: 999px; padding: 0 9px;
      font-size: 11px; line-height: 1; cursor: pointer; color: var(--fgColor-default);
    }
    .bs-chip.active { background: var(--fgColor-accent); border-color: var(--fgColor-accent); color: #fff; font-weight: 600; }
    .bs-chip-count { opacity: 0.6; font-size: 10px; }
    .bs-chip.active .bs-chip-count { opacity: 0.85; }

    /* ── Native Repo Rows ── */
    .gh-repo-row { border-top: 1px solid var(--borderColor-default); padding: 14px 0 16px; display: flex; flex-direction: column; gap: 4px; }
    .gh-repo-header { display: flex; align-items: flex-start; justify-content: space-between; }
    .gh-repo-title { font-size: 16px; font-weight: 600; color: var(--fgColor-accent); text-decoration: none; }
    .gh-repo-title:hover { text-decoration: underline; }
    .gh-star-btn {
      display: inline-flex; align-items: center; gap: 4px; background: var(--bgColor-muted);
      border: 1px solid var(--borderColor-default); border-radius: var(--borderRadius-medium);
      padding: 3px 10px; font-size: 12px; font-weight: 500; color: var(--fgColor-default); cursor: pointer;
    }
    .gh-repo-desc { font-size: 13px; color: var(--fgColor-muted); line-height: 1.45; margin: 1px 0 2px; }

    /* ── EXACT Injected Annotation (.bs-anno) from inject-annotations.ts ── */
    .bs-anno { margin: 6px 0 2px; font-size: 12px; line-height: 1.5; }
    .bs-anno.is-viewing { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .bs-anno-display { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: 1; min-width: 0; }
    .bs-anno-tag {
      display: inline-flex; align-items: center; gap: 4px; background: var(--bgColor-default);
      border: 1px solid var(--borderColor-default); color: var(--fgColor-default); padding: 0 8px;
      height: 20px; border-radius: 999px; font-size: 11px; line-height: 1;
    }
    .bs-anno-tag::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #d4a72c; flex-shrink: 0; }
    .bs-anno-note {
      color: var(--fgColor-muted); border-left: 2px solid #d4a72c88; padding-left: 8px;
      flex-basis: 100%; white-space: pre-wrap; font-size: 12px; margin-top: 4px;
    }
    .bs-anno-trigger {
      background: transparent; border: 1px solid var(--borderColor-muted); border-radius: var(--borderRadius-medium);
      color: var(--fgColor-accent); font-size: 11px; padding: 2px 8px; cursor: pointer; flex-shrink: 0; opacity: 0.9;
    }
    .gh-repo-meta { display: flex; align-items: center; gap: 16px; font-size: 12px; color: var(--fgColor-muted); margin-top: 4px; }
    .gh-lang-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: 4px; }
  </style>
</head>
<body>
  <div class="gh-header">
    <div class="gh-header-brand">
      <span class="gh-logo">${GH_LOGO}</span>
      <input class="gh-global-search" value="" placeholder="Type / to search" readonly />
    </div>
    <div class="gh-nav-items">
      <span>Pull requests</span>
      <span>Issues</span>
      <span>Explore</span>
      <div class="gh-user-badge">D</div>
    </div>
  </div>

  <div class="gh-subnav">
    <div class="gh-subnav-item">Overview</div>
    <div class="gh-subnav-item">Repositories <span class="gh-counter">48</span></div>
    <div class="gh-subnav-item">Projects</div>
    <div class="gh-subnav-item">Packages</div>
    <div class="gh-subnav-item active">Stars <span class="gh-counter">348</span></div>
  </div>

  <div class="gh-container">
    <div class="gh-native-filter-bar">
      <input class="gh-stars-search" placeholder="${isZh ? '搜索全部星标' : 'Search stars'}" value="" readonly />
      <select class="gh-native-select"><option>${isZh ? '类型：全部' : 'Type: All'}</option></select>
      <select class="gh-native-select"><option>${isZh ? '语言：不限' : 'Language: Any'}</option></select>
      <select class="gh-native-select"><option>${isZh ? '排序：最近收藏' : 'Sort: Recently starred'}</option></select>
    </div>

    <!-- ── REAL INJECTED STARMAP TOOLBAR (.bs-banner) ── -->
    <div class="bs-banner">
      <div class="bs-filter-row">
        <button class="bs-search-toggle" type="button" title="${isZh ? '搜索我的备注和标签' : 'Search personal annotations'}">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>
        </button>
        <input class="bs-search" type="search" placeholder="${isZh ? '搜我的备注 / 标签…' : 'Search personal annotations...'}" value="${isZh ? '#常用' : '#favorite'}" />
        <span class="bs-filter-count">${isZh ? '匹配 18 / 348 条' : '18 of 348 matches'}</span>
        <button class="bs-tags-toggle" type="button">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Z"/></svg>
          <span>${isZh ? '标签' : 'Tags'}</span>
        </button>
        <button class="bs-open-btn" type="button" title="${isZh ? '打开 Starmap 工作台' : 'Open Starmap Workbench'}">
          <span>✦</span> ${isZh ? '工作台' : 'Workbench'}
        </button>
      </div>
      <div class="bs-tag-row">
        <span class="bs-chip active">${isZh ? '#常用' : '#favorite'} <span class="bs-chip-count">18</span></span>
        <span class="bs-chip">${isZh ? '#界面' : '#ui'} <span class="bs-chip-count">24</span></span>
        <span class="bs-chip">${isZh ? '#开发工具' : '#devtools'} <span class="bs-chip-count">35</span></span>
        <span class="bs-chip">${isZh ? '#动画' : '#animation'} <span class="bs-chip-count">8</span></span>
        <span class="bs-chip">#rust <span class="bs-chip-count">11</span></span>
      </div>
    </div>

    <!-- Repo 1: shadcn/ui -->
    <div class="gh-repo-row">
      <div class="gh-repo-header">
        <a class="gh-repo-title" href="#">shadcn / ui</a>
        <button class="gh-star-btn">★ Starred</button>
      </div>
      <p class="gh-repo-desc">${isZh ? '美观设计的复制即用组件库。兼具无障碍、高自定义度与开源特性。' : 'Beautifully designed components that you can copy and paste into your apps. Accessible. Customizable. Open Source.'}</p>
      <div class="bs-anno is-viewing">
        <div class="bs-anno-display">
          <span class="bs-anno-tag">${isZh ? '常用' : 'favorite'}</span>
          <span class="bs-anno-tag">${isZh ? '界面' : 'ui'}</span>
          <span class="bs-anno-tag">tailwind</span>
          <span class="bs-anno-note">${isZh ? '后台仪表盘 v2 重构的核心组件设计系统参考。' : 'Design system primitives for upcoming dashboard redesign.'}</span>
        </div>
        <button class="bs-anno-trigger" type="button">${isZh ? '✎ 编辑' : '✎ Edit'}</button>
      </div>
      <div class="gh-repo-meta">
        <span><span class="gh-lang-dot" style="background:#3178c6"></span>TypeScript</span>
        <span>⭐ 74.2k</span>
        <span>${isZh ? '更新于 2 小时前' : 'Updated 2 hours ago'}</span>
      </div>
    </div>

    <!-- Repo 2: astral-sh/uv -->
    <div class="gh-repo-row">
      <div class="gh-repo-header">
        <a class="gh-repo-title" href="#">astral-sh / uv</a>
        <button class="gh-star-btn">★ Starred</button>
      </div>
      <p class="gh-repo-desc">${isZh ? '用 Rust 编写的极速 Python 包和项目管理器。' : 'An extremely fast Python package and project manager, written in Rust.'}</p>
      <div class="bs-anno is-viewing">
        <div class="bs-anno-display">
          <span class="bs-anno-tag">${isZh ? '常用' : 'favorite'}</span>
          <span class="bs-anno-tag">${isZh ? '开发工具' : 'devtools'}</span>
          <span class="bs-anno-tag">python</span>
          <span class="bs-anno-tag">rust</span>
          <span class="bs-anno-note">${isZh ? '已在全部 CI/CD 流水线中替代 pip，安装速度提升 10-100 倍。' : 'Adopted across all CI/CD pipelines with 10x-100x speedup over pip.'}</span>
        </div>
        <button class="bs-anno-trigger" type="button">${isZh ? '✎ 编辑' : '✎ Edit'}</button>
      </div>
      <div class="gh-repo-meta">
        <span><span class="gh-lang-dot" style="background:#dea584"></span>Rust</span>
        <span>⭐ 42.1k</span>
        <span>${isZh ? '更新于 4 小时前' : 'Updated 4 hours ago'}</span>
      </div>
    </div>

    <!-- Repo 3: framer/motion -->
    <div class="gh-repo-row">
      <div class="gh-repo-header">
        <a class="gh-repo-title" href="#">framer / motion</a>
        <button class="gh-star-btn">★ Starred</button>
      </div>
      <p class="gh-repo-desc">${isZh ? '适用于 Web React 的开源生产级动画和手势库。' : 'Open source, production-ready animation and gesture library for React on the web.'}</p>
      <div class="bs-anno is-viewing">
        <div class="bs-anno-display">
          <span class="bs-anno-tag">${isZh ? '常用' : 'favorite'}</span>
          <span class="bs-anno-tag">${isZh ? '界面' : 'ui'}</span>
          <span class="bs-anno-tag">${isZh ? '动画' : 'animation'}</span>
          <span class="bs-anno-note">${isZh ? '主要动画参考，用于流畅的 UI 弹簧手势与弹窗退出效果。' : 'Primary animation reference for fluid UI spring gestures & modal exits.'}</span>
        </div>
        <button class="bs-anno-trigger" type="button">${isZh ? '✎ 编辑' : '✎ Edit'}</button>
      </div>
      <div class="gh-repo-meta">
        <span><span class="gh-lang-dot" style="background:#3178c6"></span>TypeScript</span>
        <span>⭐ 26.5k</span>
        <span>${isZh ? '更新于 3 天前' : 'Updated 3 days ago'}</span>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// 截图生成主流程
// ─────────────────────────────────────────────────────────────────────────────
function capture(htmlContent, outPath) {
  const tmpFile = path.join('/tmp', `starmap-shot-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  const tmpUserDataDir = fs.mkdtempSync(path.join('/tmp', 'chrome-shot-ud-'))
  fs.writeFileSync(tmpFile, htmlContent)
  try {
    const cmd = `"${CHROME_PATH}" --headless=new --hide-scrollbars --window-size=1280,800 --no-first-run --no-default-browser-check --disable-background-networking --user-data-dir="${tmpUserDataDir}" --screenshot="${outPath}" "file://${tmpFile}"`
    execSync(cmd, { stdio: 'pipe', timeout: 20000 })
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
    try { fs.rmSync(tmpUserDataDir, { recursive: true, force: true }) } catch {}
  }
}

console.log('🚀 开始生成 Chrome 网上应用店标准截图 (1280x800, Light Theme)...\n')

// 1. 生成英文截图 (en)
console.log('📸 [1/2] 正在生成英文版截图 (store-assets/en/)...')
const enShots = [
  { name: 'screenshot-1.png', html: buildWorkbenchHTML('en'), desc: '主工作台 (Workbench)' },
  { name: 'screenshot-2.png', html: buildCleanupHTML('en'), desc: '居中清理弹窗 (Centered Cleanup Modal)' },
  { name: 'screenshot-3.png', html: buildGithubStarsHTML('en'), desc: 'GitHub 原位增强 (In-Place Enhancement)' }
]

for (const { name, html, desc } of enShots) {
  const enPath = path.join(EN_DIR, name)
  const rootPath = path.join(ASSETS_DIR, name)
  process.stdout.write(`   → 生成 ${name} (${desc})... `)
  capture(html, enPath)
  // 同时同步一份到根目录 store-assets/，方便默认直接上传
  fs.copyFileSync(enPath, rootPath)
  console.log('✓ 完成')
}

// 2. 生成中文截图 (zh_CN)
console.log('\n📸 [2/2] 正在生成中文版截图 (store-assets/zh_CN/)...')
const zhShots = [
  { name: 'screenshot-1.png', html: buildWorkbenchHTML('zh_CN'), desc: '主工作台中文版' },
  { name: 'screenshot-2.png', html: buildCleanupHTML('zh_CN'), desc: '居中清理弹窗中文版' },
  { name: 'screenshot-3.png', html: buildGithubStarsHTML('zh_CN'), desc: 'GitHub 原位增强中文版' }
]

for (const { name, html, desc } of zhShots) {
  const zhPath = path.join(ZH_DIR, name)
  process.stdout.write(`   → 生成 ${name} (${desc})... `)
  capture(html, zhPath)
  console.log('✓ 完成')
}

console.log('\n🎉 全部 6 张高精度 1280x800 亮色截图生成完毕！')
console.log('   • 英文版目录：store-assets/en/ (并已同步至 store-assets/)')
console.log('   • 中文版目录：store-assets/zh_CN/')
