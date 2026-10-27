/**
 * 变更通知 —— 极轻量的「告诉 background 该同步了」入口。
 *
 * 为什么单独拆一个文件：
 * 页面侧（尤其 content script）只需要发一条消息，
 * 却因此把整个 auto-sync（含合并/拉取/gist 逻辑）打进 bundle，
 * 顺带拖进框架代码。拆开后这个模块没有任何依赖，代价趋近于零。
 */

export function notifyChanged(): void {
  try {
    // background 不可达时静默忽略：这是尽力而为的后台同步，失败不该影响编辑
    void chrome.runtime.sendMessage({ type: 'ANNOTATION_CHANGED' })?.catch?.(() => {})
  } catch {
    // chrome.runtime 在某些上下文不可用，忽略
  }
}