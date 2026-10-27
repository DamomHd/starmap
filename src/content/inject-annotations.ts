/**
 * 星标页注解注入 —— 把用户自己的标签/备注渲染到 GitHub 原生星标列表的每个条目里。
 *
 * ⚠️ 重要边界：GitHub 没有「给 star 附加元数据」的 API，
 * 所以这是**纯视觉注入**：数据始终存在本地（+Gist），只是渲染到页面上。
 * GitHub 本身看不到这些数据，换浏览器/清缓存就没了（除非同步过）。
 *
 * 实测 DOM 结构（2026-10，用户 DamomHd）：
 *   DIV.col-12.d-block.width-full.tmp-py-4.border-bottom   ← 条目容器（一页 30 个）
 *   ├── DIV.d-inline-block.mb-1 > H3 > A[href="/owner/repo"]
 *   ├── DIV.float-right          ← Star 按钮 + GitHub Lists 菜单
 *   ├── DIV.py-1 > P             ← 描述
 *   └── DIV.f6.color-fg-muted    ← 语言/star/fork/更新时间
 *
 * 注入位置：描述之后、meta 行之前。
 */

import { render, h } from 'preact'
import { getSettings } from '../lib/settings'
import { patchAnnotation } from '../lib/annotations'
import { notifyChanged } from '../lib/notify-change'
import { AnnotationEditor, type AnnotationDraft } from '../components/AnnotationEditor'
import { t, resolveLocale, setLocale, getLocale } from '../lib/i18n'

/** 当前过滤条件（模块级状态，供刷新时复用） */
const filter = {
  query: '',
  tag: null as string | null,
}

/** 最近一次拿到的数据，供过滤时复用，避免反复读 storage */
let lastByName = new Map<string, Annotation>()
let lastNameToId = new Map<string, number>()

const ITEM_SELECTOR = '.col-12.d-block.width-full.tmp-py-4'
const INJECTED_MARK = 'data-bs-annotated'

interface Annotation {
  repo_id: number
  tags: string[]
  note: string
  full_name?: string
}

