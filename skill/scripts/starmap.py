#!/usr/bin/env python3
"""
Starmap · 星图 — 对话式 GitHub star 管理

设计要点（改动前必读）：
1. 数据格式与 Chrome 扩展完全一致，共用同一个 Secret Gist。
   - Gist 文件名固定 better-stars-annotations.json（扩展靠这个名字识别自己的 Gist，
     改名会让扩展找不到旧文件而新建空的，看起来像数据全丢）。
   - 注解结构 {repo_id, tags, note, full_name, updatedAt}，字段名不能改。
2. 合并规则与 src/lib/merge.ts 一致：注解级 updatedAt，严格大于才覆盖。
   skill 与扩展都不做字段级合并，否则会合并出「标签来自 A、备注来自 B」的四不像。
3. 写入策略：读远端 → 合并 → 写回。只改本次命令涉及的 key，其余原样保留，
   避免把另一个设备刚写进去的注解覆盖掉。
4. 取消 star 一律需要显式 --confirm。默认只预览，不执行。

只用 Python 标准库，不引入第三方依赖（skill 跑在别人机器上，装包不可保证）。
"""

import argparse
import calendar
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com"
GIST_FILENAME = "better-stars-annotations.json"
GIST_DESC = "Starmap - 我的 GitHub 星标注解（标签/备注）"
USER_AGENT = "starmap-skill/1.0"

# 本机缓存：skill 每次都是新进程，不像扩展那样常驻内存，所以缓存必须落盘。
# 位置放在 ~/.cache 而不是 skill 目录（skill 目录可能只读 / 会被重新分发覆盖）。
CACHE_DIR = os.path.expanduser("~/.cache/starmap-skill")
STAR_CACHE = os.path.join(CACHE_DIR, "stars.json")
CACHE_TTL = 30 * 60  # 30 分钟，与扩展一致
# 兼容 glob 排除：Gist 的 files 参数用文件名作为 key，不能带路径


# --------------------------------------------------------------------------- #
# 凭证
# --------------------------------------------------------------------------- #

def get_token() -> str:
    """
    按优先级取 token：
    1. 环境变量 STARMAP_TOKEN —— 推荐，也兼容 GITHUB_TOKEN / GH_TOKEN
    2. gh auth token —— 用户机器上已登录 GitHub CLI 的话直接复用，免二次配置

    刻意不读 token 文件：skill 可能被分享给他人，凭证不该跟着目录走。
    """
    for var in ("STARMAP_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"):
        tok = os.environ.get(var, "").strip()
        if tok:
            return tok
    try:
        out = subprocess.run(
            ["gh", "auth", "token"], capture_output=True, text=True, timeout=10
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (FileNotFoundError, subprocess.SubprocessError):
        pass
    die(
        "没有找到 GitHub Token。\n"
        "  方式一（推荐）: export STARMAP_TOKEN=ghp_xxx\n"
        "  方式二: 安装并登录 GitHub CLI（gh auth login），skill 会自动复用\n"
        "创建 Token: https://github.com/settings/tokens/new?scopes=read:user,gist&description=Starmap"
    )
    raise SystemExit(1)  # 让类型检查知道不会往下走


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #

def api(path: str, method: str = "GET", body=None, accept: str = "application/vnd.github+json",
        token: str | None = None):
    """
    统一请求入口。所有失败都转成人话错误，不把原始 traceback 丢给用户。
    """
    token = token or get_token()
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", accept)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", USER_AGENT)
    if data:
        req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.loads(e.read()).get("message", "")
        except Exception:
            pass
        if e.code == 401:
            die(f"Token 无效或已过期（401）。{detail}")
        if e.code == 403:
            # 403 有两种：权限不足 / 触到限流。限流会带剩余次数为 0，要区分开。
            if e.headers.get("X-RateLimit-Remaining") == "0":
                reset = int(e.headers.get("X-RateLimit-Reset", "0"))
                wait = max(0, reset - int(time.time()))
                die(f"触发 GitHub API 限流，{wait} 秒后重试（认证请求限额 5000/小时）。")
            die(f"权限不足（403）。{detail}\n清理功能需要 Token 带 public_repo（Classic）或 Starring 写权限（Fine-grained）。")
        if e.code == 404:
            raise
        die(f"GitHub API 错误 {e.code}: {detail}")


