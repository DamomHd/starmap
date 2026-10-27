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
import { t } from '../../lib/i18n'

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
      <h3>{t('account.title')}</h3>

      <div class="account-row">
        <div class="account-id">
          <span class="account-avatar">{(login || '?')[0].toUpperCase()}</span>
          <div>
            <div class="account-login">@{login || t('account.unconnected')}</div>
            <div class="account-sub">{t('account.accountSub')}</div>
          </div>
        </div>
        <button class="ghost small" onClick={handleReconnect} disabled={!token}>
          {t('account.reconnect')}
        </button>
      </div>

      {/* Token */}
      <div class="account-field">
        <span class="account-label">{t('account.tokenLabel')}</span>
        <div class="account-value">
          <code class="token-text">{token ? (showFull ? token : maskToken(token)) : t('account.tokenUnsaved')}</code>
          {token && (
            <button class="link-btn" onClick={() => setShowFull((v) => !v)}>
              {showFull ? t('account.hide') : t('account.show')}
            </button>
          )}
        </div>
      </div>

      {/* 权限状态 */}
      <div class="account-field">
        <span class="account-label">{t('account.permissions')}</span>
        <div class="account-value">
          {checking && <span class="muted">{t('common.loading')}</span>}
          {!checking && caps && (
            <div class="perm-list">
              <Perm ok={caps.canReadUser} label={t('account.permReadUser')} />
              <Perm ok={caps.canReadStars} label={t('account.permReadStars')} />
              <Perm ok={caps.canSync} label={t('account.permGist')} />
              <button class="link-btn" onClick={check}>
                {t('common.refresh')}
              </button>
            </div>
          )}
          {!checking && !caps && <span class="muted">—</span>}
        </div>
      </div>

      <div class="account-actions">
        <a class="ghost small link-out" href={TOKEN_MANAGE_URL} target="_blank" rel="noreferrer">
          GitHub Token ↗
        </a>
        {!confirmForget ? (
          <button class="ghost small danger-text" onClick={() => setConfirmForget(true)}>
            {t('account.forgetToken')}
          </button>
        ) : (
          <span class="confirm-inline">
            <span>{t('account.forgetConfirm')}</span>
            <button class="ghost small danger-text" onClick={handleForget}>
              {t('common.confirm')}
            </button>
            <button class="ghost small" onClick={() => setConfirmForget(false)}>
              {t('common.cancel')}
            </button>
          </span>
        )}
      </div>
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