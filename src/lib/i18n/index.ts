import { en } from './locales/en.ts'
import { zhCN } from './locales/zh-CN.ts'
import type { I18nKey, LocaleDict, SupportedLocale } from './types.ts'
import type { Settings } from '../settings'

export type { I18nKey, SupportedLocale }

const DICTS: Record<SupportedLocale, LocaleDict> = {
  en,
  'zh-CN': zhCN,
}

let currentLocale: SupportedLocale = 'en'

/** 根据用户设置或系统环境解析语言 */
export function resolveLocale(setting?: Settings['language']): SupportedLocale {
  if (setting === 'zh-CN' || setting === 'en') {
    return setting
  }
  // 'auto' 或未设置：探测浏览器环境
  try {
    const sys = (
      typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function'
        ? chrome.i18n.getUILanguage()
        : typeof navigator !== 'undefined'
          ? navigator.language
          : 'en'
    ).toLowerCase()
    if (sys.startsWith('zh')) return 'zh-CN'
  } catch {
    // 降级使用英文
  }
  return 'en'
}

/** 设置当前运行时的语言 */
export function setLocale(locale: SupportedLocale): void {
  currentLocale = locale
}

/** 获取当前运行时的语言 */
export function getLocale(): SupportedLocale {
  return currentLocale
}

/** 翻译指定键并插入参数 */
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const parts = key.split('.')
  let current: any = DICTS[currentLocale] ?? en

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      // 降级到英文
      let fallback: any = en
      for (const p of parts) {
        if (fallback && typeof fallback === 'object' && p in fallback) {
          fallback = fallback[p]
        } else {
          return key
        }
      }
      current = fallback
      break
    }
  }

  if (typeof current !== 'string') return key

  if (params) {
    return current.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
  }

  return current
}

/**
 * 相对时间格式化（使用现代浏览器原生 Intl.RelativeTimeFormat，零依赖）
 */
export function formatRelativeTime(ts: number, locale: SupportedLocale = currentLocale): string {
  const diffMs = ts - Date.now()
  const diffSec = Math.round(diffMs / 1000)

  if (Math.abs(diffSec) < 45) {
    const dict = DICTS[locale] ?? en
    return dict.common.justNow
  }

  try {
    const rtf = new Intl.RelativeTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en', {
      numeric: 'auto',
    })

    const diffMin = Math.round(diffSec / 60)
    if (Math.abs(diffMin) < 60) {
      return rtf.format(diffMin, 'minute')
    }

    const diffHour = Math.round(diffMin / 60)
    if (Math.abs(diffHour) < 24) {
      return rtf.format(diffHour, 'hour')
    }

    const diffDay = Math.round(diffHour / 24)
    if (Math.abs(diffDay) < 30) {
      return rtf.format(diffDay, 'day')
    }

    const diffMonth = Math.round(diffDay / 30)
    if (Math.abs(diffMonth) < 12) {
      return rtf.format(diffMonth, 'month')
    }

    const diffYear = Math.round(diffDay / 365)
    return rtf.format(diffYear, 'year')
  } catch {
    // 降级基础算式
    const absMin = Math.floor(Math.abs(diffSec) / 60)
    if (locale === 'zh-CN') {
      if (absMin < 60) return `${absMin} 分钟前`
      const h = Math.floor(absMin / 60)
      if (h < 24) return `${h} 小时前`
      return `${Math.floor(h / 24)} 天前`
    } else {
      if (absMin < 60) return `${absMin}m ago`
      const h = Math.floor(absMin / 60)
      if (h < 24) return `${h}h ago`
      return `${Math.floor(h / 24)}d ago`
    }
  }
}
