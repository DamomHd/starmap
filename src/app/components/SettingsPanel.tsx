/**
 * 设置面板 —— 隔离多个关注点：
 * 1. 语言设置（系统 / 简体中文 / English）
 * 2. 星标页注入开关
 * 3. 外观设置
 * 4. Gist 跨设备同步
 * 5. 隐私与反馈支持
 */

import { useState, useEffect } from 'preact/hooks'
import type { Annotation } from '../../lib/github'
import type { Settings } from '../../lib/settings'
import { pushToGist, pullFromGist } from '../../lib/gist'
import { AccountSection } from './AccountSection'
import { t, formatRelativeTime, type I18nKey } from '../../lib/i18n'

interface SyncState {
  lastPushAt: number
  ok: boolean
  error?: string
}

interface Props {
  annotations: Record<string, Annotation>
  settings: Settings
  /** 当前登录的 GitHub 用户名 */
  login: string
  onToggle: (patch: Partial<Settings>) => void
  onPulled: (next: Record<string, Annotation>) => Promise<void>
  onReconnect: (login: string) => void
  /** token 被彻底移除后回调（需要退回登录页） */
  onForget: () => void
  onClose: () => void
}

/** 语言选项 */
const LANG_OPTIONS: Array<{ value: Settings['language']; labelKey: I18nKey; descKey: I18nKey }> = [
  { value: 'auto', labelKey: 'settings.langAuto', descKey: 'settings.langAutoDesc' },
  { value: 'zh-CN', labelKey: 'settings.langZh', descKey: 'settings.langZhDesc' },
  { value: 'en', labelKey: 'settings.langEn', descKey: 'settings.langEnDesc' },
]

/** 主题选项 */
const THEME_OPTIONS: Array<{ value: Settings['theme']; labelKey: I18nKey; descKey: I18nKey }> = [
  { value: 'system', labelKey: 'settings.themeSystem', descKey: 'settings.themeSystemDesc' },
  { value: 'light', labelKey: 'settings.themeLight', descKey: 'settings.themeLightDesc' },
  { value: 'dark', labelKey: 'settings.themeDark', descKey: 'settings.themeDarkDesc' },
]

type BooleanSettingKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never
}[keyof Settings]

const INJECT_ITEMS: Array<{ key: BooleanSettingKey; labelKey: I18nKey; descKey: I18nKey }> = [
  {
    key: 'showBanner',
    labelKey: 'settings.showBanner',
    descKey: 'settings.showBannerDesc',
  },
  {
    key: 'showFloatButton',
    labelKey: 'settings.showFloatButton',
    descKey: 'settings.showFloatButtonDesc',
  },
  {
    key: 'showAnnotations',
    labelKey: 'settings.showAnnotations',
    descKey: 'settings.showAnnotationsDesc',
  },
]

