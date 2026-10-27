/**
 * 账户区 —— 让用户随时确认「我现在用的是什么身份、这个 token 能干什么」。
 *
 * 解决三个具体痛点：
 * 1. 退出后不知道 token 在哪 → 保留 token，一键重连
 * 2. 不确定用的是哪个 token → 脱敏展示首尾字符
 * 3. 不确定权限够不够 → 实时探测并逐项显示
 */

import { useState, useEffect } from 'preact/hooks'
import { loadToken, forgetToken, reconnect } from '../../lib/oauth'
import { probeCapabilities, type TokenCapabilities } from '../../lib/permissions'

interface Props {
  login: string
  onReconnect: (login: string) => void
  onForget: () => void
}

/** 把 token 变成 ghp_1a2b...wxyz 的形式：能确认是哪一条，又不泄漏 */
function maskToken(t: string): string {
  if (t.length <= 12) return '••••••••'
  return `${t.slice(0, 7)}…${t.slice(-4)}`
}

const TOKEN_MANAGE_URL = 'https://github.com/settings/tokens'

export function AccountSection({ login, onReconnect, onForget }: Props) {
  const [token, setToken] = useState<string>('')
  const [caps, setCaps] = useState<TokenCapabilities | null>(null)
  const [checking, setChecking] = useState(false)
  const [showFull, setShowFull] = useState(false)
  const [confirmForget, setConfirmForget] = useState(false)

  useEffect(() => {
    void loadToken().then((t) => setToken(t?.access_token ?? ''))
  }, [])

  useEffect(() => {
    if (token) void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function check() {
    if (!token) return
    setChecking(true)
    try {
      setCaps(await probeCapabilities(token))
    } finally {
      setChecking(false)
    }
  }

  async function handleReconnect() {
    const t = await reconnect()
    if (t) {
      const c = await probeCapabilities(t)
      onReconnect(c.login ?? login)
    }
  }

  async function handleForget() {
    await forgetToken()
    setToken('')
    setCaps(null)
    setConfirmForget(false)
    onForget()
  }

  return (
    <section class="settings-section">
      <h3>账户</h3>

      <div class="account-row">
        <div class="account-id">
          <span class="account-avatar">{(login || '?')[0].toUpperCase()}</span>
          <div>
            <div class="account-login">@{login || '未连接'}</div>
            <div class="account-sub">GitHub 账号</div>
          </div>
        </div>
        <button class="ghost small" onClick={handleReconnect} disabled={!token}>
          重新连接
        </button>
      </div>

      {/* Token */}
      <div class="account-field">
        <span class="account-label">Token</span>
        <div class="account-value">
          <code class="token-text">{token ? (showFull ? token : maskToken(token)) : '（未保存）'}</code>
          {token && (
            <button class="link-btn" onClick={() => setShowFull((v) => !v)}>
              {showFull ? '隐藏' : '显示'}
            </button>
          )}
        </div>
      </div>

      {/* 权限状态 */}
      <div class="account-field">
        <span class="account-label">权限</span>
        <div class="account-value">
          {checking && <span class="muted">检测中…</span>}
          {!checking && caps && (
            <div class="perm-list">
              <Perm ok={caps.canReadUser} label="读取账号" />
              <Perm ok={caps.canReadStars} label="读取星标" />
              <Perm ok={caps.canSync} label="跨设备同步" />
              <button class="link-btn" onClick={check}>
                重新检测
              </button>
            </div>
          )}
          {!checking && !caps && <span class="muted">—</span>}
        </div>
      </div>

      <div class="account-actions">
        <a class="ghost small link-out" href={TOKEN_MANAGE_URL} target="_blank" rel="noreferrer">
          去 GitHub 管理 Token ↗
        </a>
        {!confirmForget ? (
          <button class="ghost small danger-text" onClick={() => setConfirmForget(true)}>
            移除 Token
          </button>
        ) : (
          <span class="confirm-inline">
            <span>移除后需重新创建，确定？</span>
            <button class="ghost small danger-text" onClick={handleForget}>
              确定移除
            </button>
            <button class="ghost small" onClick={() => setConfirmForget(false)}>
              取消
            </button>
          </span>
        )}
      </div>

      <p class="hint tiny">
        「重新连接」会用已保存的 Token，不需要重新去 GitHub 创建。
        只有点「移除 Token」才会真正删除。
      </p>
    </section>
  )
}

function Perm({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span class={ok ? 'perm ok' : 'perm no'}>
      {ok ? '✓' : '✕'} {label}
    </span>
  )
}