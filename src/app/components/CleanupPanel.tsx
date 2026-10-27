/**
 * 清理面板 —— 按类别分组展示清理建议，让用户分类别勾选。
 */

import { useState, useMemo } from 'preact/hooks'
import { groupByReason, type CleanupSuggestion, type CleanupReason } from '../../lib/cleanup'
import { t } from '../../lib/i18n'

interface Props {
  suggestions: CleanupSuggestion[]
  onConfirm: (repos: string[]) => Promise<{ ok: number; failed: string[] }>
  onClose: () => void
}

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

  function getReasonLabel(reason: CleanupReason): string {
    switch (reason) {
      case 'archived':
        return t('cleanup.archivedTitle')
      case 'mirror':
        return t('cleanup.mirrorTitle')
      case 'fork':
        return t('cleanup.forkTitle')
      case 'stale':
        return t('cleanup.staleTitle')
      case 'untouched':
        return t('cleanup.untouchedTitle')
    }
  }

  function getReasonDesc(reason: CleanupReason): string {
    switch (reason) {
      case 'archived':
        return t('cleanup.archivedDesc')
      case 'mirror':
        return t('cleanup.mirrorDesc')
      case 'fork':
        return t('cleanup.forkDesc')
      case 'stale':
        return t('cleanup.staleDesc')
      case 'untouched':
        return t('cleanup.untouchedDesc')
    }
  }

  function toggle(name: string) {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelected(next)
  }

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
    if (!confirm(t('cleanup.confirmMsg', { count: names.length }))) {
      return
    }

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
          <h2>{t('cleanup.title')}</h2>
          <button class="sync-close" onClick={onClose}>
            ×
          </button>
        </div>

        <p class="hint small">
          {t('cleanup.subtitle')}
        </p>

        {err && <div class="error">{err}</div>}

        {result && (
          <div class="sync-msg">
            {t('cleanup.successMsg', { count: result.ok })}
            {result.failed.length > 0 &&
              ` (${result.failed.length} failed: ${result.failed.join(', ')})`}
          </div>
        )}

        {suggestions.length === 0 ? (
          <p class="hint" style="text-align:center;padding:20px 0">
            {t('cleanup.empty')}
          </p>
        ) : (
          <>
            <div class="cleanup-groups">
              {groups.map((g) => {
                const allSelected = g.repos.every((r) => selected.has(r))
                const someSelected = g.repos.some((r) => selected.has(r))
                return (
                  <section class="cleanup-group" key={g.reason}>
                    <label class="cleanup-group-head">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected && !allSelected
                        }}
                        onChange={() => toggleGroup(g.repos)}
                      />
                      <div class="cleanup-group-title">
                        <span class="cleanup-group-name">
                          {getReasonLabel(g.reason)}
                          <span class="cleanup-group-count">{g.repos.length}</span>
                        </span>
                        <span class="cleanup-group-desc">{getReasonDesc(g.reason)}</span>
                      </div>
                      <span class={`cleanup-tone ${REASON_TONE[g.reason]}`}>
                        {REASON_TONE[g.reason] === 'safe' ? 'Safe' : 'Caution'}
                      </span>
                    </label>

                    <details class="cleanup-group-body">
                      <summary>
                        {allSelected ? t('cleanup.unselectAll') : t('cleanup.selectAll')} ({g.repos.length})
                      </summary>
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
                              {explain && <span class="cleanup-explain">{explain}</span>}
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
            {selected.size > 0
              ? t('cleanup.selectedCount', { count: selected.size })
              : '—'}
          </span>
          <button
            class="primary danger"
            onClick={execute}
            disabled={selected.size === 0 || running}
          >
            {running ? t('common.loading') : t('cleanup.executeBtn', { count: selected.size })}
          </button>
        </div>
      </div>
    </div>
  )
}
