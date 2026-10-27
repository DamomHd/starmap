/**
 * 星标页原位增强 —— 在 github.com/{user}?tab=stars 注入入口。
 *
 * ⚠️ 设计原则：GitHub 的 DOM 会随改版变化，**绝不能把功能建立在单一选择器上**。
 *
 * 三层降级策略：
 * 1. 顶部横条：找得到可靠锚点就插入（体验最好）
 * 2. 悬浮按钮：找不到锚点就只用这个（几乎不会失败，因为 fixed 定位不依赖页面结构）
 * 3. 都不行：静默退出，用户仍可通过工具栏图标打开工作台
 *
 * 本脚本不读取、不修改任何 GitHub 页面数据，只插入自己的 UI 元素。
 */

import { getSettings, type Settings } from '../lib/settings'
import { t, resolveLocale, setLocale } from '../lib/i18n'

const APP_URL = () => chrome.runtime.getURL('src/app/index.html')

/** 防重复注入（GitHub 是 SPA，路由切换会触发多次） */
const INJECTED_FLAG = 'data-bs-injected'

/**
 * 横条插入位置 —— 实测自真实星标页 DOM（2026-10，用户 DamomHd）：
 *
 *   DIV.Layout
 *   ├── DIV.Layout-sidebar        ← 头像/简介
 *   └── DIV.Layout-main
 *       └── TURBO-FRAME#user-profile-frame
 *           └── DIV
 *               ├── DIV
 *               ├── DIV#profile-lists-container
 *               └── TURBO-FRAME#user-starred-repos   ← 星标列表
 *
 * 最佳位置：紧贴 `#user-starred-repos` 之前 —— 就在星标列表正上方，用户一眼能看到。
 * 兜底：插到 `#profile-lists-container` 之后（列表区顶部）。
 * 再兜底：不插横条，只留悬浮按钮（position:fixed 不依赖 DOM）。
 */
function findBannerSlot(): { parent: Element; before: Element | null } | null {
  const starred = document.querySelector('#user-starred-repos')
  if (starred?.parentElement) {
    return { parent: starred.parentElement, before: starred }
  }

  const lists = document.querySelector('#profile-lists-container')
  if (lists?.parentElement) {
    return { parent: lists.parentElement, before: lists.nextElementSibling }
  }

  return null
}

/** 判断当前是否在星标页 */
function isStarsPage(): boolean {
  return /[?&]tab=stars/.test(location.search)
}


/**
 * 创建检索工具条。
 *
 * 设计意图：**隐形融合 GitHub**——长得像 GitHub 自己的控件，而不是"外挂条"。
 *
 * 关键取舍：不常驻展示搜索框。
 * GitHub 星标页本身有一个大搜索框，我们再摆一个就是两个搜索框上下打架，
 * 是当前界面最大的噪音源。改为：
 * - 平时只显示一个放大镜图标 + 标签行（约 1 行高，几乎隐形）
 * - 点放大镜才展开输入框，失焦/清空后自动收起
 *
 * 视觉全部使用 GitHub 的 Primer token（--fgColor-* / --bgColor-* / --borderColor-*），
 * 明暗主题自动跟随，不用自己维护两套色。
 */
