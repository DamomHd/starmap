import './style.css'
import { render } from 'preact'
import { useState, useEffect, useMemo } from 'preact/hooks'
import { loadToken, logout, forgetToken } from '../lib/oauth'
import { fetchAllStarred, readCache, writeCache, currentUser, unstarRepo, type Repo } from '../lib/github'
import { clusterBy, crossFilter, getDimensionLabels, type Dimension } from '../lib/cluster'
import { buildIndex, searchRepos } from '../lib/search'
import { sortRepos, getSortLabels, type SortKey } from '../lib/sort'
import { filterByType, countByType, getRepoTypeOptions, type RepoType } from '../lib/repo-type'
import {
  getAllAnnotations,
  patchAnnotation,
  replaceAllAnnotations,
  migrateLegacyFavorites,
} from '../lib/annotations'
import { RepoCard } from './components/RepoCard'
import { SettingsPanel } from './components/SettingsPanel'
import { LoginGuide } from './components/LoginGuide'
import {
  getSettings,
  updateSettings,
  applyTheme,
  DEFAULT_SETTINGS,
  type Settings,
} from '../lib/settings'
import { pullIfStale } from '../lib/auto-sync'
import { notifyChanged } from '../lib/notify-change'
import { CleanupPanel } from './components/CleanupPanel'
import { suggestCleanup } from '../lib/cleanup'
import { t, resolveLocale, setLocale } from '../lib/i18n'
import type { Annotation } from '../lib/github'

type Condition = { dim: Dimension; value: string }

/**
 * 维度图标（Octicon 圆点/线条风格，与 GitHub 一致）。
 * 用 inline SVG 而不是 emoji——emoji 是 skill 明确点名的 AI slop。
 */
const DIMENSION_ICONS: Record<Dimension, string> = {
  topic:
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 1.75A.75.75 0 0 1 .75 1h4.253a.75.75 0 0 1 .53.22l8.75 8.75a1.75 1.75 0 0 1 0 2.475l-2.253 2.253a1.75 1.75 0 0 1-2.475 0l-8.75-8.75a.75.75 0 0 1-.22-.53Zm.75.75v3.72l8.22 8.22c.27.27.71.27.98 0l2.25-2.25a.69.69 0 0 0 0-.98L3.98 3H.75Z"/><path d="M4.5 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>',
  language:
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 8.75a9.64 9.64 0 0 0 1.363 4.177c.255.426.542.832.857 1.215.245-.296.551-.705.857-1.215A9.64 9.64 0 0 0 10.22 8.75Zm4.44-1.5a9.64 9.64 0 0 0-1.363-4.177c-.307-.51-.612-.919-.857-1.215a9.927 9.927 0 0 0-.857 1.215A9.64 9.64 0 0 0 5.78 7.25Zm-5.944 1.5H1.543a6.507 6.507 0 0 0 4.666 5.5c-.123-.181-.24-.365-.352-.552-.715-1.192-1.437-2.874-1.581-4.948Zm-2.733-1.5h2.733c.144-2.074.866-3.756 1.58-4.948.12-.197.237-.381.353-.552a6.507 6.507 0 0 0-4.666 5.5Zm10.181 1.5c-.144 2.074-.866 3.756-1.58 4.948-.12.197-.237.381-.353.552a6.507 6.507 0 0 0 4.666-5.5Zm2.733-1.5a6.507 6.507 0 0 0-4.666-5.5c.123.181.24.365.353.552.714 1.192 1.436 2.874 1.58 4.948Z"/></svg>',
  author:
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/></svg>',
  year: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 5.5v8.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V5.5Zm10.5-1.5H2.5v-.25a.25.25 0 0 1 .25-.25h10.5a.25.25 0 0 1 .25.25Z"/></svg>',
  myTag:
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>',
}