def die(msg: str):
    print(f"错误: {msg}", file=sys.stderr)
    sys.exit(1)


# --------------------------------------------------------------------------- #
# 读取 star —— 带落盘缓存
# --------------------------------------------------------------------------- #

def fetch_repo_detail(owner: str, repo: str) -> dict:
    """单个仓库详情，只被索引时逐个查询用（unstar 前确认是否 fork/mirror）。"""
    r = api(f"/repos/{owner}/{repo}")
    return {
        "_fetched_at": time.time(),
        "id": r["id"],
        "full_name": r["full_name"],
        "description": r.get("description"),
        "html_url": r["html_url"],
        "topics": r.get("topics") or [],
        "language": r.get("language"),
        "stargazers_count": r.get("stargazers_count", 0),
        "archived": r.get("archived", False),
        "pushed_at": r.get("pushed_at") or "",
        "fork": r.get("fork", False),
        "private": r.get("private", False),
        "mirror_url": r.get("mirror_url"),
        "is_template": r.get("is_template", False),
        "starred_at": "",  # 单仓库接口拿不到 star 时间，只有 /user/starred 才有
    }


def fetch_stars(force: bool = False) -> dict:
    """
    拉全量 star 列表。

    ⚠️ 必须带 Accept: application/vnd.github.star+json。
    默认返回的是裸 repo 对象，没有 starred_at，年份维度会全部失效
    （扩展早期踩过这个坑，见 PLAY/B 记录）。
    """
    if not force and os.path.exists(STAR_CACHE):
        age = time.time() - os.path.getmtime(STAR_CACHE)
        if age < CACHE_TTL:
            with open(STAR_CACHE) as f:
                cached = json.load(f)
            print(f"（使用缓存，{int(age // 60)} 分钟前拉取；加 --refresh 强制刷新）", file=sys.stderr)
            return cached

    repos, page = [], 1
    while True:
        batch = api(
            f"/user/starred?per_page=100&page={page}",
            accept="application/vnd.github.star+json",
        )
        if not batch:
            break
        for item in batch:
            r = item["repo"]
            repos.append({
                "id": r["id"],
                "full_name": r["full_name"],
                "description": r.get("description"),
                "html_url": r["html_url"],
                "topics": r.get("topics") or [],
                "language": r.get("language"),
                "stargazers_count": r.get("stargazers_count", 0),
                "archived": r.get("archived", False),
                "pushed_at": r.get("pushed_at") or "",
                "fork": r.get("fork", False),
                "private": r.get("private", False),
                "mirror_url": r.get("mirror_url"),
                "is_template": r.get("is_template", False),
                "starred_at": item.get("starred_at") or "",
            })
        if len(batch) < 100:
            break
        page += 1

    # 统一按 star 时间倒序，与扩展工作台默认排序一致
    repos.sort(key=lambda x: x["starred_at"] or "", reverse=True)
    data = {"fetched_at": time.time(), "repos": repos}
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(STAR_CACHE, "w") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def all_repos(refresh: bool = False) -> list[dict]:
    return fetch_stars(refresh)["repos"]


# --------------------------------------------------------------------------- #
# Gist 读写 —— 与扩展共用
# --------------------------------------------------------------------------- #

def find_gist() -> dict | None:
    """
    找 Starmap 的 Gist。识别依据只有文件名（见文件头注释，不能改）。

    只翻最近 100 个 Gist：用户的 Gist 一般远少于这个数。
    真找不到就返回 None，由调用方决定是新建还是只用本地。
    """
    gists = api("/gists?per_page=100")
    for g in gists:
        if GIST_FILENAME in (g.get("files") or {}):
            return g
    return None


def load_annotations() -> tuple[dict, dict | None]:
    """返回 (注解字典, gist 对象)。gist 为 None 表示还没有同步过。"""
    gist = find_gist()
    if not gist:
        return {}, None
    # Gist 列表接口返回的 files 里有 raw_url，单独请求 raw 比解析 content 更省流量
    f = gist["files"][GIST_FILENAME]
    raw = f.get("content")
    if raw is None and f.get("raw_url"):
        raw = api(f["raw_url"])
    if isinstance(raw, str):
        raw = json.loads(raw) if raw.strip() else {}
    payload = raw or {}
    # 兼容扩展写出的结构 {version, lastPushedAt, annotations}
    return payload.get("annotations", payload), gist