function createBanner(): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'bs-banner'
  bar.innerHTML = `
    <div class="bs-filter-row">
      <button class="bs-search-toggle" type="button" title="${t('content.searchTitle')}" aria-label="${t('content.searchTitle')}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
        </svg>
      </button>
      <input class="bs-search" type="search" placeholder="${t('content.searchPlaceholder')}" hidden />
      <button class="bs-clear" type="button" hidden>${t('content.clear')}</button>
      <span class="bs-filter-count"></span>
      <button class="bs-tags-toggle" type="button" title="${t('content.tagsTitle')}">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Z"/>
        </svg>
        <span>${t('content.tags')}</span>
      </button>
      <button class="bs-open-btn" type="button" title="${t('content.workbenchTitle')}">${t('content.workbench')}</button>
    </div>
    <div class="bs-tag-row" hidden></div>
  `
  bar.querySelector('.bs-open-btn')?.addEventListener('click', openApp)

  const toggle = bar.querySelector('.bs-search-toggle') as HTMLButtonElement
  const search = bar.querySelector('.bs-search') as HTMLInputElement
  const clear = bar.querySelector('.bs-clear') as HTMLButtonElement
  const tagsToggle = bar.querySelector('.bs-tags-toggle') as HTMLButtonElement
  const tagRow = bar.querySelector('.bs-tag-row') as HTMLElement

  // 标签行默认收起，点「标签」展开
  tagsToggle.addEventListener('click', () => {
    const willShow = tagRow.hidden
    tagRow.hidden = !willShow
    tagsToggle.classList.toggle('active', willShow)
  })

  // 搜索 / 清除都转交给注解模块执行过滤（模块间通过自定义事件解耦）
  const emit = (detail: { query?: string; tag?: string | null }) => {
    document.dispatchEvent(new CustomEvent('bs-filter-change', { detail }))
  }

  /** 展开搜索框并聚焦 */
  function openSearch() {
    search.hidden = false
    toggle.classList.add('active')
    requestAnimationFrame(() => search.focus())
  }

  /** 收起搜索框，有内容时保留（不然用户会丢失输入） */
  function closeSearch(force = false) {
    if (!force && search.value.trim()) return
    search.hidden = true
    toggle.classList.remove('active')
    clear.hidden = true
  }

  toggle.addEventListener('click', () => {
    if (search.hidden) openSearch()
    else closeSearch(true)
  })

  search.addEventListener('input', () => {
    clear.hidden = search.value.length === 0
    emit({ query: search.value })
  })

  // 失焦且为空时自动收起，让工具条回到「一行隐形」状态
  search.addEventListener('blur', () => {
    window.setTimeout(() => closeSearch(), 150)
  })

  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch(true)
  })

  clear.addEventListener('click', () => {
    search.value = ''
    clear.hidden = true
    emit({ query: '' })
    search.focus()
  })

  return bar
}

/** 创建悬浮入口（兜底） */
function createFloatingButton(): HTMLElement {
  const btn = document.createElement('button')
  btn.className = 'bs-float'
  btn.type = 'button'
  btn.title = t('content.workbenchTitle')
  btn.innerHTML = '<span class="bs-float-star">★</span>'
  btn.addEventListener('click', openApp)
  return btn
}

/** 打开工作台（复用 background 的逻辑：优先切换到已开的 tab） */
function openApp() {
  chrome.runtime.sendMessage({ type: 'OPEN_APP' }).catch(() => {
    // background 不可用时直接开新 tab 兜底
    window.open(APP_URL(), '_blank')
  })
}

/**
 * 样式注入。
 * 用 <style> 挂到页面而不是走 CSS 文件，避免与 GitHub 的 CSP/样式隔离打架。
 */
