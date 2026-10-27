/**
 * 注解层 —— 只存「你对 repo 说的话」，不存 repo 全量。
 *
 * 数据形态：以 repo.id 为 key 的字典，存 chrome.storage.local。
 * 为什么用 repo.id 而不是 full_name：repo 改名/转移后 id 不变，标签不会丢。
 *
 * 后续跨设备：这一层正好可以整份塞进 secret Gist 做同步（见 PLAN.md Phase 2）。
 */

import type { Annotation } from './github'

const KEY = 'annotations'

/** 全部注解，形如 { [repoId]: Annotation } */
export async function getAllAnnotations(): Promise<Record<string, Annotation>> {
  const { [KEY]: data } = await chrome.storage.local.get(KEY)
  return data ?? {}
}

export async function getAnnotation(repoId: number): Promise<Annotation | null> {
  const all = await getAllAnnotations()
  return all[String(repoId)] ?? null
}

/**
 * 判断是否「空注解」——抽成唯一判定，避免多处逻辑分叉。
 *
 * 注意：不看 favorite。收藏功能已移除，favorite 只作为历史遗留字段存在，
 * 由 migrateLegacyFavorites() 一次性迁移成 `#收藏` 标签。
 */
function isEmpty(a: Annotation): boolean {
  return a.tags.length === 0 && !a.note.trim()
}

/** 迁移后写入的旧「收藏」对应的标签名 */
export const LEGACY_FAVORITE_TAG = '#收藏'

/**
 * 一次性迁移：把旧数据里的 `favorite: true` 转成 `#收藏` 标签。
 *
 * 为什么需要：收藏功能被移除（与 star 重复），但用户已经标过的收藏不能凭空消失。
 * 转成标签后，这些仓库既能被「我的标签」维度筛出来，也不丢任何信息。
 * 幂等：迁移过的不再有 favorite 字段，重复调用无副作用。
 */
export async function migrateLegacyFavorites(): Promise<number> {
  const all = await getAllAnnotations()
  let migrated = 0
  let changed = false

  for (const [key, ann] of Object.entries(all)) {
    if (ann.favorite === undefined) continue
    changed = true
    const { favorite, ...rest } = ann
    if (favorite && !rest.tags.includes(LEGACY_FAVORITE_TAG)) {
      rest.tags = [...rest.tags, LEGACY_FAVORITE_TAG]
      migrated++
    }
    // 迁移后彻底去掉 favorite 字段
    all[key] = rest
  }

  if (changed) await chrome.storage.local.set({ [KEY]: all })
  return migrated
}

/**
 * 写入串行化队列。
 *
 * 为什么要它：saveAnnotation 是「读全量 → 改一条 → 写全量」的读改写模式。
 * 若两次调用并发（典型场景：用户点收藏后立刻回车加标签），两者会读到同一份旧快照，
 * 后完成的一次把先完成的那次写进去的字段覆盖掉，表现为「刚点亮的星标闪回去 / 标签丢失」。
 * 用一条 promise 链把写操作排队，保证任意时刻只有一个读改写在跑。
 */
let writeChain: Promise<void> = Promise.resolve()

/**
 * 保存一条注解（全量覆盖该 repo 的注解，空注解则删除）。
 * 写操作串行执行，避免并发覆盖。
 */
export function saveAnnotation(a: Annotation): Promise<void> {
  const task = writeChain.then(async () => {
    const all = await getAllAnnotations()
    if (isEmpty(a)) {
      delete all[String(a.repo_id)]
    } else {
      all[String(a.repo_id)] = a
    }
    await chrome.storage.local.set({ [KEY]: all })
  })
  // 队列吞掉错误：一条写失败不应阻塞后续所有写入
  writeChain = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

/**
 * 按字段增量更新一条注解。
 *
 * 与 saveAnnotation 的区别：只改传入的字段，其余字段沿用库里最新值。
 * 这是给「用户连续做多个小操作」准备的——每个操作只声明自己改了什么，
 * 就不会因为持有过时的整条快照而覆盖别人的字段。
 */
export function patchAnnotation(
  repoId: number,
  patch: Partial<Omit<Annotation, 'repo_id'>>,
  fullName?: string,
): Promise<Annotation> {
  // 注意：这里必须让**每次调用持有自己的结果**（task 闭包内返回），
  // 不能把结果塞进外层共享变量——否则排队的第二次调用会覆盖第一次的结果，
  // 导致先完成的调用拿到后一个操作的注解（读到自己没写的值）。
  const task = writeChain.then(async (): Promise<Annotation> => {
    const all = await getAllAnnotations()
    const prev: Annotation = all[String(repoId)] ?? {
      repo_id: repoId,
      tags: [],
      note: '',
    }
    // 只保留 tags / note 两个可写字段；不透传 favorite（已废弃）
    const next: Annotation = {
      repo_id: repoId,
      tags: patch.tags ?? prev.tags,
      note: patch.note ?? prev.note,
      // 冗余存全名，让星标页注入不依赖 star-cache
      full_name: patch.full_name ?? prev.full_name ?? fullName,
      // 每次写入都打时间戳，跨设备合并时用它判断谁更新
      updatedAt: Date.now(),
    }
    if (isEmpty(next)) {
      delete all[String(repoId)]
    } else {
      all[String(repoId)] = next
    }
    await chrome.storage.local.set({ [KEY]: all })
    return next
  })
  // 队列本身只关心「上一个写完了」，吞掉错误避免一条失败卡死整条链
  writeChain = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

/**
 * 整批替换注解（用于从 Gist 拉取覆盖本地）。
 * 走同一条写队列，避免与正在进行的单条写入交错。
 */
export function replaceAllAnnotations(next: Record<string, Annotation>): Promise<void> {
  const task = writeChain.then(async () => {
    await chrome.storage.local.set({ [KEY]: next })
  })
  writeChain = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

/** 批量读，用于列表渲染时一次性把注解读上来（避免每个卡片各查一次） */
export async function loadAnnotationsFor(repoIds: number[]): Promise<Record<string, Annotation>> {
  const all = await getAllAnnotations()
  const out: Record<string, Annotation> = {}
  for (const id of repoIds) {
    if (all[String(id)]) out[String(id)] = all[String(id)]
  }
  return out
}