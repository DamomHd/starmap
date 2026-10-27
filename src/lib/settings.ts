/**
 * 用户设置 —— 控制星标页注入的各个部分。
 *
 * 为什么拆成多个开关而不做一个总开关：
 * 用户对「页面被改动」的容忍度差异很大。
 * 有人只想要入口（悬浮按钮），嫌横条占地方；有人只想要标签，不要任何入口。
 * 拆细了每种偏好都能满足，实现成本也一样低。
 *
 * 存储：chrome.storage.local，key = 'settings'
 */

export interface Settings {
  /** 星标页顶部横条 */
  showBanner: boolean
  /** 星标页右下角悬浮按钮 */
  showFloatButton: boolean
  /** 在星标页的仓库条目里显示标签/备注 */
  showAnnotations: boolean
  /**
   * 自动同步到 Gist：改完自动推（防抖 5 秒），打开时自动拉取合并。
   * 默认开启——手动同步根本不算「跨设备」，只是「能搬一次」。
   */
  autoSync: boolean
  /**
   * 工作台主题。只影响工作台（星标页注入跟随 GitHub 自己的主题）：
   * - 'system' 跟随系统
   * - 'light' / 'dark' 手动固定
   */
  theme: 'system' | 'light' | 'dark'
}

export const DEFAULT_SETTINGS: Settings = {
  showBanner: true,
  showFloatButton: true,
  showAnnotations: true,
  autoSync: true,
  theme: 'system',
}

const KEY = 'settings'

/** 读取设置（缺失字段用默认值补齐，兼容旧版本数据） */
export async function getSettings(): Promise<Settings> {
  const { [KEY]: saved } = await chrome.storage.local.get(KEY)
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
}

/** 更新部分设置字段 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  await chrome.storage.local.set({ [KEY]: next })
  return next
}

/**
 * 把主题应用到当前文档。
 *
 * 实现：在 <html> 上设置 data-theme。
 * - 'system' → 移除属性（CSS 基线是亮色，媒体查询负责系统暗色）
 * - 'light'  → 设为 'light'（CSS 里显式排除，防止被系统暗色覆盖）
 * - 'dark'   → 设为 'dark'
 *
 * 为什么不在 CSS 里用三态选择器搞定：
 * 「system」状态下要让媒体查询生效，而「light」状态下要屏蔽媒体查询，
 * 这需要 `:not([data-theme='light'])` 这类写法，容易写错且难读。
 * JS 直接表态更清晰。
 */
export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}