export function SettingsPanel({
  annotations,
  settings,
  login,
  onToggle,
  onPulled,
  onReconnect,
  onForget,
  onClose,
}: Props) {
  const [busy, setBusy] = useState<'' | 'push' | 'pull'>('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [copied, setCopied] = useState(false)

  const count = Object.keys(annotations).length

  // 读同步状态，并监听变化（后台推送完成后自动更新）
  useEffect(() => {
    const load = () => {
      chrome.storage.local.get('syncState').then(({ syncState }) => setSyncState(syncState ?? null))
    }
    load()
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.syncState) setSyncState(changes.syncState.newValue ?? null)
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  async function handlePush() {
    if (!confirm(t('settings.pushConfirm', { count }))) return
    setBusy('push')
    setErr('')
    setMsg('')
    try {
      const r = await pushToGist(annotations)
      setMsg(r === 'created' ? t('settings.createdGistSuccess') : t('settings.pushedSuccess'))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  async function handlePull() {
    if (!confirm(t('settings.pullConfirm'))) return
    setBusy('pull')
    setErr('')
    setMsg('')
    try {
      const remote = await pullFromGist()
      if (!remote) {
        setMsg(t('settings.noRemoteData'))
        return
      }
      await onPulled(remote)
      setMsg(t('settings.pulledSuccess', { count: Object.keys(remote).length }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  return (
    <div class="sync-overlay" onClick={onClose}>
      <div class="sync-panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <div class="sync-head">
          <h2>{t('settings.title')}</h2>
          <button class="sync-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div class="settings-grid">
          <div class="settings-col">
            {/* 语言设置 */}
            <section class="settings-section">
              <h3>{t('settings.language')}</h3>
              <p class="hint tiny">{t('settings.languageDesc')}</p>
              <div class="theme-picker">
                {LANG_OPTIONS.map(({ value, labelKey, descKey }) => (
                  <button
                    key={value}
                    class={settings.language === value ? 'theme-opt active' : 'theme-opt'}
                    onClick={() => onToggle({ language: value })}
                  >
                    <span class="theme-opt-label">{t(labelKey)}</span>
                    <span class="theme-opt-desc">{t(descKey)}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* 账户：身份、Token、权限 */}
            <AccountSection login={login} onReconnect={onReconnect} onForget={onForget} />

            {/* 星标页注入开关 */}
            <section class="settings-section">
              <h3>{t('settings.starsSection')}</h3>
              <p class="hint tiny">{t('settings.starsSectionDesc')}</p>
              {INJECT_ITEMS.map(({ key, labelKey, descKey }) => (
                <label class="setting-row" key={key}>
                  <div class="setting-text">
                    <span class="setting-label">{t(labelKey)}</span>
                    <span class="setting-desc">{t(descKey)}</span>
                  </div>
                  <input
                    type="checkbox"
                    class="switch"
                    checked={settings[key]}
                    onChange={(e) => onToggle({ [key]: (e.target as HTMLInputElement).checked })}
                  />
                </label>
              ))}
            </section>
          </div>

          <div class="settings-col">
            {/* 外观 */}
            <section class="settings-section">
              <h3>{t('settings.themeSection')}</h3>
              <div class="theme-picker">
                {THEME_OPTIONS.map(({ value, labelKey, descKey }) => (
                  <button
                    key={value}
                    class={settings.theme === value ? 'theme-opt active' : 'theme-opt'}
                    onClick={() => onToggle({ theme: value })}
                  >
                    <span class="theme-opt-label">{t(labelKey)}</span>
                    <span class="theme-opt-desc">{t(descKey)}</span>
                  </button>
                ))}
              </div>
              <p class="hint tiny">{t('settings.themeDesc')}</p>
            </section>

            {/* Gist 同步 */}
            <section class="settings-section">
              <h3>{t('settings.syncSection')}</h3>
              <p class="hint tiny">{t('settings.syncDesc')}</p>

              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{t('settings.autoSync')}</span>
                  <span class="setting-desc">{t('settings.autoSyncDesc')}</span>
                </div>
                <input
                  type="checkbox"
                  class="switch"
                  checked={settings.autoSync}
                  onChange={(e) => onToggle({ autoSync: (e.target as HTMLInputElement).checked })}
                />
              </label>

              <p class="sync-stat">
                {t('settings.localStat', { count })}
                {syncState && (
                  <span class={syncState.ok ? 'sync-ok' : 'sync-fail'}>
                    {' · '}
                    {syncState.ok ? t('settings.syncOk', { time: formatRelativeTime(syncState.lastPushAt) }) : t('settings.syncFail')}
                  </span>
                )}
              </p>
              {syncState && !syncState.ok && syncState.error && (
                <div class="sync-err-detail">{syncState.error}</div>
              )}

              {err && <div class="error">{err}</div>}
              {msg && <div class="sync-msg">{msg}</div>}

              <div class="sync-actions">
                <button class="primary" onClick={handlePush} disabled={busy !== ''}>
                  {busy === 'push' ? t('settings.pushing') : t('settings.pushBtn')}
                </button>
                <button class="ghost wide" onClick={handlePull} disabled={busy !== ''}>
                  {busy === 'pull' ? t('settings.pulling') : t('settings.pullBtn')}
                </button>
              </div>
              <p class="hint tiny">{t('settings.syncHint')}</p>
            </section>

            {/* 安全说明 */}
            <section class="settings-section">
              <h3>{t('settings.privacySection')}</h3>
              <ul class="privacy-list compact">
                <li>{t('settings.privacyList1')}</li>
                <li>{t('settings.privacyList2')}</li>
                <li>{t('settings.privacyList3')}</li>
                <li>{t('settings.privacyList4')}</li>
              </ul>
              <p class="hint tiny">{t('settings.privacyDocLink')}</p>
            </section>

            {/* 反馈与支持 */}
            <section class="settings-section">
              <h3>{t('settings.feedbackSection')}</h3>
              <p class="hint tiny">{t('settings.feedbackDesc')}</p>
              <div class="feedback-card">
                <a
                  class="feedback-email"
                  href="mailto:sneaker@agent.qq.com?subject=Starmap%20Feedback"
                  title="Email feedback"
                >
                  sneaker@agent.qq.com
                </a>
                <button
                  type="button"
                  class="link-btn feedback-copy"
                  onClick={() => {
                    void navigator.clipboard.writeText('sneaker@agent.qq.com')
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  title="Copy email address"
                >
                  {copied ? t('common.copied') : t('common.copy')}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