/** 从条目里取 repo 的 full_name（如 "owner/repo"） */
function repoNameOf(item: Element): string | null {
  const a = item.querySelector('h3 a[href]')
  const href = a?.getAttribute('href')
  if (!href) return null
  // href 形如 /owner/repo
  const m = href.match(/^\/([^/]+)\/([^/?#]+)/)
  return m ? `${m[1]}/${m[2]}` : null
}

/** 注入样式（只注入一次） */
function ensureStyles() {
  if (document.getElementById('bs-anno-styles')) return
  const style = document.createElement('style')
  style.id = 'bs-anno-styles'
  style.textContent = `
    /*
     * 条内注解：整体要「像 GitHub 自己渲染的内容」，不是贴上去的便签。
     * 用 GitHub 的 muted 前景色 + 正常行高，视觉重量低于仓库描述，
     * 因为注解是辅助信息，不该比仓库本身更抢眼。
     */
    .bs-anno {
      margin: 4px 0 0;
      font-size: 12px;
      line-height: 1.5;
      font-family: var(--fontStack-system);
    }
    /* 展示行 + 编辑入口放在同一行，左内容右按钮 */
    .bs-anno.is-viewing {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .bs-anno-display {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      flex: 1;
      min-width: 0;
    }

    /* 编辑入口：默认几乎隐形，hover 才显形——不打扰阅读 */
    .bs-anno-trigger {
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--borderRadius-medium, 6px);
      color: var(--fgColor-muted, #59636e);
      font-size: 11px;
      padding: 1px 6px;
      cursor: pointer;
      font-family: var(--fontStack-system);
      flex-shrink: 0;
      margin-left: auto;
      opacity: 0.75;
      transition: opacity .12s;
    }
    .bs-anno-trigger:hover {
      opacity: 1;
      color: var(--fgColor-accent, #0969da);
      background: var(--bgColor-muted, #f6f8fa);
      border-color: var(--borderColor-muted, #d1d9e0b3);
    }
    .bs-anno-editor-host:empty { display: none; }

    /* 我的标签：GitHub Label 形态，金色只做前缀点，不铺满背景 */
    .bs-anno-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--bgColor-default, #fff);
      border: 1px solid var(--borderColor-default, #d1d9e0);
      color: var(--fgColor-default, #1f2328);
      padding: 0 8px;
      height: 20px;
      border-radius: 999px;
      font-size: 11px;
      line-height: 1;
    }
    .bs-anno-tag::before {
      content: '';
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #d4a72c;
      flex-shrink: 0;
    }

    /* 备注：普通文本，用左侧色条标记「这是我写的」 */
    .bs-anno-note {
      color: var(--fgColor-muted, #59636e);
      border-left: 2px solid #d4a72c88;
      padding-left: 8px;
      flex-basis: 100%;
      white-space: pre-wrap;
      font-size: 12px;
    }
  `
  document.documentElement.appendChild(style)
}

/**
 * 为一个条目构建注解节点（展示态 + 编辑入口 + 编辑容器）。
 *
 * @param repoId 仓库 id（编辑时写库要用）
 * @param ann 已有注解，可为 undefined（说明还没写过）
 */
function buildAnnotationEl(repoId: number, fullName: string, initialAnn: Annotation | undefined): HTMLElement {
  // 用 let：保存后要就地更新，不必等整页重建
  let ann = initialAnn
  const wrap = document.createElement('div')
  wrap.className = 'bs-anno'

  // ── 展示行：标签 + 备注 ──
  const display = document.createElement('div')
  display.className = 'bs-anno-display'

  if (ann) {
    for (const t of ann.tags) {
      const tag = document.createElement('span')
      tag.className = 'bs-anno-tag'
      tag.textContent = t
      display.appendChild(tag)
    }
    if (ann.note.trim()) {
      const note = document.createElement('span')
      note.className = 'bs-anno-note'
      note.textContent = ann.note
      display.appendChild(note)
    }
  }

  let hasContent = Boolean(ann && (ann.tags.length > 0 || ann.note.trim()))

  // ── 编辑入口：独立一行，不放在展示行内 ──
  // 这样隐藏展示行时它仍然可见（可作为「收起」入口），布局也不会跳动
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'bs-anno-trigger'
  trigger.textContent = hasContent ? t('content.edit') : t('card.addNote')

  // 没内容时展示行是空的，不占空间
  if (!hasContent) display.style.display = 'none'

  wrap.classList.add('is-viewing')
  wrap.appendChild(display)
  wrap.appendChild(trigger)

  // ── 编辑容器（懒加载 Preact）──
  const editorHost = document.createElement('div')
  editorHost.className = 'bs-anno-editor-host'
  wrap.appendChild(editorHost)

  /**
   * 切换「展示态 ↔ 编辑态」。
   *
   * 两者互斥：编辑时把展示行藏起来，否则同一份备注在页面上出现两次，很业余。
   * 取消则恢复展示。
   */
  /**
   * 关闭编辑器。
   * @param newAnn 传入则表示「保存并展示新内容」；不传则是纯取消，恢复原内容
   */
  function closeEditor(newAnn?: Annotation) {
    render(null, editorHost)
    wrap.classList.add('is-viewing')

    if (newAnn) {
      // 保存路径：直接就地渲染新内容，不等 storage 回调，避免闪一下旧数据
      renderDisplay(newAnn)
      ann = newAnn
      const filled = newAnn.tags.length > 0 || newAnn.note.trim().length > 0
      display.style.display = filled ? '' : 'none'
      hasContent = filled
    } else {
      display.style.display = hasContent ? '' : 'none'
    }
    trigger.textContent = hasContent ? t('content.edit') : t('card.addNote')
  }

  /** 重绘展示行内容 */
  function renderDisplay(a: Annotation) {
    display.textContent = ''
    for (const t of a.tags) {
      const tag = document.createElement('span')
      tag.className = 'bs-anno-tag'
      tag.textContent = t
      display.appendChild(tag)
    }
    if (a.note.trim()) {
      const note = document.createElement('span')
      note.className = 'bs-anno-note'
      note.textContent = a.note
      display.appendChild(note)
    }
  }

  function openEditor() {
    display.style.display = 'none'
    trigger.textContent = '收起'
    wrap.classList.remove('is-viewing')
    render(
      h(AnnotationEditor, {
        initial: { note: ann?.note ?? '', tags: ann?.tags ?? [] },
        onSubmit: async (draft: AnnotationDraft) => {
          // 就地渲染新内容（不传参 = 取消，传注解 = 保存），避免闪旧数据
          closeEditor({
            repo_id: repoId,
            tags: draft.tags,
            note: draft.note,
            full_name: fullName,
          })
          await patchAnnotation(repoId, { note: draft.note, tags: draft.tags }, fullName)
          // 星标页写的也要自动同步
          notifyChanged()
        },
        // 取消：不传参，恢复原内容
        onCancel: () => closeEditor(),
      }),
      editorHost,
    )
  }

  trigger.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (editorHost.childElementCount > 0) {
      closeEditor()
      return
    }
    openEditor()
  })

  return wrap
}

/**
 * 遍历页面上所有仓库条目，注入展示 + 编辑入口。
 *
 * 为什么每个条目都注入（哪怕没注解）：
 * 用户要能在星标页「当场记一笔」，所以入口必须处处都有，不能只给写过的仓库。
 *
 * repoId 从哪来：DOM 里只有 full_name，没有 id。必须靠 star-cache 反查。
 * 如果缓存里没有这个仓库（比如用户从没在工作台拉过、或 star 后新增的），
 * 就**跳过注入**——宁可少一个入口，也不要凭空造 id 写坏数据。
 *
 * @param byName  已有的注解（full_name 小写 → 注解）
 * @param nameToId full_name 小写 → repoId（来自 star-cache）
 */
function applyAnnotations(byName: Map<string, Annotation>, nameToId: Map<string, number>) {
  const items = document.querySelectorAll(ITEM_SELECTOR)
  if (items.length === 0) return

  ensureStyles()

  for (const item of items) {
    const name = repoNameOf(item)
    if (!name) continue
    const key = name.toLowerCase()

    const repoId = nameToId.get(key)
    if (repoId == null) continue // 拿不到 id，不注入

    const ann = byName.get(key)
    const existing = item.querySelector('.bs-anno')

    // 已注入且内容一致 → 跳过（避免每次轮询都重建 DOM，也会打断正在编辑的用户）
    const sig = signature(ann) + '#' + repoId
    if (existing && existing.getAttribute('data-sig') === sig) continue

    // 正在编辑时不重建，否则用户输入会被打断
    if (existing?.querySelector('.bs-anno-editor-host')?.childElementCount) continue

    existing?.remove()

    const el = buildAnnotationEl(repoId, name, ann)
    el.setAttribute('data-sig', sig)

    // 插入位置：描述块之后；没有描述就插在 meta 行之前；都没有就追加到末尾
    const desc = item.querySelector('.py-1')
    const meta = item.querySelector('.f6.color-fg-muted.mt-2')
    if (desc) desc.insertAdjacentElement('afterend', el)
    else if (meta) meta.insertAdjacentElement('beforebegin', el)
    else item.appendChild(el)

    item.setAttribute(INJECTED_MARK, '1')
  }
}

/** 内容签名：标签+备注变了才需要重建（无注解也要有个稳定签名） */
function signature(ann: Annotation | undefined): string {
  return ann ? ann.tags.join('|') + '::' + ann.note : '(empty)'
}

/**
 * 渲染标签胶囊行（点选过滤）。
 *
 * 只展示「至少被 2 个仓库使用」的标签：只用一个标签的胶囊会让这行变成几十个碎胶囊，
 * 反而找不着东西（和工作台的聚类口径一致）。
 */
function renderTagChips() {
  const row = document.querySelector('.bs-tag-row')
  if (!row) return

  // 统计标签使用频次
  const freq = new Map<string, number>()
  for (const ann of lastByName.values()) {
    for (const t of ann.tags) freq.set(t, (freq.get(t) ?? 0) + 1)
  }

  const tags = [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)

  row.textContent = ''

  if (tags.length === 0) {
    const hint = document.createElement('span')
    hint.className = 'bs-tag-empty'
    hint.textContent =
      lastByName.size === 0
        ? getLocale() === 'zh-CN'
          ? '还没有标签，点任意仓库下方的「✎ 记一笔」开始'
          : 'No tags yet. Click "Add note" under any repo to start'
        : getLocale() === 'zh-CN'
          ? '标签还不够多，暂时不显示筛选'
          : 'Not enough tags yet'
    row.appendChild(hint)
    return
  }

  for (const [tag, count] of tags) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'bs-chip' + (filter.tag === tag ? ' active' : '')
    chip.innerHTML = `<span class="bs-chip-name"></span><span class="bs-chip-count">${count}</span>`
    chip.querySelector('.bs-chip-name')!.textContent = tag
    chip.addEventListener('click', () => {
      // 再次点击同一个标签 = 取消筛选
      filter.tag = filter.tag === tag ? null : tag
      document.dispatchEvent(new CustomEvent('bs-filter-change', { detail: { tag: filter.tag } }))
    })
    row.appendChild(chip)
  }
}

