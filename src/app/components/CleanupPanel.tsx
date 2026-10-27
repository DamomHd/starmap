/**
 * 清理面板 —— 按类别分组展示清理建议，让用户分类别勾选。
 *
 * 为什么分组而不是一个平铺列表：
 * 用户对各类原因的信任度完全不同——
 *   · 镜像/Fork  → 基本是冗余，很多人愿意整组清掉
 *   · 已归档     → 分情况，有些归档项目仍有参考价值
 *   · 长期不更新 → 可能是稳定完成的项目，不该无脑清
 * 平铺列表逼用户逐个判断 200 条，实际结果是一键全选或者干脆不用。
 *
 * 安全设计（仍然保留）：
 * 1. 默认一个都不勾，必须主动选
 * 2. 执行前二次确认，明确「不可撤销」
 * 3. 逐条执行、单独捕获失败，不装作全成功
 * 4. 有注解的 repo 不出现（由 cleanup.ts 保证）
 */

import { useState, useMemo } from 'preact/hooks'
import { groupByReason, type CleanupSuggestion, type CleanupReason } from '../../lib/cleanup'

interface Props {
  suggestions: CleanupSuggestion[]
  onConfirm: (repos: string[]) => Promise<{ ok: number; failed: string[] }>
  onClose: () => void
}

const REASON_LABEL: Record<CleanupReason, string> = {
  archived: '已归档',
  mirror: '镜像仓库',
  fork: 'Fork 的仓库',
  stale: '长期不更新',
  untouched: '从没用过',
}

/** 每组的说明：告诉用户「为什么这组可以放心清」或「要小心」 */
const REASON_DESC: Record<CleanupReason, string> = {
  archived: '作者已明确不再维护该仓库',
  mirror: 'GitHub 上已有原始仓库，镜像纯属冗余副本',
  fork: '通常是当时想改点什么，之后没再碰过',
  stale: '两年以上没有任何提交，可能已停止维护',
  untouched: '你收藏了很久但从未标注或使用',
}

/** 组的风险提示色：越「确定该清」越安全 */
const REASON_TONE: Record<CleanupReason, 'safe' | 'caution'> = {
  archived: 'safe',
  mirror: 'safe',
  fork: 'safe',
  stale: 'caution',
  untouched: 'caution',
}

export function CleanupPanel({ suggestions, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ ok: number; failed: string[] } | null>(null)
  const [err, setErr] = useState('')

  const groups = useMemo(() => groupByReason(suggestions), [suggestions])

  function toggle(name: string) {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelected(next)
  }

  /** 整组勾选/取消 */
  function toggleGroup(repos: string[]) {
    const allSelected = repos.every((r) => selected.has(r))
    const next = new Set(selected)
    for (const r of repos) {
      if (allSelected) next.delete(r)
      else next.add(r)
    }
    setSelected(next)
  }

  async function execute() {
    if (selected.size === 0) return
    const names = [...selected]
    if (
      !confirm(
        `即将取消 ${names.length} 个仓库的 star。\n\n此操作不可撤销，需要重新 star 才能恢复。\n\n确认继续？`,
      )
    )
      return

    setRunning(true)
    setErr('')
    try {
      const r = await onConfirm(names)
      setResult(r)
      setSelected(new Set())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div class="sync-overlay" onClick={onClose}>
      <div class="sync-panel cleanup-panel" onClick={(e) => e.stopPropagation()}>
        <div class="sync-head">
          <h2>清理建议</h2>
          <button class="sync-close" onClick={onClose}>
            ×
          </button>
        </div>

        <p class="hint small">
          发现 <strong>{suggestions.length}</strong> 个可能不再需要的 star，按原因分成了
          {groups.length} 组。已标注备注/标签的仓库不会被列入。
        </p>

        {err && <div class="error">{err}</div>}

        {result && (
          <div class="sync-msg">
            已取消 {result.ok} 个 star
            {result.failed.length > 0 &&
              `，${result.failed.length} 个失败：${result.failed.join('、')}`}
          </div>
        )}

        {suggestions.length === 0 ? (
          <p class="hint" style="text-align:center;padding:20px 0">
            没有需要清理的仓库 👍
          </p>
        ) : (
          <>
            <div class="cleanup-groups">
              {groups.map((g) => {
                const allSelected = g.repos.every((r) => selected.has(r))
                const someSelected = g.repos.some((r) => selected.has(r))
                return (
                  <section class="cleanup-group" key={g.reason}>
                    {/* 组头：整组勾选 */}
                    <label class="cleanup-group-head">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          // 部分选中显示为 indeterminate（原生中间的横线态）
                          if (el) el.indeterminate = someSelected && !allSelected
                        }}
                        onChange={() => toggleGroup(g.repos)}
                      />
                      <div class="cleanup-group-title">
                        <span class="cleanup-group-name">
                          {REASON_LABEL[g.reason]}
                          <span class="cleanup-group-count">{g.repos.length}</span>
                        </span>
                        <span class="cleanup-group-desc">{REASON_DESC[g.reason]}</span>
                      </div>
                      <span class={`cleanup-tone ${REASON_TONE[g.reason]}`}>
                        {REASON_TONE[g.reason] === 'safe' ? '较安全' : '请留意'}
                      </span>
                    </label>

                    {/* 组内仓库：默认折叠，避免一次铺开 200 条 */}
                    <details class="cleanup-group-body">
                      <summary>展开查看这 {g.repos.length} 个仓储</summary>
                      <div class="cleanup-list">
                        {g.suggestions.map(({ repo, explain }) => (
                          <label class="cleanup-row" key={repo.id}>
                            <input
                              type="checkbox"
                              checked={selected.has(repo.full_name)}
                              onChange={() => toggle(repo.full_name)}
                            />
                            <div class="cleanup-info">
                              <a
                                href={repo.html_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {repo.full_name}
                              </a>
                              <span class="cleanup-explain">{explain}</span>
                            </div>
                            <span class="stars">★ {repo.stargazers_count.toLocaleString()}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                  </section>
                )
              })}
            </div>
          </>
        )}

        <div class="cleanup-footer">
          <span class="cleanup-selected">
            {selected.size > 0 ? `已选 ${selected.size} 个` : '尚未选择'}
          </span>
          <button
            class="primary danger"
            onClick={execute}
            disabled={selected.size === 0 || running}
          >
            {running ? '处理中…' : `取消 ${selected.size} 个 star`}
          </button>
        </div>
        <p class="hint tiny">取消 star 不可撤销，请确认后再操作。</p>
      </div>
    </div>
  )
}
