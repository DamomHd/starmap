/**
 * 登录引导 —— 把「生成 GitHub Token」这件劝退的事拆成可跟随的步骤。
 */

import { useState, useEffect } from 'preact/hooks'
import { probeCapabilities, describeMissing, type TokenCapabilities } from '../../lib/permissions'
import { loadToken, reconnect, saveToken, cleanToken } from '../../lib/oauth'
import { t } from '../../lib/i18n'

type TokenKind = 'fine' | 'classic'

interface Props {
  onConnected: (login: string) => void
}

const LINKS = {
  fine: 'https://github.com/settings/personal-access-tokens/new',
  classic: 'https://github.com/settings/tokens/new?scopes=read:user,gist&description=Starmap',
}

export function LoginGuide({ onConnected }: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0) // 0=选择类型 1=查看步骤 2=粘贴
  const [kind, setKind] = useState<TokenKind>('classic')
  const [pat, setPat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [caps, setCaps] = useState<TokenCapabilities | null>(null)
  const [savedToken, setSavedToken] = useState<string>('')
  const [reconnecting, setReconnecting] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)

  useEffect(() => {
    void loadToken().then((token) => {
      if (token?.access_token) setSavedToken(token.access_token)
    })
  }, [])

  async function quickReconnect() {
    setReconnecting(true)
    setError('')
    try {
      const token = await reconnect()
      if (!token) {
        setSavedToken('')
        setError(t('login.errorNoLocalToken'))
        return
      }
      const result = await probeCapabilities(token)
      if (!result.canReadUser) {
        setError(t('login.errorExpired'))
        return
      }
      onConnected(result.login ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReconnecting(false)
    }
  }

  function choose(k: TokenKind) {
    setKind(k)
    setStep(1)
  }

  async function connect() {
    const raw = pat.trim()
    if (!raw) {
      setError(t('login.errorEmpty'))
      return
    }
    const token = cleanToken(raw)
    setBusy(true)
    setError('')
    setCaps(null)

    try {
      const result = await probeCapabilities(token)
      if (!result.canReadUser) {
        if (result.error === 'BAD_CREDENTIALS') {
          setError(t('login.errorBadCredentials'))
        } else if (result.error === 'FORBIDDEN') {
          setError(t('login.errorForbidden'))
        } else if (result.error === 'NETWORK_ERROR') {
          setError(t('login.errorNetwork'))
        } else {
          setError(t('login.errorInvalid'))
        }
        return
      }

      setCaps(result)

      if (!result.canReadStars) {
        setError(t('login.errorNoStars'))
        return
      }

      // 将校验通过的 token 持久化至 chrome.storage.local，供工作台与所有 API 调用使用
      await saveToken(token)
      setSavedToken(token)

      onConnected(result.login ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const missing = caps ? describeMissing(caps) : []

  // ── 步骤 0：选择 Token 类型 ──
  if (step === 0) {
    return (
      <div class="guide">
        <div class="privacy-line">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm3.78 5.28a.75.75 0 0 0-1.06-1.06L7.25 7.69 5.28 5.72a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0Z"/>
          </svg>
          <span>
            {t('login.privacyLine')}
            <button class="privacy-more" onClick={() => setShowPrivacy((v) => !v)}>
              {showPrivacy ? t('login.privacyCollapse') : t('login.privacyMore')}
            </button>
          </span>
        </div>

        {showPrivacy && (
          <ul class="privacy-list">
            <li>{t('login.privacyPoint1')}</li>
            <li>{t('login.privacyPoint2')}</li>
            <li>{t('login.privacyPoint3')}</li>
            <li>{t('login.privacyPoint4')}</li>
            <li>{t('login.privacyPoint5')}</li>
            <li>{t('login.privacyFeedback', { email: 'sneaker@agent.qq.com' })}</li>
          </ul>
        )}

        {savedToken && (
          <div class="reconnect-banner">
            <div class="reconnect-text">
              <strong>{t('login.reconnectTitle')}</strong>
              <span>{t('login.reconnectDesc')}</span>
            </div>
            <button class="primary reconnect-btn" onClick={quickReconnect} disabled={reconnecting}>
              {reconnecting ? t('login.reconnecting') : t('login.reconnectBtn')}
            </button>
          </div>
        )}

        {error && <div class="error">{error}</div>}

        <p class="guide-lead">{t('login.chooseType')}</p>

        <div class="guide-cards">
          <button class="guide-card recommended" onClick={() => choose('classic')}>
            <div class="guide-card-head">
              <span class="guide-card-title">{t('login.classicTitle')}</span>
              <span class="guide-badge">{t('login.classicBadge')}</span>
            </div>
            <p>{t('login.classicDesc')}</p>
          </button>

          <button class="guide-card" onClick={() => choose('fine')}>
            <div class="guide-card-head">
              <span class="guide-card-title">{t('login.fineTitle')}</span>
            </div>
            <p>{t('login.fineDesc')}</p>
          </button>
        </div>

        <button class="guide-skip" onClick={() => setStep(2)}>
          {t('login.skipToPaste')}
        </button>

        <p class="guide-foot-help">
          {t('login.feedbackFoot')}{' '}
          <a href="mailto:sneaker@agent.qq.com?subject=Starmap%20Feedback">sneaker@agent.qq.com</a>
        </p>
      </div>
    )
  }

  // ── 步骤 1：创建指引 ──
  if (step === 1) {
    return (
      <div class="guide">
        <button class="guide-back" onClick={() => setStep(0)}>
          {t('login.stepBack')}
        </button>
        <h2>{t('login.createTitle', { kind: kind === 'classic' ? 'Classic' : 'Fine-grained' })}</h2>

        <ol class="guide-steps">
          <li>
            <div class="guide-step-body">
              <strong>{t('login.step1Title')}</strong>
              <p>{t('login.step1Desc')}</p>
              <a
                class="guide-link-btn"
                href={LINKS[kind]}
                target="_blank"
                rel="noreferrer"
              >
                {t('login.openGithubBtn')}
              </a>
            </div>
          </li>

          <li>
            <div class="guide-step-body">
              <strong>{t('login.step2Title')}</strong>
              <p>{t('login.step2Desc')}</p>
            </div>
          </li>

          <li>
            <div class="guide-step-body">
              <strong>{t('login.step3Title')}</strong>
              {kind === 'classic' ? (
                <>
                  <p>{t('login.classicPermScopes')}</p>
                  <ul class="guide-perms">
                    <li>{t('login.classicPerm1')}</li>
                    <li>{t('login.classicPerm2')}</li>
                  </ul>
                  <p class="guide-note">
                    {t('login.classicPermNote')}
                  </p>
                </>
              ) : (
                <>
                  <p>{t('login.fineSetup')}</p>
                  <ul class="guide-perms">
                    <li>{t('login.fineAccess')}</li>
                    <li>{t('login.fineAccount')}</li>
                    <li>{t('login.fineRepo')}</li>
                  </ul>
                  <p class="guide-note">{t('login.fineNote')}</p>
                </>
              )}
            </div>
          </li>

          <li>
            <div class="guide-step-body">
              <strong>{t('login.step4Title')}</strong>
              <p>{t('login.step4Desc')}</p>
              <p class="guide-note">{t('login.step4Warn')}</p>
            </div>
          </li>
        </ol>

        <button class="primary" onClick={() => setStep(2)}>
          {t('login.nextToPaste')}
        </button>
      </div>
    )
  }

  // ── 步骤 2：粘贴 ──
  return (
    <div class="guide">
      <button class="guide-back" onClick={() => setStep(0)}>
        {t('login.pasteBack')}
      </button>
      <h2>{t('login.pasteTitle')}</h2>
      <p class="guide-lead">
        {t('login.pasteLead')}
      </p>

      <input
        type="password"
        class="guide-input"
        placeholder={t('login.pastePlaceholder')}
        value={pat}
        onInput={(e) => setPat((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !busy) void connect()
        }}
      />

      {error && <div class="error">{error}</div>}

      {missing.length > 0 && (
        <div class="guide-warn">
          <strong>{t('login.missingWarn')}</strong>
          <ul>
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <button class="guide-relink" onClick={() => setStep(1)}>
            {t('login.recreateBtn')}
          </button>
        </div>
      )}

      <button class="primary" onClick={connect} disabled={busy}>
        {busy ? t('login.pasteConnecting') : t('login.pasteBtn')}
      </button>
    </div>
  )
}