/**
 * 按当前 filter 显隐页面上的仓库条目。
 *
 * 实现方式：给不匹配的条目加 class 隐藏，**不删除 DOM** ——
 * 因为 GitHub 自己的列表逻辑（分页、排序）可能依赖这些节点。
 */
function applyFilter() {
  const items = document.querySelectorAll(ITEM_SELECTOR)
  const q = filter.query.trim().toLowerCase()

  for (const item of items) {
    const name = repoNameOf(item)
    if (!name) continue
    const ann = lastByName.get(name.toLowerCase())

    let match = true

    if (filter.tag) {
      match = Boolean(ann?.tags.includes(filter.tag))
    }
    if (match && q) {
      // 只在备注和标签里搜：GitHub 原生搜索已覆盖名字/描述，这里不重复
      const hay = ((ann?.note ?? '') + ' ' + (ann?.tags ?? []).join(' ')).toLowerCase()
      match = hay.includes(q)
    }

    item.classList.toggle('bs-filtered-out', !match)
  }

  // 显示命中数量
  const bar = document.querySelector('.bs-banner')
  if (bar) {
    const total = items.length
    const shown = [...items].filter((i) => !i.classList.contains('bs-filtered-out')).length
    const active = filter.tag || q
    bar.classList.toggle('bs-filtering', Boolean(active))

    const counter = bar.querySelector('.bs-filter-count') as HTMLElement | null
    if (counter) counter.textContent = active ? `${shown}/${total}` : ''

    // 有标签筛选时自动展开标签行，否则用户看不到选中了哪个标签
    if (filter.tag) {
      const row = bar.querySelector('.bs-tag-row') as HTMLElement | null
      const tagToggle = bar.querySelector('.bs-tags-toggle') as HTMLElement | null
      if (row && row.hidden) {
        row.hidden = false
        tagToggle?.classList.add('active')
      }
    }
  }
}

