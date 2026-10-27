/**
 * 关键词检索 —— 基于 MiniSearch 的本地模糊搜索引擎。
 *
 * 为什么用 MiniSearch：
 * - 轻量（~10KB）、零依赖、纯前端；
 * - 支持前缀匹配 + 模糊（typo），比简单字符串 includes 更适合「记不清」场景；
 * - 只在内存建索引，不持久化，repos / 注解变化时重建。
 *
 * 索引范围包含**用户自己的标签和备注**，权重要给高：
 * 用户写下的「想拿来重写表单校验」是他最真实的记忆锚点，比 repo 描述更该被搜到。
 */

import MiniSearch from 'minisearch'
import type { Repo, Annotation } from './github'

/**
 * 索引文档 —— repo 元数据 + 用户的注解合并后的扁平结构。
 * MiniSearch 要求字段是扁平标量/数组，不能嵌套，所以这里拍平。
 */
export interface IndexDoc {
  id: number
  full_name: string
  description: string
  topics: string[]
  language: string
  /** 用户自己打的标签 */
  myTags: string[]
  /** 用户的备注内容 */
  note: string
}

export type SearchIndex = MiniSearch<IndexDoc>

/** 用 repo 列表 + 注解建索引 */
export function buildIndex(
  repos: Repo[],
  annotations: Record<string, Annotation> = {},
): SearchIndex {
  const docs: IndexDoc[] = repos.map((r) => {
    const ann = annotations[String(r.id)]
    return {
      id: r.id,
      full_name: r.full_name,
      description: r.description ?? '',
      topics: r.topics ?? [],
      language: r.language ?? '',
      myTags: ann?.tags ?? [],
      note: ann?.note ?? '',
    }
  })

  const ms = new MiniSearch<IndexDoc>({
    fields: ['full_name', 'description', 'topics', 'language', 'myTags', 'note'],
    storeFields: ['id'],
    searchOptions: {
      // 权重理由：自己的备注/标签 > 仓库名 > topic > 描述 > 语言
      boost: {
        note: 4,
        myTags: 4,
        full_name: 3,
        topics: 2,
        description: 1,
        language: 1,
      },
      prefix: true,
      fuzzy: 0.2,
    },
  })
  ms.addAll(docs)
  return ms
}

/** 搜索，返回命中 repo 的 id 列表（按相关度降序） */
export function searchRepos(index: SearchIndex, query: string): number[] {
  return index.search(query).map((r) => r.id as number)
}