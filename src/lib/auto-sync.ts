/**
 * 自动拉取 —— 打开页面时从 Gist 拉一次并按时间戳合并。
 *
 * 为什么推送不在这里：
 * 推送由 background 负责（见 background/index.ts），因为页面关闭时
 * 页面内的防抖定时器会消失，会把用户"改完立刻关页面"的改动弄丢。
 * 这里只做拉取——它发生在页面打开时，页面一定还活着。
 */

import type { Annotation } from './github'
import { getAllAnnotations, replaceAllAnnotations } from './annotations'
import { pullFromGist } from './gist'
import { mergeAnnotations } from './merge'
import { getSettings } from './settings'

/** 两次自动拉取的最小间隔，避免频繁切页时狂拉 Gist */
const PULL_MIN_INTERVAL_MS = 60 * 1000

let lastPullAt = 0
let pulling = false

/**
 * 拉取并合并。
 *
 * 与手动 Pull 的区别：手动是「远端覆盖本地」；
 * 自动是「按 updatedAt 合并」——不会丢掉本地更新的内容。
 *
 * @returns 合并后的注解集；远端无数据、未开启或失败时返回 null
 */
export async function pullAndMerge(): Promise<Record<string, Annotation> | null> {
  if (pulling) return null
  const settings = await getSettings()
  if (!settings.autoSync) return null

  pulling = true
  try {
    const remote = await pullFromGist()
    if (!remote) return null

    const local = await getAllAnnotations()
    const result = mergeAnnotations(local, remote)
    if (result.changed) {
      await replaceAllAnnotations(result.merged)
    }
    lastPullAt = Date.now()
    return result.merged
  } catch (e) {
    // 静默失败：网络问题不该弹窗打扰
    console.warn('[Starmap] 自动拉取失败', e)
    return null
  } finally {
    pulling = false
  }
}

/** 带节流的拉取：60 秒内重复调用只跑一次 */
export function pullIfStale(): Promise<Record<string, Annotation> | null> {
  if (Date.now() - lastPullAt < PULL_MIN_INTERVAL_MS) return Promise.resolve(null)
  return pullAndMerge()
}