def save_annotations(annotations: dict, gist: dict | None) -> str:
    """
    写回 Gist。

    lastPushedAt 只是人类可读标记，不参与合并（扩展也是如此，见 gist.ts 注释）。
    每次写都重新取远端再合并，是调用方的责任 —— 这里只负责写。
    """
    content = json.dumps(
        {
            "version": 1,
            "lastPushedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "annotations": annotations,
        },
        ensure_ascii=False,
        indent=2,
    )
    files = {GIST_FILENAME: {"content": content}}
    if gist:
        api(f"/gists/{gist['id']}", method="PATCH", body={"files": files})
        return f"已更新 Gist https://gist.github.com/{gist['id']}"
    created = api("/gists", method="POST", body={
        "description": GIST_DESC, "public": False, "files": files,
    })
    return f"已创建 Gist https://gist.github.com/{created['id']}"


def apply_annotations(repos: list[dict], annotations: dict) -> list[dict]:
    """
    把注解挂到仓库上。按 repo_id 匹配（与扩展一致），
    同时用 full_name 兜底：用户可能先在别处用名字手工写过注解。
    """
    by_id = annotations
    by_name = {a.get("full_name"): a for a in annotations.values() if a.get("full_name")}
    out = []
    for r in repos:
        a = by_id.get(str(r["id"])) or by_name.get(r["full_name"]) or {}
        merged = dict(r)
        merged["tags"] = a.get("tags") or []
        merged["note"] = a.get("note") or ""
        merged["updatedAt"] = a.get("updatedAt")
        out.append(merged)
    return out


# --------------------------------------------------------------------------- #
# 输出
# --------------------------------------------------------------------------- #

def out(data, as_json: bool):
    if as_json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return
    if isinstance(data, list):
        for item in data:
            print(format_repo(item))
    else:
        print(format_repo(data))


def format_repo(r: dict) -> str:
    """单行紧凑格式：agent 一遍扫完就能判断，不用在输出里翻找关键信息。"""
    meta = []
    if r.get("language"):
        meta.append(r["language"])
    if r.get("stargazers_count"):
        meta.append(f"★{r['stargazers_count']}")
    if r.get("archived"):
        meta.append("已归档")
    if r.get("fork"):
        meta.append("fork")
    if r.get("mirror_url"):
        meta.append("镜像")
    if r.get("starred_at"):
        meta.append(r["starred_at"][:10])
    tags = r.get("tags") or []
    tag_str = " ".join(f"#{t}" if not t.startswith("#") else t for t in tags)
    line = f"{r['full_name']}"
    if meta:
        line += f"  [{', '.join(meta)}]"
    if tag_str:
        line += f"  {tag_str}"
    if r.get("note"):
        line += f"\n    📝 {r['note']}"
    elif r.get("description"):
        line += f"\n    {r['description'][:120]}"
    return line


def normalize_tag(tag: str) -> str:
    """统一去掉前导 #，和扩展的标签存储格式保持一致（存不带 #）。"""
    return tag.strip().lstrip("#").strip()


# --------------------------------------------------------------------------- #
# 命令实现
# --------------------------------------------------------------------------- #

def cmd_find(args):
    """本地过滤，不打网络（除第一次拉缓存）。条件默认 AND，与扩展的交叉过滤一致。"""
    repos = run_filters(apply_annotations(all_repos(args.refresh), load_annotations()[0]), args)

    if args.limit and not args.all:
        repos = repos[: args.limit]

    if args.json:
        print(json.dumps(repos, ensure_ascii=False, indent=2))
    else:
        total = len(repos)
        shown = repos if args.all else repos[: args.limit]
        print(f"共 {total} 个" + (f"，显示前 {len(shown)} 个" if len(shown) < total else "") + "\n")
        for r in shown:
            print(format_repo(r))


