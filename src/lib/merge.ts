/**
 * 注解合并 —— 跨设备同步的核心。
 *
 * 规则（注解级时间戳）：
 * - 只在一边存在 → 直接用
 * - 两边都有 → 取 updatedAt 更新的那条
 * - 两边 updatedAt 相同或缺失 → 保守处理，保留本地（不主动覆盖用户当前状态）
 *
 * 为什么以「整条注解」为单位而不是字段级：
 * 用户改标签和改备注通常一起发生。字段级合并会出现「标签来自 A 设备、备注来自 B 设备」
 * 的四不像。整条取新，语义是「谁的版本更新用谁的」，符合直觉。
 *
 * 已知代价：如果 A 设备只改备注、B 设备只改标签，后改的那条会覆盖另一条。
 * 手动同步（Push/Pull）仍然可用，作为用户主动控制的兜底。
 */

import type { Annotation } from './github'

export interface MergeResult {
  /** 合并后的完整注解集 */
  merged: Record<string, Annotation>
  /** 从远端新增到本地的条数 */
  added: number
  /** 远端版本更新、覆盖了本地的条数 */
  updated: number
  /** 本地版本更新、保持不动的条数 */
  keptLocal: number
  /** 合并结果是否与本地不同（决定要不要写回本地） */
  changed: boolean
}

function isNewer(remote: Annotation, local: Annotation): boolean {
  const r = remote.updatedAt ?? 0
  const l = local.updatedAt ?? 0
  // 严格大于才算远端更新；相等或都缺失则保留本地
  return r > l
}

/** 合并本地与远端注解 */
export function mergeAnnotations(
  local: Record<string, Annotation>,
  remote: Record<string, Annotation>,
): MergeResult {
  const merged: Record<string, Annotation> = { ...local }
  let added = 0
  let updated = 0
  let keptLocal = 0

  for (const [key, remoteAnn] of Object.entries(remote)) {
    const localAnn = local[key]

    if (!localAnn) {
      merged[key] = remoteAnn
      added++
      continue
    }

    if (isNewer(remoteAnn, localAnn)) {
      merged[key] = remoteAnn
      updated++
    } else {
      keptLocal++
    }
  }

  const changed = added > 0 || updated > 0
  return { merged, added, updated, keptLocal, changed }
}