/** 网格列数自适应 */
function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [repos, setRepos] = useState<Repo[]>([])
  const [query, setQuery] = useState('')
  const [dim, setDim] = useState<Dimension>('topic')
  const [sortKey, setSortKey] = useState<SortKey>('starred')
  /** 仓库类型筛选（对齐 GitHub 原生 Type 下拉） */
  const [repoType, setRepoType] = useState<RepoType>('all')
  const [conditions, setConditions] = useState<Condition[]>([])
  const [error, setError] = useState('')
  const [login, setLogin] = useState('')
  // 注解：{ [repoId]: Annotation }，repo 被写了备注/标签/收藏才出现在这里
  const [annotations, setAnnotations] = useState<Record<string, Annotation>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [cleanupOpen, setCleanupOpen] = useState(false)

  useEffect(() => {
    // 只有「已连接」才进工作台；断开状态的 token 仍保留，供一键重连
    loadToken().then((t) => setLoggedIn(Boolean(t) && !t?.disconnected))
    // 先把旧的「收藏」迁移成 #收藏 标签，再读取注解，保证界面拿到的是迁移后的数据
    migrateLegacyFavorites()
      .catch((e) => console.warn('收藏数据迁移失败（不影响使用）', e))
      .finally(() => getAllAnnotations().then(setAnnotations))
    getSettings().then((s) => {
      setSettings(s)
      applyTheme(s.theme)
      setLocale(resolveLocale(s.language))
    })

    // 打开工作台时自动拉取一次并合并（节流：1 分钟内不重复拉）
    void pullIfStale().then((merged) => {
      if (merged) setAnnotations(merged)
    })
  }, [])

  /** 登录引导完成回调（校验、存 token 都在 LoginGuide 内部处理了） */
  function handleConnected(loginName: string) {
    setLogin(loginName)
    setLoggedIn(true)
    // 连上后立刻拉一次数据
    void handleLoad()
  }

  async function handleLoad(force = false) {
    setError('')
    setLoading(true)
    try {
      if (!force) {
        const cached = await readCache()
        if (cached) {
          setRepos(cached.repos)
          setLogin(cached.owner)
          return
        }
      }
      const user = await currentUser()
      setLogin(user.login)
      const list = await fetchAllStarred((n) => setLoadingText(`已拉取 ${n} 条…`))
      await writeCache(user.login, list)
      setRepos(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setLoadingText('')
    }
  }

  // 清理建议：纯本地计算，随 repos / annotations 变化重算
  const cleanupSuggestions = useMemo(
    () => suggestCleanup(repos, annotations),
    [repos, annotations],
  )

  /**
   * 批量取消 star。
   * 逐条执行（不并发轰炸 GitHub），单独捕获每条失败，最后汇总。
   * 成功的从内存列表里移除，并把缓存一并更新，避免刷新后又冒出来。
   */
  async function handleCleanup(names: string[]): Promise<{ ok: number; failed: string[] }> {
    const failed: string[] = []
    const removed = new Set<string>()
    for (const name of names) {
      try {
        await unstarRepo(name)
        removed.add(name)
      } catch {
        failed.push(name)
      }
    }
    if (removed.size > 0) {
      const next = repos.filter((r) => !removed.has(r.full_name))
      setRepos(next)
      if (login) await writeCache(login, next)
    }
    return { ok: removed.size, failed }
  }

  /**
   * 切换设置项。
   * 写入 storage 后 content script 会通过 storage.onChanged 感知并立即生效，
   * 不需要用户手动刷新 GitHub 页面。
   */
  async function handleToggleSetting(patch: Partial<Settings>) {
    // 乐观更新，避免开关有延迟感
    setSettings((prev) => ({ ...prev, ...patch }))
    // 主题和语言要立即生效，不等 storage 写完
    if (patch.theme) applyTheme(patch.theme)
    if (patch.language) setLocale(resolveLocale(patch.language))
    await updateSettings(patch)
  }

  /** 从 Gist 拉取后：整批替换本地库 + 刷新界面 */
  async function handlePulled(next: Record<string, Annotation>) {
    await replaceAllAnnotations(next)
    setAnnotations(next)
  }

  /** 断开连接：token 保留在本地，可以一键重连 */
  async function handleLogout() {
    await logout()
    setLoggedIn(false)
    setRepos([])
    setConditions([])
    setQuery('')
    setLogin('')
  }

  /** 彻底移除 token：之后必须重新去 GitHub 创建 */
  async function handleForget() {
    await forgetToken()
    setLoggedIn(false)
    setSettingsOpen(false)
    setRepos([])
    setConditions([])
    setQuery('')
    setLogin('')
  }

  // 注解也进索引：用户自己写的备注/标签必须有最高检索优先级
  const index = useMemo(() => buildIndex(repos, annotations), [repos, annotations])

  const visible = useMemo(() => {
    // 过滤顺序：类型 → 交叉条件 → 关键词
    // 类型放最前，因为它是最粗的一刀（fork/镜像整类排除），
    // 先切掉能让后面的聚类也只在相关库里算，簇的计数更准
    let list = filterByType(repos, repoType)
    list = crossFilter(list, conditions, annotations)
    if (query.trim()) {
      const matched = new Set(searchRepos(index, query))
      list = list.filter((r) => matched.has(r.id))
    }
    // 排序放在过滤之后：保证只对最终结果排序，不会打乱过滤逻辑
    return sortRepos(list, sortKey)
  }, [repos, repoType, conditions, annotations, query, index, sortKey])

  // 各类型的数量（基于未按类型过滤的全集算，这样下拉里能看到每类有多少）
  const typeCounts = useMemo(() => countByType(repos), [repos])

  const dimensionLabels = useMemo(() => getDimensionLabels(), [settings.language])
  const sortLabels = useMemo(() => getSortLabels(), [settings.language])
  const repoTypeOptions = useMemo(() => getRepoTypeOptions(), [settings.language])

  const clusters = useMemo(() => {
    const usedDims = new Set(conditions.map((c) => c.dim))
    const clusterDim = usedDims.has(dim) ? undefined : dim
    return clusterDim ? clusterBy(visible, clusterDim, 2, annotations) : []
  }, [visible, dim, conditions, annotations])

  function toggleCondition(d: Dimension, value: string) {
    setConditions((prev) => {
      const exists = prev.some((c) => c.dim === d && c.value === value)
      return exists
        ? prev.filter((c) => !(c.dim === d && c.value === value))
        : [...prev, { dim: d, value }]
    })
  }

  /**
   * 增量更新一条注解：只写传入字段，其余沿用库里最新值。
   *
   * 为什么不用「整条覆盖」：用户可能连续做多个小操作（点收藏 → 加标签），
   * 每次只带自己改的字段，就不会用旧快照覆盖掉别人刚写进去的值。
   * 存储层有写队列串行化，这里可以放心并发调用。
   */
  async function handlePatch(repoId: number, patch: Partial<Omit<Annotation, 'repo_id'>>) {
    // 带上 full_name，星标页注入时才能匹配到（不依赖 star-cache）
    const repo = repos.find((r) => r.id === repoId)
    const next = await patchAnnotation(repoId, patch, repo?.full_name)
    setAnnotations((prev) => {
      const map = { ...prev }
      // patchAnnotation 会在「空注解」时把条目删掉，这里同步反映
      if (next.tags.length === 0 && !next.note.trim()) {
        delete map[String(repoId)]
      } else {
        map[String(repoId)] = next
      }
      return map
    })
    // 改动后通知 background 安排推送（防抖 5 秒，连续改只推一次）
    notifyChanged()
  }

  // ── 未登录 ──
  if (!loggedIn) {
    return (
      <div class="welcome">
        <div class="welcome-card wide">
          <div class="welcome-brand">
            <span class="logo big">★</span>
            <div>
              <h1>
                Starmap {t('topbar.subtitle') && <span class="brand-cn">{t('topbar.subtitle')}</span>}
              </h1>
              <p class="subtitle">{t('login.tagline')}</p>
            </div>
          </div>
          <LoginGuide onConnected={handleConnected} />
        </div>
      </div>
    )
  }

  // ── 主工作台 ──
  return (
    <div class="shell">
      {/* 顶部栏 */}
      <header class="topbar">
        <div class="brand">
          <span class="logo">★</span>
          <span class="brand-name">Starmap</span>
          {t('topbar.subtitle') && <span class="brand-cn">{t('topbar.subtitle')}</span>}
          {login && <span class="user">@{login}</span>}
        </div>
        <div class="topbar-actions">
          {repos.length > 0 && (
            <>
              <span class="stat">{t('topbar.starCount', { count: repos.length })}</span>
              <button class="ghost" onClick={() => handleLoad(true)} disabled={loading}>
                {t('common.refresh')}
              </button>
            </>
          )}
          <button class="ghost" onClick={() => setSettingsOpen(true)}>
            {t('common.settings')}
          </button>
          <button class="ghost" onClick={() => setCleanupOpen(true)}>
            {t('common.cleanup')}
            {cleanupSuggestions.length > 0 && <span class="badge-dot">{cleanupSuggestions.length}</span>}
          </button>
          <button class="ghost" onClick={handleLogout} title={t('common.disconnectHint')}>
            {t('common.disconnect')}
          </button>
        </div>
      </header>

      {error && <div class="error banner">{error}</div>}

      {repos.length === 0 && !loading && (
        <div class="empty">
          <button class="primary big" onClick={() => handleLoad()}>
            {t('topbar.emptyTitle')}
          </button>
        </div>
      )}

      {loading && <div class="loading-bar">{loadingText || t('topbar.loadingText')}</div>}

      {repos.length > 0 && (
        <div class="content">
          {/* 左侧：主题地图 */}
          <aside class="sidebar">
            <div class="dim-tabs">
              {(['topic', 'language', 'author', 'year', 'myTag'] as Dimension[]).map((d) => (
                <button
                  key={d}
                  class={d === dim ? 'tab active' : 'tab'}
                  onClick={() => setDim(d)}
                >
                  <span
                    class="tab-icon"
                    dangerouslySetInnerHTML={{ __html: DIMENSION_ICONS[d] }}
                  />
                  {dimensionLabels[d]}
                </button>
              ))}
            </div>

            <div class="cluster-list">
              {clusters.length === 0 && (
                <p class="hint small">{t('results.noMatch')}</p>
              )}
              {clusters.map((c) => (
                <button key={c.key} class="cluster-row" onClick={() => toggleCondition(dim, c.key)}>
                  <span class="cluster-label">{c.label}</span>
                  <span class="cluster-count">{c.count}</span>
                </button>
              ))}
            </div>
          </aside>

          {/* 右侧：搜索 + 结果 */}
          <main class="main">
            <div class="search-row">
              <input
                class="search"
                type="search"
                placeholder={t('content.searchPlaceholder')}
                value={query}
                onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              />
              <select
                class="type-select"
                value={repoType}
                onChange={(e) => setRepoType((e.target as HTMLSelectElement).value as RepoType)}
              >
                {repoTypeOptions.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}（{typeCounts.get(value) ?? 0}）
                  </option>
                ))}
              </select>
            </div>

            {conditions.length > 0 && (
              <div class="filter-bar">
                <span class="filter-stat">
                  {visible.length} / {repos.length}
                </span>
                {conditions.map((c) => (
                  <button
                    key={`${c.dim}:${c.value}`}
                    class="chip"
                    onClick={() => toggleCondition(c.dim, c.value)}
                    title={t('common.delete')}
                  >
                    <span class="chip-dim">{dimensionLabels[c.dim]}</span>
                    {c.value}
                    <span class="chip-x">×</span>
                  </button>
                ))}
                <button
                  class="chip clear"
                  onClick={() => setConditions([])}
                >
                  {t('common.clear')}
                </button>
              </div>
            )}

            <div class="result-head">
              <span>
                {t('results.repos')} <span class="muted">({visible.length})</span>
              </span>
              <label class="sort-control">
                {t('sort.label')}
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey((e.target as HTMLSelectElement).value as SortKey)}
                >
                  {(Object.keys(sortLabels) as SortKey[]).map((k) => (
                    <option key={k} value={k}>
                      {sortLabels[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div class="grid">
              {visible.map((r) => (
                <RepoCard
                  key={r.id}
                  repo={r}
                  annotation={annotations[String(r.id)]}
                  onTagClick={toggleCondition}
                  onPatch={handlePatch}
                />
              ))}
              {visible.length === 0 && <p class="hint">{t('results.noMatch')}</p>}
            </div>
          </main>
        </div>
      )}

      {settingsOpen && (
        <SettingsPanel
          annotations={annotations}
          settings={settings}
          login={login}
          onToggle={handleToggleSetting}
          onPulled={handlePulled}
          onReconnect={handleConnected}
          onForget={handleForget}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {cleanupOpen && (
        <CleanupPanel
          suggestions={cleanupSuggestions}
          onConfirm={handleCleanup}
          onClose={() => setCleanupOpen(false)}
        />
      )}
    </div>
  )
}

render(<App />, document.getElementById('app')!)