/**
 * 按需拉取当前页面上仓库的 id。
 *
 * 背景：DOM 里只有 full_name，写库需要 repoId。原本依赖工作台的全量缓存，
 * 但那样用户「没先在工作台点过拉取」就完全用不了。
 *
 * 做法：只对页面上出现的仓库逐个查 `GET /repos/{owner}/{repo}`，
 * 而不是拉全量 star（后者对 5000 star 要 50 次请求，这里一页只要 30 次）。
 * 失败（404/限流）静默跳过——宁可那个仓库没有编辑入口，也不阻塞其他仓库。
 */
async function fetchRepoIds(names: string[]): Promise<Array<{ id: number; full_name: string }>> {
  if (names.length === 0) return []

  const { token } = await chrome.storage.local.get('token')
  const t = token?.access_token
  if (!t) return []

  const out: Array<{ id: number; full_name: string }> = []
  // 顺序而非并发：GitHub 对突发请求敏感。上限 30 个/次，约 3-5 秒
  for (const name of names.slice(0, 30)) {
    try {
      const res = await fetch(`https://api.github.com/repos/${name}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${t}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (!res.ok) continue
      const repo = await res.json()
      if (repo?.id && repo?.full_name) {
        out.push({ id: repo.id, full_name: repo.full_name })
      }
    } catch {
      // 单个失败不影响整体
    }
  }
  return out
}

/**
 * 全量刷新入口。
 *
 * 每次刷新都要重新读本地注解——用户可能刚在工作台改过。
 * 但读 storage 是异步的，调用方要自行节流（见下方轮询间隔）。
 */
async function refresh() {
  const { annotations } = await chrome.storage.local.get('annotations')
  const raw: Record<string, Annotation> = annotations ?? {}

  // 开关关闭时：清除页面上所有已注入的注解，然后退出
  const settings = await getSettings()
  setLocale(resolveLocale(settings.language))
  if (!settings.showAnnotations) {
    document.querySelectorAll('.bs-anno').forEach((n) => n.remove())
    document
      .querySelectorAll(`[${INJECTED_MARK}]`)
      .forEach((n) => n.removeAttribute(INJECTED_MARK))
    return
  }

  // nameToId 来自 star-cache：DOM 里只有 full_name，写库需要 repoId。
  const { 'star-cache': cache } = await chrome.storage.local.get('star-cache')
  const nameToId = new Map<string, number>()
  const idToName = new Map<number, string>()
  const fillMaps = (repos: Array<{ id: number; full_name: string }>) => {
    for (const r of repos) {
      nameToId.set(String(r.full_name).toLowerCase(), r.id)
      idToName.set(r.id, r.full_name)
    }
  }
  if (cache?.repos) fillMaps(cache.repos)

  // 缓存覆盖不全（新 star 的仓库不在里面）→ 按需补拉页面上缺的那几个。
  // 用**独立 key** 存补拉结果，不污染 star-cache：
  // star-cache 是全量快照，工作台依赖它的完整性；这里只是局部补充。
  const partial: Record<string, number> =
    (await chrome.storage.local.get('star-id-map'))['star-id-map'] ?? {}

  const missingNames: string[] = []
  for (const item of document.querySelectorAll(ITEM_SELECTOR)) {
    const n = repoNameOf(item)
    if (n && !nameToId.has(n.toLowerCase())) missingNames.push(n)
  }

  if (missingNames.length > 0) {
    const fetched = await fetchRepoIds(missingNames)
    if (fetched.length > 0) {
      fillMaps(fetched)
      for (const r of fetched) partial[r.full_name.toLowerCase()] = r.id
      await chrome.storage.local.set({ 'star-id-map': partial })
    }
  }

  // 把独立映射表里的记录也补进来（上次按需拉过的）
  for (const [name, id] of Object.entries(partial)) {
    if (!nameToId.has(name)) {
      nameToId.set(name, id)
      idToName.set(id, name)
    }
  }

  // 注解里冗余存了 full_name，直接建映射，不依赖 star-cache 是否就绪。
  // 兜底：早期数据可能没有 full_name，这时用 star-cache 补一次映射。
  const byName = new Map<string, Annotation>()
  const missing: number[] = []

  for (const [, ann] of Object.entries(raw)) {
    if (ann.full_name) {
      byName.set(ann.full_name.toLowerCase(), ann)
    } else {
      missing.push(ann.repo_id)
    }
  }

  if (missing.length > 0) {
    if (cache?.repos) {
      for (const [key, ann] of Object.entries(raw)) {
        if (ann.full_name) continue
        const name = idToName.get(Number(key))
        if (name) byName.set(name.toLowerCase(), ann)
      }
    }
  }

  // 存下来供过滤复用
  lastByName = byName
  lastNameToId = nameToId

  applyAnnotations(byName, nameToId)
  renderTagChips()
  // 数据变了（比如刚写了新标签），按当前条件重新过滤一次
  applyFilter()
}

/** 启动 + 监听变化 */
function start() {
  void refresh()

  // 1. 本地注解变了（工作台改完回来）→ 刷新
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.annotations || changes['star-cache'] || changes.settings)) {
      void refresh()
    }
  })

  // 2. GitHub 分页/滚动加载更多 → 新条目需要注入
  //    用轮询而非 MutationObserver：页面 DOM 变动太频繁，观察整树会拖慢浏览器
  let lastCount = 0
  window.setInterval(() => {
    if (!/[?&]tab=stars/.test(location.search)) return
    const n = document.querySelectorAll(ITEM_SELECTOR).length
    if (n !== lastCount) {
      lastCount = n
      void refresh()
    }
  }, 1000)
}

start()

/**
 * 接收来自工具条（inject-stars.ts）的过滤请求。
 *
 * 两个 content script 是分别注入的独立模块，用自定义事件通信比
 * 共享全局变量更安全（不污染 window，也不依赖脚本执行顺序）。
 */
document.addEventListener('bs-filter-change', ((e: CustomEvent) => {
  const detail = e.detail ?? {}
  if ('query' in detail) filter.query = detail.query ?? ''
  if ('tag' in detail) filter.tag = detail.tag ?? null

  // 只改显示，不重建 DOM：需要标签数据时用缓存
  if (lastByName.size === 0) {
    void refresh()
  } else {
    renderTagChips()
    applyFilter()
  }
}) as EventListener)

export {}