def matches_type(r: dict, t: str) -> bool:
    """对齐 GitHub 原生 Type 筛选，定义见扩展 src/lib/repo-type.ts。"""
    if t == "public":
        return not r.get("private")
    if t == "private":
        return bool(r.get("private"))
    if t == "fork":
        return bool(r.get("fork"))
    if t == "mirror":
        return bool(r.get("mirror_url"))
    if t == "template":
        return bool(r.get("is_template"))
    if t == "source":
        return not r.get("fork") and not r.get("mirror_url") and not r.get("is_template")
    return True


def resolve_targets(args) -> list[dict]:
    """
    把命令行给的目标解析成仓库列表。两种指定方式二选一：
    - 直接列 owner/repo
    - --filter + 过滤条件（复用的正是 find 的那套）

    仓库名拼错时直接报错而不是静默跳过：profile 里 agent 会照着清单操作，
    静默跳过会让「我明明标了 20 个」和「实际只改了 18 个」对不上。
    """
    if args.filter:
        repos = apply_annotations(all_repos(args.refresh), load_annotations()[0])
        found = run_filters(repos, args)
        if not found:
            die("过滤条件没有匹配到任何 star，检查一下参数。")
        return found

    repos = all_repos(args.refresh)
    by_name = {r["full_name"].lower(): r for r in repos}
    found, missing = [], []
    for name in args.repos or []:
        r = by_name.get(name.lower())
        if r:
            found.append(r)
        else:
            missing.append(name)
    if missing:
        die("以下仓库不在你的 star 列表里: " + ", ".join(missing))
    if not found:
        die("没有指定目标。给出 full_name 列表，或用 --filter 条件筛选（见 find 的过滤参数）。")
    return found


def run_filters(repos: list[dict], args) -> list[dict]:
    """find 与 annotate/unstar 的 --filter 共用这套过滤，保证条件语义唯一。"""
    if getattr(args, "query", None):
        q = args.query.lower()
        repos = [r for r in repos if q in " ".join([
            r["full_name"], r.get("description") or "",
            " ".join(r.get("topics") or []), " ".join(r.get("tags") or []),
            r.get("note") or "",
        ]).lower()]
    if getattr(args, "language", None):
        langs = {x.lower() for x in args.language}
        repos = [r for r in repos if (r.get("language") or "").lower() in langs]
    if getattr(args, "topic", None):
        topics = {x.lower() for x in args.topic}
        repos = [r for r in repos if topics & {t.lower() for t in r.get("topics") or []}]
    if getattr(args, "owner", None):
        owners = {x.lower() for x in args.owner}
        repos = [r for r in repos if r["full_name"].split("/")[0].lower() in owners]
    if getattr(args, "type", None) and args.type != "all":
        repos = [r for r in repos if matches_type(r, args.type)]
    if getattr(args, "tag", None):
        want = {normalize_tag(t) for t in args.tag}
        repos = [r for r in repos if want <= set(r.get("tags") or [])]
    if getattr(args, "exclude_tag", None):
        drop = {normalize_tag(t) for t in args.exclude_tag}
        repos = [r for r in repos if not (drop & set(r.get("tags") or []))]
    if getattr(args, "no_note", False):
        repos = [r for r in repos if not r.get("note")]
    if getattr(args, "unannotated", False):
        repos = [r for r in repos if not r.get("tags") and not r.get("note")]
    if getattr(args, "since", None):
        repos = [r for r in repos if (r.get("starred_at") or "") >= args.since]
    if getattr(args, "before", None):
        repos = [r for r in repos if (r.get("starred_at") or "9999") < args.before]
    if getattr(args, "stale_days", None):
        cutoff = time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - args.stale_days * 86400)
        )
        repos = [r for r in repos if (r.get("pushed_at") or "9999") < cutoff]
    return repos


