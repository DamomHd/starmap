/**
 * 仓库类型筛选 —— 对齐 GitHub 星标页原生的 "Type" 下拉。
 *
 * 为什么不复用 cluster.ts 的维度机制：
 * 主题/语言/作者/年份/我的标签是「分类」（一个仓库可以属于多个），
 * 而类型是「互斥属性」（一个仓库要么是 fork 要么不是）。
 * 混在一起会让「我的标签」这类多值维度的语义变模糊，所以单独一层。
 *
 * 参考 GitHub 原生选项：All / Public / Private / Sources / Forks /
 * Can be sponsored / Mirrors / Templates。
 * 这里去掉 "Can be sponsored"（需要额外 API 字段，且跟 star 管理关系不大）。
 */

import type { Repo } from './github'

export type RepoType = 'all' | 'public' | 'private' | 'source' | 'fork' | 'mirror' | 'template'

export const REPO_TYPE_OPTIONS: Array<{ value: RepoType; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'public', label: '公开' },
  { value: 'private', label: '私有' },
  { value: 'source', label: '原创' },
  { value: 'fork', label: 'Fork' },
  { value: 'mirror', label: '镜像' },
  { value: 'template', label: '模板' },
]

/**
 * 判断仓库是否属于某个类型。
 *
 * 「原创」的定义：不是 fork、不是镜像、不是模板——
 * 对应 GitHub 的 "Sources"。注意 GitHub 上 source 和 fork 是互斥的。
 */
export function isType(repo: Repo, type: RepoType): boolean {
  switch (type) {
    case 'all':
      return true
    case 'public':
      return repo.private !== true
    case 'private':
      return repo.private === true
    case 'source':
      return !repo.fork && !repo.mirror_url && !repo.is_template
    case 'fork':
      return repo.fork === true
    case 'mirror':
      return Boolean(repo.mirror_url)
    case 'template':
      return repo.is_template === true
  }
}

/** 按类型筛选 */
export function filterByType(repos: Repo[], type: RepoType): Repo[] {
  if (type === 'all') return repos
  return repos.filter((r) => isType(r, type))
}

/**
 * 统计各类型数量，用于在下拉里显示 "Fork (12)" 这种提示。
 * 返回的顺序与 REPO_TYPE_OPTIONS 一致。
 */
export function countByType(repos: Repo[]): Map<RepoType, number> {
  const counts = new Map<RepoType, number>()
  for (const opt of REPO_TYPE_OPTIONS) {
    counts.set(opt.value, repos.filter((r) => isType(r, opt.value)).length)
  }
  return counts
}