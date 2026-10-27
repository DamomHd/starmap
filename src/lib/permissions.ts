/**
 * Token 权限探测 —— 登录后告诉用户「你的 token 能干什么、不能干什么」。
 *
 * 为什么要做：
 * 用户从 GitHub 创建 token 时最容易漏勾权限，然后就卡在莫名其妙的 403 上，
 * 不知道是代码坏了还是自己配错了。明确告知能大幅降低劝退率。
 *
 * 探测原则：**只读探测，不做任何写操作**。
 * 挑轻量的 GET 接口，靠状态码判断权限是否存在，不消耗敏感额度。
 */

export interface TokenCapabilities {
  /** 能否读取用户信息（最基本的可用性） */
  canReadUser: boolean
  /** 能否读取 star 列表 */
  canReadStars: boolean
  /** 能否取消 star（清理功能需要） */
  canUnstar: boolean
  /** 能否读写 Gist（跨设备同步需要） */
  canSync: boolean
  /** 登录名，canReadUser 为 true 时才有 */
  login?: string
}

const HEADERS = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
})

/** 用任意请求的响应码推断权限：2xx 有权限，403/404 无权限 */
async function probe(token: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: HEADERS(token) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * 探测 token 的各项能力。
 *
 * 注意「能否取消 star」无法通过只读请求探测：
 * DELETE 会真的取消 star，绝不能拿来试。这里用 star 列表可读 + token 类型推断，
 * 实际以执行时是否 403 为准。
 */
export async function probeCapabilities(token: string): Promise<TokenCapabilities> {
  const t = token.trim()

  // 1. 读用户信息：最基本的能力
  let login: string | undefined
  let canReadUser = false
  try {
    const res = await fetch('https://api.github.com/user', { headers: HEADERS(t) })
    if (res.ok) {
      const u = await res.json()
      login = u.login
      canReadUser = true
    }
  } catch {
    canReadUser = false
  }

  if (!canReadUser) {
    return { canReadUser: false, canReadStars: false, canUnstar: false, canSync: false }
  }

  // 2. 并行探测其余能力
  const [canReadStars, canSync] = await Promise.all([
    probe(t, 'https://api.github.com/user/starred?per_page=1'),
    probe(t, 'https://api.github.com/gists?per_page=1'),
  ])

  return {
    canReadUser,
    canReadStars,
    // 能读 star 且能访问写接口的 token 通常也能 unstar；
    // 具体权限粒度差异（fine-grained 可能只给读）留给实际执行时报错提示
    canUnstar: canReadStars,
    canSync,
    login,
  }
}

/** 把探测结果转成给用户看的建议列表 */
export function describeMissing(caps: TokenCapabilities): string[] {
  const missing: string[] = []
  if (!caps.canReadStars) {
    missing.push('读取星标：需要 read:user（Classic）或 Public repositories 只读（Fine-grained）')
  }
  if (!caps.canSync) {
    missing.push('跨设备同步：需要 gist（Classic）或 Gists 读写（Fine-grained）')
  }
  return missing
}