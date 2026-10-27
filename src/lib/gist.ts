/**
 * Secret Gist 同步 —— 把「注解层」（标签/备注/收藏）存到用户自己的私有 Gist，
 * 实现跨设备同步。零后端，借的就是 GitHub 现成存储。
 *
 * 当前版本：手动 Push / Pull。
 * 为什么先手动：自动双向同步需要字段级时间戳 + 合并规则，否则两台机器同时改会静默丢数据。
 * 手动推送让用户明确知道「现在以哪边为准」，先验证需求再做自动。
 */

import type { Annotation } from './github'

/**
 * ⚠️ Gist 文件名**不能改**。
 *
 * 它是识别「哪个 Gist 是 Starmap 建的」的唯一依据：
 * 用户已有的 Gist 里就是叫 better-stars-annotations.json，
 * 改名后找不到旧文件 → 会新建一个空的 → 看起来像数据全丢了。
 * 产品改名前就有的数据必须继续能读。
 */
const GIST_FILENAME = 'better-stars-annotations.json'
const GIST_DESC = 'Starmap - 我的 GitHub 星标注解（标签/备注）'
const GIST_ID_KEY = 'gist-id'

/** 远端的 Gist 内容结构 */
interface GistPayload {
  version: 1
  /** 最近一次推送时间，仅作人类可读标记，不参与合并 */
  lastPushedAt: string
  annotations: Record<string, Annotation>
}

interface GistApiFile {
  content?: string
  raw_url?: string
}

interface GistApi {
  id: string
  files: Record<string, GistApiFile>
}

async function token(): Promise<string> {
  const { token } = await chrome.storage.local.get('token')
  const t = token?.access_token
  if (!t) throw new Error('未登录 GitHub')
  return t
}

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await token()
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${t}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401) throw new Error('Token 无效，请重新连接')
  if (res.status === 404) throw new Error('Gist 不存在（可能已被删除）')
  if (res.status === 403) {
    throw new Error('权限不足：请确认 Token 勾选了 gist 权限')
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gist API ${res.status}: ${detail.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

/** 记住当前使用的 gist id，避免每次重新查找 */
async function getGistId(): Promise<string | null> {
  const { [GIST_ID_KEY]: id } = await chrome.storage.local.get(GIST_ID_KEY)
  return id ?? null
}

async function setGistId(id: string): Promise<void> {
  await chrome.storage.local.set({ [GIST_ID_KEY]: id })
}

/**
 * 找到本插件创建的那个 Gist。
 * 先查本地记住的 id，没有就翻用户 Gist 列表找描述匹配的（处理换设备场景）。
 */
async function findGist(): Promise<string | null> {
  const known = await getGistId()
  if (known) return known

  const gists = await gh<GistApi[]>('/gists?per_page=100')
  const found = gists.find((g) => g.files[GIST_FILENAME])
  if (found) {
    await setGistId(found.id)
    return found.id
  }
  return null
}

function buildPayload(annotations: Record<string, Annotation>): string {
  const payload: GistPayload = {
    version: 1,
    lastPushedAt: new Date().toISOString(),
    annotations,
  }
  // 格式化输出，让用户在 GitHub 上直接看 Gist 也读得懂
  return JSON.stringify(payload, null, 2)
}

/**
 * 推送到 Gist：有 Gist 就更新，没有就创建。
 * ⚠️ 这是「覆盖式」推送 —— 远端会被本地完全覆盖。
 */
export async function pushToGist(annotations: Record<string, Annotation>): Promise<'created' | 'updated'> {
  const content = buildPayload(annotations)
  const existing = await findGist()

  if (existing) {
    await gh(`/gists/${existing}`, {
      method: 'PATCH',
      body: JSON.stringify({
        description: GIST_DESC,
        files: { [GIST_FILENAME]: { content } },
      }),
    })
    return 'updated'
  }

  const created = await gh<GistApi>('/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: GIST_DESC,
      public: false, // secret gist：不公开列出，但持有链接者可见
      files: { [GIST_FILENAME]: { content } },
    }),
  })
  await setGistId(created.id)
  return 'created'
}

/**
 * 从 Gist 拉取注解。
 * 返回 null 表示远端还没有数据（首次使用）。
 */
export async function pullFromGist(): Promise<Record<string, Annotation> | null> {
  const id = await findGist()
  if (!id) return null

  const gist = await gh<GistApi>(`/gists/${id}`)
  const file = gist.files[GIST_FILENAME]
  if (!file) return null

  // Gist 详情接口在小文件时会内联 content；大文件要再请求 raw_url
  let raw = file.content
  if (!raw && file.raw_url) {
    const res = await fetch(file.raw_url)
    if (!res.ok) throw new Error('读取 Gist 内容失败')
    raw = await res.text()
  }
  if (!raw) return null

  const parsed = JSON.parse(raw) as GistPayload
  // 兜底：格式不对就当没有数据，避免把脏数据写进本地
  if (!parsed || typeof parsed !== 'object' || !parsed.annotations) return null
  return parsed.annotations
}

/** 断开与 Gist 的关联（本地记住的 id 清掉，Gist 本身保留） */
export async function disconnectGist(): Promise<void> {
  await chrome.storage.local.remove(GIST_ID_KEY)
}

/** 给界面看：当前是否已连上某个 Gist */
export async function getGistStatus(): Promise<{ id: string | null }> {
  return { id: await findGist() }
}