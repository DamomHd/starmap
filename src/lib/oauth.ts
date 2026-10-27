/**
 * 认证模块 —— 用用户自己粘贴的 PAT（Personal Access Token）。
 *
 * 为什么不用 OAuth + PKCE？GitHub 的 OAuth 在「授权码换 token」这一步强制要求
 * client_secret（GitHub 不区分 public/confidential client），纯前端无法安全持有 secret，
 * 所以零后端场景下 OAuth 走不通。详见 PLAN.md 的调研记录。
 *
 * PAT 方案：用户在 GitHub 生成一个有 read:user 权限的 fine-grained / classic token，
 * 粘贴到插件里，存在 chrome.storage.local。token 不离开本机。
 */

export interface StoredToken {
  access_token: string
  /** 用户主动退出后置为 true；token 本身仍保留，便于重新连接 */
  disconnected?: boolean
}

/** 校验 token 是否有效：调 /user，成功则输出用户名 */
export async function validateToken(token: string): Promise<{ login: string }> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? 'Token 无效或已过期，请检查是否复制完整、以及是否有 read:user 权限'
        : `校验失败：HTTP ${res.status}`,
    )
  }
  return res.json()
}

/** 保存 token 到本地 */
export async function saveToken(token: string): Promise<void> {
  await chrome.storage.local.set({ token: { access_token: token.trim() } })
}

/**
 * 读取 token。
 *
 * 注意「已断开」的 token 仍会返回 —— 因为星标页的展示和编辑不依赖用户主动连接，
 * 突然抽走会让页面上已渲染的标签凭空消失，体验很怪。
 * 需要判断"用户是否在使用工作台"的地方请用 isDisconnected()。
 */
export async function loadToken(): Promise<StoredToken | null> {
  const { token } = await chrome.storage.local.get('token')
  return token ?? null
}

/**
 * 退出登录（**保留 token**）。
 *
 * 为什么不像常见做法那样直接删掉：
 * 用户退出后往往只是想暂时不用，过几天回来发现得重新去 GitHub 生成 token ——
 * 而 GitHub 上的 token 一旦关掉页面就看不到了，等于「退出一次就永久丢失」。
 *
 * 所以这里只打标记，token 留在本地。真正要清除请用 forgetToken()。
 */
export async function logout(): Promise<void> {
  await chrome.storage.local.set({ token: { ...((await loadToken()) ?? { access_token: '' }), disconnected: true } })
}

/** 彻底移除 token（换设备、怀疑泄露时用；之后必须重新创建） */
export async function forgetToken(): Promise<void> {
  await chrome.storage.local.remove('token')
}

/** 是否处于「已断开」状态（token 还在，但用户主动退出了） */
export async function isDisconnected(): Promise<boolean> {
  const t = await loadToken()
  return Boolean(t?.disconnected)
}

/** 用已保存的 token 直接重连（不需要用户重新粘贴） */
export async function reconnect(): Promise<string | null> {
  const t = await loadToken()
  if (!t?.access_token) return null
  await chrome.storage.local.set({ token: { access_token: t.access_token } })
  return t.access_token
}