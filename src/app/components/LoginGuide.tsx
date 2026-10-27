/**
 * 登录引导 —— 把「生成 GitHub Token」这件劝退的事拆成可跟随的步骤。
 *
 * 设计原则：
 * 1. **每一步只做一件事**，不让用户在一屏里面对所有信息
 * 2. **直达链接**，别让用户自己找入口（GitHub 设置层级很深）
 * 3. **说清"不勾会怎样"**，而不是干巴巴列权限名
 * 4. 老用户可以直接跳到最后一步粘贴，不强制走完流程
 * 5. 粘贴后**自动探测权限**，缺什么当场告诉用户
 */

import { useState, useEffect } from 'preact/hooks'
import { probeCapabilities, describeMissing, type TokenCapabilities } from '../../lib/permissions'
import { loadToken, reconnect } from '../../lib/oauth'

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
  /** 本地是否存着上次用过的 token（断开连接后仍在） */
  const [savedToken, setSavedToken] = useState<string>('')
  const [reconnecting, setReconnecting] = useState(false)
  /** 隐私承诺详情是否展开 */
  const [showPrivacy, setShowPrivacy] = useState(false)

  useEffect(() => {
    void loadToken().then((t) => {
      if (t?.access_token) setSavedToken(t.access_token)
    })
  }, [])

  /** 用已保存的 token 一键重连，不用去 GitHub 重新生成 */
  async function quickReconnect() {
    setReconnecting(true)
    setError('')
    try {
      const t = await reconnect()
      if (!t) {
        setSavedToken('')
        setError('本地没有可用的 Token')
        return
      }
      const result = await probeCapabilities(t)
      if (!result.canReadUser) {
        setError('保存的 Token 已失效（可能被你在 GitHub 上撤销了），请重新创建')
        return
      }
      onConnected(result.login ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReconnecting(false)
    }
  }

  /** 选择 token 类型后进入步骤页 */
  function choose(k: TokenKind) {
    setKind(k)
    setStep(1)
  }

  /** 校验并连接 */
  async function connect() {
    if (!pat.trim()) {
      setError('请先粘贴 Token')
      return
    }
    setBusy(true)
    setError('')
    setCaps(null)

    try {
      const result = await probeCapabilities(pat)
      if (!result.canReadUser) {
        setError('Token 无效或已过期。请确认复制完整，且创建时没有过期。')
        return
      }

      setCaps(result)

      // 连最基本的能力都没有，不让他进
      if (!result.canReadStars) {
        setError('这个 Token 缺少读取星标的权限，无法使用。请按上面的步骤重新创建。')
        return
      }

      // 有基本能力就放行；缺同步权限的只做提示，不阻塞
      await chrome.storage.local.set({ token: { access_token: pat.trim() } })
      onConnected(result.login ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const missing = caps ? describeMissing(caps) : []

  // ── 步骤 0：选择类型 ──
  if (step === 0) {
    return (
      <div class="guide">
        <h2>连接 GitHub</h2>

        {/*
         * 隐私承诺：一行说清，详情按需展开。
         *
         * 之前把四条承诺全铺在最前面——用户还没决定要不要用，就先被灌 200 字。
         * 信任要第一时间给，但不该用篇幅换：一行讲完核心，想细看的自己展开。
         */}
        <div class="privacy-line">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm3.78 5.28a.75.75 0 0 0-1.06-1.06L7.25 7.69 5.28 5.72a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0Z"/>
          </svg>
          <span>
            没有服务器，数据不离开你和 GitHub
            <button class="privacy-more" onClick={() => setShowPrivacy((v) => !v)}>
              {showPrivacy ? '收起' : '了解详情'}
            </button>
          </span>
        </div>

        {showPrivacy && (
          <ul class="privacy-list">
            <li>没有任何后端、数据库或代理，所有请求直接发往 <code>api.github.com</code></li>
            <li>Token 只存在本机浏览器，不上传、不中转</li>
            <li>标签和备注存在本地 + 你自己账号下的 Secret Gist（可关闭）</li>
            <li>无统计、无追踪、无第三方 SDK</li>
            <li>随时可在 GitHub 撤销 Token，撤销后插件立刻失效</li>
            <li>遇到问题可联系反馈邮箱：<code>sneaker@agent.qq.com</code></li>
          </ul>
        )}

        {/* 本地还存着上次用过的 token → 直接重连，不用重新创建 */}
        {savedToken && (
          <div class="reconnect-banner">
            <div class="reconnect-text">
              <strong>检测到已保存的 Token</strong>
              <span>用上次的 Token 直接连接，不需要再去 GitHub 创建</span>
            </div>
            <button class="primary reconnect-btn" onClick={quickReconnect} disabled={reconnecting}>
              {reconnecting ? '连接中…' : '一键重连'}
            </button>
          </div>
        )}

        {error && <div class="error">{error}</div>}

        <p class="guide-lead">选择一种 Token 类型开始：</p>

        <div class="guide-cards">
          <button class="guide-card recommended" onClick={() => choose('classic')}>
            <div class="guide-card-head">
              <span class="guide-card-title">Classic Token</span>
              <span class="guide-badge">推荐 · 更简单</span>
            </div>
            <p>只需勾选 2 个权限，创建快。适合绝大多数人。</p>
          </button>

          <button class="guide-card" onClick={() => choose('fine')}>
            <div class="guide-card-head">
              <span class="guide-card-title">Fine-grained Token</span>
            </div>
            <p>权限更细、更安全，但需要多选几步。适合在意权限范围的人。</p>
          </button>
        </div>

        <button class="guide-skip" onClick={() => setStep(2)}>
          我已经有 Token 了，直接粘贴 →
        </button>

        <p class="guide-foot-help">
          遇到问题或有建议？欢迎反馈：
          <a href="mailto:sneaker@agent.qq.com?subject=Starmap%20插件反馈">sneaker@agent.qq.com</a>
        </p>
      </div>
    )
  }

  // ── 步骤 1：创建指引 ──
  if (step === 1) {
    return (
      <div class="guide">
        <button class="guide-back" onClick={() => setStep(0)}>
          ← 换个类型
        </button>
        <h2>创建 {kind === 'classic' ? 'Classic' : 'Fine-grained'} Token</h2>

        <ol class="guide-steps">
          <li>
            <div class="guide-step-body">
              <strong>打开创建页面</strong>
              <p>下面这个链接会直接跳到 GitHub 的创建页，并预设好需要的权限。</p>
              <a
                class="guide-link-btn"
                href={LINKS[kind]}
                target="_blank"
                rel="noreferrer"
              >
                打开 GitHub 创建页 ↗
              </a>
            </div>
          </li>

          <li>
            <div class="guide-step-body">
              <strong>填写基本信息</strong>
              <p>
                <code>Note</code> 随便写，比如 <code>Starmap</code>；
                <code>Expiration</code> 建议选 90 天。
              </p>
            </div>
          </li>

          <li>
            <div class="guide-step-body">
              <strong>勾选权限</strong>
              {kind === 'classic' ? (
                <>
                  <p>在 Scopes 里勾选这两项：</p>
                  <ul class="guide-perms">
                    <li><code>read:user</code> —— 读取你的基本信息（必需）</li>
                    <li><code>gist</code> —— 跨设备同步标签和备注</li>
                  </ul>
                  <p class="guide-note">
                    还需要能取消 star（清理功能）？再勾 <code>public_repo</code>。
                    不勾也能用，只是清理时会失败。
                  </p>
                </>
              ) : (
                <>
                  <p>这个类型分几处设置：</p>
                  <ul class="guide-perms">
                    <li>
                      <strong>Repository access</strong> → 选 <code>Public repositories (read-only)</code>
                    </li>
                    <li>
                      <strong>Account permissions</strong> → 找到 <code>Gists</code> 设为
                      <code>Read and write</code>
                    </li>
                    <li>
                      <strong>Repository permissions</strong> → 找到 <code>Starring</code> 设为
                      <code>Read and write</code>（清理功能需要）
                    </li>
                  </ul>
                  <p class="guide-note">没找到 Starring？它是仓库级权限，需要展开权限列表找。</p>
                </>
              )}
            </div>
          </li>

          <li>
            <div class="guide-step-body">
              <strong>生成并复制</strong>
              <p>点最下面的 <code>Generate token</code>，复制形如 <code>ghp_...</code> 的字符串。</p>
              <p class="guide-note">⚠️ 这个字符串只显示一次，关掉页面就再也看不到了。</p>
            </div>
          </li>
        </ol>

        <button class="primary" onClick={() => setStep(2)}>
          我创建好了，去粘贴 →
        </button>
      </div>
    )
  }

  // ── 步骤 2：粘贴 ──
  return (
    <div class="guide">
      <button class="guide-back" onClick={() => setStep(0)}>
        ← 返回
      </button>
      <h2>粘贴 Token</h2>
      <p class="guide-lead">
        把刚才复制的字符串粘贴到这里。Token 只保存在你的浏览器本地。
      </p>

      <input
        type="password"
        class="guide-input"
        placeholder="ghp_... 或 github_pat_..."
        value={pat}
        onInput={(e) => setPat((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !busy) void connect()
        }}
      />

      {error && <div class="error">{error}</div>}

      {missing.length > 0 && (
        <div class="guide-warn">
          <strong>连接成功，但部分功能不可用：</strong>
          <ul>
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <button class="guide-relink" onClick={() => setStep(1)}>
            重新创建 Token
          </button>
        </div>
      )}

      <button class="primary" onClick={connect} disabled={busy}>
        {busy ? '校验中…' : '连接 GitHub'}
      </button>
    </div>
  )
}