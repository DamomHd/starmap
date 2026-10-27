/**
 * Background Service Worker
 *
 * 职责：点击工具栏图标 → 打开整页工作台，复用已打开的那个 tab。
 *
 * 注意权限：chrome.tabs.query({ url }) 需要 "tabs" 权限（会触发「读取浏览历史」的
 * 敏感授权提示），代价太重。这里改用 chrome.storage.session 记住上次打开的 tabId，
 * 只在需要时 update；tab 若已被关闭，update 会抛错，此时再新建。
 * 这样 manifest 只需 storage 权限，用户授权提示最轻。
 */

const APP_PAGE = 'src/app/index.html'
const TAB_KEY = 'app-tab-id'

/** 打开（或聚焦）工作台。供工具栏图标和 content script 共用。 */
async function openApp() {
  const { [TAB_KEY]: tabId } = await chrome.storage.session.get(TAB_KEY)

  // 尝试复用上次打开的 tab
  if (typeof tabId === 'number') {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (tab) {
        await chrome.tabs.update(tabId, { active: true })
        if (tab.windowId != null) {
          await chrome.windows.update(tab.windowId, { focused: true })
        }
        return
      }
    } catch {
      // tab 已关闭，落到下面新建
    }
  }

  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(APP_PAGE) })
  if (tab.id != null) {
    await chrome.storage.session.set({ [TAB_KEY]: tab.id })
  }
}

chrome.action.onClicked.addListener(() => {
  void openApp()
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'OPEN_APP') {
    openApp()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }))
    return true // 保持消息通道开启，等待异步响应
  }
  if (msg?.type === 'ANNOTATION_CHANGED') {
    scheduleBackgroundPush()
    sendResponse({ ok: true })
    return false
  }
  return false
})

// ────────────────────────────────────────────────────────────
// 自动同步兜底
//
// 为什么放在 background 而不是页面里：
// 页面（工作台 / 星标页）关闭时，页面内的防抖定时器会一起消失，
// 用户「改完立刻关页面」的改动就永远推不上去。
// service worker 不随页面关闭，由它持有定时器更可靠。
// ────────────────────────────────────────────────────────────

import { pushToGist } from '../lib/gist'
import { getAllAnnotations } from '../lib/annotations'
import { getSettings } from '../lib/settings'

const PUSH_DEBOUNCE_MS = 5000
let pushTimer: ReturnType<typeof setTimeout> | null = null

/** 安排一次推送（防抖） */
function scheduleBackgroundPush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void runPush()
  }, PUSH_DEBOUNCE_MS)
}

async function runPush() {
  try {
    const settings = await getSettings()
    if (!settings.autoSync) return
    const annotations = await getAllAnnotations()
    if (Object.keys(annotations).length === 0) return // 没有数据不必推

    await pushToGist(annotations)
    // 记录成功时间，供设置面板展示「上次同步」；失败则记下错误供排查
    await chrome.storage.local.set({
      syncState: { lastPushAt: Date.now(), ok: true },
    })
  } catch (e) {
    // 失败不弹窗（不打扰用户），但留下痕迹，设置面板里能看到
    console.warn('[Starmap] 后台自动推送失败', e)
    await chrome.storage.local.set({
      syncState: {
        lastPushAt: Date.now(),
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
    })
  }
}

// 注解变化时也兜底监听一次（防止某些路径忘了发消息）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.annotations) {
    scheduleBackgroundPush()
  }
})

export {}