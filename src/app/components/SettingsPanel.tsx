/**
 * 设置面板 —— 隔离两个关注点：
 * 1. 星标页注入开关（让用户控制 GitHub 页面被改动的程度）
 * 2. Gist 跨设备同步
 *
 * 原本只有「同步」面板，现在合并为「设置」，避免顶栏按钮越堆越多。
 */

import { useState, useEffect } from 'preact/hooks'
import type { Annotation } from '../../lib/github'
import type { Settings } from '../../lib/settings'
import { pushToGist, pullFromGist } from '../../lib/gist'
import { AccountSection } from './AccountSection'

interface SyncState {
  lastPushAt: number
  ok: boolean
  error?: string
}

/** 把时间戳格式化成「3 分钟前」这种相对时间 */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
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

/** 主题选项。放在模块级，避免每次渲染重建数组导致子组件无谓重渲染 */
const THEME_OPTIONS: Array<{ value: Settings['theme']; label: string; desc: string }> = [
  { value: 'system', label: '跟随系统', desc: '随电脑的亮暗自动切换' },
  { value: 'light', label: '亮色', desc: '始终使用亮色' },
  { value: 'dark', label: '暗色', desc: '始终使用暗色' },
]

/** 只挑布尔型设置项——theme 不是开关，单独渲染 */
type BooleanSettingKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never
}[keyof Settings]

const INJECT_ITEMS: Array<{ key: BooleanSettingKey; label: string; desc: string }> = [
  {
    key: 'showBanner',
    label: '顶部横条',
    desc: '在星标列表上方显示一条 Starmap 提示栏',
  },
  {
    key: 'showFloatButton',
    label: '悬浮按钮',
    desc: '在页面右下角显示圆形入口按钮',
  },
  {
    key: 'showAnnotations',
    label: '仓库条目里的标签与备注',
    desc: '把你写的标签和备注直接显示在 GitHub 星标列表的每个仓库下方',
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
    if (!confirm(`将把本地 ${count} 条注解覆盖到 Gist，远端原有内容会丢失。继续？`)) return
    setBusy('push')
    setErr('')
    setMsg('')
    try {
      const r = await pushToGist(annotations)
      setMsg(r === 'created' ? '已创建 Gist 并推送完成' : '已推送到 Gist')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  async function handlePull() {
    if (!confirm('将从 Gist 拉取并覆盖本地注解，本地未推送的修改会丢失。继续？')) return
    setBusy('pull')
    setErr('')
    setMsg('')
    try {
      const remote = await pullFromGist()
      if (!remote) {
        setMsg('远端还没有数据')
        return
      }
      await onPulled(remote)
      setMsg(`已拉取 ${Object.keys(remote).length} 条注解`)
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
          <h2>设置</h2>
          <button class="sync-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/*
         * 双列布局：之前单列纵向堆 5 个区块，480px 宽且超出屏幕高度。
         *
         * 分组依据是**高度均衡**而非功能分类——第一版按「身份 / 行为」分，
         * 结果左列只有 2 个区块、右列 3 个，左列下方空一大片，更难看。
         *
         * 现在：左列放「账户 + 星标页开关」（都偏"配置"），
         * 右列放「外观 + 同步」（都偏"行为"），两边高度接近。
         */}
        <div class="settings-grid">
          <div class="settings-col">
            {/* 账户：身份、Token、权限 */}
            <AccountSection login={login} onReconnect={onReconnect} onForget={onForget} />

        {/* 星标页注入开关 */}
        <section class="settings-section">
          <h3>GitHub 星标页</h3>
          <p class="hint tiny">控制 Starmap 在你 GitHub 页面上显示多少内容。改动立即生效，无需刷新。</p>
          {INJECT_ITEMS.map(({ key, label, desc }) => (
            <label class="setting-row" key={key}>
              <div class="setting-text">
                <span class="setting-label">{label}</span>
                <span class="setting-desc">{desc}</span>
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
              <h3>外观</h3>
              <div class="theme-picker">
                {THEME_OPTIONS.map(({ value, label, desc }) => (
                  <button
                    key={value}
                    class={settings.theme === value ? 'theme-opt active' : 'theme-opt'}
                    onClick={() => onToggle({ theme: value })}
                  >
                    <span class="theme-opt-label">{label}</span>
                    <span class="theme-opt-desc">{desc}</span>
                  </button>
                ))}
              </div>
              <p class="hint tiny">只影响工作台。星标页跟随 GitHub 自己的主题。</p>
            </section>

        {/* Gist 同步 */}
        <section class="settings-section">
          <h3>跨设备同步</h3>
          <p class="hint tiny">
            标签和备注可存到你自己的 <strong>Secret Gist</strong>。需要 Token 勾选 <code>gist</code> 权限。
          </p>

          <label class="setting-row">
            <div class="setting-text">
              <span class="setting-label">自动同步</span>
              <span class="setting-desc">
                改完 5 秒后自动推送；打开时自动拉取并按修改时间合并，不会覆盖你更新的内容
              </span>
            </div>
            <input
              type="checkbox"
              class="switch"
              checked={settings.autoSync}
              onChange={(e) => onToggle({ autoSync: (e.target as HTMLInputElement).checked })}
            />
          </label>

          <p class="sync-stat">
            本地共有 <strong>{count}</strong> 条注解
            {syncState && (
              <span class={syncState.ok ? 'sync-ok' : 'sync-fail'}>
                {' · '}
                {syncState.ok ? `上次同步 ${relativeTime(syncState.lastPushAt)}` : '上次同步失败'}
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
              {busy === 'push' ? '推送中…' : '↑ 推送到 Gist'}
            </button>
            <button class="ghost wide" onClick={handlePull} disabled={busy !== ''}>
              {busy === 'pull' ? '拉取中…' : '↓ 从 Gist 拉取'}
            </button>
          </div>
          <p class="hint tiny">推送 = 本地覆盖远端；拉取 = 远端覆盖本地。</p>
        </section>

            {/* 安全说明放在最后：它是"回顾性"信息，用户日常不需要看 */}
            <section class="settings-section">
              <h3>关于隐私</h3>
              <ul class="privacy-list compact">
                <li>没有自建服务器 —— 所有请求直接发往 <code>api.github.com</code></li>
                <li>Token 只存在本机浏览器，不上传</li>
                <li>标签和备注存在本地 + 你自己的 Secret Gist</li>
                <li>无统计、无追踪、无第三方 SDK</li>
              </ul>
              <p class="hint tiny">
                完整隐私政策见扩展目录下的 <code>PRIVACY.md</code>
              </p>
            </section>

            {/* 反馈与支持 */}
            <section class="settings-section">
              <h3>反馈与支持</h3>
              <p class="hint tiny">
                遇到问题、改进建议或有功能诉求，欢迎联系开发者：
              </p>
              <div class="feedback-card">
                <a
                  class="feedback-email"
                  href="mailto:sneaker@agent.qq.com?subject=Starmap%20插件反馈"
                  title="点击发送反馈邮件"
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
                  title="复制邮箱地址"
                >
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}