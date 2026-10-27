/**
 * 注解编辑器 —— 工作台和 GitHub 星标页共用的编辑 UI。
 *
 * 抽出来的理由：两处都要「写备注 + 加标签」，如果各写一套，
 * 交互细节（回车加标签、取消回滚、保存语义）迟早会走样。
 *
 * 组件是**纯受控**的：自己不碰存储，只接收初始值、回调提交。
 * 这样工作台和 content script 可以用各自的方式落地存储。
 */

import './annotation-editor.css'
import { useState } from 'preact/hooks'
import { t } from '../lib/i18n'

export interface AnnotationDraft {
  note: string
  tags: string[]
}

interface Props {
  /** 初始值（打开编辑器时的已保存内容） */
  initial: AnnotationDraft
  /** 提交：用户点保存 */
  onSubmit: (draft: AnnotationDraft) => void
  /** 取消：丢弃草稿 */
  onCancel: () => void
  /** 备注输入框占位文案，两处场景可不同 */
  placeholder?: string
}

export function AnnotationEditor({ initial, onSubmit, onCancel, placeholder }: Props) {
  const [note, setNote] = useState(initial.note)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [tagInput, setTagInput] = useState('')

  function addTag() {
    const t = tagInput.trim()
    if (!t) return
    if (!tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t))
  }

  function submit() {
    // 提交时顺带把没确认的输入框内容也算上，避免用户输完标签忘了回车
    const pending = tagInput.trim()
    const finalTags = pending && !tags.includes(pending) ? [...tags, pending] : tags
    onSubmit({ note, tags: finalTags })
  }

  return (
    <div class="bs-editor">
      <textarea
        class="bs-note-input"
        placeholder={placeholder ?? t('content.noteInputPlaceholder')}
        value={note}
        onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
        rows={2}
      />

      {tags.length > 0 && (
        <div class="bs-my-tags">
          {tags.map((t) => (
            <span class="bs-my-tag" key={t}>
              {t}
              <button class="bs-tag-x" type="button" onClick={() => removeTag(t)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div class="bs-tag-add-row">
        <input
          class="bs-tag-input"
          placeholder={t('content.tagsInputPlaceholder')}
          value={tagInput}
          onInput={(e) => setTagInput((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
        />
        <button class="bs-btn bs-btn-ghost" type="button" onClick={addTag}>
          {t('card.addTag')}
        </button>
      </div>

      <div class="bs-editor-actions">
        <button class="bs-btn bs-btn-primary" type="button" onClick={submit}>
          {t('common.save')}
        </button>
        <button class="bs-btn bs-btn-ghost" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}