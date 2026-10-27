/**
 * 单个仓库卡片。
 *
 * 状态设计（重要）：
 * - 阅读态**全部读 props.annotation**，不维护自己的副本 —— 避免「本地 state 和库不同步」。
 * - 编辑态维护草稿（note/tags 的本地 state），**只有点「保存」才提交**。
 *   取消 = 丢弃草稿，不产生任何写入。
 * - 收藏是独立的小操作，点一下立即生效（走 patch 增量更新，不会覆盖其他字段）。
 *
 * 注解是「用户自己的话」，与 GitHub 自带 topic 视觉区分：
 * 主题用蓝色胶囊，我的标签用金色。
 */

import { useState } from 'preact/hooks'
import type { Repo, Annotation } from '../../lib/github'
import type { Dimension } from '../../lib/cluster'
import { AnnotationEditor, type AnnotationDraft } from '../../components/AnnotationEditor'

interface Props {
  repo: Repo
  annotation?: Annotation
  onTagClick: (dim: Dimension, value: string) => void
  /** 增量更新：只改传入的字段 */
  onPatch: (repoId: number, patch: Partial<Omit<Annotation, 'repo_id'>>) => void
}

export function RepoCard({ repo, annotation, onTagClick, onPatch }: Props) {
  const [editing, setEditing] = useState(false)

  // 阅读态直接从 props 派生，永远与库一致
  const tags = annotation?.tags ?? []

  function handleSubmit(draft: AnnotationDraft) {
    onPatch(repo.id, { note: draft.note, tags: draft.tags })
    setEditing(false)
  }

  return (
    <div class="repo-card">
      <div class="repo-head">
        <a href={repo.html_url} target="_blank" rel="noreferrer" class="repo-name" title={repo.full_name}>
          {repo.full_name}
        </a>
        {repo.archived && <span class="badge archived">已归档</span>}
      </div>

      {repo.description && <p class="repo-desc">{repo.description}</p>}

      <div class="repo-meta">
        {repo.language && (
          <button class="meta-btn lang" onClick={() => onTagClick('language', repo.language!)} title="按此语言过滤">
            {repo.language}
          </button>
        )}
        <span class="stars">★ {repo.stargazers_count.toLocaleString()}</span>
      </div>

      {/* GitHub 自带 topic */}
      {repo.topics.length > 0 && (
        <div class="repo-topics">
          {repo.topics.slice(0, 6).map((t) => (
            <button key={t} class="topic-tag" onClick={() => onTagClick('topic', t)} title="按此主题过滤">
              {t}
            </button>
          ))}
        </div>
      )}

      {/* 阅读态：我的备注 */}
      {!editing && annotation?.note && (
        <div class="my-note">
          <span class="note-icon">✎</span>
          {annotation.note}
        </div>
      )}

      {/* 阅读态：我的标签 */}
      {!editing && tags.length > 0 && (
        <div class="my-tags">
          {tags.map((t) => (
            <span key={t} class="my-tag">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* 编辑态：复用共享组件 */}
      {editing ? (
        <AnnotationEditor
          initial={{ note: annotation?.note ?? '', tags: annotation?.tags ?? [] }}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button class="edit-trigger" onClick={() => setEditing(true)}>
          {annotation?.note || tags.length > 0 ? '编辑备注' : '✎ 记一笔'}
        </button>
      )}
    </div>
  )
}