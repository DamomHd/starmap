/**
 * 多维聚类引擎 —— 把 star 列表按不同维度切成「主题簇」。
 *
 * 设计要点：
 * - 纯函数，不依赖 DOM / chrome API，方便单测和迭代。
 * - 不做「一个大混合簇」，而是每个维度独立聚类，UI 上让用户切换视角。
 *   理由：用户「记不清名字但记得那是个 react 库」时，按语言/按 topic 分别看比混合更直觉。
 * - 每个 repo 在某个维度下可能归属 0 个或多个簇（如一个 repo 有多个 topic）。
 */

import type { Repo, Annotation } from './github'
import { t } from './i18n'

/** 支持的聚类维度。myTag 是用户自己打的标签，跟 GitHub topic 分开。 */
export type Dimension = 'topic' | 'language' | 'author' | 'year' | 'myTag'

export const DIMENSION_LABELS: Record<Dimension, string> = {
  topic: '主题',
  language: '语言',
  author: '作者',
  year: '年份',
  myTag: '我的标签',
}

export function getDimensionLabels(): Record<Dimension, string> {
  return {
    topic: t('dimensions.topic'),
    language: t('dimensions.language'),
    author: t('dimensions.author'),
    year: t('dimensions.year'),
    myTag: t('dimensions.myTag'),
  }
}

/** 一个主题簇 */
export interface Cluster {
  /** 簇的标识（如 topic 名、语言名、作者名、年份） */
  key: string
  /** 展示名 */
  label: string
  /** 命中的 repo 数 */
  count: number
  /** 簇内的 repo */
  repos: Repo[]
}

/** 从 full_name 里取作者（owner） */
function ownerOf(repo: Repo): string {
  return repo.full_name.split('/')[0]
}

/** 从 starred_at 里取年份 */
function yearOf(repo: Repo): string | null {
  if (!repo.starred_at) return null
  const y = new Date(repo.starred_at).getUTCFullYear()
  return Number.isFinite(y) ? String(y) : null
}

/**
 * 取出某个 repo 在指定维度下所属的「键」。
 * 注意可能是多个（一个 repo 有多个 topic），也可能是空（如没有 language）。
 *
 * @param annotation 该 repo 的注解，仅 myTag 维度需要
 */
function keysFor(repo: Repo, dim: Dimension, annotation?: Annotation): string[] {
  switch (dim) {
    case 'topic':
      return repo.topics
    case 'language':
      return repo.language ? [repo.language] : []
    case 'author':
      return [ownerOf(repo)]
    case 'year': {
      const y = yearOf(repo)
      return y ? [y] : []
    }
    case 'myTag':
      return annotation?.tags ?? []
  }
}

/**
 * 在某个维度上聚类。
 * @param minCount 最小簇大小：太小的簇默认过滤，避免噪音。传 1 则不过滤。
 * @param annotations 「我的标签」维度需要；其他维度可省略
 */
export function clusterBy(
  repos: Repo[],
  dim: Dimension,
  minCount = 2,
  annotations: Record<string, Annotation> = {},
): Cluster[] {
  const buckets = new Map<string, Repo[]>()
  for (const repo of repos) {
    for (const key of keysFor(repo, dim, annotations[String(repo.id)])) {
      if (!key) continue
      const arr = buckets.get(key)
      if (arr) arr.push(repo)
      else buckets.set(key, [repo])
    }
  }

  const clusters: Cluster[] = []
  for (const [key, list] of buckets) {
    if (list.length < minCount) continue
    clusters.push({
      key,
      label: dim === 'year' ? `${key} 年` : key,
      count: list.length,
      repos: list,
    })
  }

  // 按簇大小降序，让最有分量的簇排前面；年份特殊处理：按时间倒序
  if (dim === 'year') {
    clusters.sort((a, b) => b.key.localeCompare(a.key))
  } else {
    clusters.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  }
  return clusters
}

/**
 * 交叉过滤：给定多个「维度:值」条件，返回同时满足所有条件的 repo。
 * 这是「检索」的核心 —— 例：{topic:'animation', language:'JavaScript'} 只留两者都满足的。
 */
export function crossFilter(
  repos: Repo[],
  conditions: Array<{ dim: Dimension; value: string }>,
  annotations: Record<string, Annotation> = {},
): Repo[] {
  if (conditions.length === 0) return repos
  return repos.filter((repo) =>
    conditions.every(({ dim, value }) =>
      keysFor(repo, dim, annotations[String(repo.id)]).includes(value),
    ),
  )
}