def cmd_annotate(args):
    """
    批量打标签 / 写备注。

    「合并」语义：--set-tags 是替换，--add-tags 是追加，--note 是覆盖备注。
    agent 在对话里说「给这些加个 #待研究」时应该用 --add-tags，
    这样不会抹掉用户之前打的标签。
    """
    targets = resolve_targets(args)
    remote, gist = load_annotations()
    # 所有目标共用同一个时间戳：一次批量操作视为一个整体，
    # 这样另一台设备合并时要么全取新、要么全保留，不会出现半新半旧。
    now = int(time.time() * 1000)
    changed = 0

    for r in targets:
        key = str(r["id"])
        prev = remote.get(key) or {
            "repo_id": r["id"], "tags": [], "note": "", "full_name": r["full_name"],
        }
        tags = list(prev.get("tags") or [])
        if args.set_tags is not None:
            tags = [normalize_tag(t) for t in args.set_tags if normalize_tag(t)]
        if args.add_tags:
            for t in args.add_tags:
                t = normalize_tag(t)
                if t and t not in tags:
                    tags.append(t)
        if args.remove_tags:
            drop = {normalize_tag(t) for t in args.remove_tags}
            tags = [t for t in tags if t not in drop]

        note = prev.get("note") or ""
        if args.note is not None:
            note = args.note

        if not tags and not note:
            # 空注解直接删掉，别在 Gist 里留垃圾条目（与扩展 isEmpty 逻辑一致）
            if key in remote:
                del remote[key]
                changed += 1
            continue

        new = {
            "repo_id": r["id"], "tags": tags, "note": note,
            "full_name": r["full_name"], "updatedAt": now,
        }
        if new != {k: prev.get(k) for k in new}:
            remote[key] = new
            changed += 1

    if args.dry_run:
        print(f"[预览] 将修改 {changed} 条注解，未写入。")
        for r in targets[:50]:
            print("  " + r["full_name"])
        return

    msg = save_annotations(remote, gist)
    print(f"已更新 {changed} 条注解（共处理 {len(targets)} 个仓库）。{msg}")


def cmd_unstar(args):
    """
    取消 star。

    默认走 --dry-run 预览，必须显式 --confirm 才真的删。
    这是不可逆操作（GitHub 侧没有回收站），与扩展的「手动勾选 + 二次确认」保持一致。
    """
    targets = resolve_targets(args)
    if not args.confirm:
        print(f"[预览] 将取消 star 的 {len(targets)} 个仓库（未执行）。确认后加 --confirm：\n")
        for r in targets:
            print("  " + format_repo(r).replace("\n", "\n  "))
        return

    # 只清理成功取消的仓库的注解 —— 失败的还留着 star，注解跟着一并删就丢数据了
    succeeded, failed = [], []
    for r in targets:
        try:
            api(f"/user/starred/{r['full_name']}", method="DELETE")
            succeeded.append(r)
            print(f"  ✓ {r['full_name']}")
        except urllib.error.HTTPError as e:
            failed.append(f"{r['full_name']}: HTTP {e.code}")
            print(f"  ✗ {r['full_name']}: HTTP {e.code}")
        # 取消 star 是写操作，限流更严；串行 + 轻微间隔，避免 403
        time.sleep(0.15)

    msg = f"已取消 {len(succeeded)} 个 star"
    if failed:
        msg += f"，{len(failed)} 个失败：\n  " + "\n  ".join(failed)
    print(msg)

    # 取消 star 后原仓库的注解已无意义，顺手清掉，避免 Gist 里堆积孤儿条目
    if succeeded and not args.keep_annotations:
        annotations, gist = load_annotations()
        removed = 0
        for r in succeeded:
            if str(r["id"]) in annotations:
                del annotations[str(r["id"])]
                removed += 1
        if removed:
            print(save_annotations(annotations, gist))
            print(f"同时清除了 {removed} 条对应注解（保留用 --keep-annotations）。")

    # 缓存立刻失效，避免用户下次查询看到已取消的仓库
    if os.path.exists(STAR_CACHE):
        os.remove(STAR_CACHE)


