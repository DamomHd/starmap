---
name: starmap
description: 管理用户的 GitHub star（收藏仓库）。用于：查找「我是不是 star 过某个东西」、按语言/主题/时间/标签批量筛选收藏、批量给 star 打标签或写备注、定期巡检清理不再需要的 star、取消 star。当用户提到 GitHub 星标/star/收藏的仓库/「我收藏过」/「我是不是 star 过」/整理收藏/清理收藏时使用。标注数据与 Starmap Chrome 扩展共用同一个 Secret Gist。
---

# Starmap · 星图

对话式管理 GitHub star。**和 Chrome 扩展「Starmap 星图」共用同一份注解数据**——skill 写进去的标签/备注，用户在插件工作台和 GitHub 星标页里立刻能看到，反之亦然。

工具：`scripts/starmap.py`（Python 标准库，无依赖）

## 前置

```bash
export STARMAP_TOKEN=ghp_xxx    # 或已登录的 GitHub CLI（gh auth login）会被自动复用
```

Token 需要 `read:user` + `gist`；要取消 star 再加 `public_repo`。缺权限时脚本会直接说明缺什么。

## 命令

```bash
S=~/.claude/skills/starmap/scripts/starmap.py

python3 $S find -l rust --since 2026-01-01        # 按条件找
python3 $S find --unannotated --limit 30          # 从没标注过的
python3 $S find -q 动画                            # 关键词（含你自己的标签/备注）
python3 $S show  owner/repo                       # 单个详情
python3 $S review                                 # 巡检，按原因分组列出可清理的
python3 $S pull                                   # 看 Gist 里的注解

python3 $S annotate owner/repo --add-tags 待研究 --note "读源码参考"
python3 $S annotate --filter -l rust --since 2026-01-01 --add-tags 待研究

python3 $S unstar owner/repo                      # 默认只预览
python3 $S unstar --filter --type fork --confirm  # 真执行
```

`find` / `annotate` / `unstar` 共用同一套过滤参数：

| 参数 | 含义 |
|---|---|
| `-q/--query` | 关键词，匹配名字/描述/topic/标签/备注 |
| `-l/--language` `--topic` `--owner` | 可给多个值 |
| `--type` | `source`（原创）/`fork`/`mirror`/`template`/`public`/`private` |
| `--tag` / `--exclude-tag` | 我的标签；多个 tag 表示「都要有」 |
| `--since` / `--before` | star 时间，`YYYY-MM-DD` |
| `--no-note` / `--unannotated` | 没备注的 / 完全没标注的 |
| `--stale-days N` | 最后提交距今超过 N 天 |
| `--refresh` | 忽略 30 分钟缓存重新拉取 |

条件之间是 **AND**。加 `--all` 取消默认 50 条截断，`--json` 输出机器可读结果。

## 工作方式

**先查再改。** 批量写之前先 `find` 一次并用 `--dry-run`，把清单给用户看。用户 star 里有同名相似项目时尤其重要——改错的对象很难被发现，因为标签是用户自己打的，看起来又很合理。

**追加，不覆盖。** 用户说「给这些加上 #待研究」用 `--add-tags`；只有明确说「标签改成 X」才用 `--set-tags`。备注用 `--note` 会覆盖原值，改写前先 `show` 看一眼。

**取消 star 必须二次确认。** `unstar` 不带 `--confirm` 只预览。执行前把 `review` 或 `find` 的结果列给用户，让他点头。这是不可逆的，GitHub 上没有回收站。

**巡检要给出可判断的理由，而不是罗列。** `review` 按原因分组（已归档 / 镜像 / Fork / 长期不更新 / 从未标注），前三种较安全，后两种要提醒用户留意。用户有标签或备注的仓库不会出现在里面——那代表他当时是真的在意。

**一次批量操作共用一个时间戳。** 脚本已处理，别自己逐条 `annotate` 循环，那样跨设备合并时会出现半新半旧的状态。要改多个仓库，一次性传给 `annotate`。

## 数据与同步

- 注解存 `{repo_id, tags, note, full_name, updatedAt}`，键是 repo_id 字符串
- 同步到用户自己的 Secret Gist，文件名 `better-stars-annotations.json`（**不能改**，插件靠它识别）
- 合并规则：注解级 `updatedAt`，严格大于才覆盖；相等保留本地
- 标签存**不带 `#`** 的原文，脚本会自动去掉前导 `#`
- 没有任何服务器，全部请求直连 `api.github.com`

细节（Gist 结构、字段含义、与插件的一致性约束）见 `references/data-model.md`。

## 边界

- 只读/写**用户自己的** star，不碰别人
- 不做语义搜索（不是向量检索，是关键词 + 元数据过滤）
- 缓存 30 分钟；用户改了插件里的数据后，`--refresh` 才能看到
- 仓库名拼错会直接报错，不会静默跳过