function injectStyles() {
  if (document.getElementById('bs-styles')) return
  const style = document.createElement('style')
  style.id = 'bs-styles'
  style.textContent = `
    /*
     * 所有颜色都走 GitHub 的 Primer token —— 不硬编码色值。
     * 这样明暗主题自动跟随，也不会出现「近似的 GitHub 深色」这种仿制品感。
     * 第二参数是兜底值，万一某些页面没定义该 token 也不至于裸奔。
     */
    .bs-banner {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 8px 0 12px;
      padding: 8px 12px;
      /* 用 muted 而不是 default：视觉上退后一层，不跟 GitHub 主内容争 */
      background: var(--bgColor-muted, #f6f8fa);
      border: 1px solid var(--borderColor-muted, #d1d9e0b3);
      border-radius: var(--borderRadius-medium, 6px);
      font-size: 12px;
      color: var(--fgColor-default, #1f2328);
      font-family: var(--fontStack-system);
    }
    .bs-filter-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* 放大镜：平时只有它，点开才出输入框 */
    .bs-search-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--borderRadius-medium, 6px);
      color: var(--fgColor-muted, #59636e);
      cursor: pointer;
      padding: 0;
    }
    .bs-search-toggle:hover {
      background: var(--bgColor-default, #fff);
      border-color: var(--borderColor-default, #d1d9e0);
      color: var(--fgColor-default, #1f2328);
    }
    .bs-search-toggle.active {
      background: var(--bgColor-default, #fff);
      border-color: var(--borderColor-default, #d1d9e0);
      color: var(--fgColor-accent, #0969da);
    }

    .bs-search {
      flex: 1;
      min-width: 0;
      /* 和 GitHub 自己的搜索框同款尺寸感 */
      height: 28px;
      background: var(--bgColor-default, #fff);
      border: 1px solid var(--borderColor-default, #d1d9e0);
      border-radius: var(--borderRadius-medium, 6px);
      padding: 0 8px;
      font-size: 12px;
      color: var(--fgColor-default, #1f2328);
      font-family: var(--fontStack-system);
    }
    .bs-search::placeholder { color: var(--fgColor-muted, #59636e); }
    .bs-search:focus {
      outline: none;
      border-color: var(--fgColor-accent, #0969da);
      box-shadow: 0 0 0 3px var(--fgColor-accent-disabled, #0969da33);
    }

    .bs-filter-count {
      font-size: 11px;
      color: var(--fgColor-muted, #59636e);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .bs-filter-count:empty { display: none; }

    /* 按钮统一口径：次级按钮用 GitHub 的 default Button 样式 */
    .bs-clear,
    .bs-open-btn {
      display: inline-flex;
      align-items: center;
      height: 28px;
      background: var(--bgColor-muted, #f6f8fa);
      border: 1px solid var(--borderColor-default, #d1d9e0);
      border-radius: var(--borderRadius-medium, 6px);
      padding: 0 12px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1;
      cursor: pointer;
      color: var(--fgColor-default, #1f2328);
      font-family: var(--fontStack-system);
      white-space: nowrap;
    }
    .bs-clear:hover,
    .bs-open-btn:hover {
      background: var(--bgColor-emphasis-hover, #eff2f5);
      border-color: var(--borderColor-emphasis, #818b98);
    }
    .bs-open-btn {
      margin-left: auto;
      /* 主操作用 GitHub 的 emphasis 色，但不用绿色 primary（那是「提交」语义） */
      color: var(--fgColor-accent, #0969da);
      background: var(--bgColor-default, #fff);
    }

    /* 标签胶囊行 */
    /* 「标签」开关：和放大镜同款尺寸，选中时高亮 */
    .bs-tags-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 28px;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--borderRadius-medium, 6px);
      color: var(--fgColor-muted, #59636e);
      font-size: 11.5px;
      font-family: var(--fontStack-system);
      padding: 0 8px;
      cursor: pointer;
    }
    .bs-tags-toggle:hover {
      background: var(--bgColor-default, #fff);
      border-color: var(--borderColor-default, #d1d9e0);
      color: var(--fgColor-default, #1f2328);
    }
    .bs-tags-toggle.active {
      background: var(--bgColor-default, #fff);
      border-color: var(--borderColor-default, #d1d9e0);
      color: var(--fgColor-accent, #0969da);
    }

    .bs-tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      padding-top: 2px;
    }
    .bs-tag-row[hidden] { display: none; }
    .bs-tag-row:empty { display: none; }
    .bs-tag-empty {
      font-size: 11px;
      color: var(--fgColor-muted, #59636e);
    }

    /*
     * 标签胶囊用 GitHub 的 Label 组件形态（border + 淡底），
     * 而不是自造的金色胶囊。金色留给"我的标签"这个语义标识，
     * 用在文字前景色而不是整块背景，克制很多。
     */
    .bs-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 22px;
      background: var(--bgColor-default, #fff);
      border: 1px solid var(--borderColor-default, #d1d9e0);
      border-radius: 999px;
      padding: 0 9px;
      font-size: 11px;
      line-height: 1;
      cursor: pointer;
      color: var(--fgColor-default, #1f2328);
      font-family: var(--fontStack-system);
    }
    .bs-chip:hover {
      border-color: var(--borderColor-emphasis, #818b98);
      background: var(--bgColor-muted, #f6f8fa);
    }
    .bs-chip.active {
      background: var(--fgColor-accent, #0969da);
      border-color: var(--fgColor-accent, #0969da);
      color: #fff;
    }
    .bs-chip-count {
      opacity: 0.6;
      font-size: 10px;
      font-variant-numeric: tabular-nums;
    }
    .bs-chip.active .bs-chip-count { opacity: 0.85; }

    /* 被过滤掉的条目 */
    .bs-filtered-out { display: none !important; }

    .bs-float {
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #2f81f7;
      color: #fff;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 14px #0003;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      transition: transform .15s;
    }
    .bs-float:hover { transform: scale(1.08); }
    .bs-float-star { font-size: 20px; }
  `
  document.documentElement.appendChild(style)
}