def cmd_review(args):
    """
    巡检：找出「可能不再需要」的 star。

    判定规则与扩展 src/lib/cleanup.ts 保持同一套（分组 + 主因权重），
    这样 skill 给出的建议和用户在插件里看到的一致，不会自相矛盾。
    """
    annots = load_annotations()[0]
    repos = apply_annotations(all_repos(args.refresh), annots)
    now = time.time()
    stale_days = args.stale_days or 730
    untouched_days = args.untouched_days or 365

    def days_since(iso: str) -> float:
        """
        GitHub 返回的是 UTC 时间（带 Z）。用 time.mktime 会按本机时区解释，
        东八区会多算 8 小时——对「2 年」这种阈值无所谓，但不如一次写对：
        统一按 UTC 解析，跨时区结果一致。
        """
        if not iso:
            return 99999
        try:
            return (now - calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S"))) / 86400
        except ValueError:
            return 99999

    groups: dict[str, list] = {"archived": [], "mirror": [], "fork": [], "stale": [], "untouched": []}
    for r in repos:
        # 有标签或备注 = 用户在意过，一律不推荐清理（与扩展 hasSignal 跳过逻辑一致）
        if r.get("tags") or r.get("note"):
            continue
        if r.get("archived"):
            groups["archived"].append(r)
        elif r.get("mirror_url"):
            groups["mirror"].append(r)
        elif r.get("fork"):
            groups["fork"].append(r)
        elif days_since(r.get("pushed_at")) > stale_days:
            groups["stale"].append(r)
        elif days_since(r.get("starred_at")) > untouched_days:
            groups["untouched"].append(r)

    titles = {
        "archived": "已归档（作者不再维护）—— 较安全",
        "mirror": "镜像仓库（原仓库在 GitHub 上）—— 较安全",
        "fork": "Fork 的仓库 —— 较安全",
        "stale": f"超过 {stale_days // 365} 年无提交 —— 请留意",
        "untouched": f"star 超过 {untouched_days} 天且从未标注 —— 请留意",
    }
    total = 0
    for key in ("archived", "mirror", "fork", "stale", "untouched"):
        items = groups[key]
        total += len(items)
        if not items:
            continue
        print(f"\n【{titles[key]}】{len(items)} 个")
        for r in items[: args.limit]:
            print("  " + format_repo(r).replace("\n", "\n  "))
        if len(items) > args.limit:
            print(f"  … 还有 {len(items) - args.limit} 个")
    print(f"\n合计 {total} 个可考虑清理（共 {len(repos)} 个 star）。")
    print("取消 star 前请先确认，用: starmap.py unstar <owner/repo...> --confirm")


def cmd_show(args):
    """单个仓库的完整信息 + 注解 + 与项目的关联线索。"""
    repos = all_repos(args.refresh)
    name = args.repo.lower()
    r = next((x for x in repos if x["full_name"].lower() == name), None)
    if not r:
        die(f"{args.repo} 不在你的 star 列表里")
    a = load_annotations()[0].get(str(r["id"]), {})
    r = dict(r, tags=a.get("tags") or [], note=a.get("note") or "",
             updatedAt=a.get("updatedAt"))
    print(format_repo(r))
    print(f"    主页: {r['html_url']}")
    print(f"    topic: {', '.join(r.get('topics') or []) or '无'}")
    print(f"    最后提交: {(r.get('pushed_at') or '未知')[:10]}")
    if a.get("updatedAt"):
        print(f"    你最后修改注解: {time.strftime('%Y-%m-%d %H:%M', time.localtime(a['updatedAt'] / 1000))}")


def cmd_pull(args):
    """把 Gist 里的注解合并到本地缓存视图（只读预览）。真正的合并由扩展负责。"""
    remote, gist = load_annotations()
    if not gist:
        print("还没有 Starmap 的 Gist —— 插件那边开启同步后会自动创建。")
        return
    print(f"Gist: https://gist.github.com/{gist['id']}")
    print(f"注解: {len(remote)} 条")
    for key, a in list(remote.items())[: args.limit]:
        print(f"  {a.get('full_name') or key}  "
              f"{' '.join('#' + t for t in a.get('tags') or [])}  {a.get('note') or ''}".rstrip())


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def add_filter_args(p, with_refresh=True):
    """find / annotate / unstar 共用的过滤参数 —— 保证三个命令条件语义完全一致。"""
    if with_refresh:
        p.add_argument("--refresh", action="store_true", help="忽略缓存，强制重新拉取 star 列表")
    p.add_argument("--query", "-q", help="关键词（匹配名字/描述/topic/标签/备注）")
    p.add_argument("--language", "-l", nargs="+", help="语言，如 rust go")
    p.add_argument("--topic", nargs="+", help="GitHub topic")
    p.add_argument("--owner", nargs="+", help="作者/组织")
    p.add_argument("--type", choices=["all", "public", "private", "source", "fork", "mirror", "template"],
                   help="仓库类型（对齐 GitHub 原生筛选）")
    p.add_argument("--tag", nargs="+", help="必须拥有这些标签（AND）")
    p.add_argument("--exclude-tag", nargs="+", help="排除带这些标签的")
    p.add_argument("--no-note", action="store_true", help="只要没写备注的")
    p.add_argument("--unannotated", action="store_true", help="只要完全没标注过的")
    p.add_argument("--since", help="star 时间 >= YYYY-MM-DD")
    p.add_argument("--before", help="star 时间 < YYYY-MM-DD")
    # 不设默认值：这里是要过滤的门槛，默认 None 表示「不过滤」。
    # review 命令里的默认 730 是另一回事（巡检规则），两者共用 help 但语义不同，
    # 所以注明了「过滤」二字，避免 agent 误以为 find 默认就按 2 年筛。
    p.add_argument("--stale-days", type=int,
                   help="过滤：最后提交距今超过 N 天（不设则不按此过滤）")


def main():
    p = argparse.ArgumentParser(
        description="Starmap 星图 —— 对话式管理 GitHub star（与 Chrome 扩展共用 Gist 注解）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  starmap.py find -l rust --since 2026-01-01
  starmap.py find --unannotated --limit 30
  starmap.py annotate --filter -l rust --since 2026-01-01 --add-tags 待研究
  starmap.py annotate owner/repo other/repo --note "做 XX 功能时参考" --add-tags 工具
  starmap.py unstar --filter --type fork --dry-run
  starmap.py review
""",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("find", help="按条件查找 star")
    add_filter_args(f)
    f.add_argument("--limit", type=int, default=50)
    f.add_argument("--all", action="store_true", help="不截断，全部输出")
    f.add_argument("--json", action="store_true")
    f.set_defaults(func=cmd_find)

    a = sub.add_parser("annotate", help="批量打标签 / 写备注（写入 Gist）")
    a.add_argument("repos", nargs="*", help="owner/repo 列表")
    add_filter_args(a)
    a.add_argument("--filter", action="store_true", help="用过滤条件指定目标而不是列名单")
    a.add_argument("--add-tags", nargs="+", help="追加标签（不覆盖已有）")
    a.add_argument("--set-tags", nargs="+", help="替换全部标签")
    a.add_argument("--remove-tags", nargs="+", help="移除指定标签")
    a.add_argument("--note", help="设置备注（空字符串 = 清除）")
    a.add_argument("--dry-run", action="store_true")
    a.set_defaults(func=cmd_annotate)

    u = sub.add_parser("unstar", help="取消 star（默认只预览，需 --confirm）")
    u.add_argument("repos", nargs="*")
    add_filter_args(u)
    u.add_argument("--filter", action="store_true")
    u.add_argument("--confirm", action="store_true", help="真的执行取消（不可逆）")
    u.add_argument("--keep-annotations", action="store_true", help="不删除对应注解")
    u.set_defaults(func=cmd_unstar)

    r = sub.add_parser("review", help="巡检：找出可能不再需要的 star")
    r.add_argument("--refresh", action="store_true")
    r.add_argument("--stale-days", type=int, help="多久没提交算陈旧（默认 730）")
    r.add_argument("--untouched-days", type=int, help="star 多久没标注算遗忘（默认 365）")
    r.add_argument("--limit", type=int, default=10)
    r.set_defaults(func=cmd_review)

    s = sub.add_parser("show", help="查看单个仓库详情")
    s.add_argument("repo")
    s.add_argument("--refresh", action="store_true")
    s.set_defaults(func=cmd_show)

    pl = sub.add_parser("pull", help="查看 Gist 里的注解")
    pl.add_argument("--limit", type=int, default=200)
    pl.set_defaults(func=cmd_pull)

    args = p.parse_args()
    try:
        args.func(args)
    except urllib.error.HTTPError as e:
        die(f"HTTP {e.code} {e.reason}")


if __name__ == "__main__":
    main()
