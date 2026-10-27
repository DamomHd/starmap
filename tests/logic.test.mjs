/**
 * 纯逻辑测试 —— 聚类、排序、清理判定、过滤。
 *
 * 这些函数都不依赖 DOM / chrome API，是最容易回归的部分：
 * 改一处过滤逻辑却意外影响了另一个维度，只有测试能立刻发现。
 */
import { test } from 'node:test'
import assert from 'node:assert'

// ─────────── 复刻自 src/lib/cluster.ts ───────────
const ownerOf = (repo) => repo.full_name.split('/')[0]
const yearOf = (repo) => (repo.starred_at ? String(new Date(repo.starred_at).getUTCFullYear()) : null)

function keysFor(repo, dim, annotation) {
  switch (dim) {
    case 'topic':
      return repo.topics
    case 'language':
      return repo.language ? [repo.language] : []
    case 'author':
      return [ownerOf(repo)]
    case 'year': {
      const y = yearOf(repo)
      return y ? [y] : []
    }
    case 'myTag':
      return annotation?.tags ?? []
    default:
      return []
  }
}

function clusterBy(repos, dim, minCount = 2, annotations = {}) {
  const buckets = new Map()
  for (const repo of repos) {
    for (const key of keysFor(repo, dim, annotations[String(repo.id)])) {
      if (!key) continue
      const arr = buckets.get(key)
      if (arr) arr.push(repo)
      else buckets.set(key, [repo])
    }
  }
  const clusters = []
  for (const [key, list] of buckets) {
    if (list.length < minCount) continue
    clusters.push({ key, count: list.length, repos: list })
  }
  if (dim === 'year') clusters.sort((a, b) => b.key.localeCompare(a.key))
  else clusters.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  return clusters
}

function crossFilter(repos, conditions, annotations = {}) {
  if (conditions.length === 0) return repos
  return repos.filter((repo) =>
    conditions.every(({ dim, value }) => keysFor(repo, dim, annotations[String(repo.id)]).includes(value)),
  )
}

// ─────────── 复刻自 src/lib/sort.ts ───────────
const ts = (iso) => (iso ? new Date(iso).getTime() || 0 : 0)
function sortRepos(repos, key) {
  const list = [...repos]
  switch (key) {
    case 'starred':
      return list.sort((a, b) => ts(b.starred_at) - ts(a.starred_at))
    case 'stars':
      return list.sort((a, b) => b.stargazers_count - a.stargazers_count)
    case 'updated':
      return list.sort((a, b) => ts(b.pushed_at) - ts(a.pushed_at))
    case 'name':
      return list.sort((a, b) => a.full_name.localeCompare(b.full_name))
    default:
      return list
  }
}

// ─────────── 复刻自 src/lib/cleanup.ts ───────────
const YEAR_MS = 1000 * 60 * 60 * 24 * 365
const yearsAgo = (iso, now) => (iso ? (now - new Date(iso).getTime()) / YEAR_MS : null)

function suggestCleanup(repos, annotations, options = {}) {
  const opts = { staleYears: 2, untouchedYears: 1, ...options }
  const now = opts.now ?? Date.now()
  const out = []
  for (const repo of repos) {
    const a = annotations[String(repo.id)]
    const hasSignal = Boolean(a && (a.tags.length > 0 || a.note.trim()))
    if (hasSignal) continue
    const reasons = []
    if (repo.archived) reasons.push('archived')
    const pushAge = yearsAgo(repo.pushed_at, now)
    if (pushAge != null && pushAge >= opts.staleYears) reasons.push('stale')
    const starAge = yearsAgo(repo.starred_at, now)
    if (starAge != null && starAge >= opts.untouchedYears) reasons.push('untouched')
    // fork / 镜像是最容易堆积成垃圾的两类
    if (repo.fork) reasons.push('fork')
    if (repo.mirror_url) reasons.push('mirror')
    if (reasons.length > 0) out.push({ repo, reasons })
  }
  return out
}

// ─────────── 测试数据 ───────────
const NOW = new Date('2026-10-27T00:00:00Z').getTime()
const repo = (id, full_name, over = {}) => ({
  id,
  full_name,
  description: null,
  html_url: '',
  topics: [],
  language: null,
  stargazers_count: 0,
  archived: false,
  pushed_at: '2026-01-01T00:00:00Z',
  ...over,
})

// ─────────── 聚类 ───────────
test('按语言聚类：低于 minCount 的簇被过滤', () => {
  const repos = [
    repo(1, 'a/x', { language: 'JavaScript' }),
    repo(2, 'b/y', { language: 'JavaScript' }),
    repo(3, 'c/z', { language: 'Rust' }),
  ]
  const clusters = clusterBy(repos, 'language', 2)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].key, 'JavaScript')
  assert.equal(clusters[0].count, 2)
})

