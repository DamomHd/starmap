/**
 * GitHub 数据层 —— 全量拉取 star 元数据 + 本地轻缓存。
 *
 * 关键原则：只缓存「repo 元数据快照」用于快速渲染/检索，
 * 真正的注解层（tags/note）由 annotations.ts 单独管理。
 *
 * rate limit：认证后 30 次/分钟。全量分页（100/页），5000 条 star 需 50 次请求，
 * 所以这里一定要带缓存 TTL，别每次都全量打满。
 */

export interface Repo {
  id: number
  full_name: string
  description: string | null
  html_url: string
  topics: string[]
  language: string | null
  stargazers_count: number
  archived: boolean
  pushed_at: string
  starred_at?: string
  /**
   * 以下四个字段对齐 GitHub 星标页原生筛选项（Type 那一组）。
   * 取它们的主要用途是**清理**：fork / mirror 最容易堆积成垃圾。
   * 老缓存里没有这些字段，所以都是可选的，读取时按 false 处理。
   */
  fork?: boolean
  private?: boolean
  /** 非 null 表示是镜像仓库 */
  mirror_url?: string | null
  is_template?: boolean
}

export interface Annotation {
  repo_id: number
  tags: string[]
  note: string
  /**
   * 仓库全名（owner/repo）。冗余存储的理由：星标页注入时只能从 DOM 拿到 full_name，
   * 若无此字段就得依赖 star-cache 做 id→name 映射，而缓存可能为空（用户没在工作台拉过数据）。
   * 冗余一份让星标页能独立工作，不依赖缓存是否就绪。
   */
  full_name?: string
  /**
   * 最后修改时间（epoch ms），跨设备合并的依据。
   *
   * 合并规则：同一个 repo 在两台设备上都有注解时，取 updatedAt 更大的那条。
   * 以「整条注解」为单位而非字段级——因为用户改标签和改备注通常是一起发生的，
   * 拆到字段级会让「我改标签时别人改了备注」这种场景合并出四不像，
   * 而整条取新，语义更符合直觉：谁的版本更新就用谁的。
   */
  updatedAt?: number
  /**
   * @deprecated 收藏功能已移除（与 star 重复，用标签代替）。
   * 该字段仅保留用于读取旧数据并在启动时迁移成 `#收藏` 标签，新写入一律不带。
   * 见 annotations.ts 的 migrateLegacyFavorites()。
   */
  favorite?: boolean
}

const CACHE_KEY = 'star-cache'
const CACHE_TTL_MS = 1000 * 60 * 30 // 30 分钟

/**
 * 缓存结构版本。
 *
 * 用途：数据结构升级后（比如新增 fork/private 字段），旧缓存里没有这些字段。
 * 若不区分版本，用户就会看到「Type 筛选全是原创+公开」这种静默错误——
 * 不报错、不崩溃，只是功能悄悄不对，最难排查的一类问题。
 *
 * 版本不匹配 → 缓存视为失效，触发一次全量重拉。
 * 改 Repo 结构时记得 +1。
 */
const CACHE_VERSION = 2

interface Cache {
  version: number
  owner: string
  fetchedAt: number
  repos: Repo[]
}

async function authToken(): Promise<string | null> {
  const { token } = await chrome.storage.local.get('token')
  return token?.access_token ?? null
}

