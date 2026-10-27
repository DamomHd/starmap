import test from 'node:test'
import assert from 'node:assert/strict'
import { en } from '../src/lib/i18n/locales/en.ts'
import { zhCN } from '../src/lib/i18n/locales/zh-CN.ts'
import { resolveLocale, t, setLocale, formatRelativeTime } from '../src/lib/i18n/index.ts'

function getDeepKeys(obj, prefix = '') {
  let keys = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...getDeepKeys(v, full))
    } else {
      keys.push(full)
    }
  }
  return keys
}

test('i18n: 中英文字典键名完全一致无缺失', () => {
  const enKeys = getDeepKeys(en).sort()
  const zhKeys = getDeepKeys(zhCN).sort()
  assert.deepEqual(enKeys, zhKeys, '英文和中文的字典键集合必须 100% 对齐')
})

test('i18n: resolveLocale 支持 auto、en 和 zh-CN', () => {
  assert.equal(resolveLocale('en'), 'en')
  assert.equal(resolveLocale('zh-CN'), 'zh-CN')
  // auto 探测
  assert.equal(resolveLocale('auto'), 'en')
})

test('i18n: t() 参数正确替换', () => {
  setLocale('en')
  assert.equal(t('topbar.starCount', { count: 42 }), '42 stars')

  setLocale('zh-CN')
  assert.equal(t('topbar.starCount', { count: 42 }), '42 个星标')
})

test('i18n: formatRelativeTime 相对时间格式化', () => {
  const now = Date.now()

  // 刚刚
  assert.equal(formatRelativeTime(now - 10000, 'zh-CN'), '刚刚')
  assert.equal(formatRelativeTime(now - 10000, 'en'), 'just now')

  // 分钟
  const fiveMinAgo = now - 5 * 60 * 1000
  const zhMin = formatRelativeTime(fiveMinAgo, 'zh-CN')
  const enMin = formatRelativeTime(fiveMinAgo, 'en')
  assert.ok(zhMin.includes('5') || zhMin.includes('分钟'), `zhMin: ${zhMin}`)
  assert.ok(enMin.includes('5') || enMin.includes('minute'), `enMin: ${enMin}`)
})
