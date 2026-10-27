/**
 * 清理引擎 —— 自动识别「可以放弃的 star」，但**绝不自动删除**。
 *
 * 设计原则：
 * 1. 只做「建议」，unstar 必须由用户逐条或批量确认后执行。
 * 2. 判定要可解释：每个被标记的 repo 都附带「为什么建议清理」，用户能反驳。
 * 3. 「有注解」= 用户在意的证据，这类一律不建议清理（哪怕它已归档）。
 *
 * 判定信号（纯本地计算，不打 GitHub API）：
 * - archived：仓库已归档，作者不再维护
 * - stale：超过 N 年没有任何 push
 * - untouched：star 了很久（> N 年）但用户从未加标签/备注/收藏 = 从没用过
 */

import type { Repo, Annotation } from './github'

export type CleanupReason = 'archived' | 'stale' | 'untouched' | 'fork' | 'mirror'

/**
 * 各原因的「主因优先级」—— 一个仓库同时命中多条时，归到权重最高的那组。
 *
 * 为什么必须归一：如果同时是 fork 又 2 年没更新，分组展示时若两组都出现，
 * 用户会以为这是两个不同的仓库，或者担心勾两次会重复操作。
 *
 * 排序依据「这个理由有多确定它该被清理」：
 * - 已归档：作者明确放弃，最确定
 * - 镜像：原仓库都在 GitHub 上，副本纯冗余
 * - Fork：通常是「当时想改点什么」但没碰过
 * - 长期不更新：可能是已完成项目，不一定该删
 * - 从没用过：只是「你没用过」，不代表它不好
 */
const REASON_WEIGHT: Record<CleanupReason, number> = {
  archived: 5,
  mirror: 4,
  fork: 3,
  stale: 2,
  untouched: 1,
}

/** 取一条建议的主因 */
export function primaryReason(s: CleanupSuggestion): CleanupReason {
  let best: CleanupReason = s.reasons[0]
  for (const r of s.reasons) {
    if (REASON_WEIGHT[r] > REASON_WEIGHT[best]) best = r
  }
  return best
}

/** 分组后的结果，按权重从高到低排列 */
export interface CleanupGroup {
  reason: CleanupReason
  /** 该组的仓库全名列表 */
  repos: string[]
  /** 完整建议（UI 要展示描述等） */
  suggestions: CleanupSuggestion[]
}

/**
 * 按主因把建议分组。
 * 每个仓库只出现在一个组里（归到权重最高的原因）。
 */
export function groupByReason(suggestions: CleanupSuggestion[]): CleanupGroup[] {
  const buckets = new Map<CleanupReason, CleanupSuggestion[]>()
  for (const s of suggestions) {
    const key = primaryReason(s)
    const arr = buckets.get(key)
    if (arr) arr.push(s)
    else buckets.set(key, [s])
  }

  return [...buckets.entries()]
    .map(([reason, list]) => ({
      reason,
      repos: list.map((s) => s.repo.full_name),
      suggestions: list,
    }))
    .sort((a, b) => REASON_WEIGHT[b.reason] - REASON_WEIGHT[a.reason])
}

export interface CleanupSuggestion {
  repo: Repo
  reasons: CleanupReason[]
  /** 人类可读的说明，UI 上直接展示 */
  explain: string
}

export interface CleanupOptions {
  /** 超过多少年没 push 算「死仓库」 */
  staleYears: number
  /** star 超过多少年且零注解，算「从没用过」 */
  untouchedYears: number
  /** 判定基准时间（注入而非取 Date.now，便于测试） */
  now?: number
}

const DEFAULT_OPTIONS: CleanupOptions = {
  staleYears: 2,
  untouchedYears: 1,
}

const YEAR_MS = 1000 * 60 * 60 * 24 * 365

function yearsAgo(iso: string | undefined, now: number): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return (now - t) / YEAR_MS
}

/**
 * 分析 star 列表，产出清理建议。
 *
 * 关键：有注解（标签/备注/收藏任一）的 repo 直接跳过 —— 用户已经表达过在意。
 */
export function suggestCleanup(
  repos: Repo[],
  annotations: Record<string, Annotation>,
  options: Partial<CleanupOptions> = {},
): CleanupSuggestion[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const now = opts.now ?? Date.now()
  const out: CleanupSuggestion[] = []

  for (const repo of repos) {
    const ann = annotations[String(repo.id)]
    const hasSignal = Boolean(ann && (ann.tags.length > 0 || ann.note.trim()))
    // 用户标注过就是在意，不碰
    if (hasSignal) continue

    const reasons: CleanupReason[] = []
    const parts: string[] = []

    if (repo.archived) {
      reasons.push('archived')
      parts.push('仓库已归档')
    }

    const pushAge = yearsAgo(repo.pushed_at, now)
    if (pushAge != null && pushAge >= opts.staleYears) {
      reasons.push('stale')
      parts.push(`已 ${Math.floor(pushAge)} 年无更新`)
    }

    const starAge = yearsAgo(repo.starred_at, now)
    if (starAge != null && starAge >= opts.untouchedYears) {
      reasons.push('untouched')
      parts.push(`收藏 ${Math.floor(starAge)} 年从未标注`)
    }

    // fork / 镜像是最容易堆积成垃圾的两类：
    // fork 通常是「当时想改点什么」但再也没碰，镜像则是「原仓库都在这了还留个副本」
    if (repo.fork) {
      reasons.push('fork')
      parts.push('Fork 的仓库')
    }
    if (repo.mirror_url) {
      reasons.push('mirror')
      parts.push('镜像仓库')
    }

    if (reasons.length > 0) {
      out.push({
        repo,
        reasons,
        explain: parts.join('、'),
      })
    }
  }

  // 建议越「该清」越靠前：归档 > 镜像 > Fork > 死仓库 > 从没用过
  // 同级别按 star 数升序（星少的先清）
  const weight: Record<CleanupReason, number> = {
    archived: 5,
    mirror: 4,
    fork: 3,
    stale: 2,
    untouched: 1,
  }
  out.sort((a, b) => {
    const wa = Math.max(...a.reasons.map((r) => weight[r]))
    const wb = Math.max(...b.reasons.map((r) => weight[r]))
    return wb - wa || a.repo.stargazers_count - b.repo.stargazers_count
  })
  return out
}