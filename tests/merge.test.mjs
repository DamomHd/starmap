/**
 * 合并逻辑测试 —— 跨设备同步最核心、也最容易悄悄丢数据的地方。
 *
 * 与 src/lib/merge.ts 保持一致。改了那边记得同步改这里
 * （没有引入 vitest/ts，是为了保持零依赖；纯函数逻辑简单，复刻成本低）。
 */
import { test } from 'node:test'
import assert from 'node:assert'

function mergeAnnotations(local, remote) {
  const merged = { ...local }
  let added = 0
  let updated = 0
  let keptLocal = 0

  for (const [key, remoteAnn] of Object.entries(remote)) {
    const localAnn = local[key]
    if (!localAnn) {
      merged[key] = remoteAnn
      added++
      continue
    }
    const r = remoteAnn.updatedAt ?? 0
    const l = localAnn.updatedAt ?? 0
    if (r > l) {
      merged[key] = remoteAnn
      updated++
    } else {
      keptLocal++
    }
  }
  return { merged, added, updated, keptLocal, changed: added > 0 || updated > 0 }
}

const ann = (id, note, updatedAt, tags = []) => ({ repo_id: id, tags, note, updatedAt })

test('远端独有的仓库会被加入', () => {
  const r = mergeAnnotations({}, { '1': ann(1, 'remote', 100) })
  assert.equal(r.merged['1'].note, 'remote')
  assert.equal(r.added, 1)
  assert.equal(r.changed, true)
})

test('本地独有的仓库保持不变', () => {
  const r = mergeAnnotations({ '1': ann(1, 'local', 100) }, {})
  assert.equal(r.merged['1'].note, 'local')
  assert.equal(r.changed, false)
})

test('远端更新的版本会覆盖本地', () => {
  const r = mergeAnnotations({ '1': ann(1, 'old', 100) }, { '1': ann(1, 'new', 200) })
  assert.equal(r.merged['1'].note, 'new')
  assert.equal(r.updated, 1)
})

test('本地更新时保留本地，不覆盖未推送的修改', () => {
  const r = mergeAnnotations({ '1': ann(1, 'new', 200) }, { '1': ann(1, 'old', 100) })
  assert.equal(r.merged['1'].note, 'new')
  assert.equal(r.keptLocal, 1)
  assert.equal(r.changed, false)
})

test('时间戳相同时保留本地（不做无谓覆盖）', () => {
  const r = mergeAnnotations({ '1': ann(1, 'local', 100) }, { '1': ann(1, 'remote', 100) })
  assert.equal(r.merged['1'].note, 'local')
})

test('两边都没有时间戳时保留本地，避免被旧数据冲掉', () => {
  const r = mergeAnnotations({ '1': ann(1, 'local', undefined) }, { '1': ann(1, 'remote', undefined) })
  assert.equal(r.merged['1'].note, 'local')
})

test('多仓库混合：保留 / 更新 / 新增 各自正确', () => {
  const r = mergeAnnotations(
    { '1': ann(1, 'keep', 300), '2': ann(2, 'old', 100) },
    { '2': ann(2, 'new', 200), '3': ann(3, 'added', 150) },
  )
  assert.equal(r.merged['1'].note, 'keep')
  assert.equal(r.merged['2'].note, 'new')
  assert.equal(r.merged['3'].note, 'added')
  assert.equal(r.updated, 1)
  assert.equal(r.added, 1)
  // repo 1 只在本地，不进入远端循环，所以不计入 keptLocal
  assert.equal(r.keptLocal, 0)
})

test('远端为空时不标记变更', () => {
  const r = mergeAnnotations({ '1': ann(1, 'x', 100) }, {})
  assert.equal(r.changed, false)
})

test('标签数组也随之合并（整条取新）', () => {
  const r = mergeAnnotations(
    { '1': ann(1, 'n', 100, ['旧标签']) },
    { '1': ann(1, 'n', 200, ['新标签']) },
  )
  assert.deepEqual(r.merged['1'].tags, ['新标签'])
})