test('按作者聚类取 owner 段', () => {
  const repos = [repo(1, 'alice/a'), repo(2, 'alice/b'), repo(3, 'bob/c')]
  const clusters = clusterBy(repos, 'author', 2)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].key, 'alice')
})

test('按年份聚类按时间倒序', () => {
  const repos = [
    repo(1, 'a/x', { starred_at: '2024-05-01T00:00:00Z' }),
    repo(2, 'b/y', { starred_at: '2026-01-01T00:00:00Z' }),
    repo(3, 'c/z', { starred_at: '2025-01-01T00:00:00Z' }),
  ]
  const clusters = clusterBy(repos, 'year', 1)
  assert.deepEqual(clusters.map((c) => c.key), ['2026', '2025', '2024'])
})

test('没有 starred_at 的仓库无法归入年份簇', () => {
  const repos = [repo(1, 'a/x'), repo(2, 'b/y')]
  assert.equal(clusterBy(repos, 'year', 1).length, 0)
})

test('我的标签维度从注解取标签', () => {
  const repos = [repo(1, 'a/x'), repo(2, 'b/y'), repo(3, 'c/z')]
  const annotations = {
    '1': { repo_id: 1, tags: ['重点'], note: '' },
    '2': { repo_id: 2, tags: ['重点'], note: '' },
    '3': { repo_id: 3, tags: ['其它'], note: '' },
  }
  const clusters = clusterBy(repos, 'myTag', 2, annotations)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].key, '重点')
})

// ─────────── 交叉过滤 ───────────
test('多条件交叉过滤需同时满足', () => {
  const repos = [
    repo(1, 'a/x', { language: 'JavaScript', topics: ['animation'] }),
    repo(2, 'b/y', { language: 'Rust', topics: ['animation'] }),
  ]
  const got = crossFilter(repos, [
    { dim: 'topic', value: 'animation' },
    { dim: 'language', value: 'JavaScript' },
  ])
  assert.equal(got.length, 1)
  assert.equal(got[0].id, 1)
})

test('空条件返回全部', () => {
  const repos = [repo(1, 'a/x'), repo(2, 'b/y')]
  assert.equal(crossFilter(repos, []).length, 2)
})

// ─────────── 排序 ───────────
test('按收藏时间倒序', () => {
  const repos = [
    repo(1, 'a/x', { starred_at: '2024-01-01T00:00:00Z' }),
    repo(2, 'b/y', { starred_at: '2026-01-01T00:00:00Z' }),
  ]
  assert.deepEqual(sortRepos(repos, 'starred').map((r) => r.id), [2, 1])
})

test('按 star 数降序', () => {
  const repos = [repo(1, 'a/x', { stargazers_count: 10 }), repo(2, 'b/y', { stargazers_count: 99 })]
  assert.deepEqual(sortRepos(repos, 'stars').map((r) => r.id), [2, 1])
})

test('排序不修改原数组', () => {
  const repos = [repo(1, 'a/x', { stargazers_count: 1 }), repo(2, 'b/y', { stargazers_count: 9 })]
  sortRepos(repos, 'stars')
  assert.equal(repos[0].id, 1)
})

// ─────────── 清理 ───────────
test('已归档的仓库被建议清理', () => {
  const got = suggestCleanup([repo(1, 'a/x', { archived: true })], {}, { now: NOW })
  assert.equal(got.length, 1)
  assert.ok(got[0].reasons.includes('archived'))
})

test('有注解的仓库一律不建议清理（哪怕已归档）', () => {
  const annotations = { '1': { repo_id: 1, tags: [], note: '重要' } }
  const got = suggestCleanup([repo(1, 'a/x', { archived: true })], annotations, { now: NOW })
  assert.equal(got.length, 0)
})

test('近期收藏且未归档的不建议清理', () => {
  const got = suggestCleanup(
    [repo(1, 'a/x', { pushed_at: '2026-10-01T00:00:00Z', starred_at: '2026-10-01T00:00:00Z' })],
    {},
    { now: NOW },
  )
  assert.equal(got.length, 0)
})

test('长期不更新的仓库被标记 stale', () => {
  const got = suggestCleanup(
    [repo(1, 'a/x', { pushed_at: '2020-01-01T00:00:00Z', starred_at: '2026-10-01T00:00:00Z' })],
    {},
    { now: NOW },
  )
  assert.ok(got[0]?.reasons.includes('stale'))
})

test('收藏满一年且无注解被标记 untouched', () => {
  const got = suggestCleanup(
    [repo(1, 'a/x', { pushed_at: '2026-10-01T00:00:00Z', starred_at: '2024-01-01T00:00:00Z' })],
    {},
    { now: NOW },
  )
  assert.ok(got[0]?.reasons.includes('untouched'))
})