async function api<T>(path: string, accept = 'application/vnd.github+json'): Promise<T> {
  const t = await authToken()
  const headers: Record<string, string> = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (t) headers.Authorization = `Bearer ${t}`

  const res = await fetch(`https://api.github.com${path}`, { headers })
  if (res.status === 401) throw new Error('Token 无效，请重新连接 GitHub')
  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    throw new Error(
      remaining === '0'
        ? '触发 GitHub API 频率限制，请稍后再试（认证后每分钟 30 次）'
        : `GitHub API 403: ${path}`,
    )
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

/** 当前登录用户 */
export async function currentUser(): Promise<{ login: string }> {
  return api('/user')
}

/**
 * 全量拉取某个用户的 star。
 *
 * 分页策略：每页 100 条，直到返回不足 100 条为止。
 * 注意：GitHub 的 /users/{user}/starred 最多返回 1000 条（未认证限制），
 * 认证用户可以用 /user/starred 拿到自己的全部（无 1000 上限）。
 * 所以这里拉「自己的」star 用 /user/starred，更完整。
 */
export async function fetchAllStarred(
  onProgress?: (loaded: number) => void,
): Promise<Repo[]> {
  const all: Repo[] = []
  let page = 1
  const perPage = 100
  // 安全上限：防止异常情况下无限翻页
  const MAX_PAGES = 200

  while (page <= MAX_PAGES) {
    // ⚠️ 关键：必须用 star+json 这个 Accept，否则返回的是普通 repo 对象，
    // 不含 starred_at 字段 —— 导致「按 star 时间排序」和「年份」维度全部失效。
    // 使用该 Accept 时，每项形如 { starred_at: "...", repo: {...} }。
    const batch = await api<any[]>(
      `/user/starred?per_page=${perPage}&page=${page}`,
      'application/vnd.github.star+json',
    )
    if (batch.length === 0) break
    for (const item of batch) {
      const r = item.repo
      all.push({
        id: r.id,
        full_name: r.full_name,
        description: r.description,
        html_url: r.html_url,
        topics: r.topics ?? [],
        language: r.language,
        stargazers_count: r.stargazers_count,
        archived: r.archived,
        pushed_at: r.pushed_at,
        starred_at: item.starred_at,
        // 对齐 GitHub 原生 Type 筛选项
        fork: r.fork,
        private: r.private,
        mirror_url: r.mirror_url,
        is_template: r.is_template,
      })
    }
    onProgress?.(all.length)
    if (batch.length < perPage) break
    page++
  }

  // 统一按 star 时间倒序（最近 star 的最前），不依赖 API 返回顺序
  all.sort((a, b) => {
    const ta = a.starred_at ? new Date(a.starred_at).getTime() : 0
    const tb = b.starred_at ? new Date(b.starred_at).getTime() : 0
    return tb - ta
  })
  return all
}

/**
 * 取消 star（破坏性操作，必须由用户显式触发）。
 *
 * PUT/DELETE /user/starred/{owner}/{repo} 是幂等语义：
 * - DELETE：取消 star，成功返回 204
 * - 即使原本未 star 也不会报错（204），所以重试安全
 */
export async function unstarRepo(fullName: string): Promise<void> {
  const t = await authToken()
  if (!t) throw new Error('未登录 GitHub')
  const res = await fetch(`https://api.github.com/user/starred/${fullName}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${t}`,
      'X-GitHub-Api-Version': '2022-11-28',
      // 取消 star 需要 Content-Length: 0，fetch 发 DELETE 默认即可
    },
  })
  if (res.status === 401) throw new Error('Token 无效，请重新连接')
  if (res.status === 403) throw new Error('权限不足：Token 需要 star 相关写权限')
  if (!res.ok && res.status !== 404) {
    throw new Error(`取消 star 失败 ${res.status}: ${fullName}`)
  }
}

/** 读缓存；未过期才返回 */
export async function readCache(): Promise<Cache | null> {
  const { [CACHE_KEY]: cache } = await chrome.storage.local.get(CACHE_KEY)
  if (!cache) return null
  // 结构版本不符 → 当作没有缓存，逼出一次全量重拉
  if (cache.version !== CACHE_VERSION) return null
  if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null
  return cache as Cache
}

/** 写缓存（key 带用户，避免换账号串数据） */
export async function writeCache(owner: string, repos: Repo[]): Promise<void> {
  const cache: Cache = { version: CACHE_VERSION, owner, fetchedAt: Date.now(), repos }
  await chrome.storage.local.set({ [CACHE_KEY]: cache })
}

export async function clearCache(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY)
}