import { defineManifest } from '@crxjs/vite-plugin'

declare const process: { env: Record<string, string | undefined> }

/**
 * Starmap — MV3 manifest
 *
 * 架构：点击工具栏图标 → background 打开整页工作台（app/index.html）。
 * 不再使用 default_popup，因为 popup 只有 420px 宽，撑不下大库浏览体验。
 * `key` 字段固定本地开发时的扩展 id，便于调试。
 */
export default defineManifest({
  manifest_version: 3,
  name: '__MSG_appName__',
  version: '0.1.0',
  description: '__MSG_appDesc__',
  default_locale: 'en',
  author: {
    email: 'sneaker@agent.qq.com',
  },
  // 本地开发时固定扩展 ID，生产打包自动剔除（Chrome Web Store 上架禁止包含 key 字段）
  ...(process.env.NODE_ENV !== 'production' && {
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs/+SR2wcnhPH3TIff+55YmKVNoKjog/gK0LnL0ftgTrVBEX4e2c5ZFyzRZrpbn1lel+vBY5E74PN41dtAn4xJ2MuE6MHRuvmWOsp+wh5F97dWk61nC1MVDAONexZaYRVQAKbXpvtRCGSM+xjQ66EYXzTxdn9Rs7GCxaKqjzGzq5hBGSuFWqSkaA8vanHslrKRlqGC/llOrf9fr3fYSdyMA58yi4JDEE2NwFEaZupZTtJIMhVBZHt3uVsJWYonH92VPmIgoMOuaqny3rOBgtBIcavl08mevCEtOFB+gME1Y3VNJBpZ2DGIZx7B6Ob7DKwb1C8h9Kpy6b3y6r9w5SykwIDAQAB',
  }),
  permissions: ['storage'],
  host_permissions: ['https://api.github.com/*', 'https://github.com/*'],
  /**
   * 图标：16/32px 用简化版（四角星），48/128px 用完整星座连线图。
   * 16 像素放不下连线细节，等比缩小会糊成一团——所以分尺寸重新设计，
   * 这是专业图标集的标准做法（macOS/iOS 也都这么做）。
   */
  icons: {
    16: 'icon-16.png',
    32: 'icon-32.png',
    48: 'icon-48.png',
    128: 'icon-128.png',
  },
  // 点击图标时不弹 popup，由 background 打开整页工作台
  action: {
    default_title: '__MSG_actionTitle__',
    default_icon: {
      16: 'icon-16.png',
      32: 'icon-32.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  /**
   * 星标页原位增强：在 github.com 的个人页注入入口。
   * 只限定 profile 路由，不侵入其他 GitHub 页面。
   */
  content_scripts: [
    {
      // 只匹配个人页（星标页是 /{user}?tab=stars）。
      // 注意：星标页的 URL 参数不在 match pattern 里，所以只能匹配到个人页根路径，
      // 由脚本内的 isStarsPage() 再做一次 URL 参数判断。
      matches: ['https://github.com/*'],
      exclude_matches: [
        'https://github.com/*/*',
        'https://github.com/*/*/*',
        'https://github.com/settings/*',
        'https://github.com/notifications*',
      ],
      js: ['src/content/inject-stars.ts', 'src/content/inject-annotations.ts'],
      run_at: 'document_idle',
    },
  ],
  // 工作台页面需要在扩展上下文外可被打开（从 GitHub 星标页快捷打开）
  web_accessible_resources: [
    {
      resources: ['src/app/index.html', 'assets/*'],
      matches: ['https://github.com/*'],
    },
  ],
})