// ─────────── 仓库类型筛选（对齐 GitHub Type 下拉）───────────
const isType = (r, type) => {
  switch (type) {
    case 'all': return true;
    case 'public': return r.private !== true;
    case 'private': return r.private === true;
    case 'source': return !r.fork && !r.mirror_url && !r.is_template;
    case 'fork': return r.fork === true;
    case 'mirror': return Boolean(r.mirror_url);
    case 'template': return r.is_template === true;
    default: return false;
  }
};

test('类型：原创与 fork 互斥', () => {
  const src = repo(1, 'a/x');
  const fk = repo(2, 'b/y', { fork: true });
  assert.equal(isType(src, 'source'), true);
  assert.equal(isType(src, 'fork'), false);
  assert.equal(isType(fk, 'fork'), true);
  assert.equal(isType(fk, 'source'), false);
});

test('类型：镜像不计入原创', () => {
  const mirror = repo(1, 'a/m', { mirror_url: 'https://example.com/repo.git' });
  assert.equal(isType(mirror, 'mirror'), true);
  assert.equal(isType(mirror, 'source'), false);
});

test('类型：模板不计入原创', () => {
  const tpl = repo(1, 'a/t', { is_template: true });
  assert.equal(isType(tpl, 'template'), true);
  assert.equal(isType(tpl, 'source'), false);
});

test('类型：私有/公开按 private 字段区分', () => {
  assert.equal(isType(repo(1, 'a/x', { private: true }), 'private'), true);
  assert.equal(isType(repo(1, 'a/x'), 'public'), true);
  assert.equal(isType(repo(1, 'a/x'), 'private'), false);
});

test('类型：老数据没有这些字段时按「原创+公开」处理', () => {
  const old = repo(1, 'a/x'); // 没有 fork/private/mirror_url/is_template
  assert.equal(isType(old, 'source'), true);
  assert.equal(isType(old, 'public'), true);
  assert.equal(isType(old, 'fork'), false);
  assert.equal(isType(old, 'mirror'), false);
});

test('清理：未标注的 fork 会被建议清理', () => {
  const got = suggestCleanup(
    [repo(1, 'a/x', { fork: true, pushed_at: '2026-10-01T00:00:00Z', starred_at: '2026-10-01T00:00:00Z' })],
    {},
    { now: NOW },
  );
  assert.ok(got[0]?.reasons.includes('fork'));
});

test('清理：已标注的 fork 不建议清理', () => {
  const annotations = { '1': { repo_id: 1, tags: [], note: '要跟进上游改动' } };
  const got = suggestCleanup(
    [repo(1, 'a/x', { fork: true, pushed_at: '2026-10-01T00:00:00Z', starred_at: '2026-10-01T00:00:00Z' })],
    annotations,
    { now: NOW },
  );
  assert.equal(got.length, 0);
});

// ─────────── 清理建议分组 ───────────
const REASON_WEIGHT = { archived: 5, mirror: 4, fork: 3, stale: 2, untouched: 1 };
const primaryReason = (s) => {
  let best = s.reasons[0];
  for (const r of s.reasons) if (REASON_WEIGHT[r] > REASON_WEIGHT[best]) best = r;
  return best;
};
const groupByReason = (list) => {
  const m = new Map();
  for (const s of list) {
    const k = primaryReason(s);
    if (m.has(k)) m.get(k).push(s); else m.set(k, [s]);
  }
  return [...m.entries()]
    .map(([reason, l]) => ({ reason, repos: l.map(x => x.repo.full_name), suggestions: l }))
    .sort((a, b) => REASON_WEIGHT[b.reason] - REASON_WEIGHT[a.reason]);
};

test('分组：一个仓库只归到主因（不重复出现）', () => {
  const list = [{ repo: { full_name: 'a/x' }, reasons: ['fork', 'stale'] }];
  const groups = groupByReason(list);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].reason, 'fork'); // fork 权重 3 > stale 2
});

test('分组：组按权重从高到低排列', () => {
  const list = [
    { repo: { full_name: 'a/1' }, reasons: ['untouched'] },
    { repo: { full_name: 'a/2' }, reasons: ['archived'] },
    { repo: { full_name: 'a/3' }, reasons: ['stale'] },
  ];
  const groups = groupByReason(list);
  assert.deepEqual(groups.map(g => g.reason), ['archived', 'stale', 'untouched']);
});

test('分组：同组的仓库合并在一起', () => {
  const list = [
    { repo: { full_name: 'a/1' }, reasons: ['fork'] },
    { repo: { full_name: 'a/2' }, reasons: ['fork'] },
  ];
  const groups = groupByReason(list);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].repos, ['a/1', 'a/2']);
});

test('分组：已归档优先于 fork（权重更高）', () => {
  const list = [{ repo: { full_name: 'a/x' }, reasons: ['fork', 'archived'] }];
  assert.equal(groupByReason(list)[0].reason, 'archived');
});

test('分组：空列表返回空数组', () => {
  assert.deepEqual(groupByReason([]), []);
});
