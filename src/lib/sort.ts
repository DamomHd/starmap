/**
 * 排序 —— 让用户控制仓库列表的呈现顺序。
 *
 * 默认按「star 时间倒序」：这最贴合用户心智（"最近收藏的在最前"），
 * 也跟 GitHub 原生星标页的顺序一致，切换过来不会觉得乱。
 */

import type { Repo } from './github'

export type SortKey = 'starred' | 'stars' | 'updated' | 'name'

export const SORT_LABELS: Record<SortKey, string> = {
  starred: '收藏时间',
  stars: 'Star 数',
  updated: '最后更新',
  name: '名称',
}

function ts(iso: string | undefined): number {
  return iso ? new Date(iso).getTime() || 0 : 0
}

/** 返回排序后的新数组（不改原数组） */
export function sortRepos(repos: Repo[], key: SortKey): Repo[] {
  const list = [...repos]
  switch (key) {
    case 'starred':
      // 最近 star 的在最前
      return list.sort((a, b) => ts(b.starred_at) - ts(a.starred_at))
    case 'stars':
      // 热门在前
      return list.sort((a, b) => b.stargazers_count - a.stargazers_count)
    case 'updated':
      // 最近有推送的在前
      return list.sort((a, b) => ts(b.pushed_at) - ts(a.pushed_at))
    case 'name':
      return list.sort((a, b) => a.full_name.localeCompare(b.full_name))
  }
}