/**
 * 执行注入。
 *
 * 分两部分独立判断，因为它们的"就绪条件"不同：
 * - 悬浮按钮：挂 body，随时可加
 * - 横条：要等 #user-starred-repos 渲染出来，可能晚于悬浮按钮
 * 所以不能用「已注入过」统一拦截，否则横条永远没机会插。
 */
function inject(settings: Settings) {
  if (!isStarsPage()) return

  setLocale(resolveLocale(settings.language))
  injectStyles()

  // 横条：仅在启用、锚点就绪且尚未插入时注入
  if (settings.showBanner) {
    if (!document.querySelector('.bs-banner')) {
      const slot = findBannerSlot()
      if (slot) {
        const banner = createBanner()
        banner.setAttribute(INJECTED_FLAG, 'banner')
        slot.parent.insertBefore(banner, slot.before)
      }
    }
  } else {
    // 用户关掉了：移除已存在的横条
    document.querySelector('.bs-banner')?.remove()
  }

  // 悬浮按钮：同理
  if (settings.showFloatButton) {
    if (!document.querySelector('.bs-float')) {
      const float = createFloatingButton()
      float.setAttribute(INJECTED_FLAG, 'float')
      document.body.appendChild(float)
    }
  } else {
    document.querySelector('.bs-float')?.remove()
  }
}

/**
 * SPA 路由监听。
 * GitHub 用 Turbo 做局部刷新，不会重新加载 content script，
 * 所以必须监听导航事件，在切到星标页时重新注入。
 */
function watchNavigation() {
  // inject 现在需要 settings 参数，事件监听不能直接引用它
  const reinject = () => void getSettings().then(inject)

  document.addEventListener('turbo:load', reinject)
  document.addEventListener('pjax:end', reinject) // 兼容旧版
  window.addEventListener('popstate', reinject)

  // 兜底：URL 变化检测（Turbo 某些场景不触发事件）
  //
  // ⚠️ 性能注意：GitHub 页面 DOM 变动极频繁（每个下拉、每次异步渲染都触发）。
  // 所以这里**不能**观察整个 documentElement 的子树——那会让回调每秒跑几十次。
  // 改用轮询 URL 的轻量方式：每 500ms 比一次字符串，开销可以忽略。
  let lastUrl = location.href
  window.setInterval(() => {
    if (location.href === lastUrl) return
    lastUrl = location.href
    // 切页时先清理旧 UI，避免残留
    document.querySelectorAll(`[${INJECTED_FLAG}]`).forEach((n) => n.remove())
    // 等新页面内容渲染后再注入
    setTimeout(reinject, 300)
  }, 500)
}

/**
 * 带重试的注入。
 *
 * 为什么需要：星标列表在 <turbo-frame id="user-starred-repos"> 里，是**懒加载**的，
 * document_idle 时可能还没渲染出来。这里轮询等待锚点出现，最多等 8 秒。
 * 找不到就退化成「只有悬浮按钮」，绝不无限等待。
 */
async function injectWithRetry(attempt = 0) {
  const settings = await getSettings()
  inject(settings)

  if (attempt >= 16) return // 16 次 × 500ms = 8 秒，足够
  // 横条没插上（锚点还没出现）、用户也没关闭横条、且仍在星标页 → 继续等
  const done = !settings.showBanner || !!document.querySelector('.bs-banner')
  if (done || !isStarsPage()) return

  setTimeout(() => void injectWithRetry(attempt + 1), 500)
}

void injectWithRetry()

// 工作台里改了开关 → 立即生效，无需刷新页面
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    void getSettings().then(inject)
  }
})

watchNavigation()